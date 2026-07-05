import { useCallback, useEffect, useRef } from 'react';

export type ActiveRequestSignal = {
	signal: AbortSignal;
	clear: () => void;
};

export const useAbortableRequest = () => {
	const controllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			controllerRef.current?.abort();
			controllerRef.current = null;
		};
	}, []);

	const start = useCallback((): ActiveRequestSignal => {
		controllerRef.current?.abort();

		const controller = new AbortController();
		controllerRef.current = controller;

		return {
			signal: controller.signal,
			clear: () => {
				if (controllerRef.current === controller) {
					controllerRef.current = null;
				}
			},
		};
	}, []);

	const abort = useCallback((): void => {
		controllerRef.current?.abort();
		controllerRef.current = null;
	}, []);

	return { start, abort };
};
