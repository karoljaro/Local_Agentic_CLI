import type {
	ListedModel,
	ListModelsOptions,
	ListModelsResult,
	ModelCatalogPort,
} from '@/application/ports/ModelCatalogPort';
import { OllamaHttpClient } from './ollama/OllamaHttpClient';

export class OllamaModelCatalog implements ModelCatalogPort {
	private readonly client: OllamaHttpClient;

	constructor(baseUrl: string = 'http://localhost:11434') {
		this.client = new OllamaHttpClient(baseUrl);
	}

	async listModels(options: ListModelsOptions = {}): Promise<ListModelsResult> {
		const text = await this.client.getText({
			path: '/api/tags',
			errorPrefix: 'Ollama model list failed',
			signal: options.signal,
		});

		return parseOllamaTagsResponse(text);
	}
}

type OllamaTagsResponse = {
	models: unknown[];
};

const parseOllamaTagsResponse = (text: string): ListModelsResult => {
	let response: unknown;

	try {
		response = JSON.parse(text);
	} catch (caughtError) {
		const message = caughtError instanceof Error ? caughtError.message : String(caughtError);

		throw new Error(`Invalid Ollama model list JSON: ${message}`);
	}

	if (!isRecord(response) || !Array.isArray(response['models'])) {
		throw new Error('Invalid Ollama model list response: expected models array.');
	}

	const tagsResponse: OllamaTagsResponse = {
		models: response['models'],
	};

	return {
		models: tagsResponse.models.map(toListedModel),
	};
};

const toListedModel = (value: unknown): ListedModel => {
	if (!isRecord(value)) {
		throw new Error('Invalid Ollama model list response: model entry must be an object.');
	}

	const name = readNonEmptyString(value['name']) ?? readNonEmptyString(value['model']);

	if (name === undefined) {
		throw new Error('Invalid Ollama model list response: model entry is missing name.');
	}

	const details = isRecord(value['details']) ? value['details'] : {};
	const modifiedAt = readNonEmptyString(value['modified_at']);
	const parameterSize = readNonEmptyString(details['parameter_size']);
	const quantizationLevel = readNonEmptyString(details['quantization_level']);
	const sizeBytes = typeof value['size'] === 'number' ? value['size'] : undefined;

	return {
		name,
		...(modifiedAt === undefined ? {} : { modifiedAt }),
		...(parameterSize === undefined ? {} : { parameterSize }),
		...(quantizationLevel === undefined ? {} : { quantizationLevel }),
		...(sizeBytes === undefined ? {} : { sizeBytes }),
	};
};

const readNonEmptyString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();

	return trimmed.length === 0 ? undefined : trimmed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
