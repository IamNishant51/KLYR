"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPlanCard = renderPlanCard;
exports.renderContextReferences = renderContextReferences;
exports.renderDiffPreview = renderDiffPreview;
const chatPanel_1 = require("./chatPanel");
function renderPlanCard(plan) {
    if (!plan) {
        return '<div class="empty-state small">No active plan.</div>';
    }
    const steps = plan.steps
        .map((step) => `<li>${(0, chatPanel_1.escapeHtml)(step)}</li>`)
        .join('');
    const guardrails = plan.guardrails
        .map((item) => `<li>${(0, chatPanel_1.escapeHtml)(item)}</li>`)
        .join('');
    return [
        '<div class="card-block">',
        `<div class="card-title">${(0, chatPanel_1.escapeHtml)(plan.intent)} plan</div>`,
        `<p class="card-text">${(0, chatPanel_1.escapeHtml)(plan.summary)}</p>`,
        `<p class="card-text muted">${(0, chatPanel_1.escapeHtml)(plan.goal)}</p>`,
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
function renderContextReferences(references) {
    if (references.length === 0) {
        return '<div class="empty-state small">No retrieved files yet.</div>';
    }
    return references
        .map((reference) => [
        '<div class="context-chip">',
        `<span class="context-path">${(0, chatPanel_1.escapeHtml)(reference.path)}</span>`,
        `<span class="context-meta">${(0, chatPanel_1.escapeHtml)(reference.source)}</span>`,
        '</div>',
    ].join(''))
        .join('');
}
function renderDiffPreview(changes) {
    if (changes.length === 0) {
        return '<div class="empty-state small">No diff preview pending.</div>';
    }
    return changes
        .map((change) => [
        '<article class="diff-card">',
        `<div class="diff-header"><span>${(0, chatPanel_1.escapeHtml)(change.path)}</span><span class="diff-op">${(0, chatPanel_1.escapeHtml)(change.operation)}</span></div>`,
        `<div class="diff-summary">${(0, chatPanel_1.escapeHtml)(change.summary)}</div>`,
        `<pre class="diff-body">${(0, chatPanel_1.escapeHtml)(change.diff)}</pre>`,
        '</article>',
    ].join(''))
        .join('');
}
//# sourceMappingURL=diffPreview.js.map