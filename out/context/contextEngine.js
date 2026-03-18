"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryContextEngine = void 0;
exports.chunkContextDocument = chunkContextDocument;
class InMemoryContextEngine {
    embeddings;
    documents = new Map();
    vectors = new Map();
    memory = [];
    constructor(embeddings) {
        this.embeddings = embeddings;
    }
    async index(documents) {
        for (const doc of documents) {
            this.documents.set(doc.id, doc);
            const embedText = [doc.uri, doc.title ?? '', ...(doc.tags ?? []), doc.content].join('\n');
            this.vectors.set(doc.id, await this.embeddings.embedText(embedText));
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