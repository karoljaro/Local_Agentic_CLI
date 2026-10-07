import type {
	PreparedToolExecution,
	ToolExecutorPort,
	ToolExecutionOptions,
	ToolExecutionRequest,
	ToolExecutionResult,
} from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import { throwIfAborted } from '@/application/services/cancellation';

type RecordingToolExecutorHandler = (
	request: ToolExecutionRequest,
	requests: readonly ToolExecutionRequest[],
	options: ToolExecutionOptions,
) => Promise<ToolExecutionResult> | ToolExecutionResult;

type RecordingToolExecutorPrepare = (
	request: ToolExecutionRequest,
) => ToolExecutionRequest | PreparedToolExecution;

// Fixtures can normalize a request or delegate to a real prepared registry execution.
// Delegates are invoked directly; they never re-enter a raw executor.

export class RecordingToolExecutor implements ToolExecutorPort {
	readonly receivedOptions: ToolExecutionOptions[] = [];
	readonly receivedRequests: ToolExecutionRequest[] = [];
	readonly preparationRequests: ToolExecutionRequest[] = [];
	readonly preparedExecutions: PreparedToolExecution[] = [];

	constructor(
		private readonly tools: ToolDefinition[],
		private readonly handler: RecordingToolExecutorHandler,
		private readonly prepareRequest: RecordingToolExecutorPrepare = (request) => request,
	) {}

	listTools(): ToolDefinition[] {
		return structuredClone(this.tools);
	}

	prepare(request: ToolExecutionRequest): PreparedToolExecution {
		this.preparationRequests.push(request);
		const tool = this.tools.find((tool) => tool.name === request.toolName);
		if (tool === undefined) throw new Error(`Unknown tool requested by model: ${request.toolName}`);
		const normalized = this.prepareRequest(request);
		const normalizedRequest = { toolName: normalized.toolName, toolInput: normalized.toolInput };
		const prepared: PreparedToolExecution = {
			toolName: normalized.toolName,
			toolInput: normalized.toolInput,
			requiresApproval:
				'execute' in normalized ? normalized.requiresApproval : tool.requiresApproval === true,
			deduplicate: 'execute' in normalized ? normalized.deduplicate : tool.deduplicate === true,
			invalidatesWorkspaceCache:
				'execute' in normalized
					? normalized.invalidatesWorkspaceCache
					: tool.invalidatesWorkspaceCache === true,
			execute: async (options = {}) => {
				throwIfAborted(options.signal);
				this.receivedRequests.push(normalizedRequest);
				this.receivedOptions.push(options);
				return 'execute' in normalized
					? await normalized.execute(options)
					: await this.handler(normalizedRequest, this.receivedRequests, options);
			},
		};
		this.preparedExecutions.push(prepared);
		return prepared;
	}

	async execute(
		request: ToolExecutionRequest,
		options: ToolExecutionOptions = {},
	): Promise<ToolExecutionResult> {
		throwIfAborted(options.signal);
		return await this.prepare(request).execute(options);
	}
}
