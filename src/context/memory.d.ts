export interface MemoryEntry {
    id: string;
    timestamp: number;
    prompt: string;
    intent: string;
    result: 'success' | 'error' | 'rejected';
    summary: string;
    changes?: string[];
}
export interface MemoryStore {
    add(entry: MemoryEntry): Promise<void>;
    query(pattern: string, limit: number): Promise<MemoryEntry[]>;
    recent(limit: number): Promise<MemoryEntry[]>;
    clear(): Promise<void>;
}
export declare class InMemoryStore implements MemoryStore {
    private entries;
    private maxEntries;
    add(entry: MemoryEntry): Promise<void>;
    query(pattern: string, limit: number): Promise<MemoryEntry[]>;
    recent(limit: number): Promise<MemoryEntry[]>;
    clear(): Promise<void>;
    getEntries(): MemoryEntry[];
}
export declare function formatMemoryForContext(entries: MemoryEntry[]): string;
export declare function hydrateMemoryEntries(raw: unknown): MemoryEntry[];
