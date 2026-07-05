const MAX_ERROR_BODY_LENGTH = 1000;

export const readBoundedResponseText = async (response: Response): Promise<string> => {
	try {
		const text = await response.text();

		return text.length <= MAX_ERROR_BODY_LENGTH
			? text
			: `${text.slice(0, MAX_ERROR_BODY_LENGTH)}...`;
	} catch (caughtError) {
		return caughtError instanceof Error ? caughtError.message : String(caughtError);
	}
};
