import { renderChatMessages } from './components/chatPanel';
import { renderContextReferences, renderDiffPreview, renderPlanCard } from './components/diffPreview';
import { getFileIcon } from './fileIcons';

export type UiStatus =
  | 'idle'
  | 'planning'
  | 'retrieving'
  | 'thinking'
  | 'validating'
  | 'review'
  | 'executing'
  | 'fixing';

export interface UiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface UiPlan {
  intent: string;
  goal: string;
  summary: string;
  steps: string[];
  requiresWrite: boolean;
  guardrails: string[];
}

export interface UiContextReference {
  path: string;
  source: string;
}

export interface UiDiffChange {
  path: string;
  diff: string;
  diffHtml?: string;
  summary: string;
  operation: 'create' | 'update' | 'delete';
  additions: number;
  deletions: number;
}

export interface WebviewState {
  messages: UiChatMessage[];
  status: UiStatus;
  statusDetail?: string;
  plan?: UiPlan;
  contextRefs: UiContextReference[];
  diffPreview?: UiDiffChange[];
  totalAdditions?: number;
  totalDeletions?: number;
}

interface UiConfig {
  mode: 'plan' | 'agent';
  selectedModel: string;
  availableModels: string[];
}

export function buildWebviewHtml(nonce: string, state?: WebviewState): string {
  const initialState: WebviewState = state ?? {
    messages: [],
    status: 'idle',
    statusDetail: '',
    contextRefs: [],
    diffPreview: [],
  };
  const stateJson = JSON.stringify(initialState).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Klyr</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@vscode/codicons@0.0.25/dist/codicon.css">
  <style>
    :root {
      color-scheme: dark;
      --bg: #0d1117;
      --panel: #121a24;
      --accent: #7bdff6;
      --accent-strong: #37c7e6;
      --text: #e6edf3;
      --muted: #9fb0c3;
      --success: #7ee787;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font: 13px/1.45 "Segoe UI", "IBM Plex Sans", sans-serif;
      height: 100vh;
      overflow: hidden;
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--bg);
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(35, 49, 69, 0.5);
      background: rgba(18, 26, 36, 0.5);
      flex-shrink: 0;
    }

    .logo {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.05em;
    }

    .header-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    select {
      background: rgba(23, 33, 49, 0.8);
      color: var(--text);
      border: 1px solid rgba(35, 49, 69, 0.8);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
      outline: none;
    }

    select:hover {
      border-color: rgba(35, 49, 69, 1);
    }

    select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(123, 223, 246, 0.1);
    }

    select option {
      background: var(--panel);
      color: var(--text);
    }

    .content {
      display: flex;
      flex: 1;
      min-height: 0;
      gap: 0;
    }

    .chat-panel {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      border-right: 1px solid rgba(35, 49, 69, 0.5);
    }

    .messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
    }

    .message {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      animation: slideIn 0.2s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

     .message.user {
       justify-content: flex-end;
     }
     
     .message.user .message-bubble {
       background: rgba(30, 40, 50, 0.7);
       border: 1px solid rgba(255, 255, 255, 0.1);
       color: var(--text);
       border-radius: 12px;
       padding: 10px 14px;
       max-width: 70%;
       word-wrap: break-word;
       white-space: pre-wrap;
     }
     
     .message.assistant {
       justify-content: flex-start;
     }
     
     .message.assistant .message-bubble {
       background: rgba(20, 25, 35, 0.7);
       border: 1px solid rgba(255, 255, 255, 0.08);
       color: var(--text);
       border-radius: 12px;
       padding: 10px 14px;
       max-width: 70%;
       word-wrap: break-word;
       white-space: pre-wrap;
     }

    .message-bubble {
      max-width: 70%;
      padding: 10px 14px;
      border-radius: 12px;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

     .message.user .message-bubble {
       background: rgba(30, 40, 50, 0.7);
       border: 1px solid rgba(255, 255, 255, 0.1);
       color: var(--text);
     }
     
     .message.assistant .message-bubble {
       background: rgba(20, 25, 35, 0.7);
       border: 1px solid rgba(255, 255, 255, 0.08);
       color: var(--text);
     }

    .empty-chat {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--muted);
      text-align: center;
    }

    .empty-chat-icon {
      font-size: 36px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .composer-section {
      padding: 16px;
      border-top: 1px solid rgba(35, 49, 69, 0.5);
      background: rgba(18, 26, 36, 0.5);
      flex-shrink: 0;
    }

    textarea {
      width: 100%;
      min-height: 90px;
      max-height: 200px;
      resize: vertical;
      background: rgba(9, 14, 20, 0.8);
      color: var(--text);
      border: 1px solid rgba(35, 49, 69, 0.8);
      border-radius: 8px;
      padding: 10px 12px;
      font: inherit;
      outline: none;
      margin-bottom: 8px;
    }

    textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(123, 223, 246, 0.1);
    }

    .composer-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .hint {
      color: var(--muted);
      font-size: 11px;
    }

      button {
        background: linear-gradient(135deg, #238636, #2ea043);
        color: #0d1117;
        border: 0;
        border-radius: 6px;
        padding: 10px 20px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      button:hover {
        background: linear-gradient(135deg, #2ea043, #3fb950);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(46, 160, 67, 0.3);
      }
      
      button:active {
        transform: translateY(0);
      }
      
      .btn-send {
        background: white;
        color: #238636;
        border: 1px solid #238636;
        border-radius: 6px;
        padding: 10px 20px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .btn-send:hover {
        background: rgba(35, 134, 54, 0.05);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(46, 160, 67, 0.2);
      }
      
      .btn-send:active {
        transform: translateY(0);
      }
      
      button.secondary {
        background: transparent;
        color: var(--text);
        border: 1px solid rgba(35, 49, 69, 0.8);
      }
      
      button.secondary:hover {
        background: rgba(35, 49, 69, 0.2);
        box-shadow: none;
      }

    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(123, 223, 246, 0.3);
    }

    button:active {
      transform: translateY(0);
    }

    button.secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid rgba(35, 49, 69, 0.8);
    }

    button.secondary:hover {
      background: rgba(35, 49, 69, 0.2);
      box-shadow: none;
    }

    .sidebar {
      width: 320px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: rgba(18, 26, 36, 0.3);
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid rgba(35, 49, 69, 0.5);
      font-weight: 600;
      font-size: 13px;
    }

    .sidebar-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section {
      background: rgba(9, 14, 20, 0.6);
      border: 1px solid rgba(35, 49, 69, 0.5);
      border-radius: 10px;
      padding: 12px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 10px;
    }

    .item {
      font-size: 12px;
      padding: 6px;
      border-radius: 6px;
      color: var(--muted);
      word-break: break-word;
    }

    .item-path {
      font-family: "Consolas", "Courier New", monospace;
    }

    @media (max-width: 768px) {
      .content {
        flex-direction: column;
      }

      .chat-panel {
        border-right: none;
        border-bottom: 1px solid rgba(35, 49, 69, 0.5);
      }

      .sidebar {
        width: 100%;
        height: 200px;
      }
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(123, 223, 246, 0.3);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: rgba(123, 223, 246, 0.5);
    }

    /* Diff Preview Styles - Copilot-style */
    .diff-container {
      background: var(--panel);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 12px;
    }

    /* Summary header like Copilot */
    .diff-summary-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 14px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
    }

    .diff-summary-changes {
      font-weight: 600;
      color: #e6edf3;
    }

    .diff-summary-files {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      flex: 1;
    }

    .diff-file-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      font-size: 11px;
      color: #9fb0c3;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .diff-file-chip .codicon {
      font-size: 14px;
      flex-shrink: 0;
    }

    .diff-file-header {
      display: flex;
      align-items: center;
      padding: 8px 14px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .diff-file-icon {
      font-size: 16px;
      margin-right: 8px;
      flex-shrink: 0;
    }

    .diff-file-status {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      margin-right: 10px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .diff-file-status.create {
      background: rgba(126, 231, 135, 0.25);
      color: #7ee787;
    }

    .diff-file-status.update {
      background: rgba(123, 223, 246, 0.25);
      color: #7bdff6;
    }

    .diff-file-status.delete {
      background: rgba(248, 81, 73, 0.25);
      color: #f85149;
    }

    .diff-file-path {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      color: #e6edf3;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .diff-stats {
      display: flex;
      gap: 10px;
      font-size: 11px;
      font-family: monospace;
      margin-left: 12px;
    }

    .diff-additions {
      color: #7ee787;
      font-weight: 600;
    }

    .diff-deletions {
      color: #f85149;
      font-weight: 600;
    }

    .diff-body {
      max-height: 300px;
      overflow-y: auto;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.5;
    }

    .diff-line {
      display: flex;
      min-height: 22px;
    }

    .diff-line-unchanged {
      background: transparent;
    }

    /* Copilot-style: prominent red/green line backgrounds */
    .diff-line-added {
      background: rgba(46, 160, 67, 0.15);
      border-left: 3px solid #2ea043;
    }

    .diff-line-added .line-prefix {
      color: #7ee787;
      background: rgba(46, 160, 67, 0.2);
    }

    .diff-line-added .line-content {
      color: #aff5b4;
    }

    .diff-line-removed {
      background: rgba(248, 81, 73, 0.12);
      border-left: 3px solid #da3633;
    }

    .diff-line-removed .line-prefix {
      color: #f85149;
      background: rgba(248, 81, 73, 0.15);
    }

    .diff-line-removed .line-content {
      color: #ffa198;
    }

    .line-num {
      min-width: 50px;
      padding: 0 10px;
      text-align: right;
      color: rgba(255, 255, 255, 0.3);
      user-select: none;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(0, 0, 0, 0.15);
    }

    .line-num.old {
      background: rgba(248, 81, 73, 0.08);
    }

    .line-num.new {
      background: rgba(46, 160, 67, 0.08);
    }

    .line-prefix {
      min-width: 24px;
      padding: 0 6px;
      text-align: center;
      user-select: none;
      font-weight: 700;
    }

    .line-content {
      flex: 1;
      padding: 0 12px;
      white-space: pre;
      overflow-x: auto;
    }

    .diff-actions {
      display: flex;
      gap: 8px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .diff-actions button {
      flex: 1;
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

     .btn-accept,
     .btn-reject,
     .btn-view {
       background: linear-gradient(135deg, #238636, #2ea043);
       color: white;
       border: none;
       border-radius: 6px;
       padding: 10px 20px;
       font-size: 13px;
       font-weight: 600;
       cursor: pointer;
       transition: all 0.2s;
     }
     
     .btn-accept:hover,
     .btn-reject:hover,
     .btn-view:hover {
       background: linear-gradient(135deg, #2ea043, #3fb950);
       transform: translateY(-1px);
       box-shadow: 0 4px 12px rgba(46, 160, 67, 0.3);
     }
     
     .btn-accept:active,
     .btn-reject:active,
     .btn-view:active {
       transform: translateY(0);
     }

    .btn-accept:hover {
      background: linear-gradient(135deg, #2ea043, #3fb950);
      transform: translateY(-1px);
    }

    .btn-reject {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .btn-reject:hover {
      background: rgba(248, 81, 73, 0.2);
      border-color: rgba(248, 81, 73, 0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="logo">Klyr</div>
      <div class="header-controls">
        <select id="modeSelect">
          <option value="agent">Agent</option>
          <option value="plan">Plan</option>
        </select>
        <select id="modelSelect"></select>
      </div>
    </header>

    <div class="content">
      <div class="chat-panel">
        <div class="messages" id="messages">
          <div class="empty-chat">
            <div class="empty-chat-icon">💬</div>
            <div>Ask me to fix, refactor, or explain your code</div>
          </div>
        </div>
        <div class="composer-section">
          <textarea id="promptInput" placeholder="Ask Klyr anything..."></textarea>
         <div class="composer-actions">
           <div class="hint">Press Ctrl/Cmd+Enter to send</div>
           <button id="sendButton" class="btn-send">Send</button>
         </div>
        </div>
      </div>

      <div class="sidebar">
        <div class="sidebar-header">Plan & Preview</div>
        <div class="sidebar-scroll">
          <div class="section">
            <div class="section-title">Plan</div>
            <div id="planSection" class="item">No plan yet</div>
          </div>
          <div class="section">
            <div class="section-title">Context</div>
            <div id="contextSection" class="item">No files retrieved</div>
          </div>
          <div class="section" style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
            <div class="section-title">Diff Preview</div>
            <div id="diffSection" style="flex: 1; overflow-y: auto; color: var(--muted); padding: 8px;">No changes pending</div>
            <div id="diffActions" style="display:none; margin-top: 10px; gap: 8px;">
              <button id="viewInEditorDiff" class="btn-view" style="display:none;">View in Editor</button>
              <button id="acceptDiff" class="btn-accept">Apply</button>
              <button id="rejectDiff" class="btn-reject">Reject</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${stateJson};
    let config = { mode: 'agent', selectedModel: '', availableModels: [] };

    const messagesEl = document.getElementById('messages');
    const promptInputEl = document.getElementById('promptInput');
    const sendButtonEl = document.getElementById('sendButton');
    const modeSelect = document.getElementById('modeSelect');
    const modelSelect = document.getElementById('modelSelect');
    const planEl = document.getElementById('planSection');
    const contextEl = document.getElementById('contextSection');
    const diffEl = document.getElementById('diffSection');
    const diffActionsEl = document.getElementById('diffActions');

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function renderMessages() {
      if (!state.messages || state.messages.length === 0) {
        messagesEl.innerHTML = '<div class="empty-chat"><div class="empty-chat-icon">💬</div><div>Ask me to fix, refactor, or explain your code</div></div>';
        return;
      }

      messagesEl.innerHTML = state.messages.map(msg => {
        const isUser = msg.role === 'user';
        return '<div class="message ' + (isUser ? 'user' : 'assistant') + '">' +
          '<div class="message-bubble">' + escapeHtml(msg.content) + '</div>' +
          '</div>';
      }).join('');

      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderPlan() {
      if (!state.plan) {
        planEl.textContent = 'No plan yet';
        return;
      }
      const steps = (state.plan.steps || []).map(s => '• ' + escapeHtml(s)).join('\\n');
      planEl.innerHTML = '<pre style="margin:0; font-size:11px; color:#9fb0c3;">' + escapeHtml(state.plan.intent + '\\n' + steps) + '</pre>';
    }

    function renderContext() {
      if (!state.contextRefs || state.contextRefs.length === 0) {
        contextEl.textContent = 'No files retrieved';
        return;
      }
      contextEl.innerHTML = state.contextRefs.map(ref => '<div style="font-size:11px; padding:4px; color:#9fb0c3;">' + escapeHtml(ref.path) + '</div>').join('');
    }

    function getFileIcon(filePath) {
      const lowerPath = filePath.toLowerCase();
      const parts = lowerPath.split('.');
      const ext = parts.length >= 2 ? parts[parts.length - 1] : '';
      
      const iconMap = {
        js: { icon: 'symbol-numeric', color: '#f7df1e', label: 'JavaScript' },
        jsx: { icon: 'symbol-numeric', color: '#61dafb', label: 'React' },
        ts: { icon: 'symbol-numeric', color: '#3178c6', label: 'TypeScript' },
        tsx: { icon: 'symbol-numeric', color: '#3178c6', label: 'React TS' },
        json: { icon: 'json', color: '#f5a623', label: 'JSON' },
        html: { icon: 'globe', color: '#e34c26', label: 'HTML' },
        css: { icon: 'paintcan', color: '#264de4', label: 'CSS' },
        scss: { icon: 'paintcan', color: '#c6538c', label: 'SCSS' },
        py: { icon: 'symbol-string', color: '#3776ab', label: 'Python' },
        java: { icon: 'coffee', color: '#b07219', label: 'Java' },
        go: { icon: 'file-code', color: '#00add8', label: 'Go' },
        rs: { icon: 'file-code', color: '#dea584', label: 'Rust' },
        md: { icon: 'book', color: '#083fa1', label: 'Markdown' },
        yaml: { icon: 'settings-gear', color: '#cb171e', label: 'YAML' },
        yml: { icon: 'settings-gear', color: '#cb171e', label: 'YAML' },
        sh: { icon: 'terminal-bash', color: '#89e051', label: 'Shell' },
        sql: { icon: 'database', color: '#e38c00', label: 'SQL' },
        vue: { icon: 'code', color: '#42b883', label: 'Vue' },
        svg: { icon: 'file-media', color: '#ffb13b', label: 'SVG' },
        png: { icon: 'file-media', color: '#a074c4', label: 'Image' },
        jpg: { icon: 'file-media', color: '#a074c4', label: 'Image' },
        txt: { icon: 'document', color: '#9fb0c3', label: 'Text' },
        xml: { icon: 'code', color: '#0060ac', label: 'XML' },
      };
      
      // Check exact filenames
      if (lowerPath.includes('package.json')) return { icon: 'package', color: '#cb171e', label: 'Package' };
      if (lowerPath.includes('vite.config')) return { icon: 'zap', color: '#646cff', label: 'Vite' };
      if (lowerPath.includes('tsconfig')) return { icon: 'symbol-numeric', color: '#3178c6', label: 'TSConfig' };
      if (lowerPath.includes('eslint')) return { icon: 'checklist', color: '#4b32c3', label: 'ESLint' };
      if (lowerPath.includes('prettier')) return { icon: 'checklist', color: '#56b3b4', label: 'Prettier' };
      if (lowerPath.includes('dockerfile')) return { icon: 'box', color: '#384d54', label: 'Docker' };
      if (lowerPath.includes('gitignore')) return { icon: 'git-branch', color: '#f14e32', label: 'Git' };
      if (lowerPath.includes('readme')) return { icon: 'book', color: '#9fb0c3', label: 'Readme' };
      if (lowerPath.includes('license')) return { icon: 'law', color: '#6d8086', label: 'License' };
      
      if (ext in iconMap) return iconMap[ext];
      return { icon: 'file-text', color: '#9fb0c3', label: 'File' };
    }

    function renderDiff() {
      if (!state.diffPreview || state.diffPreview.length === 0) {
        diffEl.innerHTML = '<div style="color: var(--muted); padding: 20px; text-align: center;">No changes pending</div>';
        diffActionsEl.style.display = 'none';
        return;
      }
      
      let html = '';
      
      // Copilot-style summary header
      const totalChanges = state.diffPreview.length;
      html += '<div class="diff-summary-header">';
      html += '<span class="diff-summary-changes">Changes: ' + totalChanges + '</span>';
      html += '<span class="diff-summary-files">';
      
      state.diffPreview.forEach((change, index) => {
        const fileInfo = getFileIcon(change.path);
        const fileName = change.path.split(/[/\\]/).pop() || change.path;
        html += '<span class="diff-file-chip">';
        html += '<span class="codicon codicon-' + fileInfo.icon + '" style="color: ' + fileInfo.color + '; font-size: 14px;"></span>';
        html += '<span title="' + escapeHtml(change.path) + '">' + escapeHtml(fileName) + '</span>';
        html += '</span>';
        if (index < totalChanges - 1) {
          html += '<span style="color: rgba(255,255,255,0.3);">•</span>';
        }
      });
      html += '</span>';
      html += '</div>';
      
      // Render each file diff
      for (const change of state.diffPreview) {
        const statusClass = change.operation === 'create' ? 'create' : change.operation === 'delete' ? 'delete' : 'update';
        const statusText = change.operation === 'create' ? 'A' : change.operation === 'delete' ? 'D' : 'M';
        const fileInfo = getFileIcon(change.path);
        
        html += '<div class="diff-container">';
        
        // File header with icon
        html += '<div class="diff-file-header">';
        html += '<span class="diff-file-icon codicon codicon-' + fileInfo.icon + '" style="color: ' + fileInfo.color + ';"></span>';
        html += '<span class="diff-file-status ' + statusClass + '">' + statusText + '</span>';
        html += '<span class="diff-file-path" title="' + escapeHtml(change.path) + '">' + escapeHtml(change.path) + '</span>';
        html += '<div class="diff-stats">';
        if (change.additions > 0) html += '<span class="diff-additions">+' + change.additions + '</span>';
        if (change.deletions > 0) html += '<span class="diff-deletions">-' + change.deletions + '</span>';
        html += '</div></div>';
        
        // Diff content with proper styling
        html += '<div class="diff-body">';
        
        if (change.diffHtml) {
          html += change.diffHtml;
        } else if (change.diff) {
          const lines = change.diff.split('\n');
          for (const line of lines) {
            if (line.startsWith('+++') || line.startsWith('---')) continue;
            
            if (line.startsWith('+') && !line.startsWith('+++')) {
              html += '<div class="diff-line diff-line-added">';
              html += '<span class="line-num"></span>';
              html += '<span class="line-num"></span>';
              html += '<span class="line-prefix">+</span>';
              html += '<span class="line-content">' + escapeHtml(line.slice(1)) + '</span>';
              html += '</div>';
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              html += '<div class="diff-line diff-line-removed">';
              html += '<span class="line-num"></span>';
              html += '<span class="line-num"></span>';
              html += '<span class="line-prefix">-</span>';
              html += '<span class="line-content">' + escapeHtml(line.slice(1)) + '</span>';
              html += '</div>';
            } else if (line.startsWith('@@')) {
              html += '<div style="background: rgba(88, 166, 255, 0.1); padding: 4px 12px; color: #58a6ff; font-size: 11px; font-family: monospace;">' + escapeHtml(line) + '</div>';
            } else if (line.startsWith(' ')) {
              html += '<div class="diff-line diff-line-unchanged">';
              html += '<span class="line-num"></span>';
              html += '<span class="line-num"></span>';
              html += '<span class="line-prefix" style="color: rgba(255,255,255,0.3);">&nbsp;</span>';
              html += '<span class="line-content" style="color: #8b949e;">' + escapeHtml(line.slice(1)) + '</span>';
              html += '</div>';
            }
          }
        } else if (change.summary) {
          html += '<div style="padding: 20px; color: var(--muted); text-align: center;">';
          html += '<div style="color: #e6edf3; margin-bottom: 8px;">' + escapeHtml(change.summary) + '</div>';
          html += '</div>';
        }
        
        html += '</div></div>';
      }
      
      diffEl.innerHTML = html;
      diffActionsEl.style.display = 'flex';
      
      const acceptBtn = document.getElementById('acceptDiff');
      const rejectBtn = document.getElementById('rejectDiff');
      const viewInEditorBtn = document.getElementById('viewInEditorDiff');
      if (acceptBtn) {
        acceptBtn.textContent = 'Apply Changes';
        acceptBtn.style.background = 'linear-gradient(135deg, #238636, #2ea043)';
        acceptBtn.style.color = 'white';
        acceptBtn.style.border = 'none';
        acceptBtn.style.padding = '10px 20px';
        acceptBtn.style.borderRadius = '6px';
        acceptBtn.style.cursor = 'pointer';
        acceptBtn.style.fontWeight = '600';
      }
      if (rejectBtn) {
        rejectBtn.textContent = 'Reject';
        rejectBtn.style.background = 'rgba(255,255,255,0.1)';
        rejectBtn.style.color = '#e6edf3';
        rejectBtn.style.border = '1px solid rgba(255,255,255,0.2)';
        rejectBtn.style.padding = '10px 20px';
        rejectBtn.style.borderRadius = '6px';
        rejectBtn.style.cursor = 'pointer';
      }
      if (viewInEditorBtn) {
        viewInEditorBtn.style.display = 'inline-block';
        viewInEditorBtn.style.background = 'rgba(123, 223, 246, 0.2)';
        viewInEditorBtn.style.color = '#7bdff6';
        viewInEditorBtn.style.border = '1px solid rgba(123, 223, 246, 0.3)';
        viewInEditorBtn.style.padding = '10px 20px';
        viewInEditorBtn.style.borderRadius = '6px';
        viewInEditorBtn.style.cursor = 'pointer';
      }
    }

    function render() {
      renderMessages();
      renderPlan();
      renderContext();
      renderDiff();
      vscode.setState(state);
    }

    async function fetchModels() {
      try {
        vscode.postMessage({ type: 'models:fetch' });
      } catch (e) {
        console.error('Failed to fetch models:', e);
      }
    }

    function submitPrompt() {
      const text = promptInputEl.value.trim();
      if (!text) return;

      vscode.postMessage({ 
        type: 'chat:submit', 
        payload: text,
        config: { mode: modeSelect.value, model: modelSelect.value }
      });
      promptInputEl.value = '';
    }

    sendButtonEl.addEventListener('click', submitPrompt);
    promptInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitPrompt();
      }
    });

    modeSelect.addEventListener('change', () => {
      config.mode = modeSelect.value;
      vscode.postMessage({ type: 'config:update', payload: config });
    });

    modelSelect.addEventListener('change', () => {
      config.selectedModel = modelSelect.value;
      vscode.postMessage({ type: 'config:update', payload: config });
    });

    document.getElementById('viewInEditorDiff').addEventListener('click', () => {
      vscode.postMessage({ type: 'diff:viewInEditor' });
    });

    document.getElementById('acceptDiff').addEventListener('click', () => {
      vscode.postMessage({ type: 'diff:decision', payload: 'accept' });
    });

    document.getElementById('rejectDiff').addEventListener('click', () => {
      vscode.postMessage({ type: 'diff:decision', payload: 'reject' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg) return;

      if (msg.type === 'state:update') {
        state = msg.payload || state;
        render();
      } else if (msg.type === 'models:list') {
        config.availableModels = msg.payload || [];
        if (config.availableModels.length > 0) {
          modelSelect.innerHTML = config.availableModels.map(m => '<option value="' + m + '">' + m + '</option>').join('');
          config.selectedModel = config.availableModels[0];
          modelSelect.value = config.selectedModel;
        }
      }
    });

    const restoredState = vscode.getState();
    if (restoredState) {
      state = restoredState;
    }

    fetchModels();
    render();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
