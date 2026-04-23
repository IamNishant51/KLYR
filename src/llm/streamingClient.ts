import { Logger } from '../core/config';

export interface StreamOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  onChunk?: (text: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

export class StreamingOllamaClient {
  private baseUrl: string;
  private timeoutMs: number;
  private logger: Logger;

  constructor(baseUrl: string, timeoutMs: number = 60000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.logger = new Logger('info');
  }

  async chat(messages: Message[], options: Omit<StreamOptions, 'onChunk' | 'onComplete' | 'onError'>): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          messages: this.formatMessages(messages),
          stream: false,
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json() as { message?: { content?: string } };
      return data.message?.content || '';
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') throw new Error('Request timed out');
      throw error;
    }
  }

  async *streamChat(messages: Message[], options: StreamOptions): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          messages: this.formatMessages(messages),
          stream: true,
          options: { temperature: options.temperature, num_predict: options.maxTokens },
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
            if (data.message?.content) {
              options.onChunk?.(data.message.content);
              yield data.message.content;
            }
            if (data.done) { options.onComplete?.(); return; }
          } catch { /* skip */ }
        }
      }
      options.onComplete?.();
    } catch (error) {
      clearTimeout(timeout);
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatMessages(messages: Message[]): object[] {
    return messages.map(msg => {
      const formatted: Record<string, unknown> = { role: msg.role, content: this.compressContent(msg.content) };
      if (msg.images?.length) formatted.images = msg.images;
      return formatted;
    });
  }

  private compressContent(content: string): string {
    return content.split('\n').filter(l => l.trim().length > 0).join('\n').slice(0, 8000);
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json() as { models?: { name: string }[] };
      return data.models?.map(m => m.name) || [];
    } catch { return []; }
  }
}

export class FastModelRouter {
  constructor(private fastModel: string, private fullModel: string) {}

  selectModel(task: 'chat' | 'edit' | 'explain' | 'search'): string {
    return ['chat', 'explain'].includes(task) ? this.fastModel : this.fullModel;
  }
}

export class ResponseCache {
  private cache = new Map<string, { response: string; timestamp: number }>();

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() - entry.timestamp > 5 * 60 * 1000) {
      this.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  set(key: string, response: string): void {
    if (this.cache.size > 100) {
      [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp).slice(0, 10).forEach(([k]) => this.cache.delete(k));
    }
    this.cache.set(key, { response, timestamp: Date.now() });
  }

  clear(): void { this.cache.clear(); }
}
