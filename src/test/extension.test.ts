import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { NoopCoder, type CodeDraft } from '../agent/coder';
import { FileSystemExecutor } from '../agent/executor';
import { BasicPlanner } from '../agent/planner';
import { BasicValidator } from '../agent/validator';
import {
  InMemoryContextEngine,
  type ContextDocument,
} from '../context/contextEngine';
import { NaiveEmbeddingProvider } from '../context/embeddings';
import { uniqueDocumentsByPath } from '../context/retriever';

suite('Validator', () => {
  test('accepts valid TypeScript content', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { lodash: '^4.17.21' } })
    );

    const draft: CodeDraft = {
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

    const validator = new BasicValidator();
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

    const draft: CodeDraft = {
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

    const validator = new BasicValidator();
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

    const draft: CodeDraft = {
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

    const validator = new BasicValidator();
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

    const draft: CodeDraft = {
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

    const validator = new BasicValidator();
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

    const draft: CodeDraft = {
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

    const validator = new BasicValidator();
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
    const engine = new InMemoryContextEngine(new NaiveEmbeddingProvider());
    await engine.index([
      { id: 'a', uri: 'a', content: 'alpha cache store', updatedAt: Date.now() },
      { id: 'b', uri: 'b', content: 'zeta modal button', updatedAt: Date.now() },
    ]);

    const results = await engine.query({ query: 'cache alpha', maxResults: 1 });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].document.id, 'a');
  });

  test('deduplicates chunked documents by path', () => {
    const documents: ContextDocument[] = [
      { id: 'a#1', uri: 'src/a.ts', content: 'one', updatedAt: 1 },
      { id: 'a#2', uri: 'src/a.ts', content: 'two', updatedAt: 1 },
      { id: 'b#1', uri: 'src/b.ts', content: 'three', updatedAt: 1 },
    ];

    const deduped = uniqueDocumentsByPath(documents);
    assert.strictEqual(deduped.length, 2);
  });
});

suite('Planner', () => {
  test('plans edit mode for refactors', async () => {
    const planner = new BasicPlanner();
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
    const coder = new NoopCoder();
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
    const executor = new FileSystemExecutor();
    const preview = await executor.preview(
      {
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
      },
      root
    );

    const result = await executor.apply(preview, 'reject', root);
    assert.strictEqual(result.rejected, 1);
    assert.strictEqual(result.applied, 0);
  });

  test('filesystem executor blocks path escapes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'klyr-'));
    const executor = new FileSystemExecutor();
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
          operation: 'create' as const,
        },
      ],
    };

    const result = await executor.apply(preview, 'accept', root);
    assert.ok(result.errors.length > 0);
  });
});
