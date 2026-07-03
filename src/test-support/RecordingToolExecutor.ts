import type {
	ToolExecutorPort,
	ToolExecutionRequest,
	ToolExecutionResult,
} from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';

type RecordingToolExecutorHandler = (
	request: ToolExecutionRequest,
	requests: readonly ToolExecutionRequest[],
) => Promise<ToolExecutionResult> | ToolExecutionResult;

export class RecordingToolExecutor implements ToolExecutorPort {
	readonly receivedRequests: ToolExecutionRequest[] = [];

	constructor(
		private readonly tools: ToolDefinition[],
		private readonly handler: RecordingToolExecutorHandler,
	) {}

	listTools(): ToolDefinition[] {
		return this.tools;
	}

	async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
		this.receivedRequests.push(request);

		return await this.handler(request, this.receivedRequests);
	}
}
