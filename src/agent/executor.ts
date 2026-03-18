import * as fs from 'fs/promises';
import * as path from 'path';
import type { CodeDraft, DraftFileChange } from './coder';
import type { ValidationError } from './validator';
import { generateDetailedDiff, generateUnifiedDiff, type FileDiff, type DiffLine } from './diffGenerator';

export interface PreviewChange extends DraftFileChange {
  originalContent: string;
  proposedContent: string;
  operation: 'create' | 'update' | 'delete';
  detailedDiff?: FileDiff;
  diffHtml?: string;
}

export interface DiffPreview {
  summary: string;
  rationale: string;
  changes: PreviewChange[];
  totalAdditions: number;
  totalDeletions: number;
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
  private readonly backupDirName = '.klyr-trash';

  async preview(draft: CodeDraft, workspaceRoot: string): Promise<DiffPreview> {
    const changes: PreviewChange[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const change of draft.changes) {
      const resolvedPath = this.resolveWorkspacePath(workspaceRoot, change.path);
      const diskOriginalContent = await this.readExistingContent(resolvedPath);
      let proposedContent = change.proposedContent ?? '';
      
      // Check if file already exists on disk (non-empty string means file exists)
      const fileExists = diskOriginalContent.length > 0;
      
      // Determine operation: if file exists = update, else = create
      let operation: 'create' | 'update' | 'delete' = fileExists ? 'update' : 'create';
      
      // SAFETY: If file exists but operation is "create", change to "update"
      if (fileExists && change.operation === 'create') {
        console.warn(`[KLYR] File ${change.path} already exists, changing operation from create to update`);
        operation = 'update';
      }

      // SAFETY: If update operation, ensure proposedContent includes ALL of disk's original content
      if (operation === 'update' && fileExists) {
        // Check if LLM output is just user prompt text (garbage)
        const isPromptLike = /^(add|create|update|delete|remove|fix|change|modify)\s+(my|this|the|your)/i.test(proposedContent.trim());
        
        if (isPromptLike) {
          console.warn('[KLYR] LLM output appears to be user prompt, using original content');
          proposedContent = diskOriginalContent;
        } else if (!proposedContent.includes(diskOriginalContent)) {
          console.warn('[KLYR] LLM did not preserve original content from disk, auto-restoring...');
          // LLM's proposed content doesn't include disk's original - prepend it
          proposedContent = proposedContent + '\n' + diskOriginalContent;
        }
      }

      const originalContent = diskOriginalContent;

      // Generate detailed diff like Cursor/Copilot
      const detailedDiff = generateDetailedDiff(
        change.path,
        originalContent,
        proposedContent,
        operation
      );

      totalAdditions += detailedDiff.additions;
      totalDeletions += detailedDiff.deletions;

      // Generate unified diff for compatibility
      const unifiedDiff = generateUnifiedDiff(change.path, originalContent, proposedContent);

      changes.push({
        ...change,
        operation,
        originalContent,
        proposedContent,
        diff: unifiedDiff,
        detailedDiff,
        diffHtml: this.generateDiffHtml(detailedDiff),
      });
    }

    return {
      summary: draft.summary,
      rationale: draft.rationale,
      changes,
      totalAdditions,
      totalDeletions,
    };
  }

  private generateDiffHtml(diff: FileDiff): string {
    const lines: string[] = [];

    // Header with file info and stats
    const statusIcon = diff.operation === 'create' ? '+' : diff.operation === 'delete' ? '-' : '~';
    const statusClass = diff.operation === 'create' ? 'diff-create' : diff.operation === 'delete' ? 'diff-delete' : 'diff-update';
    const statusText = diff.operation === 'create' ? 'New file' : diff.operation === 'delete' ? 'Deleted' : 'Modified';
    
    lines.push(`<div class="diff-file ${statusClass}" data-path="${this.escapeHtml(diff.filePath)}">`);
    lines.push(`<div class="diff-header">`);
    lines.push(`<span class="diff-status">${statusIcon} ${statusText}</span>`);
    lines.push(`<span class="diff-path">${this.escapeHtml(diff.filePath)}</span>`);
    lines.push(`<div class="diff-stats">`);
    if (diff.additions > 0) lines.push(`<span class="diff-additions">+${diff.additions}</span>`);
    if (diff.deletions > 0) lines.push(`<span class="diff-deletions">-${diff.deletions}</span>`);
    lines.push(`</div></div>`);

    // Line-by-line diff
    lines.push('<div class="diff-body">');
    for (const line of diff.lines) {
      const lineClass = line.type === 'added' ? 'diff-added' : line.type === 'removed' ? 'diff-removed' : 'diff-unchanged';
      
      lines.push(`<div class="diff-line ${lineClass}">`);
      lines.push(`<span class="line-num old">${line.oldLineNumber ?? ''}</span>`);
      lines.push(`<span class="line-num new">${line.newLineNumber ?? ''}</span>`);
      lines.push(`<span class="line-prefix">${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>`);
      lines.push(`<span class="line-content">${this.escapeHtml(line.content) || '&nbsp;'}</span>`);
      lines.push('</div>');
    }
    lines.push('</div></div>');

    return lines.join('\n');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

        const operation = this.resolveOperation(change);

        if (operation !== 'delete' && !change.proposedContent) {
          result.errors.push({
            path: change.path,
            message: 'Missing proposed content.',
          });
          continue;
        }

        if (operation === 'delete') {
          const existsOnDisk = await this.pathExists(filePath);
          if (!existsOnDisk) {
            result.errors.push({
              path: change.path,
              message: 'Cannot delete because the file does not exist.',
            });
            continue;
          }

          const backupPath = await this.backupBeforeDelete(workspaceRoot, filePath, change.path);
          await fs.unlink(filePath);
          result.applied += 1;
          result.changedPaths.push(`${change.path} (backup: ${backupPath})`);
          continue;
        }

        const existingContent = await this.readExistingContent(filePath);
        if (existingContent === (change.proposedContent ?? '')) {
          continue;
        }

        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, change.proposedContent ?? '', 'utf-8');
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

  private resolveOperation(change: PreviewChange): 'create' | 'update' | 'delete' {
    if (change.operation) {
      return change.operation;
    }

    return change.originalContent ? 'update' : 'create';
  }

  private async pathExists(candidatePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(candidatePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private async backupBeforeDelete(
    workspaceRoot: string,
    absolutePath: string,
    relativePath: string
  ): Promise<string> {
    const safeRelative = relativePath.replace(/[\\/:*?"<>|]/g, '_');
    const backupFileName = `${Date.now()}-${safeRelative}.bak`;
    const backupRoot = path.join(workspaceRoot, this.backupDirName);
    const backupPath = path.join(backupRoot, backupFileName);
    await fs.mkdir(backupRoot, { recursive: true });

    const original = await fs.readFile(absolutePath, 'utf-8');
    await fs.writeFile(backupPath, original, 'utf-8');
    return path.relative(workspaceRoot, backupPath).replace(/\\/g, '/');
  }

  private validateContentPreservation(change: PreviewChange): ValidationError | null {
    if (change.operation === 'update' && change.originalContent) {
      const originalLength = change.originalContent.length;
      const proposedLength = change.proposedContent.length;

      if (proposedLength < originalLength) {
        const lostChars = originalLength - proposedLength;
        const lostPercent = ((lostChars / originalLength) * 100).toFixed(1);

        return {
          code: 'CONTENT_LOSS_DETECTED',
          message: `PROPOSED CONTENT LOSS: ${lostChars} characters (${lostPercent}%) of original file content would be deleted. This is likely an error. Original: ${originalLength} chars, Proposed: ${proposedLength} chars.`,
          file: change.path,
        };
      }

      if (!change.proposedContent.includes(change.originalContent)) {
        return {
          code: 'CONTENT_NOT_PRESERVED',
          message: `Original content not found in proposed changes for ${change.path}. The entire original file content must be preserved in the proposed update.`,
          file: change.path,
        };
      }
    }

    if (change.operation === 'delete') {
      return null;
    }

    return null;
  }
}

export class PreviewOnlyExecutor implements Executor {
  async preview(draft: CodeDraft, _workspaceRoot: string): Promise<DiffPreview> {
    return {
      summary: draft.summary,
      rationale: draft.rationale,
      changes: draft.changes.map((change) => ({
        ...change,
        operation: change.operation ?? 'update',
        originalContent: change.originalContent ?? '',
        proposedContent: change.proposedContent ?? '',
      })),
      totalAdditions: 0,
      totalDeletions: 0,
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
