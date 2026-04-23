import type {
  Coder,
  CoderAnswer,
  CoderResponse,
  CoderInput,
  CodeDraft,
  DraftFileChange,
  InlineCompletionInput,
  CommandStep,
} from './coder';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { OllamaClient } from '../llm/ollamaClient';
import {
  CHAT_SYSTEM_PROMPT,
  EDIT_SYSTEM_PROMPT,
  INLINE_COMPLETION_PROMPT,
} from './systemPrompts';

export interface OllamaCoderOptions {
  client: OllamaClient;
  model: string;
  temperature: number;
}

interface OllamaDraftPayload {
  summary: string;
  rationale: string;
  followUpQuestions?: string[];
  changes: Array<{
    path: string;
    summary: string;
    diff: string;
    proposedContent?: string;
    newContent?: string;
    additions?: string;
    location?: string;
    originalContent?: string;
    operation?: 'create' | 'update' | 'delete';
  }>;
  commands?: Array<{
    command: string;
    cwd?: string;
    timeout?: number;
    allowFailure?: boolean;
    description?: string;
  }>;
}

export class OllamaCoder implements Coder {
  private readonly client: OllamaClient;
  private readonly model: string;
  private readonly temperature: number;
  private lastContextFile: string = 'unknown';

  constructor(options: OllamaCoderOptions) {
    this.client = options.client;
    this.model = options.model;
    this.temperature = options.temperature;
  }

  async generate(input: CoderInput): Promise<CoderResponse> {
    // Store the most relevant file path for fallback and repair.
    this.lastContextFile = this.resolvePrimaryContextFile(input);
    
    const response = await this.client.chat({
      model: this.model,
      messages: [
        { role: 'system', content: this.buildEditSystemPrompt() },
        { role: 'user', content: this.buildUserPrompt(input) },
      ],
      temperature: input.deterministic ? 0 : this.temperature,
      stream: false,
    });

    const parsed = this.parseResponse(response.content);
    
    if (parsed.type === 'tool_use') {
      return parsed;
    }

    if (parsed.type !== 'draft') {
      return parsed;
    }

    const draft = parsed.draft;
    // ALWAYS validate and correct common mistakes in file content
    const validated = await this.normalizeDraftOperationsForWorkspace(
      this.validateAndCorrectDraft(draft, input.prompt),
      input.context.workspace.root
    );
    
    if (!this.shouldAttemptRepair(validated, response.content)) {
      return { type: 'draft', draft: validated };
    }

    try {
      const repaired = await this.repairDraftPayload(input, response.content);
      if (repaired.changes.length > 0) {
        return { 
          type: 'draft', 
          draft: await this.normalizeDraftOperationsForWorkspace(repaired, input.context.workspace.root) 
        };
      }
    } catch {
      // Keep original parsed response if repair fails.
    }

    return { type: 'draft', draft: validated };
  }

  private async normalizeDraftOperationsForWorkspace(
    draft: CodeDraft,
    workspaceRoot: string
  ): Promise<CodeDraft> {
    for (const change of draft.changes) {
      if (change.operation !== 'create') {
        continue;
      }

      const absolutePath = path.resolve(workspaceRoot, change.path);
      try {
        const stat = await fs.stat(absolutePath);
        if (stat.isFile()) {
          change.operation = 'update';
        }
      } catch {
        // File does not exist yet, keep create operation.
      }
    }

    return draft;
  }

  async answer(input: CoderInput, onChunk?: (chunk: string) => void): Promise<CoderAnswer> {
    const limitedFiles = input.context.files.slice(0, 4);
    const messages = [
      {
        role: 'system' as const,
          content: CHAT_SYSTEM_PROMPT,
      },
      {
        role: 'user' as const,
        content: JSON.stringify({
          prompt: input.prompt,
          plan: input.plan,
          contextFiles: limitedFiles.map((file) => ({
            path: file.path,
            reason: file.reason,
            content: this.trimText(file.content, 2500),
          })),
          workspace: input.context.workspace,
          memory: this.trimText(input.context.memory, 800),
          notes: input.context.notes ? this.trimText(input.context.notes, 500) : '',
        }),
      },
    ];

    if (onChunk) {
      let content = '';
      await this.client.chatStream(
        {
          model: this.model,
          messages,
          temperature: input.deterministic ? 0 : this.temperature,
          stream: true,
        },
        (chunk) => {
          if (!chunk.content) {
            return;
          }
          content += chunk.content;
          onChunk(chunk.content);
        }
      );

      return {
        content: content.trim(),
        citations: input.context.files.slice(0, 4).map((file) => file.path),
      };
    }

    const response = await this.client.chat({
      model: this.model,
      messages,
      temperature: input.deterministic ? 0 : this.temperature,
      stream: false,
    });

    return {
      content: response.content.trim(),
      citations: input.context.files.slice(0, 4).map((file) => file.path),
    };
  }

  async completeInline(input: InlineCompletionInput): Promise<string> {
    const limitedContext = input.context.files.slice(0, 3);
    const response = await this.client.chat({
      model: this.model,
      messages: [
        {
          role: 'system',
            content: INLINE_COMPLETION_PROMPT,
        },
        {
          role: 'user',
          content: JSON.stringify({
            filePath: input.filePath,
            languageId: input.languageId,
            prefix: this.trimText(input.prefix, 2000),
            suffix: this.trimText(input.suffix, 800),
            workspace: input.context.workspace,
            contextFiles: limitedContext.map((file) => ({
              path: file.path,
              reason: file.reason,
              content: this.trimText(file.content, 1200),
            })),
            memory: this.trimText(input.context.memory, 400),
          }),
        },
      ],
      temperature: input.deterministic ? 0 : this.temperature,
      stream: false,
    });

    return this.stripCodeFences(response.content).trim();
  }

  private buildEditSystemPrompt(): string {
    return EDIT_SYSTEM_PROMPT;
  }

  private buildUserPrompt(input: CoderInput): string {
    const instruction = `CRITICAL: You MUST output ONLY valid JSON. No code. No markdown. No explanation.

Example output:
{"summary": "Added NISHANT", "changes": [{"path": "README.md", "operation": "update", "proposedContent": "FULL FILE CONTENT HERE"}]}

If optimizing, make sure proposedContent includes ALL original code plus your improvements.`;

    const limitedFiles = input.context.files.slice(0, 6);
    return JSON.stringify({
      instruction,
      prompt: input.prompt,
      plan: input.plan,
      deterministic: input.deterministic,
      validationErrors: input.validationErrors ?? [],
      contextFiles: limitedFiles.map((file) => ({
        path: file.path,
        reason: file.reason,
        content: this.trimText(file.content, 8000),
      })),
      workspace: input.context.workspace,
      memory: this.trimText(input.context.memory, 600),
      notes: input.context.notes ? this.trimText(input.context.notes, 400) : '',
    });
  }

  private resolvePrimaryContextFile(input: CoderInput): string {
    if (input.context.files.length === 0) {
      return 'unknown';
    }

    const promptLower = input.prompt.toLowerCase();
    const mentioned = input.context.files.find((file) => {
      const normalizedPath = file.path.replace(/\\/g, '/').toLowerCase();
      const fileName = normalizedPath.split('/').pop() ?? normalizedPath;
      return promptLower.includes(normalizedPath) || promptLower.includes(fileName);
    });

    return mentioned?.path ?? input.context.files[0].path;
  }

  private parseResponse(raw: string): CoderResponse {
    try {
      const json = JSON.parse(this.stripCodeFences(raw).trim());
      if (json.type === 'tool_use' && Array.isArray(json.requests)) {
        return { type: 'tool_use', requests: json.requests };
      }
      if (json.type === 'draft' || json.changes) {
        return { type: 'draft', draft: this.toDraft(json) };
      }
    } catch {
      // Fallback to a greedy search for JSON
    }

    try {
      const stripped = this.stripCodeFences(raw).trim();
      const firstBrace = stripped.indexOf('{');
      const lastBrace = stripped.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        const jsonString = stripped.slice(firstBrace, lastBrace + 1);
        const json = JSON.parse(jsonString);
        if (json.type === 'tool_use' && Array.isArray(json.requests)) {
          return { type: 'tool_use', requests: json.requests };
        }
        if (json.type === 'draft' || json.changes) {
          return { type: 'draft', draft: this.toDraft(json) };
        }
      }
    } catch {}

    return {
      type: 'draft',
      draft: this.parseFallback(raw)
    };
  }

  private parseFallback(raw: string): CodeDraft {
    const trimmed = raw.trim();
    
    // If response is empty or very short, it failed to generate
    if (!trimmed || trimmed.length < 10) {
      console.error('[KLYR] LLM returned empty or very short response');
      return {
        changes: [],
        summary: 'LLM returned empty response',
        rationale: 'The model did not generate any content. Try again or simplify your request.',
        followUpQuestions: ['Try being more specific about what you want created.'],
      };
    }
    
    // Check if response is suggestions/explanation (not actual changes)
    // But for project creation, suggestions SHOULD be converted to changes
    const isSuggestion = /\b(suggestion|improvement|to optimize|here are|here's|you could|recommend|should|might|consider|try)/i.test(trimmed.slice(0, 500));
    
    // If response looks like code (starts with import, def, class, etc.)
    const looksLikeCode = /^import |^export |^def |^class |^function |^const |^let |^var |^#!|^<!|^<!DOCTYPE|^<div|^<html|^<body|^<!DOCTYPE/i.test(trimmed);
    
    if (looksLikeCode) {
      // This is likely file content - try to figure out the filename from context
      const firstFile = this.lastContextFile || 'src/app.jsx';
      
      // Try to detect file type from content
      let detectedPath = firstFile;
      if (trimmed.includes('<html') || trimmed.includes('<!DOCTYPE') || trimmed.includes('<body')) {
        detectedPath = 'index.html';
      } else if (trimmed.includes('from \'react\'') || trimmed.includes('from "react"') || trimmed.includes('ReactDOM') || trimmed.includes('createRoot')) {
        detectedPath = 'src/main.jsx';
      } else if (trimmed.includes('package.json') || trimmed.includes('"dependencies"') || trimmed.includes("'dependencies'")) {
        detectedPath = 'package.json';
      } else if (trimmed.includes('export default') || trimmed.includes('export {')) {
        detectedPath = 'src/App.jsx';
      } else if (trimmed.includes('@vitejs/plugin-react') || trimmed.includes('defineConfig')) {
        detectedPath = 'vite.config.js';
      }
      
      return {
        changes: [{
          path: detectedPath,
          summary: 'Generated code',
          diff: '',
          proposedContent: trimmed,
          originalContent: '',
          operation: 'create' as const,
        }],
        summary: 'Code generated from fallback',
        rationale: 'LLM output code content instead of JSON',
        followUpQuestions: [],
      };
    }
    
    // For project creation requests, even prose/suggestions should be converted to files
    // The repair logic will handle this, so return a signal to repair
    if (isSuggestion) {
      // Don't give up - return a signal that we'll try to repair
      return {
        changes: [],
        summary: 'Suggestions provided - needs repair',
        rationale: 'The model provided suggestions: ' + trimmed.slice(0, 200),
        followUpQuestions: [],
      };
    }
    
    // Try to find JSON in the response
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.toDraft(parsed as OllamaDraftPayload);
      } catch {
        // JSON found but couldn't parse
      }
    }
    
    // Nothing worked - return empty with explanation
    return {
      changes: [],
      summary: 'Could not parse LLM response',
      rationale: 'The model did not output valid JSON or code. Response preview: ' + trimmed.slice(0, 200),
      followUpQuestions: ['Try simplifying your request or being more specific.'],
    };
  }

  private toDraft(parsed: OllamaDraftPayload): CodeDraft {
    const changes: DraftFileChange[] = Array.isArray(parsed.changes)
      ? parsed.changes
          .filter((change) => typeof change.path === 'string' && change.path.trim().length > 0)
          .map((change) => {
            const operation = change.operation ?? 'update';
            const additions = (change.additions ?? '').trim();
            
            // If LLM provides "additions" field, store it separately
            // The fixer/executor will merge with disk content later
            if (additions && operation === 'update') {
              return {
                path: change.path,
                summary: change.summary,
                diff: change.diff,
                proposedContent: additions, // Will be merged with original by fixer
                originalContent: '', // Will be read from disk by fixer
                operation,
              };
            }
            
            // Legacy handling for full content
            const originalContent = change.originalContent ?? '';
            const llmNewContent = (change.newContent ?? change.proposedContent ?? '').trim();
            let proposedContent = '';

            // For updates, we'll rely on fixer to read from disk
            if (operation === 'update') {
              proposedContent = llmNewContent || originalContent;
            } else if (operation === 'create') {
              proposedContent = llmNewContent || originalContent;
            }

            return {
              path: change.path,
              summary: change.summary,
              diff: change.diff,
              proposedContent,
              originalContent,
              operation,
            };
          })
      : [];

    // Parse commands from the response
    const commands: CommandStep[] = Array.isArray(parsed.commands)
      ? parsed.commands
          .filter((cmd) => typeof cmd.command === 'string' && cmd.command.trim().length > 0)
          .map((cmd) => ({
            command: cmd.command.trim(),
            cwd: cmd.cwd,
            timeout: cmd.timeout ?? 120,
            allowFailure: cmd.allowFailure ?? false,
            description: cmd.description,
          }))
      : [];

    return {
      changes,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary
          : 'No summary provided.',
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : 'No rationale provided.',
      followUpQuestions: Array.isArray(parsed.followUpQuestions)
        ? parsed.followUpQuestions.filter((item): item is string => typeof item === 'string')
        : [],
      commands,
    };
  }

  private stripCodeFences(raw: string): string {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return fenced ? fenced[1] : raw;
  }

  private trimText(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }

    return `${value.slice(0, maxChars)}\n...<truncated>`;
  }

  private shouldAttemptRepair(parsed: CodeDraft, raw: string): boolean {
    if (!raw.trim()) {
      return false;
    }

    // Always try to repair if there are no changes
    if (parsed.changes.length === 0) {
      return true;
    }

    // Also try repair if the response looks like code, not JSON
    const looksLikeCode = /^import |^export |^def |^class |^function |^const |^let |^var |^#!/.test(raw.trim());
    if (looksLikeCode) {
      return true;
    }

    return false;
  }

  private validateAndCorrectDraft(draft: CodeDraft, prompt: string): CodeDraft {
    // If there are no changes, nothing to validate
    if (draft.changes.length === 0) {
      return draft;
    }

    const promptLower = prompt.toLowerCase();
    const isProjectCreation = /\b(create|build|make|generate|setup)\b.*\b(project|app|website|portfolio|react|next|node)\b/i.test(promptLower) ||
                             /\b(react|next|vite|angular|vue)\b.*\b(app|project)\b/i.test(promptLower) ||
                             /\b(portfolio|dashboard|landing)\b/i.test(promptLower);

    // Only auto-correct for project creation requests
    if (!isProjectCreation) {
      return draft;
    }

    const { targetFolder, projectName } = this.extractProjectScaffoldHints(prompt);
    const shouldNormalizePronounPrefixes = targetFolder.length === 0;
    
    // Extract user name if mentioned
    const nameMatch = prompt.match(/\bmy name is ([A-Za-z]+)/i);
    const userName = nameMatch ? nameMatch[1] : 'Developer';

    // Map of file paths that need correction
    const corrections: Map<string, string> = new Map();
    
    // Normalize obvious accidental prompt-pronoun path prefixes like "it/".
    if (shouldNormalizePronounPrefixes) {
      for (const change of draft.changes) {
        if (!change.path) {
          continue;
        }
        change.path = this.stripAccidentalPronounPrefix(change.path);
      }
    }

    // Find files that need validation
    for (const change of draft.changes) {
      const path = change.path || '';
      const content = change.proposedContent || '';
      
      // Validate package.json
      if (path.endsWith('package.json')) {
        const corrected = this.correctPackageJson(content, projectName || 'myapp');
        if (corrected !== content) {
          corrections.set(path, corrected);
        }
      }
      
      // Validate vite.config.js
      if (path.includes('vite.config')) {
        const corrected = this.correctViteConfig(content);
        if (corrected !== content) {
          corrections.set(path, corrected);
        }
      }
      
      // Validate main.jsx
      if (path.endsWith('main.jsx') || path.endsWith('main.tsx')) {
        const corrected = this.correctMainJsx(content);
        if (corrected !== content) {
          corrections.set(path, corrected);
        }
      }
    }
    
    // Check for missing files that are imported
    const allContents = draft.changes.map(c => c.proposedContent || '').join('\n');
    
    // If App.jsx is imported but not in changes, add it
    if (allContents.includes('./App.jsx') || allContents.includes('./App.tsx')) {
      const hasAppJsx = draft.changes.some(c => 
        (c.path || '').endsWith('App.jsx') || (c.path || '').endsWith('App.tsx')
      );
      if (!hasAppJsx) {
        draft.changes.push({
          path: targetFolder + 'src/App.jsx',
          operation: 'create',
          proposedContent: this.getAppJsxTemplate(userName),
          summary: 'App component',
          diff: '',
          originalContent: '',
        });
      }
    }
    
    // If index.css is imported but not in changes, add it
    if (allContents.includes('./index.css')) {
      const hasIndexCss = draft.changes.some(c => (c.path || '').endsWith('index.css'));
      if (!hasIndexCss) {
        draft.changes.push({
          path: targetFolder + 'src/index.css',
          operation: 'create',
          proposedContent: this.getIndexCssTemplate(),
          summary: 'Global styles',
          diff: '',
          originalContent: '',
        });
      }
    }
    
    // If App.css is imported but not in changes, add it
    if (allContents.includes('./App.css')) {
      const hasAppCss = draft.changes.some(c => (c.path || '').endsWith('App.css'));
      if (!hasAppCss) {
        draft.changes.push({
          path: targetFolder + 'src/App.css',
          operation: 'create',
          proposedContent: this.getAppCssTemplate(),
          summary: 'App styles',
          diff: '',
          originalContent: '',
        });
      }
    }
    
    // Apply corrections
    for (const change of draft.changes) {
      const corrected = corrections.get(change.path || '');
      if (corrected) {
        change.proposedContent = corrected;
      }
    }
    
    return draft;
  }

  private correctPackageJson(content: string, projectName: string): string {
    // If content is empty or invalid, return correct template
    if (!content.trim() || !content.includes('"')) {
      return this.getPackageJsonTemplate(projectName);
    }
    
    // Check if it has "dependencies" field
    if (!content.includes('"dependencies"')) {
      // Try to parse and fix
      try {
        const parsed = JSON.parse(content);
        
        // Fix common mistakes
        if (parsed.imports && !parsed.dependencies) {
          parsed.dependencies = parsed.imports;
          delete parsed.imports;
        }
        
        // Ensure required fields
        parsed.name = parsed.name || projectName;
        parsed.scripts = parsed.scripts || {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview'
        };
        parsed.dependencies = parsed.dependencies || {
          react: '^18.2.0',
          'react-dom': '^18.2.0'
        };
        parsed.devDependencies = parsed.devDependencies || {
          '@vitejs/plugin-react': '^4.2.1',
          vite: '^5.1.0'
        };
        
        return JSON.stringify(parsed, null, 2);
      } catch {
        // JSON parse failed, return correct template
        return this.getPackageJsonTemplate(projectName);
      }
    }
    
    return content;
  }

  private correctViteConfig(content: string): string {
    if (!content.trim()) {
      return this.getViteConfigTemplate();
    }
    
    // Check if it has proper imports
    if (!content.includes("from 'vite'") && !content.includes('from "vite"')) {
      return this.getViteConfigTemplate();
    }
    
    if (!content.includes("from '@vitejs/plugin-react'") && !content.includes('from "@vitejs/plugin-react"')) {
      return this.getViteConfigTemplate();
    }
    
    return content;
  }

  private correctMainJsx(content: string): string {
    if (!content.trim()) {
      return this.getMainJsxTemplate();
    }
    
    // Check for essential imports
    if (!content.includes('createRoot') && !content.includes('createRoot')) {
      return this.getMainJsxTemplate();
    }
    
    if (!content.includes('from \'./App') && !content.includes('from "./App')) {
      return this.getMainJsxTemplate();
    }
    
    return content;
  }

  private getPackageJsonTemplate(name: string): string {
    return JSON.stringify({
      name: name,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.2.1",
        vite: "^5.1.0"
      }
    }, null, 2);
  }

  private getViteConfigTemplate(): string {
    return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`;
  }

  private getMainJsxTemplate(): string {
    return `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;
  }

  private getAppJsxTemplate(userName: string): string {
    return `import React from 'react'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>${userName}</h1>
        <nav>
          <a href="#about">About</a>
          <a href="#projects">Projects</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>
      
      <main>
        <section id="about" className="section">
          <h2>About Me</h2>
          <p>Welcome to my portfolio!</p>
        </section>
        
        <section id="projects" className="section">
          <h2>My Projects</h2>
          <div className="projects-grid">
            <div className="project-card">
              <h3>Project 1</h3>
              <p>Description of my first project</p>
            </div>
            <div className="project-card">
              <h3>Project 2</h3>
              <p>Description of my second project</p>
            </div>
          </div>
        </section>
        
        <section id="contact" className="section">
          <h2>Contact</h2>
          <p>Get in touch with me!</p>
        </section>
      </main>
      
      <footer className="footer">
        <p>Built with React + Vite</p>
      </footer>
    </div>
  )
}

export default App
`;
  }

  private getIndexCssTemplate(): string {
    return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  line-height: 1.6;
  color: #333;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
}

.header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.header nav {
  display: flex;
  gap: 1.5rem;
}

.header nav a {
  color: white;
  text-decoration: none;
  opacity: 0.9;
}

.header nav a:hover {
  opacity: 1;
  text-decoration: underline;
}

main {
  flex: 1;
  padding: 3rem 2rem;
}

.section {
  max-width: 800px;
  margin: 0 auto 4rem;
}

.section h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #1a1a2e;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.project-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.footer {
  background: #1a1a2e;
  color: white;
  text-align: center;
  padding: 1.5rem;
}
`;
  }

  private getAppCssTemplate(): string {
    return `.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
`;
  }

  private extractProjectScaffoldHints(prompt: string): { targetFolder: string; projectName: string } {
    const stopwords = new Set([
      'it',
      'this',
      'that',
      'there',
      'here',
      'current',
      'workspace',
      'root',
      'project',
      'app',
      'folder',
      'directory',
    ]);

    const nameMatch = prompt.match(
      /(?:named|called|name\s+it(?:\s+as)?)\s+([A-Za-z][A-Za-z0-9_-]{0,80})/i
    );
    const projectName = nameMatch?.[1] ?? '';

    const explicitFolderMatch = prompt.match(
      /\b(?:in|inside|within|to|into)\s+([A-Za-z][A-Za-z0-9_-]{0,80})\s+(?:folder|directory)\b/i
    );
    const explicitFolder = explicitFolderMatch?.[1]?.trim();

    if (!explicitFolder) {
      return { targetFolder: '', projectName };
    }

    const lower = explicitFolder.toLowerCase();
    if (stopwords.has(lower)) {
      return { targetFolder: '', projectName };
    }

    return { targetFolder: `${explicitFolder}/`, projectName };
  }

  private stripAccidentalPronounPrefix(pathValue: string): string {
    const normalized = pathValue.replace(/\\/g, '/');
    return normalized.replace(/^(?:it|this|that|there|here)\//i, '');
  }

  private async repairDraftPayload(input: CoderInput, raw: string): Promise<CodeDraft> {
    const trimmed = raw.trim();
    
    // Check if this is a project creation request
    const promptLower = input.prompt.toLowerCase();
    const isProjectCreation = /\b(create|build|make|generate|setup)\b.*\b(project|app|website|portfolio|react|next|node)\b/i.test(promptLower) ||
                             /\b(react|next|vite|angular|vue)\b.*\b(app|project)\b/i.test(promptLower) ||
                             /\b(portfolio|dashboard|landing)\b/i.test(promptLower);
    
    // For project creation, synthesize a complete React + Vite project
    if (isProjectCreation) {
      console.log('[KLYR] Detected project creation request, synthesizing full project...');
      
      const { targetFolder, projectName } = this.extractProjectScaffoldHints(input.prompt);
      
      // Create a complete React + Vite project
      const reactProjectFiles: DraftFileChange[] = [
        {
          path: targetFolder + 'package.json',
          operation: 'create' as const,
          proposedContent: `{
  "name": "${projectName || 'myapp'}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.1.0"
  }
}`,
          summary: 'package.json with React + Vite dependencies',
          diff: '',
          originalContent: '',
        },
        {
          path: targetFolder + 'vite.config.js',
          operation: 'create' as const,
          proposedContent: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
          summary: 'Vite configuration with React plugin',
          diff: '',
          originalContent: '',
        },
        {
          path: targetFolder + 'index.html',
          operation: 'create' as const,
          proposedContent: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Portfolio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
          summary: 'HTML entry point',
          diff: '',
          originalContent: '',
        },
        {
          path: targetFolder + 'src/main.jsx',
          operation: 'create' as const,
          proposedContent: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
          summary: 'React entry point',
          diff: '',
          originalContent: '',
        },
        {
          path: targetFolder + 'src/App.jsx',
          operation: 'create' as const,
          proposedContent: `import React from 'react'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>My Portfolio</h1>
        <nav>
          <a href="#about">About</a>
          <a href="#projects">Projects</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>
      
      <main>
        <section id="about" className="section">
          <h2>About Me</h2>
          <p>Welcome to my portfolio website!</p>
        </section>
        
        <section id="projects" className="section">
          <h2>My Projects</h2>
          <div className="projects-grid">
            <div className="project-card">
              <h3>Project 1</h3>
              <p>Description of my first project</p>
            </div>
            <div className="project-card">
              <h3>Project 2</h3>
              <p>Description of my second project</p>
            </div>
          </div>
        </section>
        
        <section id="contact" className="section">
          <h2>Contact</h2>
          <p>Get in touch with me!</p>
        </section>
      </main>
      
      <footer className="footer">
        <p>Built with React + Vite</p>
      </footer>
    </div>
  )
}

export default App
`,
          summary: 'Main App component',
          diff: '',
          originalContent: '',
        },
        {
          path: targetFolder + 'src/index.css',
          operation: 'create' as const,
          proposedContent: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  line-height: 1.6;
  color: #333;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: #2c3e50;
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  font-size: 1.5rem;
}

.header nav a {
  color: white;
  text-decoration: none;
  margin-left: 1.5rem;
}

.header nav a:hover {
  text-decoration: underline;
}

main {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.section {
  margin-bottom: 3rem;
}

.section h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #2c3e50;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.project-card {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.project-card h3 {
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

.footer {
  background: #2c3e50;
  color: white;
  text-align: center;
  padding: 1.5rem;
  margin-top: auto;
}
`,
          summary: 'Global CSS styles',
          diff: '',
          originalContent: '',
        },
        {
          path: targetFolder + 'src/App.css',
          operation: 'create' as const,
          proposedContent: `.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.header nav {
  display: flex;
  gap: 1.5rem;
}

.header nav a {
  color: white;
  text-decoration: none;
  opacity: 0.9;
  transition: opacity 0.3s;
}

.header nav a:hover {
  opacity: 1;
  text-decoration: underline;
}

main {
  flex: 1;
  padding: 3rem 2rem;
}

.section {
  max-width: 800px;
  margin: 0 auto 4rem;
}

.section h2 {
  font-size: 2.5rem;
  margin-bottom: 1.5rem;
  color: #1a1a2e;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
}

.project-card {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
}

.project-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.project-card h3 {
  margin-bottom: 0.75rem;
  color: #667eea;
}

.footer {
  background: #1a1a2e;
  color: white;
  text-align: center;
  padding: 2rem;
}
`,
          summary: 'App component styles',
          diff: '',
          originalContent: '',
        },
        {
          path: targetFolder + '.gitignore',
          operation: 'create' as const,
          proposedContent: `node_modules
dist
.env
.env.local
.DS_Store
*.log
`,
          summary: 'Git ignore file',
          diff: '',
          originalContent: '',
        },
        {
          path: targetFolder + 'README.md',
          operation: 'create' as const,
          proposedContent: `# Portfolio Website

A modern portfolio website built with React and Vite.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Features

- Responsive design
- Modern UI
- Fast development with Vite

## Tech Stack

- React 18
- Vite 5
- CSS3
`,
          summary: 'Project README',
          diff: '',
          originalContent: '',
        }
      ];
      
      return {
        changes: reactProjectFiles,
        summary: 'Synthesized complete React + Vite portfolio project',
        rationale: 'Created full project based on project creation request',
        followUpQuestions: [],
        commands: [
          { command: 'npm install', allowFailure: false }
        ]
      };
    }
    
    // Original repair logic for non-project requests
    try {
      const repairResponse = await this.client.chat({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a JSON generator. Output ONLY valid JSON for a code editor.\n\nSchema: {"summary": string, "changes": [{"path": string, "operation": "create|update|delete", "proposedContent": string}]}\n\nFor project creation, create all necessary files. Output ONLY JSON, no markdown or explanation.',
          },
          {
            role: 'user',
            content: `User request: ${input.prompt}\n\nLLM response: ${trimmed.slice(0, 2000)}\n\nConvert this to JSON with actual file changes. Create files if the user asked for a project. Output ONLY JSON.`,
          },
        ],
        temperature: 0,
        stream: false,
      });

      const parsed = this.parseResponse(repairResponse.content);
      if (parsed.type === 'draft' && parsed.draft.changes.length > 0) {
        return parsed.draft;
      }
    } catch {
      // Repair failed
    }

    // Second pass: synthesize concrete edits from prose suggestions
    return {
      changes: [],
      summary: 'Could not generate changes',
      rationale: 'The model did not provide code changes in JSON format. Response: ' + trimmed.slice(0, 200),
      followUpQuestions: ['Please specify exactly what you want changed in the code.'],
    };
  }
}
