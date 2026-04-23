export interface ListToolInput {
    path?: string;
    showHidden?: boolean;
    showDetails?: boolean;
    sortBy?: 'name' | 'size' | 'modified';
}
export interface FileInfo {
    name: string;
    type: 'file' | 'directory' | 'symlink';
    size?: number;
    modified?: number;
    permissions?: string;
}
export interface ListToolResult {
    success: boolean;
    path: string;
    items: FileInfo[];
    totalFiles: number;
    totalDirectories: number;
    error?: string;
}
export declare class ListTool {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    execute(input: ListToolInput): Promise<ListToolResult>;
    private isWithinWorkspace;
}
