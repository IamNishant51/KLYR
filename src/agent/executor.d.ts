import type { CodeDraft, DraftFileChange } from './coder';
import { type FileDiff } from './diffGenerator';
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
    errors: Array<{
        path: string;
        message: string;
    }>;
}
export type ApplyDecision = 'accept' | 'reject';
export interface Executor {
    preview(draft: CodeDraft, workspaceRoot: string): Promise<DiffPreview>;
    apply(preview: DiffPreview, decision: ApplyDecision, workspaceRoot: string): Promise<ApplyResult>;
}
export declare class FileSystemExecutor implements Executor {
    private readonly backupDirName;
    preview(draft: CodeDraft, workspaceRoot: string): Promise<DiffPreview>;
    private generateDiffHtml;
    private escapeHtml;
    apply(preview: DiffPreview, decision: ApplyDecision, workspaceRoot: string): Promise<ApplyResult>;
    private resolveWorkspacePath;
    private isWithinWorkspace;
    private readExistingContent;
    private resolveOperation;
    private pathExists;
    private backupBeforeDelete;
    private validateContentPreservation;
}
export declare class PreviewOnlyExecutor implements Executor {
    preview(draft: CodeDraft, _workspaceRoot: string): Promise<DiffPreview>;
    apply(_: DiffPreview, decision: ApplyDecision): Promise<ApplyResult>;
}
