export type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
};

export const createDeferred = <T>(): Deferred<T> => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});

	return { promise, resolve };
};
