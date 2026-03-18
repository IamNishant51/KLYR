import type {
  ChatMessage,
  DiffChange,
  ExtensionStatus,
  GhostSuggestion,
  UiPhase,
} from '../types';

export interface TextSegment {
  type: 'text';
  content: string;
}

export interface CodeSegment {
  type: 'code';
  language: string;
  content: string;
}

export type MessageSegment = TextSegment | CodeSegment;

export function parseMessageContent(content: string): MessageSegment[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const pattern = /```([\w.+-]*)\n?([\s\S]*?)```/g;
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of normalized.matchAll(pattern)) {
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) {
      const text = normalized.slice(lastIndex, startIndex).trim();
      if (text) {
        segments.push({ type: 'text', content: text });
      }
    }

    segments.push({
      type: 'code',
      language: (match[1] || 'text').trim() || 'text',
      content: (match[2] || '').replace(/\n$/, ''),
    });
    lastIndex = startIndex + match[0].length;
  }

  if (lastIndex < normalized.length) {
    const text = normalized.slice(lastIndex).trim();
    if (text) {
      segments.push({ type: 'text', content: text });
    }
  }

  if (segments.length === 0 && normalized.trim()) {
    return [{ type: 'text', content: normalized.trim() }];
  }

  return segments;
}

export function estimateMessageHeight(message: ChatMessage): number {
  if (!message.content.trim()) {
    return 108;
  }

  const segments = parseMessageContent(message.content);
  const textLines = segments.reduce((total, segment) => {
    return segment.type === 'text' ? total + segment.content.split('\n').length : total;
  }, 0);
  const codeLines = segments.reduce((total, segment) => {
    return segment.type === 'code' ? total + Math.min(segment.content.split('\n').length, 18) : total;
  }, 0);
  const codeBlocks = segments.filter((segment) => segment.type === 'code').length;

  return Math.max(108, 72 + Math.min(textLines, 18) * 18 + codeLines * 8 + codeBlocks * 44);
}

export function deriveUiPhase(
  status: ExtensionStatus | string | undefined,
  statusDetail: string
): UiPhase {
  if (/fail|error|unable|exception/i.test(statusDetail)) {
    return 'error';
  }

  switch (status) {
    case 'planning':
    case 'retrieving':
      return 'thinking';
    case 'thinking':
      return 'generating';
    case 'validating':
      return 'validating';
    case 'review':
      return 'ready';
    case 'executing':
      return 'executing';
    case 'idle':
      return /ready|finished|applied|complete/i.test(statusDetail) ? 'ready' : 'idle';
    default:
      return 'idle';
  }
}

export function isBusyPhase(phase: UiPhase): boolean {
  return phase === 'thinking' || phase === 'generating' || phase === 'validating' || phase === 'executing';
}

export function getLatestAssistantMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      return messages[index];
    }
  }

  return undefined;
}

export function buildGhostSuggestion(
  diffPreview: DiffChange[],
  messages: ChatMessage[]
): GhostSuggestion | null {
  if (diffPreview.length > 0) {
    const primaryChange = diffPreview[0];
    const additionLines = primaryChange.diff
      .split(/\r?\n/)
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1))
      .filter(Boolean)
      .slice(0, 8);

    return {
      title: 'Ghost Suggestion',
      preview: additionLines.join('\n') || primaryChange.summary,
      source: primaryChange.path,
      hint: 'Inline completions stay dim in the editor. Press Tab there to accept, or apply the draft from here.',
      canApplyDraft: true,
    };
  }

  const lastAssistantMessage = getLatestAssistantMessage(messages);
  if (!lastAssistantMessage?.content.trim()) {
    return null;
  }

  const firstCodeBlock = parseMessageContent(lastAssistantMessage.content).find(
    (segment): segment is CodeSegment => segment.type === 'code'
  );
  const previewSource = firstCodeBlock ? firstCodeBlock.content : lastAssistantMessage.content;
  const preview = previewSource.split(/\r?\n/).slice(0, 7).join('\n').trim();

  if (!preview) {
    return null;
  }

  return {
    title: 'Inline Preview',
    preview,
    source: 'Last assistant response',
    hint: 'Ghost text already works in-editor. Use this card to continue refining the suggestion in chat.',
    canApplyDraft: false,
  };
}

export function phaseLabel(phase: UiPhase): string {
  switch (phase) {
    case 'thinking':
      return 'Thinking';
    case 'generating':
      return 'Generating';
    case 'validating':
      return 'Validating';
    case 'ready':
      return 'Ready';
    case 'executing':
      return 'Executing';
    case 'error':
      return 'Error';
    case 'idle':
    default:
      return 'Idle';
  }
}
