import type { Coder, CoderAnswer, CoderInput, CodeDraft, InlineCompletionInput } from './coder';
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
    constructor(options: OllamaCoderOptions);
    generate(input: CoderInput): Promise<CodeDraft>;
    answer(input: CoderInput, onChunk?: (chunk: string) => void): Promise<CoderAnswer>;
    completeInline(input: InlineCompletionInput): Promise<string>;
    private buildEditSystemPrompt;
    private buildUserPrompt;
    private parseResponse;
    private parseJsonDirect;
    private parseJsonFromMarkdown;
    private parseJsonGreedy;
    private parseFallback;
    private toDraft;
    private stripCodeFences;
    private trimText;
    private shouldAttemptRepair;
    private repairDraftPayload;
}
