import type { CommandStep } from './coder';
export interface CommandResult {
    command: string;
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    error?: string;
}
export interface CommandExecutorOptions {
    onOutput?: (command: string, line: string) => void;
    onComplete?: (result: CommandResult) => void;
}
export declare class CommandExecutor {
    private readonly options;
    constructor(options?: CommandExecutorOptions);
    execute(command: CommandStep, cwd: string): Promise<CommandResult>;
    executeAll(commands: CommandStep[], cwd: string): Promise<CommandResult[]>;
}
export declare function parseInlineCommands(text: string): CommandStep[];
