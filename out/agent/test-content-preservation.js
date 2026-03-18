"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const ollamaCoder_1 = require("./ollamaCoder");
const originalReadme = [
    '# README',
    '',
    'This is a long README with lots of content.',
    '',
    '## Section 1',
    'Content here.',
    '',
    '## Section 2',
    'More content.',
    '',
    '## Section 3',
    'Even more content.',
].join('\n');
class MockOllamaClient {
    async chat(_) {
        return {
            content: JSON.stringify({
                summary: 'Added NISHANT to README',
                rationale: 'User requested adding their name to README',
                followUpQuestions: [],
                changes: [
                    {
                        path: 'README.md',
                        summary: 'Added author name',
                        diff: '@@ insert maintainer line',
                        operation: 'update',
                        originalContent: originalReadme,
                        proposedContent: `Maintainer: NISHANT\n${originalReadme}`,
                    },
                ],
            }),
            done: true,
        };
    }
    async chatStream() {
        return;
    }
    async listModels() {
        return { models: [{ name: 'test-model' }] };
    }
}
suite('Content Preservation', () => {
    test('should preserve all content when adding to README', async () => {
        const coder = new ollamaCoder_1.OllamaCoder({
            client: new MockOllamaClient(),
            model: 'test-model',
            temperature: 0,
        });
        const plan = {
            intent: 'edit',
            mode: 'edit',
            goal: 'Apply requested README edit safely.',
            summary: 'Add maintainer name to README.',
            requiresWrite: true,
            requiresUserClarification: false,
            questions: [],
            targetHints: ['README.md'],
            guardrails: [],
            steps: [],
        };
        const result = await coder.generate({
            prompt: 'Add "NISHANT" to the top of README.md',
            plan,
            context: {
                files: [
                    {
                        path: 'README.md',
                        content: originalReadme,
                        reason: 'target file',
                    },
                ],
                workspace: {
                    root: '/tmp/workspace',
                    workspaceSummary: 'README focused workspace',
                    dependencyAllowlist: [],
                    openFiles: ['README.md'],
                    retrievedPaths: ['README.md'],
                },
                memory: '',
            },
            deterministic: true,
        });
        const readmeChange = result.changes.find((change) => change.path === 'README.md');
        assert.ok(readmeChange, 'README change should be present');
        assert.ok(readmeChange.proposedContent, 'proposedContent should be present');
        assert.ok(readmeChange.proposedContent?.includes(originalReadme), 'All original content must be preserved');
    });
});
//# sourceMappingURL=test-content-preservation.js.map