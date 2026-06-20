import type {
	ModelChatInput,
	ModelPort,
	ModelStreamChunk,
} from '@/application/ports/ModelPort';
import {
	toModelStreamChunk,
	toOllamaMessage,
	toOllamaTool,
	type OllamaChatStreamResponse,
} from './mappers/OllamaChatMapper';

export class OllamaModelAdapter implements ModelPort {
	private readonly baseUrl: string;
	private readonly modelName: string;

	constructor(
		baseUrl: string = 'http://localhost:11434',
		modelName: string = 'gemma4:12b-it-qat'
	) {
		const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
		const normalizedModelName = modelName.trim();

		if (normalizedBaseUrl.length === 0) {
			throw new Error('Ollama base URL cannot be empty.');
		}

		if (normalizedModelName.length === 0) {
			throw new Error('Ollama model name cannot be empty.');
		}

		this.baseUrl = normalizedBaseUrl;
		this.modelName = normalizedModelName;
	}

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		const response = await fetch(`${this.baseUrl}/api/chat`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.modelName,
				messages: input.messages.map(toOllamaMessage),
				...(input.tools === undefined || input.tools.length === 0
					? {}
					: { tools: input.tools.map(toOllamaTool) }),
				stream: true,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Ollama request failed with status ${response.status}: ${await readBoundedResponseText(response)}`
			);
		}

		if (response.body === null) {
			throw new Error('Ollama response did not include a stream body.');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

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
					const chunk = parseOllamaStreamChunk(line);

					if (chunk !== undefined) {
						yield chunk;
					}
				}
			}

			buffer += decoder.decode();

			const finalChunk = parseOllamaStreamChunk(buffer);

			if (finalChunk !== undefined) {
				yield finalChunk;
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
}

const readBoundedResponseText = async (response: Response): Promise<string> => {
	try {
		const text = await response.text();

		return text.length <= 1000 ? text : `${text.slice(0, 1000)}...`;
	} catch (caughtError) {
		return caughtError instanceof Error ? caughtError.message : String(caughtError);
	}
};

const parseOllamaStreamChunk = (
	line: string,
): ModelStreamChunk | undefined => {
	const trimmedLine = line.trim();

	if (trimmedLine.length === 0) {
		return undefined;
	}

	let response: OllamaChatStreamResponse;

	try {
		response = JSON.parse(trimmedLine) as OllamaChatStreamResponse;
	} catch (caughtError) {
		const message =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		throw new Error(`Invalid Ollama stream JSON: ${message}`);
	}

	if (response.error !== undefined) {
		throw new Error(`Ollama stream failed: ${response.error}`);
	}

	const chunk = toModelStreamChunk(response);

	return chunk.contentDelta.length > 0 || chunk.toolCalls !== undefined
		? chunk
		: undefined;
};
