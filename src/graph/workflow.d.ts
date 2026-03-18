/**
 * LangGraph workflow for Klyr execution orchestration.
 * Manages the complete workflow from intent classification to execution and validation.
 */
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { ClassifiedIntent } from '../ml/intentClassifier';
export interface WorkflowState {
    userPrompt: string;
    originalContent?: string;
    workspaceContext?: string;
    intent?: ClassifiedIntent;
    selectedTools?: string[];
    draftContent?: string;
    validationResult?: ValidationResult;
    quality?: number;
    attempts?: number;
    finalContent?: string;
    executionPath?: string;
    errors?: string[];
}
export interface ValidationResult {
    valid: boolean;
    issues: string[];
    confidence: number;
    suggestions?: string[];
}
export declare class KlyrWorkflow {
    private llm;
    private maxAttempts;
    constructor(llm: BaseLanguageModel);
    /**
     * Execute the complete workflow
     */
    execute(state: WorkflowState): Promise<WorkflowState>;
    /**
     * Edit workflow: Generate → Validate → Retry if needed
     */
    private executeEditWorkflow;
    /**
     * Analysis workflow: Analyze code and provide insights
     */
    private executeAnalysisWorkflow;
    /**
     * Chat workflow: Answer questions with context
     */
    private executeChatWorkflow;
    /**
     * Refactor workflow: Improve code quality
     */
    private executeRefactorWorkflow;
    /**
     * Generate workflow: Create new code
     */
    private executeGenerateWorkflow;
    /**
     * Validate generated draft
     */
    private validateDraft;
    /**
     * Run a chain with inputs
     */
    private runChain;
    /**
     * Get workflow summary
     */
    getSummary(state: WorkflowState): string;
}
