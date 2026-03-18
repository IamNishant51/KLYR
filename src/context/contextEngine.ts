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

  constructor(embeddings: EmbeddingProvider) {
    this.embeddings = embeddings;
  }

  async index(documents: ContextDocument[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
      const embedText = [doc.uri, doc.title ?? '', ...(doc.tags ?? []), doc.content].join('\n');
      this.vectors.set(doc.id, await this.embeddings.embedText(embedText));
    }
  }

  async query(input: ContextQuery): Promise<ContextMatch[]> {
    if (this.documents.size === 0) {
      return [];
    }

    const queryVector = await this.embeddings.embedText(input.query);
    const results: ContextMatch[] = [];

    for (const [id, doc] of this.documents.entries()) {
      const vector = this.vectors.get(id);
      if (!vector) {
        continue;
      }

      const sourceBoost =
        doc.source === 'active'
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
