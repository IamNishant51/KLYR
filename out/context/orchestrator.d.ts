import { CodeChunk } from './chunker';
import { FileSummary, FolderSummary, ProjectSummary } from './summarizer';
import { MemoryEntry } from './memoryManager';
export interface ContextOrchestrationConfig {
    modelTokenLimit?: number;
    responseBuffer?: number;
    topKRetrieval?: number;
    maxChunkSize?: number;
    enableMemory?: boolean;
}
export interface ContextRequest {
    query: string;
    workspacePath: string;
    currentFilePath?: string;
    conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    includeMemory?: boolean;
}
export interface ContextResponse {
    formattedContext: string;
    chunks: CodeChunk[];
    summaries: (FileSummary | FolderSummary | ProjectSummary)[];
    memory: MemoryEntry[];
    tokenCount: number;
    efficiency: number;
    warnings: string[];
    retrievalTime: number;
}
/**
 * Central orchestrator for the 1M token context system
 * Coordinates: chunking → summarization → RAG → optimization → validation
 */
export declare class ContextOrchestrator {
    private chunker;
    private summarizer;
    private optimizer;
    private retriever;
    private memory;
    private config;
    constructor(config?: ContextOrchestrationConfig);
    /**
     * Main entry point: Process query and return optimized context
     */
    orchestrate(request: ContextRequest): Promise<ContextResponse>;
    /**
     * Chunk all files in workspace
     */
    private chunkWorkspace;
    /**
     * Summarize all files and folders in workspace
     */
    private summarizeWorkspace;
    /**
     * Detect file language from extension
     */
    private detectLanguage;
    /**
     * Check if file is text-like
     */
    private isTextLikeFile;
    /**
     * Estimate tokens in text (rough: 1 token ≈ 4 characters)
     */
    private estimateTokens;
    /**
     * Add memory entry
     */
    addMemory(entry: MemoryEntry): void;
    /**
     * Get memory summary
     */
    getMemorySummary(): {
        totalEntries: number;
        shortTermCount: number;
        midTermCount: number;
        longTermCount: number;
        criticalCount: number;
    };
    /**
     * Clear memory
     */
    clearMemory(): void;
    /**
     * Get retrieval statistics
     */
    getRetrieverStats(): {
        cachedEmbeddings: number;
        indexedChunks: number;
        indexedSummaries: number;
    };
}
