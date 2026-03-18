"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NaiveEmbeddingProvider = exports.OllamaEmbeddingProvider = void 0;
class OllamaEmbeddingProvider {
    baseUrl;
    timeoutMs;
    fallback = new NaiveEmbeddingProvider();
    cache = new Map();
    maxCacheSize = 1000;
    constructor(baseUrl = 'http://localhost:11434', timeoutMs = 30000) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.timeoutMs = timeoutMs;
    }
    async embedText(text) {
        const cacheKey = this.hashContent(text);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'nomic-embed-text',
                        prompt: text,
                    }),
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new Error(`Embedding request failed with ${response.status}`);
                }
                const payload = (await response.json());
                if (!Array.isArray(payload.embedding)) {
                    throw new Error('Embedding payload missing vector array');
                }
                const values = payload.embedding
                    .map((value) => Number(value))
                    .filter((value) => Number.isFinite(value));
                if (values.length === 0) {
                    throw new Error('Embedding vector was empty');
                }
                const vector = { values };
                this.addToCache(cacheKey, vector);
                return vector;
            }
            finally {
                clearTimeout(timeout);
            }
        }
        catch {
            const fallback = await this.fallback.embedText(text);
            this.addToCache(cacheKey, fallback);
            return fallback;
        }
    }
    addToCache(key, vector) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        this.cache.set(key, vector);
        while (this.cache.size > this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            if (!firstKey) {
                break;
            }
            this.cache.delete(firstKey);
        }
    }
    hashContent(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash.toString(16);
    }
}
exports.OllamaEmbeddingProvider = OllamaEmbeddingProvider;
class NaiveEmbeddingProvider {
    dimensions = 128;
    async embedText(text) {
        const values = new Array(this.dimensions).fill(0);
        const tokens = text.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [];
        for (const token of tokens) {
            const index = this.hashToken(token) % this.dimensions;
            values[index] += 1;
        }
        let norm = 0;
        for (const value of values) {
            norm += value * value;
        }
        if (norm > 0) {
            const scale = Math.sqrt(norm);
            for (let i = 0; i < values.length; i += 1) {
                values[i] = values[i] / scale;
            }
        }
        return { values };
    }
    hashToken(token) {
        let hash = 2166136261;
        for (let i = 0; i < token.length; i += 1) {
            hash ^= token.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return Math.abs(hash);
    }
}
exports.NaiveEmbeddingProvider = NaiveEmbeddingProvider;
//# sourceMappingURL=embeddings.js.map