"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeChunker = void 0;
class CodeChunker {
    /**
     * Split code into logical chunks (functions, classes, blocks)
     * Tries to preserve semantic meaning when possible
     */
    async chunkCode(fileId, filePath, content, language, options = {}) {
        const maxChunkSize = options.maxChunkSize ?? 800; // Lines per chunk
        const overlapLines = options.overlapLines ?? 5;
        const chunks = [];
        const lines = content.split('\n');
        // Language-specific chunking
        if (language === 'python') {
            return this.chunkPython(fileId, filePath, lines, maxChunkSize, overlapLines);
        }
        else if (language === 'javascript' || language === 'typescript' || language === 'jsx' || language === 'tsx') {
            return this.chunkJavaScript(fileId, filePath, lines, maxChunkSize, overlapLines);
        }
        else if (language === 'java') {
            return this.chunkJava(fileId, filePath, lines, maxChunkSize, overlapLines);
        }
        // Fallback: chunk by size
        return this.chunkBySize(fileId, filePath, lines, maxChunkSize, overlapLines);
    }
    chunkPython(fileId, filePath, lines, maxChunkSize, overlapLines) {
        const chunks = [];
        const functionDefs = this.findPatternIndices(lines, /^(async\s+)?def\s+/);
        const classDefs = this.findPatternIndices(lines, /^class\s+/);
        const definitions = [...functionDefs.map((i) => ({ index: i, type: 'function' })), ...classDefs.map((i) => ({ index: i, type: 'class' }))].sort((a, b) => a.index - b.index);
        if (definitions.length === 0) {
            return this.chunkBySize(fileId, filePath, lines, maxChunkSize, overlapLines);
        }
        for (let i = 0; i < definitions.length; i++) {
            const startLine = definitions[i].index;
            const endLine = i + 1 < definitions.length ? definitions[i + 1].index - 1 : lines.length - 1;
            const chunkLines = lines.slice(startLine, endLine + 1);
            if (chunkLines.length > maxChunkSize) {
                chunks.push(...this.chunkBySize(fileId, filePath, chunkLines, maxChunkSize, overlapLines, startLine));
            }
            else {
                chunks.push({
                    id: `${fileId}:${startLine}-${endLine}`,
                    fileId,
                    filePath,
                    content: chunkLines.join('\n'),
                    startLine,
                    endLine,
                    type: definitions[i].type,
                    language: 'python',
                });
            }
        }
        return chunks;
    }
    chunkJavaScript(fileId, filePath, lines, maxChunkSize, overlapLines) {
        const chunks = [];
        const functionDefs = this.findPatternIndices(lines, /^(async\s+)?(function|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=)/);
        const classDefs = this.findPatternIndices(lines, /^class\s+/);
        const exportDefs = this.findPatternIndices(lines, /^export\s+(default\s+)?(function|class|const)/);
        const definitions = [
            ...functionDefs.map((i) => ({ index: i, type: 'function' })),
            ...classDefs.map((i) => ({ index: i, type: 'class' })),
            ...exportDefs.map((i) => ({ index: i, type: 'block' })),
        ]
            .filter((v, i, a) => a.findIndex((i2) => i2.index === v.index) === i)
            .sort((a, b) => a.index - b.index);
        if (definitions.length === 0) {
            return this.chunkBySize(fileId, filePath, lines, maxChunkSize, overlapLines);
        }
        for (let i = 0; i < definitions.length; i++) {
            const startLine = definitions[i].index;
            const endLine = i + 1 < definitions.length ? definitions[i + 1].index - 1 : lines.length - 1;
            const chunkLines = lines.slice(startLine, endLine + 1);
            if (chunkLines.length > maxChunkSize) {
                chunks.push(...this.chunkBySize(fileId, filePath, chunkLines, maxChunkSize, overlapLines, startLine));
            }
            else {
                chunks.push({
                    id: `${fileId}:${startLine}-${endLine}`,
                    fileId,
                    filePath,
                    content: chunkLines.join('\n'),
                    startLine,
                    endLine,
                    type: definitions[i].type,
                    language: 'javascript',
                });
            }
        }
        return chunks;
    }
    chunkJava(fileId, filePath, lines, maxChunkSize, overlapLines) {
        const chunks = [];
        const classDefs = this.findPatternIndices(lines, /^(public\s+|private\s+)?class\s+/);
        const methodDefs = this.findPatternIndices(lines, /^(\s+)?(public|private|protected)?\s+(static\s+)?(void|[A-Za-z]\w*)\s+\w+\s*\(/);
        const definitions = [
            ...classDefs.map((i) => ({ index: i, type: 'class' })),
            ...methodDefs.map((i) => ({ index: i, type: 'function' })),
        ]
            .filter((v, i, a) => a.findIndex((i2) => i2.index === v.index) === i)
            .sort((a, b) => a.index - b.index);
        if (definitions.length === 0) {
            return this.chunkBySize(fileId, filePath, lines, maxChunkSize, overlapLines);
        }
        for (let i = 0; i < definitions.length; i++) {
            const startLine = definitions[i].index;
            const endLine = i + 1 < definitions.length ? definitions[i + 1].index - 1 : lines.length - 1;
            const chunkLines = lines.slice(startLine, endLine + 1);
            if (chunkLines.length > maxChunkSize) {
                chunks.push(...this.chunkBySize(fileId, filePath, chunkLines, maxChunkSize, overlapLines, startLine));
            }
            else {
                chunks.push({
                    id: `${fileId}:${startLine}-${endLine}`,
                    fileId,
                    filePath,
                    content: chunkLines.join('\n'),
                    startLine,
                    endLine,
                    type: definitions[i].type,
                    language: 'java',
                });
            }
        }
        return chunks;
    }
    chunkBySize(fileId, filePath, lines, maxChunkSize, overlapLines, startLineOffset = 0) {
        const chunks = [];
        for (let i = 0; i < lines.length; i += maxChunkSize - overlapLines) {
            const endIdx = Math.min(i + maxChunkSize, lines.length);
            const chunkLines = lines.slice(i, endIdx);
            chunks.push({
                id: `${fileId}:${i + startLineOffset}-${endIdx - 1 + startLineOffset}`,
                fileId,
                filePath,
                content: chunkLines.join('\n'),
                startLine: i + startLineOffset,
                endLine: endIdx - 1 + startLineOffset,
                type: 'block',
                language: 'unknown',
            });
        }
        return chunks;
    }
    findPatternIndices(lines, pattern) {
        const indices = [];
        for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
                indices.push(i);
            }
        }
        return indices;
    }
}
exports.CodeChunker = CodeChunker;
//# sourceMappingURL=chunker.js.map