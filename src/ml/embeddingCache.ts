/**
 * Embedding cache for fast intent classification and semantic similarity.
 * Uses simple in-memory + file-based caching for embeddings.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface EmbeddingEntry {
  text: string;
  embedding: number[];
  hash: string;
  timestamp: number;
  label?: string; // Optional label for categorized embeddings
}

export class EmbeddingCache {
  private cache: Map<string, EmbeddingEntry> = new Map();
  private cacheDir: string;
  private maxCacheSize = 1000;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  /**
   * Initialize cache from disk
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      const files = await fs.readdir(this.cacheDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await fs.readFile(path.join(this.cacheDir, file), 'utf-8');
          const entries: EmbeddingEntry[] = JSON.parse(content);

          for (const entry of entries) {
            this.cache.set(entry.hash, entry);
          }
        } catch (error) {
          console.error(`[Klyr] Failed to load cache file ${file}:`, error);
        }
      }

      console.log(`[Klyr] Loaded ${this.cache.size} cached embeddings`);
    } catch (error) {
      console.error('[Klyr] Failed to initialize embedding cache:', error);
    }
  }

  /**
   * Get embedding for text, checking cache first
   */
  async getOrCompute(
    text: string,
    computeFn: (text: string) => Promise<number[]>,
    label?: string
  ): Promise<number[]> {
    const hash = this.hashText(text);
    const cached = this.cache.get(hash);

    if (cached) {
      console.log(`[Klyr] Embedding cache hit for: ${text.slice(0, 40)}`);
      return cached.embedding;
    }

    console.log(`[Klyr] Embedding cache miss, computing for: ${text.slice(0, 40)}`);
    const embedding = await computeFn(text);

    // Store in cache
    const entry: EmbeddingEntry = {
      text,
      embedding,
      hash,
      timestamp: Date.now(),
      label,
    };

    this.cache.set(hash, entry);

    // Trigger save if cache is large enough
    if (this.cache.size % 50 === 0) {
      this.persist().catch((err) => console.error('[Klyr] Failed to persist cache:', err));
    }

    return embedding;
  }

  /**
   * Compute semantic similarity between two embeddings (cosine similarity)
   */
  similarity(emb1: number[], emb2: number[]): number {
    if (emb1.length !== emb2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < emb1.length; i++) {
      dotProduct += emb1[i] * emb2[i];
      norm1 += emb1[i] * emb1[i];
      norm2 += emb2[i] * emb2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Find most similar cached embeddings
   */
  findSimilar(
    embedding: number[],
    topK: number = 5,
    minScore: number = 0.5
  ): EmbeddingEntry[] {
    const results: Array<{ entry: EmbeddingEntry; score: number }> = [];

    for (const entry of this.cache.values()) {
      const score = this.similarity(embedding, entry.embedding);
      if (score >= minScore) {
        results.push({ entry, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((r) => r.entry);
  }

  /**
   * Hash text for cache key
   */
  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Persist cache to disk
   */
  async persist(): Promise<void> {
    try {
      const entries = Array.from(this.cache.values());

      // Split into multiple files to avoid huge JSON files
      const chunkSize = 100;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        const file = path.join(this.cacheDir, `embeddings-${i / chunkSize}.json`);
        await fs.writeFile(file, JSON.stringify(chunk, null, 2), 'utf-8');
      }

      console.log(`[Klyr] Persisted ${entries.length} embeddings to cache`);
    } catch (error) {
      console.error('[Klyr] Failed to persist embedding cache:', error);
    }
  }

  /**
   * Clear old cache entries (older than 7 days)
   */
  async cleanup(): Promise<void> {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [hash, entry] of this.cache.entries()) {
      if (entry.timestamp < sevenDaysAgo) {
        this.cache.delete(hash);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[Klyr] Cleaned up ${removed} old embeddings`);
      await this.persist();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    diskSize: number;
    labels: Record<string, number>;
  } {
    const labelCounts: Record<string, number> = {};

    for (const entry of this.cache.values()) {
      if (entry.label) {
        labelCounts[entry.label] = (labelCounts[entry.label] || 0) + 1;
      }
    }

    return {
      totalEntries: this.cache.size,
      diskSize: this.cache.size * 1024, // Rough estimate
      labels: labelCounts,
    };
  }
}
