import type { UiChatMessage } from '../webview';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderChatMessages(messages: UiChatMessage[]): string {
  if (messages.length === 0) {
    return '<div class="empty-state">Ask Klyr to explain, refactor, fix, or complete code.</div>';
  }

  return messages
    .map((message) => {
      const safeContent = escapeHtml(message.content).replace(/\n/g, '<br>');
      return [
        `<article class="message ${message.role}">`,
        `<div class="message-role">${escapeHtml(message.role)}</div>`,
        `<div class="message-content">${safeContent || '&nbsp;'}</div>`,
        '</article>',
      ].join('');
    })
    .join('');
}
