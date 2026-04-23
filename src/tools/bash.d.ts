export interface BashToolInput {
    command: string;
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
}
export interface BashToolResult {
    success: boolean;
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
    error?: string;
}
export declare class BashTool {
    private defaultCwd;
    constructor(defaultCwd: string);
    execute(input: BashToolInput): Promise<BashToolResult>;
}
export interface BashSession {
    id: string;
    cwd: string;
    history: BashToolResult[];
}
export declare class BashSessionManager {
    private sessions;
    create(id: string, cwd: string): BashSession;
    get(id: string): BashSession | undefined;
    addResult(id: string, result: BashToolResult): void;
    destroy(id: string): void;
}
