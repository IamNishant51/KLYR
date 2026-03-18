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
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const coder_1 = require("../agent/coder");
const executor_1 = require("../agent/executor");
const planner_1 = require("../agent/planner");
const validator_1 = require("../agent/validator");
const contextEngine_1 = require("../context/contextEngine");
const embeddings_1 = require("../context/embeddings");
const retriever_1 = require("../context/retriever");
suite('Validator', () => {
    test('accepts valid TypeScript content', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { lodash: '^4.17.21' } }));
        const draft = {
            changes: [
                {
                    path: 'src/sample.ts',
                    diff: 'diff --git a/src/sample.ts b/src/sample.ts',
                    summary: 'Add sample export',
                    proposedContent: 'export const value = 1;',
                },
            ],
            summary: 'Add sample export',
            rationale: 'test',
        };
        const validator = new validator_1.BasicValidator();
        const result = await validator.validate({
            draft,
            workspaceRoot: root,
            allowedRelativePaths: [],
            allowNewFiles: true,
        });
        assert.strictEqual(result.ok, true);
    });
    test('rejects syntax errors', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({}));
        const draft = {
            changes: [
                {
                    path: 'src/bad.ts',
                    diff: 'diff --git a/src/bad.ts b/src/bad.ts',
                    summary: 'Bad content',
                    proposedContent: 'export const = ;',
                },
            ],
            summary: 'Introduce syntax error',
            rationale: 'test',
        };
        const validator = new validator_1.BasicValidator();
        const result = await validator.validate({
            draft,
            workspaceRoot: root,
            allowNewFiles: true,
        });
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some((error) => error.code === 'SYNTAX_ERROR'));
    });
    test('rejects unknown dependencies', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({}));
        const draft = {
            changes: [
                {
                    path: 'src/missing.ts',
                    diff: 'diff --git a/src/missing.ts b/src/missing.ts',
                    summary: 'Missing import',
                    proposedContent: "import nope from 'not-real-lib';\nexport const value = nope;",
                },
            ],
            summary: 'Add undeclared import',
            rationale: 'test',
        };
        const validator = new validator_1.BasicValidator();
        const result = await validator.validate({
            draft,
            workspaceRoot: root,
            allowNewFiles: true,
        });
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_DEPENDENCY'));
    });
    test('accepts valid local imports', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
        await fs.mkdir(path.join(root, 'src'), { recursive: true });
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({}));
        await fs.writeFile(path.join(root, 'src', 'util.ts'), 'export const util = 1;');
        const draft = {
            changes: [
                {
                    path: 'src/uses-util.ts',
                    diff: 'diff --git a/src/uses-util.ts b/src/uses-util.ts',
                    summary: 'Use util',
                    proposedContent: "import { util } from './util';\nexport const value = util;",
                },
            ],
            summary: 'Use local util',
            rationale: 'test',
        };
        const validator = new validator_1.BasicValidator();
        const result = await validator.validate({
            draft,
            workspaceRoot: root,
            allowNewFiles: true,
        });
        assert.strictEqual(result.ok, true);
    });
    test('rejects unsafe child process usage', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({}));
        const draft = {
            changes: [
                {
                    path: 'src/unsafe.ts',
                    diff: '',
                    summary: 'Unsafe code',
                    proposedContent: "import { exec } from 'child_process';\nexport const run = exec;",
                },
            ],
            summary: 'Unsafe code',
            rationale: 'test',
        };
        const validator = new validator_1.BasicValidator();
        const result = await validator.validate({
            draft,
            workspaceRoot: root,
            allowNewFiles: true,
        });
        assert.ok(result.errors.some((error) => error.code === 'UNSAFE_CHILD_PROCESS'));
    });
});
suite('Context Engine', () => {
    test('returns best match first', async () => {
        const engine = new contextEngine_1.InMemoryContextEngine(new embeddings_1.NaiveEmbeddingProvider());
        await engine.index([
            { id: 'a', uri: 'a', content: 'alpha cache store', updatedAt: Date.now() },
            { id: 'b', uri: 'b', content: 'zeta modal button', updatedAt: Date.now() },
        ]);
        const results = await engine.query({ query: 'cache alpha', maxResults: 1 });
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].document.id, 'a');
    });
    test('deduplicates chunked documents by path', () => {
        const documents = [
            { id: 'a#1', uri: 'src/a.ts', content: 'one', updatedAt: 1 },
            { id: 'a#2', uri: 'src/a.ts', content: 'two', updatedAt: 1 },
            { id: 'b#1', uri: 'src/b.ts', content: 'three', updatedAt: 1 },
        ];
        const deduped = (0, retriever_1.uniqueDocumentsByPath)(documents);
        assert.strictEqual(deduped.length, 2);
    });
});
suite('Planner', () => {
    test('plans edit mode for refactors', async () => {
        const planner = new planner_1.BasicPlanner();
        const plan = await planner.plan({
            prompt: 'Refactor the active file for readability',
            activeFilePath: 'src/example.ts',
        });
        assert.strictEqual(plan.mode, 'edit');
        assert.strictEqual(plan.requiresWrite, true);
        assert.ok(plan.steps.length >= 4);
    });
});
suite('Coder', () => {
    test('noop coder returns no changes', async () => {
        const coder = new coder_1.NoopCoder();
        const draft = await coder.generate({
            prompt: 'test',
            plan: {
                intent: 'test',
                mode: 'chat',
                goal: 'Answer safely.',
                summary: 'No-op.',
                requiresWrite: false,
                requiresUserClarification: false,
                questions: [],
                targetHints: [],
                guardrails: [],
                steps: [],
            },
            context: {
                files: [],
                workspace: {
                    root: '/tmp',
                    workspaceSummary: 'empty',
                    dependencyAllowlist: [],
                    openFiles: [],
                    retrievedPaths: [],
                },
                memory: 'none',
            },
            deterministic: true,
        });
        assert.strictEqual(draft.changes.length, 0);
        assert.strictEqual(draft.summary, 'No changes generated.');
    });
});
suite('Executor', () => {
    test('filesystem executor rejects changes', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
        const executor = new executor_1.FileSystemExecutor();
        const preview = await executor.preview({
            changes: [
                {
                    path: 'test.ts',
                    diff: '',
                    summary: 'test',
                    proposedContent: 'console.log("test");',
                },
            ],
            summary: 'Add test file',
            rationale: 'test',
        }, root);
        const result = await executor.apply(preview, 'reject', root);
        assert.strictEqual(result.rejected, 1);
        assert.strictEqual(result.applied, 0);
    });
    test('filesystem executor blocks path escapes', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
        const executor = new executor_1.FileSystemExecutor();
        const preview = {
            summary: 'bad',
            rationale: 'bad',
            changes: [
                {
                    path: '../../outside.ts',
                    diff: '',
                    summary: 'test',
                    proposedContent: 'bad code',
                    originalContent: '',
                    operation: 'create',
                },
            ],
        };
        const result = await executor.apply(preview, 'accept', root);
        assert.ok(result.errors.length > 0);
    });
});
//# sourceMappingURL=extension.test.js.map