import type { EmbeddingPort } from '@/application/ports/EmbeddingPort';
import { throwIfAborted } from '@/application/services/cancellation';
import { normalizeVector } from '@/application/services/ExactVectorSearch';
import { normalizeOllamaBaseUrl, normalizeOllamaModelName } from './ollama/OllamaConfig';
import { OllamaHttpClient } from './ollama/OllamaHttpClient';

export class OllamaEmbeddingAdapter implements EmbeddingPort {
	readonly modelIdentity: string;
	private readonly model: string;
	private readonly http: OllamaHttpClient;

	constructor(baseUrl: string, model: string) {
		this.model = normalizeOllamaModelName(model);
		const endpoint = normalizeOllamaBaseUrl(baseUrl);
		this.modelIdentity = JSON.stringify(['ollama', endpoint, this.model]);
		this.http = new OllamaHttpClient(endpoint);
	}

	async embed(texts: readonly string[], signal?: AbortSignal): Promise<Float32Array[]> {
		throwIfAborted(signal);
		if (texts.length === 0 || texts.length > 32)
			throw new Error('Embedding batch must contain 1–32 texts.');
		const response = await this.http.postJson({
			path: '/api/embed',
			body: { model: this.model, input: texts, truncate: false },
			errorPrefix: 'Ollama embedding request failed',
			signal,
		});
		const body: unknown = await response.json();
		throwIfAborted(signal);
		if (
			typeof body !== 'object' ||
			body === null ||
			!('model' in body) ||
			body.model !== this.model ||
			!('embeddings' in body) ||
			!Array.isArray(body.embeddings) ||
			body.embeddings.length !== texts.length
		)
			throw new Error('Invalid Ollama embedding response.');
		const vectors = body.embeddings.map((values: unknown) => {
			if (
				!Array.isArray(values) ||
				values.length === 0 ||
				values.some((value) => typeof value !== 'number' || !Number.isFinite(value))
			)
				throw new Error('Invalid Ollama embedding vector.');
			return normalizeVector(Float32Array.from(values));
		});
		if (vectors.some((vector) => vector.length !== vectors[0]!.length))
			throw new Error('Inconsistent Ollama embedding dimensions.');
		return vectors;
	}
}
