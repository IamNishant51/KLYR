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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const planner_1 = require("./agent/planner");
const executor_1 = require("./agent/executor");
const validator_1 = require("./agent/validator");
const ollamaCoder_1 = require("./agent/ollamaCoder");
const contextEngine_1 = require("./context/contextEngine");
const embeddings_1 = require("./context/embeddings");
const memory_1 = require("./context/memory");
const workspaceIndex_1 = require("./context/workspaceIndex");
const orchestrator_1 = require("./context/orchestrator");
const ollamaClient_1 = require("./llm/ollamaClient");
const config_1 = require("./core/config");
const pipeline_1 = require("./core/pipeline");
const SESSION_STATE_KEY = 'klyr.chatSession';
const MEMORY_STATE_KEY = 'klyr.memoryEntries';
const CHAT_HISTORY_STATE_KEY = 'klyr.chatHistory';
/**
 * WebviewViewProvider for the Klyr sidebar chat view
 */
class KlyrChatViewProvider {
    extensionContext;
    controller;
    static viewType = 'klyr.chatView';
    constructor(extensionContext, controller) {
        this.extensionContext = extensionContext;
        this.controller = controller;
    }
    resolveWebviewView(webviewView, _context, _token) {
        try {
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(this.extensionContext.extensionPath)],
            };
            const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            // Try to load React webview, fall back to simple HTML if not available
            let html;
            try {
                const fs = require('fs');
                const indexPath = this.extensionContext.asAbsolutePath('dist/webview/index.html');
                // Check if file exists
                if (fs.existsSync(indexPath)) {
                    html = fs.readFileSync(indexPath, 'utf-8');
                    // Fix paths for webview resources
                    const webviewUri = webviewView.webview.asWebviewUri(vscode.Uri.file(this.extensionContext.asAbsolutePath('dist/webview')));
                    // Replace paths for CSS and JS resources
                    // Handle both /path and ./path formats
                    html = html.replace(/src="\/([^"]*)"/g, (match, path) => `src="${webviewUri}/${path}"`);
                    html = html.replace(/href="\/([^"]*)"/g, (match, path) => `href="${webviewUri}/${path}"`);
                    html = html.replace(/src="\.\/([^"]*)"/g, (match, path) => `src="${webviewUri}/${path}"`);
                    html = html.replace(/href="\.\/([^"]*)"/g, (match, path) => `href="${webviewUri}/${path}"`);
                    // Add a nonce to the boot script for CSP compatibility.
                    html = html.replace('<script', `<script nonce="${nonce}"`);
                }
                else {
                    throw new Error('dist/webview/index.html not found');
                }
            }
            catch (e) {
                // Fallback to simple HTML
                const logger = new config_1.Logger('info');
                logger.warn(`Failed to load React webview in sidebar: ${e instanceof Error ? e.message : String(e)}, using fallback`);
                // Simple fallback HTML for sidebar
                html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 16px;
                margin: 0;
              }
              .container {
                display: flex;
                flex-direction: column;
                gap: 12px;
              }
              h2 {
                margin: 0 0 12px 0;
                font-size: 18px;
                color: var(--vscode-foreground);
              }
              .message-area {
                flex: 1;
                overflow-y: auto;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                padding: 8px;
                background-color: var(--vscode-input-background);
                min-height: 150px;
                max-height: 300px;
              }
              textarea {
                width: 100%;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                font-family: var(--vscode-font-family);
                resize: vertical;
              }
              button {
                padding: 8px 16px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-family: var(--vscode-font-family);
              }
              button:hover {
                background-color: var(--vscode-button-hoverBackground);
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Klyr Chat</h2>
              <div class="message-area" id="messages">
                <p>Welcome to Klyr! Start typing to ask the AI for help with your code.</p>
              </div>
              <textarea id="input" placeholder="Ask me to help with your code..." style="height: 80px;"></textarea>
              <button onclick="sendMessage()">Send Message</button>
            </div>
            <script>
              const vscode = acquireVsCodeApi();
              function sendMessage() {
                const input = document.getElementById('input');
                if (input.value.trim()) {
                  vscode.postMessage({
                    type: 'chat:submit',
                    payload: input.value
                  });
                  input.value = '';
                }
              }
              
              // Allow Enter key to send
              document.getElementById('input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  sendMessage();
                }
              });

              // Handle messages from extension
              window.addEventListener('message', (event) => {
                const message = event.data;
                if (message.type === 'message:append') {
                  const messagesDiv = document.getElementById('messages');
                  const msgEl = document.createElement('p');
                  msgEl.textContent = \`\${message.payload.role}: \${message.payload.content}\`;
                  messagesDiv.appendChild(msgEl);
                  messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
              });
            </script>
          </body>
        </html>
      `;
            }
            webviewView.webview.html = html;
            this.controller.attachChatView(webviewView);
            // Handle messages from the webview
            webviewView.webview.onDidReceiveMessage((message) => {
                void this.controller.handleWebviewMessage(message);
            });
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const logger = new config_1.Logger('info');
            logger.error(`Failed to resolve webview: ${errorMsg}`);
            webviewView.webview.html = `<html><body><p>Error loading chat panel: ${errorMsg}</p></body></html>`;
        }
    }
}
class KlyrLauncherViewProvider {
    controller;
    static viewType = 'klyr.chatLauncher';
    constructor(controller) {
        this.controller = controller;
    }
    resolveWebviewView(webviewView, _context, _token) {
        webviewView.webview.options = {
            enableScripts: false,
        };
        webviewView.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              margin: 0;
              padding: 20px 18px;
              font-family: var(--vscode-font-family);
              color: var(--vscode-foreground);
              background: var(--vscode-sideBar-background);
            }

            .card {
              border: 1px solid var(--vscode-panel-border);
              border-radius: 14px;
              padding: 14px 14px 12px;
              background: color-mix(in srgb, var(--vscode-editor-background) 82%, transparent);
            }

            .eyebrow {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.16em;
              color: var(--vscode-descriptionForeground);
              margin-bottom: 8px;
            }

            .title {
              font-size: 14px;
              font-weight: 600;
              margin-bottom: 8px;
            }

            .copy {
              font-size: 12px;
              line-height: 1.6;
              color: var(--vscode-descriptionForeground);
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="eyebrow">Klyr</div>
            <div class="title">Opening chat on the right...</div>
            <div class="copy">
              This launcher keeps the real Klyr chat in a dedicated right-side panel instead of the file sidebar.
            </div>
          </div>
        </body>
      </html>
    `;
        this.controller.launchChatFromSidebar();
    }
}
function activate(context) {
    try {
        const controller = new KlyrExtensionController(context);
        const logger = new config_1.Logger('info');
        logger.debug('Klyr extension activating...');
        context.subscriptions.push(vscode.commands.registerCommand('klyr.openChat', () => controller.openChat()), vscode.commands.registerCommand('klyr.fixCurrentFile', () => controller.runCurrentFileAction('Fix issues in')), vscode.commands.registerCommand('klyr.refactorCurrentFile', () => controller.runCurrentFileAction('Refactor')), vscode.commands.registerCommand('klyr.optimizeCurrentFile', () => controller.runCurrentFileAction('Optimize')), vscode.languages.registerInlineCompletionItemProvider([
            { language: 'typescript' },
            { language: 'typescriptreact' },
            { language: 'javascript' },
            { language: 'javascriptreact' },
            { language: 'json' },
        ], {
            provideInlineCompletionItems: async (document, position, inlineContext, token) => controller.provideInlineCompletions(document, position, inlineContext, token),
        }), 
        // Register the sidebar chat view provider
        vscode.window.registerWebviewViewProvider(KlyrChatViewProvider.viewType, new KlyrChatViewProvider(context, controller), { webviewOptions: { retainContextWhenHidden: true } }), vscode.window.registerWebviewViewProvider(KlyrLauncherViewProvider.viewType, new KlyrLauncherViewProvider(controller), { webviewOptions: { retainContextWhenHidden: false } }));
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        context.subscriptions.push(fileWatcher);
        context.subscriptions.push(fileWatcher.onDidChange(() => controller.invalidateIndexCache()), fileWatcher.onDidCreate(() => controller.invalidateIndexCache()), fileWatcher.onDidDelete(() => controller.invalidateIndexCache()));
        logger.debug('Klyr extension activated successfully');
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Klyr] Activation failed: ${errorMsg}`);
        vscode.window.showErrorMessage(`Klyr activation failed: ${errorMsg}`);
    }
}
class KlyrExtensionController {
    extensionContext;
    logger = new config_1.Logger('info');
    memory = new memory_1.InMemoryStore();
    contextOrchestrator = new orchestrator_1.ContextOrchestrator({
        modelTokenLimit: 8000,
        responseBuffer: 0.2,
        topKRetrieval: 10,
        maxChunkSize: 500,
        enableMemory: true,
    });
    state;
    chatView;
    pendingPreview;
    lastPrompt;
    lastPlan;
    selectedModelOverride;
    requestSerial = 0;
    chatHistory;
    workspaceIndexCache = null;
    INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
    lastUiUpdate = 0;
    UI_UPDATE_THROTTLE_MS = 50;
    pendingUiSyncTimer;
    constructor(extensionContext) {
        this.extensionContext = extensionContext;
        const restored = extensionContext.workspaceState.get(SESSION_STATE_KEY);
        this.chatHistory = extensionContext.workspaceState.get(CHAT_HISTORY_STATE_KEY) ?? [];
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
        void this.revealChatPanel(initialPrompt, modeHint);
    }
    launchChatFromSidebar() {
        void (async () => {
            await this.revealChatPanel();
            try {
                await vscode.commands.executeCommand('workbench.action.closeSidebar');
            }
            catch (error) {
                this.logger.debug(`Unable to close primary sidebar after launch: ${error instanceof Error ? error.message : String(error)}`);
            }
        })();
    }
    attachChatView(webviewView) {
        this.chatView = webviewView;
        webviewView.onDidDispose(() => {
            if (this.chatView === webviewView) {
                this.chatView = undefined;
            }
        });
    }
    invalidateIndexCache() {
        this.workspaceIndexCache = null;
    }
    async revealChatPanel(initialPrompt, modeHint) {
        try {
            await this.ensureChatPanelOnRightSide();
            await vscode.commands.executeCommand('workbench.action.openView', 'klyr.chatView', true);
            await vscode.commands.executeCommand('workbench.action.focusPanel');
        }
        catch (error) {
            this.logger.warn(`Failed to reveal right-side Klyr chat view: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.syncWebview();
        if (initialPrompt) {
            await this.submitPrompt(initialPrompt, modeHint ?? 'edit');
        }
    }
    async ensureChatPanelOnRightSide() {
        try {
            await vscode.commands.executeCommand('workbench.action.positionPanelRight');
        }
        catch (error) {
            this.logger.debug(`Unable to move the panel to the right: ${error instanceof Error ? error.message : String(error)}`);
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
            const engine = new contextEngine_1.InMemoryContextEngine(new embeddings_1.OllamaEmbeddingProvider(runtime.config.ollama.baseUrl));
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
        if (typedMessage.config && typeof typedMessage.config === 'object') {
            this.applyUiConfig(typedMessage.config);
        }
        if (typedMessage.type === 'chat:submit') {
            const payload = typedMessage.payload;
            const prompt = typeof payload === 'string'
                ? payload.trim()
                : payload && typeof payload === 'object' && 'prompt' in payload
                    ? String(payload.prompt ?? '').trim()
                    : '';
            if (!prompt) {
                return;
            }
            const rawMode = payload && typeof payload === 'object' && 'modeHint' in payload
                ? String(payload.modeHint ?? '')
                : 'chat';
            const modeHint = rawMode === 'edit' || rawMode === 'inline' ? rawMode : 'chat';
            await this.submitPrompt(prompt, modeHint);
        }
        if (typedMessage.type === 'diff:decision') {
            const decision = String(typedMessage.payload ?? 'reject');
            await this.handleDiffDecision(decision === 'accept' ? 'accept' : 'reject');
        }
        if (typedMessage.type === 'models:fetch') {
            this.syncWebview();
            await this.fetchAndSendModels();
        }
        if (typedMessage.type === 'config:update') {
            const config = typedMessage.payload && typeof typedMessage.payload === 'object'
                ? typedMessage.payload
                : undefined;
            if (config) {
                this.applyUiConfig(config);
            }
            this.logger.debug(`Config updated: ${JSON.stringify(config ?? {})}`);
        }
        if (typedMessage.type === 'settings:open') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'klyr');
        }
        if (typedMessage.type === 'chat:clear') {
            await this.clearChatState();
        }
        if (typedMessage.type === 'chat:stop') {
            await this.stopActiveRequest();
        }
        if (typedMessage.type === 'chat:history') {
            await this.openChatHistory();
        }
    }
    async openChatHistory() {
        if (this.chatHistory.length === 0) {
            vscode.window.showInformationMessage('No chat history yet.');
            return;
        }
        const items = this.chatHistory.map((entry) => {
            const firstUserMessage = entry.messages.find((message) => message.role === 'user');
            const label = firstUserMessage?.content?.slice(0, 70) || 'Untitled chat';
            return {
                label,
                description: `${entry.messages.length} messages`,
                detail: new Date(entry.createdAt).toLocaleString(),
                entry,
            };
        });
        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Restore a previous chat',
            matchOnDescription: true,
            matchOnDetail: true,
        });
        if (!picked) {
            return;
        }
        this.state.messages = picked.entry.messages.map((message) => ({ ...message }));
        this.setStatus('idle', 'History restored.');
        await this.persistState();
        this.syncWebview();
    }
    async archiveCurrentChatIfNeeded() {
        if (this.state.messages.length === 0) {
            return;
        }
        const snapshot = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            createdAt: Date.now(),
            messages: this.state.messages.map((message) => ({ ...message })),
        };
        this.chatHistory = [snapshot, ...this.chatHistory].slice(0, 25);
        await this.extensionContext.workspaceState.update(CHAT_HISTORY_STATE_KEY, this.chatHistory);
    }
    async stopActiveRequest() {
        this.requestSerial += 1;
        this.pendingPreview = undefined;
        this.state.diffPreview = [];
        this.setStatus('idle', 'Stopped.');
        await this.persistState();
        this.syncWebview();
    }
    async fetchAndSendModels() {
        if (!this.hasAttachedWebviews()) {
            return;
        }
        try {
            const config = this.getConfig();
            const client = new ollamaClient_1.HttpOllamaClient({
                baseUrl: config.ollama.baseUrl,
                timeoutMs: config.ollama.timeoutMs,
                maxRetries: config.ollama.maxRetries,
                retryBackoffMs: config.ollama.retryBackoffMs,
            });
            const response = await client.listModels();
            const models = response.models.map((m) => m.name);
            this.postToWebviews({
                type: 'models:list',
                payload: models,
            });
        }
        catch (error) {
            const config = this.getConfig();
            this.logger.warn(`Failed to fetch models: ${error instanceof Error ? error.message : String(error)}`);
            this.postToWebviews({
                type: 'models:list',
                payload: [config.ollama.model],
            });
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
        let documentsForPipeline = runtime.documents;
        try {
            this.setStatus('retrieving', 'Building optimized context from workspace and conversation.');
            this.syncWebview();
            const conversationHistory = this.state.messages
                .filter((message) => message.role === 'user' || message.role === 'assistant')
                .map((message) => ({ role: message.role, content: message.content }));
            const contextResponse = await this.contextOrchestrator.orchestrate({
                query: prompt,
                workspacePath: runtime.workspaceRoot,
                currentFilePath: runtime.activeFilePath,
                conversationHistory,
                includeMemory: true,
            });
            if (contextResponse.formattedContext.trim()) {
                const orchestratedDocument = {
                    id: `klyr-orchestrated-${Date.now()}`,
                    uri: `${runtime.workspaceRoot.replace(/\\/g, '/')}/.klyr/context`,
                    title: 'klyr-orchestrated-context',
                    content: contextResponse.formattedContext,
                    updatedAt: Date.now(),
                    source: 'memory',
                    tags: ['orchestrated', 'context'],
                };
                documentsForPipeline = [orchestratedDocument, ...runtime.documents];
            }
        }
        catch (error) {
            this.logger.warn(`Context orchestration failed, using baseline retrieval: ${error instanceof Error ? error.message : String(error)}`);
        }
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
            documents: documentsForPipeline,
            logger: this.logger,
        }, {
            maxAttempts: runtime.config.execution.maxAttempts,
            retrievalMaxResults: runtime.config.context.retrievalMaxResults,
            allowNewFiles: true,
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
            const safeToAutoApply = this.shouldAutoApplyPreview(result.preview);
            if (!safeToAutoApply) {
                this.setStatus('review', 'Draft needs manual review: detected potential deletions for an add-only request.');
                this.appendMessage('assistant', 'Safety check: I detected deletions in an add-only request, so I did not auto-apply. Please review and apply manually if this is intentional.');
                await this.persistState();
                this.syncWebview();
                return;
            }
            this.setStatus('review', 'Validated diff ready. Applying now.');
            await this.persistState();
            this.syncWebview();
            await this.handleDiffDecision('accept');
            return;
        }
        this.setStatus('idle', 'No output produced.');
        await this.persistState();
        this.syncWebview();
    }
    async handleDiffDecision(decision) {
        let preview = this.pendingPreview;
        this.pendingPreview = undefined;
        this.state.diffPreview = [];
        if (!preview) {
            this.setStatus('idle');
            this.syncWebview();
            return;
        }
        if (decision === 'reject') {
            this.appendMessage('assistant', 'Diff rejected. No files were modified.');
            const rejectWorkspaceRoot = getWorkspaceRoot();
            if (rejectWorkspaceRoot) {
                await this.cleanupBackups(rejectWorkspaceRoot);
            }
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
        const safePreview = this.buildSafeAdditivePreview(preview);
        if (safePreview) {
            preview = safePreview;
            this.appendMessage('assistant', 'Safety rewrite: converted destructive draft into add-only insertion to preserve existing file content.');
            this.syncWebview();
        }
        if (preview.changes.length === 0) {
            const recoveredPreview = await this.buildNoopAdditiveRecoveryPreview(workspaceRoot, preview);
            if (recoveredPreview) {
                preview = recoveredPreview;
                this.appendMessage('assistant', 'Recovery path: generated a deterministic add-only patch from your prompt because the model draft resolved to a no-op.');
                this.syncWebview();
            }
        }
        this.setStatus('executing', 'Applying validated changes to the workspace.');
        this.syncWebview();
        const backupPaths = [];
        for (const change of preview.changes) {
            if (change.operation !== 'update') {
                continue;
            }
            const filePath = path.join(workspaceRoot, change.path);
            const backupPath = await this.backupFile(filePath);
            if (backupPath) {
                backupPaths.push(backupPath);
            }
        }
        const applyResult = {
            applied: 0,
            rejected: 0,
            changedPaths: [],
            errors: [],
        };
        for (let index = 0; index < preview.changes.length; index += 1) {
            const change = preview.changes[index];
            this.setStatus('executing', `Applying ${change.operation}: ${change.path} (${index + 1}/${preview.changes.length})`);
            this.syncWebview();
            const singleResult = await this.applySingleChange(change, workspaceRoot);
            applyResult.applied += singleResult.applied;
            applyResult.rejected += singleResult.rejected;
            applyResult.changedPaths.push(...singleResult.changedPaths);
            applyResult.errors.push(...singleResult.errors);
        }
        this.invalidateIndexCache();
        if (applyResult.errors.length > 0) {
            const details = applyResult.errors.map((error) => `${error.path}: ${error.message}`).join('\n');
            const restoreInfo = backupPaths.length > 0 ? `\n\nBackups saved at: ${backupPaths.join(', ')}` : '';
            this.appendMessage('assistant', `Applied ${applyResult.applied} file(s) with ${applyResult.errors.length} error(s):\n${details}${restoreInfo}`);
            await this.recordDecisionMemory('error', applyResult.changedPaths);
        }
        else if (applyResult.applied === 0) {
            this.appendMessage('assistant', 'No file changes were applied. The requested content may already exist, or the generated draft resolved to a no-op.');
            await this.cleanupBackups(workspaceRoot);
            await this.recordDecisionMemory('success', []);
        }
        else {
            this.appendMessage('assistant', `Applied ${applyResult.applied} change(s) successfully.\n\nFiles: ${applyResult.changedPaths.join(', ')}`);
            await this.cleanupBackups(workspaceRoot);
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
        const config = this.getConfig();
        return new pipeline_1.Pipeline(new planner_1.BasicPlanner(), this.createCoder(config), new validator_1.BasicValidator(), new executor_1.FileSystemExecutor(), new contextEngine_1.InMemoryContextEngine(new embeddings_1.OllamaEmbeddingProvider(config.ollama.baseUrl)), this.memory, this.logger);
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
        let workspaceIndex;
        if (this.workspaceIndexCache &&
            Date.now() - this.workspaceIndexCache.timestamp < this.INDEX_CACHE_TTL_MS) {
            workspaceIndex = this.workspaceIndexCache.index;
        }
        else {
            workspaceIndex = await (0, workspaceIndex_1.indexWorkspace)(workspaceRoot);
            this.workspaceIndexCache = {
                index: workspaceIndex,
                timestamp: Date.now(),
            };
        }
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
        const now = Date.now();
        const elapsed = now - this.lastUiUpdate;
        if (elapsed < this.UI_UPDATE_THROTTLE_MS) {
            if (this.pendingUiSyncTimer) {
                return;
            }
            this.pendingUiSyncTimer = setTimeout(() => {
                this.pendingUiSyncTimer = undefined;
                this.lastUiUpdate = Date.now();
                this.postToWebviews({
                    type: 'state:update',
                    payload: this.state,
                });
            }, this.UI_UPDATE_THROTTLE_MS - elapsed);
            return;
        }
        this.lastUiUpdate = now;
        this.postToWebviews({
            type: 'state:update',
            payload: this.state,
        });
    }
    hasAttachedWebviews() {
        return Boolean(this.chatView);
    }
    postToWebviews(message) {
        if (this.chatView) {
            void this.chatView.webview.postMessage(message);
        }
    }
    applyUiConfig(config) {
        if (typeof config.selectedModel === 'string' && config.selectedModel.trim()) {
            this.selectedModelOverride = config.selectedModel.trim();
        }
    }
    async clearChatState() {
        await this.archiveCurrentChatIfNeeded();
        this.pendingPreview = undefined;
        this.lastPrompt = undefined;
        this.lastPlan = undefined;
        this.state.messages = [];
        this.state.plan = undefined;
        this.state.contextRefs = [];
        this.state.diffPreview = [];
        this.setStatus('idle');
        await this.persistState();
        this.syncWebview();
    }
    async applySingleChange(change, workspaceRoot) {
        const executor = new executor_1.FileSystemExecutor();
        return executor.apply({
            summary: `Apply ${change.path}`,
            rationale: 'single change apply',
            changes: [change],
        }, 'accept', workspaceRoot);
    }
    async backupFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const backupPath = `${filePath}.klyr.backup.${Date.now()}`;
            await fs.writeFile(backupPath, content, 'utf-8');
            return backupPath;
        }
        catch {
            return null;
        }
    }
    async cleanupBackups(workspaceRoot) {
        try {
            const files = await fs.readdir(workspaceRoot);
            for (const file of files) {
                if (!file.includes('.klyr.backup.')) {
                    continue;
                }
                const parts = file.split('.klyr.backup.');
                if (parts.length < 2) {
                    continue;
                }
                const timestamp = Number.parseInt(parts[1], 10);
                if (!Number.isFinite(timestamp)) {
                    continue;
                }
                if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
                    await fs.unlink(path.join(workspaceRoot, file));
                }
            }
        }
        catch {
            // Ignore cleanup errors.
        }
    }
    shouldAutoApplyPreview(preview) {
        const prompt = (this.lastPrompt ?? '').toLowerCase();
        if (!prompt) {
            return true;
        }
        const addIntent = this.isAddOnlyPrompt(prompt);
        const destructiveIntent = /\b(delete|remove|replace|rewrite|refactor|cleanup|format|restructure)\b/.test(prompt);
        if (!addIntent || destructiveIntent) {
            return true;
        }
        return !this.previewHasDeletions(preview);
    }
    isAddOnlyPrompt(prompt) {
        const normalized = prompt.toLowerCase();
        const addIntent = /\b(add|append|insert|include|put)\b/.test(normalized);
        const hasNegatedDestructive = /\b(don't|dont|do not|never)\s+(delete|remove)\b/.test(normalized) ||
            /\bwithout\s+(deleting|removing)\b/.test(normalized);
        const destructiveIntent = /\b(delete|remove|replace|rewrite|refactor|cleanup|format|restructure)\b/.test(normalized) &&
            !hasNegatedDestructive;
        return addIntent && !destructiveIntent;
    }
    buildSafeAdditivePreview(preview) {
        const prompt = (this.lastPrompt ?? '').trim();
        if (!prompt || !this.isAddOnlyPrompt(prompt) || !this.previewHasDeletions(preview)) {
            return undefined;
        }
        const requestedLiteral = this.extractRequestedLiteral(prompt);
        if (!requestedLiteral) {
            return undefined;
        }
        const normalizedLiteral = requestedLiteral.trim();
        if (!normalizedLiteral) {
            return undefined;
        }
        const targetPaths = this.extractMentionedPaths(prompt);
        const insertionMode = this.extractInsertionMode(prompt);
        const safeChanges = preview.changes.reduce((accumulator, change) => {
            if (targetPaths.length > 0) {
                const normalizedPath = change.path.replace(/\\/g, '/').toLowerCase();
                const matchesTarget = targetPaths.some((targetPath) => normalizedPath.endsWith(targetPath));
                if (!matchesTarget) {
                    return accumulator;
                }
            }
            if (change.operation === 'delete') {
                return accumulator;
            }
            const baseContent = change.originalContent ?? '';
            if (this.isLiteralAlreadyPresent(baseContent, normalizedLiteral, insertionMode)) {
                return accumulator;
            }
            const proposedContent = this.insertLiteral(baseContent, normalizedLiteral, insertionMode);
            accumulator.push({
                ...change,
                operation: baseContent ? 'update' : 'create',
                proposedContent,
            });
            return accumulator;
        }, []);
        if (safeChanges.length === 0) {
            return undefined;
        }
        return {
            ...preview,
            rationale: `${preview.rationale} | Safe additive fallback was used.`,
            changes: safeChanges,
        };
    }
    async buildNoopAdditiveRecoveryPreview(workspaceRoot, originalPreview) {
        const prompt = (this.lastPrompt ?? '').trim();
        if (!prompt || !this.isAddOnlyPrompt(prompt)) {
            return undefined;
        }
        const requestedLiteral = this.extractRequestedLiteral(prompt)?.trim();
        if (!requestedLiteral) {
            return undefined;
        }
        const insertionMode = this.extractInsertionMode(prompt);
        const targetPaths = this.extractMentionedPaths(prompt);
        if (targetPaths.length === 0) {
            return undefined;
        }
        const recoveryChanges = [];
        for (const targetPath of targetPaths) {
            const absolutePath = path.resolve(workspaceRoot, targetPath);
            if (!this.isWithinWorkspace(absolutePath, workspaceRoot)) {
                continue;
            }
            let originalContent = '';
            try {
                originalContent = await fs.readFile(absolutePath, 'utf-8');
            }
            catch {
                originalContent = '';
            }
            if (this.isLiteralAlreadyPresent(originalContent, requestedLiteral, insertionMode)) {
                continue;
            }
            const proposedContent = this.insertLiteral(originalContent, requestedLiteral, insertionMode);
            recoveryChanges.push({
                path: targetPath,
                summary: `Add ${requestedLiteral} to ${insertionMode === 'top' ? 'top' : 'file'}`,
                diff: '',
                proposedContent,
                operation: originalContent ? 'update' : 'create',
            });
        }
        if (recoveryChanges.length === 0) {
            return undefined;
        }
        const executor = new executor_1.FileSystemExecutor();
        return executor.preview({
            summary: originalPreview.summary || 'Recovered add-only patch',
            rationale: `${originalPreview.rationale} | No-op recovery used prompt-derived insertion.`,
            changes: recoveryChanges,
        }, workspaceRoot);
    }
    extractInsertionMode(prompt) {
        const normalized = prompt.toLowerCase();
        if (/\b(top|beginning|start|first line|very top)\b/.test(normalized)) {
            return 'top';
        }
        if (/\b(bottom|end|last line|append)\b/.test(normalized)) {
            return 'bottom';
        }
        return 'any';
    }
    isLiteralAlreadyPresent(baseContent, literal, mode) {
        if (!baseContent || !literal) {
            return false;
        }
        const normalizedLiteral = literal.trim();
        if (!normalizedLiteral) {
            return false;
        }
        const lines = baseContent.replace(/\r\n/g, '\n').split('\n');
        if (mode === 'top') {
            return lines.slice(0, Math.min(lines.length, 6)).some((line) => line.trim() === normalizedLiteral);
        }
        if (mode === 'bottom') {
            return lines
                .slice(Math.max(0, lines.length - 6))
                .some((line) => line.trim() === normalizedLiteral);
        }
        return baseContent.includes(normalizedLiteral);
    }
    insertLiteral(baseContent, literal, mode) {
        const normalizedBase = baseContent.replace(/\r\n/g, '\n');
        const normalizedLiteral = literal.trim();
        if (!normalizedBase) {
            return `${normalizedLiteral}\n`;
        }
        if (mode === 'top') {
            return `${normalizedLiteral}\n${normalizedBase}`;
        }
        const separator = normalizedBase.endsWith('\n') ? '' : '\n';
        return `${normalizedBase}${separator}${normalizedLiteral}\n`;
    }
    isWithinWorkspace(candidatePath, workspaceRoot) {
        const normalizedRoot = path.resolve(workspaceRoot);
        const normalizedCandidate = path.resolve(candidatePath);
        return (normalizedCandidate === normalizedRoot ||
            normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`));
    }
    extractMentionedPaths(prompt) {
        const matches = prompt.match(/(?:[A-Za-z]:[\\/])?[A-Za-z0-9_./\\-]+\.[A-Za-z0-9_-]+/g) ?? [];
        const normalized = matches
            .map((match) => match.replace(/^["'`]|["'`]$/g, '').replace(/\\/g, '/').toLowerCase())
            .map((value) => value.replace(/^\.[/]/, '').replace(/^[/]/, ''))
            .filter((value) => value.length > 0);
        return [...new Set(normalized)];
    }
    extractRequestedLiteral(prompt) {
        const quoted = prompt.match(/["'`](.+?)["'`]/);
        if (quoted?.[1]) {
            return quoted[1].trim();
        }
        const nameMatch = prompt.match(/\bname(?:\s+is)?\s+([A-Za-z][A-Za-z0-9_-]{1,80})\b/i);
        if (nameMatch?.[1]) {
            return nameMatch[1].trim();
        }
        const addMatch = prompt.match(/\badd\s+([A-Za-z0-9 _.-]{1,120})\s+to\b/i);
        if (addMatch?.[1]) {
            return addMatch[1].trim();
        }
        return undefined;
    }
    previewHasDeletions(preview) {
        for (const change of preview.changes) {
            if (change.operation === 'delete') {
                return true;
            }
            const lines = change.diff.split(/\r?\n/);
            for (const line of lines) {
                if (line.startsWith('-') && !line.startsWith('---')) {
                    return true;
                }
            }
        }
        return false;
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
                model: this.selectedModelOverride ??
                    config.get('ollama.model', defaults.ollama.model),
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