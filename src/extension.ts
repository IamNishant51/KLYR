import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BasicPlanner, LLMPoweredPlanner, type PlanMode, type PlanResult } from './agent/planner';
import { FileSystemExecutor, type DiffPreview } from './agent/executor';
import { BasicValidator } from './agent/validator';
import { OllamaCoder } from './agent/ollamaCoder';
import {
  InMemoryContextEngine,
  chunkContextDocument,
  type ContextDocument,
} from './context/contextEngine';
import { OllamaEmbeddingProvider } from './context/embeddings';
import { formatMemoryForContext, hydrateMemoryEntries, InMemoryStore } from './context/memory';
import {
  buildWorkspaceOutline,
  indexWorkspace,
  readWorkspaceDocuments,
  summarizeDependencies,
  type WorkspaceIndex,
} from './context/workspaceIndex';
import { ContextOrchestrator, type ContextRequest } from './context/orchestrator';
import { HttpOllamaClient } from './llm/ollamaClient';
import { defaultConfig, Logger, type KlyrConfig } from './core/config';
import { Pipeline, type PipelineStage } from './core/pipeline';
import type { ApplyResult } from './agent/executor';
import {
  type UiChatMessage,
  type UiContextReference,
  type UiDiffChange,
  type UiPlan,
  type UiStatus,
  type WebviewState,
} from './ui/webview';

interface RuntimeContext {
  workspaceRoot: string;
  activeFilePath?: string;
  selection?: string;
  openFiles: string[];
  workspaceSummary: string;
  dependencyAllowlist: string[];
  documents: ContextDocument[];
  config: KlyrConfig;
  workspaceIndex: WorkspaceIndex;
}

const SESSION_STATE_KEY = 'klyr.chatSession';
const MEMORY_STATE_KEY = 'klyr.memoryEntries';
const CHAT_HISTORY_STATE_KEY = 'klyr.chatHistory';

interface ChatHistoryEntry {
  id: string;
  createdAt: number;
  messages: UiChatMessage[];
}

/**
 * WebviewViewProvider for the Klyr sidebar chat view
 */
class KlyrChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'klyr.chatView';
  
  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly controller: KlyrExtensionController
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    try {
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(this.extensionContext.extensionPath)],
      };

      const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      
      // Try to load React webview, fall back to simple HTML if not available
      let html: string;
      try {
        const fs = require('fs');
        const indexPath = this.extensionContext.asAbsolutePath('dist/webview/index.html');
        
        // Check if file exists
        if (fs.existsSync(indexPath)) {
          html = fs.readFileSync(indexPath, 'utf-8');
          
          // Fix paths for webview resources
          const webviewUri = webviewView.webview.asWebviewUri(vscode.Uri.file(
            this.extensionContext.asAbsolutePath('dist/webview')
          ));
          
          // Replace paths for CSS and JS resources
          // Handle both /path and ./path formats
          html = html.replace(/src="\/([^"]*)"/g, (match, path) => `src="${webviewUri}/${path}"`);
          html = html.replace(/href="\/([^"]*)"/g, (match, path) => `href="${webviewUri}/${path}"`);
          html = html.replace(/src="\.\/([^"]*)"/g, (match, path) => `src="${webviewUri}/${path}"`);
          html = html.replace(/href="\.\/([^"]*)"/g, (match, path) => `href="${webviewUri}/${path}"`);
          
          // Add a nonce to the boot script for CSP compatibility.
          html = html.replace(
            '<script',
            `<script nonce="${nonce}"`
          );
        } else {
          throw new Error('dist/webview/index.html not found');
        }
      } catch (e) {
        // Fallback to simple HTML
        const logger = new Logger('info');
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const logger = new Logger('info');
      logger.error(`Failed to resolve webview: ${errorMsg}`);
      webviewView.webview.html = `<html><body><p>Error loading chat panel: ${errorMsg}</p></body></html>`;
    }
  }
}

class KlyrLauncherViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'klyr.chatLauncher';

  constructor(private readonly controller: KlyrExtensionController) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
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

export function activate(context: vscode.ExtensionContext) {
  try {
    const controller = new KlyrExtensionController(context);
    const logger = new Logger('info');

    logger.debug('Klyr extension activating...');

    context.subscriptions.push(
      vscode.commands.registerCommand('klyr.openChat', () => controller.openChat()),
      vscode.commands.registerCommand('klyr.fixCurrentFile', () =>
        controller.runCurrentFileAction('Fix issues in')
      ),
      vscode.commands.registerCommand('klyr.refactorCurrentFile', () =>
        controller.runCurrentFileAction('Refactor')
      ),
      vscode.commands.registerCommand('klyr.optimizeCurrentFile', () =>
        controller.runCurrentFileAction('Optimize')
      ),
      vscode.commands.registerCommand('klyr.viewDiffInEditor', () =>
        controller.viewDiffInEditor()
      ),
      vscode.languages.registerInlineCompletionItemProvider(
        [
          { language: 'typescript' },
          { language: 'typescriptreact' },
          { language: 'javascript' },
          { language: 'javascriptreact' },
          { language: 'json' },
        ],
        {
          provideInlineCompletionItems: async (document, position, inlineContext, token) =>
            controller.provideInlineCompletions(document, position, inlineContext, token),
        }
      ),
      // Register the sidebar chat view provider
      vscode.window.registerWebviewViewProvider(
        KlyrChatViewProvider.viewType,
        new KlyrChatViewProvider(context, controller),
        { webviewOptions: { retainContextWhenHidden: true } }
      ),
      vscode.window.registerWebviewViewProvider(
        KlyrLauncherViewProvider.viewType,
        new KlyrLauncherViewProvider(controller),
        { webviewOptions: { retainContextWhenHidden: false } }
      )
    );

    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    context.subscriptions.push(fileWatcher);
    context.subscriptions.push(
      fileWatcher.onDidChange(() => controller.invalidateIndexCache()),
      fileWatcher.onDidCreate(() => controller.invalidateIndexCache()),
      fileWatcher.onDidDelete(() => controller.invalidateIndexCache())
    );

    logger.debug('Klyr extension activated successfully');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Klyr] Activation failed: ${errorMsg}`);
    vscode.window.showErrorMessage(`Klyr activation failed: ${errorMsg}`);
  }
}

class KlyrExtensionController {
  private readonly extensionContext: vscode.ExtensionContext;
  private readonly logger = new Logger('info');
  private readonly memory = new InMemoryStore();
  private readonly contextOrchestrator = new ContextOrchestrator({
    modelTokenLimit: 8000,
    responseBuffer: 0.2,
    topKRetrieval: 10,
    maxChunkSize: 500,
    enableMemory: true,
  });
  private readonly state: WebviewState;
  private chatView?: vscode.WebviewView;
  private pendingPreview?: DiffPreview;
  private lastPrompt?: string;
  private lastPlan?: PlanResult;
  private selectedModelOverride?: string;
  private requestSerial = 0;
  private chatHistory: ChatHistoryEntry[];
  private workspaceIndexCache: { index: WorkspaceIndex; timestamp: number } | null = null;
  private readonly INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
  private lastUiUpdate = 0;
  private readonly UI_UPDATE_THROTTLE_MS = 50;
  private pendingUiSyncTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(extensionContext: vscode.ExtensionContext) {
    this.extensionContext = extensionContext;

    const restored = extensionContext.workspaceState.get<WebviewState | undefined>(SESSION_STATE_KEY);
    this.chatHistory = extensionContext.workspaceState.get<ChatHistoryEntry[]>(CHAT_HISTORY_STATE_KEY) ?? [];
    this.state = {
      messages: restored?.messages ?? [],
      status: 'idle',
      statusDetail: restored?.statusDetail ?? '',
      plan: restored?.plan,
      contextRefs: restored?.contextRefs ?? [],
      diffPreview: [],
    };

    const storedMemory = hydrateMemoryEntries(
      extensionContext.workspaceState.get<unknown>(MEMORY_STATE_KEY)
    );
    for (const entry of storedMemory) {
      void this.memory.add(entry);
    }
  }

  openChat(initialPrompt?: string, modeHint?: PlanMode): void {
    void this.revealChatPanel(initialPrompt, modeHint);
  }

  public launchChatFromSidebar(): void {
    void (async () => {
      await this.revealChatPanel();
      try {
        await vscode.commands.executeCommand('workbench.action.closeSidebar');
      } catch (error) {
        this.logger.debug(
          `Unable to close primary sidebar after launch: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })();
  }

  public attachChatView(webviewView: vscode.WebviewView): void {
    this.chatView = webviewView;

    webviewView.onDidDispose(() => {
      if (this.chatView === webviewView) {
        this.chatView = undefined;
      }
    });
  }

  public invalidateIndexCache(): void {
    this.workspaceIndexCache = null;
  }

  private async revealChatPanel(
    initialPrompt?: string,
    modeHint?: PlanMode
  ): Promise<void> {
    try {
      await this.ensureChatPanelOnRightSide();
      await vscode.commands.executeCommand('workbench.action.openView', 'klyr.chatView', true);
      await vscode.commands.executeCommand('workbench.action.focusPanel');
    } catch (error) {
      this.logger.warn(
        `Failed to reveal right-side Klyr chat view: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.syncWebview();

    if (initialPrompt) {
      await this.submitPrompt(initialPrompt, modeHint ?? 'edit');
    }
  }

  private async ensureChatPanelOnRightSide(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.positionPanelRight');
    } catch (error) {
      this.logger.debug(
        `Unable to move the panel to the right: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async runCurrentFileAction(action: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const filePath = editor?.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;
    const workspaceRoot = getWorkspaceRoot();

    if (!editor || !filePath || !workspaceRoot) {
      vscode.window.showInformationMessage('Open a workspace file before running a Klyr file action.');
      return;
    }

    const relativePath = toRelativePath(workspaceRoot, filePath);
    const selection =
      !editor.selection.isEmpty ? editor.document.getText(editor.selection).trim() : undefined;
    const prompt = selection
      ? `${action} the selected code in ${relativePath}.\n\nSelected code:\n${selection}`
      : `${action} ${relativePath}. Preserve behavior unless a bug fix requires a change.`;

    this.openChat(prompt, 'edit');
  }

  async provideInlineCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    _inlineContext: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList> {
    try {
      const config = this.getConfig();
      if (!config.inline.enabled || token.isCancellationRequested || document.uri.scheme !== 'file') {
        return new vscode.InlineCompletionList([]);
      }

      const fullText = document.getText();
      const offset = document.offsetAt(position);
      const prefix = fullText.slice(Math.max(0, offset - config.inline.maxPrefixChars), offset);
      const suffix = fullText.slice(
        offset,
        Math.min(fullText.length, offset + config.inline.maxSuffixChars)
      );

      if (prefix.trim().length < 12) {
        return new vscode.InlineCompletionList([]);
      }

      const runtime = await this.buildRuntimeContext();
      if (!runtime || token.isCancellationRequested) {
        return new vscode.InlineCompletionList([]);
      }

      const engine = new InMemoryContextEngine(
        new OllamaEmbeddingProvider(runtime.config.ollama.baseUrl)
      );
      await engine.index(runtime.documents);
      const matches = await engine.query({
        query: [document.uri.fsPath, prefix.slice(-400), suffix.slice(0, 160)].join('\n'),
        maxResults: 6,
      });
      const retrieved = dedupeContextRefs(matches.map((match) => match.document));
      const coder = this.createCoder(runtime.config);
      const memorySummary = formatMemoryForContext(this.memory.getEntries().slice(0, 6));

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
    } catch (error) {
      this.logger.warn('Inline completion failed', error);
      return new vscode.InlineCompletionList([]);
    }
  }

  public async handleWebviewMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }

    const typedMessage = message as {
      type: string;
      payload?: unknown;
      config?: Record<string, unknown>;
    };

    if (typedMessage.config && typeof typedMessage.config === 'object') {
      this.applyUiConfig(typedMessage.config);
    }

    if (typedMessage.type === 'chat:submit') {
      const payload = typedMessage.payload;
      const prompt =
        typeof payload === 'string'
          ? payload.trim()
          : payload && typeof payload === 'object' && 'prompt' in payload
            ? String((payload as { prompt?: unknown }).prompt ?? '').trim()
            : '';
      if (!prompt) {
        return;
      }

      const rawMode =
        payload && typeof payload === 'object' && 'modeHint' in payload
          ? String((payload as { modeHint?: unknown }).modeHint ?? '')
          : 'chat';
      const modeHint: PlanMode = rawMode === 'edit' || rawMode === 'inline' ? rawMode : 'chat';
      await this.submitPrompt(prompt, modeHint);
    }

    if (typedMessage.type === 'diff:decision') {
      const decision = String(typedMessage.payload ?? 'reject');
      await this.handleDiffDecision(decision === 'accept' ? 'accept' : 'reject');
    }

    if (typedMessage.type === 'diff:viewInEditor') {
      await this.viewDiffInEditor();
    }

    if (typedMessage.type === 'models:fetch') {
      this.syncWebview();
      await this.fetchAndSendModels();
    }

    if (typedMessage.type === 'config:update') {
      const config =
        typedMessage.payload && typeof typedMessage.payload === 'object'
          ? (typedMessage.payload as Record<string, unknown>)
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

  private async openChatHistory(): Promise<void> {
    if (this.chatHistory.length === 0) {
      vscode.window.showInformationMessage('No chat history yet.');
      return;
    }

    const action = await vscode.window.showQuickPick(
      [
        { label: 'Restore a chat', value: 'restore' as const },
        { label: 'Delete one history entry', value: 'deleteOne' as const },
        { label: 'Clear all history', value: 'clearAll' as const },
      ],
      {
        placeHolder: 'History actions',
      }
    );

    if (!action) {
      return;
    }

    if (action.value === 'clearAll') {
      const confirmed = await vscode.window.showWarningMessage(
        'Clear all saved chat history?',
        { modal: true },
        'Clear All'
      );
      if (confirmed !== 'Clear All') {
        return;
      }

      this.chatHistory = [];
      await this.extensionContext.workspaceState.update(CHAT_HISTORY_STATE_KEY, this.chatHistory);
      vscode.window.showInformationMessage('All chat history cleared.');
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

    if (action.value === 'deleteOne') {
      const toDelete = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose a chat history entry to delete',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (!toDelete) {
        return;
      }

      const confirmed = await vscode.window.showWarningMessage(
        `Delete history entry: "${toDelete.label}"?`,
        { modal: true },
        'Delete'
      );
      if (confirmed !== 'Delete') {
        return;
      }

      this.chatHistory = this.chatHistory.filter((entry) => entry.id !== toDelete.entry.id);
      await this.extensionContext.workspaceState.update(CHAT_HISTORY_STATE_KEY, this.chatHistory);
      vscode.window.showInformationMessage('History entry deleted.');
      return;
    }

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

  private async archiveCurrentChatIfNeeded(): Promise<void> {
    if (this.state.messages.length === 0) {
      return;
    }

    const snapshot: ChatHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      messages: this.state.messages.map((message) => ({ ...message })),
    };

    this.chatHistory = [snapshot, ...this.chatHistory].slice(0, 25);
    await this.extensionContext.workspaceState.update(CHAT_HISTORY_STATE_KEY, this.chatHistory);
  }

  private async stopActiveRequest(): Promise<void> {
    this.requestSerial += 1;
    this.pendingPreview = undefined;
    this.state.diffPreview = [];
    this.setStatus('idle', 'Stopped.');
    await this.persistState();
    this.syncWebview();
  }

  private async fetchAndSendModels(): Promise<void> {
    if (!this.hasAttachedWebviews()) {
      return;
    }

    try {
      const config = this.getConfig();
      const client = new HttpOllamaClient({
        baseUrl: config.ollama.baseUrl,
        timeoutMs: config.ollama.timeoutMs,
        maxRetries: config.ollama.maxRetries,
        retryBackoffMs: config.ollama.retryBackoffMs,
      });

      const response = await client.listModels();
      const models = response.models.map((m: any) => m.name);

      this.postToWebviews({
        type: 'models:list',
        payload: models,
      });
    } catch (error) {
      const config = this.getConfig();
      this.logger.warn(`Failed to fetch models: ${error instanceof Error ? error.message : String(error)}`);
      this.postToWebviews({
        type: 'models:list',
        payload: [config.ollama.model],
      });
    }
  }

  private async submitPrompt(prompt: string, modeHint: PlanMode): Promise<void> {
    const runtime = await this.buildRuntimeContext();
    if (!runtime) {
      this.appendMessage(
        'assistant',
        'Open a workspace folder so I can index files, retrieve context, and validate changes.'
      );
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
        .filter(
          (message): message is UiChatMessage & { role: 'user' | 'assistant' } =>
            message.role === 'user' || message.role === 'assistant'
        )
        .map((message) => ({ role: message.role, content: message.content }));

      const contextResponse = await this.contextOrchestrator.orchestrate({
        query: prompt,
        workspacePath: runtime.workspaceRoot,
        currentFilePath: runtime.activeFilePath,
        conversationHistory,
        includeMemory: true,
      });

      if (contextResponse.formattedContext.trim()) {
        const orchestratedDocument: ContextDocument = {
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
    } catch (error) {
      this.logger.warn(
        `Context orchestration failed, using baseline retrieval: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const pipeline = this.createPipeline();
    let streamingMessageId: string | undefined;
    const result = await pipeline.execute(
      {
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
      },
      {
        maxAttempts: runtime.config.execution.maxAttempts,
        retrievalMaxResults: runtime.config.context.retrievalMaxResults,
        allowNewFiles: true,
      },
      {
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
      }
    );

    if (requestId !== this.requestSerial) {
      return;
    }

    this.lastPlan = result.plan;
    this.state.plan = result.plan ? this.toUiPlan(result.plan) : undefined;
    this.state.contextRefs = this.toUiContextReferences(
      runtime.workspaceRoot,
      result.retrievedDocuments
    );

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
      this.state.diffPreview = result.preview.changes.map<UiDiffChange>((change) => ({
        path: change.path,
        diff: change.diff,
        diffHtml: change.diffHtml,
        summary: change.summary,
        operation: change.operation,
        additions: change.detailedDiff?.additions ?? 0,
        deletions: change.detailedDiff?.deletions ?? 0,
      }));
      this.state.totalAdditions = result.preview.totalAdditions;
      this.state.totalDeletions = result.preview.totalDeletions;

      const planSummary = result.plan ? `Plan: ${result.plan.summary}` : 'Plan ready.';
      const rationale = result.preview.rationale || result.preview.summary;
      const changesSummary = `Files: ${result.preview.changes.length} change(s) | +${result.preview.totalAdditions} -${result.preview.totalDeletions}`;
      
      this.appendMessage(
        'assistant',
        `${planSummary}\n\nReasoning: ${rationale}\n\n${changesSummary}\n\nReview the diff preview in the sidebar. Click "Apply Changes" to accept or "Reject Changes" to cancel.`
      );
      
      // ALWAYS show diff for review - never auto-apply
      this.setStatus('review', 'Review changes in sidebar, then apply or reject.');
      await this.persistState();
      this.syncWebview();
      return;
    }

    this.setStatus('idle', 'No output produced.');
    await this.persistState();
    this.syncWebview();
  }

  public async viewDiffInEditor(): Promise<void> {
    if (!this.pendingPreview) {
      vscode.window.showInformationMessage('No diff available to view.');
      return;
    }
    
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showInformationMessage('No workspace open.');
      return;
    }
    
    await this.openDiffInEditor(this.pendingPreview, workspaceRoot);
  }

  private async openDiffInEditor(preview: DiffPreview, workspaceRoot: string): Promise<void> {
    // Open VS Code's built-in diff viewer for each change
    const tempDir = path.join(workspaceRoot, '.klyr-temp');
    
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    for (const change of preview.changes) {
      if (change.operation === 'delete') {
        // For deletions, just show the file that will be deleted
        const filePath = vscode.Uri.file(path.join(workspaceRoot, change.path));
        await vscode.window.showTextDocument(filePath, { viewColumn: vscode.ViewColumn.One });
        continue;
      }

      // Create original file in temp (if it exists)
      if (change.originalContent && change.operation === 'update') {
        const originalPath = path.join(tempDir, `${path.basename(change.path)}.original`);
        await fs.writeFile(originalPath, change.originalContent, 'utf-8');
      }

      // Create proposed file in temp
      const proposedPath = path.join(tempDir, path.basename(change.path));
      await fs.writeFile(proposedPath, change.proposedContent, 'utf-8');

      // Open VS Code diff viewer
      const originalUri = vscode.Uri.file(
        change.originalContent && change.operation === 'update' 
          ? path.join(tempDir, `${path.basename(change.path)}.original`)
          : proposedPath
      );
      const modifiedUri = vscode.Uri.file(proposedPath);

      const doc = await vscode.window.showTextDocument(
        change.originalContent && change.operation === 'update' ? originalUri : modifiedUri,
        { viewColumn: vscode.ViewColumn.One }
      );

      // If it's an update (has original), open diff
      if (change.originalContent && change.operation === 'update') {
        await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, 
          `${change.path} - Klyr Changes`,
          { viewColumn: vscode.ViewColumn.Two }
        );
      }
    }
  }

  private async handleDiffDecision(decision: 'accept' | 'reject'): Promise<void> {
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
      this.appendMessage(
        'assistant',
        'Safety rewrite: converted destructive draft into add-only insertion to preserve existing file content.'
      );
      this.syncWebview();
    }

    if (preview.changes.length === 0) {
      const recoveredPreview = await this.buildNoopAdditiveRecoveryPreview(workspaceRoot, preview);
      if (recoveredPreview) {
        preview = recoveredPreview;
        this.appendMessage(
          'assistant',
          'Recovery path: generated a deterministic add-only patch from your prompt because the model draft resolved to a no-op.'
        );
        this.syncWebview();
      } else {
        // No changes and couldn't recover - show error message
        const errorMessage = preview.rationale 
          ? `The AI did not generate code changes: ${preview.rationale.slice(0, 200)}`
          : 'The AI did not generate any code changes. Please try being more specific about what you want changed.';
        
        this.appendMessage('assistant', errorMessage);
        this.appendMessage('assistant', 'Tips: \n• Be specific about what to change\n• Mention the exact file name\n• Describe the exact change (e.g., "add error handling to line 5")');
        this.setStatus('idle', 'No changes generated');
        await this.persistState();
        this.syncWebview();
        return;
      }
    }

    this.setStatus('executing', 'Applying validated changes to the workspace.');
    this.syncWebview();

    const backupPaths: string[] = [];
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

    const applyResult: ApplyResult = {
      applied: 0,
      rejected: 0,
      changedPaths: [],
      errors: [],
    };

    for (let index = 0; index < preview.changes.length; index += 1) {
      const change = preview.changes[index];
      this.setStatus(
        'executing',
        `Applying ${change.operation}: ${change.path} (${index + 1}/${preview.changes.length})`
      );
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
      const restoreInfo =
        backupPaths.length > 0 ? `\n\nBackups saved at: ${backupPaths.join(', ')}` : '';
      this.appendMessage(
        'assistant',
        `Applied ${applyResult.applied} file(s) with ${applyResult.errors.length} error(s):\n${details}${restoreInfo}`
      );
      await this.recordDecisionMemory('error', applyResult.changedPaths);
    } else if (applyResult.applied === 0) {
      this.appendMessage(
        'assistant',
        'No file changes were applied. The requested content may already exist, or the generated draft resolved to a no-op.'
      );
      await this.cleanupBackups(workspaceRoot);
      await this.recordDecisionMemory('success', []);
    } else {
      this.appendMessage(
        'assistant',
        `Applied ${applyResult.applied} change(s) successfully.\n\nFiles: ${applyResult.changedPaths.join(', ')}`
      );
      await this.cleanupBackups(workspaceRoot);
      await this.recordDecisionMemory('success', applyResult.changedPaths);
    }

    this.setStatus('idle', 'Execution finished.');
    await this.persistState();
    this.syncWebview();
  }

  private async recordDecisionMemory(
    result: 'success' | 'error' | 'rejected',
    changedPaths: string[]
  ): Promise<void> {
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
      summary:
        result === 'rejected'
          ? 'User rejected the proposed diff.'
          : changedPaths.length > 0
            ? `Changed ${changedPaths.join(', ')}`
            : 'Execution completed.',
      changes: changedPaths,
    });
    await this.persistState();
  }

  private createPipeline(): Pipeline {
    const config = this.getConfig();
    const ollamaClient = new HttpOllamaClient({
      baseUrl: config.ollama.baseUrl,
      timeoutMs: config.ollama.timeoutMs,
      maxRetries: config.ollama.maxRetries,
    });
    
    // Use LLM-powered planner for better intent classification
    const planner = new LLMPoweredPlanner(ollamaClient, config.ollama.model);
    
    return new Pipeline(
      planner,
      this.createCoder(config),
      new BasicValidator(),
      new FileSystemExecutor(),
      new InMemoryContextEngine(new OllamaEmbeddingProvider(config.ollama.baseUrl)),
      this.memory,
      this.logger
    );
  }

  private createCoder(config: KlyrConfig): OllamaCoder {
    return new OllamaCoder({
      client: new HttpOllamaClient(config.ollama),
      model: config.ollama.model,
      temperature: config.ollama.temperature,
    });
  }

  private async buildRuntimeContext(): Promise<RuntimeContext | undefined> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return undefined;
    }

    const config = this.getConfig();
    let workspaceIndex: WorkspaceIndex;
    if (
      this.workspaceIndexCache &&
      Date.now() - this.workspaceIndexCache.timestamp < this.INDEX_CACHE_TTL_MS
    ) {
      workspaceIndex = this.workspaceIndexCache.index;
    } else {
      workspaceIndex = await indexWorkspace(workspaceRoot);
      this.workspaceIndexCache = {
        index: workspaceIndex,
        timestamp: Date.now(),
      };
    }
    const activeEditor = vscode.window.activeTextEditor;
    const activeFilePath =
      activeEditor?.document.uri.scheme === 'file' ? activeEditor.document.uri.fsPath : undefined;
    const selection =
      activeEditor && !activeEditor.selection.isEmpty
        ? activeEditor.document.getText(activeEditor.selection).slice(0, 4000)
        : undefined;
    const openFiles = vscode.workspace.textDocuments
      .filter((document) => document.uri.scheme === 'file' && !document.isUntitled)
      .map((document) => document.uri.fsPath);

    const fileDocs = await readWorkspaceDocuments(workspaceIndex, {
      maxFiles: config.context.maxFiles,
      maxFileSize: config.context.maxFileSize,
      maxTotalSize: config.context.maxTotalSize,
      priorityPaths: activeFilePath ? [activeFilePath, ...openFiles] : openFiles,
    });

    const mergedDocuments = new Map<string, ContextDocument>();
    for (const document of fileDocs) {
      for (const chunk of chunkContextDocument(document)) {
        mergedDocuments.set(chunk.id, chunk);
      }
    }

    for (const document of vscode.workspace.textDocuments) {
      if (document.uri.scheme !== 'file' || document.isUntitled) {
        continue;
      }

      const source = document.uri.fsPath === activeFilePath ? 'active' : 'open';
      const baseDoc: ContextDocument = {
        id: document.uri.fsPath,
        uri: document.uri.fsPath,
        title: toRelativePath(workspaceRoot, document.uri.fsPath),
        content: document.getText(),
        updatedAt: Date.now(),
        source,
        tags: toRelativePath(workspaceRoot, document.uri.fsPath).split('/'),
      };

      for (const chunk of chunkContextDocument(baseDoc)) {
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
      workspaceSummary: buildWorkspaceOutline(workspaceIndex, 70),
      dependencyAllowlist: summarizeDependencies(workspaceIndex),
      documents: [...mergedDocuments.values()],
      config,
      workspaceIndex,
    };
  }

  private toUiPlan(plan: PlanResult): UiPlan {
    return {
      intent: plan.intent,
      goal: plan.goal,
      summary: plan.summary,
      steps: plan.steps.map((step) => `${step.title}: ${step.description}`),
      requiresWrite: plan.requiresWrite,
      guardrails: plan.guardrails,
    };
  }

  private toUiContextReferences(
    workspaceRoot: string,
    documents: ContextDocument[]
  ): UiContextReference[] {
    const seen = new Set<string>();
    const references: UiContextReference[] = [];

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

  private appendMessage(role: UiChatMessage['role'], content: string): string {
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

  private appendStreamingChunk(messageId: string | undefined, chunk: string): string {
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

  private trimMessages(): void {
    const maxMessages = 60;
    if (this.state.messages.length > maxMessages) {
      this.state.messages.splice(0, this.state.messages.length - maxMessages);
    }
  }

  private setStatus(status: UiStatus, detail = ''): void {
    this.state.status = status;
    this.state.statusDetail = detail;
  }

  private syncWebview(): void {
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

  private hasAttachedWebviews(): boolean {
    return Boolean(this.chatView);
  }

  private postToWebviews(message: unknown): void {
    if (this.chatView) {
      void this.chatView.webview.postMessage(message);
    }
  }

  private applyUiConfig(config: Record<string, unknown>): void {
    if (typeof config.selectedModel === 'string' && config.selectedModel.trim()) {
      this.selectedModelOverride = config.selectedModel.trim();
    }
  }

  private async clearChatState(): Promise<void> {
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

  private async applySingleChange(
    change: DiffPreview['changes'][number],
    workspaceRoot: string
  ): Promise<ApplyResult> {
    const executor = new FileSystemExecutor();
    return executor.apply(
      {
        summary: `Apply ${change.path}`,
        rationale: 'single change apply',
        changes: [change],
        totalAdditions: 0,
        totalDeletions: 0,
      },
      'accept',
      workspaceRoot
    );
  }

  private async backupFile(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const backupPath = `${filePath}.klyr.backup.${Date.now()}`;
      await fs.writeFile(backupPath, content, 'utf-8');
      return backupPath;
    } catch {
      return null;
    }
  }

  private async cleanupBackups(workspaceRoot: string): Promise<void> {
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
    } catch {
      // Ignore cleanup errors.
    }
  }

  private shouldAutoApplyPreview(preview: DiffPreview): boolean {
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

  private isAddOnlyPrompt(prompt: string): boolean {
    const normalized = prompt.toLowerCase();
    const addIntent = /\b(add|append|insert|include|put)\b/.test(normalized);
    const hasNegatedDestructive =
      /\b(don't|dont|do not|never)\s+(delete|remove)\b/.test(normalized) ||
      /\bwithout\s+(deleting|removing)\b/.test(normalized);
    const destructiveIntent =
      /\b(delete|remove|replace|rewrite|refactor|cleanup|format|restructure)\b/.test(normalized) &&
      !hasNegatedDestructive;
    return addIntent && !destructiveIntent;
  }

  private buildSafeAdditivePreview(preview: DiffPreview): DiffPreview | undefined {
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

    const safeChanges = preview.changes.reduce<DiffPreview['changes']>((accumulator, change) => {
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

  private async buildNoopAdditiveRecoveryPreview(
    workspaceRoot: string,
    originalPreview: DiffPreview
  ): Promise<DiffPreview | undefined> {
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

    const recoveryChanges: Array<{
      path: string;
      summary: string;
      diff: string;
      proposedContent: string;
      operation: 'create' | 'update' | 'delete';
    }> = [];

    for (const targetPath of targetPaths) {
      const absolutePath = path.resolve(workspaceRoot, targetPath);
      if (!this.isWithinWorkspace(absolutePath, workspaceRoot)) {
        continue;
      }

      let originalContent = '';
      try {
        originalContent = await fs.readFile(absolutePath, 'utf-8');
      } catch {
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

    const executor = new FileSystemExecutor();
    return executor.preview(
      {
        summary: originalPreview.summary || 'Recovered add-only patch',
        rationale: `${originalPreview.rationale} | No-op recovery used prompt-derived insertion.`,
        changes: recoveryChanges,
      },
      workspaceRoot
    );
  }

  private extractInsertionMode(prompt: string): 'top' | 'bottom' | 'any' {
    const normalized = prompt.toLowerCase();
    if (/\b(top|beginning|start|first line|very top)\b/.test(normalized)) {
      return 'top';
    }
    if (/\b(bottom|end|last line|append)\b/.test(normalized)) {
      return 'bottom';
    }
    return 'any';
  }

  private isLiteralAlreadyPresent(
    baseContent: string,
    literal: string,
    mode: 'top' | 'bottom' | 'any'
  ): boolean {
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

  private insertLiteral(baseContent: string, literal: string, mode: 'top' | 'bottom' | 'any'): string {
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

  private isWithinWorkspace(candidatePath: string, workspaceRoot: string): boolean {
    const normalizedRoot = path.resolve(workspaceRoot);
    const normalizedCandidate = path.resolve(candidatePath);

    return (
      normalizedCandidate === normalizedRoot ||
      normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
    );
  }

  private extractMentionedPaths(prompt: string): string[] {
    const matches = prompt.match(/(?:[A-Za-z]:[\\/])?[A-Za-z0-9_./\\-]+\.[A-Za-z0-9_-]+/g) ?? [];
    const normalized = matches
      .map((match) => match.replace(/^["'`]|["'`]$/g, '').replace(/\\/g, '/').toLowerCase())
      .map((value) => value.replace(/^\.[/]/, '').replace(/^[/]/, ''))
      .filter((value) => value.length > 0);

    return [...new Set(normalized)];
  }

  private extractRequestedLiteral(prompt: string): string | undefined {
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

  private previewHasDeletions(preview: DiffPreview): boolean {
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

  private async persistState(): Promise<void> {
    await this.extensionContext.workspaceState.update(SESSION_STATE_KEY, {
      ...this.state,
      status: 'idle',
      diffPreview: [],
    });
    await this.extensionContext.workspaceState.update(MEMORY_STATE_KEY, this.memory.getEntries());
  }

  private getConfig(): KlyrConfig {
    const defaults = defaultConfig();
    const config = vscode.workspace.getConfiguration('klyr');

    return {
      ...defaults,
      ollama: {
        ...defaults.ollama,
        baseUrl: config.get<string>('ollama.baseUrl', defaults.ollama.baseUrl),
        model:
          this.selectedModelOverride ??
          config.get<string>('ollama.model', defaults.ollama.model),
        temperature: config.get<number>('ollama.temperature', defaults.ollama.temperature),
        timeoutMs: config.get<number>('ollama.timeoutMs', defaults.ollama.timeoutMs),
        maxRetries: config.get<number>('ollama.maxRetries', defaults.ollama.maxRetries),
        retryBackoffMs: config.get<number>(
          'ollama.retryBackoffMs',
          defaults.ollama.retryBackoffMs
        ),
      },
      context: {
        ...defaults.context,
        maxFiles: config.get<number>('context.maxFiles', defaults.context.maxFiles),
        maxFileSize: config.get<number>('context.maxFileSize', defaults.context.maxFileSize),
        maxTotalSize: config.get<number>('context.maxTotalSize', defaults.context.maxTotalSize),
        retrievalMaxResults: config.get<number>(
          'context.retrievalMaxResults',
          defaults.context.retrievalMaxResults
        ),
        retrievalMinScore: config.get<number>(
          'context.retrievalMinScore',
          defaults.context.retrievalMinScore
        ),
      },
      execution: {
        ...defaults.execution,
        maxAttempts: config.get<number>('execution.maxAttempts', defaults.execution.maxAttempts),
        noOp: config.get<boolean>('execution.noOp', defaults.execution.noOp),
      },
      inline: {
        ...defaults.inline,
        enabled: config.get<boolean>('inline.enabled', defaults.inline.enabled),
        maxPrefixChars: config.get<number>(
          'inline.maxPrefixChars',
          defaults.inline.maxPrefixChars
        ),
        maxSuffixChars: config.get<number>(
          'inline.maxSuffixChars',
          defaults.inline.maxSuffixChars
        ),
      },
    };
  }
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return absolutePath.startsWith(workspaceRoot)
    ? absolutePath.slice(workspaceRoot.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
    : absolutePath.replace(/\\/g, '/');
}

function allowNewFilesForPrompt(prompt: string): boolean {
  return /(create|add|new file|test|spec|feature|component)/i.test(prompt);
}

function mapPipelineStageToUiStatus(stage: PipelineStage): UiStatus {
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

function dedupeContextRefs(documents: ContextDocument[]): ContextDocument[] {
  const seen = new Set<string>();
  const output: ContextDocument[] = [];

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

export function deactivate() {}
