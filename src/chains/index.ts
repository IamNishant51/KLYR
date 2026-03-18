/**
 * LangChain chain definitions for Klyr.
 * Defines reusable chains for different types of operations.
 */

import { PromptTemplate } from '@langchain/core/prompts';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';

/**
 * Create an edit chain for code modifications
 */
export function createEditChain(llm: BaseLanguageModel) {
  const template = `You are Klyr, a PRECISION code editor integrated into VS Code.

CRITICAL INSTRUCTIONS:
1. NEVER replace entire files - only edit specific sections
2. Preserve ALL original content not explicitly being changed
3. Maintain exact indentation, formatting, and line breaks
4. Return ONLY the proposed content for the edited section

User Request: {userRequest}

Original Content:
{originalContent}

Available Tools:
{availableTools}

Provide the updated content that incorporates the requested changes while preserving everything else.`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create a chat context chain for Q&A
 */
export function createChatChain(llm: BaseLanguageModel) {
  const template = `You are Klyr, an intelligent code assistant in VS Code.

Context from workspace:
{context}

User question: {question}

Available tools for deeper analysis:
{availableTools}

Provide a helpful, concise answer. If code examples would help, include them.`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create a tool selection chain
 */
export function createToolSelectionChain(llm: BaseLanguageModel) {
  const template = `You are selecting the best tools for a user request.

Available tools:
{availableTools}

User request: {userRequest}

Select the most relevant tools (by name) to help fulfill this request, in order of importance.
Respond with a JSON array of tool names only, e.g.: ["tool1", "tool2"]`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create a validation chain for checking generated code
 */
export function createValidationChain(llm: BaseLanguageModel) {
  const template = `Validate the following code change:

Original:
{original}

Proposed:
{proposed}

Check for:
1. Syntax errors
2. Logic errors
3. Content loss or corruption
4. Breaking changes
5. Performance issues

Respond with a JSON object:
{{"valid": boolean, "issues": ["issue1", "issue2"], "confidence": 0.0-1.0}}`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create a refactoring chain for intelligent code improvement
 */
export function createRefactoringChain(llm: BaseLanguageModel) {
  const template = `Improve the following code for better quality, readability, and performance:

Code:
{code}

Guidelines:
1. Follow best practices for {language}
2. Improve variable naming if unclear
3. Simplify complex logic where possible
4. Add comments for non-obvious sections
5. Suggest type definitions if applicable

Provide the improved version with a brief explanation of changes.`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create a test generation chain
 */
export function createTestChain(llm: BaseLanguageModel) {
  const template = `Generate comprehensive unit tests for the following code:

Code:
{code}

Language: {language}
Testing Framework: {framework}

Requirements:
1. Test normal cases and edge cases
2. Test error conditions
3. Achieve high code coverage
4. Use clear test descriptions
5. Follow {framework} conventions

Provide the test code and a brief explanation of test coverage.`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create a documentation chain
 */
export function createDocumentationChain(llm: BaseLanguageModel) {
  const template = `Generate {docStyle} documentation for the following code:

Code:
{code}

Add documentation for:
1. Function/class purpose and behavior
2. Parameter descriptions and types
3. Return value description
4. Exceptions/errors that may be thrown
5. Usage examples where helpful

Follow {docStyle} conventions strictly.`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create an analysis chain for code review
 */
export function createAnalysisChain(llm: BaseLanguageModel) {
  const template = `Analyze the following code for potential issues:

Code:
{code}

Check for:
1. Code smells and anti-patterns
2. Performance problems
3. Security vulnerabilities
4. Maintainability issues
5. Type safety problems (if applicable)

Provide a JSON response:
{{
  "issues": [
    {{"line": number, "severity": "critical|warning|info", "description": "...", "suggestion": "..."}}
  ],
  "summary": "...",
  "overallQuality": 0.0-1.0
}}`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create an inline completion chain for ghost text suggestions
 */
export function createInlineCompletionChain(llm: BaseLanguageModel) {
  const template = `You are providing inline code completions in VS Code.

Context (prefix):
{prefix}

Suffix context:
{suffix}

Generate a concise completion (1-3 lines) that:
1. Fits naturally with the prefix
2. Is syntactically valid
3. Maintains code style consistency
4. Completes the current thought

Respond with ONLY the completion text, no explanations.`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}

/**
 * Create a quick fix chain for error corrections
 */
export function createQuickFixChain(llm: BaseLanguageModel) {
  const template = `Provide a quick fix for the following error:

Error: {error}
Line: {line}
Code Context:
{context}

Suggested Fix:
{suggestion}

Explain:
1. What caused the error
2. Why this fix works
3. Any potential side effects
4. Alternative solutions if applicable`;

  const prompt = PromptTemplate.fromTemplate(template);

  return prompt.pipe(llm);
}
