const TOOL_LABELS: Record<string, string> = {
	list_files: 'List files',
	search_file: 'Search workspace',
	read_file: 'Read file',
	create_file: 'Create file',
	edit_file: 'Edit file',
};

export const formatToolName = (toolName: string): string => {
	return TOOL_LABELS[toolName] ?? toolName.replaceAll('_', ' ');
};

export const describeToolRequest = (toolName: string, toolInput: unknown): string => {
	const action = formatToolName(toolName);
	const target = getPrimaryToolTarget(toolInput);

	return target === undefined ? action : `${action} · ${target}`;
};

export const getPrimaryToolTarget = (toolInput: unknown): string | undefined => {
	if (!isRecord(toolInput)) {
		return undefined;
	}

	for (const key of ['path', 'query', 'pattern', 'resource']) {
		const value = toolInput[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return truncateInline(value.trim(), 100);
		}
	}

	return undefined;
};

const truncateInline = (value: string, maxLength: number): string => {
	const inline = value.replaceAll('\r', '').replaceAll('\n', '\\n');
	return inline.length <= maxLength ? inline : `${inline.slice(0, maxLength - 1)}…`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};
