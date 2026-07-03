import { Box, Text } from 'ink';

import type { ListedModel } from '@/application/ports/ModelCatalogPort';

const PANEL_BACKGROUND = '#1f1f1f';

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
		<Box backgroundColor={PANEL_BACKGROUND} flexDirection="column" paddingX={2} paddingY={1}>
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

type ModelPickerRowProps = {
	currentModelName: string;
	isSelected: boolean;
	model: ListedModel;
};

const ModelPickerRow = ({ currentModelName, isSelected, model }: ModelPickerRowProps) => {
	const prefix = isSelected ? '> ' : '  ';
	const color = isSelected ? 'cyan' : 'white';
	const details = formatModelDetails(model);

	return (
		<Text color={color}>
			{prefix}
			{model.name}
			{details.length === 0 ? null : <Text color="gray"> {details}</Text>}
			{model.name === currentModelName ? <Text color="green"> current</Text> : null}
		</Text>
	);
};

const formatModelDetails = (model: ListedModel): string => {
	const parts = [model.parameterSize, model.quantizationLevel].filter(
		(part): part is string => part !== undefined,
	);

	return parts.length === 0 ? '' : `(${parts.join(', ')})`;
};
