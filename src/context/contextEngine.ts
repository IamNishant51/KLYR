import type { EmbeddingProvider, EmbeddingVector } from './embeddings';

export interface ContextDocument {
  id: string;
  uri: string;
  content: string;
  updatedAt: number;
  source?: 'active' | 'selection' | 'open' | 'workspace' | 'memory';
  title?: string;
  tags?: string[];
}

export interface ContextQuery {
  query: string;
  maxResults: number;
}

export interface ContextMatch {
  document: ContextDocument;
  score: number;
}

export interface ContextMemoryItem {
  id: string;
  summary: string;
  createdAt: number;
}

export interface ContextEngine {
  index(documents: ContextDocument[]): Promise<void>;
  query(input: ContextQuery): Promise<ContextMatch[]>;
  recordMemory(item: ContextMemoryItem): Promise<void>;
  recentMemory(limit: number): Promise<ContextMemoryItem[]>;
}

export class InMemoryContextEngine implements ContextEngine {
  private readonly embeddings: EmbeddingProvider;
  private readonly documents = new Map<string, ContextDocument>();
  private readonly vectors = new Map<string, EmbeddingVector>();
  private readonly memory: ContextMemoryItem[] = [];
  private readonly embeddingCache = new Map<string, EmbeddingVector>();
  private readonly MAX_CACHE_SIZE = 500;

  constructor(embeddings: EmbeddingProvider) {
    this.embeddings = embeddings;
  }

  async index(documents: ContextDocument[]): Promise<void> {
    const activeIds = new Set(documents.map((document) => document.id));
    for (const id of this.documents.keys()) {
      if (!activeIds.has(id)) {
        this.documents.delete(id);
        // Clear all associated chunk vectors
        for (const vectorId of this.vectors.keys()) {
          if (vectorId.startsWith(id + '#chunk-')) {
            this.vectors.delete(vectorId);
          }
        }
      }
    }

    const needsEmbedding: Array<{ id: string; embedText: string; cacheKey: string }> = [];

    for (const doc of documents) {
      this.documents.set(doc.id, doc);
      
      // Cursor-style: Chunk the document for high-precision retrieval
      const chunks = chunkContextDocument(doc);
      
      for (const chunk of chunks) {
        const embedText = [chunk.uri, chunk.title ?? '', ...(chunk.tags ?? []), chunk.content].join('\\n');
        const cacheKey = this.getCacheKey(chunk);
        const cached = this.embeddingCache.get(cacheKey);
        
        if (cached) {
          this.vectors.set(chunk.id, cached);
        } else {
          needsEmbedding.push({ id: chunk.id, embedText, cacheKey });
        }
      }
    }

    if (needsEmbedding.length > 0) {
      // Batch embeddings to prevent Ollama overload and improve speed
      const BATCH_SIZE = 5;
      for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
        const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (item) => {
            const vector = await this.embeddings.embedText(item.embedText);
            this.addToCache(item.cacheKey, vector);
            this.vectors.set(item.id, vector);
          })
        );
      }
    }
  }

  async query(input: ContextQuery): Promise<ContextMatch[]> {
    if (this.documents.size === 0) {
      return [];
    }

    const queryVector = await this.embeddings.embedText(input.query);
    const chunkMatches: Array<{ chunkId: string; score: number }> = [];

    // Search across all chunk vectors
    for (const [chunkId, vector] of this.vectors.entries()) {
      const score = this.cosineSimilarity(queryVector.values, vector.values);
      chunkMatches.push({ chunkId, score });
    }

    chunkMatches.sort((left, right) => right.score - left.score);

    const results: ContextMatch[] = [];
    const seenDocuments = new Set<string>();

    for (const match of chunkMatches) {
      if (results.length >= input.maxResults) break;

      // Extract parent doc ID from chunk ID (e.g., "file.ts#chunk-0" -> "file.ts")
      const docId = match.chunkId.split('#chunk-')[0];
      const doc = this.documents.get(docId);

      if (doc && !seenDocuments.has(docId)) {
        const sourceBoost =
          doc.source === 'active'
            ? 0.08
            : doc.source === 'selection'
              ? 0.05
              : doc.source === 'open'
                ? 0.03
                : 0;
        
        results.push({ 
          document: doc, 
          score: match.score + sourceBoost 
        });
        seenDocuments.add(docId);
      }
    }

    return results;
  }

  async recordMemory(item: ContextMemoryItem): Promise<void> {
    this.memory.unshift(item);
  }

  async recentMemory(limit: number): Promise<ContextMemoryItem[]> {
    return this.memory.slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
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

  private getCacheKey(doc: ContextDocument): string {
    return this.simpleHash(doc.content);
  }

  private addToCache(key: string, vector: EmbeddingVector): void {
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

  private simpleHash(content: string): string {
    let hash = 0;
    const length = Math.min(content.length, 1000);
    for (let index = 0; index < length; index += 1) {
      hash = (hash << 5) - hash + content.charCodeAt(index);
      hash |= 0;
    }
    return hash.toString(16);
  }
}

export interface ChunkDocumentOptions {
  maxChunkChars?: number;
  overlapChars?: number;
}

export function chunkContextDocument(
  document: ContextDocument,
  options: ChunkDocumentOptions = {}
): ContextDocument[] {
  const maxChunkChars = options.maxChunkChars ?? 1600;
  const overlapChars = options.overlapChars ?? 200;

  if (document.content.length <= maxChunkChars) {
    return [document];
  }

  const chunks: ContextDocument[] = [];
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
