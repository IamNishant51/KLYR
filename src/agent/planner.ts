import type { OllamaClient } from '../llm/ollamaClient';

export type PlanMode = 'chat' | 'edit' | 'inline';

export interface PlannerInput {
  prompt: string;
  userIntentHint?: string;
  contextSummary?: string;
  workspaceSummary?: string;
  activeFilePath?: string;
  selection?: string;
  modeHint?: PlanMode;
}

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  tool: 'planner' | 'context' | 'coder' | 'validator' | 'executor' | 'memory';
  expectedOutput: string;
}

export interface PlanResult {
  intent: string;
  mode: PlanMode;
  goal: string;
  summary: string;
  requiresWrite: boolean;
  requiresUserClarification: boolean;
  clarificationReason?: string;
  questions: string[];
  targetHints: string[];
  guardrails: string[];
  steps: PlanStep[];
}

export interface Planner {
  plan(input: PlannerInput): Promise<PlanResult>;
}

export class LLMPoweredPlanner implements Planner {
  private readonly client: OllamaClient;
  private readonly model: string;

  constructor(client: OllamaClient, model: string) {
    this.client = client;
    this.model = model;
  }

  async plan(input: PlannerInput): Promise<PlanResult> {
    // Use LLM to classify intent and extract information
    const classification = await this.classifyIntent(input.prompt, input.activeFilePath);
    
    const intent = classification.intent;
    const mode = this.determineMode(intent, input.modeHint);
    const requiresWrite = mode === 'edit';
    const clarification = this.getClarification(input.prompt, input.activeFilePath, mode);

    return {
      intent,
      mode,
      goal: this.describeGoal(intent, input.prompt),
      summary: this.buildSummary(intent, mode, requiresWrite),
      requiresWrite,
      requiresUserClarification: clarification.questions.length > 0,
      clarificationReason: clarification.reason,
      questions: clarification.questions,
      targetHints: this.collectTargetHints(input.prompt, input.activeFilePath, classification.targetFiles),
      guardrails: this.buildGuardrails(mode),
      steps: this.planSteps(intent, mode),
    };
  }

  private async classifyIntent(prompt: string, activeFilePath?: string): Promise<{
    intent: string;
    targetFiles: string[];
    action: string;
  }> {
    const systemPrompt = `You are an expert code assistant. Analyze the user's request and classify it.

INTENT OPTIONS:
- create: Create new files or components (e.g., "create a new component", "add a new file")
- update: Modify or update existing code (e.g., "update the config", "change this function")
- delete: Remove files or code (e.g., "delete this file", "remove the unused code")
- fix: Fix bugs, errors, or issues (e.g., "fix the bug", "this is broken")
- optimize: Improve performance, efficiency, or code quality (e.g., "optimize this", "make it faster")
- refactor: Restructure code without changing behavior (e.g., "refactor", "clean up")
- explain: Understand or explain code (e.g., "explain this", "what does this do", "see the file")
- test: Generate or update tests (e.g., "add tests", "write tests")
- inline: Code completion (e.g., "complete this", "autocomplete")

Respond ONLY with valid JSON, no markdown or explanation:
{"intent": "the intent", "targetFiles": ["file1.ext", "file2.ext"], "action": "brief description of the action"}`;

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        stream: false,
      });

      const parsed = this.parseClassificationResponse(response.content, activeFilePath);
      return parsed;
    } catch (error) {
      console.warn('[KLYR] LLM classification failed, using fallback:', error);
      return this.fallbackClassification(prompt, activeFilePath);
    }
  }

  private parseClassificationResponse(raw: string, activeFilePath?: string): {
    intent: string;
    targetFiles: string[];
    action: string;
  } {
    try {
      // Try to extract JSON from response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.intent && typeof parsed.intent === 'string') {
          return {
            intent: this.normalizeIntent(parsed.intent),
            targetFiles: Array.isArray(parsed.targetFiles) ? parsed.targetFiles : [],
            action: parsed.action || '',
          };
        }
      }
    } catch {
      // JSON parse failed
    }
    
    return this.fallbackClassification(raw, activeFilePath);
  }

  private fallbackClassification(prompt: string, activeFilePath?: string): {
    intent: string;
    targetFiles: string[];
    action: string;
  } {
    const lower = prompt.toLowerCase();
    
    // Extract file paths from prompt - match various patterns
    const fileMatches = prompt.match(/[\w./\\-]+\.[\w]+/g) || [];
    
    // Also match simple filenames like "config.py" without path
    const simpleFileMatches = prompt.match(/\b([a-zA-Z][\w-]*\.(py|ts|tsx|js|jsx|json|md|html|css|scss|yaml|yml|toml|ini|env|config|cfg|xml|csv))\b/gi) || [];
    
    // Combine and deduplicate
    const allMatches = [...new Set([...fileMatches, ...simpleFileMatches])];
    const targetFiles = allMatches;
    
    // Add active file if no files mentioned
    if (activeFilePath && targetFiles.length === 0) {
      targetFiles.push(activeFilePath);
    }
    
    // Classify based on keywords
    let intent = 'explain';
    
    if (/\b(create|add new|generate new)\b/.test(lower)) {
      intent = 'create';
    } else if (/\b(update|modify|change|edit)\b/.test(lower)) {
      intent = 'update';
    } else if (/\b(delete|remove)\b/.test(lower)) {
      intent = 'delete';
    } else if (/\b(fix|bug|broken|error)\b/.test(lower)) {
      intent = 'fix';
    } else if (/\b(optimize|performance|faster|improve)\b/.test(lower)) {
      intent = 'optimize';
    } else if (/\b(refactor|clean up|restructure)\b/.test(lower)) {
      intent = 'refactor';
    } else if (/\b(test|spec)\b/.test(lower)) {
      intent = 'test';
    } else if (/\b(see|look at|check|review|explain|understand|analyze|optimize)\b/.test(lower)) {
      intent = 'explain';
    }
    
    return { intent, targetFiles, action: prompt.slice(0, 100) };
  }

  private normalizeIntent(intent: string): string {
    const normalized = intent.toLowerCase().trim();
    
    const intentMap: Record<string, string> = {
      'code': 'update',
      'edit': 'update',
      'modify': 'update',
      'change': 'update',
      'add': 'update',
      'insert': 'update',
      'look at': 'explain',
      'check': 'explain',
      'review': 'explain',
      'analyze': 'explain',
      'understand': 'explain',
      'performance': 'optimize',
      'make faster': 'optimize',
      'completion': 'inline',
      'autocomplete': 'inline',
    };
    
    return intentMap[normalized] || normalized;
  }

  private determineMode(intent: string, modeHint?: PlanMode): PlanMode {
    if (modeHint) {
      return modeHint;
    }

    if (intent === 'inline') {
      return 'inline';
    }

    if (['refactor', 'fix', 'optimize', 'test', 'feature', 'delete', 'create', 'update'].includes(intent)) {
      return 'edit';
    }

    return 'chat';
  }

  private collectTargetHints(prompt: string, activeFilePath?: string, llmFiles?: string[]): string[] {
    const hints = new Set<string>();

    if (activeFilePath) {
      hints.add(activeFilePath);
    }

    // Add files from LLM classification
    if (llmFiles) {
      llmFiles.forEach(f => hints.add(f));
    }

    // Extract file paths from prompt - full paths
    for (const match of prompt.matchAll(/[\w./\\-]+\.(ts|tsx|js|jsx|json|md|py|css|html|vue|react)/gi)) {
      hints.add(match[0]);
    }

    // Also extract simple filenames like "config.py" or "README.md"
    for (const match of prompt.matchAll(/\b([a-zA-Z][\w-]*\.(py|ts|tsx|js|jsx|json|md|html|css|scss|yaml|yml|toml|ini|env|config|cfg|xml|csv|vue|react))\b/gi)) {
      hints.add(match[0]);
    }

    return [...hints];
  }

  private getClarification(
    prompt: string,
    activeFilePath: string | undefined,
    mode: PlanMode
  ): { reason?: string; questions: string[] } {
    const trimmed = prompt.trim();
    const lower = trimmed.toLowerCase();

    if (trimmed.length < 4) {
      return {
        reason: 'The request is too short to execute safely.',
        questions: ['What should I change, and which file or feature should I focus on?'],
      };
    }

    if (
      mode === 'edit' &&
      !activeFilePath &&
      this.includesAny(lower, ['this', 'current file', 'selected code', 'here'])
    ) {
      return {
        reason: 'The request references the current editor, but no active file is available.',
        questions: ['Open the target file, then resend the request so I can edit the right code.'],
      };
    }

    return { questions: [] };
  }

  private describeGoal(intent: string, prompt: string): string {
    switch (intent) {
      case 'create':
        return 'Create new file or component aligned with workspace patterns.';
      case 'update':
        return 'Modify existing code as requested.';
      case 'delete':
        return 'Remove specified files or code sections safely.';
      case 'fix':
        return 'Fix the identified bug or error.';
      case 'optimize':
        return 'Improve performance and code efficiency.';
      case 'refactor':
        return 'Restructure code for better maintainability.';
      case 'test':
        return 'Create or update tests for the code.';
      case 'explain':
        return 'Explain the code using retrieved workspace context.';
      case 'inline':
        return 'Continue the current edit with a minimal completion.';
      default:
        return `Respond to the request: ${prompt.trim().slice(0, 100)}`;
    }
  }

  private buildSummary(intent: string, mode: PlanMode, requiresWrite: boolean): string {
    const action =
      mode === 'chat'
        ? 'retrieve context and answer directly'
        : mode === 'inline'
          ? 'retrieve local context and suggest a small completion'
          : 'retrieve context, generate edits, validate them, and wait for approval';

    return `Intent: ${intent}. Mode: ${mode}. I will ${action}. Write required: ${requiresWrite ? 'yes' : 'no'}.`;
  }

  private buildGuardrails(mode: PlanMode): string[] {
    const guardrails = [
      'Use only verified workspace context and declared dependencies.',
      'Prefer deterministic output and avoid speculative APIs.',
    ];

    if (mode === 'edit') {
      guardrails.push('Validate syntax, imports, and unsafe patterns before previewing changes.');
      guardrails.push('Never apply edits without an explicit diff review.');
      guardrails.push('Show exact lines added (green) and removed (red) in diff preview.');
    }

    if (mode === 'chat') {
      guardrails.push('If the context is insufficient, say so instead of guessing.');
    }

    return guardrails;
  }

  private planSteps(intent: string, mode: PlanMode): PlanStep[] {
    if (mode === 'chat') {
      return [
        { id: '1', title: 'Plan', description: 'Classify request and determine response path.', tool: 'planner', expectedOutput: 'intent and mode' },
        { id: '2', title: 'Retrieve', description: 'Pull relevant files and context.', tool: 'context', expectedOutput: 'bounded context' },
        { id: '3', title: 'Answer', description: 'Answer using retrieved context.', tool: 'coder', expectedOutput: 'context-grounded answer' },
      ];
    }

    if (mode === 'inline') {
      return [
        { id: '1', title: 'Plan', description: 'Identify completion intent.', tool: 'planner', expectedOutput: 'completion strategy' },
        { id: '2', title: 'Retrieve', description: 'Use local context.', tool: 'context', expectedOutput: 'cursor-aware context' },
        { id: '3', title: 'Complete', description: 'Generate minimal insertion.', tool: 'coder', expectedOutput: 'inline completion' },
      ];
    }

    return [
      { id: '1', title: 'Plan', description: 'Classify intent and extract target files.', tool: 'planner', expectedOutput: 'execution plan' },
      { id: '2', title: 'Retrieve', description: 'Gather relevant workspace context.', tool: 'context', expectedOutput: 'retrieved files' },
      { id: '3', title: 'Generate', description: 'Produce validated code edits.', tool: 'coder', expectedOutput: 'structured draft' },
      { id: '4', title: 'Validate', description: 'Check syntax and imports.', tool: 'validator', expectedOutput: 'validated draft' },
      { id: '5', title: 'Preview', description: 'Show diff with green/red highlighting.', tool: 'executor', expectedOutput: 'diff preview' },
    ];
  }

  private includesAny(input: string, values: string[]): boolean {
    return values.some((value) => input.includes(value));
  }
}

export class BasicPlanner implements Planner {
  async plan(input: PlannerInput): Promise<PlanResult> {
    const intent = this.extractIntent(input.prompt, input.userIntentHint);
    const mode = this.determineMode(intent, input.modeHint);
    const requiresWrite = mode === 'edit';
    const clarification = this.getClarification(input.prompt, input.activeFilePath, mode);

    return {
      intent,
      mode,
      goal: this.describeGoal(intent, input.prompt),
      summary: this.buildSummary(intent, mode, requiresWrite),
      requiresWrite,
      requiresUserClarification: clarification.questions.length > 0,
      clarificationReason: clarification.reason,
      questions: clarification.questions,
      targetHints: this.collectTargetHints(input.prompt, input.activeFilePath),
      guardrails: this.buildGuardrails(mode),
      steps: this.planSteps(intent, mode),
    };
  }

  private extractIntent(prompt: string, hint?: string): string {
    const lower = `${hint ?? ''} ${prompt}`.toLowerCase();
    const hasNegatedDelete =
      /\b(don't|dont|do not|never)\s+(delete|remove)\b/.test(lower) ||
      /\bwithout\s+(deleting|removing)\b/.test(lower);
    const hasDeleteTerms = this.includesAny(lower, ['delete', 'remove']);

    if (this.includesAny(lower, ['inline', 'complete', 'autocomplete', 'ghost text'])) return 'inline';
    if (this.includesAny(lower, ['refactor', 'cleanup', 'clean up'])) return 'refactor';
    if (this.includesAny(lower, ['fix', 'bug', 'repair'])) return 'fix';
    if (this.includesAny(lower, ['optimize', 'performance', 'faster', 'improve'])) return 'optimize';
    if (this.includesAny(lower, ['test', 'spec', 'unit test'])) return 'test';
    if (this.includesAny(lower, ['document', 'comment', 'docstring'])) return 'document';
    if (this.includesAny(lower, ['enable', 'disable', 'feature', 'implement'])) return 'feature';
    if (this.includesAny(lower, ['create', 'add', 'new file'])) return 'create';
    if (this.includesAny(lower, ['see', 'look at', 'check', 'review', 'analyze', 'explain'])) return 'explain';
    if (this.includesAny(lower, ['update', 'modify', 'change', 'edit'])) return 'update';
    if (hasDeleteTerms && !hasNegatedDelete) return 'delete';
    if (this.includesAny(lower, ['why', 'what', 'how', 'summarize'])) return 'explain';

    return 'unknown';
  }

  private determineMode(intent: string, modeHint?: PlanMode): PlanMode {
    if (modeHint) return modeHint;
    if (intent === 'inline') return 'inline';
    if (['refactor', 'fix', 'optimize', 'test', 'feature', 'delete', 'create', 'update'].includes(intent)) return 'edit';
    return 'chat';
  }

  private collectTargetHints(prompt: string, activeFilePath?: string): string[] {
    const hints = new Set<string>();
    if (activeFilePath) hints.add(activeFilePath);
    for (const match of prompt.matchAll(/[\w./-]+\.(ts|tsx|js|jsx|json|md|css|scss|html)/gi)) {
      hints.add(match[0]);
    }
    return [...hints];
  }

  private getClarification(prompt: string, activeFilePath: string | undefined, mode: PlanMode): { reason?: string; questions: string[] } {
    const trimmed = prompt.trim();
    if (trimmed.length < 4) {
      return { reason: 'The request is too short.', questions: ['What should I change?'] };
    }
    if (mode === 'edit' && !activeFilePath && this.includesAny(trimmed.toLowerCase(), ['this', 'current file', 'here'])) {
      return { reason: 'No active file.', questions: ['Open a file and try again.'] };
    }
    return { questions: [] };
  }

  private describeGoal(intent: string, prompt: string): string {
    const goals: Record<string, string> = {
      create: 'Create new file or component.',
      update: 'Modify existing code.',
      delete: 'Remove files safely.',
      fix: 'Fix identified bug.',
      optimize: 'Improve performance.',
      refactor: 'Restructure code.',
      test: 'Create or update tests.',
      explain: 'Explain using context.',
      inline: 'Complete code.',
    };
    return goals[intent] || `Respond to: ${prompt.slice(0, 50)}`;
  }

  private buildSummary(intent: string, mode: PlanMode, requiresWrite: boolean): string {
    const action = mode === 'chat' ? 'answer directly' : mode === 'inline' ? 'suggest completion' : 'generate and validate edits';
    return `Intent: ${intent}. Mode: ${mode}. I will ${action}. Write: ${requiresWrite ? 'yes' : 'no'}.`;
  }

  private buildGuardrails(mode: PlanMode): string[] {
    const guardrails = ['Use only verified context.'];
    if (mode === 'edit') guardrails.push('Validate before preview.', 'Show diff with highlighting.');
    if (mode === 'chat') guardrails.push('Say if context is insufficient.');
    return guardrails;
  }

  private planSteps(intent: string, mode: PlanMode): PlanStep[] {
    if (mode === 'chat') return [
      { id: '1', title: 'Plan', description: 'Classify request.', tool: 'planner', expectedOutput: 'intent' },
      { id: '2', title: 'Retrieve', description: 'Get context.', tool: 'context', expectedOutput: 'files' },
      { id: '3', title: 'Answer', description: 'Respond.', tool: 'coder', expectedOutput: 'answer' },
    ];
    if (mode === 'inline') return [
      { id: '1', title: 'Complete', description: 'Generate completion.', tool: 'coder', expectedOutput: 'completion' },
    ];
    return [
      { id: '1', title: 'Plan', description: 'Classify intent.', tool: 'planner', expectedOutput: 'plan' },
      { id: '2', title: 'Retrieve', description: 'Get context.', tool: 'context', expectedOutput: 'files' },
      { id: '3', title: 'Generate', description: 'Create edits.', tool: 'coder', expectedOutput: 'draft' },
      { id: '4', title: 'Validate', description: 'Check syntax.', tool: 'validator', expectedOutput: 'validated' },
      { id: '5', title: 'Preview', description: 'Show diff.', tool: 'executor', expectedOutput: 'diff' },
    ];
  }

  private includesAny(input: string, values: string[]): boolean {
    return values.some((value) => input.includes(value));
  }
}
