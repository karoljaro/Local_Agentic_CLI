import { ModelUseError } from '@/application/services/ModelSelection';
import { OllamaHttpError } from './OllamaHttpClient';

const errorPayload = (error: OllamaHttpError): string | undefined => {
	try {
		const value: unknown = JSON.parse(error.responseText);
		return typeof value === 'object' &&
			value !== null &&
			'error' in value &&
			typeof value.error === 'string'
			? value.error
			: undefined;
	} catch {
		return undefined;
	}
};

const isModelNotFoundMessage = (message: string, modelName: string): boolean =>
	message === 'model not found' ||
	message === `model '${modelName}' not found` ||
	message === `model "${modelName}" not found`;

/** Only the model-specific JSON 404 of a chat operation represents an absent artifact. */
export const isOllamaModelNotFound = (error: unknown, modelName: string): boolean => {
	if (!(error instanceof OllamaHttpError) || error.status !== 404) return false;
	const message = errorPayload(error);
	return message !== undefined && isModelNotFoundMessage(message, modelName);
};

export const mapOllamaModelError = (error: unknown, modelName: string): unknown => {
	if (!(error instanceof OllamaHttpError)) return error;
	const message = errorPayload(error);
	if (isOllamaModelNotFound(error, modelName))
		return new ModelUseError('unavailable', error.message, error);
	if (
		(error.status === 400 || error.status === 500) &&
		message !== undefined &&
		isModelCapabilityFailure(message)
	) {
		return new ModelUseError('unsupported', error.message, error);
	}
	return error;
};

const isModelCapabilityFailure = (message: string): boolean =>
	/does not support (?:chat|tools|generate)|unsupported model (?:architecture|format)|invalid model (?:format|file)|model requires more system memory/i.test(
		message,
	);

export const modelStreamError = (message: string, modelName?: string): Error => {
	const primary = `Ollama stream failed: ${message}`;
	if (modelName !== undefined && isModelNotFoundMessage(message, modelName))
		return new ModelUseError('unavailable', primary);
	if (isModelCapabilityFailure(message)) return new ModelUseError('unsupported', primary);
	return new Error(primary);
};
