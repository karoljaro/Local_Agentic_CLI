import { useEffect, useState } from 'react';

import type { ListedModel } from '@/application/ports/ModelCatalogPort';
import type { Runtime } from '@/composition/createRuntime';
import type { UiStatus } from '@/presentation/chat/types';
import { useSelectableList } from './useSelectableList';

type UseModelPickerInput = {
	onCancel: () => void;
	onSelectModel: (modelName: string) => void;
	runtime: Runtime;
};

export const useModelPicker = ({ onCancel, onSelectModel, runtime }: UseModelPickerInput) => {
	const [models, setModels] = useState<ListedModel[]>([]);
	const [status, setStatus] = useState<UiStatus>('loading');
	const [errorMessage, setErrorMessage] = useState<string | undefined>();

	const list = useSelectableList({
		isActive: true,
		items: models,
		onCancel,
		onSelect: (model) => {
			onSelectModel(model.name);
		},
	});

	useEffect(() => {
		let isCancelled = false;
		const controller = new AbortController();

		const loadModels = async (): Promise<void> => {
			setStatus('loading');
			setErrorMessage(undefined);

			try {
				const result = await runtime.listModels({ signal: controller.signal });

				if (!isCancelled) {
					setModels(result.models);
				}
			} catch (caughtError) {
				if (isCancelled || isAbortError(caughtError)) {
					return;
				}

				const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

				setModels([]);
				setErrorMessage(error.message);
			} finally {
				if (!isCancelled) {
					setStatus('idle');
				}
			}
		};

		void loadModels();

		return () => {
			isCancelled = true;
			controller.abort();
		};
	}, [runtime]);

	return {
		errorMessage,
		models,
		selectedIndex: list.selectedIndex,
		status,
	};
};

const isAbortError = (caughtError: unknown): boolean =>
	caughtError instanceof Error && caughtError.name === 'AbortError';
