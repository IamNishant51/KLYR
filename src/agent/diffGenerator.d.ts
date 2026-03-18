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
export declare function generateDetailedDiff(filePath: string, originalContent: string, newContent: string, operation?: 'create' | 'update' | 'delete'): FileDiff;
export declare function generateUnifiedDiff(filePath: string, originalContent: string, newContent: string): string;
export declare function formatDiffForHtml(diff: FileDiff): string;
export declare function generateMultipleFilesDiff(changes: Array<{
    path: string;
    operation: 'create' | 'update' | 'delete';
    originalContent: string;
    newContent: string;
}>): DetailedDiff;
