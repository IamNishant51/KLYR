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

    // Log draft info for debugging
    console.log('[KLYR] Preview - Draft summary:', draft.summary);
    console.log('[KLYR] Preview - Draft changes count:', draft.changes.length);
    console.log('[KLYR] Preview - Commands:', draft.commands?.length ?? 0);

    if (draft.changes.length === 0) {
      console.warn('[KLYR] WARNING: Draft has 0 changes! LLM may not have followed instructions.');
      console.warn('[KLYR] Draft rationale:', draft.rationale);
      console.warn('[KLYR] Draft followUpQuestions:', draft.followUpQuestions);
    }

    for (const change of draft.changes) {
      const resolvedPath = this.resolveWorkspacePath(workspaceRoot, change.path);
      const diskOriginalContent = await this.readExistingContent(resolvedPath);
      
      // Check if file already exists on disk (non-empty string means file exists)
      const fileExists = diskOriginalContent.length > 0;
      
      // Determine the correct operation based on LLM intent and file existence
      let operation: 'create' | 'update' | 'delete';
      let finalProposedContent = change.proposedContent ?? '';
      
      if (change.operation === 'delete' && fileExists) {
        // User wants to delete an existing file
        operation = 'delete';
        // For delete operations, proposedContent is not used in apply
      } else {
        // For create/update intents, or delete on non-existent file:
        // We want the file to exist with the LLM's specified content
        operation = fileExists ? 'update' : 'create';
        finalProposedContent = change.proposedContent ?? '';
      }
      
      // Generate detailed diff like Cursor/Copilot
      const detailedDiff = generateDetailedDiff(
        change.path,
        diskOriginalContent,
        finalProposedContent,
        operation
      );
      
      totalAdditions += detailedDiff.additions;
      totalDeletions += detailedDiff.deletions;
      
      // Generate unified diff for compatibility
      const unifiedDiff = generateUnifiedDiff(change.path, diskOriginalContent, finalProposedContent);
      
      changes.push({
        ...change,
        operation,
        originalContent: diskOriginalContent,
        proposedContent: finalProposedContent,
        diff: unifiedDiff,
        detailedDiff,
        diffHtml: this.generateDiffHtml(detailedDiff),
      });
    }

     for (const change of draft.changes) {
       const resolvedPath = this.resolveWorkspacePath(workspaceRoot, change.path);
       const diskOriginalContent = await this.readExistingContent(resolvedPath);
       
       // Check if file already exists on disk (non-empty string means file exists)
       const fileExists = diskOriginalContent.length > 0;
       
       // Determine the correct operation based on LLM intent and file existence
       let operation: 'create' | 'update' | 'delete';
       let finalProposedContent = change.proposedContent ?? '';
       
       if (change.operation === 'delete' && fileExists) {
         // User wants to delete an existing file
         operation = 'delete';
         // For delete operations, proposedContent is not used in apply
       } else {
         // For create/update intents, or delete on non-existent file:
         // We want the file to exist with the LLM's specified content
         operation = fileExists ? 'update' : 'create';
         finalProposedContent = change.proposedContent ?? '';
       }
       
       // Generate detailed diff like Cursor/Copilot
       const detailedDiff = generateDetailedDiff(
         change.path,
         diskOriginalContent,
         finalProposedContent,
         operation
       );
       
       totalAdditions += detailedDiff.additions;
       totalDeletions += detailedDiff.deletions;
       
       // Generate unified diff for compatibility
       const unifiedDiff = generateUnifiedDiff(change.path, diskOriginalContent, finalProposedContent);
       
       changes.push({
         ...change,
         operation,
         originalContent: diskOriginalContent,
         proposedContent: finalProposedContent,
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

    const statusClass = diff.operation === 'create' ? 'create' : diff.operation === 'delete' ? 'delete' : 'update';
    const statusText = diff.operation === 'create' ? 'NEW FILE' : diff.operation === 'delete' ? 'DELETE' : 'MODIFY';
    
    lines.push(`<div style="margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;">`);
    
    // Header with Copilot-style design
    lines.push(`<div style="display: flex; align-items: center; padding: 8px 12px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.05);">`);
    lines.push(`<span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-right: 10px; ${
      statusClass === 'create' ? 'background: rgba(126, 231, 135, 0.2); color: #7ee787;' :
      statusClass === 'delete' ? 'background: rgba(248, 81, 73, 0.2); color: #f85149;' :
      'background: rgba(123, 223, 246, 0.2); color: #7bdff6;'
    }">${statusText}</span>`);
    lines.push(`<span style="font-family: 'Consolas', monospace; font-size: 12px; color: #e6edf3; flex: 1;">${this.escapeHtml(diff.filePath)}</span>`);
    lines.push(`<span style="font-size: 11px;">`);
    if (diff.additions > 0) lines.push(`<span style="color: #7ee787;">+${diff.additions}</span> `);
    if (diff.deletions > 0) lines.push(`<span style="color: #f85149;">-${diff.deletions}</span>`);
    lines.push(`</span></div>`);

    // Line-by-line diff with proper Copilot-style highlighting
    lines.push('<div style="font-family: Consolas, monospace; font-size: 12px; overflow-x: auto;">');
    for (const line of diff.lines) {
      const isAdded = line.type === 'added';
      const isRemoved = line.type === 'removed';
      const bgColor = isAdded ? 'rgba(126, 231, 135, 0.15)' : isRemoved ? 'rgba(248, 81, 73, 0.15)' : 'transparent';
      const textColor = isAdded ? '#7ee787' : isRemoved ? '#f85149' : '#9fb0c3';
      const prefixColor = isAdded ? '#7ee787' : isRemoved ? '#f85149' : 'rgba(255,255,255,0.3)';
      const prefix = isAdded ? '+' : isRemoved ? '-' : ' ';
      const borderLeft = (isAdded || isRemoved) ? `border-left: 3px solid ${prefixColor};` : '';

      lines.push(`<div style="display: flex; ${bgColor ? 'background: ' + bgColor + ';' : ''} ${borderLeft} min-height: 20px; line-height: 20px;">`);
      lines.push(`<span style="width: 45px; padding: 0 8px; text-align: right; color: rgba(255,255,255,0.25); user-select: none; border-right: 1px solid rgba(255,255,255,0.05);">${line.oldLineNumber ?? ''}</span>`);
      lines.push(`<span style="width: 45px; padding: 0 8px; text-align: right; color: rgba(255,255,255,0.25); user-select: none; border-right: 1px solid rgba(255,255,255,0.05);">${line.newLineNumber ?? ''}</span>`);
      lines.push(`<span style="width: 20px; padding: 0 4px; text-align: center; color: ${prefixColor}; user-select: none;">${prefix}</span>`);
      lines.push(`<span style="flex: 1; padding: 0 8px; color: ${textColor}; white-space: pre;">${this.escapeHtml(line.content) || '&nbsp;'}</span>`);
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

    // Sort changes: create directories first, then create files, then update files, then delete
    const sortedChanges = [...preview.changes].sort((a, b) => {
      const priority = (op: string) => {
        if (op === 'create') return 1;
        if (op === 'update') return 2;
        if (op === 'delete') return 3;
        return 4;
      };
      return priority(a.operation ?? 'update') - priority(b.operation ?? 'update');
    });

    // First pass: collect all unique directories needed
    const directoriesNeeded = new Set<string>();
    for (const change of sortedChanges) {
      if (change.operation !== 'delete') {
        const filePath = this.resolveWorkspacePath(workspaceRoot, change.path);
        const dir = path.dirname(filePath);
        directoriesNeeded.add(dir);
      }
    }

    // Create all directories first
    for (const dir of directoriesNeeded) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        console.warn(`[KLYR] Failed to create directory ${dir}:`, error);
      }
    }

    for (const change of sortedChanges) {
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
        const fileExists = await this.pathExists(filePath);
        
        // Apply the same logic as in preview to determine final operation
        let finalOperation = operation;
        if (change.operation === 'delete' && fileExists) {
          // User wants to delete an existing file
          finalOperation = 'delete';
        } else {
          // For create/update intents: we want the file to exist with the specified content
          finalOperation = fileExists ? 'update' : 'create';
        }
        
        if (finalOperation !== 'delete' && !change.proposedContent) {
          result.errors.push({
            path: change.path,
            message: 'Missing proposed content.',
          });
          continue;
        }
        
        if (finalOperation === 'delete') {
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
