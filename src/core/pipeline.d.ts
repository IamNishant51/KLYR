import type { PlanMode, PlanResult, Planner } from '../agent/planner';
import type { Coder, CoderAnswer, CodeDraft } from '../agent/coder';
import type { DiffPreview, Executor } from '../agent/executor';
import type { ValidationResult, Validator } from '../agent/validator';
import type { ContextDocument, ContextEngine } from '../context/contextEngine';
import { type MemoryStore } from '../context/memory';
import { Logger } from './config';
export interface PipelineConfig {
    maxAttempts: number;
    retrievalMaxResults: number;
    allowNewFiles: boolean;
}
export interface PipelineContext {
    workspaceRoot: string;
    prompt: string;
    activeFilePath?: string;
    selection?: string;
    modeHint?: PlanMode;
    workspaceSummary: string;
    dependencyAllowlist: string[];
    openFiles: string[];
    documents: ContextDocument[];
    logger: Logger;
}
export type PipelineStage = 'planning' | 'retrieving' | 'thinking' | 'validating' | 'review' | 'done';
export interface PipelineCallbacks {
    onStage?: (stage: PipelineStage, detail: string) => void | Promise<void>;
    onAnswerChunk?: (chunk: string) => void | Promise<void>;
}
export interface PipelineResult {
    ok: boolean;
    mode: PlanMode;
    answer?: CoderAnswer;
    draft?: CodeDraft;
    preview?: DiffPreview;
    plan?: PlanResult;
    validation?: ValidationResult;
    error?: string;
    retrievedDocuments: ContextDocument[];
    contextSummary: string;
    logs: string[];
}
export declare class Pipeline {
    private readonly planner;
    private readonly coder;
    private readonly validator;
    private readonly executor;
    private readonly contextEngine;
    private readonly memory;
    private readonly logger;
    private logs;
    constructor(planner: Planner, coder: Coder, validator: Validator, executor: Executor, contextEngine: ContextEngine, memory: MemoryStore, logger: Logger);
    execute(context: PipelineContext, config?: Partial<PipelineConfig>, callbacks?: PipelineCallbacks): Promise<PipelineResult>;
    private buildCoderInput;
    private buildCoderContext;
    private toRelativePath;
    private findPromptMentionedDocuments;
    private extractPathMentions;
    private normalizePath;
    private emitStage;
    private log;
}
