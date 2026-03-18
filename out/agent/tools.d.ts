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
export interface ToolExecutor {
    execute(request: ToolUseRequest, workspaceRoot: string): Promise<ToolResult>;
}
export declare class NoopToolExecutor implements ToolExecutor {
    execute(_: ToolUseRequest): Promise<ToolResult>;
}
