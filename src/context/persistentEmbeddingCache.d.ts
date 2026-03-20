import type { EmbeddingProvider, EmbeddingVector } from './embeddings';
export declare class PersistentEmbeddingCacheProvider implements EmbeddingProvider {
    private readonly delegate;
    private readonly cacheFilePath;
    private readonly maxEntries;
    private cache;
    private loaded;
    constructor(delegate: EmbeddingProvider, cacheFilePath: string, maxEntries?: number);
    embedText(text: string): Promise<EmbeddingVector>;
    private ensureLoaded;
    private prune;
    private persist;
    private hashText;
}
