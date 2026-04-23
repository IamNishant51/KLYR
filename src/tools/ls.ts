import * as fs from 'fs/promises';
import * as path from 'path';

export interface ListToolInput {
  path?: string;
  showHidden?: boolean;
  showDetails?: boolean;
  sortBy?: 'name' | 'size' | 'modified';
}

export interface FileInfo {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  modified?: number;
  permissions?: string;
}

export interface ListToolResult {
  success: boolean;
  path: string;
  items: FileInfo[];
  totalFiles: number;
  totalDirectories: number;
  error?: string;
}

export class ListTool {
  constructor(private workspaceRoot: string) {}

  async execute(input: ListToolInput): Promise<ListToolResult> {
    try {
      const listPath = input.path
        ? path.isAbsolute(input.path)
          ? input.path
          : path.resolve(this.workspaceRoot, input.path)
        : this.workspaceRoot;

      if (!this.isWithinWorkspace(listPath)) {
        return {
          success: false,
          path: input.path ?? '.',
          items: [],
          totalFiles: 0,
          totalDirectories: 0,
          error: 'Path is outside workspace',
        };
      }

      const entries = await fs.readdir(listPath, { withFileTypes: true });
      const items: FileInfo[] = [];

      for (const entry of entries) {
        if (!input.showHidden && entry.name.startsWith('.')) continue;

        const fullPath = path.join(listPath, entry.name);
        const info: FileInfo = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
        };

        if (input.showDetails) {
          try {
            const stat = await fs.stat(fullPath);
            info.size = stat.size;
            info.modified = stat.mtimeMs;
            info.permissions = stat.mode.toString(8).slice(-3);
          } catch {
            // Skip stats for broken symlinks
          }
        }

        items.push(info);
      }

      if (input.sortBy === 'size') {
        items.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
      } else if (input.sortBy === 'modified') {
        items.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
      } else {
        items.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }

      return {
        success: true,
        path: input.path ?? '.',
        items,
        totalFiles: items.filter((i) => i.type === 'file').length,
        totalDirectories: items.filter((i) => i.type === 'directory').length,
      };
    } catch (error) {
      return {
        success: false,
        path: input.path ?? '.',
        items: [],
        totalFiles: 0,
        totalDirectories: 0,
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
