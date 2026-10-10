import { throwIfAborted } from '@/application/services/cancellation';
import { ToolInputValidationError } from '@/application/ports/ToolExecutorPort';
import type {
	PreparedToolExecution,
	ToolExecutionOptions,
	ToolExecutionRequest,
	ToolExecutionResult,
	ToolExecutorPort,
} from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import { z } from 'zod';
import type { LocalTool } from './LocalTool';

export class LocalToolRegistry implements ToolExecutorPort {
	private readonly toolsByName: ReadonlyMap<string, LocalTool>;
	private readonly modelDefinitions: ToolDefinition[];

	constructor(tools: readonly LocalTool[]) {
		const toolsByName = new Map<string, LocalTool>();

		for (const tool of tools) {
			if (toolsByName.has(tool.name)) {
				throw new Error(`Duplicate local tool: ${tool.name}`);
			}

			toolsByName.set(tool.name, tool);
		}

		this.toolsByName = toolsByName;
		this.modelDefinitions = tools.map(toToolDefinition);
	}

	listTools(): ToolDefinition[] {
		// Copy nested schemas too; model callers cannot mutate cached descriptions.
		return structuredClone(this.modelDefinitions);
	}

	prepare(request: ToolExecutionRequest): PreparedToolExecution {
		const tool = this.getTool(request.toolName);

		try {
			return tool.prepare(request.toolInput);
		} catch (caughtError) {
			if (caughtError instanceof z.ZodError) {
				throw new ToolInputValidationError(tool.name, z.prettifyError(caughtError));
			}

			throw caughtError;
		}
	}

	async execute(
		request: ToolExecutionRequest,
		options: ToolExecutionOptions = {},
	): Promise<ToolExecutionResult> {
		throwIfAborted(options.signal);
		const prepared = this.prepare(request);
		return prepared.execute(options);
	}

	private getTool(toolName: string): LocalTool {
		const tool = this.toolsByName.get(toolName);

		if (tool === undefined) {
			throw new Error(`Unknown tool requested by model: ${toolName}`);
		}

		return tool;
	}
}

const toToolDefinition = (tool: LocalTool): ToolDefinition => {
	const { $schema: _, ...parameters } = z.toJSONSchema(tool.inputSchema);

	if (parameters['type'] === 'object' && parameters['required'] === undefined) {
		parameters['required'] = [];
	}

	return {
		name: tool.name,
		description: tool.description,
		parameters,
		...(tool.requiresApproval === true ? { requiresApproval: true } : {}),
		...(tool.deduplicate === true ? { deduplicate: true } : {}),
		...(tool.invalidatesWorkspaceCache === true ? { invalidatesWorkspaceCache: true } : {}),
	};
};
