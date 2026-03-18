/**
 * Token optimization and smart context management.
 * Intelligently selects and truncates context to stay within token limits.
 */

export interface TokenBudget {
  maxTokens: number;
  reserved: number; // Reserved for output
  available: number; // Available for input
}

export interface ContextSegment {
  content: string;
  priority: number; // 0-100, higher = more important
  type: 'code' | 'doc' | 'test' | 'config' | 'summary';
  metadata: Record<string, unknown>;
}

export class TokenOptimizer {
  private encoding: any; // Tiktoken encoding

  constructor(modelName: string = 'gpt-3.5-turbo') {
    // Simplified: We'll use the fallback since js-tiktoken has ESM issues
    // In production, you could use a dynamic import or alternative library
    this.encoding = null;
    console.log('[Klyr] Using fallback token counting (no tiktoken dependency)');
  }

  /**
   * Estimate token count for text
   */
  countTokens(text: string): number {
    if (!this.encoding) {
      // Rough fallback: ~1 token per 4 characters
      return Math.ceil(text.length / 4);
    }

    try {
      return this.encoding.encode(text).length;
    } catch (error) {
      console.warn('[Klyr] Token counting failed, using fallback');
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Truncate text to maximum tokens while preserving importance
   */
  truncate(text: string, maxTokens: number): string {
    const tokens = this.countTokens(text);
    if (tokens <= maxTokens) return text;

    console.log(`[Klyr] Truncating ${tokens} tokens to ${maxTokens}`);

    // Simple truncation from end
    const ratio = maxTokens / tokens;
    const truncated = text.slice(0, Math.floor(text.length * ratio));

    return truncated + '\n... (truncated)';
  }

  /**
   * Optimize context segments by selecting and truncating based on priorities
   */
  optimizeContext(
    segments: ContextSegment[],
    budget: TokenBudget,
    systemPromptTokens: number
  ): { selected: ContextSegment[]; truncated: boolean } {
    const available = budget.available - systemPromptTokens;
    let selected: ContextSegment[] = [];
    let usedTokens = 0;

    // Sort by priority descending
    const sorted = [...segments].sort((a, b) => b.priority - a.priority);

    for (const segment of sorted) {
      const segmentTokens = this.countTokens(segment.content);

      if (usedTokens + segmentTokens <= available) {
        // Fits completely
        selected.push(segment);
        usedTokens += segmentTokens;
      } else if (usedTokens < available * 0.9) {
        // Partially include with truncation
        const remaining = available - usedTokens;
        const truncated = this.truncate(segment.content, remaining - 100); // Reserve 100 tokens for safety
        selected.push({
          ...segment,
          content: truncated,
        });
        usedTokens += this.countTokens(truncated);
        return { selected, truncated: true };
      } else {
        // Can't fit any more
        return { selected, truncated: true };
      }
    }

    return { selected, truncated: false };
  }

  /**
   * Calculate context budget based on model limits
   */
  calculateBudget(contextWindowSize: number): TokenBudget {
    const maxTokens = contextWindowSize;
    const reserved = Math.floor(maxTokens * 0.25); // Reserve 25% for output

    return {
      maxTokens,
      reserved,
      available: maxTokens - reserved,
    };
  }

  /**
   * Compress code by removing comments and unnecessary whitespace
   */
  compressCode(code: string): string {
    return code
      .split('\n')
      .map((line) => {
        // Remove single-line comments
        const withoutComment = line.replace(/\/\/.*$/, '');
        // Remove trailing whitespace
        return withoutComment.trimEnd();
      })
      .filter((line) => line.trim().length > 0) // Remove empty lines
      .join('\n');
  }

  /**
   * Create summary of code for context inclusion
   */
  summarizeCode(code: string, maxLines: number = 10): string {
    const lines = code.split('\n');
    if (lines.length <= maxLines) return code;

    // Keep first and last portions
    const keep = Math.floor(maxLines / 2);
    const first = lines.slice(0, keep).join('\n');
    const last = lines.slice(-keep).join('\n');

    return `${first}\n\n... (${lines.length - maxLines} lines omitted) ...\n\n${last}`;
  }

  /**
   * Estimate context efficiency
   */
  getEfficiency(totalContextTokens: number, budget: TokenBudget): {
    percentageUsed: number;
    tokensRemaining: number;
    efficiency: string;
  } {
    const percentageUsed = (totalContextTokens / budget.available) * 100;

    return {
      percentageUsed: Math.round(percentageUsed),
      tokensRemaining: Math.max(0, budget.available - totalContextTokens),
      efficiency:
        percentageUsed > 90
          ? 'critical'
          : percentageUsed > 75
            ? 'high'
            : percentageUsed > 50
              ? 'moderate'
              : 'low',
    };
  }
}
