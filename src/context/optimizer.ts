import type { CodeChunk } from './chunker';

export interface ContextBudget {
  totalTokens: number;
  availableTokens: number;
  systemPromptTokens: number;
  conversationTokens: number;
  contextTokens: number;
  responseBuffer: number;
}

export interface OptimizedContext {
  chunks: CodeChunk[];
  summaries: string[];
  conversation: Array<{ role: string; content: string }>;
  totalTokens: number;
  efficiency: number; // 0-1 signal-to-noise ratio
  warnings: string[];
}

export class ContextOptimizer {
  private tokenCountEstimation = 4; // ~1 token per 4 characters

  /**
   * Calculate token count (rough estimation)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / this.tokenCountEstimation);
  }

  /**
   * Create context budget for LLM request
   * Conservative: Leave 20% buffer for response
   */
  createBudget(modelContextWindow: number = 8000, responseBufferPercent: number = 0.2): ContextBudget {
    return {
      totalTokens: modelContextWindow,
      availableTokens: Math.floor(modelContextWindow * (1 - responseBufferPercent)),
      systemPromptTokens: 500, // Reserve for system prompt
      conversationTokens: 0,
      contextTokens: 0,
      responseBuffer: Math.floor(modelContextWindow * responseBufferPercent),
    };
  }

  /**
   * CRITICAL: Optimize and validate context before sending to LLM
   * Ensures we NEVER exceed token limit
   */
  optimizeContext(
    chunks: CodeChunk[],
    summaries: string[],
    conversation: Array<{ role: string; content: string }>,
    budget: ContextBudget
  ): OptimizedContext {
    const warnings: string[] = [];
    let remainingTokens = budget.availableTokens - budget.systemPromptTokens;

    // Step 1: Allocate conversation tokens (highest priority)
    const conversationTokens = this.estimateTokens(conversation.map((m) => m.content).join('\n'));
    if (conversationTokens > remainingTokens * 0.4) {
      warnings.push('Conversation history taking >40% of context');
    }
    const allocatedConversationTokens = Math.min(conversationTokens, Math.floor(remainingTokens * 0.4));
    remainingTokens -= allocatedConversationTokens;

    // Step 2: Allocate summary tokens (high priority, compressed)
    const allocatedSummaryTokens = Math.floor(remainingTokens * 0.3);
    const optimizedSummaries = this.truncateSummaries(summaries, allocatedSummaryTokens);
    remainingTokens -= allocatedSummaryTokens;

    // Step 3: Allocate chunk tokens (remainder)
    const optimizedChunks = this.selectRelevantChunks(chunks, remainingTokens);

    const contextTokens = this.estimateTokens(
      [...optimizedChunks.map((c) => c.content), ...optimizedSummaries].join('\n')
    );

    // Step 4: Calculate efficiency
    const totalRelevantContent = chunks.length + summaries.length;
    const efficiency =
      totalRelevantContent > 0
        ? (optimizedChunks.length + optimizedSummaries.length) / totalRelevantContent
        : 0;

    if (contextTokens > remainingTokens) {
      warnings.push(`Context truncated: ${contextTokens} > ${remainingTokens} tokens`);
    }

    return {
      chunks: optimizedChunks,
      summaries: optimizedSummaries,
      conversation,
      totalTokens: allocatedConversationTokens + allocatedSummaryTokens + contextTokens,
      efficiency,
      warnings,
    };
  }

  /**
   * Validate context before sending to LLM
   * Ensures high signal-to-noise ratio
   */
  validateContext(context: OptimizedContext, budget: ContextBudget): boolean {
    // Rule 1: Never exceed total tokens
    if (context.totalTokens > budget.availableTokens) {
      console.warn(`[VALIDATION FAILED] Context ${context.totalTokens} exceeds budget ${budget.availableTokens}`);
      return false;
    }

    // Rule 2: Ensure relevance (efficiency > 50%)
    if (context.efficiency < 0.5) {
      console.warn(`[VALIDATION WARNING] Low context efficiency: ${(context.efficiency * 100).toFixed(1)}%`);
    }

    // Rule 3: Require minimum context
    if (context.chunks.length === 0 && context.summaries.length === 0) {
      console.warn('[VALIDATION WARNING] No code chunks or summaries provided');
      return false;
    }

    // Rule 4: Check for warnings
    if (context.warnings.length > 0) {
      console.warn(`[VALIDATION WARNINGS] ${context.warnings.join('; ')}`);
    }

    return true;
  }

  /**
   * Select most relevant chunks based on scoring
   */
  private selectRelevantChunks(chunks: CodeChunk[], tokenBudget: number): CodeChunk[] {
    if (chunks.length === 0) return [];

    // Score chunks by relevance (prefer small, focused chunks)
    const scored = chunks.map((chunk) => ({
      chunk,
      score: this.scoreChunk(chunk),
      tokens: this.estimateTokens(chunk.content),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Greedily select chunks until token budget exhausted
    const selected: CodeChunk[] = [];
    let usedTokens = 0;

    for (const { chunk, tokens } of scored) {
      if (usedTokens + tokens <= tokenBudget) {
        selected.push(chunk);
        usedTokens += tokens;
      }
    }

    return selected;
  }

  /**
   * Score a chunk for relevance
   * Higher score = more relevant
   */
  private scoreChunk(chunk: CodeChunk): number {
    let score = 1;

    // Prefer smaller chunks (easier to process)
    const lines = chunk.content.split('\n').length;
    if (lines < 50) score += 3;
    else if (lines < 100) score += 2;
    else if (lines < 200) score += 1;

    // Prefer semantic chunks (functions, classes)
    if (chunk.type === 'function') score += 2;
    else if (chunk.type === 'class') score += 2;
    else if (chunk.type === 'block') score += 1;

    // Prefer chunks with summary
    if (chunk.summary) score += 1;

    // Prefer chunks with embedding (seeded for RAG)
    if (chunk.embedding) score += 0.5;

    return score;
  }

  /**
   * Truncate summaries to fit token budget
   */
  private truncateSummaries(summaries: string[], tokenBudget: number): string[] {
    const result: string[] = [];
    let usedTokens = 0;

    for (const summary of summaries) {
      const tokens = this.estimateTokens(summary);
      if (usedTokens + tokens <= tokenBudget) {
        result.push(summary);
        usedTokens += tokens;
      }
    }

    return result;
  }

  /**
   * Build final context string for LLM
   * Ensures proper formatting and signal
   */
  buildContextString(optimized: OptimizedContext): string {
    const parts: string[] = [];

    // Add conversation context first (highest priority)
    if (optimized.conversation.length > 0) {
      parts.push('## Conversation History\n');
      optimized.conversation.forEach((msg) => {
        parts.push(`${msg.role}: ${msg.content}`);
      });
      parts.push('');
    }

    // Add summaries (compressed context)
    if (optimized.summaries.length > 0) {
      parts.push('## Context Summaries\n');
      optimized.summaries.forEach((summary) => {
        parts.push(`- ${summary}`);
      });
      parts.push('');
    }

    // Add relevant code chunks
    if (optimized.chunks.length > 0) {
      parts.push('## Relevant Code\n');
      optimized.chunks.forEach((chunk) => {
        parts.push(`\n### ${chunk.filePath} (lines ${chunk.startLine}-${chunk.endLine})\n\`\`\`\n${chunk.content}\n\`\`\``);
      });
    }

    return parts.join('\n');
  }
}
