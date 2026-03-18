"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWebviewHtml = buildWebviewHtml;
const chatPanel_1 = require("./components/chatPanel");
const diffPreview_1 = require("./components/diffPreview");
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
      --panel-soft: #172131;
      --panel-border: #233145;
      --accent: #7bdff6;
      --accent-strong: #37c7e6;
      --text: #e6edf3;
      --muted: #9fb0c3;
      --success: #7ee787;
      --warning: #f2cc60;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background:
        radial-gradient(circle at top right, rgba(123, 223, 246, 0.08), transparent 28%),
        linear-gradient(180deg, #0a0f15 0%, var(--bg) 100%);
      color: var(--text);
      font: 13px/1.45 "Segoe UI", "IBM Plex Sans", sans-serif;
      height: 100vh;
      overflow: hidden;
    }

    .shell {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.9fr);
      gap: 14px;
      height: 100vh;
      padding: 14px;
    }

    .panel {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: rgba(18, 26, 36, 0.88);
      border: 1px solid var(--panel-border);
      border-radius: 18px;
      backdrop-filter: blur(8px);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32);
    }

    .panel-header {
      padding: 16px 18px 12px;
      border-bottom: 1px solid rgba(35, 49, 69, 0.8);
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .subtitle {
      color: var(--muted);
      margin-top: 4px;
    }

    .status-pill {
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(123, 223, 246, 0.12);
      color: var(--accent);
      border: 1px solid rgba(123, 223, 246, 0.26);
      text-transform: capitalize;
      white-space: nowrap;
    }

    .chat-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 14px 18px 6px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .message {
      border-radius: 16px;
      border: 1px solid rgba(35, 49, 69, 0.9);
      padding: 12px 14px;
      max-width: 90%;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
    }

    .message.user {
      align-self: flex-end;
      background: linear-gradient(180deg, rgba(55, 199, 230, 0.2), rgba(55, 199, 230, 0.1));
    }

    .message.assistant,
    .message.system {
      align-self: flex-start;
      background: rgba(23, 33, 49, 0.82);
    }

    .message-role {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }

    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .composer {
      padding: 12px 18px 18px;
      border-top: 1px solid rgba(35, 49, 69, 0.8);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    textarea {
      width: 100%;
      min-height: 110px;
      resize: vertical;
      border: 1px solid rgba(35, 49, 69, 0.95);
      border-radius: 14px;
      background: rgba(9, 14, 20, 0.92);
      color: var(--text);
      padding: 12px 14px;
      font: inherit;
      outline: none;
    }

    textarea:focus {
      border-color: rgba(123, 223, 246, 0.8);
      box-shadow: 0 0 0 3px rgba(123, 223, 246, 0.12);
    }

    .composer-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .hint {
      color: var(--muted);
      font-size: 12px;
    }

    button {
      border: 0;
      border-radius: 12px;
      background: linear-gradient(180deg, var(--accent), var(--accent-strong));
      color: #052732;
      font-weight: 700;
      padding: 10px 16px;
      cursor: pointer;
    }

    button.secondary {
      background: transparent;
      color: var(--text);
      border: 1px solid rgba(35, 49, 69, 0.95);
    }

    .side-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 14px 18px 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .section {
      background: rgba(16, 24, 34, 0.9);
      border: 1px solid rgba(35, 49, 69, 0.95);
      border-radius: 16px;
      padding: 14px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 10px;
    }

    .card-title {
      font-weight: 700;
      margin-bottom: 6px;
    }

    .card-subtitle {
      color: var(--muted);
      margin: 12px 0 6px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .card-text {
      margin: 0 0 8px;
      white-space: pre-wrap;
    }

    .card-text.muted {
      color: var(--muted);
    }

    .compact-list {
      margin: 0;
      padding-left: 18px;
      color: var(--text);
    }

    .context-chip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 12px;
      background: rgba(23, 33, 49, 0.82);
      border: 1px solid rgba(35, 49, 69, 0.9);
      margin-bottom: 8px;
    }

    .context-path {
      font-family: Consolas, "Courier New", monospace;
      word-break: break-word;
    }

    .context-meta,
    .diff-op {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.08em;
    }

    .diff-card {
      border: 1px solid rgba(35, 49, 69, 0.95);
      border-radius: 14px;
      background: rgba(9, 14, 20, 0.78);
      overflow: hidden;
      margin-bottom: 12px;
    }

    .diff-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(35, 49, 69, 0.95);
      font-family: Consolas, "Courier New", monospace;
    }

    .diff-summary {
      padding: 10px 12px 0;
      color: var(--muted);
    }

    .diff-body {
      margin: 0;
      padding: 10px 12px 12px;
      overflow: auto;
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      line-height: 1.45;
      color: #dce7f3;
    }

    .diff-actions {
      display: flex;
      gap: 10px;
      margin-top: 12px;
    }

    .empty-state {
      border: 1px dashed rgba(35, 49, 69, 0.95);
      border-radius: 14px;
      padding: 16px;
      color: var(--muted);
      background: rgba(9, 14, 20, 0.55);
    }

    .empty-state.small {
      padding: 12px;
      font-size: 12px;
    }

    @media (max-width: 900px) {
      .shell {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="panel">
      <header class="panel-header">
        <div class="title-row">
          <div>
            <div class="title">Klyr Local Agent</div>
            <div class="subtitle" id="statusDetail">${escapeHtml(initialState.statusDetail ?? '')}</div>
          </div>
          <div class="status-pill" id="statusPill">${escapeHtml(initialState.status)}</div>
        </div>
      </header>
      <div class="chat-scroll" id="chat">${(0, chatPanel_1.renderChatMessages)(initialState.messages)}</div>
      <div class="composer">
        <textarea id="promptInput" placeholder="Ask about the codebase, fix the current file, or request a refactor..."></textarea>
        <div class="composer-row">
          <div class="hint">Ctrl/Cmd+Enter to send. Diffed edits always require approval.</div>
          <button id="sendButton">Send</button>
        </div>
      </div>
    </section>
    <aside class="panel">
      <header class="panel-header">
        <div class="title">Plan and Review</div>
        <div class="subtitle">Sequential execution, validated changes, explicit approval.</div>
      </header>
      <div class="side-scroll">
        <section class="section">
          <div class="section-title">Plan</div>
          <div id="planSection">${(0, diffPreview_1.renderPlanCard)(initialState.plan)}</div>
        </section>
        <section class="section">
          <div class="section-title">Context</div>
          <div id="contextSection">${(0, diffPreview_1.renderContextReferences)(initialState.contextRefs)}</div>
        </section>
        <section class="section">
          <div class="section-title">Diff Preview</div>
          <div id="diffSection">${(0, diffPreview_1.renderDiffPreview)(initialState.diffPreview ?? [])}</div>
          <div class="diff-actions" id="diffActions" style="${(initialState.diffPreview ?? []).length > 0 ? '' : 'display:none;'}">
            <button id="acceptDiff">Apply</button>
            <button class="secondary" id="rejectDiff">Reject</button>
          </div>
        </section>
      </div>
    </aside>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${stateJson};

    const chatEl = document.getElementById('chat');
    const planEl = document.getElementById('planSection');
    const contextEl = document.getElementById('contextSection');
    const diffEl = document.getElementById('diffSection');
    const diffActionsEl = document.getElementById('diffActions');
    const statusPillEl = document.getElementById('statusPill');
    const statusDetailEl = document.getElementById('statusDetail');
    const promptInputEl = document.getElementById('promptInput');
    const sendButtonEl = document.getElementById('sendButton');

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderMessages(messages) {
      if (!messages.length) {
        return '<div class="empty-state">Ask Klyr to explain, refactor, fix, or complete code.</div>';
      }

      return messages.map((message) => {
        const content = escapeHtml(message.content || '').replace(/\\n/g, '<br>');
        return [
          '<article class="message ' + escapeHtml(message.role) + '">',
          '<div class="message-role">' + escapeHtml(message.role) + '</div>',
          '<div class="message-content">' + (content || '&nbsp;') + '</div>',
          '</article>',
        ].join('');
      }).join('');
    }

    function renderPlan(plan) {
      if (!plan) {
        return '<div class="empty-state small">No active plan.</div>';
      }

      const steps = (plan.steps || []).map((step) => '<li>' + escapeHtml(step) + '</li>').join('');
      const guardrails = (plan.guardrails || []).map((item) => '<li>' + escapeHtml(item) + '</li>').join('');
      return [
        '<div class="card-block">',
        '<div class="card-title">' + escapeHtml(plan.intent) + ' plan</div>',
        '<p class="card-text">' + escapeHtml(plan.summary || '') + '</p>',
        '<p class="card-text muted">' + escapeHtml(plan.goal || '') + '</p>',
        '<ul class="compact-list">' + steps + '</ul>',
        '<div class="card-subtitle">Guardrails</div>',
        '<ul class="compact-list">' + guardrails + '</ul>',
        '</div>',
      ].join('');
    }

    function renderContext(refs) {
      if (!refs.length) {
        return '<div class="empty-state small">No retrieved files yet.</div>';
      }

      return refs.map((reference) => [
        '<div class="context-chip">',
        '<span class="context-path">' + escapeHtml(reference.path) + '</span>',
        '<span class="context-meta">' + escapeHtml(reference.source) + '</span>',
        '</div>',
      ].join('')).join('');
    }

    function renderDiffs(changes) {
      if (!changes.length) {
        return '<div class="empty-state small">No diff preview pending.</div>';
      }

      return changes.map((change) => [
        '<article class="diff-card">',
        '<div class="diff-header"><span>' + escapeHtml(change.path) + '</span><span class="diff-op">' + escapeHtml(change.operation) + '</span></div>',
        '<div class="diff-summary">' + escapeHtml(change.summary || '') + '</div>',
        '<pre class="diff-body">' + escapeHtml(change.diff || '') + '</pre>',
        '</article>',
      ].join('')).join('');
    }

    function render() {
      chatEl.innerHTML = renderMessages(state.messages || []);
      planEl.innerHTML = renderPlan(state.plan);
      contextEl.innerHTML = renderContext(state.contextRefs || []);
      diffEl.innerHTML = renderDiffs(state.diffPreview || []);
      diffActionsEl.style.display = (state.diffPreview || []).length > 0 ? 'flex' : 'none';
      statusPillEl.textContent = state.status || 'idle';
      statusDetailEl.textContent = state.statusDetail || '';
      chatEl.scrollTop = chatEl.scrollHeight;
      vscode.setState(state);
    }

    function submitPrompt() {
      const text = promptInputEl.value.trim();
      if (!text) {
        return;
      }

      vscode.postMessage({ type: 'chat:submit', payload: text });
      promptInputEl.value = '';
    }

    sendButtonEl.addEventListener('click', submitPrompt);
    promptInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submitPrompt();
      }
    });

    document.getElementById('acceptDiff').addEventListener('click', () => {
      vscode.postMessage({ type: 'diff:decision', payload: 'accept' });
    });
    document.getElementById('rejectDiff').addEventListener('click', () => {
      vscode.postMessage({ type: 'diff:decision', payload: 'reject' });
    });

    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'state:update') {
        return;
      }
      state = event.data.payload || state;
      render();
    });

    const restoredState = vscode.getState();
    if (restoredState) {
      state = restoredState;
    }
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