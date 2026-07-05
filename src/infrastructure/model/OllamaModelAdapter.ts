import type {
	ModelChatInput,
	ModelMemoryPort,
	ModelPort,
	ModelStreamChunk,
	UnloadModelInput,
} from '@/application/ports/ModelPort';
import {
	toModelStreamChunk,
	toOllamaMessage,
	toOllamaTool,
	type OllamaChatStreamResponse,
} from './mappers/OllamaChatMapper';

type ParsedOllamaStreamFrame = {
	done: boolean;
	chunk?: ModelStreamChunk;
};

type OllamaKeepAlive = number | string;

export class OllamaModelAdapter implements ModelPort, ModelMemoryPort {
	private readonly baseUrl: string;
	private readonly modelName: string;
	private readonly keepAlive: OllamaKeepAlive | undefined;

	constructor(
		baseUrl: string = 'http://localhost:11434',
		modelName: string = 'gemma4:12b-it-qat',
		keepAlive?: string | undefined,
	) {
		const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
		const normalizedModelName = modelName.trim();
		const normalizedKeepAlive = normalizeKeepAlive(keepAlive);

		if (normalizedBaseUrl.length === 0) {
			throw new Error('Ollama base URL cannot be empty.');
		}

		if (normalizedModelName.length === 0) {
			throw new Error('Ollama model name cannot be empty.');
		}

		this.baseUrl = normalizedBaseUrl;
		this.modelName = normalizedModelName;
		this.keepAlive = normalizedKeepAlive;
	}

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		const response = await fetch(`${this.baseUrl}/api/chat`, {
			method: 'POST',
			...(input.signal === undefined ? {} : { signal: input.signal }),
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.modelName,
				messages: input.messages.map(toOllamaMessage),
				...(this.keepAlive === undefined ? {} : { keep_alive: this.keepAlive }),
				...(input.tools === undefined || input.tools.length === 0
					? {}
					: { tools: input.tools.map(toOllamaTool) }),
				stream: true,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Ollama request failed with status ${response.status}: ${await readBoundedResponseText(response)}`,
			);
		}

		if (response.body === null) {
			throw new Error('Ollama response did not include a stream body.');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let isComplete = false;

		try {
			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const frame = parseOllamaStreamFrame(line);

					if (frame === undefined) {
						continue;
					}

					isComplete ||= frame.done;

					if (frame.chunk !== undefined) {
						yield frame.chunk;
					}
				}
			}

			buffer += decoder.decode();

			const finalFrame = parseOllamaStreamFrame(buffer);

			if (finalFrame !== undefined) {
				isComplete ||= finalFrame.done;

				if (finalFrame.chunk !== undefined) {
					yield finalFrame.chunk;
				}
			}

			if (!isComplete) {
				throw new Error('Ollama stream ended before completion.');
			}
		} finally {
			try {
				await reader.cancel();
			} catch {
				// Preserve the stream or consumer error.
			}

			reader.releaseLock();
		}
	}

	async unload(input: UnloadModelInput = {}): Promise<void> {
		const response = await fetch(`${this.baseUrl}/api/chat`, {
			method: 'POST',
			...(input.signal === undefined ? {} : { signal: input.signal }),
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.modelName,
				messages: [],
				keep_alive: 0,
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Ollama model unload failed with status ${response.status}: ${await readBoundedResponseText(response)}`,
			);
		}

		await response.text();
	}
}

const normalizeKeepAlive = (keepAlive: string | undefined): OllamaKeepAlive | undefined => {
	const normalizedKeepAlive = keepAlive?.trim();

	if (normalizedKeepAlive === undefined || normalizedKeepAlive.length === 0) {
		return undefined;
	}

	if (/^-?\d+$/.test(normalizedKeepAlive)) {
		return Number(normalizedKeepAlive);
	}

	return normalizedKeepAlive;
};

const readBoundedResponseText = async (response: Response): Promise<string> => {
	try {
		const text = await response.text();

		return text.length <= 1000 ? text : `${text.slice(0, 1000)}...`;
	} catch (caughtError) {
		return caughtError instanceof Error ? caughtError.message : String(caughtError);
	}
};

const parseOllamaStreamFrame = (line: string): ParsedOllamaStreamFrame | undefined => {
	const trimmedLine = line.trim();

	if (trimmedLine.length === 0) {
		return undefined;
	}

	let response: OllamaChatStreamResponse;

	try {
		response = JSON.parse(trimmedLine) as OllamaChatStreamResponse;
	} catch (caughtError) {
		const message = caughtError instanceof Error ? caughtError.message : String(caughtError);

		throw new Error(`Invalid Ollama stream JSON: ${message}`);
	}

	if (response.error !== undefined) {
		throw new Error(`Ollama stream failed: ${response.error}`);
	}

	const chunk = toModelStreamChunk(response);
	const hasChunk = chunk.contentDelta.length > 0 || chunk.toolCalls !== undefined;

	return {
		done: response.done === true,
		...(hasChunk ? { chunk } : {}),
	};
};
