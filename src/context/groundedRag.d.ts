import { type ContextDocument } from './contextEngine';
import type { EmbeddingProvider } from './embeddings';
interface LoggerLike {
    debug(message: string): void;
}
export interface GroundedRagResult {
    documents: ContextDocument[];
    references: string[];
    warnings: string[];
}
export interface GroundedRagOptions {
    trustedDomains: string[];
    trustedGitHubOrgs: string[];
}
export declare class GroundedRagService {
    private readonly embeddings;
    private readonly options;
    private readonly logger?;
    constructor(embeddings: EmbeddingProvider, options: GroundedRagOptions, logger?: LoggerLike | undefined);
    retrieve(prompt: string): Promise<GroundedRagResult>;
    private normalizeQuery;
    private fetchInternetDocument;
    private fetchWikipediaDocument;
    private fetchGitHubDocuments;
    private fetchGitHubReadme;
    private fetchDesignInspirationDocuments;
    private isDesignPrompt;
    private extractTrustedLinks;
    private fetchTextWithTimeout;
    private fetchJsonWithTimeout;
    private cleanText;
    private truncate;
    private isTrustedDomain;
    private isAllowedGitHubRepo;
}
export {};
