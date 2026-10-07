import type { ToolExecutionOptions } from '@/application/ports/ToolExecutorPort';
import { z } from 'zod';

export type LocalToolOptions<InputSchema extends z.ZodType> = {
	name: string;
	description: string;
	requiresApproval?: boolean;
	deduplicate?: boolean;
	invalidatesWorkspaceCache?: boolean;
	inputSchema: InputSchema;
	execute(input: z.output<InputSchema>, options: ToolExecutionOptions): Promise<unknown>;
};

export type LocalTool = {
	name: string;
	description: string;
	requiresApproval?: boolean;
	deduplicate?: boolean;
	invalidatesWorkspaceCache?: boolean;
	inputSchema: z.ZodType;
	parse(input: unknown): unknown;
	execute(input: unknown, options: ToolExecutionOptions): Promise<unknown>;
};

export const defineLocalTool = <InputSchema extends z.ZodType>(
	options: LocalToolOptions<InputSchema>,
): LocalTool => ({
	...options,
	parse: (input) => options.inputSchema.parse(input),
	execute: async (input, executionOptions) =>
		options.execute(input as z.output<InputSchema>, executionOptions),
});
