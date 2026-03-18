import type { ContextDocument, ContextEngine } from './contextEngine';
export interface RetrievalOptions {
    maxResults: number;
    minScore: number;
}
export interface RetrievalResult {
    documents: ContextDocument[];
    totalScore: number;
    avgScore: number;
}
export declare function retrieveRelevantContext(engine: ContextEngine, query: string, options?: Partial<RetrievalOptions>): Promise<RetrievalResult>;
export declare function summarizeContext(documents: ContextDocument[]): string;
export declare function uniqueDocumentsByPath(documents: ContextDocument[]): ContextDocument[];
