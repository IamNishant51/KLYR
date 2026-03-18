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
export declare class LLMPoweredPlanner implements Planner {
    private readonly client;
    private readonly model;
    constructor(client: OllamaClient, model: string);
    plan(input: PlannerInput): Promise<PlanResult>;
    private classifyIntent;
    private parseClassificationResponse;
    private fallbackClassification;
    private normalizeIntent;
    private determineMode;
    private collectTargetHints;
    private getClarification;
    private describeGoal;
    private buildSummary;
    private buildGuardrails;
    private planSteps;
    private includesAny;
}
export declare class BasicPlanner implements Planner {
    plan(input: PlannerInput): Promise<PlanResult>;
    private extractIntent;
    private determineMode;
    private collectTargetHints;
    private getClarification;
    private describeGoal;
    private buildSummary;
    private buildGuardrails;
    private planSteps;
    private includesAny;
}
