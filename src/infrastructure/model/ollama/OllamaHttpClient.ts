import { normalizeOllamaBaseUrl } from './OllamaConfig';
import { readBoundedResponseText } from './readBoundedResponseText';

type PostJsonInput = {
	body: unknown;
	errorPrefix: string;
	path: string;
	signal?: AbortSignal | undefined;
};

type GetInput = {
	errorPrefix: string;
	path: string;
	signal?: AbortSignal | undefined;
};

export class OllamaHttpClient {
	private readonly baseUrl: string;

	constructor(baseUrl: string = 'http://localhost:11434') {
		this.baseUrl = normalizeOllamaBaseUrl(baseUrl);
	}

	async postJson({ body, errorPrefix, path, signal }: PostJsonInput): Promise<Response> {
		const response = await fetch(`${this.baseUrl}${path}`, {
			method: 'POST',
			...(signal === undefined ? {} : { signal }),
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(
				`${errorPrefix} with status ${response.status}: ${await readBoundedResponseText(response)}`,
			);
		}

		return response;
	}

	async getText({ errorPrefix, path, signal }: GetInput): Promise<string> {
		const response = await fetch(`${this.baseUrl}${path}`, {
			...(signal === undefined ? {} : { signal }),
		});

		if (!response.ok) {
			throw new Error(
				`${errorPrefix} with status ${response.status}: ${await readBoundedResponseText(response)}`,
			);
		}

		return response.text();
	}
}
