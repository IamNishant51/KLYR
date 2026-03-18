import * as fs from 'fs/promises';
import * as path from 'path';
import type { CodeDraft, DraftFileChange } from './coder';

export interface PreviewChange extends DraftFileChange {
  originalContent: string;
  proposedContent: string;
  operation: 'create' | 'update' | 'delete';
}

export interface DiffPreview {
  summary: string;
  rationale: string;
  changes: PreviewChange[];
}

export interface ApplyResult {
  applied: number;
  rejected: number;
  changedPaths: string[];
  errors: Array<{ path: string; message: string }>;
}

export type ApplyDecision = 'accept' | 'reject';

export interface Executor {
  preview(draft: CodeDraft, workspaceRoot: string): Promise<DiffPreview>;
  apply(
    preview: DiffPreview,
    decision: ApplyDecision,
    workspaceRoot: string
  ): Promise<ApplyResult>;
}

export class FileSystemExecutor implements Executor {
  async preview(draft: CodeDraft, workspaceRoot: string): Promise<DiffPreview> {
    const changes: PreviewChange[] = [];

    for (const change of draft.changes) {
      const resolvedPath = this.resolveWorkspacePath(workspaceRoot, change.path);
      const originalContent = await this.readExistingContent(resolvedPath);
      const proposedContent = change.proposedContent ?? '';
      const operation = change.operation ?? (originalContent ? 'update' : 'create');

      changes.push({
        ...change,
        operation,
        originalContent,
        proposedContent,
        diff: buildDiff(change.path, originalContent, proposedContent),
      });
    }

    return {
      summary: draft.summary,
      rationale: draft.rationale,
      changes,
    };
  }

  async apply(
    preview: DiffPreview,
    decision: ApplyDecision,
    workspaceRoot: string
  ): Promise<ApplyResult> {
    const result: ApplyResult = {
      applied: 0,
      rejected: 0,
      changedPaths: [],
      errors: [],
    };

    if (decision === 'reject') {
      result.rejected = preview.changes.length;
      return result;
    }

    for (const change of preview.changes) {
      try {
        const filePath = this.resolveWorkspacePath(workspaceRoot, change.path);

        if (!this.isWithinWorkspace(filePath, workspaceRoot)) {
          result.errors.push({
            path: change.path,
            message: 'Path escapes workspace root.',
          });
          continue;
        }

        if (change.operation === 'delete') {
          result.errors.push({
            path: change.path,
            message: 'Delete operations are not enabled.',
          });
          continue;
        }

        if (!change.proposedContent) {
          result.errors.push({
            path: change.path,
            message: 'Missing proposed content.',
          });
          continue;
        }

        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, change.proposedContent, 'utf-8');
        result.applied += 1;
        result.changedPaths.push(change.path);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error.';
        result.errors.push({
          path: change.path,
          message,
        });
      }
    }

    return result;
  }

  private resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
    return path.resolve(workspaceRoot, relativePath);
  }

  private isWithinWorkspace(candidatePath: string, workspaceRoot: string): boolean {
    const normalizedRoot = path.resolve(workspaceRoot);
    const normalizedCandidate = path.resolve(candidatePath);

    return (
      normalizedCandidate === normalizedRoot ||
      normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
    );
  }

  private async readExistingContent(candidatePath: string): Promise<string> {
    try {
      return await fs.readFile(candidatePath, 'utf-8');
    } catch {
      return '';
    }
  }
}

export class PreviewOnlyExecutor implements Executor {
  async preview(draft: CodeDraft): Promise<DiffPreview> {
    return {
      summary: draft.summary,
      rationale: draft.rationale,
      changes: draft.changes.map((change) => ({
        ...change,
        operation: change.operation ?? 'update',
        originalContent: change.originalContent ?? '',
        proposedContent: change.proposedContent ?? '',
      })),
    };
  }

  async apply(_: DiffPreview, decision: ApplyDecision): Promise<ApplyResult> {
    return {
      applied: 0,
      rejected: decision === 'reject' ? 1 : 0,
      changedPaths: [],
      errors: [],
    };
  }
}

function buildDiff(pathLabel: string, originalContent: string, proposedContent: string): string {
  const originalLines = splitLines(originalContent);
  const proposedLines = splitLines(proposedContent);

  let prefix = 0;
  while (
    prefix < originalLines.length &&
    prefix < proposedLines.length &&
    originalLines[prefix] === proposedLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix + prefix < originalLines.length &&
    suffix + prefix < proposedLines.length &&
    originalLines[originalLines.length - 1 - suffix] === proposedLines[proposedLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = originalLines.slice(prefix, Math.max(prefix, originalLines.length - suffix));
  const added = proposedLines.slice(prefix, Math.max(prefix, proposedLines.length - suffix));
  const contextBefore = originalLines.slice(Math.max(0, prefix - 2), prefix);
  const contextAfter = originalLines.slice(
    Math.max(prefix, originalLines.length - suffix),
    Math.min(originalLines.length, originalLines.length - suffix + 2)
  );

  const lines = [`--- a/${pathLabel}`, `+++ b/${pathLabel}`];

  if (removed.length === 0 && added.length === 0) {
    lines.push('@@ -1,0 +1,0 @@');
    lines.push('  No textual changes.');
    return lines.join('\n');
  }

  lines.push(`@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`);
  for (const line of contextBefore) {
    lines.push(` ${line}`);
  }
  for (const line of removed) {
    lines.push(`-${line}`);
  }
  for (const line of added) {
    lines.push(`+${line}`);
  }
  for (const line of contextAfter) {
    lines.push(` ${line}`);
  }

  return lines.join('\n');
}

function splitLines(value: string): string[] {
  if (!value) {
    return [];
  }

  return value.replace(/\r\n/g, '\n').split('\n');
}
