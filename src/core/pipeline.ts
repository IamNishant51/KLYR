import type { PlanMode, PlanResult, Planner } from '../agent/planner';
import type { Coder, CoderAnswer, CoderContext, CoderInput, CodeDraft } from '../agent/coder';
import * as path from 'path';
import { runFixerLoop } from '../agent/fixer';
import type { DiffPreview, Executor } from '../agent/executor';
import type { ValidationResult, Validator } from '../agent/validator';
import type { ContextDocument, ContextEngine } from '../context/contextEngine';
import { formatMemoryForContext, type MemoryStore } from '../context/memory';
import { summarizeContext, uniqueDocumentsByPath } from '../context/retriever';
import { Logger } from './config';

export interface PipelineConfig {
  maxAttempts: number;
  retrievalMaxResults: number;
  allowNewFiles: boolean;
}

export interface PipelineContext {
  workspaceRoot: string;
  prompt: string;
  activeFilePath?: string;
  selection?: string;
  modeHint?: PlanMode;
  workspaceSummary: string;
  dependencyAllowlist: string[];
  openFiles: string[];
  documents: ContextDocument[];
  logger: Logger;
}

export type PipelineStage =
  | 'planning'
  | 'retrieving'
  | 'thinking'
  | 'validating'
  | 'review'
  | 'done';

export interface PipelineCallbacks {
  onStage?: (stage: PipelineStage, detail: string) => void | Promise<void>;
  onAnswerChunk?: (chunk: string) => void | Promise<void>;
}

export interface PipelineResult {
  ok: boolean;
  mode: PlanMode;
  answer?: CoderAnswer;
  draft?: CodeDraft;
  preview?: DiffPreview;
  plan?: PlanResult;
  validation?: ValidationResult;
  error?: string;
  retrievedDocuments: ContextDocument[];
  contextSummary: string;
  logs: string[];
}

export class Pipeline {
  private logs: string[] = [];

  constructor(
    private readonly planner: Planner,
    private readonly coder: Coder,
    private readonly validator: Validator,
    private readonly executor: Executor,
    private readonly contextEngine: ContextEngine,
    private readonly memory: MemoryStore,
    private readonly logger: Logger
  ) {}

  async execute(
    context: PipelineContext,
    config: Partial<PipelineConfig> = {},
    callbacks: PipelineCallbacks = {}
  ): Promise<PipelineResult> {
    this.logs = [];
    const finalConfig: PipelineConfig = {
      maxAttempts: config.maxAttempts ?? 2,
      retrievalMaxResults: config.retrievalMaxResults ?? 8,
      allowNewFiles: config.allowNewFiles ?? false,
    };

    this.log(`Starting pipeline for: ${context.prompt.slice(0, 80)}...`);

    try {
      await this.emitStage(callbacks, 'planning', 'Understanding the request and selecting an execution mode.');
      const plan = await this.planner.plan({
        prompt: context.prompt,
        activeFilePath: context.activeFilePath,
        selection: context.selection,
        workspaceSummary: context.workspaceSummary,
        modeHint: context.modeHint,
      });

      if (plan.requiresUserClarification) {
        return {
          ok: false,
          mode: plan.mode,
          plan,
          error: plan.questions.join('; '),
          retrievedDocuments: [],
          contextSummary: '',
          logs: this.logs,
        };
      }

      await this.emitStage(callbacks, 'retrieving', 'Gathering active editor, workspace, and memory context.');
      await this.contextEngine.index(context.documents);
      const contextMatches = await this.contextEngine.query({
        query: [context.prompt, plan.intent, context.activeFilePath ?? '', context.selection ?? ''].join('\n'),
        maxResults: finalConfig.retrievalMaxResults,
      });
      const retrievedDocuments = uniqueDocumentsByPath(contextMatches.map((match) => match.document));
      const mentionedDocuments = this.findPromptMentionedDocuments(context.prompt, context.documents);
      const finalDocuments = uniqueDocumentsByPath([...mentionedDocuments, ...retrievedDocuments]);
      const memoryMatches = await this.memory.query(context.prompt, 4);
      const recentMemory = await this.memory.recent(4);
      const memoryContext = formatMemoryForContext([...memoryMatches, ...recentMemory].slice(0, 6));
      const coderContext = this.buildCoderContext(context, finalDocuments, memoryContext);
      const contextSummary = summarizeContext(finalDocuments);

      if (plan.mode === 'chat') {
        await this.emitStage(callbacks, 'thinking', 'Answering with retrieved workspace context.');
        const answer = await this.coder.answer(
          this.buildCoderInput(context.prompt, plan, coderContext),
          callbacks.onAnswerChunk
        );

        await this.memory.add({
          id: `${Date.now()}`,
          timestamp: Date.now(),
          prompt: context.prompt,
          intent: plan.intent,
          result: 'success',
          summary: answer.content.slice(0, 240),
          changes: [],
        });

        await this.emitStage(callbacks, 'done', 'Answer ready.');
        return {
          ok: true,
          mode: plan.mode,
          answer,
          plan,
          retrievedDocuments: finalDocuments,
          contextSummary,
          logs: this.logs,
        };
      }

      await this.emitStage(callbacks, 'thinking', 'Generating deterministic output from verified context.');
      const fixerResult = await runFixerLoop({
        coder: this.coder,
        validator: this.validator,
        initialInput: this.buildCoderInput(context.prompt, plan, coderContext),
        workspaceRoot: context.workspaceRoot,
        maxAttempts: finalConfig.maxAttempts,
        validationContext: {
          allowedRelativePaths: retrievedDocuments.map((document) =>
            this.toRelativePath(context.workspaceRoot, document.uri)
          ),
          allowNewFiles: finalConfig.allowNewFiles,
        },
      });

      if (!fixerResult.draft) {
        return {
          ok: false,
          mode: plan.mode,
          error: 'Code generation failed.',
          plan,
          retrievedDocuments: finalDocuments,
          contextSummary,
          logs: this.logs,
        };
      }

      if (!fixerResult.ok) {
        const validation: ValidationResult = {
          ok: false,
          errors: fixerResult.errors,
        };
        await this.memory.add({
          id: `${Date.now()}`,
          timestamp: Date.now(),
          prompt: context.prompt,
          intent: plan.intent,
          result: 'error',
          summary: fixerResult.errors.map((error) => error.message).join('; ').slice(0, 240),
          changes: fixerResult.draft.changes.map((change) => change.path),
        });

        return {
          ok: false,
          mode: plan.mode,
          draft: fixerResult.draft,
          plan,
          validation,
          error: fixerResult.errors.map((error) => error.message).join('\n'),
          retrievedDocuments: finalDocuments,
          contextSummary,
          logs: this.logs,
        };
      }

      await this.emitStage(callbacks, 'validating', 'Validation passed. Preparing the diff preview.');
      const preview = await this.executor.preview(fixerResult.draft, context.workspaceRoot);
      await this.emitStage(callbacks, 'review', 'Diff preview ready for user approval.');

      return {
        ok: true,
        mode: plan.mode,
        draft: fixerResult.draft,
        preview,
        plan,
        validation: { ok: true, errors: [] },
        retrievedDocuments: finalDocuments,
        contextSummary,
        logs: this.logs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      this.log(`Pipeline failed: ${message}`);
      this.logger.error('Pipeline error', error);
      return {
        ok: false,
        mode: context.modeHint ?? 'chat',
        error: message,
        retrievedDocuments: [],
        contextSummary: '',
        logs: this.logs,
      };
    }
  }

  private buildCoderInput(prompt: string, plan: PlanResult, context: CoderContext): CoderInput {
    return {
      prompt,
      plan,
      context,
      deterministic: true,
    };
  }

  private buildCoderContext(
    context: PipelineContext,
    retrievedDocuments: ContextDocument[],
    memory: string
  ): CoderContext {
    return {
      files: retrievedDocuments.map((document) => ({
        path: this.toRelativePath(context.workspaceRoot, document.uri),
        content: document.content,
        reason: document.source ?? 'workspace',
        isActive: context.activeFilePath === document.uri,
      })),
      workspace: {
        root: context.workspaceRoot,
        activeFilePath: context.activeFilePath
          ? this.toRelativePath(context.workspaceRoot, context.activeFilePath)
          : undefined,
        selection: context.selection,
        workspaceSummary: context.workspaceSummary,
        dependencyAllowlist: context.dependencyAllowlist,
        openFiles: context.openFiles.map((file) => this.toRelativePath(context.workspaceRoot, file)),
        retrievedPaths: retrievedDocuments.map((document) =>
          this.toRelativePath(context.workspaceRoot, document.uri)
        ),
      },
      memory,
      notes: summarizeContext(retrievedDocuments),
    };
  }

  private toRelativePath(workspaceRoot: string, absoluteOrRelativePath: string): string {
    if (absoluteOrRelativePath.startsWith(workspaceRoot)) {
      return absoluteOrRelativePath
        .slice(workspaceRoot.length)
        .replace(/^[/\\]+/, '')
        .replace(/\\/g, '/');
    }

    return absoluteOrRelativePath.replace(/\\/g, '/');
  }

  private findPromptMentionedDocuments(
    prompt: string,
    documents: ContextDocument[]
  ): ContextDocument[] {
    const mentions = this.extractPathMentions(prompt);
    if (mentions.length === 0) {
      return [];
    }

    const mentionSet = new Set(mentions.map((item) => item.toLowerCase()));

    const matches = documents.filter((document) => {
      const relativePath = this.normalizePath(document.title || document.uri).toLowerCase();
      const baseName = path.basename(relativePath);

      for (const mention of mentionSet) {
        const mentionBase = path.basename(mention);
        if (relativePath.endsWith(mention) || baseName === mention || baseName === mentionBase) {
          return true;
        }
      }

      return false;
    });

    return uniqueDocumentsByPath(matches).slice(0, 6);
  }

  private extractPathMentions(prompt: string): string[] {
    const matches = prompt.match(/(?:[A-Za-z]:[\\/])?[A-Za-z0-9_./\\-]+\.[A-Za-z0-9_-]+/g) ?? [];
    const uniqueMentions = new Set<string>();

    for (const match of matches) {
      const normalized = this.normalizePath(match.replace(/^['"`]|['"`]$/g, ''));
      if (!normalized) {
        continue;
      }
      uniqueMentions.add(normalized);
    }

    return [...uniqueMentions];
  }

  private normalizePath(value: string): string {
    return value.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  }

  private async emitStage(
    callbacks: PipelineCallbacks,
    stage: PipelineStage,
    detail: string
  ): Promise<void> {
    await callbacks.onStage?.(stage, detail);
  }

  private log(message: string): void {
    this.logs.push(message);
    this.logger.debug(message);
  }
}
