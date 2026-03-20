export interface McpClientOptions {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
}
export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: unknown;
}
export interface McpToolCallResult {
    content: string;
    raw: unknown;
}
export declare class McpClient {
    private readonly options;
    private process?;
    private requestId;
    private readonly pending;
    private rawBuffer;
    private started;
    constructor(options: McpClientOptions);
    connect(): Promise<void>;
    listTools(): Promise<McpTool[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
    dispose(): void;
    private request;
    private notify;
    private writeMessage;
    private handleStdout;
    private handleRpcMessage;
    private rejectAllPending;
    private extractText;
}
