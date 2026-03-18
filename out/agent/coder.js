"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoopCoder = void 0;
class NoopCoder {
    async generate(_) {
        return {
            changes: [],
            summary: 'No changes generated.',
            rationale: 'Code generation not implemented yet.',
            followUpQuestions: [],
        };
    }
    async answer(_) {
        return {
            content: 'Answer generation not implemented yet.',
            citations: [],
        };
    }
    async completeInline(_) {
        return '';
    }
}
exports.NoopCoder = NoopCoder;
//# sourceMappingURL=coder.js.map