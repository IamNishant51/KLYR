/**
 * Embedding cache for fast intent classification and semantic similarity.
 * Uses simple in-memory + file-based caching for embeddings.
 */
export interface EmbeddingEntry {
    text: string;
    embedding: number[];
    hash: string;
    timestamp: number;
    label?: string;
}
export declare class EmbeddingCache {
    private cache;
    private cacheDir;
    private maxCacheSize;
    constructor(cacheDir: string);
    /**
     * Initialize cache from disk
     */
    initialize(): Promise<void>;
    /**
     * Get embedding for text, checking cache first
     */
    getOrCompute(text: string, computeFn: (text: string) => Promise<number[]>, label?: string): Promise<number[]>;
    /**
     * Compute semantic similarity between two embeddings (cosine similarity)
     */
    similarity(emb1: number[], emb2: number[]): number;
    /**
     * Find most similar cached embeddings
     */
    findSimilar(embedding: number[], topK?: number, minScore?: number): EmbeddingEntry[];
    /**
     * Hash text for cache key
     */
    private hashText;
    /**
     * Persist cache to disk
     */
    persist(): Promise<void>;
    /**
     * Clear old cache entries (older than 7 days)
     */
    cleanup(): Promise<void>;
    /**
     * Get cache statistics
     */
    getStats(): {
        totalEntries: number;
        diskSize: number;
        labels: Record<string, number>;
    };
}
