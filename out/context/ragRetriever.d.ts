import { CodeChunk } from './chunker';
import { FileSummary, FolderSummary, ProjectSummary } from './summarizer';
import { MemoryEntry } from './memoryManager';
export interface RetrievalResult {
    chunks: CodeChunk[];
    summaries: (FileSummary | FolderSummary | ProjectSummary)[];
    memory: MemoryEntry[];
    query: string;
    score: number;
    retrievalTime: number;
}
export interface EmbeddingResult {
    text: string;
    embedding: number[];
}
/**
 * RAG (Retrieval-Augmented Generation) orchestrator
 * Combines semantic search, hierarchical summaries, and memory retrieval
 */
export declare class RAGRetriever {
    private embeddingCache;
    private chunkIndex;
    private summaryIndex;
    /**
     * Index code chunks for retrieval
     */
    indexChunks(chunks: CodeChunk[]): void;
    /**
     * Index summaries for hierarchical retrieval
     */
    indexSummaries(summaries: (FileSummary | FolderSummary | ProjectSummary)[]): void;
    /**
     * Main retrieval function - combines multiple strategies
     */
    retrieve(query: string, chunks: CodeChunk[], summaries: (FileSummary | FolderSummary | ProjectSummary)[], memory: MemoryEntry[], topK?: number): Promise<RetrievalResult>;
    /**
     * Score chunks by keyword matching and semantic similarity
     */
    private scoreChunks;
    /**
     * Score summaries by semantic relevance
     */
    private scoreSummaries;
    /**
     * Score memory entries by relevance
     */
    private scoreMemory;
    /**
     * Calculate semantic similarity between two embeddings (cosine similarity)
     */
    private cosineSimilarity;
    /**
     * Clear caches
     */
    clearCache(): void;
    /**
     * Get retrieval statistics
     */
    getStats(): {
        cachedEmbeddings: number;
        indexedChunks: number;
        indexedSummaries: number;
    };
}
