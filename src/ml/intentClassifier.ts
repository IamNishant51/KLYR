/**
 * Advanced intent classification using embeddings and semantic similarity.
 * Combines regex patterns with ML-based classification for robust intent detection.
 */

import { EmbeddingCache } from './embeddingCache';

export interface ClassifiedIntent {
  intent:
    | 'edit'
    | 'chat'
    | 'inline'
    | 'analyze'
    | 'refactor'
    | 'explain'
    | 'fix'
    | 'generate'
    | 'unknown';
  confidence: number;
  relatedTools: string[];
  metadata: Record<string, unknown>;
}

// Intent templates for semantic matching
const INTENT_TEMPLATES = {
  edit: [
    'change this code',
    'modify the function',
    'update the implementation',
    'fix the bug',
    'add error handling',
    'remove this line',
    'replace string',
  ],
  refactor: [
    'improve code quality',
    'clean up implementation',
    'optimize performance',
    'simplify logic',
    'restructure code',
    'refactor this',
  ],
  generate: [
    'create a function',
    'write a test',
    'generate types',
    'write documentation',
    'create a class',
    'implement feature',
  ],
  analyze: [
    'find issues',
    'check for errors',
    'analyze code',
    'review function',
    'find problems',
    'detect bugs',
  ],
  explain: [
    'explain this code',
    'what does this do',
    'help me understand',
    'explain the logic',
    'describe the flow',
  ],
  fix: [
    'fix the error',
    'fix the bug',
    'resolve the issue',
    'correct the mistake',
    'fix compilation error',
  ],
};

export class AdvancedIntentClassifier {
  private embeddingCache: EmbeddingCache;
  private intentEmbeddings: Map<string, number[]> = new Map();

  constructor(cachePath: string) {
    this.embeddingCache = new EmbeddingCache(cachePath);
  }

  async initialize(): Promise<void> {
    await this.embeddingCache.initialize();
  }

  /**
   * Classify intent using combined approach: regex + semantic similarity
   */
  async classify(userPrompt: string): Promise<ClassifiedIntent> {
    const lowerPrompt = userPrompt.toLowerCase();

    // Fast regex-based checks first (high confidence when matched)
    const regexResult = this.classifyByRegex(lowerPrompt);
    if (regexResult.confidence > 0.9) {
      return regexResult;
    }

    // Fall back to semantic similarity
    try {
      return await this.classifyBySemantic(userPrompt);
    } catch (error) {
      console.error('[Klyr] Semantic classification failed:', error);
      return regexResult; // Fall back to regex result
    }
  }

  /**
   * Regex-based intent classification (fast, deterministic)
   */
  private classifyByRegex(prompt: string): ClassifiedIntent {
    const patterns = {
      edit: /\b(change|modify|update|add|insert|replace|remove|delete|edit|alter)\b/,
      refactor: /\b(refactor|clean|cleanup|improve|optimize|simplify|restructure)\b/,
      generate: /\b(create|write|generate|implement|add)\b.*\b(function|class|test|type|doc)\b/,
      analyze: /\b(analyze|check|review|find|search|detect|look for)\b.*\b(issue|bug|error|problem)\b/,
      explain: /\b(explain|understand|what|how|why|describe)\b/,
      fix: /\b(fix|resolve|correct|repair|patch)\b.*\b(error|bug|issue|problem|mistake)\b/,
    };

    // Check each pattern in order of specificity
    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(prompt)) {
        return {
          intent: intent as any,
          confidence: 0.85,
          relatedTools: this.getToolsForIntent(intent),
          metadata: { method: 'regex' },
        };
      }
    }

    // Default to edit if contains code-related terms
    if (/\b(code|line|function|method|variable|const|let|var|function)\b/.test(prompt)) {
      return {
        intent: 'edit',
        confidence: 0.6,
        relatedTools: ['read_file', 'write_file'],
        metadata: { method: 'regex_fallback' },
      };
    }

    return {
      intent: 'chat',
      confidence: 0.5,
      relatedTools: [],
      metadata: { method: 'regex_default' },
    };
  }

  /**
   * Semantic-based intent classification using embeddings
   */
  private async classifyBySemantic(prompt: string): Promise<ClassifiedIntent> {
    // Get embedding for prompt (with caching)
    const promptEmbedding = await this.embeddingCache.getOrCompute(
      prompt.slice(0, 200), // Use first 200 chars to avoid huge inputs
      async (text) => {
        // Simulate embedding computation (would use real embedding model in production)
        return this.simulateEmbedding(text);
      },
      'user_prompt'
    );

    // Find best matching intent
    let bestMatch: { intent: string; score: number } = {
      intent: 'chat',
      score: 0,
    };

    for (const [intent, templates] of Object.entries(INTENT_TEMPLATES)) {
      // Average similarity to all templates for this intent
      let totalScore = 0;

      for (const template of templates) {
        const templateEmbedding = await this.embeddingCache.getOrCompute(
          template,
          async (text) => this.simulateEmbedding(text),
          `template_${intent}`
        );

        const similarity = this.cosineSimilarity(promptEmbedding, templateEmbedding);
        totalScore += similarity;
      }

      const avgScore = totalScore / templates.length;

      if (avgScore > bestMatch.score) {
        bestMatch = { intent, score: avgScore };
      }
    }

    return {
      intent: bestMatch.intent as any,
      confidence: Math.min(bestMatch.score, 0.95),
      relatedTools: this.getToolsForIntent(bestMatch.intent),
      metadata: { method: 'semantic', score: bestMatch.score },
    };
  }

  /**
   * Simulate embedding computation (in production, would use real embedding model)
   */
  private simulateEmbedding(text: string): number[] {
    // Simple but deterministic embedding simulation using hash
    const hash = this.hashString(text);
    const embedding: number[] = [];

    for (let i = 0; i < 384; i++) {
      const byte = parseInt(hash.substr(i * 2, 2), 16) || 0;
      embedding.push((byte - 128) / 256);
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / (norm || 1));
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
    }

    return Math.max(0, Math.min(1, dotProduct + 0.5)); // Normalize to [0, 1]
  }

  /**
   * Simple string hash for deterministic embedding simulation
   */
  private hashString(str: string): string {
    let hash = '';
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash += char.toString(16);
    }
    return hash.padEnd(768, '0').slice(0, 768);
  }

  /**
   * Get tools for a specific intent
   */
  private getToolsForIntent(intent: string): string[] {
    const toolMap: Record<string, string[]> = {
      edit: ['read_file', 'write_file', 'check_syntax'],
      refactor: ['read_file', 'write_file', 'format_code', 'detect_code_smells'],
      generate: ['read_file', 'write_file', 'generate_types', 'add_documentation'],
      analyze: ['read_file', 'search_code', 'analyze_dependencies', 'detect_code_smells'],
      explain: ['read_file', 'analyze_dependencies'],
      fix: ['read_file', 'write_file', 'check_syntax', 'analyze_dependencies'],
      chat: [],
      inline: ['read_file'],
      unknown: [],
    };

    return toolMap[intent] || [];
  }
}
