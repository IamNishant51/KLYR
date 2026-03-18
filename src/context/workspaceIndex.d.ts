import type { ContextDocument } from './contextEngine';
export interface FileNode {
    path: string;
    isDirectory: boolean;
    size?: number;
    lastModified?: number;
}
export interface WorkspaceIndex {
    root: string;
    files: FileNode[];
    packageJson?: Record<string, unknown>;
    tsconfig?: Record<string, unknown>;
}
export interface WorkspaceDocumentReadOptions {
    maxFiles?: number;
    maxFileSize?: number;
    maxTotalSize?: number;
    priorityPaths?: string[];
}
export declare function indexWorkspace(root: string): Promise<WorkspaceIndex>;
export declare function readWorkspaceDocuments(index: WorkspaceIndex, options?: WorkspaceDocumentReadOptions): Promise<ContextDocument[]>;
export declare function buildWorkspaceOutline(index: WorkspaceIndex, maxEntries?: number): string;
export declare function summarizeDependencies(index: WorkspaceIndex): string[];
