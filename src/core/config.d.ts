export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface KlyrConfig {
    logLevel: LogLevel;
    ollama: OllamaConfig;
    context: ContextConfig;
    execution: ExecutionConfig;
    inline: InlineCompletionConfig;
}
export interface OllamaConfig {
    baseUrl: string;
    model: string;
    temperature: number;
    timeoutMs: number;
    maxRetries: number;
    retryBackoffMs: number;
}
export interface ContextConfig {
    maxFiles: number;
    maxFileSize: number;
    maxTotalSize: number;
    retrievalMaxResults: number;
    retrievalMinScore: number;
}
export interface ExecutionConfig {
    maxAttempts: number;
    noOp: boolean;
}
export interface InlineCompletionConfig {
    enabled: boolean;
    maxPrefixChars: number;
    maxSuffixChars: number;
}
export declare function defaultConfig(): KlyrConfig;
export declare class Logger {
    private level;
    constructor(level?: LogLevel);
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    private shouldLog;
}
