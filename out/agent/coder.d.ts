import type { PlanResult } from './planner';
import type { ValidationError } from './validator';
export interface CoderContextFile {
    path: string;
    content: string;
    reason: string;
    language?: string;
    isActive?: boolean;
}
export interface WorkspaceFacts {
    root: string;
    activeFilePath?: string;
    selection?: string;
    workspaceSummary: string;
    dependencyAllowlist: string[];
    openFiles: string[];
    retrievedPaths: string[];
}
export interface CoderContext {
    files: CoderContextFile[];
    workspace: WorkspaceFacts;
    memory: string;
    notes?: string;
}
export interface CoderInput {
    prompt: string;
    plan: PlanResult;
    context: CoderContext;
    deterministic: boolean;
    validationErrors?: ValidationError[];
}
export interface DraftFileChange {
    path: string;
    diff: string;
    summary: string;
    proposedContent?: string;
    originalContent?: string;
    operation?: 'create' | 'update' | 'delete';
}
export interface CodeDraft {
    changes: DraftFileChange[];
    summary: string;
    rationale: string;
    followUpQuestions?: string[];
}
export interface CoderAnswer {
    content: string;
    citations: string[];
}
export interface InlineCompletionInput {
    filePath: string;
    languageId: string;
    prefix: string;
    suffix: string;
    context: CoderContext;
    deterministic: boolean;
}
export interface Coder {
    generate(input: CoderInput): Promise<CodeDraft>;
    answer(input: CoderInput, onChunk?: (chunk: string) => void): Promise<CoderAnswer>;
    completeInline(input: InlineCompletionInput): Promise<string>;
}
export declare class NoopCoder implements Coder {
    generate(_: CoderInput): Promise<CodeDraft>;
    answer(_: CoderInput): Promise<CoderAnswer>;
    completeInline(_: InlineCompletionInput): Promise<string>;
}
