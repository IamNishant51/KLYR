export interface CodeChunk {
    id: string;
    fileId: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    type: 'function' | 'class' | 'block' | 'module';
    language: string;
    summary?: string;
    embedding?: number[];
}
export interface ChunkingOptions {
    maxChunkSize?: number;
    overlapLines?: number;
    language?: string;
}
export declare class CodeChunker {
    /**
     * Split code into logical chunks (functions, classes, blocks)
     * Tries to preserve semantic meaning when possible
     */
    chunkCode(fileId: string, filePath: string, content: string, language: string, options?: ChunkingOptions): Promise<CodeChunk[]>;
    private chunkPython;
    private chunkJavaScript;
    private chunkJava;
    private chunkBySize;
    private findPatternIndices;
}
