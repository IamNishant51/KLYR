"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpOllamaClient = void 0;
class HttpOllamaClient {
    options;
    constructor(options) {
        this.options = options;
    }
    async chat(request) {
        const response = await this.requestWithRetry(request, false);
        return response;
    }
    async chatStream(request, onChunk) {
        await this.requestWithRetry(request, true, onChunk);
    }
    async listModels() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
        try {
            const response = await fetch(`${this.options.baseUrl}/api/tags`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`Failed to list Ollama models: ${response.status}`);
            }
            const payload = await response.json();
            if (typeof payload === 'object' && payload !== null && 'models' in payload) {
                return payload;
            }
            return { models: [] };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async requestWithRetry(request, stream, onChunk) {
        let attempt = 0;
        let lastError;
        while (attempt <= this.options.maxRetries) {
            try {
                return await this.executeRequest(request, stream, onChunk);
            }
            catch (error) {
                lastError = error;
                if (this.isAbortOrTimeoutError(error)) {
                    break;
                }
                attempt += 1;
                if (attempt > this.options.maxRetries) {
                    break;
                }
                await this.delay(this.options.retryBackoffMs ?? 800);
            }
        }
        throw lastError ?? new Error('Ollama request failed.');
    }
    async executeRequest(request, stream, onChunk) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
        try {
            const response = await fetch(`${this.options.baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages,
                    temperature: request.temperature,
                    stream,
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`Ollama request failed with ${response.status}.`);
            }
            if (!stream) {
                const payload = await response.json();
                let content = '';
                if (typeof payload === 'object' && payload !== null && 'message' in payload) {
                    const msg = payload.message;
                    if (typeof msg === 'object' && msg !== null && 'content' in msg) {
                        content = String(msg.content);
                    }
                }
                return {
                    content,
                    done: true,
                };
            }
            if (!response.body) {
                throw new Error('Ollama streaming response has no body.');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let lastContent = '';
            let chunkBuffer = '';
            let lastFlush = Date.now();
            let hasCompleted = false;
            const CHUNK_BUFFER_SIZE = 10;
            const FLUSH_INTERVAL_MS = 16;
            const flushBuffer = (done = false) => {
                if (done && hasCompleted) {
                    return;
                }
                if (chunkBuffer.length > 0 || done) {
                    const payload = chunkBuffer;
                    if (payload.length > 0 || done) {
                        onChunk?.({ content: payload, done });
                    }
                    if (done) {
                        hasCompleted = true;
                    }
                    chunkBuffer = '';
                    lastFlush = Date.now();
                }
            };
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        continue;
                    }
                    const chunk = JSON.parse(trimmed);
                    const content = chunk.message?.content ?? '';
                    lastContent += content;
                    chunkBuffer += content;
                    if (chunk.done === true ||
                        chunkBuffer.length >= CHUNK_BUFFER_SIZE ||
                        Date.now() - lastFlush >= FLUSH_INTERVAL_MS) {
                        flushBuffer(chunk.done === true);
                    }
                }
            }
            flushBuffer(true);
            return { content: lastContent, done: true };
        }
        catch (error) {
            if (this.isAbortOrTimeoutError(error)) {
                const seconds = Math.max(1, Math.round(this.options.timeoutMs / 1000));
                throw new Error(`Model response timed out after ${seconds}s. Increase klyr.ollama.timeoutMs or use a smaller/faster model.`);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    isAbortOrTimeoutError(error) {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const candidate = error;
        const name = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : '';
        const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
        return (name.includes('abort') ||
            message.includes('aborted') ||
            message.includes('timeout') ||
            message.includes('timed out'));
    }
    async delay(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.HttpOllamaClient = HttpOllamaClient;
//# sourceMappingURL=ollamaClient.js.map