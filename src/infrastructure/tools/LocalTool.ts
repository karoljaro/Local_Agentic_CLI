import type {
	PreparedToolExecution,
	ToolExecutionOptions,
} from '@/application/ports/ToolExecutorPort';
import { throwIfAborted } from '@/application/services/cancellation';
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
	readonly name: string;
	readonly description: string;
	readonly requiresApproval?: boolean;
	readonly deduplicate?: boolean;
	readonly invalidatesWorkspaceCache?: boolean;
	readonly inputSchema: z.ZodType;
	readonly prepare: (input: unknown) => PreparedToolExecution;
};

export const defineLocalTool = <InputSchema extends z.ZodType>(
	options: LocalToolOptions<InputSchema>,
): LocalTool => {
	const { execute, inputSchema, ...definition } = options;
	return {
		...definition,
		inputSchema,
		prepare: (input) => {
			const parsedInput = inputSchema.parse(input);
			return {
				toolName: definition.name,
				toolInput: parsedInput,
				requiresApproval: definition.requiresApproval === true,
				deduplicate: definition.deduplicate === true,
				invalidatesWorkspaceCache: definition.invalidatesWorkspaceCache === true,
				execute: async (executionOptions = {}) => {
					throwIfAborted(executionOptions.signal);
					return {
						toolName: definition.name,
						output: await execute(parsedInput, executionOptions),
					};
				},
			};
		},
	};
};
