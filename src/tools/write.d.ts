export interface WriteToolInput {
    path: string;
    content: string;
    createDirectories?: boolean;
}
export interface WriteToolResult {
    success: boolean;
    path: string;
    bytesWritten?: number;
    error?: string;
}
export declare class WriteTool {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    execute(input: WriteToolInput): Promise<WriteToolResult>;
    private isWithinWorkspace;
}
export interface EditInput {
    path: string;
    operations: EditOperation[];
}
export interface EditOperation {
    type: 'replace' | 'insert' | 'delete';
    startLine: number;
    endLine?: number;
    content?: string;
}
export interface EditResult {
    success: boolean;
    path: string;
    newContent?: string;
    error?: string;
}
export declare class EditTool {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    execute(input: EditInput): Promise<EditResult>;
    private isWithinWorkspace;
}
