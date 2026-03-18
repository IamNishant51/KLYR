/**
 * ML/Optimization configuration for Klyr.
 * Centralized settings for ML features, caching, and optimizations.
 */
export interface MLConfig {
    embeddingCache: {
        enabled: boolean;
        directory: string;
        ttlDays: number;
        maxSize: number;
    };
    tokenOptimization: {
        enabled: boolean;
        contextWindowSize: number;
        maxInputTokens: number;
        compressionEnabled: boolean;
    };
    intentClassification: {
        method: 'regex' | 'semantic' | 'hybrid';
        confidenceThreshold: number;
        embeddingCacheTTL: number;
    };
    workflow: {
        maxRetries: number;
        validationRequired: boolean;
        parallelSteps: boolean;
        timeout: number;
    };
    tools: {
        parallelExecutionEnabled: boolean;
        dependencyResolution: boolean;
        cacheResults: boolean;
        ttl: number;
    };
    optimization: {
        smartContextSelection: boolean;
        deduplication: boolean;
        cachingEnabled: boolean;
        compressionEnabled: boolean;
    };
    performance: {
        slowQueryMs: number;
        enableMetrics: boolean;
        metricsInterval: number;
    };
}
export declare const DEFAULT_ML_CONFIG: MLConfig;
/**
 * Get config value with fallback
 */
export declare function getMLConfig(overrides?: Partial<MLConfig>): MLConfig;
/**
 * Validate ML config
 */
export declare function validateMLConfig(config: MLConfig): {
    valid: boolean;
    errors: string[];
};
