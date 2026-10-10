import type { ToolDefinition } from '@/domain/Tool';

export type ToolExecutionRequest = {
	toolName: string;
	toolInput: unknown;
};

export type ToolExecutionResult = {
	toolName: string;
	output: unknown;
};

export type ToolExecutionOptions = {
	signal?: AbortSignal;
};

// Only schema failures are correctable model input; arbitrary preparation errors stay terminal.
export class ToolInputValidationError extends Error {
	constructor(toolName: string, reason: string) {
		super(`Invalid arguments for tool ${toolName}: ${reason}`);
		this.name = 'ToolInputValidationError';
	}
}

// Runtime-only: persist the normalized call projection, never this bound execution.
export type PreparedToolExecution = {
	readonly toolName: string;
	readonly toolInput: unknown;
	readonly requiresApproval: boolean;
	readonly deduplicate: boolean;
	readonly invalidatesWorkspaceCache: boolean;
	readonly execute: (options?: ToolExecutionOptions) => Promise<ToolExecutionResult>;
};

export interface ToolExecutorPort {
	listTools(): ToolDefinition[];
	prepare(request: ToolExecutionRequest): PreparedToolExecution;
	execute(
		request: ToolExecutionRequest,
		options?: ToolExecutionOptions,
	): Promise<ToolExecutionResult>;
}
