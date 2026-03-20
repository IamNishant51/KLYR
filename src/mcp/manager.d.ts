import type { ContextDocument } from '../context/contextEngine';
import type { Logger } from '../core/config';
export interface McpServerConfig {
    name: string;
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    enabled?: boolean;
    timeoutMs?: number;
}
export interface McpContextResult {
    documents: ContextDocument[];
    references: string[];
    warnings: string[];
}
export declare class McpManager {
    private readonly logger;
    constructor(logger: Logger);
    collectContext(prompt: string, servers: McpServerConfig[]): Promise<McpContextResult>;
    private selectRelevantTools;
    private buildToolArguments;
}
