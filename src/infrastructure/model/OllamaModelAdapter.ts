import type {
	ModelChatInput,
	ModelMemoryPort,
	ModelPort,
	ModelStreamChunk,
	UnloadModelInput,
} from '@/application/ports/ModelPort';
import { OllamaHttpClient } from './ollama/OllamaHttpClient';
import {
	normalizeOllamaKeepAlive,
	normalizeOllamaModelName,
	type OllamaKeepAlive,
} from './ollama/OllamaConfig';
import { readOllamaChatStream } from './ollama/OllamaChatStream';
import { toOllamaMessage, toOllamaTool } from './mappers/OllamaChatMapper';

export class OllamaModelAdapter implements ModelPort, ModelMemoryPort {
	private readonly client: OllamaHttpClient;
	private readonly modelName: string;
	private readonly keepAlive: OllamaKeepAlive | undefined;

	constructor(
		baseUrl: string = 'http://localhost:11434',
		modelName: string = 'gemma4:12b-it-qat',
		keepAlive?: string | undefined,
	) {
		this.client = new OllamaHttpClient(baseUrl);
		this.modelName = normalizeOllamaModelName(modelName);
		this.keepAlive = normalizeOllamaKeepAlive(keepAlive);
	}

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		const response = await this.client.postJson({
			path: '/api/chat',
			errorPrefix: 'Ollama request failed',
			signal: input.signal,
			body: {
				model: this.modelName,
				messages: input.messages.map(toOllamaMessage),
				...(this.keepAlive === undefined ? {} : { keep_alive: this.keepAlive }),
				...(input.tools === undefined || input.tools.length === 0
					? {}
					: { tools: input.tools.map(toOllamaTool) }),
				stream: true,
			},
		});

		yield* readOllamaChatStream(response.body);
	}

	async unload(input: UnloadModelInput = {}): Promise<void> {
		const response = await this.client.postJson({
			path: '/api/chat',
			errorPrefix: 'Ollama model unload failed',
			signal: input.signal,
			body: {
				model: this.modelName,
				messages: [],
				keep_alive: 0,
				stream: false,
			},
		});

		await response.text();
	}
}
