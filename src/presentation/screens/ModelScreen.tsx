import { Text, useWindowSize } from 'ink';

import type { ListedModel } from '@/application/ports/ModelCatalogPort';
import { SelectionScreen } from '../components/SelectionScreen';
import type { ModelSelectionState } from '../types';

type ModelScreenProps = {
	currentModelName: string;
	onCancel: () => void;
	onSelect: (model: ListedModel) => void;
	selection: ModelSelectionState;
};

export const ModelScreen = ({
	currentModelName,
	onCancel,
	onSelect,
	selection,
}: ModelScreenProps) => (
	<SelectionScreen
		canCancel
		emptyMessage="No local Ollama models found."
		error={selection.error}
		filterPlaceholder="Filter models…"
		getKey={(model) => model.name}
		getSearchText={(model) =>
			[model.name, model.parameterSize, model.quantizationLevel].filter(Boolean).join(' ')
		}
		items={selection.items}
		onCancel={onCancel}
		onSelect={onSelect}
		renderItem={(model, selected) => (
			<>
				<Text bold>{` ${model.name}`}</Text>
				{model.name === currentModelName ? (
					<Text {...(selected ? { dimColor: true } : { color: 'green' })}> · current</Text>
				) : null}
				<ModelDetails model={model} selected={selected} />
			</>
		)}
		status={selection.status}
		title="Select model"
	/>
);

const ModelDetails = ({ model, selected }: { model: ListedModel; selected: boolean }) => {
	const { columns } = useWindowSize();
	const details = [model.parameterSize, model.quantizationLevel].filter(
		(value): value is string => value !== undefined,
	);
	return details.length === 0 ? null : (
		<Text {...(selected ? { dimColor: true } : { color: 'gray' })}>
			{columns < 40 ? `\n    ${details.join(' · ')}` : ` · ${details.join(', ')}`}
		</Text>
	);
};
