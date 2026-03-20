import * as fs from 'fs/promises';
import * as path from 'path';
import type { EmbeddingProvider, EmbeddingVector } from './embeddings';

interface CacheEntry {
  key: string;
  values: number[];
  updatedAt: number;
}

interface CachePayload {
  entries: CacheEntry[];
}

export class PersistentEmbeddingCacheProvider implements EmbeddingProvider {
  private readonly delegate: EmbeddingProvider;
  private readonly cacheFilePath: string;
  private readonly maxEntries: number;
  private cache = new Map<string, CacheEntry>();
  private loaded = false;

  constructor(delegate: EmbeddingProvider, cacheFilePath: string, maxEntries = 800) {
    this.delegate = delegate;
    this.cacheFilePath = cacheFilePath;
    this.maxEntries = maxEntries;
  }

  async embedText(text: string): Promise<EmbeddingVector> {
    await this.ensureLoaded();

    const key = this.hashText(text);
    const cached = this.cache.get(key);
    if (cached && Array.isArray(cached.values) && cached.values.length > 0) {
      cached.updatedAt = Date.now();
      this.cache.set(key, cached);
      return { values: [...cached.values] };
    }

    const vector = await this.delegate.embedText(text);
    this.cache.set(key, {
      key,
      values: [...vector.values],
      updatedAt: Date.now(),
    });

    this.prune();
    await this.persist();

    return vector;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    this.loaded = true;

    try {
      const raw = await fs.readFile(this.cacheFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as CachePayload;
      if (!parsed || !Array.isArray(parsed.entries)) {
        return;
      }

      for (const entry of parsed.entries) {
        if (!entry || typeof entry.key !== 'string' || !Array.isArray(entry.values)) {
          continue;
        }
        this.cache.set(entry.key, {
          key: entry.key,
          values: entry.values.map((value) => Number(value)).filter((value) => Number.isFinite(value)),
          updatedAt: Number(entry.updatedAt) || Date.now(),
        });
      }

      this.prune();
    } catch {
      // Ignore cache bootstrap errors.
    }
  }

  private prune(): void {
    if (this.cache.size <= this.maxEntries) {
      return;
    }

    const sorted = [...this.cache.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    const keep = sorted.slice(0, this.maxEntries);
    this.cache.clear();
    for (const entry of keep) {
      this.cache.set(entry.key, entry);
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
      const payload: CachePayload = {
        entries: [...this.cache.values()].sort((a, b) => b.updatedAt - a.updatedAt),
      };
      await fs.writeFile(this.cacheFilePath, JSON.stringify(payload), 'utf-8');
    } catch {
      // Ignore cache persistence errors.
    }
  }

  private hashText(text: string): string {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash.toString(16);
  }
}
