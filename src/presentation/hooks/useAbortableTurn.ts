import { useCallback, useEffect, useRef } from 'react';

export type ActiveTurnSignal = {
	signal: AbortSignal;
	clear: () => void;
};

export const useAbortableTurn = () => {
	const controllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			controllerRef.current?.abort();
			controllerRef.current = null;
		};
	}, []);

	const start = useCallback((): ActiveTurnSignal => {
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
