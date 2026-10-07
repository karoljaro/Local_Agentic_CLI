import type {
	ToolExecutorPort,
	ToolExecutionOptions,
	ToolExecutionRequest,
	ToolExecutionResult,
} from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';

type RecordingToolExecutorHandler = (
	request: ToolExecutionRequest,
	requests: readonly ToolExecutionRequest[],
	options: ToolExecutionOptions,
) => Promise<ToolExecutionResult> | ToolExecutionResult;

type RecordingToolExecutorPrepare = (request: ToolExecutionRequest) => ToolExecutionRequest;

export class RecordingToolExecutor implements ToolExecutorPort {
	readonly receivedOptions: ToolExecutionOptions[] = [];
	readonly receivedRequests: ToolExecutionRequest[] = [];

	constructor(
		private readonly tools: ToolDefinition[],
		private readonly handler: RecordingToolExecutorHandler,
		private readonly prepareRequest: RecordingToolExecutorPrepare = (request) => request,
	) {}

	listTools(): ToolDefinition[] {
		return this.tools;
	}

	prepare(request: ToolExecutionRequest): ToolExecutionRequest {
		return this.prepareRequest(request);
	}

	async execute(
		request: ToolExecutionRequest,
		options: ToolExecutionOptions = {},
	): Promise<ToolExecutionResult> {
		this.receivedRequests.push(request);
		this.receivedOptions.push(options);

		return await this.handler(request, this.receivedRequests, options);
	}
}
