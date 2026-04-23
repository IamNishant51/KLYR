export interface NamiConfig {
    ollama: {
        baseUrl: string;
        model: string;
        fastModel: string;
        visionModel: string;
        temperature: number;
        timeoutMs: number;
        maxRetries: number;
        retryBackoffMs: number;
        maxTokens: number;
        stream: boolean;
    };
    context: {
        maxFiles: number;
        maxFileSize: number;
        maxTotalSize: number;
        retrievalMaxResults: number;
        retrievalMinScore: number;
        useSummary: boolean;
        maxContextChunks: number;
        chunkOverlap: number;
        chunkSize: number;
    };
    execution: {
        maxAttempts: number;
        noOp: boolean;
    };
    inline: {
        enabled: boolean;
        maxPrefixChars: number;
        maxSuffixChars: number;
    };
    mcp: {
        enabled: boolean;
        servers: McpServerConfig[];
    };
    rag: {
        strictCitations: boolean;
        trustedDomains: string[];
        trustedGitHubOrgs: string[];
    };
    optimization: {
        enableCaching: boolean;
        compressContext: boolean;
        fastMode: boolean;
    };
}
export interface McpServerConfig {
    name: string;
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    enabled: boolean;
    timeoutMs: number;
}
export declare function defaultConfig(): NamiConfig;
export declare class Logger {
    private level;
    constructor(level?: 'debug' | 'info' | 'warn' | 'error');
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
export type { NamiConfig as KlyrConfig };
