export interface TokenBudget {
    maxTokens: number;
    systemPrompt: number;
    history: number;
    context: number;
    reserved: number;
}
export declare function calculateTokenBudget(maxTokens: number, options?: {
    hasSystemPrompt?: boolean;
    historyMessages?: number;
    priorityContext?: number;
}): TokenBudget;
export declare function truncateText(text: string, maxTokens: number): string;
export declare function compressContext(docs: ContextDoc[]): ContextDoc[];
export interface ContextDoc {
    id: string;
    uri: string;
    content: string;
    source?: string;
    relevanceScore?: number;
}
export declare function prioritizeDocuments(docs: ContextDoc[], maxCount: number, query?: string): ContextDoc[];
export declare function summarizeForContext(text: string, maxLines?: number): string;
