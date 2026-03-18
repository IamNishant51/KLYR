export interface MemoryEntry {
    id: string;
    timestamp: number;
    content: string;
    type: 'conversation' | 'decision' | 'context' | 'error' | 'summary';
    importance: 'low' | 'medium' | 'high' | 'critical';
    ttl?: number;
}
export interface MemoryLayer {
    name: string;
    maxSize: number;
    ttl: number;
    entries: MemoryEntry[];
}
export declare class MemoryManager {
    private shortTerm;
    private midTerm;
    private longTerm;
    constructor();
    /**
     * Add entry to appropriate memory layer based on importance
     */
    add(entry: MemoryEntry): void;
    /**
     * Query memory across all layers
     */
    query(type?: string, minImportance?: string, limit?: number): MemoryEntry[];
    /**
     * Get short-term memory (current task context)
     */
    getShortTerm(limit?: number): MemoryEntry[];
    /**
     * Get mid-term memory (session history)
     */
    getMidTerm(limit?: number): MemoryEntry[];
    /**
     * Get long-term memory (persistent knowledge)
     */
    getLongTerm(type?: string, limit?: number): MemoryEntry[];
    /**
     * Promote entry from short-term to mid-term
     */
    promote(entryId: string): void;
    /**
     * Archive important entries to long-term
     */
    archive(entryId: string): void;
    /**
     * Clear expired entries
     */
    private cleanExpired;
    /**
     * Export memory for persistence
     */
    export(): {
        shortTerm: MemoryEntry[];
        midTerm: MemoryEntry[];
        longTerm: MemoryEntry[];
    };
    /**
     * Import memory from persistence
     */
    import(data: {
        shortTerm: MemoryEntry[];
        midTerm: MemoryEntry[];
        longTerm: MemoryEntry[];
    }): void;
    /**
     * Get summary of all memory
     */
    getSummary(): {
        totalEntries: number;
        shortTermCount: number;
        midTermCount: number;
        longTermCount: number;
        criticalCount: number;
    };
    private importanceScore;
}
