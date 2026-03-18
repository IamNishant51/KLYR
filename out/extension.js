"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const planner_1 = require("./agent/planner");
const executor_1 = require("./agent/executor");
const validator_1 = require("./agent/validator");
const ollamaCoder_1 = require("./agent/ollamaCoder");
const contextEngine_1 = require("./context/contextEngine");
const embeddings_1 = require("./context/embeddings");
const memory_1 = require("./context/memory");
const workspaceIndex_1 = require("./context/workspaceIndex");
const ollamaClient_1 = require("./llm/ollamaClient");
const config_1 = require("./core/config");
const pipeline_1 = require("./core/pipeline");
const webview_1 = require("./ui/webview");
const SESSION_STATE_KEY = 'klyr.chatSession';
const MEMORY_STATE_KEY = 'klyr.memoryEntries';
function activate(context) {
    const controller = new KlyrExtensionController(context);
    context.subscriptions.push(vscode.commands.registerCommand('klyr.openChat', () => controller.openChat()), vscode.commands.registerCommand('klyr.fixCurrentFile', () => controller.runCurrentFileAction('Fix issues in')), vscode.commands.registerCommand('klyr.refactorCurrentFile', () => controller.runCurrentFileAction('Refactor')), vscode.commands.registerCommand('klyr.optimizeCurrentFile', () => controller.runCurrentFileAction('Optimize')), vscode.languages.registerInlineCompletionItemProvider([
        { language: 'typescript' },
        { language: 'typescriptreact' },
        { language: 'javascript' },
        { language: 'javascriptreact' },
        { language: 'json' },
    ], {
        provideInlineCompletionItems: async (document, position, inlineContext, token) => controller.provideInlineCompletions(document, position, inlineContext, token),
    }));
}
class KlyrExtensionController {
    extensionContext;
    logger = new config_1.Logger('info');
    memory = new memory_1.InMemoryStore();
    state;
    panel;
    pendingPreview;
    lastPrompt;
    lastPlan;
    requestSerial = 0;
    constructor(extensionContext) {
        this.extensionContext = extensionContext;
        const restored = extensionContext.workspaceState.get(SESSION_STATE_KEY);
        this.state = {
            messages: restored?.messages ?? [],
            status: 'idle',
            statusDetail: restored?.statusDetail ?? '',
            plan: restored?.plan,
            contextRefs: restored?.contextRefs ?? [],
            diffPreview: [],
        };
        const storedMemory = (0, memory_1.hydrateMemoryEntries)(extensionContext.workspaceState.get(MEMORY_STATE_KEY));
        for (const entry of storedMemory) {
            void this.memory.add(entry);
        }
    }
    openChat(initialPrompt, modeHint) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        }
        else {
            this.panel = vscode.window.createWebviewPanel('klyr.chat', 'Klyr', vscode.ViewColumn.Beside, {
                enableScripts: true,
                retainContextWhenHidden: true,
            });
            const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            this.panel.webview.html = (0, webview_1.buildWebviewHtml)(nonce, this.state);
            this.panel.webview.onDidReceiveMessage((message) => {
                void this.handleWebviewMessage(message);
            });
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.setStatus('idle');
            });
        }
        this.syncWebview();
        if (initialPrompt) {
            void this.submitPrompt(initialPrompt, modeHint ?? 'edit');
        }
    }
    async runCurrentFileAction(action) {
        const editor = vscode.window.activeTextEditor;
        const filePath = editor?.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;
        const workspaceRoot = getWorkspaceRoot();
        if (!editor || !filePath || !workspaceRoot) {
            vscode.window.showInformationMessage('Open a workspace file before running a Klyr file action.');
            return;
        }
        const relativePath = toRelativePath(workspaceRoot, filePath);
        const selection = !editor.selection.isEmpty ? editor.document.getText(editor.selection).trim() : undefined;
        const prompt = selection
            ? `${action} the selected code in ${relativePath}.\n\nSelected code:\n${selection}`
            : `${action} ${relativePath}. Preserve behavior unless a bug fix requires a change.`;
        this.openChat(prompt, 'edit');
    }
    async provideInlineCompletions(document, position, _inlineContext, token) {
        try {
            const config = this.getConfig();
            if (!config.inline.enabled || token.isCancellationRequested || document.uri.scheme !== 'file') {
                return new vscode.InlineCompletionList([]);
            }
            const fullText = document.getText();
            const offset = document.offsetAt(position);
            const prefix = fullText.slice(Math.max(0, offset - config.inline.maxPrefixChars), offset);
            const suffix = fullText.slice(offset, Math.min(fullText.length, offset + config.inline.maxSuffixChars));
            if (prefix.trim().length < 12) {
                return new vscode.InlineCompletionList([]);
            }
            const runtime = await this.buildRuntimeContext();
            if (!runtime || token.isCancellationRequested) {
                return new vscode.InlineCompletionList([]);
            }
            const engine = new contextEngine_1.InMemoryContextEngine(new embeddings_1.NaiveEmbeddingProvider());
            await engine.index(runtime.documents);
            const matches = await engine.query({
                query: [document.uri.fsPath, prefix.slice(-400), suffix.slice(0, 160)].join('\n'),
                maxResults: 6,
            });
            const retrieved = dedupeContextRefs(matches.map((match) => match.document));
            const coder = this.createCoder(runtime.config);
            const memorySummary = (0, memory_1.formatMemoryForContext)(this.memory.getEntries().slice(0, 6));
            const suggestion = await coder.completeInline({
                filePath: toRelativePath(runtime.workspaceRoot, document.uri.fsPath),
                languageId: document.languageId,
                prefix,
                suffix,
                deterministic: true,
                context: {
                    files: retrieved.map((doc) => ({
                        path: toRelativePath(runtime.workspaceRoot, doc.uri),
                        content: doc.content,
                        reason: doc.source ?? 'workspace',
                        isActive: doc.uri === document.uri.fsPath,
                    })),
                    workspace: {
                        root: runtime.workspaceRoot,
                        activeFilePath: toRelativePath(runtime.workspaceRoot, document.uri.fsPath),
                        selection: undefined,
                        workspaceSummary: runtime.workspaceSummary,
                        dependencyAllowlist: runtime.dependencyAllowlist,
                        openFiles: runtime.openFiles.map((file) => toRelativePath(runtime.workspaceRoot, file)),
                        retrievedPaths: retrieved.map((doc) => toRelativePath(runtime.workspaceRoot, doc.uri)),
                    },
                    memory: memorySummary,
                },
            });
            if (token.isCancellationRequested || !suggestion.trim()) {
                return new vscode.InlineCompletionList([]);
            }
            return new vscode.InlineCompletionList([
                new vscode.InlineCompletionItem(suggestion, new vscode.Range(position, position)),
            ]);
        }
        catch (error) {
            this.logger.warn('Inline completion failed', error);
            return new vscode.InlineCompletionList([]);
        }
    }
    async handleWebviewMessage(message) {
        if (!message || typeof message !== 'object' || !('type' in message)) {
            return;
        }
        const typedMessage = message;
        if (typedMessage.type === 'chat:submit') {
            const prompt = String(typedMessage.payload ?? '').trim();
            if (!prompt) {
                return;
            }
            await this.submitPrompt(prompt, 'chat');
        }
        if (typedMessage.type === 'diff:decision') {
            const decision = String(typedMessage.payload ?? 'reject');
            await this.handleDiffDecision(decision === 'accept' ? 'accept' : 'reject');
        }
    }
    async submitPrompt(prompt, modeHint) {
        const runtime = await this.buildRuntimeContext();
        if (!runtime) {
            this.appendMessage('assistant', 'Open a workspace folder so I can index files, retrieve context, and validate changes.');
            this.setStatus('idle');
            this.syncWebview();
            return;
        }
        const requestId = ++this.requestSerial;
        this.pendingPreview = undefined;
        this.state.diffPreview = [];
        this.appendMessage('user', prompt);
        this.lastPrompt = prompt;
        this.lastPlan = undefined;
        this.setStatus('planning', 'Preparing plan from current workspace context.');
        this.syncWebview();
        const pipeline = this.createPipeline();
        let streamingMessageId;
        const result = await pipeline.execute({
            workspaceRoot: runtime.workspaceRoot,
            prompt,
            activeFilePath: runtime.activeFilePath,
            selection: runtime.selection,
            modeHint,
            workspaceSummary: runtime.workspaceSummary,
            dependencyAllowlist: runtime.dependencyAllowlist,
            openFiles: runtime.openFiles,
            documents: runtime.documents,
            logger: this.logger,
        }, {
            maxAttempts: runtime.config.execution.maxAttempts,
            retrievalMaxResults: runtime.config.context.retrievalMaxResults,
            allowNewFiles: allowNewFilesForPrompt(prompt),
        }, {
            onStage: async (stage, detail) => {
                if (requestId !== this.requestSerial) {
                    return;
                }
                this.setStatus(mapPipelineStageToUiStatus(stage), detail);
                this.syncWebview();
            },
            onAnswerChunk: async (chunk) => {
                if (requestId !== this.requestSerial) {
                    return;
                }
                streamingMessageId = this.appendStreamingChunk(streamingMessageId, chunk);
                this.syncWebview();
            },
        });
        if (requestId !== this.requestSerial) {
            return;
        }
        this.lastPlan = result.plan;
        this.state.plan = result.plan ? this.toUiPlan(result.plan) : undefined;
        this.state.contextRefs = this.toUiContextReferences(runtime.workspaceRoot, result.retrievedDocuments);
        if (!result.ok) {
            if (!streamingMessageId) {
                this.appendMessage('assistant', result.error ?? 'Request failed without details.');
            }
            this.setStatus('idle', result.error ?? 'Request failed.');
            await this.persistState();
            this.syncWebview();
            return;
        }
        if (result.mode === 'chat' && result.answer) {
            if (!streamingMessageId) {
                this.appendMessage('assistant', result.answer.content);
            }
            this.setStatus('idle', 'Answer ready.');
            await this.persistState();
            this.syncWebview();
            return;
        }
        if (result.preview) {
            this.pendingPreview = result.preview;
            this.state.diffPreview = result.preview.changes.map((change) => ({
                path: change.path,
                diff: change.diff,
                summary: change.summary,
                operation: change.operation,
            }));
            const planSummary = result.plan ? `Plan: ${result.plan.summary}` : 'Plan ready.';
            const rationale = result.preview.rationale || result.preview.summary;
            this.appendMessage('assistant', `${planSummary}\n\nReasoning: ${rationale}\n\nReview the diff preview before applying changes.`);
            this.setStatus('review', 'Validated diff ready for approval.');
            await this.persistState();
            this.syncWebview();
            return;
        }
        this.setStatus('idle', 'No output produced.');
        await this.persistState();
        this.syncWebview();
    }
    async handleDiffDecision(decision) {
        const preview = this.pendingPreview;
        this.pendingPreview = undefined;
        this.state.diffPreview = [];
        if (!preview) {
            this.setStatus('idle');
            this.syncWebview();
            return;
        }
        if (decision === 'reject') {
            this.appendMessage('assistant', 'Diff rejected. No files were modified.');
            await this.recordDecisionMemory('rejected', []);
            this.setStatus('idle', 'Draft rejected.');
            await this.persistState();
            this.syncWebview();
            return;
        }
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            this.appendMessage('assistant', 'Workspace closed before the diff could be applied.');
            this.setStatus('idle');
            this.syncWebview();
            return;
        }
        this.setStatus('executing', 'Applying validated changes to the workspace.');
        this.syncWebview();
        const executor = new executor_1.FileSystemExecutor();
        const applyResult = await executor.apply(preview, 'accept', workspaceRoot);
        if (applyResult.errors.length > 0) {
            const details = applyResult.errors.map((error) => `${error.path}: ${error.message}`).join('\n');
            this.appendMessage('assistant', `Applied ${applyResult.applied} file(s) with ${applyResult.errors.length} error(s):\n${details}`);
            await this.recordDecisionMemory('error', applyResult.changedPaths);
        }
        else {
            this.appendMessage('assistant', `Applied ${applyResult.applied} change(s) successfully.\n\nFiles: ${applyResult.changedPaths.join(', ')}`);
            await this.recordDecisionMemory('success', applyResult.changedPaths);
        }
        this.setStatus('idle', 'Execution finished.');
        await this.persistState();
        this.syncWebview();
    }
    async recordDecisionMemory(result, changedPaths) {
        if (!this.lastPrompt || !this.lastPlan) {
            await this.persistState();
            return;
        }
        await this.memory.add({
            id: `${Date.now()}`,
            timestamp: Date.now(),
            prompt: this.lastPrompt,
            intent: this.lastPlan.intent,
            result,
            summary: result === 'rejected'
                ? 'User rejected the proposed diff.'
                : changedPaths.length > 0
                    ? `Changed ${changedPaths.join(', ')}`
                    : 'Execution completed.',
            changes: changedPaths,
        });
        await this.persistState();
    }
    createPipeline() {
        return new pipeline_1.Pipeline(new planner_1.BasicPlanner(), this.createCoder(this.getConfig()), new validator_1.BasicValidator(), new executor_1.FileSystemExecutor(), new contextEngine_1.InMemoryContextEngine(new embeddings_1.NaiveEmbeddingProvider()), this.memory, this.logger);
    }
    createCoder(config) {
        return new ollamaCoder_1.OllamaCoder({
            client: new ollamaClient_1.HttpOllamaClient(config.ollama),
            model: config.ollama.model,
            temperature: config.ollama.temperature,
        });
    }
    async buildRuntimeContext() {
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return undefined;
        }
        const config = this.getConfig();
        const workspaceIndex = await (0, workspaceIndex_1.indexWorkspace)(workspaceRoot);
        const activeEditor = vscode.window.activeTextEditor;
        const activeFilePath = activeEditor?.document.uri.scheme === 'file' ? activeEditor.document.uri.fsPath : undefined;
        const selection = activeEditor && !activeEditor.selection.isEmpty
            ? activeEditor.document.getText(activeEditor.selection).slice(0, 4000)
            : undefined;
        const openFiles = vscode.workspace.textDocuments
            .filter((document) => document.uri.scheme === 'file' && !document.isUntitled)
            .map((document) => document.uri.fsPath);
        const fileDocs = await (0, workspaceIndex_1.readWorkspaceDocuments)(workspaceIndex, {
            maxFiles: config.context.maxFiles,
            maxFileSize: config.context.maxFileSize,
            maxTotalSize: config.context.maxTotalSize,
            priorityPaths: activeFilePath ? [activeFilePath, ...openFiles] : openFiles,
        });
        const mergedDocuments = new Map();
        for (const document of fileDocs) {
            for (const chunk of (0, contextEngine_1.chunkContextDocument)(document)) {
                mergedDocuments.set(chunk.id, chunk);
            }
        }
        for (const document of vscode.workspace.textDocuments) {
            if (document.uri.scheme !== 'file' || document.isUntitled) {
                continue;
            }
            const source = document.uri.fsPath === activeFilePath ? 'active' : 'open';
            const baseDoc = {
                id: document.uri.fsPath,
                uri: document.uri.fsPath,
                title: toRelativePath(workspaceRoot, document.uri.fsPath),
                content: document.getText(),
                updatedAt: Date.now(),
                source,
                tags: toRelativePath(workspaceRoot, document.uri.fsPath).split('/'),
            };
            for (const chunk of (0, contextEngine_1.chunkContextDocument)(baseDoc)) {
                mergedDocuments.set(chunk.id, chunk);
            }
        }
        if (activeFilePath && selection) {
            mergedDocuments.set(`${activeFilePath}#selection`, {
                id: `${activeFilePath}#selection`,
                uri: activeFilePath,
                title: `${toRelativePath(workspaceRoot, activeFilePath)} (selection)`,
                content: selection,
                updatedAt: Date.now(),
                source: 'selection',
                tags: ['selection', ...toRelativePath(workspaceRoot, activeFilePath).split('/')],
            });
        }
        return {
            workspaceRoot,
            activeFilePath,
            selection,
            openFiles,
            workspaceSummary: (0, workspaceIndex_1.buildWorkspaceOutline)(workspaceIndex, 70),
            dependencyAllowlist: (0, workspaceIndex_1.summarizeDependencies)(workspaceIndex),
            documents: [...mergedDocuments.values()],
            config,
            workspaceIndex,
        };
    }
    toUiPlan(plan) {
        return {
            intent: plan.intent,
            goal: plan.goal,
            summary: plan.summary,
            steps: plan.steps.map((step) => `${step.title}: ${step.description}`),
            requiresWrite: plan.requiresWrite,
            guardrails: plan.guardrails,
        };
    }
    toUiContextReferences(workspaceRoot, documents) {
        const seen = new Set();
        const references = [];
        for (const document of documents) {
            const relativePath = toRelativePath(workspaceRoot, document.uri);
            if (seen.has(relativePath)) {
                continue;
            }
            seen.add(relativePath);
            references.push({
                path: relativePath,
                source: document.source ?? 'workspace',
            });
        }
        return references.slice(0, 10);
    }
    appendMessage(role, content) {
        const messageId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        this.state.messages.push({
            id: messageId,
            role,
            content,
            createdAt: Date.now(),
        });
        this.trimMessages();
        return messageId;
    }
    appendStreamingChunk(messageId, chunk) {
        const trimmedChunk = chunk ?? '';
        if (!messageId) {
            messageId = this.appendMessage('assistant', trimmedChunk);
            return messageId;
        }
        const message = this.state.messages.find((item) => item.id === messageId);
        if (message) {
            message.content += trimmedChunk;
        }
        return messageId;
    }
    trimMessages() {
        const maxMessages = 60;
        if (this.state.messages.length > maxMessages) {
            this.state.messages.splice(0, this.state.messages.length - maxMessages);
        }
    }
    setStatus(status, detail = '') {
        this.state.status = status;
        this.state.statusDetail = detail;
    }
    syncWebview() {
        this.panel?.webview.postMessage({
            type: 'state:update',
            payload: this.state,
        });
    }
    async persistState() {
        await this.extensionContext.workspaceState.update(SESSION_STATE_KEY, {
            ...this.state,
            status: 'idle',
            diffPreview: [],
        });
        await this.extensionContext.workspaceState.update(MEMORY_STATE_KEY, this.memory.getEntries());
    }
    getConfig() {
        const defaults = (0, config_1.defaultConfig)();
        const config = vscode.workspace.getConfiguration('klyr');
        return {
            ...defaults,
            ollama: {
                ...defaults.ollama,
                baseUrl: config.get('ollama.baseUrl', defaults.ollama.baseUrl),
                model: config.get('ollama.model', defaults.ollama.model),
                temperature: config.get('ollama.temperature', defaults.ollama.temperature),
                timeoutMs: config.get('ollama.timeoutMs', defaults.ollama.timeoutMs),
                maxRetries: config.get('ollama.maxRetries', defaults.ollama.maxRetries),
                retryBackoffMs: config.get('ollama.retryBackoffMs', defaults.ollama.retryBackoffMs),
            },
            context: {
                ...defaults.context,
                maxFiles: config.get('context.maxFiles', defaults.context.maxFiles),
                maxFileSize: config.get('context.maxFileSize', defaults.context.maxFileSize),
                maxTotalSize: config.get('context.maxTotalSize', defaults.context.maxTotalSize),
                retrievalMaxResults: config.get('context.retrievalMaxResults', defaults.context.retrievalMaxResults),
                retrievalMinScore: config.get('context.retrievalMinScore', defaults.context.retrievalMinScore),
            },
            execution: {
                ...defaults.execution,
                maxAttempts: config.get('execution.maxAttempts', defaults.execution.maxAttempts),
                noOp: config.get('execution.noOp', defaults.execution.noOp),
            },
            inline: {
                ...defaults.inline,
                enabled: config.get('inline.enabled', defaults.inline.enabled),
                maxPrefixChars: config.get('inline.maxPrefixChars', defaults.inline.maxPrefixChars),
                maxSuffixChars: config.get('inline.maxSuffixChars', defaults.inline.maxSuffixChars),
            },
        };
    }
}
function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    return folders[0].uri.fsPath;
}
function toRelativePath(workspaceRoot, absolutePath) {
    return absolutePath.startsWith(workspaceRoot)
        ? absolutePath.slice(workspaceRoot.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
        : absolutePath.replace(/\\/g, '/');
}
function allowNewFilesForPrompt(prompt) {
    return /(create|add|new file|test|spec|feature|component)/i.test(prompt);
}
function mapPipelineStageToUiStatus(stage) {
    switch (stage) {
        case 'planning':
            return 'planning';
        case 'retrieving':
            return 'retrieving';
        case 'thinking':
            return 'thinking';
        case 'validating':
            return 'validating';
        case 'review':
            return 'review';
        case 'done':
        default:
            return 'idle';
    }
}
function dedupeContextRefs(documents) {
    const seen = new Set();
    const output = [];
    for (const document of documents) {
        const key = document.uri.replace(/\\/g, '/');
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        output.push(document);
    }
    return output;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map