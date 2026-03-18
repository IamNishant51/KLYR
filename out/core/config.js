"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.defaultConfig = defaultConfig;
function defaultConfig() {
    return {
        logLevel: 'info',
        ollama: {
            baseUrl: 'http://localhost:11434',
            model: 'qwen2.5-coder',
            temperature: 0,
            timeoutMs: 180000,
            maxRetries: 2,
            retryBackoffMs: 800,
        },
        context: {
            maxFiles: 120,
            maxFileSize: 200 * 1024,
            maxTotalSize: 500 * 1024,
            retrievalMaxResults: 8,
            retrievalMinScore: 0,
        },
        execution: {
            maxAttempts: 2,
            noOp: false,
        },
        inline: {
            enabled: true,
            maxPrefixChars: 2500,
            maxSuffixChars: 1200,
        },
    };
}
class Logger {
    level;
    constructor(level = 'info') {
        this.level = level;
    }
    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }
    info(message, ...args) {
        if (this.shouldLog('info')) {
            console.log(`[INFO] ${message}`, ...args);
        }
    }
    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }
    error(message, ...args) {
        if (this.shouldLog('error')) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentIndex = levels.indexOf(this.level);
        const logIndex = levels.indexOf(level);
        return logIndex >= currentIndex;
    }
}
exports.Logger = Logger;
//# sourceMappingURL=config.js.map