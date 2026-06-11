import type {
	ModelChatInput,
	ModelChatResult,
	ModelPort,
	ModelStreamChunk,
} from '@/application/ports/ModelPort';
import {
	toModelChatResult,
	toOllamaMessage,
	toOllamaTool,
	type OllamaChatResponse,
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

	async chat(input: ModelChatInput): Promise<ModelChatResult> {
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
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Ollama request failed with status ${response.status}: ${await readBoundedResponseText(response)}`
			);
		}

		const body = (await response.json()) as OllamaChatResponse;

		if (body.error !== undefined) {
			throw new Error(`Ollama chat failed: ${body.error}`);
		}

		return toModelChatResult(body);
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
					const chunk = parseOllamaStreamLine(line);

					if (chunk === null || chunk.done === true) {
						continue;
					}

					if (chunk.error !== undefined) {
						throw new Error(`Ollama stream failed: ${chunk.error}`);
					}

					const contentDelta = chunk.message?.content;

					if (contentDelta !== undefined && contentDelta.length > 0) {
						yield { contentDelta };
					}
				}
			}

			buffer += decoder.decode();

			const finalChunk = parseOllamaStreamLine(buffer);

			if (finalChunk?.done !== true) {
				if (finalChunk?.error !== undefined) {
					throw new Error(`Ollama stream failed: ${finalChunk.error}`);
				}

				const contentDelta = finalChunk?.message?.content;

				if (contentDelta !== undefined && contentDelta.length > 0) {
					yield { contentDelta };
				}
			}
		} finally {
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

const parseOllamaStreamLine = (
	line: string
): OllamaChatStreamResponse | null => {
	const trimmedLine = line.trim();

	if (trimmedLine.length === 0) {
		return null;
	}

	try {
		return JSON.parse(trimmedLine) as OllamaChatStreamResponse;
	} catch (caughtError) {
		const message =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		throw new Error(`Invalid Ollama stream JSON: ${message}`);
	}
};
