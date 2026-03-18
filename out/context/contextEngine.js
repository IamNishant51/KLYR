"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryContextEngine = void 0;
exports.chunkContextDocument = chunkContextDocument;
class InMemoryContextEngine {
    embeddings;
    documents = new Map();
    vectors = new Map();
    memory = [];
    embeddingCache = new Map();
    MAX_CACHE_SIZE = 500;
    constructor(embeddings) {
        this.embeddings = embeddings;
    }
    async index(documents) {
        const activeIds = new Set(documents.map((document) => document.id));
        for (const id of this.documents.keys()) {
            if (!activeIds.has(id)) {
                this.documents.delete(id);
                this.vectors.delete(id);
            }
        }
        const needsEmbedding = [];
        for (const doc of documents) {
            this.documents.set(doc.id, doc);
            const embedText = [doc.uri, doc.title ?? '', ...(doc.tags ?? []), doc.content].join('\n');
            const cacheKey = this.getCacheKey(doc);
            const cached = this.embeddingCache.get(cacheKey);
            if (cached) {
                this.vectors.set(doc.id, cached);
            }
            else {
                needsEmbedding.push({ doc, embedText, cacheKey });
            }
        }
        if (needsEmbedding.length > 0) {
            const embedded = await Promise.all(needsEmbedding.map(async (item) => {
                const vector = await this.embeddings.embedText(item.embedText);
                return { ...item, vector };
            }));
            for (const item of embedded) {
                this.addToCache(item.cacheKey, item.vector);
                this.vectors.set(item.doc.id, item.vector);
            }
        }
    }
    async query(input) {
        if (this.documents.size === 0) {
            return [];
        }
        const queryVector = await this.embeddings.embedText(input.query);
        const results = [];
        for (const [id, doc] of this.documents.entries()) {
            const vector = this.vectors.get(id);
            if (!vector) {
                continue;
            }
            const sourceBoost = doc.source === 'active'
                ? 0.08
                : doc.source === 'selection'
                    ? 0.05
                    : doc.source === 'open'
                        ? 0.03
                        : 0;
            const score = this.cosineSimilarity(queryVector.values, vector.values) + sourceBoost;
            results.push({ document: doc, score });
        }
        results.sort((left, right) => right.score - left.score);
        return results.slice(0, input.maxResults);
    }
    async recordMemory(item) {
        this.memory.unshift(item);
    }
    async recentMemory(limit) {
        return this.memory.slice(0, limit);
    }
    cosineSimilarity(a, b) {
        const length = Math.min(a.length, b.length);
        if (length === 0) {
            return 0;
        }
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < length; i += 1) {
            const av = a[i];
            const bv = b[i];
            dot += av * bv;
            normA += av * av;
            normB += bv * bv;
        }
        if (normA === 0 || normB === 0) {
            return 0;
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    getCacheKey(doc) {
        return this.simpleHash(doc.content);
    }
    addToCache(key, vector) {
        if (this.embeddingCache.has(key)) {
            this.embeddingCache.delete(key);
        }
        this.embeddingCache.set(key, vector);
        while (this.embeddingCache.size > this.MAX_CACHE_SIZE) {
            const firstKey = this.embeddingCache.keys().next().value;
            if (!firstKey) {
                break;
            }
            this.embeddingCache.delete(firstKey);
        }
    }
    simpleHash(content) {
        let hash = 0;
        const length = Math.min(content.length, 1000);
        for (let index = 0; index < length; index += 1) {
            hash = (hash << 5) - hash + content.charCodeAt(index);
            hash |= 0;
        }
        return hash.toString(16);
    }
}
exports.InMemoryContextEngine = InMemoryContextEngine;
function chunkContextDocument(document, options = {}) {
    const maxChunkChars = options.maxChunkChars ?? 1600;
    const overlapChars = options.overlapChars ?? 200;
    if (document.content.length <= maxChunkChars) {
        return [document];
    }
    const chunks = [];
    let start = 0;
    let index = 0;
    while (start < document.content.length) {
        const end = Math.min(document.content.length, start + maxChunkChars);
        chunks.push({
            ...document,
            id: `${document.id}#chunk-${index}`,
            title: `${document.title ?? document.uri} (chunk ${index + 1})`,
            content: document.content.slice(start, end),
        });
        if (end >= document.content.length) {
            break;
        }
        index += 1;
        start = Math.max(0, end - overlapChars);
    }
    return chunks;
}
//# sourceMappingURL=contextEngine.js.map