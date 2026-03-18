import { escapeHtml } from './chatPanel';
import type { UiContextReference, UiDiffChange, UiPlan } from '../webview';

export function renderPlanCard(plan?: UiPlan): string {
  if (!plan) {
    return '<div class="empty-state small">No active plan.</div>';
  }

  const steps = plan.steps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('');
  const guardrails = plan.guardrails
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

  return [
    '<div class="card-block">',
    `<div class="card-title">${escapeHtml(plan.intent)} plan</div>`,
    `<p class="card-text">${escapeHtml(plan.summary)}</p>`,
    `<p class="card-text muted">${escapeHtml(plan.goal)}</p>`,
    '<ul class="compact-list">',
    steps,
    '</ul>',
    '<div class="card-subtitle">Guardrails</div>',
    '<ul class="compact-list">',
    guardrails,
    '</ul>',
    '</div>',
  ].join('');
}

export function renderContextReferences(references: UiContextReference[]): string {
  if (references.length === 0) {
    return '<div class="empty-state small">No retrieved files yet.</div>';
  }

  return references
    .map(
      (reference) => [
        '<div class="context-chip">',
        `<span class="context-path">${escapeHtml(reference.path)}</span>`,
        `<span class="context-meta">${escapeHtml(reference.source)}</span>`,
        '</div>',
      ].join('')
    )
    .join('');
}

export function renderDiffPreview(changes: UiDiffChange[]): string {
  if (changes.length === 0) {
    return '<div class="empty-state small">No diff preview pending.</div>';
  }

  return changes
    .map((change) =>
      [
        '<article class="diff-card">',
        `<div class="diff-header"><span>${escapeHtml(change.path)}</span><span class="diff-op">${escapeHtml(change.operation)}</span></div>`,
        `<div class="diff-summary">${escapeHtml(change.summary)}</div>`,
        `<pre class="diff-body">${escapeHtml(change.diff)}</pre>`,
        '</article>',
      ].join('')
    )
    .join('');
}
