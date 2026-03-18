import type { EmbeddingProvider } from './embeddings';
export interface ContextDocument {
    id: string;
    uri: string;
    content: string;
    updatedAt: number;
    source?: 'active' | 'selection' | 'open' | 'workspace' | 'memory';
    title?: string;
    tags?: string[];
}
export interface ContextQuery {
    query: string;
    maxResults: number;
}
export interface ContextMatch {
    document: ContextDocument;
    score: number;
}
export interface ContextMemoryItem {
    id: string;
    summary: string;
    createdAt: number;
}
export interface ContextEngine {
    index(documents: ContextDocument[]): Promise<void>;
    query(input: ContextQuery): Promise<ContextMatch[]>;
    recordMemory(item: ContextMemoryItem): Promise<void>;
    recentMemory(limit: number): Promise<ContextMemoryItem[]>;
}
export declare class InMemoryContextEngine implements ContextEngine {
    private readonly embeddings;
    private readonly documents;
    private readonly vectors;
    private readonly memory;
    private readonly embeddingCache;
    private readonly MAX_CACHE_SIZE;
    constructor(embeddings: EmbeddingProvider);
    index(documents: ContextDocument[]): Promise<void>;
    query(input: ContextQuery): Promise<ContextMatch[]>;
    recordMemory(item: ContextMemoryItem): Promise<void>;
    recentMemory(limit: number): Promise<ContextMemoryItem[]>;
    private cosineSimilarity;
    private getCacheKey;
    private addToCache;
    private simpleHash;
}
export interface ChunkDocumentOptions {
    maxChunkChars?: number;
    overlapChars?: number;
}
export declare function chunkContextDocument(document: ContextDocument, options?: ChunkDocumentOptions): ContextDocument[];
