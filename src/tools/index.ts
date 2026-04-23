export { ReadTool, readFileByVscode, type ReadToolInput, type ReadToolResult } from './read';
export { WriteTool, EditTool, type WriteToolInput, type WriteToolResult, type EditInput, type EditResult } from './write';
export { BashTool, BashSessionManager, type BashToolInput, type BashToolResult, type BashSession } from './bash';
export { GrepTool, type GrepToolInput, type GrepToolResult, type GrepMatch } from './grep';
export { ListTool, type ListToolInput, type ListToolResult, type FileInfo } from './ls';
export { NamiToolExecutor } from './executor';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface ToolResult {
  callId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  category: 'file' | 'search' | 'bash' | 'edit';
}

export const NAMI_TOOLS: ToolSchema[] = [
  {
    name: 'read',
    description: 'Read the complete contents of a file. Use this when you need to understand existing code before making changes.',
    category: 'file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file relative to workspace root' },
        offset: { type: 'number', description: 'Starting line number (0-indexed, optional)' },
        limit: { type: 'number', description: 'Maximum number of lines to read (optional)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write',
    description: 'Create a new file or completely overwrite an existing file with new content.',
    category: 'file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path for the new file' },
        content: { type: 'string', description: 'Complete file content to write' },
        createDirectories: { type: 'boolean', description: 'Create parent directories if they do not exist' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit',
    description: 'Make targeted edits to specific lines in a file. Use for inserting, replacing, or deleting content.',
    category: 'edit',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to edit' },
        operations: {
          type: 'array',
          description: 'Array of edit operations to perform',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['replace', 'insert', 'delete'], description: 'Type of edit operation' },
              startLine: { type: 'number', description: 'Starting line number (0-indexed)' },
              endLine: { type: 'number', description: 'Ending line number for replace/delete (optional)' },
              content: { type: 'string', description: 'Content to insert (for insert/replace operations)' },
            },
            required: ['type', 'startLine'],
          },
        },
      },
      required: ['path', 'operations'],
    },
  },
  {
    name: 'bash',
    description: 'Execute shell commands. Returns stdout, stderr, and exit code. Use for git, npm, build commands, or running scripts.',
    category: 'bash',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        cwd: { type: 'string', description: 'Working directory for the command (optional)' },
        timeoutMs: { type: 'number', description: 'Maximum execution time in milliseconds (default: 180000)' },
        env: { type: 'object', description: 'Additional environment variables (optional)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'grep',
    description: 'Search for text patterns across files. Supports regex and file glob patterns.',
    category: 'search',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query or regex pattern' },
        path: { type: 'string', description: 'Directory to search in (optional, defaults to workspace root)' },
        filePattern: { type: 'string', description: 'File glob pattern to filter results (e.g., "*.ts", "*.js")' },
        caseSensitive: { type: 'boolean', description: 'Case sensitive search (default: false)' },
        regex: { type: 'boolean', description: 'Treat query as regex pattern (default: false)' },
        context: { type: 'number', description: 'Number of context lines around matches' },
        maxResults: { type: 'number', description: 'Maximum number of matches to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'ls',
    description: 'List contents of a directory with file metadata.',
    category: 'file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to list (optional, defaults to current directory)' },
        showHidden: { type: 'boolean', description: 'Show hidden files (optional)' },
        showDetails: { type: 'boolean', description: 'Show file size and modification time (optional)' },
        sortBy: { type: 'string', enum: ['name', 'size', 'modified'], description: 'Sort order' },
      },
      required: [],
    },
  },
];

export function formatToolsForPrompt(): string {
  return NAMI_TOOLS.map((tool) => {
    return `## ${tool.name}\n${tool.description}\n\nInput Schema:\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\``;
  }).join('\n\n');
}

export function formatToolsAsJson(): string {
  return JSON.stringify(NAMI_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  })), null, 2);
}
