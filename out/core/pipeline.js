"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pipeline = void 0;
const fixer_1 = require("../agent/fixer");
const memory_1 = require("../context/memory");
const retriever_1 = require("../context/retriever");
class Pipeline {
    planner;
    coder;
    validator;
    executor;
    contextEngine;
    memory;
    logger;
    logs = [];
    constructor(planner, coder, validator, executor, contextEngine, memory, logger) {
        this.planner = planner;
        this.coder = coder;
        this.validator = validator;
        this.executor = executor;
        this.contextEngine = contextEngine;
        this.memory = memory;
        this.logger = logger;
    }
    async execute(context, config = {}, callbacks = {}) {
        this.logs = [];
        const finalConfig = {
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
            const retrievedDocuments = (0, retriever_1.uniqueDocumentsByPath)(contextMatches.map((match) => match.document));
            const memoryMatches = await this.memory.query(context.prompt, 4);
            const recentMemory = await this.memory.recent(4);
            const memoryContext = (0, memory_1.formatMemoryForContext)([...memoryMatches, ...recentMemory].slice(0, 6));
            const coderContext = this.buildCoderContext(context, retrievedDocuments, memoryContext);
            const contextSummary = (0, retriever_1.summarizeContext)(retrievedDocuments);
            if (plan.mode === 'chat') {
                await this.emitStage(callbacks, 'thinking', 'Answering with retrieved workspace context.');
                const answer = await this.coder.answer(this.buildCoderInput(context.prompt, plan, coderContext), callbacks.onAnswerChunk);
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
                    retrievedDocuments,
                    contextSummary,
                    logs: this.logs,
                };
            }
            await this.emitStage(callbacks, 'thinking', 'Generating deterministic output from verified context.');
            const fixerResult = await (0, fixer_1.runFixerLoop)({
                coder: this.coder,
                validator: this.validator,
                initialInput: this.buildCoderInput(context.prompt, plan, coderContext),
                workspaceRoot: context.workspaceRoot,
                maxAttempts: finalConfig.maxAttempts,
                validationContext: {
                    allowedRelativePaths: retrievedDocuments.map((document) => this.toRelativePath(context.workspaceRoot, document.uri)),
                    allowNewFiles: finalConfig.allowNewFiles,
                },
            });
            if (!fixerResult.draft) {
                return {
                    ok: false,
                    mode: plan.mode,
                    error: 'Code generation failed.',
                    plan,
                    retrievedDocuments,
                    contextSummary,
                    logs: this.logs,
                };
            }
            if (!fixerResult.ok) {
                const validation = {
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
                    retrievedDocuments,
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
                retrievedDocuments,
                contextSummary,
                logs: this.logs,
            };
        }
        catch (error) {
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
    buildCoderInput(prompt, plan, context) {
        return {
            prompt,
            plan,
            context,
            deterministic: true,
        };
    }
    buildCoderContext(context, retrievedDocuments, memory) {
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
                retrievedPaths: retrievedDocuments.map((document) => this.toRelativePath(context.workspaceRoot, document.uri)),
            },
            memory,
            notes: (0, retriever_1.summarizeContext)(retrievedDocuments),
        };
    }
    toRelativePath(workspaceRoot, absoluteOrRelativePath) {
        if (absoluteOrRelativePath.startsWith(workspaceRoot)) {
            return absoluteOrRelativePath
                .slice(workspaceRoot.length)
                .replace(/^[/\\]+/, '')
                .replace(/\\/g, '/');
        }
        return absoluteOrRelativePath.replace(/\\/g, '/');
    }
    async emitStage(callbacks, stage, detail) {
        await callbacks.onStage?.(stage, detail);
    }
    log(message) {
        this.logs.push(message);
        this.logger.debug(message);
    }
}
exports.Pipeline = Pipeline;
//# sourceMappingURL=pipeline.js.map