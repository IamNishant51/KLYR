export interface Tool {
    id: string;
    name: string;
    description: string;
    usage: string;
}
export interface ToolUseRequest {
    toolId: string;
    input: Record<string, unknown>;
}
export interface ToolResult {
    success: boolean;
    output?: unknown;
    error?: string;
}
export declare const AVAILABLE_TOOLS: Tool[];
export declare class ToolExecutor {
    execute(request: ToolUseRequest, workspaceRoot: string): Promise<ToolResult>;
    private getString;
    private getOptionalString;
    private getOptionalNumber;
    private readOpenFile;
    private listDir;
    private search;
    private grep;
    private runCmd;
    private checkSyntax;
}
export declare class NoopToolExecutor extends ToolExecutor {
    execute(_: ToolUseRequest, _workspaceRoot: string): Promise<ToolResult>;
}
