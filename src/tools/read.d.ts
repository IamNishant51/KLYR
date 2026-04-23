import * as vscode from 'vscode';
export interface ReadToolInput {
    path: string;
    offset?: number;
    limit?: number;
}
export interface ReadToolResult {
    success: boolean;
    content: string;
    path: string;
    lineCount?: number;
    error?: string;
}
export declare class ReadTool {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    execute(input: ReadToolInput): Promise<ReadToolResult>;
    private isWithinWorkspace;
}
export declare function readFileByVscode(uri: vscode.Uri, offset?: number, limit?: number): Promise<string>;
