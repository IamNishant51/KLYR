export interface EmbeddingVector {
  values: number[];
}

export interface EmbeddingProvider {
  embedText(text: string): Promise<EmbeddingVector>;
}

export class NaiveEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions = 128;

  async embedText(text: string): Promise<EmbeddingVector> {
    const values = new Array<number>(this.dimensions).fill(0);
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

  private hashToken(token: string): number {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }
}
