export interface TokenBudget {
  maxTokens: number;
  systemPrompt: number;
  history: number;
  context: number;
  reserved: number;
}

export function calculateTokenBudget(
  maxTokens: number,
  options: {
    hasSystemPrompt?: boolean;
    historyMessages?: number;
    priorityContext?: number;
  } = {}
): TokenBudget {
  const reserved = 200;
  let available = maxTokens - reserved;

  const systemPrompt = options.hasSystemPrompt !== false ? 300 : 0;
  available -= systemPrompt;

  const history = Math.min(options.historyMessages ?? 100, 500);
  available -= history;

  const context = Math.max(available - (options.priorityContext ?? 0), 0);

  return {
    maxTokens,
    systemPrompt,
    history,
    context,
    reserved,
  };
}

export function truncateText(text: string, maxTokens: number): string {
  const avgCharsPerToken = 4;
  const maxChars = maxTokens * avgCharsPerToken;
  
  if (text.length <= maxChars) return text;
  
  return text.slice(0, maxChars - 50) + '... [truncated]';
}

export function compressContext(docs: ContextDoc[]): ContextDoc[] {
  return docs.map(doc => ({
    ...doc,
    content: compressText(doc.content),
  }));
}

function compressText(text: string): string {
  const lines = text.split('\n');
  const compressed = lines
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
  
  return compressed.length < text.length ? compressed : text;
}

export interface ContextDoc {
  id: string;
  uri: string;
  content: string;
  source?: string;
  relevanceScore?: number;
}

export function prioritizeDocuments(
  docs: ContextDoc[],
  maxCount: number,
  query?: string
): ContextDoc[] {
  if (docs.length <= maxCount) return docs;

  const scored = docs.map(doc => ({
    doc,
    score: calculateRelevance(doc, query),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxCount).map(s => s.doc);
}

function calculateRelevance(doc: ContextDoc, query?: string): number {
  let score = doc.relevanceScore ?? 0.5;
  
  if (query) {
    const queryLower = query.toLowerCase();
    const contentLower = doc.content.toLowerCase();
    
    const matches = queryLower
      .split(' ')
      .filter(t => t.length > 2)
      .filter(t => contentLower.includes(t))
      .length;
    
    score += matches * 0.1;
  }

  if (doc.source === 'active' || doc.source === 'selection') {
    score += 0.3;
  }

  if (doc.source === 'open') {
    score += 0.1;
  }

  return Math.min(score, 1);
}

export function summarizeForContext(
  text: string,
  maxLines: number = 30
): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;

  const sampleSize = Math.floor(maxLines / 2);
  const start = lines.slice(0, sampleSize);
  const end = lines.slice(-sampleSize);

  return [
    '... [truncated for context] ...',
    '',
    '--- START (first ' + sampleSize + ' lines) ---',
    ...start,
    '',
    '--- END (last ' + sampleSize + ' lines) ---',
  ].join('\n');
}
