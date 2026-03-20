import type { PlanMode, PlanResult, Planner } from '../agent/planner';
import type { Coder, CoderAnswer, CoderContext, CoderInput, CodeDraft } from '../agent/coder';
import * as path from 'path';
import { runFixerLoop } from '../agent/fixer';
import type { DiffPreview, Executor } from '../agent/executor';
import type { ValidationError, ValidationResult, Validator } from '../agent/validator';
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

    // Detect if this is a project creation request
    const isProjectCreation = /\b(create|build|make|generate|setup)\b.*\b(project|app|website|portfolio|react|next|node)\b/i.test(context.prompt) ||
                             /\b(react|next|vite|angular|vue)\b.*\b(app|project)\b/i.test(context.prompt);
    
    // For project creation, retrieve more files AND scan the target directory
    const retrievalLimit = isProjectCreation ? 20 : finalConfig.retrievalMaxResults;

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

      const planTargets = plan.targetHints.slice(0, 3).join(', ');
      const planDetail = `Intent: ${plan.intent}. Mode: ${plan.mode}. ${planTargets ? `Targets: ${planTargets}.` : 'Using active workspace context.'}`;
      await this.emitStage(callbacks, 'planning', planDetail);

      await this.emitStage(callbacks, 'retrieving', 'Gathering active editor, workspace, and memory context.');
      const indexPromise = this.contextEngine.index(context.documents);
      const memoryMatchesPromise = this.memory.query(context.prompt, 4);
      const recentMemoryPromise = this.memory.recent(4);

      await indexPromise;
      const contextMatches = await this.contextEngine.query({
        query: [context.prompt, plan.intent, context.activeFilePath ?? '', context.selection ?? ''].join('\n'),
        maxResults: retrievalLimit,
      });
      const retrievedDocuments = uniqueDocumentsByPath(contextMatches.map((match) => match.document));
      
      // For project creation, also scan the target directory for existing files
      let mentionedDocuments: ContextDocument[] = [];
      if (isProjectCreation) {
        mentionedDocuments = this.findPromptMentionedDocuments(context.prompt, context.documents);
        // Also scan the target folder if mentioned
        const targetFolder = this.extractTargetFolder(context.prompt);
        if (targetFolder) {
          const folderFiles = context.documents.filter(doc => 
            doc.uri.replace(/\\/g, '/').toLowerCase().includes(targetFolder.toLowerCase())
          );
          mentionedDocuments = uniqueDocumentsByPath([...mentionedDocuments, ...folderFiles]);
        }
      } else {
        mentionedDocuments = this.findPromptMentionedDocuments(context.prompt, context.documents);
      }
      
      const finalDocuments = uniqueDocumentsByPath([...mentionedDocuments, ...retrievedDocuments]);
      const [memoryMatches, recentMemory] = await Promise.all([
        memoryMatchesPromise,
        recentMemoryPromise,
      ]);
      const memoryContext = formatMemoryForContext([...memoryMatches, ...recentMemory].slice(0, 6));
      const coderContext = this.buildCoderContext(context, finalDocuments, memoryContext);
      const contextSummary = summarizeContext(finalDocuments);
      const retrievedPreview = finalDocuments
        .slice(0, 4)
        .map((document) => this.toRelativePath(context.workspaceRoot, document.uri))
        .join(', ');
      await this.emitStage(
        callbacks,
        'retrieving',
        `Retrieved ${finalDocuments.length} context file${finalDocuments.length === 1 ? '' : 's'}${retrievedPreview ? `: ${retrievedPreview}` : ''}`
      );

      if (plan.mode === 'chat') {
        await this.emitStage(
          callbacks,
          'thinking',
          `Composing answer from ${finalDocuments.length} retrieved file${finalDocuments.length === 1 ? '' : 's'} and recent memory.`
        );
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

      await this.emitStage(
        callbacks,
        'thinking',
        `Generating deterministic edits (${plan.steps.length} planned step${plan.steps.length === 1 ? '' : 's'}) from verified context.`
      );
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

      const operationGuardErrors = this.detectUnexpectedOperations(
        fixerResult.draft,
        plan.intent,
        context.prompt
      );
      const scopedPathErrors = this.detectScopedPathViolations(fixerResult.draft, context.prompt);
      const combinedGuardErrors = [...operationGuardErrors, ...scopedPathErrors];
      if (combinedGuardErrors.length > 0) {
        return {
          ok: false,
          mode: plan.mode,
          draft: fixerResult.draft,
          plan,
          validation: {
            ok: false,
            errors: combinedGuardErrors,
          },
          error: combinedGuardErrors.map((error) => error.message).join('\n'),
          retrievedDocuments: finalDocuments,
          contextSummary,
          logs: this.logs,
        };
      }

      await this.emitStage(
        callbacks,
        'validating',
        `Validation passed on attempt ${fixerResult.attempts}. Preparing diff preview.`
      );
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
    const editableDocuments = retrievedDocuments.filter((document) =>
      this.isWorkspaceDocument(context.workspaceRoot, document.uri)
    );
    const externalReferenceNotes = retrievedDocuments
      .filter((document) => !this.isWorkspaceDocument(context.workspaceRoot, document.uri))
      .slice(0, 8)
      .map(
        (document) =>
          `- ${document.title ?? document.uri} (${document.uri})\n${this.trimText(document.content, 420)}`
      )
      .join('\n\n');

    const mergedMemory =
      externalReferenceNotes.length > 0
        ? `${memory}\n\nExternal reference context (read-only, never edit as file paths):\n${externalReferenceNotes}`
        : memory;

    return {
      files: editableDocuments.map((document) => ({
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
        retrievedPaths: editableDocuments.map((document) =>
          this.toRelativePath(context.workspaceRoot, document.uri)
        ),
      },
      memory: mergedMemory,
      notes: summarizeContext(retrievedDocuments),
    };
  }

  private isWorkspaceDocument(workspaceRoot: string, uri: string): boolean {
    if (/^(https?:\/\/|mcp:\/\/|klyr:\/\/|external:\/\/)/i.test(uri)) {
      return false;
    }

    const normalizedRoot = workspaceRoot.replace(/\\/g, '/').toLowerCase();
    const normalizedUri = uri.replace(/\\/g, '/').toLowerCase();
    return normalizedUri.startsWith(normalizedRoot);
  }

  private trimText(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }
    return `${value.slice(0, maxChars)}...`;
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

  private detectUnexpectedOperations(
    draft: CodeDraft,
    intent: string,
    prompt: string
  ): ValidationError[] {
    const lowerPrompt = prompt.toLowerCase();
    const errors: ValidationError[] = [];
    const hasCreateIntent = /\b(create|add new|generate new|new file)\b/.test(lowerPrompt);
    const hasDeleteIntent = /\b(delete|remove|drop)\b/.test(lowerPrompt);

    for (const change of draft.changes) {
      if (change.operation === 'create' && !hasCreateIntent && intent !== 'create') {
        errors.push({
          code: 'UNEXPECTED_CREATE',
          message: `Unexpected file creation detected for ${change.path}. Prompt did not explicitly request creating files.`,
          file: change.path,
        });
      }

      if (change.operation === 'delete' && !hasDeleteIntent && intent !== 'delete') {
        errors.push({
          code: 'UNEXPECTED_DELETE',
          message: `Unexpected file deletion detected for ${change.path}. Prompt did not explicitly request deletions.`,
          file: change.path,
        });
      }
    }

    return errors;
  }

  private detectScopedPathViolations(draft: CodeDraft, prompt: string): ValidationError[] {
    const scope = this.extractScopedFolder(prompt);
    if (!scope) {
      return [];
    }

    const normalizedScope = this.normalizePath(scope).replace(/\/+$/, '').toLowerCase();
    const errors: ValidationError[] = [];

    for (const change of draft.changes) {
      const normalizedPath = this.normalizePath(change.path).toLowerCase();
      const inScope =
        normalizedPath === normalizedScope || normalizedPath.startsWith(`${normalizedScope}/`);

      if (!inScope) {
        errors.push({
          code: 'OUT_OF_SCOPE_PATH',
          message: `Prompt scoped edits to folder "${scope}", but change targeted "${change.path}" outside that folder.`,
          file: change.path,
        });
      }
    }

    return errors;
  }

  private extractScopedFolder(prompt: string): string | undefined {
    const patterns = [
      /\b(?:in|inside|within)\s+([a-zA-Z0-9._/-]+)\s+(?:folder|directory)\b/i,
      /\bunder\s+([a-zA-Z0-9._/-]+)\b/i,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      const candidate = match?.[1]?.trim();
      if (!candidate) {
        continue;
      }

      const lower = candidate.toLowerCase();
      if (['this', 'current', 'root', 'workspace', '.'].includes(lower)) {
        continue;
      }

      return candidate.replace(/^\.\//, '').replace(/^\//, '');
    }

    return undefined;
  }

  private extractTargetFolder(prompt: string): string | undefined {
    // Match patterns like "in myapp", "in myapp folder", "create in folder"
    const patterns = [
      /\b(?:in|inside|to|into)\s+([a-zA-Z0-9_-]+)\s*(?:folder|directory)?\b/i,
      /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:react|next|vite|node)\s+(?:app|project)\s+(?:in|inside|to|into)\s+([a-zA-Z0-9_-]+)\b/i,
      /\b([a-zA-Z0-9_-]+)\/(?:src|app|components|pages)/i,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      const candidate = match?.[1]?.trim();
      if (
        candidate &&
        !['a', 'an', 'the', 'new', 'folder', 'it', 'this', 'that', 'there', 'here'].includes(
          candidate.toLowerCase()
        )
      ) {
        return candidate.replace(/[./\\]+$/, ''); // Remove trailing slashes
      }
    }

    return undefined;
  }
}
