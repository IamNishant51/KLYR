export interface StreamOptions {
    model: string;
    temperature: number;
    maxTokens: number;
    onChunk?: (text: string) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
}
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string[];
}
export declare class StreamingOllamaClient {
    private baseUrl;
    private timeoutMs;
    private logger;
    constructor(baseUrl: string, timeoutMs?: number);
    chat(messages: Message[], options: Omit<StreamOptions, 'onChunk' | 'onComplete' | 'onError'>): Promise<string>;
    streamChat(messages: Message[], options: StreamOptions): AsyncGenerator<string>;
    private formatMessages;
    private compressContent;
    listModels(): Promise<string[]>;
}
export declare class FastModelRouter {
    private fastModel;
    private fullModel;
    constructor(fastModel: string, fullModel: string);
    selectModel(task: 'chat' | 'edit' | 'explain' | 'search'): string;
}
export declare class ResponseCache {
    private cache;
    get(key: string): string | null;
    set(key: string, response: string): void;
    clear(): void;
}
