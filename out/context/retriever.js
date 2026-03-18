"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveRelevantContext = retrieveRelevantContext;
exports.summarizeContext = summarizeContext;
exports.uniqueDocumentsByPath = uniqueDocumentsByPath;
async function retrieveRelevantContext(engine, query, options = {}) {
    const maxResults = options.maxResults ?? 8;
    const minScore = options.minScore ?? 0;
    const matches = await engine.query({
        query,
        maxResults,
    });
    const filtered = matches.filter((match) => match.score >= minScore);
    const documents = filtered.map((match) => match.document);
    const totalScore = filtered.reduce((sum, match) => sum + match.score, 0);
    const avgScore = documents.length > 0 ? totalScore / documents.length : 0;
    return {
        documents,
        totalScore,
        avgScore,
    };
}
function summarizeContext(documents) {
    const lines = [];
    lines.push(`Relevant context (${documents.length} item(s)):`);
    for (const doc of documents) {
        const preview = doc.content.slice(0, 100).replace(/\n/g, ' ');
        lines.push(`- ${doc.uri}: ${preview}...`);
    }
    return lines.join('\n');
}
function uniqueDocumentsByPath(documents) {
    const seen = new Set();
    const output = [];
    for (const document of documents) {
        const key = document.uri.replace(/\\/g, '/');
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        output.push(document);
    }
    return output;
}
//# sourceMappingURL=retriever.js.map