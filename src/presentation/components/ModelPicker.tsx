import { Box, Text } from 'ink';

import type { ListedModel } from '@/application/ports/ModelCatalogPort';

type ModelPickerProps = {
	currentModelName: string;
	errorMessage?: string | undefined;
	models: ListedModel[];
	selectedIndex: number;
};

export const ModelPicker = ({
	currentModelName,
	errorMessage,
	models,
	selectedIndex,
}: ModelPickerProps) => {
	return (
		<Box flexDirection="column" gap={1}>
			<PickerHeader title="Select model" />

			<Box flexDirection="column">
				{models.map((model, index) => (
					<ModelPickerRow
						currentModelName={currentModelName}
						isSelected={index === selectedIndex}
						key={model.name}
						model={model}
					/>
				))}
			</Box>

			{models.length === 0 ? <Text color="gray">No local Ollama models found.</Text> : null}
			{errorMessage === undefined ? null : <Text color="red">{errorMessage}</Text>}
		</Box>
	);
};

type PickerHeaderProps = {
	title: string;
};

const PickerHeader = ({ title }: PickerHeaderProps) => {
	return (
		<Box justifyContent="space-between">
			<Text bold>{title}</Text>
			<Text color="gray">↑/↓ or j/k · Enter</Text>
		</Box>
	);
};

type ModelPickerRowProps = {
	currentModelName: string;
	isSelected: boolean;
	model: ListedModel;
};

const ModelPickerRow = ({ currentModelName, isSelected, model }: ModelPickerRowProps) => {
	const marker = isSelected ? '›' : ' ';
	const details = formatModelDetails(model);
	const isCurrent = model.name === currentModelName;

	return (
		<Box>
			<Text color={isSelected ? 'cyan' : 'gray'}>{marker} </Text>
			<Text color={isSelected ? 'cyan' : 'white'}>{model.name}</Text>
			{details.length === 0 ? null : <Text color="gray"> {details}</Text>}
			{isCurrent ? <Text color="green"> current</Text> : null}
		</Box>
	);
};

const formatModelDetails = (model: ListedModel): string => {
	const parts = [model.parameterSize, model.quantizationLevel].filter(
		(part): part is string => part !== undefined,
	);

	return parts.length === 0 ? '' : `(${parts.join(', ')})`;
};
