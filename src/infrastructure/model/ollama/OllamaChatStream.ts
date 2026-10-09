import type { ModelStreamChunk } from '@/application/ports/ModelPort';
import {
	toModelStreamChunk,
	type OllamaChatStreamResponse,
} from '@/infrastructure/model/mappers/OllamaChatMapper';
import { modelStreamError } from './OllamaModelError';

type ParsedOllamaStreamFrame = {
	done: boolean;
	chunk?: ModelStreamChunk;
};

export async function* readOllamaChatStream(
	body: ReadableStream<Uint8Array> | null,
	modelName?: string,
): AsyncIterable<ModelStreamChunk> {
	if (body === null) {
		throw new Error('Ollama response did not include a stream body.');
	}

	const reader = body.getReader();
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
				const frame = parseOllamaStreamFrame(line, modelName);

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

		const finalFrame = parseOllamaStreamFrame(buffer, modelName);

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

const parseOllamaStreamFrame = (
	line: string,
	modelName?: string,
): ParsedOllamaStreamFrame | undefined => {
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
		throw modelStreamError(response.error, modelName);
	}

	const chunk = toModelStreamChunk(response);
	const hasChunk =
		chunk.contentDelta.length > 0 ||
		chunk.toolCalls !== undefined ||
		chunk.finishReason !== undefined ||
		chunk.usage !== undefined;

	return {
		done: response.done === true,
		...(hasChunk ? { chunk } : {}),
	};
};
