const MAX_ERROR_BODY_LENGTH = 1000;

export const readBoundedResponseText = async (response: Response): Promise<string> => {
	try {
		if (response.body === null) {
			return '';
		}

		return await readBoundedStreamText(response.body);
	} catch (caughtError) {
		return caughtError instanceof Error ? caughtError.message : String(caughtError);
	}
};

const readBoundedStreamText = async (body: ReadableStream<Uint8Array>): Promise<string> => {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let text = '';

	try {
		while (text.length <= MAX_ERROR_BODY_LENGTH) {
			const { done, value } = await reader.read();

			if (done) {
				text += decoder.decode();
				return formatBoundedText(text);
			}

			text += decoder.decode(value, { stream: true });
		}

		return formatBoundedText(text);
	} finally {
		try {
			await reader.cancel();
		} catch {
			// Preserve the original read result or read error.
		}

		reader.releaseLock();
	}
};

const formatBoundedText = (text: string): string =>
	text.length <= MAX_ERROR_BODY_LENGTH ? text : `${text.slice(0, MAX_ERROR_BODY_LENGTH)}...`;
