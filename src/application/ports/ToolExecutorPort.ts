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

export interface ToolExecutorPort {
	listTools(): ToolDefinition[];
	prepare(request: ToolExecutionRequest): ToolExecutionRequest;
	execute(
		request: ToolExecutionRequest,
		options?: ToolExecutionOptions,
	): Promise<ToolExecutionResult>;
}
