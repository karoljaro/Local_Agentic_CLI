import type {
	ModelChatInput,
	ModelMemoryPort,
	ModelPort,
	ModelStreamChunk,
	UnloadModelInput,
} from '@/application/ports/ModelPort';
import type { ModelActivationPort } from '@/application/ports/ModelActivationPort';
import { validateModelContextProfile } from '@/domain/ModelContextProfile';
import { OllamaHttpClient } from './ollama/OllamaHttpClient';
import {
	normalizeOllamaKeepAlive,
	normalizeOllamaModelName,
	type OllamaKeepAlive,
} from './ollama/OllamaConfig';
import { readOllamaChatStream } from './ollama/OllamaChatStream';
import { isOllamaModelNotFound, mapOllamaModelError } from './ollama/OllamaModelError';
import { toOllamaMessage, toOllamaTool } from './mappers/OllamaChatMapper';

export class OllamaModelAdapter implements ModelPort, ModelMemoryPort, ModelActivationPort {
	private readonly client: OllamaHttpClient;
	private readonly modelName: string;
	private readonly keepAlive: OllamaKeepAlive | undefined;

	constructor(baseUrl: string, modelName: string, keepAlive?: string | undefined) {
		this.client = new OllamaHttpClient(baseUrl);
		this.modelName = normalizeOllamaModelName(modelName);
		this.keepAlive = normalizeOllamaKeepAlive(keepAlive);
	}

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		validateModelContextProfile(input.contextProfile);
		try {
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
					...(input.responseSchema === undefined ? {} : { format: input.responseSchema }),
					options: {
						num_ctx: input.contextProfile.contextWindowTokens,
						num_predict: input.contextProfile.maxOutputTokens,
					},
					// Compiler owns history selection; request errors instead of silent provider trimming.
					truncate: false,
					shift: false,
				},
			});

			yield* readOllamaChatStream(
				response.body,
				this.modelName,
				input.responseSchema === undefined ? undefined : 256000,
			);
		} catch (error) {
			throw mapOllamaModelError(error, this.modelName);
		}
	}

	async activate(input: UnloadModelInput = {}): Promise<void> {
		try {
			const response = await this.client.postJson({
				path: '/api/chat',
				errorPrefix: 'Ollama model activation failed',
				signal: input.signal,
				body: {
					model: this.modelName,
					messages: [],
					// Empty messages plus zero retention means unload; load with provider retention.
					// Configured keep-alive still applies to real chat requests.
					stream: false,
				},
			});
			const loaded: unknown = await response.json();
			if (
				typeof loaded !== 'object' ||
				loaded === null ||
				!('model' in loaded) ||
				loaded.model !== this.modelName ||
				!('done' in loaded) ||
				loaded.done !== true ||
				!('done_reason' in loaded) ||
				loaded.done_reason !== 'load'
			) {
				throw new Error('Invalid Ollama model activation response: expected a completed load.');
			}
		} catch (error) {
			throw mapOllamaModelError(error, this.modelName);
		}
	}

	async unload(input: UnloadModelInput = {}): Promise<void> {
		try {
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
		} catch (error) {
			if (isOllamaModelNotFound(error, this.modelName)) return;
			throw error;
		}
	}
}
