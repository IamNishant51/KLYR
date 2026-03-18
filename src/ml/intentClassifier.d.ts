/**
 * Advanced intent classification using embeddings and semantic similarity.
 * Combines regex patterns with ML-based classification for robust intent detection.
 */
export interface ClassifiedIntent {
    intent: 'edit' | 'chat' | 'inline' | 'analyze' | 'refactor' | 'explain' | 'fix' | 'generate' | 'unknown';
    confidence: number;
    relatedTools: string[];
    metadata: Record<string, unknown>;
}
export declare class AdvancedIntentClassifier {
    private embeddingCache;
    private intentEmbeddings;
    constructor(cachePath: string);
    initialize(): Promise<void>;
    /**
     * Classify intent using combined approach: regex + semantic similarity
     */
    classify(userPrompt: string): Promise<ClassifiedIntent>;
    /**
     * Regex-based intent classification (fast, deterministic)
     */
    private classifyByRegex;
    /**
     * Semantic-based intent classification using embeddings
     */
    private classifyBySemantic;
    /**
     * Simulate embedding computation (in production, would use real embedding model)
     */
    private simulateEmbedding;
    /**
     * Compute cosine similarity between two vectors
     */
    private cosineSimilarity;
    /**
     * Simple string hash for deterministic embedding simulation
     */
    private hashString;
    /**
     * Get tools for a specific intent
     */
    private getToolsForIntent;
}
