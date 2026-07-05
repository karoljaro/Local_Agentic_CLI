export type OllamaKeepAlive = number | string;

export const normalizeOllamaBaseUrl = (baseUrl: string): string => {
	const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');

	if (normalizedBaseUrl.length === 0) {
		throw new Error('Ollama base URL cannot be empty.');
	}

	return normalizedBaseUrl;
};

export const normalizeOllamaModelName = (modelName: string): string => {
	const normalizedModelName = modelName.trim();

	if (normalizedModelName.length === 0) {
		throw new Error('Ollama model name cannot be empty.');
	}

	return normalizedModelName;
};

export const normalizeOllamaKeepAlive = (
	keepAlive: string | undefined,
): OllamaKeepAlive | undefined => {
	const normalizedKeepAlive = keepAlive?.trim();

	if (normalizedKeepAlive === undefined || normalizedKeepAlive.length === 0) {
		return undefined;
	}

	if (/^-?\d+$/.test(normalizedKeepAlive)) {
		return Number(normalizedKeepAlive);
	}

	return normalizedKeepAlive;
};
