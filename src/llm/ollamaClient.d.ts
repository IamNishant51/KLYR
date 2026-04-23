export interface OllamaClientOptions {
    baseUrl: string;
    timeoutMs: number;
    maxRetries: number;
    retryBackoffMs?: number;
    numParallel?: number;
    numCtx?: number;
}
export interface OllamaChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string[];
}
export interface OllamaChatRequest {
    model: string;
    messages: OllamaChatMessage[];
    temperature: number;
    stream: boolean;
    options?: {
        num_parallel?: number;
        num_ctx?: number;
    };
}
export interface OllamaChatResponse {
    content: string;
    done: boolean;
    thinking?: string;
}
export interface OllamaModel {
    name: string;
    modified_at?: string;
    size?: number;
}
export interface OllamaModelsResponse {
    models: OllamaModel[];
}
export type OllamaStreamHandler = (chunk: OllamaChatResponse) => void;
export interface OllamaClient {
    chat(request: OllamaChatRequest): Promise<OllamaChatResponse>;
    chatStream(request: OllamaChatRequest, onChunk: OllamaStreamHandler): Promise<void>;
    listModels(): Promise<OllamaModelsResponse>;
}
export declare class HttpOllamaClient implements OllamaClient {
    private readonly options;
    constructor(options: OllamaClientOptions);
    chat(request: OllamaChatRequest): Promise<OllamaChatResponse>;
    chatStream(request: OllamaChatRequest, onChunk: OllamaStreamHandler): Promise<void>;
    listModels(): Promise<OllamaModelsResponse>;
    private enrichRequest;
    private requestWithRetry;
    private executeRequest;
    private isAbortOrTimeoutError;
    private delay;
}
