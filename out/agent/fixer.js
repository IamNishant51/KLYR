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
//# sourceMappingURL=fixer.js.map