"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasicPlanner = void 0;
class BasicPlanner {
    async plan(input) {
        const intent = this.extractIntent(input.prompt, input.userIntentHint);
        const mode = this.determineMode(intent, input.modeHint);
        const requiresWrite = mode === 'edit';
        const clarification = this.getClarification(input.prompt, input.activeFilePath, mode);
        return {
            intent,
            mode,
            goal: this.describeGoal(intent, input.prompt),
            summary: this.buildSummary(intent, mode, requiresWrite),
            requiresWrite,
            requiresUserClarification: clarification.questions.length > 0,
            clarificationReason: clarification.reason,
            questions: clarification.questions,
            targetHints: this.collectTargetHints(input.prompt, input.activeFilePath),
            guardrails: this.buildGuardrails(mode),
            steps: this.planSteps(intent, mode),
        };
    }
    extractIntent(prompt, hint) {
        const lower = `${hint ?? ''} ${prompt}`.toLowerCase();
        const hasNegatedDelete = /\b(don't|dont|do not|never)\s+(delete|remove)\b/.test(lower) ||
            /\bwithout\s+(deleting|removing)\b/.test(lower);
        const hasDeleteTerms = this.includesAny(lower, ['delete', 'remove']);
        if (this.includesAny(lower, ['inline', 'complete', 'autocomplete', 'ghost text'])) {
            return 'inline';
        }
        if (this.includesAny(lower, ['refactor', 'cleanup', 'clean up'])) {
            return 'refactor';
        }
        if (this.includesAny(lower, ['fix', 'bug', 'repair'])) {
            return 'fix';
        }
        if (this.includesAny(lower, ['optimize', 'performance', 'faster'])) {
            return 'optimize';
        }
        if (this.includesAny(lower, ['test', 'spec', 'unit test'])) {
            return 'test';
        }
        if (this.includesAny(lower, ['document', 'comment', 'docstring'])) {
            return 'document';
        }
        if (this.includesAny(lower, ['enable', 'disable', 'feature', 'implement'])) {
            return 'feature';
        }
        if (this.includesAny(lower, ['create', 'add', 'new file'])) {
            return 'create';
        }
        if (hasDeleteTerms && !hasNegatedDelete) {
            return 'delete';
        }
        if (this.includesAny(lower, ['why', 'what', 'how', 'explain', 'summarize'])) {
            return 'explain';
        }
        return 'unknown';
    }
    determineMode(intent, modeHint) {
        if (modeHint) {
            return modeHint;
        }
        if (intent === 'inline') {
            return 'inline';
        }
        if (['refactor', 'fix', 'optimize', 'test', 'feature', 'delete', 'create'].includes(intent)) {
            return 'edit';
        }
        return 'chat';
    }
    collectTargetHints(prompt, activeFilePath) {
        const hints = new Set();
        if (activeFilePath) {
            hints.add(activeFilePath);
        }
        for (const match of prompt.matchAll(/[\w./-]+\.(ts|tsx|js|jsx|json|md|css|scss|html)/gi)) {
            hints.add(match[0]);
        }
        return [...hints];
    }
    getClarification(prompt, activeFilePath, mode) {
        const trimmed = prompt.trim();
        const lower = trimmed.toLowerCase();
        if (trimmed.length < 4) {
            return {
                reason: 'The request is too short to execute safely.',
                questions: ['What should I change, and which file or feature should I focus on?'],
            };
        }
        if (mode === 'edit' &&
            !activeFilePath &&
            this.includesAny(lower, ['this', 'current file', 'selected code', 'here'])) {
            return {
                reason: 'The request references the current editor, but no active file is available.',
                questions: ['Open the target file, then resend the request so I can edit the right code.'],
            };
        }
        return { questions: [] };
    }
    describeGoal(intent, prompt) {
        switch (intent) {
            case 'refactor':
                return 'Improve code structure without changing intended behavior.';
            case 'fix':
                return 'Resolve a bug or broken behavior deterministically.';
            case 'optimize':
                return 'Improve performance or reduce complexity safely.';
            case 'test':
                return 'Create or update tests around existing behavior.';
            case 'feature':
                return 'Implement a requested feature using verified project context.';
            case 'create':
                return 'Add a new file or component aligned with workspace patterns.';
            case 'explain':
                return 'Answer the question using retrieved workspace context only.';
            case 'inline':
                return 'Continue the current edit with a minimal deterministic completion.';
            default:
                return `Respond safely to the request: ${prompt.trim()}`;
        }
    }
    buildSummary(intent, mode, requiresWrite) {
        const action = mode === 'chat'
            ? 'retrieve context and answer directly'
            : mode === 'inline'
                ? 'retrieve local context and suggest a small completion'
                : 'retrieve context, generate edits, validate them, and wait for approval';
        return `Intent: ${intent}. Mode: ${mode}. I will ${action}. Write required: ${requiresWrite ? 'yes' : 'no'}.`;
    }
    buildGuardrails(mode) {
        const guardrails = [
            'Use only verified workspace context and declared dependencies.',
            'Prefer deterministic output and avoid speculative APIs.',
        ];
        if (mode === 'edit') {
            guardrails.push('Validate syntax, imports, and unsafe patterns before previewing changes.');
            guardrails.push('Never apply edits without an explicit diff review.');
        }
        if (mode === 'chat') {
            guardrails.push('If the context is insufficient, say so instead of guessing.');
        }
        return guardrails;
    }
    planSteps(intent, mode) {
        if (mode === 'chat') {
            return [
                {
                    id: '1',
                    title: 'Plan',
                    description: 'Classify the request and determine the safest response path.',
                    tool: 'planner',
                    expectedOutput: 'intent and response mode',
                },
                {
                    id: '2',
                    title: 'Retrieve',
                    description: 'Pull the most relevant files, symbols, and memory entries.',
                    tool: 'context',
                    expectedOutput: 'bounded context packet',
                },
                {
                    id: '3',
                    title: 'Answer',
                    description: 'Answer using only retrieved context and cite what was used.',
                    tool: 'coder',
                    expectedOutput: 'context-grounded answer',
                },
            ];
        }
        if (mode === 'inline') {
            return [
                {
                    id: '1',
                    title: 'Plan',
                    description: 'Identify completion intent from nearby code.',
                    tool: 'planner',
                    expectedOutput: 'inline completion strategy',
                },
                {
                    id: '2',
                    title: 'Retrieve',
                    description: 'Use local file context plus nearby workspace references.',
                    tool: 'context',
                    expectedOutput: 'cursor-aware context',
                },
                {
                    id: '3',
                    title: 'Complete',
                    description: 'Generate a minimal insertion that continues the current code.',
                    tool: 'coder',
                    expectedOutput: 'inline text completion',
                },
            ];
        }
        const editGoal = intent === 'test'
            ? 'Generate tests aligned with existing project patterns.'
            : 'Produce validated code edits grounded in the workspace.';
        return [
            {
                id: '1',
                title: 'Plan',
                description: 'Break the request into deterministic editing steps.',
                tool: 'planner',
                expectedOutput: 'execution plan',
            },
            {
                id: '2',
                title: 'Retrieve',
                description: 'Gather active-file, workspace, and memory context relevant to the task.',
                tool: 'context',
                expectedOutput: 'retrieved file set',
            },
            {
                id: '3',
                title: 'Generate',
                description: editGoal,
                tool: 'coder',
                expectedOutput: 'structured code draft',
            },
            {
                id: '4',
                title: 'Validate',
                description: 'Check syntax, imports, and unsafe patterns before execution.',
                tool: 'validator',
                expectedOutput: 'validated or rejected draft',
            },
            {
                id: '5',
                title: 'Review',
                description: 'Prepare a diff preview and wait for user approval.',
                tool: 'executor',
                expectedOutput: 'previewable diff',
            },
        ];
    }
    includesAny(input, values) {
        return values.some((value) => input.includes(value));
    }
}
exports.BasicPlanner = BasicPlanner;
//# sourceMappingURL=planner.js.map