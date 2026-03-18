/**
 * LangChain chain definitions for Klyr.
 * Defines reusable chains for different types of operations.
 */
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
/**
 * Create an edit chain for code modifications
 */
export declare function createEditChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"You are Klyr, a PRECISION code editor integrated into VS Code.\n\nCRITICAL INSTRUCTIONS:\n1. NEVER replace entire files - only edit specific sections\n2. Preserve ALL original content not explicitly being changed\n3. Maintain exact indentation, formatting, and line breaks\n4. Return ONLY the proposed content for the edited section\n\nUser Request: {userRequest}\n\nOriginal Content:\n{originalContent}\n\nAvailable Tools:\n{availableTools}\n\nProvide the updated content that incorporates the requested changes while preserving everything else.">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create a chat context chain for Q&A
 */
export declare function createChatChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"You are Klyr, an intelligent code assistant in VS Code.\n\nContext from workspace:\n{context}\n\nUser question: {question}\n\nAvailable tools for deeper analysis:\n{availableTools}\n\nProvide a helpful, concise answer. If code examples would help, include them.">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create a tool selection chain
 */
export declare function createToolSelectionChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"You are selecting the best tools for a user request.\n\nAvailable tools:\n{availableTools}\n\nUser request: {userRequest}\n\nSelect the most relevant tools (by name) to help fulfill this request, in order of importance.\nRespond with a JSON array of tool names only, e.g.: [\"tool1\", \"tool2\"]">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create a validation chain for checking generated code
 */
export declare function createValidationChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"Validate the following code change:\n\nOriginal:\n{original}\n\nProposed:\n{proposed}\n\nCheck for:\n1. Syntax errors\n2. Logic errors\n3. Content loss or corruption\n4. Breaking changes\n5. Performance issues\n\nRespond with a JSON object:\n{{\"valid\": boolean, \"issues\": [\"issue1\", \"issue2\"], \"confidence\": 0.0-1.0}}">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create a refactoring chain for intelligent code improvement
 */
export declare function createRefactoringChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"Improve the following code for better quality, readability, and performance:\n\nCode:\n{code}\n\nGuidelines:\n1. Follow best practices for {language}\n2. Improve variable naming if unclear\n3. Simplify complex logic where possible\n4. Add comments for non-obvious sections\n5. Suggest type definitions if applicable\n\nProvide the improved version with a brief explanation of changes.">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create a test generation chain
 */
export declare function createTestChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"Generate comprehensive unit tests for the following code:\n\nCode:\n{code}\n\nLanguage: {language}\nTesting Framework: {framework}\n\nRequirements:\n1. Test normal cases and edge cases\n2. Test error conditions\n3. Achieve high code coverage\n4. Use clear test descriptions\n5. Follow {framework} conventions\n\nProvide the test code and a brief explanation of test coverage.">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create a documentation chain
 */
export declare function createDocumentationChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"Generate {docStyle} documentation for the following code:\n\nCode:\n{code}\n\nAdd documentation for:\n1. Function/class purpose and behavior\n2. Parameter descriptions and types\n3. Return value description\n4. Exceptions/errors that may be thrown\n5. Usage examples where helpful\n\nFollow {docStyle} conventions strictly.">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create an analysis chain for code review
 */
export declare function createAnalysisChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"Analyze the following code for potential issues:\n\nCode:\n{code}\n\nCheck for:\n1. Code smells and anti-patterns\n2. Performance problems\n3. Security vulnerabilities\n4. Maintainability issues\n5. Type safety problems (if applicable)\n\nProvide a JSON response:\n{{\n  \"issues\": [\n    {{\"line\": number, \"severity\": \"critical|warning|info\", \"description\": \"...\", \"suggestion\": \"...\"}}\n  ],\n  \"summary\": \"...\",\n  \"overallQuality\": 0.0-1.0\n}}">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create an inline completion chain for ghost text suggestions
 */
export declare function createInlineCompletionChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"You are providing inline code completions in VS Code.\n\nContext (prefix):\n{prefix}\n\nSuffix context:\n{suffix}\n\nGenerate a concise completion (1-3 lines) that:\n1. Fits naturally with the prefix\n2. Is syntactically valid\n3. Maintains code style consistency\n4. Completes the current thought\n\nRespond with ONLY the completion text, no explanations.">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
/**
 * Create a quick fix chain for error corrections
 */
export declare function createQuickFixChain(llm: BaseLanguageModel): import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).Runnable<import("@langchain/core/prompts").ParamsFromFString<"Provide a quick fix for the following error:\n\nError: {error}\nLine: {line}\nCode Context:\n{context}\n\nSuggested Fix:\n{suggestion}\n\nExplain:\n1. What caused the error\n2. Why this fix works\n3. Any potential side effects\n4. Alternative solutions if applicable">, any, import("../../node_modules/@langchain/core/dist/runnables/index.js", { with: { "resolution-mode": "import" } }).RunnableConfig<Record<string, any>>>;
