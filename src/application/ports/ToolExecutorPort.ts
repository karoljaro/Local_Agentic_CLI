import type { ToolDefinition } from '@/domain/Tool';

export type ToolExecutionRequest = {
	toolName: string;
	toolInput: unknown;
};

export type ToolExecutionResult = {
	toolName: string;
	output: unknown;
};

export interface ToolExecutorPort {
	listTools(): ToolDefinition[];
	execute(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
}
