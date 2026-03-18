"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaCoder = void 0;
const systemPrompts_1 = require("./systemPrompts");
class OllamaCoder {
    client;
    model;
    temperature;
    constructor(options) {
        this.client = options.client;
        this.model = options.model;
        this.temperature = options.temperature;
    }
    async generate(input) {
        const response = await this.client.chat({
            model: this.model,
            messages: [
                { role: 'system', content: this.buildEditSystemPrompt() },
                { role: 'user', content: this.buildUserPrompt(input) },
            ],
            temperature: input.deterministic ? 0 : this.temperature,
            stream: false,
        });
        const parsed = this.parseResponse(response.content);
        if (!this.shouldAttemptRepair(parsed, response.content)) {
            return parsed;
        }
        try {
            const repaired = await this.repairDraftPayload(input, response.content);
            if (repaired.changes.length > 0) {
                return repaired;
            }
        }
        catch {
            // Keep original parsed response if repair fails.
        }
        return parsed;
    }
    async answer(input, onChunk) {
        const messages = [
            {
                role: 'system',
                content: systemPrompts_1.CHAT_SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: JSON.stringify({
                    prompt: input.prompt,
                    plan: input.plan,
                    contextFiles: input.context.files.map((file) => ({
                        path: file.path,
                        reason: file.reason,
                        content: this.trimText(file.content, 4000),
                    })),
                    workspace: input.context.workspace,
                    memory: input.context.memory,
                    notes: input.context.notes ?? '',
                }),
            },
        ];
        if (onChunk) {
            let content = '';
            await this.client.chatStream({
                model: this.model,
                messages,
                temperature: input.deterministic ? 0 : this.temperature,
                stream: true,
            }, (chunk) => {
                if (!chunk.content) {
                    return;
                }
                content += chunk.content;
                onChunk(chunk.content);
            });
            return {
                content: content.trim(),
                citations: input.context.files.slice(0, 4).map((file) => file.path),
            };
        }
        const response = await this.client.chat({
            model: this.model,
            messages,
            temperature: input.deterministic ? 0 : this.temperature,
            stream: false,
        });
        return {
            content: response.content.trim(),
            citations: input.context.files.slice(0, 4).map((file) => file.path),
        };
    }
    async completeInline(input) {
        const response = await this.client.chat({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: systemPrompts_1.INLINE_COMPLETION_PROMPT,
                },
                {
                    role: 'user',
                    content: JSON.stringify({
                        filePath: input.filePath,
                        languageId: input.languageId,
                        prefix: this.trimText(input.prefix, 2500),
                        suffix: this.trimText(input.suffix, 1200),
                        workspace: input.context.workspace,
                        contextFiles: input.context.files.map((file) => ({
                            path: file.path,
                            reason: file.reason,
                            content: this.trimText(file.content, 1800),
                        })),
                        memory: input.context.memory,
                    }),
                },
            ],
            temperature: input.deterministic ? 0 : this.temperature,
            stream: false,
        });
        return this.stripCodeFences(response.content).trim();
    }
    buildEditSystemPrompt() {
        return systemPrompts_1.EDIT_SYSTEM_PROMPT;
    }
    buildUserPrompt(input) {
        const instruction = 'CRITICAL: Preserve ALL original content. For update operations, the proposedContent MUST include the full file with your changes merged in. NEVER truncate or remove existing content. If context shows a file has 500 lines, your proposedContent must have 500+ lines.';
        return JSON.stringify({
            instruction,
            prompt: input.prompt,
            plan: input.plan,
            deterministic: input.deterministic,
            validationErrors: input.validationErrors ?? [],
            contextFiles: input.context.files.map((file) => ({
                path: file.path,
                reason: file.reason,
                content: this.trimText(file.content, 8000),
            })),
            workspace: input.context.workspace,
            memory: input.context.memory,
            notes: input.context.notes ?? '',
        });
    }
    parseResponse(raw) {
        try {
            return this.parseJsonDirect(raw);
        }
        catch {
            // Try next strategy.
        }
        try {
            return this.parseJsonFromMarkdown(raw);
        }
        catch {
            // Try next strategy.
        }
        try {
            return this.parseJsonGreedy(raw);
        }
        catch {
            // Final fallback.
        }
        return this.parseFallback(raw);
    }
    parseJsonDirect(raw) {
        return this.toDraft(JSON.parse(raw.trim()));
    }
    parseJsonFromMarkdown(raw) {
        const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const jsonString = (match ? match[1] : raw).trim();
        return this.parseJsonDirect(jsonString);
    }
    parseJsonGreedy(raw) {
        const stripped = this.stripCodeFences(raw).trim();
        const firstBrace = stripped.indexOf('{');
        const lastBrace = stripped.lastIndexOf('}');
        if (firstBrace < 0 || lastBrace <= firstBrace) {
            throw new Error('No JSON object braces found in response');
        }
        const jsonString = stripped.slice(firstBrace, lastBrace + 1);
        return this.parseJsonDirect(jsonString);
    }
    parseFallback(raw) {
        const trimmed = this.stripCodeFences(raw).trim();
        const preview = this.trimText(trimmed, 500);
        if (!trimmed.includes('"changes"') && !trimmed.includes('"summary"')) {
            return {
                changes: [],
                summary: 'Text response',
                rationale: preview || 'Model returned non-JSON response.',
                followUpQuestions: [],
            };
        }
        return {
            changes: [],
            summary: 'Parse error',
            rationale: `Model returned invalid JSON payload. Raw response: ${this.trimText(trimmed, 200)}`,
            followUpQuestions: [],
        };
    }
    toDraft(parsed) {
        const changes = Array.isArray(parsed.changes)
            ? parsed.changes
                .filter((change) => typeof change.path === 'string' && change.path.trim().length > 0)
                .map((change) => ({
                path: change.path,
                summary: change.summary,
                diff: change.diff,
                proposedContent: change.proposedContent,
                originalContent: change.originalContent,
                operation: change.operation,
            }))
            : [];
        return {
            changes,
            summary: typeof parsed.summary === 'string' && parsed.summary.trim()
                ? parsed.summary
                : 'No summary provided.',
            rationale: typeof parsed.rationale === 'string' ? parsed.rationale : 'No rationale provided.',
            followUpQuestions: Array.isArray(parsed.followUpQuestions)
                ? parsed.followUpQuestions.filter((item) => typeof item === 'string')
                : [],
        };
    }
    stripCodeFences(raw) {
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        return fenced ? fenced[1] : raw;
    }
    trimText(value, maxChars) {
        if (value.length <= maxChars) {
            return value;
        }
        return `${value.slice(0, maxChars)}\n...<truncated>`;
    }
    shouldAttemptRepair(parsed, raw) {
        if (!raw.trim()) {
            return false;
        }
        if (parsed.changes.length > 0) {
            return false;
        }
        return /parse error|invalid json|text response/i.test(parsed.summary + ' ' + parsed.rationale);
    }
    async repairDraftPayload(input, raw) {
        const repairResponse = await this.client.chat({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are a JSON repair assistant for a deterministic code-editing agent.',
                        'Your only task is to return valid JSON that matches this exact schema:',
                        '{"summary": string, "rationale": string, "followUpQuestions": string[], "changes": [{"path": string, "summary": string, "diff": string, "proposedContent": string, "originalContent": string, "operation": "create" | "update" | "delete"}]}',
                        'Do not include markdown or prose. Output JSON only.',
                        'Preserve intent from the original prompt and context.',
                    ].join('\n'),
                },
                {
                    role: 'user',
                    content: JSON.stringify({
                        prompt: input.prompt,
                        plan: input.plan,
                        workspace: input.context.workspace,
                        contextFiles: input.context.files.map((file) => ({
                            path: file.path,
                            reason: file.reason,
                            content: this.trimText(file.content, 2400),
                        })),
                        malformedModelOutput: this.trimText(raw, 12000),
                    }),
                },
            ],
            temperature: 0,
            stream: false,
        });
        return this.parseResponse(repairResponse.content);
    }
}
exports.OllamaCoder = OllamaCoder;
//# sourceMappingURL=ollamaCoder.js.map