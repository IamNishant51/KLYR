/**
 * LangGraph workflow for Klyr execution orchestration.
 * Manages the complete workflow from intent classification to execution and validation.
 */

import { createEditChain, createValidationChain, createAnalysisChain, createToolSelectionChain } from '../chains/index';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { ClassifiedIntent } from '../ml/intentClassifier';

export interface WorkflowState {
  // Input
  userPrompt: string;
  originalContent?: string;
  workspaceContext?: string;

  // Processing
  intent?: ClassifiedIntent;
  selectedTools?: string[];
  draftContent?: string;
  validationResult?: ValidationResult;
  quality?: number;
  attempts?: number;

  // Output
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

export class KlyrWorkflow {
  private llm: BaseLanguageModel;
  private maxAttempts = 3;

  constructor(llm: BaseLanguageModel) {
    this.llm = llm;
  }

  /**
   * Execute the complete workflow
   */
  async execute(state: WorkflowState): Promise<WorkflowState> {
    console.log('[Klyr] Starting workflow execution');

    // Route based on intent
    if (!state.intent) {
      console.log('[Klyr] Workflow error: No intent provided');
      return state;
    }

    switch (state.intent.intent) {
      case 'edit':
        return await this.executeEditWorkflow(state);
      case 'analyze':
        return await this.executeAnalysisWorkflow(state);
      case 'chat':
        return await this.executeChatWorkflow(state);
      case 'refactor':
        return await this.executeRefactorWorkflow(state);
      case 'generate':
        return await this.executeGenerateWorkflow(state);
      default:
        console.log(`[Klyr] Unknown intent: ${state.intent.intent}`);
        state.errors = ['Unsupported intent type'];
        return state;
    }
  }

  /**
   * Edit workflow: Generate → Validate → Retry if needed
   */
  private async executeEditWorkflow(state: WorkflowState): Promise<WorkflowState> {
    console.log('[Klyr] Executing edit workflow');
    state.executionPath = 'edit';
    state.attempts = 0;

    const editChain = createEditChain(this.llm);

    while (state.attempts! < this.maxAttempts) {
      state.attempts!++;
      console.log(`[Klyr] Edit attempt ${state.attempts} of ${this.maxAttempts}`);

      try {
        // Generate draft
        state.draftContent = await this.runChain(
          editChain,
          {
            userRequest: state.userPrompt,
            originalContent: state.originalContent || '',
            availableTools: state.intent?.relatedTools?.join(', ') || 'None',
          }
        );

        // Validate draft
        state.validationResult = await this.validateDraft(state);

        if (state.validationResult.valid) {
          console.log('[Klyr] Draft validation passed');
          state.finalContent = state.draftContent;
          state.quality = state.validationResult.confidence;
          break;
        }

        console.log('[Klyr] Draft validation failed, retrying...');
        // Continue to next attempt
      } catch (error) {
        console.error('[Klyr] Edit workflow error:', error);
        state.errors = state.errors || [];
        state.errors.push(`Attempt ${state.attempts}: ${String(error)}`);
      }
    }

    if (!state.finalContent && state.draftContent) {
      console.log('[Klyr] Using draft despite validation issues');
      state.finalContent = state.draftContent;
      state.quality = 0.6;
    }

    return state;
  }

  /**
   * Analysis workflow: Analyze code and provide insights
   */
  private async executeAnalysisWorkflow(state: WorkflowState): Promise<WorkflowState> {
    console.log('[Klyr] Executing analysis workflow');
    state.executionPath = 'analysis';

    const analysisChain = createAnalysisChain(this.llm);

    try {
      const result = await this.runChain(
        analysisChain,
        {
          code: state.originalContent || '',
        }
      );

      state.finalContent = result;
      state.quality = 0.9;
    } catch (error) {
      console.error('[Klyr] Analysis workflow error:', error);
      state.errors = [String(error)];
    }

    return state;
  }

  /**
   * Chat workflow: Answer questions with context
   */
  private async executeChatWorkflow(state: WorkflowState): Promise<WorkflowState> {
    console.log('[Klyr] Executing chat workflow');
    state.executionPath = 'chat';

    // Simple chat - just use the LLM directly
    try {
      const prompt = `Context:\n${state.workspaceContext || 'No context'}\n\nQuestion: ${state.userPrompt}`;
      state.finalContent = await this.runChain(
        this.llm,
        { input: prompt }
      );
      state.quality = 0.85;
    } catch (error) {
      console.error('[Klyr] Chat workflow error:', error);
      state.errors = [String(error)];
    }

    return state;
  }

  /**
   * Refactor workflow: Improve code quality
   */
  private async executeRefactorWorkflow(state: WorkflowState): Promise<WorkflowState> {
    console.log('[Klyr] Executing refactor workflow');
    state.executionPath = 'refactor';

    // Refactor is similar to edit but with different prompt focus
    state.intent!.intent = 'edit'; // Reuse edit workflow
    return await this.executeEditWorkflow(state);
  }

  /**
   * Generate workflow: Create new code
   */
  private async executeGenerateWorkflow(state: WorkflowState): Promise<WorkflowState> {
    console.log('[Klyr] Executing generate workflow');
    state.executionPath = 'generate';

    // Similar to edit but starting from scratch
    const chain = createEditChain(this.llm);

    try {
      state.draftContent = await this.runChain(
        chain,
        {
          userRequest: state.userPrompt,
          originalContent: `/* Generated based on: ${state.userPrompt} */`,
          availableTools: state.intent?.relatedTools?.join(', ') || 'None',
        }
      );

      state.finalContent = state.draftContent;
      state.quality = 0.8;
    } catch (error) {
      console.error('[Klyr] Generate workflow error:', error);
      state.errors = [String(error)];
    }

    return state;
  }

  /**
   * Validate generated draft
   */
  private async validateDraft(state: WorkflowState): Promise<ValidationResult> {
    const validationChain = createValidationChain(this.llm);

    try {
      const result = await this.runChain(
        validationChain,
        {
          original: state.originalContent || '',
          proposed: state.draftContent || '',
        }
      );

      // Parse JSON result
      const parsed = JSON.parse(result);
      return {
        valid: parsed.valid,
        issues: parsed.issues || [],
        confidence: parsed.confidence || 0.5,
        suggestions: parsed.suggestions || [],
      };
    } catch (error) {
      console.error('[Klyr] Validation error:', error);
      // Default to treating it as valid with low confidence
      return {
        valid: true,
        issues: ['Validation parsing failed'],
        confidence: 0.3,
      };
    }
  }

  /**
   * Run a chain with inputs
   */
  private async runChain(chain: any, inputs: Record<string, string>): Promise<string> {
    try {
      const result = await chain.invoke(inputs);
      return typeof result === 'string' ? result : result.content || String(result);
    } catch (error) {
      console.error('[Klyr] Chain execution error:', error);
      throw error;
    }
  }

  /**
   * Get workflow summary
   */
  getSummary(state: WorkflowState): string {
    return `
Workflow Summary:
- Execution Path: ${state.executionPath}
- Attempts: ${state.attempts}
- Quality Score: ${(state.quality || 0).toFixed(2)}
- Errors: ${state.errors?.length || 0}
- Final Content Length: ${state.finalContent?.length || 0} chars
    `.trim();
  }
}
