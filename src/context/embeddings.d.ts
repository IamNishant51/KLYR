export interface EmbeddingVector {
    values: number[];
}
export interface EmbeddingProvider {
    embedText(text: string): Promise<EmbeddingVector>;
}
export declare class NaiveEmbeddingProvider implements EmbeddingProvider {
    private readonly dimensions;
    embedText(text: string): Promise<EmbeddingVector>;
    private hashToken;
}
