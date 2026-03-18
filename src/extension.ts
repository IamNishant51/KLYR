import * as vscode from 'vscode';
import { BasicPlanner, type PlanMode, type PlanResult } from './agent/planner';
import { FileSystemExecutor, type DiffPreview } from './agent/executor';
import { BasicValidator } from './agent/validator';
import { OllamaCoder } from './agent/ollamaCoder';
import {
  InMemoryContextEngine,
  chunkContextDocument,
  type ContextDocument,
} from './context/contextEngine';
import { NaiveEmbeddingProvider } from './context/embeddings';
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
import {
  buildWebviewHtml,
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
      this.controller.attachSidebarView(webviewView);

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
      )
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
  private panel?: vscode.WebviewPanel;
  private sidebarView?: vscode.WebviewView;
  private pendingPreview?: DiffPreview;
  private lastPrompt?: string;
  private lastPlan?: PlanResult;
  private selectedModelOverride?: string;
  private requestSerial = 0;

  constructor(extensionContext: vscode.ExtensionContext) {
    this.extensionContext = extensionContext;

    const restored = extensionContext.workspaceState.get<WebviewState | undefined>(SESSION_STATE_KEY);
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
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'klyr.chat',
        'Klyr',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.file(this.extensionContext.extensionPath)],
        }
      );

      const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      
      // Try to load React webview, fall back to simple HTML if not available
      let html: string;
      try {
        const fs = require('fs');
        const path = require('path');
        const indexPath = this.extensionContext.asAbsolutePath('dist/webview/index.html');
        
        // Check if file exists
        if (fs.existsSync(indexPath)) {
          html = fs.readFileSync(indexPath, 'utf-8');
          
          // Fix paths for webview resources
          const webviewUri = this.panel.webview.asWebviewUri(vscode.Uri.file(
            this.extensionContext.asAbsolutePath('dist/webview')
          ));
          
          // Replace relative paths with webview URIs (use global replace to catch all instances)
          html = html.replace(/src="\/([^"]*)"/g, `src="${webviewUri}/$1"`);
          html = html.replace(/href="\/([^"]*)"/g, `href="${webviewUri}/$1"`);
          
        } else {
          throw new Error('dist/webview/index.html not found');
        }
      } catch (e) {
        // Fallback to simple HTML if React build not available
        this.logger.warn(`Failed to load React webview: ${e instanceof Error ? e.message : String(e)}, using fallback`);
        html = buildWebviewHtml(nonce, this.state);
      }

      this.panel.webview.html = html;
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

  public attachSidebarView(webviewView: vscode.WebviewView): void {
    this.sidebarView = webviewView;
    webviewView.onDidDispose(() => {
      if (this.sidebarView === webviewView) {
        this.sidebarView = undefined;
      }
    });
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

      const engine = new InMemoryContextEngine(new NaiveEmbeddingProvider());
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
        documents: runtime.documents,
        logger: this.logger,
      },
      {
        maxAttempts: runtime.config.execution.maxAttempts,
        retrievalMaxResults: runtime.config.context.retrievalMaxResults,
        allowNewFiles: allowNewFilesForPrompt(prompt),
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
        summary: change.summary,
        operation: change.operation,
      }));

      const planSummary = result.plan ? `Plan: ${result.plan.summary}` : 'Plan ready.';
      const rationale = result.preview.rationale || result.preview.summary;
      this.appendMessage(
        'assistant',
        `${planSummary}\n\nReasoning: ${rationale}\n\nReview the diff preview before applying changes.`
      );
      this.setStatus('review', 'Validated diff ready for approval.');
      await this.persistState();
      this.syncWebview();
      return;
    }

    this.setStatus('idle', 'No output produced.');
    await this.persistState();
    this.syncWebview();
  }

  private async handleDiffDecision(decision: 'accept' | 'reject'): Promise<void> {
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

    const executor = new FileSystemExecutor();
    const applyResult = await executor.apply(preview, 'accept', workspaceRoot);

    if (applyResult.errors.length > 0) {
      const details = applyResult.errors.map((error) => `${error.path}: ${error.message}`).join('\n');
      this.appendMessage(
        'assistant',
        `Applied ${applyResult.applied} file(s) with ${applyResult.errors.length} error(s):\n${details}`
      );
      await this.recordDecisionMemory('error', applyResult.changedPaths);
    } else {
      this.appendMessage(
        'assistant',
        `Applied ${applyResult.applied} change(s) successfully.\n\nFiles: ${applyResult.changedPaths.join(', ')}`
      );
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
    return new Pipeline(
      new BasicPlanner(),
      this.createCoder(this.getConfig()),
      new BasicValidator(),
      new FileSystemExecutor(),
      new InMemoryContextEngine(new NaiveEmbeddingProvider()),
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
    const workspaceIndex = await indexWorkspace(workspaceRoot);
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
    this.postToWebviews({
      type: 'state:update',
      payload: this.state,
    });
  }

  private hasAttachedWebviews(): boolean {
    return Boolean(this.panel || this.sidebarView);
  }

  private postToWebviews(message: unknown): void {
    if (this.panel) {
      void this.panel.webview.postMessage(message);
    }

    if (this.sidebarView) {
      void this.sidebarView.webview.postMessage(message);
    }
  }

  private applyUiConfig(config: Record<string, unknown>): void {
    if (typeof config.selectedModel === 'string' && config.selectedModel.trim()) {
      this.selectedModelOverride = config.selectedModel.trim();
    }
  }

  private async clearChatState(): Promise<void> {
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
