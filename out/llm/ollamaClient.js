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
    async requestWithRetry(request, stream, onChunk) {
        let attempt = 0;
        let lastError;
        while (attempt <= this.options.maxRetries) {
            try {
                return await this.executeRequest(request, stream, onChunk);
            }
            catch (error) {
                lastError = error;
                attempt += 1;
                if (attempt > this.options.maxRetries) {
                    break;
                }
                await this.delay(this.options.retryBackoffMs);
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
                    onChunk?.({ content, done: chunk.done === true });
                }
            }
            onChunk?.({ content: '', done: true });
            return { content: lastContent, done: true };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async delay(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.HttpOllamaClient = HttpOllamaClient;
//# sourceMappingURL=ollamaClient.js.map