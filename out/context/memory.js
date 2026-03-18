"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryStore = void 0;
exports.formatMemoryForContext = formatMemoryForContext;
exports.hydrateMemoryEntries = hydrateMemoryEntries;
class InMemoryStore {
    entries = [];
    maxEntries = 100;
    async add(entry) {
        this.entries.unshift(entry);
        if (this.entries.length > this.maxEntries) {
            this.entries.pop();
        }
    }
    async query(pattern, limit) {
        const lower = pattern.toLowerCase();
        return this.entries
            .filter((entry) => entry.prompt.toLowerCase().includes(lower) ||
            entry.summary.toLowerCase().includes(lower))
            .slice(0, limit);
    }
    async recent(limit) {
        return this.entries.slice(0, limit);
    }
    async clear() {
        this.entries = [];
    }
    getEntries() {
        return [...this.entries];
    }
}
exports.InMemoryStore = InMemoryStore;
function formatMemoryForContext(entries) {
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
function hydrateMemoryEntries(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw
        .filter((entry) => typeof entry === 'object' &&
        entry !== null &&
        typeof entry.id === 'string' &&
        typeof entry.prompt === 'string' &&
        typeof entry.intent === 'string' &&
        typeof entry.summary === 'string')
        .map((entry) => ({
        ...entry,
        changes: Array.isArray(entry.changes)
            ? entry.changes.filter((value) => typeof value === 'string')
            : undefined,
    }));
}
//# sourceMappingURL=memory.js.map