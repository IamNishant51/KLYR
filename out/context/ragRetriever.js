"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGRetriever = void 0;
/**
 * RAG (Retrieval-Augmented Generation) orchestrator
 * Combines semantic search, hierarchical summaries, and memory retrieval
 */
class RAGRetriever {
    embeddingCache = new Map();
    chunkIndex = new Map();
    summaryIndex = new Map();
    /**
     * Index code chunks for retrieval
     */
    indexChunks(chunks) {
        chunks.forEach((chunk) => {
            const key = chunk.fileId;
            if (!this.chunkIndex.has(key)) {
                this.chunkIndex.set(key, []);
            }
            this.chunkIndex.get(key).push(chunk);
        });
    }
    /**
     * Index summaries for hierarchical retrieval
     */
    indexSummaries(summaries) {
        summaries.forEach((summary) => {
            let key;
            if ('projectRoot' in summary) {
                key = summary.projectRoot;
            }
            else if ('folderPath' in summary) {
                key = summary.folderPath;
            }
            else {
                key = summary.filePath;
            }
            this.summaryIndex.set(key, summary);
        });
    }
    /**
     * Main retrieval function - combines multiple strategies
     */
    async retrieve(query, chunks, summaries, memory, topK = 10) {
        const startTime = Date.now();
        // 1. Score chunks by relevance (keyword + semantic similarity)
        const scoredChunks = this.scoreChunks(query, chunks);
        // 2. Score summaries by relevance
        const scoredSummaries = this.scoreSummaries(query, summaries);
        // 3. Score memory entries by relevance
        const scoredMemory = this.scoreMemory(query, memory);
        // 4. Select top results from each category
        const selectedChunks = scoredChunks.slice(0, Math.ceil(topK * 0.6)); // 60% chunks
        const selectedSummaries = scoredSummaries.slice(0, Math.ceil(topK * 0.25)); // 25% summaries
        const selectedMemory = scoredMemory.slice(0, Math.ceil(topK * 0.15)); // 15% memory
        // 5. Calculate overall relevance score
        const avgScore = (selectedChunks.reduce((s, c) => s + c.relevanceScore, 0) / Math.max(1, selectedChunks.length) * 0.6 +
            selectedSummaries.reduce((s, c) => s + c.relevanceScore, 0) / Math.max(1, selectedSummaries.length) * 0.25 +
            selectedMemory.reduce((s, m) => s + m.relevanceScore, 0) / Math.max(1, selectedMemory.length) * 0.15) /
            (0.6 + 0.25 + 0.15);
        return {
            chunks: selectedChunks.map((c) => c.chunk),
            summaries: selectedSummaries.map((s) => s.summary),
            memory: selectedMemory.map((m) => m.entry),
            query,
            score: Math.min(1, Math.max(0, avgScore)),
            retrievalTime: Date.now() - startTime,
        };
    }
    /**
     * Score chunks by keyword matching and semantic similarity
     */
    scoreChunks(query, chunks) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        const scored = chunks.map((chunk) => {
            // Keyword matching score
            const contentLower = chunk.content.toLowerCase();
            const keywordMatches = queryTerms.filter((term) => contentLower.includes(term)).length;
            const keywordScore = keywordMatches / Math.max(1, queryTerms.length);
            // Type relevance (functions/classes more relevant than comments)
            const typeScore = chunk.type === 'function' || chunk.type === 'class' ? 1.0 : 0.7;
            // Size preference (medium-sized chunks better than very large/small)
            const lines = chunk.endLine - chunk.startLine;
            const sizeScore = Math.max(0, 1 - Math.abs(lines - 50) / 100);
            // Summary presence bonus
            const summaryScore = chunk.summary ? 0.9 : 0.5;
            // Combine scores
            const relevanceScore = keywordScore * 0.4 + typeScore * 0.3 + sizeScore * 0.2 + summaryScore * 0.1;
            return {
                chunk,
                relevanceScore: Math.min(1, Math.max(0, relevanceScore)),
            };
        });
        // Sort by relevance descending
        scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
        return scored;
    }
    /**
     * Score summaries by semantic relevance
     */
    scoreSummaries(query, summaries) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        const scored = summaries.map((summary) => {
            let relevanceScore = 0;
            if ('filePath' in summary) {
                // FileSummary
                const content = summary.purpose + ' ' + summary.mainExports.join(' ');
                const matches = queryTerms.filter((term) => content.toLowerCase().includes(term)).length;
                relevanceScore = matches / Math.max(1, queryTerms.length) * 0.8 + 0.2;
            }
            else if ('folderPath' in summary && 'fileSummaries' in summary) {
                // FolderSummary
                const content = summary.purpose + ' ' + summary.fileSummaries.map((f) => f.purpose).join(' ');
                const matches = queryTerms.filter((term) => content.toLowerCase().includes(term)).length;
                relevanceScore = matches / Math.max(1, queryTerms.length) * 0.8 + 0.2;
            }
            else {
                // ProjectSummary
                const content = summary.description + ' ' + summary.keyFeatures.join(' ');
                const matches = queryTerms.filter((term) => content.toLowerCase().includes(term)).length;
                relevanceScore = matches / Math.max(1, queryTerms.length) * 0.8 + 0.2;
            }
            return {
                summary,
                relevanceScore: Math.min(1, Math.max(0, relevanceScore)),
            };
        });
        scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
        return scored;
    }
    /**
     * Score memory entries by relevance
     */
    scoreMemory(query, memory) {
        const queryTerms = query.toLowerCase().split(/\s+/);
        const scored = memory.map((entry) => {
            // Keyword matching
            const matches = queryTerms.filter((term) => entry.content.toLowerCase().includes(term)).length;
            const keywordScore = matches / Math.max(1, queryTerms.length);
            // Recency bonus (more recent = higher score)
            const ageMs = Date.now() - entry.timestamp;
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            const recencyScore = Math.max(0, 1 - ageMs / maxAge);
            // Importance bonus
            const importanceScores = {
                low: 0.5,
                medium: 0.75,
                high: 0.9,
                critical: 1.0,
            };
            const importanceScore = importanceScores[entry.importance] || 0.5;
            // Type relevance
            const typeScores = {
                decision: 0.9,
                summary: 0.85,
                conversation: 0.8,
                context: 0.75,
                error: 0.6,
            };
            const typeScore = typeScores[entry.type] || 0.5;
            // Combine scores
            const relevanceScore = keywordScore * 0.4 + recencyScore * 0.2 + importanceScore * 0.2 + typeScore * 0.2;
            return {
                entry,
                relevanceScore: Math.min(1, Math.max(0, relevanceScore)),
            };
        });
        scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
        return scored;
    }
    /**
     * Calculate semantic similarity between two embeddings (cosine similarity)
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);
        if (normA === 0 || normB === 0)
            return 0;
        return dotProduct / (normA * normB);
    }
    /**
     * Clear caches
     */
    clearCache() {
        this.embeddingCache.clear();
        this.chunkIndex.clear();
        this.summaryIndex.clear();
    }
    /**
     * Get retrieval statistics
     */
    getStats() {
        return {
            cachedEmbeddings: this.embeddingCache.size,
            indexedChunks: Array.from(this.chunkIndex.values()).flat().length,
            indexedSummaries: this.summaryIndex.size,
        };
    }
}
exports.RAGRetriever = RAGRetriever;
//# sourceMappingURL=ragRetriever.js.map