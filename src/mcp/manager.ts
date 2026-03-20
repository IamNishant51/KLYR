import type { ContextDocument } from '../context/contextEngine';
import type { Logger } from '../core/config';
import { McpClient, type McpTool } from './client';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  enabled?: boolean;
  timeoutMs?: number;
}

export interface McpContextResult {
  documents: ContextDocument[];
  references: string[];
  warnings: string[];
}

interface ResolvedTool {
  server: McpServerConfig;
  tool: McpTool;
}

export class McpManager {
  constructor(private readonly logger: Logger) {}

  async collectContext(prompt: string, servers: McpServerConfig[]): Promise<McpContextResult> {
    const enabledServers = servers.filter((server) => server.enabled !== false);
    if (enabledServers.length === 0) {
      return { documents: [], references: [], warnings: [] };
    }

    const warnings: string[] = [];
    const references: string[] = [];
    const documents: ContextDocument[] = [];

    for (const server of enabledServers) {
      const client = new McpClient({
        command: server.command,
        args: server.args,
        cwd: server.cwd,
        env: server.env,
        timeoutMs: server.timeoutMs,
      });

      try {
        await client.connect();
        const tools = await client.listTools();
        const selectedTools = this.selectRelevantTools(prompt, server, tools);

        if (selectedTools.length === 0) {
          references.push(`mcp://${server.name} (connected, no relevant tool selected)`);
          continue;
        }

        for (const selected of selectedTools) {
          const callArgs = this.buildToolArguments(prompt, selected.tool.name);
          const result = await client.callTool(selected.tool.name, callArgs);
          if (!result.content.trim()) {
            continue;
          }

          const uri = `mcp://${selected.server.name}/${selected.tool.name}`;
          references.push(uri);
          documents.push({
            id: `mcp-${selected.server.name}-${selected.tool.name}-${Date.now()}`,
            uri,
            title: `MCP ${selected.server.name}.${selected.tool.name}`,
            content: result.content,
            updatedAt: Date.now(),
            source: 'memory',
            tags: ['mcp', selected.server.name, selected.tool.name],
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`MCP server ${server.name} failed: ${message}`);
        this.logger.debug(`MCP server ${server.name} failed: ${message}`);
      } finally {
        client.dispose();
      }
    }

    return { documents, references, warnings };
  }

  private selectRelevantTools(
    prompt: string,
    server: McpServerConfig,
    tools: McpTool[]
  ): ResolvedTool[] {
    const lowerPrompt = prompt.toLowerCase();
    const selected: ResolvedTool[] = [];

    // Prefer explicit mentions first.
    for (const tool of tools) {
      const toolName = tool.name.toLowerCase();
      const explicitServerTool = `${server.name.toLowerCase()}.${toolName}`;
      if (lowerPrompt.includes(explicitServerTool) || lowerPrompt.includes(toolName)) {
        selected.push({ server, tool });
      }
    }

    if (selected.length > 0) {
      return selected.slice(0, 2);
    }

    // Sequential-thinking support.
    const sequentialTool = tools.find((tool) => /sequential|thinking/.test(tool.name.toLowerCase()));
    if (sequentialTool && /(analy|plan|think|reason|step)/.test(lowerPrompt)) {
      selected.push({ server, tool: sequentialTool });
    }

    // Stitch support for UI-focused prompts.
    const stitchTool = tools.find((tool) => /stitch/.test(tool.name.toLowerCase()));
    if (stitchTool && /(ui|ux|design|layout|component|screen|figma)/.test(lowerPrompt)) {
      selected.push({ server, tool: stitchTool });
    }

    return selected.slice(0, 2);
  }

  private buildToolArguments(prompt: string, toolName: string): Record<string, unknown> {
    const lowerToolName = toolName.toLowerCase();

    if (/sequential|thinking/.test(lowerToolName)) {
      return {
        thought: `Analyze user request and produce concise steps: ${prompt}`,
        nextThoughtNeeded: false,
        thoughtNumber: 1,
        totalThoughts: 1,
      };
    }

    if (/stitch/.test(lowerToolName)) {
      return {
        query: prompt,
        prompt,
      };
    }

    return {
      query: prompt,
      prompt,
      input: prompt,
    };
  }
}
