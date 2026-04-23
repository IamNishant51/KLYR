import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ReadToolInput {
  path: string;
  offset?: number;
  limit?: number;
}

export interface ReadToolResult {
  success: boolean;
  content: string;
  path: string;
  lineCount?: number;
  error?: string;
}

export class ReadTool {
  constructor(private workspaceRoot: string) {}

  async execute(input: ReadToolInput): Promise<ReadToolResult> {
    try {
      const absolutePath = path.isAbsolute(input.path)
        ? input.path
        : path.resolve(this.workspaceRoot, input.path);

      if (!this.isWithinWorkspace(absolutePath)) {
        return {
          success: false,
          content: '',
          path: input.path,
          error: 'File is outside workspace',
        };
      }

      const stat = await fs.stat(absolutePath);
      if (stat.isDirectory()) {
        return {
          success: false,
          content: '',
          path: input.path,
          error: 'Path is a directory, not a file',
        };
      }

      let content = await fs.readFile(absolutePath, 'utf-8');

      if (input.offset !== undefined || input.limit !== undefined) {
        const lines = content.split('\n');
        const offset = input.offset ?? 0;
        const limit = input.limit ?? lines.length;
        content = lines.slice(offset, offset + limit).join('\n');
      }

      return {
        success: true,
        content,
        path: input.path,
        lineCount: content.split('\n').length,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
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

export async function readFileByVscode(
  uri: vscode.Uri,
  offset?: number,
  limit?: number
): Promise<string> {
  const document = await vscode.workspace.openTextDocument(uri);
  const fullText = document.getText();
  
  if (offset === undefined && limit === undefined) {
    return fullText;
  }

  const lines = fullText.split('\n');
  const startLine = offset ?? 0;
  const endLine = limit !== undefined ? startLine + limit : lines.length;

  return lines.slice(startLine, endLine).join('\n');
}
