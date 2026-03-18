/**
 * Tool definitions for LangChain integration.
 * Defines all available tools with JSON schemas for LLM-based tool selection.
 */

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
  category: 'file' | 'search' | 'analysis' | 'refactor';
}

export const KLYR_TOOLS: ToolSchema[] = [
  {
    name: 'read_file',
    description: 'Read the full content of a file in the workspace',
    category: 'file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file in the workspace',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or update content to a file in the workspace',
    category: 'file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path where the file should be written',
        },
        content: {
          type: 'string',
          description: 'The complete new content for the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List contents of a directory in the workspace',
    category: 'file',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative directory path to list',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for code patterns or text across workspace files',
    category: 'search',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query or regex pattern',
        },
        filePattern: {
          type: 'string',
          description: 'File glob pattern to limit search scope (optional)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyze_dependencies',
    description: 'Analyze and understand dependencies of a file or module',
    category: 'analysis',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to analyze',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'check_syntax',
    description: 'Check syntax and validate a file for errors',
    category: 'analysis',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to validate',
        },
        language: {
          type: 'string',
          description: 'Programming language (optional, auto-detected)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'format_code',
    description: 'Format and beautify code in a file',
    category: 'refactor',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to format',
        },
        language: {
          type: 'string',
          description: 'Programming language (optional)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'generate_types',
    description: 'Generate TypeScript type definitions for a file or module',
    category: 'refactor',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to generate types for',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'add_documentation',
    description: 'Add or update documentation/comments for code',
    category: 'refactor',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to document',
        },
        style: {
          type: 'string',
          enum: ['jsdoc', 'tsdoc', 'xmldoc', 'numpydoc'],
          description: 'Documentation style to use',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'detect_code_smells',
    description: 'Detect potential code quality issues and anti-patterns',
    category: 'analysis',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to analyze',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'suggest_tests',
    description: 'Suggest test cases for a function or module',
    category: 'analysis',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to suggest tests for',
        },
        framework: {
          type: 'string',
          description: 'Testing framework (jest, mocha, pytest, etc.)',
        },
      },
      required: ['path'],
    },
  },
];

/**
 * Get tools suitable for a specific intent
 */
export function getToolsForIntent(intent: string): ToolSchema[] {
  const lowerIntent = intent.toLowerCase();

  if (
    lowerIntent.includes('search') ||
    lowerIntent.includes('find') ||
    lowerIntent.includes('grep')
  ) {
    return KLYR_TOOLS.filter((t) => t.category === 'search' || t.category === 'analysis');
  }

  if (
    lowerIntent.includes('format') ||
    lowerIntent.includes('prettier') ||
    lowerIntent.includes('lint')
  ) {
    return [KLYR_TOOLS.find((t) => t.name === 'format_code')!];
  }

  if (
    lowerIntent.includes('test') ||
    lowerIntent.includes('unit') ||
    lowerIntent.includes('spec')
  ) {
    return [KLYR_TOOLS.find((t) => t.name === 'suggest_tests')!];
  }

  if (
    lowerIntent.includes('type') ||
    lowerIntent.includes('typescript') ||
    lowerIntent.includes('types')
  ) {
    return [KLYR_TOOLS.find((t) => t.name === 'generate_types')!];
  }

  if (
    lowerIntent.includes('doc') ||
    lowerIntent.includes('comment') ||
    lowerIntent.includes('jsdoc')
  ) {
    return [KLYR_TOOLS.find((t) => t.name === 'add_documentation')!];
  }

  // Default: return all tools
  return KLYR_TOOLS;
}

/**
 * Format tools for LLM context
 */
export function formatToolsForContext(tools: ToolSchema[]): string {
  return tools
    .map(
      (tool) =>
        `Tool: ${tool.name}\nDescription: ${tool.description}\nInput Schema:\n${JSON.stringify(tool.inputSchema, null, 2)}`
    )
    .join('\n\n');
}
