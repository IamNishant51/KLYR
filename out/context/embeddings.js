"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NaiveEmbeddingProvider = void 0;
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