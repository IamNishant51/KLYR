/**
 * ML/Optimization configuration for Klyr.
 * Centralized settings for ML features, caching, and optimizations.
 */

export interface MLConfig {
  // Embedding cache settings
  embeddingCache: {
    enabled: boolean;
    directory: string;
    ttlDays: number;
    maxSize: number;
  };

  // Token optimization
  tokenOptimization: {
    enabled: boolean;
    contextWindowSize: number; // Limited for Ollama models
    maxInputTokens: number;
    compressionEnabled: boolean;
  };

  // Intent classification
  intentClassification: {
    method: 'regex' | 'semantic' | 'hybrid'; // hybrid = regex first, then semantic
    confidenceThreshold: number;
    embeddingCacheTTL: number;
  };

  // Workflow execution
  workflow: {
    maxRetries: number;
    validationRequired: boolean;
    parallelSteps: boolean;
    timeout: number; // milliseconds
  };

  // Tool execution
  tools: {
    parallelExecutionEnabled: boolean;
    dependencyResolution: boolean;
    cacheResults: boolean;
    ttl: number; // milliseconds
  };

  // Optimization features
  optimization: {
    smartContextSelection: boolean;
    deduplication: boolean;
    cachingEnabled: boolean;
    compressionEnabled: boolean;
  };

  // Performance thresholds
  performance: {
    slowQueryMs: number;
    enableMetrics: boolean;
    metricsInterval: number; // milliseconds
  };
}

export const DEFAULT_ML_CONFIG: MLConfig = {
  embeddingCache: {
    enabled: true,
    directory: '.klyr/embeddings',
    ttlDays: 7,
    maxSize: 1000,
  },

  tokenOptimization: {
    enabled: true,
    contextWindowSize: 8192, // Conservative for Ollama
    maxInputTokens: 6000, // Leave room for output
    compressionEnabled: true,
  },

  intentClassification: {
    method: 'hybrid',
    confidenceThreshold: 0.6,
    embeddingCacheTTL: 3600000, // 1 hour
  },

  workflow: {
    maxRetries: 2,
    validationRequired: true,
    parallelSteps: true,
    timeout: 60000, // 1 minute
  },

  tools: {
    parallelExecutionEnabled: true,
    dependencyResolution: true,
    cacheResults: true,
    ttl: 300000, // 5 minutes
  },

  optimization: {
    smartContextSelection: true,
    deduplication: true,
    cachingEnabled: true,
    compressionEnabled: true,
  },

  performance: {
    slowQueryMs: 1000,
    enableMetrics: true,
    metricsInterval: 10000,
  },
};

/**
 * Get config value with fallback
 */
export function getMLConfig(overrides?: Partial<MLConfig>): MLConfig {
  return {
    ...DEFAULT_ML_CONFIG,
    ...overrides,
  };
}

/**
 * Validate ML config
 */
export function validateMLConfig(config: MLConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.tokenOptimization.maxInputTokens >= config.tokenOptimization.contextWindowSize) {
    errors.push(
      'maxInputTokens must be less than contextWindowSize'
    );
  }

  if (config.workflow.maxRetries < 0) {
    errors.push('maxRetries must be >= 0');
  }

  if (config.intentClassification.confidenceThreshold < 0 || config.intentClassification.confidenceThreshold > 1) {
    errors.push('confidenceThreshold must be between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
