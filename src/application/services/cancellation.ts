// Normalize cooperative cancellation independently of a caller's arbitrary abort reason.
export const abortError = (): Error => new DOMException('The operation was aborted.', 'AbortError');

export const isAbortError = (error: unknown): boolean =>
	error instanceof Error && error.name === 'AbortError';

export const throwIfAborted = (signal: AbortSignal | undefined): void => {
	if (signal?.aborted) throw abortError();
};
