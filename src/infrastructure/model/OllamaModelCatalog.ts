import type {
	ListedModel,
	ListModelsResult,
	ModelCatalogPort,
} from '@/application/ports/ModelCatalogPort';

export class OllamaModelCatalog implements ModelCatalogPort {
	private readonly baseUrl: string;

	constructor(baseUrl: string = 'http://localhost:11434') {
		const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');

		if (normalizedBaseUrl.length === 0) {
			throw new Error('Ollama base URL cannot be empty.');
		}

		this.baseUrl = normalizedBaseUrl;
	}

	async listModels(): Promise<ListModelsResult> {
		const response = await fetch(`${this.baseUrl}/api/tags`);

		if (!response.ok) {
			throw new Error(
				`Ollama model list failed with status ${response.status}: ${await readBoundedResponseText(response)}`,
			);
		}

		return parseOllamaTagsResponse(await response.text());
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

const readBoundedResponseText = async (response: Response): Promise<string> => {
	try {
		const text = await response.text();

		return text.length <= 1000 ? text : `${text.slice(0, 1000)}...`;
	} catch (caughtError) {
		return caughtError instanceof Error ? caughtError.message : String(caughtError);
	}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
