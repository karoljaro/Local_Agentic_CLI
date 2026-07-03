import { useEffect, useState } from 'react';

import type { ListedModel } from '@/application/ports/ModelCatalogPort';
import type { Runtime } from '@/composition/createRuntime';
import type { UiStatus } from '@/presentation/chat/types';
import { useSelectableList } from './useSelectableList';

type UseModelPickerInput = {
	onSelectModel: (modelName: string) => void;
	runtime: Runtime;
};

export const useModelPicker = ({ onSelectModel, runtime }: UseModelPickerInput) => {
	const [models, setModels] = useState<ListedModel[]>([]);
	const [status, setStatus] = useState<UiStatus>('loading');
	const [errorMessage, setErrorMessage] = useState<string | undefined>();

	const list = useSelectableList({
		isActive: status === 'idle' && models.length > 0,
		items: models,
		onSelect: (model) => {
			onSelectModel(model.name);
		},
	});

	useEffect(() => {
		let isCancelled = false;

		const loadModels = async (): Promise<void> => {
			setStatus('loading');
			setErrorMessage(undefined);

			try {
				const result = await runtime.listModels();

				if (!isCancelled) {
					setModels(result.models);
				}
			} catch (caughtError) {
				const error = caughtError instanceof Error ? caughtError : new Error(String(caughtError));

				if (!isCancelled) {
					setModels([]);
					setErrorMessage(error.message);
				}
			} finally {
				if (!isCancelled) {
					setStatus('idle');
				}
			}
		};

		void loadModels();

		return () => {
			isCancelled = true;
		};
	}, [runtime]);

	return {
		errorMessage,
		models,
		selectedIndex: list.selectedIndex,
		status,
	};
};
