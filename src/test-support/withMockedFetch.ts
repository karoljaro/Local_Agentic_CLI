type FetchMock = (
	input: Parameters<typeof fetch>[0],
	init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export const withMockedFetch = async <T>(
	fetchMock: FetchMock,
	run: () => Promise<T>,
): Promise<T> => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = fetchMock as typeof fetch;

	try {
		return await run();
	} finally {
		globalThis.fetch = originalFetch;
	}
};
