/**
 * Token optimization and smart context management.
 * Intelligently selects and truncates context to stay within token limits.
 */
export interface TokenBudget {
    maxTokens: number;
    reserved: number;
    available: number;
}
export interface ContextSegment {
    content: string;
    priority: number;
    type: 'code' | 'doc' | 'test' | 'config' | 'summary';
    metadata: Record<string, unknown>;
}
export declare class TokenOptimizer {
    private encoding;
    constructor(modelName?: string);
    /**
     * Estimate token count for text
     */
    countTokens(text: string): number;
    /**
     * Truncate text to maximum tokens while preserving importance
     */
    truncate(text: string, maxTokens: number): string;
    /**
     * Optimize context segments by selecting and truncating based on priorities
     */
    optimizeContext(segments: ContextSegment[], budget: TokenBudget, systemPromptTokens: number): {
        selected: ContextSegment[];
        truncated: boolean;
    };
    /**
     * Calculate context budget based on model limits
     */
    calculateBudget(contextWindowSize: number): TokenBudget;
    /**
     * Compress code by removing comments and unnecessary whitespace
     */
    compressCode(code: string): string;
    /**
     * Create summary of code for context inclusion
     */
    summarizeCode(code: string, maxLines?: number): string;
    /**
     * Estimate context efficiency
     */
    getEfficiency(totalContextTokens: number, budget: TokenBudget): {
        percentageUsed: number;
        tokensRemaining: number;
        efficiency: string;
    };
}
