import type { ModelChatInput, ModelPort, ModelStreamChunk } from '@/application/ports/ModelPort';

type ScriptedModelInterruptedResponse = {
	chunks: ModelStreamChunk[];
	error: Error;
};

type ScriptedModelResponse = ModelStreamChunk[] | Error | ScriptedModelInterruptedResponse;

export class ScriptedModel implements ModelPort {
	readonly receivedInputs: ModelChatInput[] = [];
	private nextResponseIndex = 0;

	constructor(private readonly responses: ScriptedModelResponse[]) {}

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		this.receivedInputs.push(input);

		const response = this.responses[this.nextResponseIndex];
		this.nextResponseIndex += 1;

		if (response === undefined) {
			throw new Error('ScriptedModel has no response for this call.');
		}

		if (response instanceof Error) {
			throw response;
		}

		const chunks = Array.isArray(response) ? response : response.chunks;

		for (const chunk of chunks) {
			yield chunk;
		}

		if (!Array.isArray(response)) {
			throw response.error;
		}
	}
}
