/**
 * ML Integration Guide for Klyr Extension
 * 
 * This document explains how to integrate the new ML/LangChain features
 * into the existing extension architecture.
 */

import type { OllamaCoder } from '../agent/ollamaCoder';
import type { FileSystemExecutor } from '../agent/executor';
import { AdvancedIntentClassifier } from './intentClassifier';
import { EmbeddingCache } from './embeddingCache';
import { TokenOptimizer, type ContextSegment } from './tokenOptimizer';
import { KlyrWorkflow, type WorkflowState } from '../graph/workflow';
import { getMLConfig } from './config';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';

/**
 * Integration example showing how to use ML features in the pipeline
 * 
 * Replace in extension.ts pipeline creation:
 */
export class MLEnhancedPipeline {
  private classifier: AdvancedIntentClassifier;
  private embeddingCache: EmbeddingCache;
  private tokenOptimizer: TokenOptimizer;
  private workflow: KlyrWorkflow;
  private config = getMLConfig();

  constructor(
    private llm: BaseLanguageModel,
    cacheDir: string
  ) {
    this.classifier = new AdvancedIntentClassifier(cacheDir);
    this.embeddingCache = new EmbeddingCache(cacheDir);
    this.tokenOptimizer = new TokenOptimizer();
    this.workflow = new KlyrWorkflow(llm);
  }

  async initialize(): Promise<void> {
    await this.classifier.initialize();
    await this.embeddingCache.initialize();
  }

  /**
   * Enhanced execution flow with ML features
   * 
   * Usage in extension.ts:
   * 
   * 1. Classify intent:
   *    const classifiedIntent = await mlPipeline.classifyIntent(userPrompt);
   * 
   * 2. Select tools:
   *    const tools = classifiedIntent.relatedTools;
   * 
   * 3. Optimize context:
   *    const optimizedContext = mlPipeline.optimizeContext(workspaceContext);
   * 
   * 4. Execute workflow:
   *    const result = await mlPipeline.executeWorkflow({
   *      userPrompt,
   *      originalContent,
   *      workspaceContext,
   *      intent: classifiedIntent
   *    });
   */

  async classifyIntent(prompt: string) {
    return await this.classifier.classify(prompt);
  }

  optimizeContext(
    codeSnippets: string[],
    documentation: string[],
    config: string[]
  ): { optimized: string; efficiency: any } {
    const segments: ContextSegment[] = [
      ...codeSnippets.map((content, i) => ({
        content,
        priority: 80,
        type: 'code' as const,
        metadata: { index: i },
      })),
      ...documentation.map((content, i) => ({
        content,
        priority: 60,
        type: 'doc' as const,
        metadata: { index: i },
      })),
      ...config.map((content, i) => ({
        content,
        priority: 40,
        type: 'config' as const,
        metadata: { index: i },
      })),
    ];

    const budget = this.tokenOptimizer.calculateBudget(
      this.config.tokenOptimization.contextWindowSize
    );
    const { selected, truncated } = this.tokenOptimizer.optimizeContext(
      segments,
      budget,
      500 // Rough estimate of system prompt tokens
    );

    const optimized = selected.map((s) => s.content).join('\n\n');
    const efficiency = this.tokenOptimizer.getEfficiency(
      this.tokenOptimizer.countTokens(optimized),
      budget
    );

    return { optimized, efficiency };
  }

  async executeWorkflow(state: Partial<WorkflowState>): Promise<WorkflowState> {
    const workflowState: WorkflowState = {
      userPrompt: state.userPrompt || '',
      originalContent: state.originalContent,
      workspaceContext: state.workspaceContext,
      intent: state.intent,
    };

    return await this.workflow.execute(workflowState);
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return this.embeddingCache.getStats();
  }

  /**
   * Clean up old cache entries
   */
  async cleanupCache() {
    await this.embeddingCache.cleanup();
  }
}

/**
 * INTEGRATION CHECKLIST for adding ML features to extension.ts:
 * 
 * ✓ 1. Create MLEnhancedPipeline instance in KlyrExtensionController constructor
 *       this.mlPipeline = new MLEnhancedPipeline(ollamaClient, cacheDir);
 * 
 * ✓ 2. Initialize ML pipeline on extension activation
 *       await this.mlPipeline.initialize();
 * 
 * ✓ 3. Replace intent classification with advanced classifier
 *       const intent = await this.mlPipeline.classifyIntent(prompt);
 * 
 * ✓ 4. Use optimized context instead of raw context
 *       const { optimized } = this.mlPipeline.optimizeContext(...);
 * 
 * ✓ 5. Execute workflow instead of direct planner
 *       const workflowResult = await this.mlPipeline.executeWorkflow({...});
 * 
 * ✓ 6. Use workflow result for file operations
 *       await this.applyWorkflowResult(workflowResult);
 * 
 * ✓ 7. Add periodic cache cleanup (every 24 hours)
 *       setInterval(() => this.mlPipeline.cleanupCache(), 24 * 60 * 60 * 1000);
 * 
 * ✓ 8. Log metrics for monitoring
 *       console.log('[Klyr ML]', this.mlPipeline.getCacheStats());
 * 
 * KEPT INTACT:
 * - All existing animations and UI
 * - Backup and restore functionality
 * - Content preservation logic
 * - Diff decorations
 * - Webview interactions
 * 
 * NEW CAPABILITIES:
 * - Smarter intent classification with semantic understanding
 * - Automatic context optimization
 * - Multi-step workflow orchestration
 * - Embedding-based caching
 * - Token budget management
 * - Tool selection based on intent
 * - Retry logic with quality scoring
 * - Performance metrics
 */
