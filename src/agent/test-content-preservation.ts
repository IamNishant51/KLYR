import * as assert from 'assert';
import { OllamaCoder } from './ollamaCoder';
import type { OllamaChatRequest, OllamaClient } from '../llm/ollamaClient';
import type { PlanResult } from './planner';

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

class MockOllamaClient implements OllamaClient {
  async chat(_: OllamaChatRequest) {
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

  async chatStream(): Promise<void> {
    return;
  }

  async listModels() {
    return { models: [{ name: 'test-model' }] };
  }
}

suite('Content Preservation', () => {
  test('should preserve all content when adding to README', async () => {
    const coder = new OllamaCoder({
      client: new MockOllamaClient(),
      model: 'test-model',
      temperature: 0,
    });

    const plan: PlanResult = {
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
    assert.ok(
      readmeChange.proposedContent?.includes(originalReadme),
      'All original content must be preserved'
    );
  });
});
