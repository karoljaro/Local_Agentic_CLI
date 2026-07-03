export const formatApprovalInput = (toolInput: unknown): string[] => {
	if (typeof toolInput !== 'object' || toolInput === null) {
		return [`input ${String(toolInput)}`];
	}

	const input = toolInput as {
		path?: unknown;
		oldText?: unknown;
		newText?: unknown;
		content?: unknown;
	};
	const lines: string[] = [];

	if (typeof input.path === 'string') {
		lines.push(`path ${input.path}`);
	}

	if (typeof input.oldText === 'string') {
		lines.push(`old ${formatInlinePreview(input.oldText)}`);
	}

	if (typeof input.newText === 'string') {
		lines.push(`new ${formatInlinePreview(input.newText)}`);
	}

	if (typeof input.content === 'string') {
		lines.push(`content ${formatInlinePreview(input.content)}`);
	}

	const fallbackInput = JSON.stringify(toolInput);

	return lines.length > 0 ? lines : [`input ${fallbackInput ?? String(toolInput)}`];
};

const formatInlinePreview = (text: string): string => {
	const normalizedText = text.replaceAll('\n', '\\n');
	const maxLength = 120;

	return normalizedText.length <= maxLength
		? normalizedText
		: `${normalizedText.slice(0, maxLength)}...`;
};
