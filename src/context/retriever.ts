import type { ContextDocument, ContextEngine } from './contextEngine';

export interface RetrievalOptions {
  maxResults: number;
  minScore: number;
}

export interface RetrievalResult {
  documents: ContextDocument[];
  totalScore: number;
  avgScore: number;
}

export async function retrieveRelevantContext(
  engine: ContextEngine,
  query: string,
  options: Partial<RetrievalOptions> = {}
): Promise<RetrievalResult> {
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

export function summarizeContext(documents: ContextDocument[]): string {
  const lines: string[] = [];

  lines.push(`Relevant context (${documents.length} item(s)):`); 

  for (const doc of documents) {
    const preview = doc.content.slice(0, 100).replace(/\n/g, ' ');
    lines.push(`- ${doc.uri}: ${preview}...`);
  }

  return lines.join('\n');
}

export function uniqueDocumentsByPath(documents: ContextDocument[]): ContextDocument[] {
  const seen = new Set<string>();
  const output: ContextDocument[] = [];

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
