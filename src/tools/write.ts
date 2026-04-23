import * as fs from 'fs/promises';
import * as path from 'path';

export interface WriteToolInput {
  path: string;
  content: string;
  createDirectories?: boolean;
}

export interface WriteToolResult {
  success: boolean;
  path: string;
  bytesWritten?: number;
  error?: string;
}

export class WriteTool {
  constructor(private workspaceRoot: string) {}

  async execute(input: WriteToolInput): Promise<WriteToolResult> {
    try {
      let absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.resolve(this.workspaceRoot, input.path);

      if (!this.isWithinWorkspace(absolutePath)) {
        return {
          success: false,
          path: input.path,
          error: 'Cannot write outside workspace',
        };
      }

      if (input.createDirectories) {
        const dir = path.dirname(absolutePath);
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(absolutePath, input.content, 'utf-8');

      return {
        success: true,
        path: input.path,
        bytesWritten: input.content.length,
      };
    } catch (error) {
      return {
        success: false,
        path: input.path,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private isWithinWorkspace(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const root = path.resolve(this.workspaceRoot);
    return resolved.startsWith(root + path.sep) || resolved === root;
  }
}

export interface EditInput {
  path: string;
  operations: EditOperation[];
}

export interface EditOperation {
  type: 'replace' | 'insert' | 'delete';
  startLine: number;
  endLine?: number;
  content?: string;
}

export interface EditResult {
  success: boolean;
  path: string;
  newContent?: string;
  error?: string;
}

export class EditTool {
  constructor(private workspaceRoot: string) {}

  async execute(input: EditInput): Promise<EditResult> {
    try {
      let absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.resolve(this.workspaceRoot, input.path);

      if (!this.isWithinWorkspace(absolutePath)) {
        return {
          success: false,
          path: input.path,
          error: 'Cannot edit outside workspace',
        };
      }

      let content = await fs.readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');

      for (const op of input.operations) {
        if (op.type === 'delete') {
          const endLine = op.endLine ?? op.startLine;
          lines.splice(op.startLine, endLine - op.startLine + 1);
        } else if (op.type === 'replace') {
          const endLine = op.endLine ?? op.startLine;
          lines.splice(op.startLine, endLine - op.startLine + 1, ...(op.content?.split('\n') ?? []));
        } else if (op.type === 'insert' && op.content !== undefined) {
          lines.splice(op.startLine, 0, ...op.content.split('\n'));
        }
      }

      const newContent = lines.join('\n');
      await fs.writeFile(absolutePath, newContent, 'utf-8');

      return {
        success: true,
        path: input.path,
        newContent,
      };
    } catch (error) {
      return {
        success: false,
        path: input.path,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private isWithinWorkspace(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const root = path.resolve(this.workspaceRoot);
    return resolved.startsWith(root + path.sep) || resolved === root;
  }
}
