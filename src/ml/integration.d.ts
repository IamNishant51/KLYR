/**
 * ML Integration Guide for Klyr Extension
 *
 * This document explains how to integrate the new ML/LangChain features
 * into the existing extension architecture.
 */
import { type WorkflowState } from '../graph/workflow';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
/**
 * Integration example showing how to use ML features in the pipeline
 *
 * Replace in extension.ts pipeline creation:
 */
export declare class MLEnhancedPipeline {
    private llm;
    private classifier;
    private embeddingCache;
    private tokenOptimizer;
    private workflow;
    private config;
    constructor(llm: BaseLanguageModel, cacheDir: string);
    initialize(): Promise<void>;
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
    classifyIntent(prompt: string): Promise<import("./intentClassifier").ClassifiedIntent>;
    optimizeContext(codeSnippets: string[], documentation: string[], config: string[]): {
        optimized: string;
        efficiency: any;
    };
    executeWorkflow(state: Partial<WorkflowState>): Promise<WorkflowState>;
    /**
     * Get cache statistics for monitoring
     */
    getCacheStats(): {
        totalEntries: number;
        diskSize: number;
        labels: Record<string, number>;
    };
    /**
     * Clean up old cache entries
     */
    cleanupCache(): Promise<void>;
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
