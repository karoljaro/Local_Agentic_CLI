export const collectAsyncIterable = async <T>(stream: AsyncIterable<T>): Promise<T[]> => {
	const items: T[] = [];

	for await (const item of stream) {
		items.push(item);
	}

	return items;
};
