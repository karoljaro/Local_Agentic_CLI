import type {
	ModelChatInput,
	ModelPort,
	ModelStreamChunk,
} from '@/application/ports/ModelPort';

type OllamaChatStreamResponse = {
	message?: {
		content?: string;
	};
	done?: boolean;
};

export class OllamaModelAdapter implements ModelPort {
	constructor(
		private readonly baseUrl: string = 'http://localhost:11434',
		private readonly modelName: string = 'gemma4:12b-it-qat'
	) {}

	async *streamChat(input: ModelChatInput): AsyncIterable<ModelStreamChunk> {
		const response = await fetch(`${this.baseUrl}/api/chat`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.modelName,
				messages: input.messages.map((message) => ({
					role: message.role,
					content: message.content,
				})),
				stream: true,
			}),
		});

		if (!response.ok) {
			throw new Error(
				`Ollama request failed with status ${response.status}: ${await response.text()}`
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

					const contentDelta = chunk.message?.content;

					if (contentDelta !== undefined && contentDelta.length > 0) {
						yield { contentDelta };
					}
				}
			}

			buffer += decoder.decode();

			const finalChunk = parseOllamaStreamLine(buffer);

			if (finalChunk?.done !== true) {
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

const parseOllamaStreamLine = (
	line: string
): OllamaChatStreamResponse | null => {
	const trimmedLine = line.trim();

	if (trimmedLine.length === 0) {
		return null;
	}

	return JSON.parse(trimmedLine) as OllamaChatStreamResponse;
};
