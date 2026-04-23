import type { Coder, CoderAnswer, CoderResponse, CoderInput, InlineCompletionInput } from './coder';
import type { OllamaClient } from '../llm/ollamaClient';
export interface OllamaCoderOptions {
    client: OllamaClient;
    model: string;
    temperature: number;
}
export declare class OllamaCoder implements Coder {
    private readonly client;
    private readonly model;
    private readonly temperature;
    private lastContextFile;
    constructor(options: OllamaCoderOptions);
    generate(input: CoderInput): Promise<CoderResponse>;
    private normalizeDraftOperationsForWorkspace;
    answer(input: CoderInput, onChunk?: (chunk: string) => void): Promise<CoderAnswer>;
    completeInline(input: InlineCompletionInput): Promise<string>;
    private buildEditSystemPrompt;
    private buildUserPrompt;
    private resolvePrimaryContextFile;
    private parseResponse;
    private parseFallback;
    private toDraft;
    private stripCodeFences;
    private trimText;
    private shouldAttemptRepair;
    private validateAndCorrectDraft;
    private correctPackageJson;
    private correctViteConfig;
    private correctMainJsx;
    private getPackageJsonTemplate;
    private getViteConfigTemplate;
    private getMainJsxTemplate;
    private getAppJsxTemplate;
    private getIndexCssTemplate;
    private getAppCssTemplate;
    private extractProjectScaffoldHints;
    private stripAccidentalPronounPrefix;
    private repairDraftPayload;
}
