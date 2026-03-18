"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryManager = void 0;
class MemoryManager {
    shortTerm;
    midTerm;
    longTerm;
    constructor() {
        // Short-term: Current task context (keep for 30 minutes)
        this.shortTerm = {
            name: 'short-term',
            maxSize: 50,
            ttl: 30 * 60 * 1000,
            entries: [],
        };
        // Mid-term: Session history (keep for 24 hours)
        this.midTerm = {
            name: 'mid-term',
            maxSize: 200,
            ttl: 24 * 60 * 60 * 1000,
            entries: [],
        };
        // Long-term: Persistent embeddings and summaries (keep indefinitely or until next session)
        this.longTerm = {
            name: 'long-term',
            maxSize: 500,
            ttl: 0, // No TTL
            entries: [],
        };
    }
    /**
     * Add entry to appropriate memory layer based on importance
     */
    add(entry) {
        // Clean expired entries first
        this.cleanExpired();
        // Determine which layer to add to
        let layer = this.shortTerm;
        if (entry.importance === 'critical' || entry.importance === 'high') {
            layer = this.midTerm;
        }
        if (entry.importance === 'critical' && entry.type === 'summary') {
            layer = this.longTerm;
        }
        // Add to layer
        layer.entries.push(entry);
        // Maintain size limits
        if (layer.entries.length > layer.maxSize) {
            // Keep most important entries
            layer.entries.sort((a, b) => a.importance === b.importance ? b.timestamp - a.timestamp : this.importanceScore(b.importance) - this.importanceScore(a.importance));
            layer.entries = layer.entries.slice(0, layer.maxSize);
        }
    }
    /**
     * Query memory across all layers
     */
    query(type, minImportance, limit = 10) {
        const results = [];
        // Combine all layers with preference for recent entries
        const combined = [
            ...this.shortTerm.entries.map((e) => ({ ...e, layer: 'short-term', weight: 3 })),
            ...this.midTerm.entries.map((e) => ({ ...e, layer: 'mid-term', weight: 2 })),
            ...this.longTerm.entries.map((e) => ({ ...e, layer: 'long-term', weight: 1 })),
        ];
        // Filter by type
        let filtered = combined;
        if (type) {
            filtered = filtered.filter((e) => e.type === type);
        }
        // Filter by importance
        if (minImportance) {
            const minScore = this.importanceScore(minImportance);
            filtered = filtered.filter((e) => this.importanceScore(e.importance) >= minScore);
        }
        // Sort by recency (weighted by layer)
        filtered.sort((a, b) => {
            const scoreA = b.timestamp * b.weight;
            const scoreB = a.timestamp * a.weight;
            return scoreA - scoreB;
        });
        return filtered.slice(0, limit).map((e) => {
            const { layer, weight, ...entry } = e;
            return entry;
        });
    }
    /**
     * Get short-term memory (current task context)
     */
    getShortTerm(limit = 20) {
        return this.shortTerm.entries.slice(-limit);
    }
    /**
     * Get mid-term memory (session history)
     */
    getMidTerm(limit = 50) {
        return this.midTerm.entries.slice(-limit);
    }
    /**
     * Get long-term memory (persistent knowledge)
     */
    getLongTerm(type, limit = 100) {
        let entries = this.longTerm.entries;
        if (type) {
            entries = entries.filter((e) => e.type === type);
        }
        return entries.slice(-limit);
    }
    /**
     * Promote entry from short-term to mid-term
     */
    promote(entryId) {
        const index = this.shortTerm.entries.findIndex((e) => e.id === entryId);
        if (index === -1)
            return;
        const entry = this.shortTerm.entries.splice(index, 1)[0];
        entry.importance = 'high';
        this.midTerm.entries.push(entry);
    }
    /**
     * Archive important entries to long-term
     */
    archive(entryId) {
        let entry = null;
        const shortIdx = this.shortTerm.entries.findIndex((e) => e.id === entryId);
        if (shortIdx !== -1) {
            entry = this.shortTerm.entries.splice(shortIdx, 1)[0];
        }
        const midIdx = this.midTerm.entries.findIndex((e) => e.id === entryId);
        if (midIdx !== -1) {
            entry = this.midTerm.entries.splice(midIdx, 1)[0];
        }
        if (entry) {
            entry.importance = 'critical';
            this.longTerm.entries.push(entry);
        }
    }
    /**
     * Clear expired entries
     */
    cleanExpired() {
        const now = Date.now();
        this.shortTerm.entries = this.shortTerm.entries.filter((e) => !e.ttl || e.timestamp + (e.ttl || this.shortTerm.ttl) > now);
        this.midTerm.entries = this.midTerm.entries.filter((e) => !e.ttl || e.timestamp + (e.ttl || this.midTerm.ttl) > now);
        // Long-term has no default TTL, but respects individual entry TTL
        this.longTerm.entries = this.longTerm.entries.filter((e) => !e.ttl || e.timestamp + e.ttl > now);
    }
    /**
     * Export memory for persistence
     */
    export() {
        this.cleanExpired();
        return {
            shortTerm: this.shortTerm.entries,
            midTerm: this.midTerm.entries,
            longTerm: this.longTerm.entries,
        };
    }
    /**
     * Import memory from persistence
     */
    import(data) {
        this.shortTerm.entries = data.shortTerm || [];
        this.midTerm.entries = data.midTerm || [];
        this.longTerm.entries = data.longTerm || [];
        this.cleanExpired();
    }
    /**
     * Get summary of all memory
     */
    getSummary() {
        return {
            totalEntries: this.shortTerm.entries.length + this.midTerm.entries.length + this.longTerm.entries.length,
            shortTermCount: this.shortTerm.entries.length,
            midTermCount: this.midTerm.entries.length,
            longTermCount: this.longTerm.entries.length,
            criticalCount: this.shortTerm.entries.filter((e) => e.importance === 'critical').length +
                this.midTerm.entries.filter((e) => e.importance === 'critical').length +
                this.longTerm.entries.filter((e) => e.importance === 'critical').length,
        };
    }
    importanceScore(importance) {
        const scores = {
            low: 1,
            medium: 2,
            high: 3,
            critical: 4,
        };
        return scores[importance] || 0;
    }
}
exports.MemoryManager = MemoryManager;
//# sourceMappingURL=memoryManager.js.map