"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWebviewHtml = buildWebviewHtml;
function buildWebviewHtml(nonce, state) {
    const initialState = state ?? {
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Klyr</title>
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

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.05em;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
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

    .message-bubble {
      max-width: 70%;
      padding: 10px 14px;
      border-radius: 12px;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .message.user .message-bubble {
      background: linear-gradient(135deg, #0055aa, #0077dd);
      color: var(--text);
    }

    .message.assistant .message-bubble {
      background: rgba(23, 33, 49, 0.8);
      border: 1px solid rgba(35, 49, 69, 0.8);
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
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: #0d1117;
      border: 0;
      border-radius: 8px;
      padding: 8px 16px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
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
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-left">
        <div class="status-indicator"></div>
        <div class="logo">Klyr</div>
      </div>
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
            <button id="sendButton">Send</button>
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
          <div class="section">
            <div class="section-title">Diff Preview</div>
            <div id="diffSection" class="item">No changes pending</div>
            <div id="diffActions" style="display:none; margin-top: 10px; gap: 8px;">
              <button id="acceptDiff" style="flex:1;">Apply</button>
              <button class="secondary" id="rejectDiff" style="flex:1;">Reject</button>
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

    function renderDiff() {
      if (!state.diffPreview || state.diffPreview.length === 0) {
        diffEl.textContent = 'No changes pending';
        diffActionsEl.style.display = 'none';
        return;
      }
      diffActionsEl.style.display = 'flex';
      diffEl.innerHTML = state.diffPreview.map(change => 
        '<div style="font-size:11px; padding:6px; background:rgba(9,14,20,0.5); border-radius:6px; margin-bottom:6px;">' +
        '<div style="color:#7bdff6;">' + escapeHtml(change.path) + '</div>' +
        '<div style="color:#9fb0c3; margin-top:2px;">' + escapeHtml(change.operation) + '</div>' +
        '</div>'
      ).join('');
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
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
//# sourceMappingURL=webview.js.map