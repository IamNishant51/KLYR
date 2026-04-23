export interface GrepToolInput {
    query: string;
    path?: string;
    filePattern?: string;
    caseSensitive?: boolean;
    regex?: boolean;
    context?: number;
    maxResults?: number;
}
export interface GrepMatch {
    file: string;
    line: number;
    column: number;
    content: string;
    match: string;
}
export interface GrepToolResult {
    success: boolean;
    matches: GrepMatch[];
    totalMatches: number;
    searchedFiles: number;
    error?: string;
}
export declare class GrepTool {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    execute(input: GrepToolInput): Promise<GrepToolResult>;
    private findFiles;
}
