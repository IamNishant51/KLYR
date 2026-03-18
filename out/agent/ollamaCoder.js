"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaCoder = void 0;
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
        return this.parseResponse(response.content);
    }
    async answer(input, onChunk) {
        const messages = [
            {
                role: 'system',
                content: [
                    'You are Klyr, a deterministic local codebase assistant.',
                    'Answer only from the provided workspace context and memory.',
                    'If the context is insufficient, say exactly what is missing instead of guessing.',
                    'Prefer concise, actionable answers.',
                    'Cite referenced files inline using plain file paths.',
                ].join('\n'),
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
                    content: [
                        'You are a deterministic inline coding assistant.',
                        'Return raw insertion text only.',
                        'Do not wrap the answer in markdown, backticks, JSON, or explanation.',
                        'Use only symbols visible in the provided code or available from declared dependencies.',
                        'If unsure, return an empty string.',
                    ].join('\n'),
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
        return [
            'You are Klyr, a deterministic code editing agent.',
            'You must respond with JSON only, no prose, no markdown.',
            'The JSON shape must be: {"summary": string, "rationale": string, "followUpQuestions": string[], "changes": [{"path": string, "summary": string, "diff": string, "proposedContent": string, "operation": "create" | "update" | "delete"}]}',
            'Only include files that were provided in context unless explicitly asked to create new ones.',
            'Every proposed change must include the full file content in proposedContent.',
            'If unsure or missing context, return an empty changes array and explain why in rationale.',
            'Do not invent libraries, imports, or APIs that are not already present in the provided dependencies or files.',
        ].join('\n');
    }
    buildUserPrompt(input) {
        return JSON.stringify({
            prompt: input.prompt,
            plan: input.plan,
            deterministic: input.deterministic,
            validationErrors: input.validationErrors ?? [],
            contextFiles: input.context.files.map((file) => ({
                path: file.path,
                reason: file.reason,
                content: this.trimText(file.content, 4000),
            })),
            workspace: input.context.workspace,
            memory: input.context.memory,
            notes: input.context.notes ?? '',
        });
    }
    parseResponse(raw) {
        const trimmed = this.extractJson(raw);
        try {
            const parsed = JSON.parse(trimmed);
            const changes = Array.isArray(parsed.changes)
                ? parsed.changes.map((change) => ({
                    path: change.path,
                    summary: change.summary,
                    diff: change.diff,
                    proposedContent: change.proposedContent,
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
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown parse error.';
            return {
                changes: [],
                summary: 'Model returned an invalid edit payload.',
                rationale: `Invalid JSON from model: ${message}`,
                followUpQuestions: [],
            };
        }
    }
    extractJson(raw) {
        const withoutFences = this.stripCodeFences(raw).trim();
        const firstBrace = withoutFences.indexOf('{');
        const lastBrace = withoutFences.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return withoutFences.slice(firstBrace, lastBrace + 1);
        }
        return withoutFences;
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
}
exports.OllamaCoder = OllamaCoder;
//# sourceMappingURL=ollamaCoder.js.map