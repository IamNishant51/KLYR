export interface EmbeddingVector {
    values: number[];
}
export interface EmbeddingProvider {
    embedText(text: string): Promise<EmbeddingVector>;
}
export declare class OllamaEmbeddingProvider implements EmbeddingProvider {
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly fallback;
    private readonly cache;
    private readonly maxCacheSize;
    constructor(baseUrl?: string, timeoutMs?: number);
    embedText(text: string): Promise<EmbeddingVector>;
    private addToCache;
    private hashContent;
}
export declare class NaiveEmbeddingProvider implements EmbeddingProvider {
    private readonly dimensions;
    embedText(text: string): Promise<EmbeddingVector>;
    private hashToken;
}
