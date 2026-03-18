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

export class InMemoryStore implements MemoryStore {
  private entries: MemoryEntry[] = [];
  private maxEntries = 100;

  async add(entry: MemoryEntry): Promise<void> {
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }
  }

  async query(pattern: string, limit: number): Promise<MemoryEntry[]> {
    const lower = pattern.toLowerCase();
    return this.entries
      .filter(
        (entry) =>
          entry.prompt.toLowerCase().includes(lower) ||
          entry.summary.toLowerCase().includes(lower)
      )
      .slice(0, limit);
  }

  async recent(limit: number): Promise<MemoryEntry[]> {
    return this.entries.slice(0, limit);
  }

  async clear(): Promise<void> {
    this.entries = [];
  }

  getEntries(): MemoryEntry[] {
    return [...this.entries];
  }
}

export function formatMemoryForContext(entries: MemoryEntry[]): string {
  if (entries.length === 0) {
    return 'No prior memories.';
  }

  const lines = ['Recent memory:', ''];
  for (const entry of entries) {
    lines.push(`- ${entry.intent}: ${entry.summary} [${entry.result}]`);
    if (entry.changes && entry.changes.length > 0) {
      lines.push(`  Files: ${entry.changes.join(', ')}`);
    }
  }

  return lines.join('\n');
}

export function hydrateMemoryEntries(raw: unknown): MemoryEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(
      (entry): entry is MemoryEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as MemoryEntry).id === 'string' &&
        typeof (entry as MemoryEntry).prompt === 'string' &&
        typeof (entry as MemoryEntry).intent === 'string' &&
        typeof (entry as MemoryEntry).summary === 'string'
    )
    .map((entry) => ({
      ...entry,
      changes: Array.isArray(entry.changes)
        ? entry.changes.filter((value): value is string => typeof value === 'string')
        : undefined,
    }));
}
