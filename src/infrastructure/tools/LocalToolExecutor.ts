import type {
	ToolExecutionRequest,
	ToolExecutionResult,
	ToolExecutorPort,
} from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import { z } from 'zod';
import type { LocalTool } from './LocalTool';

export class LocalToolRegistry implements ToolExecutorPort {
	private readonly toolsByName: ReadonlyMap<string, LocalTool>;

	constructor(private readonly tools: readonly LocalTool[]) {
		const toolsByName = new Map<string, LocalTool>();

		for (const tool of tools) {
			if (toolsByName.has(tool.name)) {
				throw new Error(`Duplicate local tool: ${tool.name}`);
			}

			toolsByName.set(tool.name, tool);
		}

		this.toolsByName = toolsByName;
	}

	listTools(): ToolDefinition[] {
		return this.tools.map((tool) => toToolDefinition(tool));
	}

	prepare(request: ToolExecutionRequest): ToolExecutionRequest {
		const tool = this.getTool(request.toolName);

		try {
			return {
				toolName: tool.name,
				toolInput: tool.parse(request.toolInput),
			};
		} catch (caughtError) {
			if (caughtError instanceof z.ZodError) {
				throw new Error(`Invalid arguments for tool ${tool.name}: ${z.prettifyError(caughtError)}`);
			}

			throw caughtError;
		}
	}

	async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
		const prepared = this.prepare(request);
		const tool = this.getTool(prepared.toolName);

		return {
			toolName: tool.name,
			output: await tool.execute(prepared.toolInput),
		};
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
