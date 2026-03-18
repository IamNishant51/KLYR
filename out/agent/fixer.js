"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFixerLoop = runFixerLoop;
async function runFixerLoop(input) {
    let attempt = 0;
    let lastErrors = [];
    let lastDraft;
    while (attempt < input.maxAttempts) {
        attempt += 1;
        const draft = await input.coder.generate({
            ...input.initialInput,
            validationErrors: lastErrors,
        });
        const validation = await input.validator.validate({
            draft,
            workspaceRoot: input.workspaceRoot,
            ...input.validationContext,
        });
        const contentLossErrors = checkDraftForContentLoss(draft);
        if (contentLossErrors.length > 0) {
            lastErrors = [...validation.errors, ...contentLossErrors];
            lastDraft = draft;
            continue;
        }
        lastDraft = draft;
        lastErrors = validation.errors;
        if (validation.ok) {
            return { ok: true, draft, errors: [], attempts: attempt };
        }
    }
    return {
        ok: false,
        draft: lastDraft,
        errors: lastErrors,
        attempts: attempt,
    };
}
function checkDraftForContentLoss(draft) {
    const errors = [];
    for (const change of draft.changes) {
        if (change.operation === 'update' && change.originalContent && change.proposedContent) {
            if (change.proposedContent.length < change.originalContent.length) {
                errors.push({
                    code: 'CONTENT_LOSS_IN_DRAFT',
                    message: `Draft would lose ${change.originalContent.length - change.proposedContent.length} characters from ${change.path}`,
                    file: change.path,
                });
            }
        }
    }
    return errors;
}
//# sourceMappingURL=fixer.js.map