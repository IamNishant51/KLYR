import type { CodeChunk } from './chunker';
export interface ContextBudget {
    totalTokens: number;
    availableTokens: number;
    systemPromptTokens: number;
    conversationTokens: number;
    contextTokens: number;
    responseBuffer: number;
}
export interface OptimizedContext {
    chunks: CodeChunk[];
    summaries: string[];
    conversation: Array<{
        role: string;
        content: string;
    }>;
    totalTokens: number;
    efficiency: number;
    warnings: string[];
}
export declare class ContextOptimizer {
    private tokenCountEstimation;
    /**
     * Calculate token count (rough estimation)
     */
    estimateTokens(text: string): number;
    /**
     * Create context budget for LLM request
     * Conservative: Leave 20% buffer for response
     */
    createBudget(modelContextWindow?: number, responseBufferPercent?: number): ContextBudget;
    /**
     * CRITICAL: Optimize and validate context before sending to LLM
     * Ensures we NEVER exceed token limit
     */
    optimizeContext(chunks: CodeChunk[], summaries: string[], conversation: Array<{
        role: string;
        content: string;
    }>, budget: ContextBudget): OptimizedContext;
    /**
     * Validate context before sending to LLM
     * Ensures high signal-to-noise ratio
     */
    validateContext(context: OptimizedContext, budget: ContextBudget): boolean;
    /**
     * Select most relevant chunks based on scoring
     */
    private selectRelevantChunks;
    /**
     * Score a chunk for relevance
     * Higher score = more relevant
     */
    private scoreChunk;
    /**
     * Truncate summaries to fit token budget
     */
    private truncateSummaries;
    /**
     * Build final context string for LLM
     * Ensures proper formatting and signal
     */
    buildContextString(optimized: OptimizedContext): string;
}
