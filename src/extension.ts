import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { BasicPlanner, LLMPoweredPlanner, type PlanMode, type PlanResult } from './agent/planner';
import { FileSystemExecutor, type DiffPreview } from './agent/executor';
import { BasicValidator } from './agent/validator';
import { OllamaCoder } from './agent/ollamaCoder';
import { CommandExecutor, type CommandResult } from './agent/commandExecutor';
import type { CodeDraft, DraftFileChange } from './agent/coder';
import {
  InMemoryContextEngine,
  chunkContextDocument,
  type ContextDocument,
} from './context/contextEngine';
import { OllamaEmbeddingProvider } from './context/embeddings';
import { PersistentEmbeddingCacheProvider } from './context/persistentEmbeddingCache';
import { formatMemoryForContext, hydrateMemoryEntries, InMemoryStore } from './context/memory';
import {
  buildWorkspaceOutline,
  indexWorkspace,
  readWorkspaceDocuments,
  summarizeDependencies,
  type WorkspaceIndex,
} from './context/workspaceIndex';
import { ContextOrchestrator, type ContextRequest } from './context/orchestrator';
import { GroundedRagService } from './context/groundedRag';
import { McpManager } from './mcp/manager';
import { HttpOllamaClient } from './llm/ollamaClient';
import { defaultConfig, Logger, type KlyrConfig } from './core/config';
import { Pipeline, type PipelineResult, type PipelineStage } from './core/pipeline';
import type { ApplyResult } from './agent/executor';
import {
  type UiChatMessage,
  type UiContextReference,
  type UiDiffChange,
  type UiPlan,
  type UiStatus,
  type WebviewState,
} from './ui/webview';

interface ParsedError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

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

interface ExternalKnowledge {
  title: string;
  content: string;
  source: 'internet' | 'wikipedia';
}

interface ChatImageAttachment {
  id?: string;
  dataUrl: string;
  mimeType?: string;
  name?: string;
}

interface CommandPlan {
  summary: string;
  commands: string[];
}

interface CommandExecutionResult {
  command: string;
  ok: boolean;
  exitCode: number;
  output: string;
}

const SESSION_STATE_KEY = 'klyr.chatSession';
const MEMORY_STATE_KEY = 'klyr.memoryEntries';
const CHAT_HISTORY_STATE_KEY = 'klyr.chatHistory';
const OLLAMA_AUTOSTART_ATTEMPTED_KEY = 'klyr.ollamaAutostartAttempted';

interface ChatHistoryEntry {
  id: string;
  createdAt: number;
  messages: UiChatMessage[];
}

// Track recently modified lines for visual diff decorations
interface FileChangeInfo {
  addedLines: number[];
  removedLines: number[];
  timestamp: number;
}

interface StagedEdit {
  path: string;
  uri: vscode.Uri;
  originalContent: string;
  proposedContent: string;
}

const fileChangeDecorations = new Map<string, FileChangeInfo>();

// Create decoration types for added and removed lines
const addedLineDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(76, 175, 80, 0.2)', // Light green
  light: { backgroundColor: 'rgba(76, 175, 80, 0.15)' },
  dark: { backgroundColor: 'rgba(76, 175, 80, 0.25)' },
  isWholeLine: true,
});

const removedLineDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(244, 67, 54, 0.2)', // Light red
  light: { backgroundColor: 'rgba(244, 67, 54, 0.15)' },
  dark: { backgroundColor: 'rgba(244, 67, 54, 0.25)' },
  isWholeLine: true,
});

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

// Helper function to normalize paths for consistent comparison
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').toLowerCase();
}

// Helper function to apply decorations to an editor
function applyDecorationsForEditor(editor: vscode.TextEditor): void {
  const fsPath = normalizePath(editor.document.uri.fsPath);
  
  // Try all keys in the map to find a match
  let changeInfo: FileChangeInfo | undefined;
  for (const [storedPath, info] of fileChangeDecorations.entries()) {
    if (normalizePath(storedPath) === fsPath) {
      changeInfo = info;
      break;
    }
  }

  if (!changeInfo) {
    // Clear any existing decorations if no change info
    editor.setDecorations(addedLineDecoration, []);
    editor.setDecorations(removedLineDecoration, []);
    return;
  }

  console.log(`[Klyr] Applying decorations to ${editor.document.fileName}`);
  console.log(`[Klyr] Added lines: ${changeInfo.addedLines.join(', ')}`);
  console.log(`[Klyr] Removed lines: ${changeInfo.removedLines.join(', ')}`);

  // Create decoration ranges for added and removed lines
  const addedRanges = changeInfo.addedLines.map(
    (lineNum) => new vscode.Range(lineNum, 0, lineNum, Number.MAX_SAFE_INTEGER)
  );
  const removedRanges = changeInfo.removedLines.map(
    (lineNum) => new vscode.Range(lineNum, 0, lineNum, Number.MAX_SAFE_INTEGER)
  );

  editor.setDecorations(addedLineDecoration, addedRanges);
  editor.setDecorations(removedLineDecoration, removedRanges);
}

// Helper function to clear decorations for a file
function clearDecorationsForUri(fsPath: string): void {
  const normalized = normalizePath(fsPath);
  
  // Remove all keys that match
  for (const key of fileChangeDecorations.keys()) {
    if (normalizePath(key) === normalized) {
      fileChangeDecorations.delete(key);
    }
  }
  
  // Clear decorations from all visible editors showing this file
  for (const editor of vscode.window.visibleTextEditors) {
    if (normalizePath(editor.document.uri.fsPath) === normalized) {
      editor.setDecorations(addedLineDecoration, []);
      editor.setDecorations(removedLineDecoration, []);
    }
  }
}

function clearAllDecorations(): void {
  fileChangeDecorations.clear();
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(addedLineDecoration, []);
    editor.setDecorations(removedLineDecoration, []);
  }
}

// Helper function to calculate line ranges from content changes
function calculateLineRanges(
  beforeContent: string,
  afterContent: string
): { addedLines: number[]; removedLines: number[] } {
  const beforeLines = beforeContent.split('\n');
  const afterLines = afterContent.split('\n');
  
  const addedLines: Set<number> = new Set();
  const removedLines: Set<number> = new Set();
  
  // Use a simple diff algorithm to find changed lines
  let beforeIdx = 0;
  let afterIdx = 0;
  
  while (beforeIdx < beforeLines.length || afterIdx < afterLines.length) {
    // Get current lines (or empty string if beyond array bounds)
    const beforeLine = beforeIdx < beforeLines.length ? beforeLines[beforeIdx] : null;
    const afterLine = afterIdx < afterLines.length ? afterLines[afterIdx] : null;
    
    // If lines match, move both pointers forward
    if (beforeLine !== null && afterLine !== null && beforeLine === afterLine) {
      beforeIdx++;
      afterIdx++;
    }
    // If before is null, remaining after lines are added
    else if (beforeLine === null) {
      addedLines.add(afterIdx);
      afterIdx++;
    }
    // If after is null, remaining before lines are removed
    else if (afterLine === null) {
      removedLines.add(beforeIdx);
      beforeIdx++;
    }
    // Lines differ - check if it's a modification or different sections
    else {
      // Look ahead to find matching lines
      let beforeMatch = -1;
      let afterMatch = -1;
      
      // Find where before line appears in after
      for (let i = afterIdx + 1; i < Math.min(afterIdx + 5, afterLines.length); i++) {
        if (afterLines[i] === beforeLine) {
          afterMatch = i;
          break;
        }
      }
      
      // Find where after line appears in before
      for (let i = beforeIdx + 1; i < Math.min(beforeIdx + 5, beforeLines.length); i++) {
        if (beforeLines[i] === afterLine) {
          beforeMatch = i;
          break;
        }
      }
      
      // If we found matches, mark intermediate lines as added/removed
      if (afterMatch !== -1 && beforeMatch === -1) {
        // Lines were inserted in after
        for (let i = afterIdx; i < afterMatch; i++) {
          addedLines.add(i);
        }
        beforeIdx++;
        afterIdx = afterMatch;
      } else if (beforeMatch !== -1 && afterMatch === -1) {
        // Lines were removed from before
        for (let i = beforeIdx; i < beforeMatch; i++) {
          removedLines.add(i);
        }
        beforeIdx = beforeMatch;
        afterIdx++;
      } else {
        // Just mark as modified
        addedLines.add(afterIdx);
        beforeIdx++;
        afterIdx++;
      }
    }
  }
  
  console.log(`[Klyr] calculateLineRanges: before=${beforeLines.length} lines, after=${afterLines.length} lines`);
  console.log(`[Klyr] Added: ${Array.from(addedLines).join(', ') || 'none'}`);
  console.log(`[Klyr] Removed: ${Array.from(removedLines).join(', ') || 'none'}`);
  
  return { 
    addedLines: Array.from(addedLines), 
    removedLines: Array.from(removedLines) 
  };
}

export function activate(context: vscode.ExtensionContext) {
  try {
    const controller = new KlyrExtensionController(context);
    const logger = new Logger('info');

    logger.debug('Klyr extension activating...');
    void controller.ensureOllamaServerStartedOnFirstLaunch();

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

    // Register listeners for diff decorations
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          applyDecorationsForEditor(editor);
        }
      })
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
  private readonly mcpManager = new McpManager(this.logger);
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
  private pendingDraft?: CodeDraft;
  private pendingCommands: Array<{ command: string; allowFailure?: boolean }> = [];
  private stagedEdits = new Map<string, StagedEdit>();
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

  private normalizeRelativePathForKey(relativePath: string): string {
    return relativePath.replace(/\\/g, '/').toLowerCase();
  }

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

  public ensureOllamaServerStartedOnFirstLaunch(): void {
    void this.autoStartOllamaServerOnFirstLaunch();
  }

  private async autoStartOllamaServerOnFirstLaunch(): Promise<void> {
    const alreadyAttempted = this.extensionContext.globalState.get<boolean>(
      OLLAMA_AUTOSTART_ATTEMPTED_KEY,
      false
    );
    if (alreadyAttempted) {
      return;
    }

    const config = this.getConfig();
    if (!this.isLocalOllamaBaseUrl(config.ollama.baseUrl)) {
      await this.extensionContext.globalState.update(OLLAMA_AUTOSTART_ATTEMPTED_KEY, true);
      return;
    }

    const alreadyReachable = await this.isOllamaReachable(config.ollama.baseUrl);
    if (alreadyReachable) {
      await this.extensionContext.globalState.update(OLLAMA_AUTOSTART_ATTEMPTED_KEY, true);
      return;
    }

    try {
      const child = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });

      child.unref();
      child.once('error', (error) => {
        this.logger.warn(
          `Failed to auto-start Ollama server: ${error instanceof Error ? error.message : String(error)}`
        );
      });

      await this.extensionContext.globalState.update(OLLAMA_AUTOSTART_ATTEMPTED_KEY, true);
      this.logger.info('Attempted to auto-start Ollama server on first launch.');
    } catch (error) {
      this.logger.warn(
        `Error while auto-starting Ollama server: ${error instanceof Error ? error.message : String(error)}`
      );
      await this.extensionContext.globalState.update(OLLAMA_AUTOSTART_ATTEMPTED_KEY, true);
    }
  }

  private isLocalOllamaBaseUrl(baseUrl: string): boolean {
    try {
      const parsed = new URL(baseUrl);
      const host = parsed.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
    } catch {
      return false;
    }
  }

  private async isOllamaReachable(baseUrl: string): Promise<boolean> {
    const client = new HttpOllamaClient({
      baseUrl,
      timeoutMs: 1500,
      maxRetries: 0,
      retryBackoffMs: 0,
    });

    try {
      await client.listModels();
      return true;
    } catch {
      return false;
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
      const images =
        payload && typeof payload === 'object' && 'images' in payload
          ? this.parseImageAttachments((payload as { images?: unknown }).images)
          : [];

      if (!prompt && images.length === 0) {
        return;
      }

      const rawMode =
        payload && typeof payload === 'object' && 'modeHint' in payload
          ? String((payload as { modeHint?: unknown }).modeHint ?? '')
          : 'chat';
      const modeHint: PlanMode = rawMode === 'edit' || rawMode === 'inline' ? rawMode : 'chat';
      await this.submitPrompt(prompt, modeHint, images);
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
    await this.discardStagedEdits();
    this.pendingPreview = undefined;
      this.pendingDraft = undefined;
      this.pendingCommands = [];
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

  private async submitPrompt(
    prompt: string,
    modeHint: PlanMode,
    images: ChatImageAttachment[] = []
  ): Promise<void> {
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
      this.pendingDraft = undefined;
      this.pendingCommands = [];
    this.state.diffPreview = [];
    const userPrompt = prompt.trim() || 'Analyze the attached image and help with this issue.';
    const promptWithAttachmentHint =
      images.length > 0
        ? `${userPrompt}\n\n[Attached image${images.length === 1 ? '' : 's'}: ${images.length}]`
        : userPrompt;

    this.appendMessage('user', promptWithAttachmentHint);
    this.lastPrompt = userPrompt;
    this.lastPlan = undefined;
    this.setStatus('planning', 'Preparing plan from current workspace context.');
    this.syncWebview();

    const commandHandled = await this.tryExecutePromptCommands(runtime, userPrompt, requestId);
    if (commandHandled) {
      await this.persistState();
      this.syncWebview();
      return;
    }

    let documentsForPipeline = runtime.documents;
    try {
      if (images.length > 0) {
        this.setStatus('retrieving', 'Analyzing pasted image attachments with vision model.');
        this.syncWebview();
        const visionDoc = await this.buildImageAnalysisDocument(userPrompt, images, runtime.config);
        if (visionDoc) {
          documentsForPipeline = [visionDoc, ...documentsForPipeline];
        }
      }

      this.setStatus('retrieving', 'Building optimized context from workspace and conversation.');
      this.syncWebview();
      const conversationHistory = this.state.messages
        .filter(
          (message): message is UiChatMessage & { role: 'user' | 'assistant' } =>
            message.role === 'user' || message.role === 'assistant'
        )
        .map((message) => ({ role: message.role, content: message.content }));

      const contextResponse = await this.contextOrchestrator.orchestrate({
        query: userPrompt,
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

      const persistentEmbeddings = new PersistentEmbeddingCacheProvider(
        new OllamaEmbeddingProvider(runtime.config.ollama.baseUrl),
        path.join(this.extensionContext.globalStorageUri.fsPath, 'rag-embedding-cache.json')
      );

      const ragService = new GroundedRagService(
        persistentEmbeddings,
        {
          trustedDomains: runtime.config.rag.trustedDomains,
          trustedGitHubOrgs: runtime.config.rag.trustedGitHubOrgs,
        },
        this.logger
      );
      const ragResult = await ragService.retrieve(userPrompt);
      if (ragResult.documents.length > 0) {
        const groundingPolicy = this.createGroundingPolicyDocument(ragResult.references);
        documentsForPipeline = [groundingPolicy, ...ragResult.documents, ...documentsForPipeline];
        this.setStatus(
          'retrieving',
          `Grounded RAG loaded ${ragResult.references.length} source(s) from internet/GitHub.`
        );
        this.syncWebview();
      }

      if (ragResult.warnings.length > 0) {
        this.logger.debug(`RAG warnings: ${ragResult.warnings.join(' | ')}`);
      }

      if (runtime.config.mcp.enabled && runtime.config.mcp.servers.length > 0) {
        const mcpResult = await this.mcpManager.collectContext(prompt, runtime.config.mcp.servers);
        if (mcpResult.documents.length > 0) {
          const mcpPolicyDocument = this.createMcpPolicyDocument(mcpResult.references);
          documentsForPipeline = [mcpPolicyDocument, ...mcpResult.documents, ...documentsForPipeline];
          this.setStatus(
            'retrieving',
            `MCP enriched context from ${mcpResult.references.length} tool call(s).`
          );
          this.syncWebview();
        }

        if (mcpResult.warnings.length > 0) {
          this.logger.debug(`MCP warnings: ${mcpResult.warnings.join(' | ')}`);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Context orchestration failed, using baseline retrieval: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    let streamingMessageId: string | undefined;
    let result: PipelineResult;
    let timeoutMs = runtime.config.ollama.timeoutMs;
    const maxTimeoutRecoveries = 3;
    let timeoutRecoveryAttempt = 0;

    while (true) {
      const pipeline = this.createPipeline({ timeoutMs });
      result = await pipeline.execute(
        {
          workspaceRoot: runtime.workspaceRoot,
          prompt: userPrompt,
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

      if (result.ok || !this.isTimeoutErrorMessage(result.error)) {
        break;
      }

      timeoutRecoveryAttempt += 1;
      if (timeoutRecoveryAttempt > maxTimeoutRecoveries) {
        break;
      }

      timeoutMs = Math.min(timeoutMs * 2, 12 * 60 * 1000);
      this.setStatus(
        'thinking',
        `Model timed out. Retrying with ${Math.round(timeoutMs / 1000)}s timeout (${timeoutRecoveryAttempt}/${maxTimeoutRecoveries}).`
      );
      this.syncWebview();
    }

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
      const citationCheck = this.enforceCitationPolicy(
        result.answer.content,
        result.retrievedDocuments,
        runtime.config.rag.strictCitations
      );

      if (!citationCheck.ok) {
        this.appendMessage(
          'assistant',
          `## Citation required\n${citationCheck.message}\n\nPlease ask again and include details so I can provide a fully cited answer.`
        );
        this.setStatus('idle', 'Strict citation mode blocked an uncited response.');
        await this.persistState();
        this.syncWebview();
        return;
      }

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
      this.pendingDraft = result.draft;
      this.pendingCommands = result.draft?.commands ?? [];
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

      const staged = await this.stagePreviewEdits(result.preview, runtime.workspaceRoot);

      const planSummary = result.plan
        ? `- **Intent**: ${result.plan.intent}\n- **Mode**: ${result.plan.mode}\n- **Write required**: ${result.plan.requiresWrite ? 'yes' : 'no'}`
        : '- Plan ready.';
      const rationale = result.preview.rationale || result.preview.summary || 'No rationale provided.';
      const stagedPaths = result.preview.changes.map((change) => change.path);

      this.appendMessage(
        'assistant',
        `## Plan\n${planSummary}\n\n## Reasoning\n- ${rationale}\n\n## Changes\n- **Files**: ${result.preview.changes.length} change(s)\n- **Line impact**: +${result.preview.totalAdditions} -${result.preview.totalDeletions}\n- **Staged in editor**: ${staged.stagedCount} file edit(s)\n- **Paths**: ${this.formatFilePathList(stagedPaths)}\n\nReview the staged file edits, then click **Keep** to accept or **Undo** to reject.`
      );

      if (staged.errors.length > 0) {
        this.appendMessage(
          'assistant',
          `## Staging warnings\n- Some files could not be staged in-editor.\n- They will be finalized on **Keep**.\n- **Details**: ${staged.errors.join(' | ')}`
        );
      }
      
      // ALWAYS show diff for review - never auto-apply
      this.setStatus('review', 'Review staged changes, then Keep or Undo.');
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

    if (!preview) {
      this.setStatus('idle');
      this.syncWebview();
      return;
    }

    if (decision === 'reject') {
      await this.discardStagedEdits();
      this.pendingPreview = undefined;
      this.pendingDraft = undefined;
      this.pendingCommands = [];
      this.state.diffPreview = [];
      this.state.totalAdditions = 0;
      this.state.totalDeletions = 0;
      this.appendMessage('assistant', 'Draft rejected. Staged file edits were reverted.');
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
        
        this.appendMessage('assistant', `## No changes generated\n- ${errorMessage}`);
        this.appendMessage(
          'assistant',
          '## Tips\n- Be specific about what to change.\n- Mention the exact file name (for example, `cli.py`).\n- Describe the exact change (for example, "add error handling to line 5").'
        );
        this.setStatus('idle', 'No changes generated');
        await this.persistState();
        this.syncWebview();
        return;
      }
    }

    this.setStatus('executing', 'Applying validated changes to the workspace.');
    this.syncWebview();

    const stagedAcceptResult = await this.acceptStagedEdits();

    const backupPaths: string[] = [];
    for (const change of preview.changes) {
      const isStagedUpdate =
        change.operation === 'update' && this.stagedEdits.has(this.normalizeRelativePathForKey(change.path));
      if (change.operation !== 'update' || isStagedUpdate) {
        continue;
      }
      const filePath = path.join(workspaceRoot, change.path);
      const backupPath = await this.backupFile(filePath);
      if (backupPath) {
        backupPaths.push(backupPath);
      }
    }

    const applyResult: ApplyResult = {
      applied: stagedAcceptResult.applied,
      rejected: 0,
      changedPaths: [...stagedAcceptResult.changedPaths],
      errors: [...stagedAcceptResult.errors],
    };

    for (let index = 0; index < preview.changes.length; index += 1) {
      const change = preview.changes[index];
      if (change.operation === 'update' && this.stagedEdits.has(this.normalizeRelativePathForKey(change.path))) {
        continue;
      }
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

      // Track file changes for visual diff decorations
      if (singleResult.applied > 0 && change.operation === 'update' && change.originalContent) {
        const filePath = path.join(workspaceRoot, change.path);
        const { addedLines, removedLines } = calculateLineRanges(
          change.originalContent,
          change.proposedContent
        );
        console.log(`[Klyr] Storing decorations for: ${filePath}`);
        console.log(`[Klyr] Added lines: [${addedLines.join(', ')}], Removed lines: [${removedLines.join(', ')}]`);
        fileChangeDecorations.set(filePath, {
          addedLines,
          removedLines,
          timestamp: Date.now(),
        });
      }
    }

    this.invalidateIndexCache();
    for (const staged of this.stagedEdits.values()) {
      clearDecorationsForUri(staged.uri.fsPath);
    }
    for (const changedPath of stagedAcceptResult.changedPaths) {
      clearDecorationsForUri(path.join(workspaceRoot, changedPath));
    }
    clearAllDecorations();
    this.stagedEdits.clear();
    this.pendingPreview = undefined;
      this.pendingDraft = undefined;
      this.pendingCommands = [];
    this.state.diffPreview = [];
    this.state.totalAdditions = 0;
    this.state.totalDeletions = 0;

    if (applyResult.errors.length > 0) {
      const details = applyResult.errors.map((error) => `${error.path}: ${error.message}`).join('\n');
      const restoreInfo =
        backupPaths.length > 0 ? `\n\nBackups saved at: ${backupPaths.join(', ')}` : '';
      this.appendMessage(
        'assistant',
        `## Apply result\n- **Applied**: ${applyResult.applied} file(s)\n- **Errors**: ${applyResult.errors.length}\n- **Details**:\n${details.split('\n').map((line) => `  - ${line}`).join('\n')}${restoreInfo ? `\n- **Backups**: ${restoreInfo.replace(/^\n\nBackups saved at:\s*/, '')}` : ''}`
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
      const commands = this.pendingCommands;
      let successMessage = `## Applied successfully\n- **Changes**: ${applyResult.applied}\n- **Files**: ${this.formatFilePathList(applyResult.changedPaths)}`;
      
      // Execute commands if any
      if (commands.length > 0) {
        this.appendMessage('assistant', successMessage);
        await this.cleanupBackups(workspaceRoot);
        await this.recordDecisionMemory('success', applyResult.changedPaths);
        
        this.setStatus('executing', `Executing ${commands.length} command(s)...`);
        this.syncWebview();
        
        const commandExecutor = new CommandExecutor({
          onOutput: (cmd, line) => {
            console.log(`[KLYR] ${cmd}: ${line.trim()}`);
          },
          onComplete: (result) => {
            console.log(`[KLYR] Command completed: ${result.command} (exit ${result.exitCode})`);
          },
        });
        
        const commandResults = await commandExecutor.executeAll(commands, workspaceRoot);
        
        // Build command results message
        let commandMessage = `## Commands Executed\n`;
        for (const result of commandResults) {
          const status = result.success ? '✅' : '❌';
          commandMessage += `\n${status} \`${result.command}\`\n`;
          if (result.stderr && !result.success) {
            commandMessage += `   Error: ${result.stderr.slice(0, 200)}`;
          }
        }
        
        this.appendMessage('assistant', commandMessage);
        
        // Check if any commands failed (non-allowFailure)
        const failedCommands = commandResults.filter(r => !r.success && !commands[commandResults.indexOf(r)].allowFailure);
        if (failedCommands.length > 0) {
          this.setStatus('idle', 'Commands failed. Check output above.');
        } else {
          this.setStatus('idle', 'Execution finished.');
        }
      } else {
        this.appendMessage('assistant', successMessage);
        await this.cleanupBackups(workspaceRoot);
        await this.recordDecisionMemory('success', applyResult.changedPaths);
        
        // Run error fix loop if there were file changes
        if (applyResult.applied > 0) {
          this.appendMessage('assistant', 'Running error check...');
          this.syncWebview();
          
          const errors = await this.runLintCheck(workspaceRoot);
          
          if (errors.length > 0) {
            this.appendMessage('assistant', `Found ${errors.length} error(s). Starting error fix loop...`);
            const fixResult = await this.runErrorFixLoop(workspaceRoot, errors);
            if (fixResult.fixed) {
              this.appendMessage('assistant', '✅ All errors fixed successfully!');
            }
          } else {
            this.appendMessage('assistant', '✅ No errors found. Project looks good!');
          }
        }
        
        // Open changed files for quick review.
        for (const changedPath of applyResult.changedPaths) {
          const fullPath = path.join(workspaceRoot, changedPath);
          try {
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
          } catch (error) {
            console.error(`[Klyr] Failed to open changed file ${fullPath}:`, error);
          }
        }
        this.setStatus('idle', 'Execution finished.');
      }
    }

    this.setStatus('idle', 'Execution finished.');
    await this.persistState();
    this.syncWebview();
  }

  private async runErrorFixLoop(
    workspaceRoot: string,
    initialErrors: string[]
  ): Promise<{ fixed: boolean; totalErrors: number; iterations: number }> {
    const MAX_ITERATIONS = 5;
    let iterations = 0;
    let currentErrors = initialErrors;
    
    // Track errors by file to help LLM understand context
    const errorsByFile = this.groupErrorsByFile(currentErrors);
    
    while (iterations < MAX_ITERATIONS && currentErrors.length > 0) {
      iterations++;
      
      this.setStatus('fixing', `Fixing errors (attempt ${iterations}/${MAX_ITERATIONS})...`);
      this.syncWebview();
      
      // Parse errors and prepare fix request
      const errorSummary = this.formatErrorsForLLM(currentErrors);
      
      this.appendMessage('assistant', `## Error Fix Loop (${iterations}/${MAX_ITERATIONS})\n\nFound ${currentErrors.length} error(s):\n${errorSummary}\n\nFixing...`);
      
      try {
        // Read all workspace files for context
        const files: Array<{ path: string; content: string }> = [];
        
        const readDir = async (dir: string) => {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                await readDir(fullPath);
              } else if (entry.isFile() && /\.(js|jsx|ts|tsx|json|html|css)$/i.test(entry.name)) {
                const content = await fs.readFile(fullPath, 'utf-8');
                files.push({
                  path: toRelativePath(workspaceRoot, fullPath),
                  content: content.slice(0, 8000),
                });
              }
            }
          } catch {}
        };
        
        await readDir(workspaceRoot);
        const contextFiles = files.slice(0, 20);
        
        // Call LLM to get fixes
        const config = this.getConfig();
        const llmClient = new HttpOllamaClient({
          baseUrl: config.ollama.baseUrl,
          timeoutMs: config.ollama.timeoutMs,
          maxRetries: config.ollama.maxRetries,
          retryBackoffMs: config.ollama.retryBackoffMs,
        });
        
        // Create detailed fix prompt with error context
        const fixPrompt = `FIX THESE ERRORS:\n\n${currentErrors.map((e, i) => `[${i + 1}] ${e}`).join('\n')}\n\nContext: The workspace has ${errorsByFile.size} file(s) with errors.\n\nINSTRUCTIONS:\n1. Analyze each error carefully\n2. Fix the root cause, not just symptoms\n3. Output ONLY valid JSON\n4. Include complete file content for each fix\n5. Do NOT add explanations or markdown\n\nSCHEMA:\n{"summary": "brief description of fixes", "changes": [{"path": "file path", "operation": "update", "proposedContent": "COMPLETE FIXED CONTENT"}]}`;

        const fixResponse = await llmClient.chat({
          model: this.selectedModelOverride ?? config.ollama.model,
          messages: [
            {
              role: 'system',
              content: `You are KLYR, an expert code fixer. Fix errors in code.
- Analyze the error type and root cause
- Fix the actual problem, not just hide symptoms
- Output ONLY valid JSON
- Include complete file content
- Do NOT output explanations or markdown

Schema: {"summary": "what was fixed", "changes": [{"path": "file", "operation": "update", "proposedContent": "FULL FILE CONTENT"}]}`,
            },
            {
              role: 'user',
              content: JSON.stringify({
                errors: currentErrors,
                errorsByFile: Object.fromEntries(errorsByFile),
                contextFiles,
                workspaceRoot,
              }, null, 2),
            },
          ],
          temperature: 0,
          stream: false,
        });
        
        // Parse and apply fixes
        let parsedFix;
        try {
          parsedFix = JSON.parse(fixResponse.content);
        } catch {
          this.appendMessage('assistant', 'Failed to parse fix response from LLM. Manual intervention required.');
          return { fixed: false, totalErrors: currentErrors.length, iterations };
        }
        
        if (parsedFix.changes && Array.isArray(parsedFix.changes) && parsedFix.changes.length > 0) {
          const executor = new FileSystemExecutor();
          
          // Apply fixes directly
          let appliedCount = 0;
          for (const change of parsedFix.changes) {
            if (change.path && change.proposedContent) {
              const filePath = path.join(workspaceRoot, change.path);
              try {
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, change.proposedContent, 'utf-8');
                appliedCount++;
                console.log(`[KLYR] Applied fix: ${change.path}`);
              } catch (err) {
                console.error(`[KLYR] Failed to apply fix for ${change.path}:`, err);
              }
            }
          }
          
          this.appendMessage('assistant', `Applied ${appliedCount} fix(es): ${parsedFix.summary || 'Fixes applied'}`);
        } else {
          this.appendMessage('assistant', 'No changes were made by the fixer. Trying different approach...');
        }
        
        // Run lint again to check for remaining errors
        const newErrors = await this.runLintCheck(workspaceRoot);
        currentErrors = newErrors;
        
        if (currentErrors.length === 0) {
          this.appendMessage('assistant', '✅ All errors fixed!');
          return { fixed: true, totalErrors: 0, iterations };
        }
        
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[KLYR] Error fix loop failed:', msg);
        this.appendMessage('assistant', `Error fix attempt failed: ${msg}`);
        break;
      }
    }
    
    if (currentErrors.length > 0) {
      this.appendMessage('assistant', `⚠️ Could not fix all errors after ${iterations} attempts. ${currentErrors.length} error(s) remain.`);
    }
    
    return { fixed: currentErrors.length === 0, totalErrors: currentErrors.length, iterations };
  }

  private groupErrorsByFile(errors: string[]): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    for (const error of errors) {
      const fileMatch = error.match(/^(.+?)[:(]/);
      const file = fileMatch ? fileMatch[1] : 'unknown';
      if (!grouped.has(file)) {
        grouped.set(file, []);
      }
      grouped.get(file)!.push(error);
    }
    return grouped;
  }

  private formatErrorsForLLM(errors: string[]): string {
    return errors.map((e, i) => `${i + 1}. ${e}`).join('\n');
  }

  private async runLintCheck(workspaceRoot: string): Promise<string[]> {
    const errors: string[] = [];
    
    // Try TypeScript check
    const tsConfigPath = path.join(workspaceRoot, 'tsconfig.json');
    const hasTsConfig = await this.pathExists(tsConfigPath);
    
    if (hasTsConfig) {
      const tsResult = await this.runCommand('npx tsc --noEmit 2>&1', workspaceRoot, 60);
      if (tsResult.output) {
        const parsed = this.parseTypeScriptErrors(tsResult.output);
        errors.push(...parsed);
      }
    }
    
    // Try ESLint
    const eslintConfigPath = path.join(workspaceRoot, '.eslintrc.json');
    const hasEslint = await this.pathExists(eslintConfigPath);
    
    if (hasEslint) {
      const eslintResult = await this.runCommand('npx eslint . --format=compact 2>&1', workspaceRoot, 60);
      if (eslintResult.output) {
        const parsed = this.parseESLintErrors(eslintResult.output);
        errors.push(...parsed);
      }
    }
    
    // Try npm build
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const hasPackageJson = await this.pathExists(packageJsonPath);
    
    if (hasPackageJson) {
      const buildResult = await this.runCommand('npm run build 2>&1 || true', workspaceRoot, 120);
      if (buildResult.output) {
        const parsed = this.parseBuildErrors(buildResult.output);
        errors.push(...parsed);
      }
    }
    
    return errors;
  }

  private async runCommand(command: string, cwd: string, timeoutSeconds: number): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/bash';
      const shellArgs = isWindows ? ['/c', command] : ['-c', command];
      
      let output = '';
      let timedOut = false;
      
      const proc = spawn(shell, shellArgs, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeoutSeconds * 1000);
      
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      proc.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ output: output.slice(0, 10000), exitCode: code ?? 0 });
      });
      
      proc.on('error', () => {
        clearTimeout(timer);
        resolve({ output, exitCode: -1 });
      });
    });
  }

  private parseTypeScriptErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // TS Error format: file.ts(line,col): error TS1234: message
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/);
      if (match) {
        errors.push(`${match[1]}:${match[2]} - ${match[5]}`);
      } else if (line.includes('error TS')) {
        errors.push(line.slice(0, 200));
      }
    }
    
    return errors;
  }

  private parseESLintErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes(':') && (line.includes('error') || line.includes('warning'))) {
        errors.push(line.slice(0, 200));
      }
    }
    
    return errors;
  }

  private parseBuildErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('ERROR') || line.includes('error:') || line.includes('SyntaxError') || line.includes('Module not found')) {
        errors.push(line.slice(0, 200));
      }
    }
    
    return errors;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async stagePreviewEdits(
    preview: DiffPreview,
    workspaceRoot: string
  ): Promise<{ stagedCount: number; errors: string[] }> {
    this.stagedEdits.clear();
    const errors: string[] = [];
    let stagedCount = 0;

    for (const change of preview.changes) {
      if (change.operation !== 'update') {
        continue;
      }

      try {
        const absolutePath = path.join(workspaceRoot, change.path);
        const fileUri = vscode.Uri.file(absolutePath);
        const document = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          preview: false,
        });

        const originalContent = document.getText();
        const nextContent = change.proposedContent ?? '';
        if (originalContent === nextContent) {
          continue;
        }

        const key = this.normalizeRelativePathForKey(change.path);
        this.stagedEdits.set(key, {
          path: change.path,
          uri: fileUri,
          originalContent,
          proposedContent: nextContent,
        });

        const { addedLines, removedLines } = calculateLineRanges(originalContent, nextContent);
        fileChangeDecorations.set(absolutePath, {
          addedLines,
          removedLines,
          timestamp: Date.now(),
        });

        const shouldAnimate = nextContent.length <= 9000;
        if (shouldAnimate) {
          await this.animateEditorTyping(editor, nextContent);
        } else {
          const finalRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
          );
          await editor.edit(
            (editBuilder) => {
              editBuilder.replace(finalRange, nextContent);
            },
            { undoStopBefore: true, undoStopAfter: true }
          );
        }

        applyDecorationsForEditor(editor);
        stagedCount += 1;
      } catch (error) {
        errors.push(`${change.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { stagedCount, errors };
  }

  private async acceptStagedEdits(): Promise<ApplyResult> {
    const result: ApplyResult = {
      applied: 0,
      rejected: 0,
      changedPaths: [],
      errors: [],
    };

    for (const staged of this.stagedEdits.values()) {
      try {
        const document = await vscode.workspace.openTextDocument(staged.uri);
        const saved = await document.save();
        if (!saved) {
          result.errors.push({ path: staged.path, message: 'Could not save staged edit.' });
          continue;
        }
        result.applied += 1;
        result.changedPaths.push(staged.path);
      } catch (error) {
        result.errors.push({
          path: staged.path,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  private async discardStagedEdits(): Promise<void> {
    for (const staged of this.stagedEdits.values()) {
      try {
        const document = await vscode.workspace.openTextDocument(staged.uri);
        const editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          preview: false,
        });

        const range = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        await editor.edit(
          (editBuilder) => {
            editBuilder.replace(range, staged.originalContent);
          },
          { undoStopBefore: true, undoStopAfter: true }
        );
        await document.save();
        clearDecorationsForUri(staged.uri.fsPath);
      } catch {
        // Ignore revert errors for individual files.
      }
    }

    this.stagedEdits.clear();
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

  private createPipeline(ollamaOverrides: Partial<KlyrConfig['ollama']> = {}): Pipeline {
    const config = this.getConfig();
    const effectiveOllamaConfig = {
      ...config.ollama,
      ...ollamaOverrides,
    };
    const ollamaClient = new HttpOllamaClient({
      baseUrl: effectiveOllamaConfig.baseUrl,
      timeoutMs: effectiveOllamaConfig.timeoutMs,
      maxRetries: effectiveOllamaConfig.maxRetries,
      retryBackoffMs: effectiveOllamaConfig.retryBackoffMs,
    });
    
    // Use LLM-powered planner for better intent classification
    const planner = new LLMPoweredPlanner(ollamaClient, config.ollama.model);
    
    return new Pipeline(
      planner,
      this.createCoder(config, effectiveOllamaConfig),
      new BasicValidator(),
      new FileSystemExecutor(),
      new InMemoryContextEngine(new OllamaEmbeddingProvider(effectiveOllamaConfig.baseUrl)),
      this.memory,
      this.logger
    );
  }

  private createCoder(
    config: KlyrConfig,
    ollamaOverrides: Partial<KlyrConfig['ollama']> = {}
  ): OllamaCoder {
    const effectiveOllamaConfig = {
      ...config.ollama,
      ...ollamaOverrides,
    };

    return new OllamaCoder({
      client: new HttpOllamaClient(effectiveOllamaConfig),
      model: effectiveOllamaConfig.model,
      temperature: effectiveOllamaConfig.temperature,
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

  private formatFilePathList(paths: string[]): string {
    if (paths.length === 0) {
      return '`none`';
    }

    return paths.map((pathValue) => `\`${pathValue}\``).join(', ');
  }

  private async tryExecutePromptCommands(
    runtime: RuntimeContext,
    prompt: string,
    requestId: number
  ): Promise<boolean> {
    const plan = this.buildCommandPlan(prompt);
    if (!plan) {
      return false;
    }

    const commandOnly = this.shouldHandleWithCommandWorkflowOnly(prompt);

    if (requestId !== this.requestSerial) {
      return true;
    }

    this.setStatus('executing', `Executing workflow: ${plan.summary}`);
    this.syncWebview();

    const executed: CommandExecutionResult[] = [];
    const commandCwd = await this.resolveCommandWorkingDirectory(runtime.workspaceRoot, prompt);
    const cwdLabel = toRelativePath(runtime.workspaceRoot, commandCwd);

    for (const command of plan.commands) {
      if (requestId !== this.requestSerial) {
        return true;
      }

      this.setStatus('executing', `Running in ${cwdLabel || '.'}: ${command}`);
      this.syncWebview();

      let run = await this.runShellCommand(command, commandCwd);
      executed.push(run);

      let recoveryAttempt = 0;
      while (
        !run.ok &&
        this.shouldAttemptAutoFixForCommand(command, run.output) &&
        recoveryAttempt < 3
      ) {
        recoveryAttempt += 1;
        this.setStatus(
          'thinking',
          `Command failed. Auto-fix attempt ${recoveryAttempt}/3 for: ${command}`
        );
        this.syncWebview();

        const fixed = await this.attemptAutoFixForFailedCommand(runtime, command, run.output, commandCwd);
        if (!fixed) {
          break;
        }

        this.setStatus('executing', `Retrying command after fix: ${command}`);
        this.syncWebview();
        run = await this.runShellCommand(command, commandCwd);
        executed.push(run);
      }

      if (!run.ok) {
        this.appendMessage(
          'assistant',
          `## Command failed\n- **Command**: \`${command}\`\n- **Exit code**: ${run.exitCode}\n\n\`\`\`text\n${this.trimExternalKnowledge(run.output, 1800)}\n\`\`\``
        );
        this.setStatus('idle', 'Command workflow stopped on error.');
        return true;
      }
    }

    const doneGate = await this.enforceDiagnosticsDoneGate(runtime, commandCwd, requestId);
    if (!doneGate.ok) {
      this.appendMessage(
        'assistant',
        `## Done gate blocked\n- Remaining errors: ${doneGate.errorCount}\n\n\`\`\`text\n${this.trimExternalKnowledge(doneGate.detail, 2200)}\n\`\`\``
      );
      this.setStatus('idle', 'Command workflow paused with unresolved errors.');
      return true;
    }

    const summaryLines = executed.map(
      (entry) => `- \`${entry.command}\`: ${entry.ok ? 'ok' : `failed (${entry.exitCode})`}`
    );

    this.appendMessage(
      'assistant',
      `## Command workflow completed\n- **Scope**: \`${cwdLabel || '.'}\`\n${summaryLines.join('\n')}`
    );
    if (!commandOnly) {
      this.appendMessage(
        'assistant',
        'Scaffolding/setup commands completed. Continuing to implement the requested project files and UI.'
      );
      this.setStatus('planning', 'Continuing with project implementation.');
      return false;
    }

    this.setStatus('idle', 'Command workflow completed.');
    return true;
  }

  private shouldHandleWithCommandWorkflowOnly(prompt: string): boolean {
    const explicitCommands = this.extractInlineCommands(prompt);
    if (explicitCommands.length > 0) {
      return true;
    }

    return !this.requiresProjectImplementation(prompt);
  }

  private requiresProjectImplementation(prompt: string): boolean {
    const lower = prompt.toLowerCase();

    const implementationSignals = [
      'landing page',
      'homepage',
      'portfolio',
      'dashboard',
      'tailwind',
      'tailwind css',
      'hero section',
      'features section',
      'faq',
      'testimonial',
      'build a',
      'create a',
      'make each and everything',
      'complete project',
      'full project',
      'responsive',
      'ui',
      'design',
      'component',
    ];

    return implementationSignals.some((signal) => lower.includes(signal));
  }

  private isTimeoutErrorMessage(message: string | undefined): boolean {
    if (!message) {
      return false;
    }
    return /(timed out|timeout|aborted)/i.test(message);
  }

  private async resolveCommandWorkingDirectory(
    workspaceRoot: string,
    prompt: string
  ): Promise<string> {
    const scoped = this.extractScopedFolderFromPrompt(prompt);
    if (!scoped) {
      return workspaceRoot;
    }

    const resolved = path.resolve(workspaceRoot, scoped);
    try {
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) {
        return resolved;
      }
    } catch {
      // Ignore missing scoped directory and fallback to root.
    }

    return workspaceRoot;
  }

  private extractScopedFolderFromPrompt(prompt: string): string | undefined {
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
      if (['this', 'current', 'workspace', 'root', '.'].includes(lower)) {
        continue;
      }
      return candidate.replace(/^\.\//, '').replace(/^\//, '');
    }

    return undefined;
  }

  private buildCommandPlan(prompt: string): CommandPlan | undefined {
    const lower = prompt.toLowerCase();
    const explicit = this.extractInlineCommands(prompt);
    if (explicit.length > 0) {
      return {
        summary: 'User-provided command sequence',
        commands: explicit,
      };
    }

    if (/react\s+vite|vite\s+react|create\s+.*vite/i.test(prompt)) {
      const inRoot = /in\s+(this|current)\s+(folder|root|directory)/i.test(prompt);
      if (inRoot) {
        return {
          summary: 'Create React Vite app in current folder',
          commands: ['npm create vite@latest . -- --template react', 'npm install', 'npm run build'],
        };
      }

      const appName = this.extractProjectName(prompt) ?? 'react-vite-app';
      return {
        summary: 'Create React Vite app in subfolder',
        commands: [
          `npm create vite@latest ${appName} -- --template react`,
          `cd ${appName} && npm install`,
          `cd ${appName} && npm run build`,
        ],
      };
    }

    if (/\bgit\b|\bcommit\b|\bpush\b|\bnpm\b|\byarn\b|\bpnpm\b/i.test(lower)) {
      const commands: string[] = [];
      if (/\bcommit\b/i.test(lower) || /\bpush\b/i.test(lower)) {
        const message = this.extractCommitMessage(prompt) ?? 'chore: update via klyr';
        commands.push('git add -A');
        commands.push(`git commit -m "${message.replace(/"/g, '\\"')}"`);
      }
      if (/\bpush\b/i.test(lower)) {
        commands.push('git push');
      }

      const npmMatches = prompt.match(/(?:npm|pnpm|yarn)\s+[a-zA-Z0-9:@._/-]+(?:\s+[-a-zA-Z0-9@._/:=]+)*/g);
      if (npmMatches) {
        commands.unshift(...npmMatches);
      }

      if (commands.length > 0) {
        return {
          summary: 'Run git/npm command workflow',
          commands,
        };
      }
    }

    return undefined;
  }

  private extractInlineCommands(prompt: string): string[] {
    const commandLines = prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^(npm|pnpm|yarn|git|npx)\s+/i.test(line));

    const inlineCodeCommands = [...prompt.matchAll(/`((?:npm|pnpm|yarn|git|npx)\s+[^`]+)`/gi)].map(
      (match) => match[1].trim()
    );

    return [...new Set([...commandLines, ...inlineCodeCommands])];
  }

  private extractCommitMessage(prompt: string): string | undefined {
    const quoted = prompt.match(/commit(?:\s+message)?\s+["']([^"']+)["']/i);
    if (quoted?.[1]) {
      return quoted[1].trim();
    }
    return undefined;
  }

  private extractProjectName(prompt: string): string | undefined {
    const named = prompt.match(/(?:named|called)\s+([a-zA-Z0-9-_]+)/i);
    if (named?.[1]) {
      return named[1].trim();
    }
    return undefined;
  }

  private async runShellCommand(command: string, cwd: string): Promise<CommandExecutionResult> {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command];

    return await new Promise<CommandExecutionResult>((resolve) => {
      const child = spawn(shell, args, {
        cwd,
        env: process.env,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill();
      }, 180000);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        const output = `${stdout}${stderr}`.trim();
        resolve({
          command,
          ok: code === 0,
          exitCode: code ?? -1,
          output,
        });
      });
    });
  }

  private shouldAttemptAutoFixForCommand(command: string, output: string): boolean {
    const lowerCommand = command.toLowerCase();
    const lowerOutput = output.toLowerCase();
    if (!/(npm|pnpm|yarn)\s+run\s+(build|test|lint)/.test(lowerCommand)) {
      return false;
    }

    return /(error|failed|cannot find|ts\d+|eslint|exception)/.test(lowerOutput);
  }

  private async attemptAutoFixForFailedCommand(
    runtime: RuntimeContext,
    command: string,
    output: string,
    scopeRoot: string
  ): Promise<boolean> {
    const scopeRelative = toRelativePath(runtime.workspaceRoot, scopeRoot) || '.';
    const fixPrompt = `In ${scopeRelative} folder, fix project files so this command succeeds: ${command}\n\nError output:\n${this.trimExternalKnowledge(output, 3500)}\n\nMake only necessary changes.`;

    const refreshRuntime = await this.buildRuntimeContext();
    const effectiveRuntime = refreshRuntime ?? runtime;
    const pipeline = this.createPipeline();
    const result = await pipeline.execute(
      {
        workspaceRoot: effectiveRuntime.workspaceRoot,
        prompt: fixPrompt,
        activeFilePath: effectiveRuntime.activeFilePath,
        selection: effectiveRuntime.selection,
        modeHint: 'edit',
        workspaceSummary: effectiveRuntime.workspaceSummary,
        dependencyAllowlist: effectiveRuntime.dependencyAllowlist,
        openFiles: effectiveRuntime.openFiles,
        documents: effectiveRuntime.documents,
        logger: this.logger,
      },
      {
        maxAttempts: effectiveRuntime.config.execution.maxAttempts,
        retrievalMaxResults: effectiveRuntime.config.context.retrievalMaxResults,
        allowNewFiles: true,
      }
    );

    if (!result.ok || !result.preview) {
      return false;
    }

    const applyResult = await new FileSystemExecutor().apply(
      result.preview,
      'accept',
      effectiveRuntime.workspaceRoot
    );

    return applyResult.applied > 0 && applyResult.errors.length === 0;
  }

  private async enforceDiagnosticsDoneGate(
    runtime: RuntimeContext,
    scopeRoot: string,
    requestId: number
  ): Promise<{ ok: boolean; errorCount: number; detail: string }> {
    let attempts = 0;
    while (attempts < 3) {
      if (requestId !== this.requestSerial) {
        return { ok: false, errorCount: 1, detail: 'Request cancelled.' };
      }

      const diagnostics = this.collectWorkspaceDiagnostics(runtime.workspaceRoot, scopeRoot);
      const errors = diagnostics.filter(
        (item) => item.diagnostic.severity === vscode.DiagnosticSeverity.Error
      );
      if (errors.length === 0) {
        return { ok: true, errorCount: 0, detail: '' };
      }

      attempts += 1;
      this.setStatus('thinking', `Detected ${errors.length} errors. Auto-fix pass ${attempts}/3.`);
      this.syncWebview();

      const fixPrompt = [
        `In ${toRelativePath(runtime.workspaceRoot, scopeRoot) || '.'} folder, fix all errors listed below.`,
        'Do minimal safe edits and preserve behavior.',
        'Errors:',
        ...errors.slice(0, 25).map((d) =>
          `- ${toRelativePath(runtime.workspaceRoot, d.uri.fsPath)}:${d.diagnostic.range.start.line + 1}:${d.diagnostic.range.start.character + 1} ${d.diagnostic.message}`
        ),
      ].join('\n');

      const fixed = await this.attemptAutoFixForFailedCommand(runtime, 'diagnostics-fix', fixPrompt, scopeRoot);
      if (!fixed) {
        const detail = errors
          .slice(0, 15)
          .map(
            (d) =>
              `${toRelativePath(runtime.workspaceRoot, d.uri.fsPath)}:${d.diagnostic.range.start.line + 1} ${d.diagnostic.message}`
          )
          .join('\n');
        return { ok: false, errorCount: errors.length, detail };
      }
    }

    const finalErrors = this.collectWorkspaceDiagnostics(runtime.workspaceRoot, scopeRoot).filter(
      (item) => item.diagnostic.severity === vscode.DiagnosticSeverity.Error
    );
    const detail = finalErrors
      .slice(0, 15)
      .map(
        (d) =>
          `${toRelativePath(runtime.workspaceRoot, d.uri.fsPath)}:${d.diagnostic.range.start.line + 1} ${d.diagnostic.message}`
      )
      .join('\n');
    return { ok: finalErrors.length === 0, errorCount: finalErrors.length, detail };
  }

  private collectWorkspaceDiagnostics(
    workspaceRoot: string,
    scopeRoot?: string
  ): Array<{ uri: vscode.Uri; diagnostic: vscode.Diagnostic }> {
    const root = path.resolve(workspaceRoot);
    const scope = scopeRoot ? path.resolve(scopeRoot) : undefined;
    const all = vscode.languages.getDiagnostics();
    const collected: Array<{ uri: vscode.Uri; diagnostic: vscode.Diagnostic }> = [];

    for (const [uri, diagnostics] of all) {
      if (uri.scheme !== 'file') {
        continue;
      }

      const filePath = path.resolve(uri.fsPath);
      if (!filePath.startsWith(root)) {
        continue;
      }
      if (scope && !filePath.startsWith(scope)) {
        continue;
      }

      for (const diagnostic of diagnostics) {
        collected.push({ uri, diagnostic });
      }
    }

    return collected;
  }

  private parseImageAttachments(input: unknown): ChatImageAttachment[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : undefined,
        dataUrl: typeof item.dataUrl === 'string' ? item.dataUrl : '',
        mimeType: typeof item.mimeType === 'string' ? item.mimeType : 'image/png',
        name: typeof item.name === 'string' ? item.name : undefined,
      }))
      .filter((item) => item.dataUrl.startsWith('data:image/'))
      .slice(0, 3);
  }

  private async buildImageAnalysisDocument(
    prompt: string,
    images: ChatImageAttachment[],
    config: KlyrConfig
  ): Promise<ContextDocument | undefined> {
    const base64Images = images
      .map((image) => this.extractBase64ImageData(image.dataUrl))
      .filter((value): value is string => Boolean(value));

    if (base64Images.length === 0) {
      return undefined;
    }

    try {
      const visionClient = new HttpOllamaClient({
        baseUrl: config.ollama.baseUrl,
        timeoutMs: Math.max(config.ollama.timeoutMs, 90000),
        maxRetries: config.ollama.maxRetries,
        retryBackoffMs: config.ollama.retryBackoffMs,
      });

      const response = await visionClient.chat({
        model: config.ollama.visionModel,
        temperature: 0,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You are analyzing coding screenshots. Extract exact error text, stack traces, file paths, line numbers, and actionable debugging clues. Do not invent unreadable text.',
          },
          {
            role: 'user',
            content: `User prompt: ${prompt}\n\nAnalyze attached screenshot(s) and summarize relevant debugging signals for a coding assistant.`,
            images: base64Images,
          },
        ],
      });

      const content = response.content.trim();
      if (!content) {
        return undefined;
      }

      return {
        id: `klyr-image-analysis-${Date.now()}`,
        uri: 'klyr://attachments/image-analysis',
        title: 'image-analysis',
        content,
        updatedAt: Date.now(),
        source: 'memory',
        tags: ['image', 'vision', 'attachment'],
      };
    } catch (error) {
      this.logger.warn(
        `Image analysis failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  }

  private extractBase64ImageData(dataUrl: string): string | undefined {
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!match?.[1]) {
      return undefined;
    }
    return match[1];
  }

  private enforceCitationPolicy(
    answer: string,
    documents: ContextDocument[],
    strictModeEnabled: boolean
  ): { ok: boolean; message?: string } {
    if (!strictModeEnabled) {
      return { ok: true };
    }

    const externalUris = documents
      .map((document) => document.uri)
      .filter((uri) => /^https?:\/\//i.test(uri) || /^mcp:\/\//i.test(uri));

    if (externalUris.length === 0) {
      return { ok: true };
    }

    const hasKnownCitation = externalUris.some((uri) => answer.includes(uri));
    const hasUrlCitation = /(https?:\/\/[^\s)]+)/i.test(answer);

    if (!hasKnownCitation && !hasUrlCitation) {
      return {
        ok: false,
        message:
          'Strict citation mode is enabled and this answer used external context without including source URLs.',
      };
    }

    return { ok: true };
  }

  private createGroundingPolicyDocument(references: string[]): ContextDocument {
    const normalizedRefs = references.slice(0, 12);
    const sourceList =
      normalizedRefs.length > 0
        ? normalizedRefs.map((entry) => `- ${entry}`).join('\n')
        : '- No external source resolved.';

    return {
      id: `klyr-grounding-policy-${Date.now()}`,
      uri: 'klyr://grounding/policy',
      title: 'klyr-grounding-policy',
      content: [
        'Grounding requirements for this response:',
        '1. Use only facts present in workspace context and retrieved RAG sources.',
        '2. If an answer is missing from context, explicitly say that information is unavailable.',
        '3. Do not invent APIs, package names, versions, or file paths.',
        '4. For external facts, cite the source URL directly in the response.',
        'External source catalog:',
        sourceList,
      ].join('\n'),
      updatedAt: Date.now(),
      source: 'memory',
      tags: ['grounding', 'rag', 'policy'],
    };
  }

  private createMcpPolicyDocument(references: string[]): ContextDocument {
    const lines = references.length > 0 ? references.map((entry) => `- ${entry}`) : ['- none'];

    return {
      id: `klyr-mcp-policy-${Date.now()}`,
      uri: 'klyr://mcp/policy',
      title: 'klyr-mcp-policy',
      content: [
        'MCP tool grounding policy:',
        '1. Prefer MCP tool output when it directly answers the question.',
        '2. Do not fabricate MCP results.',
        '3. If MCP output conflicts with workspace facts, mention the conflict explicitly.',
        'MCP tool calls used:',
        ...lines,
      ].join('\n'),
      updatedAt: Date.now(),
      source: 'memory',
      tags: ['mcp', 'policy', 'grounding'],
    };
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

  private shouldFetchExternalKnowledge(prompt: string): boolean {
    return prompt.trim().length > 0;
  }

  private async fetchExternalKnowledgeForPrompt(prompt: string): Promise<ExternalKnowledge[]> {
    if (!this.shouldFetchExternalKnowledge(prompt)) {
      return [];
    }

    const results: ExternalKnowledge[] = [];
    const wikipediaQuery = this.extractWikipediaQuery(prompt);

    try {
      const internet = await this.fetchInternetSearchSummary(prompt);
      if (internet) {
        results.push(internet);
      }
    } catch (error) {
      this.logger.debug(
        `Internet search enrichment skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Keep Wikipedia as an optional high-signal enrichment source.
    if (wikipediaQuery) {
      try {
        const wiki = await this.fetchWikipediaSummary(wikipediaQuery);
        if (wiki) {
          results.push(wiki);
        }
      } catch (error) {
        this.logger.debug(
          `Wikipedia enrichment skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return results;
  }

  private extractWikipediaQuery(prompt: string): string | undefined {
    const normalized = prompt.trim();
    const quoted = normalized.match(/wikipedia\s+(?:for\s+)?["']([^"']+)["']/i);
    if (quoted?.[1]) {
      return quoted[1].trim();
    }

    const tail = normalized.match(/wikipedia\s+(?:for\s+)?(.+)/i);
    if (!tail?.[1]) {
      return undefined;
    }

    const value = tail[1]
      .replace(/[?.!]+$/g, '')
      .replace(/\b(search|lookup|find|about)\b/gi, '')
      .trim();

    return value || undefined;
  }

  private async fetchInternetSearchSummary(query: string): Promise<ExternalKnowledge | undefined> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
      no_redirect: '1',
    });

    const url = `https://api.duckduckgo.com/?${params.toString()}`;
    const response = await this.fetchJsonWithTimeout(url, 6000);
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const abstractText = String((response as Record<string, unknown>).AbstractText ?? '').trim();
    const abstractUrl = String((response as Record<string, unknown>).AbstractURL ?? '').trim();
    const heading = String((response as Record<string, unknown>).Heading ?? '').trim();
    const relatedTopics = (response as Record<string, unknown>).RelatedTopics;

    const lines: string[] = [];
    if (heading) {
      lines.push(`Heading: ${heading}`);
    }
    if (abstractText) {
      lines.push(`Summary: ${abstractText}`);
    }
    if (abstractUrl) {
      lines.push(`Source: ${abstractUrl}`);
    }

    if (Array.isArray(relatedTopics)) {
      const topicLines = relatedTopics
        .slice(0, 4)
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const text = String((item as Record<string, unknown>).Text ?? '').trim();
          const firstUrl = String((item as Record<string, unknown>).FirstURL ?? '').trim();
          if (!text) {
            return '';
          }
          return firstUrl ? `- ${text} (${firstUrl})` : `- ${text}`;
        })
        .filter((value) => value.length > 0);

      if (topicLines.length > 0) {
        lines.push('Related:');
        lines.push(...topicLines);
      }
    }

    if (lines.length === 0) {
      return undefined;
    }

    return {
      title: `Internet search: ${query}`,
      source: 'internet',
      content: lines.join('\n'),
    };
  }

  private async fetchWikipediaSummary(query: string): Promise<ExternalKnowledge | undefined> {
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }

    const encoded = encodeURIComponent(normalized.replace(/ /g, '_'));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const response = await this.fetchJsonWithTimeout(url, 6000);
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const payload = response as Record<string, unknown>;
    const title = String(payload.title ?? '').trim();
    const extract = String(payload.extract ?? '').trim();
    const desktopPage =
      payload.content_urls && typeof payload.content_urls === 'object'
        ? (payload.content_urls as Record<string, unknown>).desktop
        : undefined;
    const pageUrl =
      desktopPage && typeof desktopPage === 'object'
        ? String((desktopPage as Record<string, unknown>).page ?? '').trim()
        : '';

    if (!extract) {
      return undefined;
    }

    return {
      title: `Wikipedia: ${title || normalized}`,
      source: 'wikipedia',
      content: `${extract}${pageUrl ? `\nSource: ${pageUrl}` : ''}`,
    };
  }

  private async fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Klyr-VSCode-Extension/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private trimExternalKnowledge(content: string, maxChars: number): string {
    if (content.length <= maxChars) {
      return content;
    }
    return `${content.slice(0, maxChars)}\n...<truncated external context>`;
  }

  private async clearChatState(): Promise<void> {
    await this.archiveCurrentChatIfNeeded();
    await this.discardStagedEdits();
    this.pendingPreview = undefined;
      this.pendingDraft = undefined;
      this.pendingCommands = [];
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
    if (change.operation === 'update' && change.proposedContent) {
      return this.applyChangeWithEditorTyping(change, workspaceRoot);
    }

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

  private async applyChangeWithEditorTyping(
    change: DiffPreview['changes'][number],
    workspaceRoot: string
  ): Promise<ApplyResult> {
    const result: ApplyResult = {
      applied: 0,
      rejected: 0,
      changedPaths: [],
      errors: [],
    };

    try {
      const absolutePath = path.join(workspaceRoot, change.path);
      const fileUri = vscode.Uri.file(absolutePath);
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.One,
        preview: false,
      });

      const nextContent = change.proposedContent ?? '';
      const currentContent = document.getText();

      if (nextContent === currentContent) {
        return result;
      }

      const shouldAnimate = nextContent.length <= 8000;
      if (shouldAnimate) {
        await this.animateEditorTyping(editor, nextContent);
      } else {
        const finalRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        await editor.edit(
          (editBuilder) => {
            editBuilder.replace(finalRange, nextContent);
          },
          { undoStopBefore: true, undoStopAfter: true }
        );
      }

      // Keep file dirty so VS Code shows native red/green inline diff markers.
      result.applied = 1;
      result.changedPaths.push(change.path);
      return result;
    } catch (error) {
      result.errors.push({
        path: change.path,
        message: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async animateEditorTyping(editor: vscode.TextEditor, fullText: string): Promise<void> {
    const clearRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );

    await editor.edit(
      (editBuilder) => {
        editBuilder.replace(clearRange, '');
      },
      { undoStopBefore: true, undoStopAfter: false }
    );

    const chunkSize = fullText.length < 1200 ? 14 : fullText.length < 5000 ? 28 : 56;
    for (let offset = 0; offset < fullText.length; offset += chunkSize) {
      const chunk = fullText.slice(offset, offset + chunkSize);
      const insertPos = editor.document.positionAt(editor.document.getText().length);
      await editor.edit(
        (editBuilder) => {
          editBuilder.insert(insertPos, chunk);
        },
        { undoStopBefore: false, undoStopAfter: false }
      );
      await this.delay(16);
    }

    await editor.edit(
      (_editBuilder) => {
        // Establish final undo stop after typing sequence.
      },
      { undoStopBefore: false, undoStopAfter: true }
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
    const configuredMcpServers = config.get<Array<Record<string, unknown>>>(
      'mcp.servers',
      defaults.mcp.servers as unknown as Array<Record<string, unknown>>
    );
    const mcpServers = (Array.isArray(configuredMcpServers) ? configuredMcpServers : [])
      .map((entry) => {
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        const command = typeof entry.command === 'string' ? entry.command.trim() : '';
        if (!name || !command) {
          return undefined;
        }

        return {
          name,
          command,
          args: Array.isArray(entry.args)
            ? entry.args
                .map((value) => (typeof value === 'string' ? value : ''))
                .filter((value) => value.length > 0)
            : [],
          cwd: typeof entry.cwd === 'string' && entry.cwd.trim() ? entry.cwd.trim() : undefined,
          env:
            entry.env && typeof entry.env === 'object'
              ? Object.entries(entry.env as Record<string, unknown>).reduce<Record<string, string>>(
                  (acc, [key, value]) => {
                    if (typeof value === 'string') {
                      acc[key] = value;
                    }
                    return acc;
                  },
                  {}
                )
              : undefined,
          enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
          timeoutMs:
            typeof entry.timeoutMs === 'number' && Number.isFinite(entry.timeoutMs)
              ? entry.timeoutMs
              : 10000,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    return {
      ...defaults,
      ollama: {
        ...defaults.ollama,
        baseUrl: config.get<string>('ollama.baseUrl', defaults.ollama.baseUrl),
        model:
          this.selectedModelOverride ??
          config.get<string>('ollama.model', defaults.ollama.model),
        visionModel: config.get<string>('ollama.visionModel', defaults.ollama.visionModel),
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
      mcp: {
        ...defaults.mcp,
        enabled: config.get<boolean>('mcp.enabled', defaults.mcp.enabled),
        servers: mcpServers,
      },
      rag: {
        ...defaults.rag,
        strictCitations: config.get<boolean>('rag.strictCitations', defaults.rag.strictCitations),
        trustedDomains: config.get<string[]>('rag.trustedDomains', defaults.rag.trustedDomains),
        trustedGitHubOrgs: config.get<string[]>(
          'rag.trustedGitHubOrgs',
          defaults.rag.trustedGitHubOrgs
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
