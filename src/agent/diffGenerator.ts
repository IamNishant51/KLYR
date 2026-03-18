export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  lineNumber?: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface FileDiff {
  filePath: string;
  operation: 'create' | 'update' | 'delete';
  lines: DiffLine[];
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DetailedDiff {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
}

export function generateDetailedDiff(
  filePath: string,
  originalContent: string,
  newContent: string,
  operation: 'create' | 'update' | 'delete' = 'update'
): FileDiff {
  const originalLines = splitLines(originalContent);
  const newLines = splitLines(newContent);

  const diffLines: DiffLine[] = [];
  const hunks: DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;

  if (operation === 'create') {
    // New file - all lines are additions
    newLines.forEach((line, index) => {
      diffLines.push({
        type: 'added',
        content: line,
        newLineNumber: index + 1,
      });
      additions++;
    });
    
    hunks.push({
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: newLines.length,
      lines: diffLines,
    });
  } else if (operation === 'delete') {
    // Deleted file - all lines are deletions
    originalLines.forEach((line, index) => {
      diffLines.push({
        type: 'removed',
        content: line,
        oldLineNumber: index + 1,
      });
      deletions++;
    });
    
    hunks.push({
      oldStart: 1,
      oldCount: originalLines.length,
      newStart: 0,
      newCount: 0,
      lines: diffLines,
    });
  } else {
    // Update - compute LCS-based diff
    const lcs = computeLCS(originalLines, newLines);
    const diff = computeDiff(originalLines, newLines, lcs);
    
    let oldLineNum = 1;
    let newLineNum = 1;
    let currentHunk: DiffHunk | null = null;
    let currentHunkLines: DiffLine[] = [];
    
    for (const segment of diff) {
      if (segment.type === 'unchanged') {
        // Close current hunk if exists and we're starting unchanged
        if (currentHunk && segment.items.length > 0) {
          hunks.push({ ...currentHunk, lines: [...currentHunkLines] });
          currentHunk = null;
          currentHunkLines = [];
        }
        
        for (const line of segment.items) {
          diffLines.push({
            type: 'unchanged',
            content: line,
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
          });
        }
      } else if (segment.type === 'removed') {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum,
            oldCount: 0,
            newStart: newLineNum,
            newCount: 0,
            lines: [],
          };
        }
        
        for (const line of segment.items) {
          diffLines.push({
            type: 'removed',
            content: line,
            oldLineNumber: oldLineNum++,
          });
          currentHunkLines.push({
            type: 'removed',
            content: line,
            oldLineNumber: oldLineNum - 1,
          });
          currentHunk.oldCount++;
          deletions++;
        }
      } else if (segment.type === 'added') {
        if (!currentHunk) {
          currentHunk = {
            oldStart: oldLineNum,
            oldCount: 0,
            newStart: newLineNum,
            newCount: 0,
            lines: [],
          };
        }
        
        for (const line of segment.items) {
          diffLines.push({
            type: 'added',
            content: line,
            newLineNumber: newLineNum++,
          });
          currentHunkLines.push({
            type: 'added',
            content: line,
            newLineNumber: newLineNum - 1,
          });
          currentHunk.newCount++;
          additions++;
        }
      }
    }
    
    // Close any remaining hunk
    if (currentHunk) {
      hunks.push({ ...currentHunk, lines: currentHunkLines });
    }
  }

  return {
    filePath,
    operation,
    lines: diffLines,
    additions,
    deletions,
    hunks: hunks.filter(h => h.lines.length > 0),
  };
}

function splitLines(content: string): string[] {
  if (!content) return [];
  return content.replace(/\r\n/g, '\n').split('\n');
}

function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

interface DiffSegment {
  type: 'unchanged' | 'removed' | 'added';
  items: string[];
}

function computeDiff(original: string[], updated: string[], lcs: number[][]): DiffSegment[] {
  const result: DiffSegment[] = [];
  let i = original.length;
  let j = updated.length;
  const segments: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && original[i - 1] === updated[j - 1]) {
      segments.unshift({ type: 'unchanged', items: [original[i - 1]] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      segments.unshift({ type: 'added', items: [updated[j - 1]] });
      j--;
    } else {
      segments.unshift({ type: 'removed', items: [original[i - 1]] });
      i--;
    }
  }

  // Merge consecutive segments of the same type
  for (const segment of segments) {
    const last = result[result.length - 1];
    if (last && last.type === segment.type) {
      last.items.push(...segment.items);
    } else {
      result.push({ ...segment, items: [...segment.items] });
    }
  }

  return result;
}

export function generateUnifiedDiff(
  filePath: string,
  originalContent: string,
  newContent: string
): string {
  const diff = generateDetailedDiff(filePath, originalContent, newContent);
  const lines: string[] = [];

  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);

  for (const hunk of diff.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
    for (const line of hunk.lines) {
      switch (line.type) {
        case 'added':
          lines.push(`+${line.content}`);
          break;
        case 'removed':
          lines.push(`-${line.content}`);
          break;
        case 'unchanged':
          lines.push(` ${line.content}`);
          break;
      }
    }
  }

  return lines.join('\n');
}

export function formatDiffForHtml(diff: FileDiff): string {
  const lines: string[] = [];

  // Header
  const statusIcon = diff.operation === 'create' ? '+' : diff.operation === 'delete' ? '-' : '~';
  const statusClass = diff.operation === 'create' ? 'text-green-400' : diff.operation === 'delete' ? 'text-red-400' : 'text-yellow-400';
  
  lines.push(`<div class="diff-file" data-path="${escapeHtml(diff.filePath)}">`);
  lines.push(`<div class="diff-header ${statusClass}">`);
  lines.push(`<span class="status-icon">${statusIcon}</span>`);
  lines.push(`<span class="file-path">${escapeHtml(diff.filePath)}</span>`);
  lines.push(`<span class="diff-stats">`);
  if (diff.additions > 0) lines.push(`<span class="additions">+${diff.additions}</span>`);
  if (diff.deletions > 0) lines.push(`<span class="deletions">-${diff.deletions}</span>`);
  lines.push(`</span>`);
  lines.push(`</div>`);

  // Lines
  lines.push('<div class="diff-content">');
  for (const line of diff.lines) {
    const lineClass = line.type === 'added' ? 'diff-line-added' : line.type === 'removed' ? 'diff-line-removed' : 'diff-line-unchanged';
    const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
    
    lines.push(`<div class="${lineClass}">`);
    lines.push(`<span class="line-num old">${line.oldLineNumber ?? ''}</span>`);
    lines.push(`<span class="line-num new">${line.newLineNumber ?? ''}</span>`);
    lines.push(`<span class="line-prefix">${prefix}</span>`);
    lines.push(`<span class="line-content">${escapeHtml(line.content) || '&nbsp;'}</span>`);
    lines.push(`</div>`);
  }
  lines.push('</div></div>');

  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateMultipleFilesDiff(
  changes: Array<{
    path: string;
    operation: 'create' | 'update' | 'delete';
    originalContent: string;
    newContent: string;
  }>
): DetailedDiff {
  const files: FileDiff[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const change of changes) {
    const diff = generateDetailedDiff(
      change.path,
      change.originalContent,
      change.newContent,
      change.operation
    );
    files.push(diff);
    totalAdditions += diff.additions;
    totalDeletions += diff.deletions;
  }

  return { files, totalAdditions, totalDeletions };
}
