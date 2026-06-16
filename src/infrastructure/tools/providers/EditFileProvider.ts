import type { ToolExecutionResult } from '@/application/ports/ToolExecutorPort';
import type { ToolDefinition } from '@/domain/Tool';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export const EDIT_FILE_TOOL_NAME = 'edit_file';

type EditFileProviderOptions = {
	workspaceRoot: string;
	maxFileBytes: number;
};

type EditFileInput = {
	path: string;
	oldText: string;
	newText: string;
};

export class EditFileProvider {
	private readonly workspaceRoot: string;
	private readonly maxFileBytes: number;

	constructor(options: EditFileProviderOptions) {
		this.workspaceRoot = resolve(options.workspaceRoot);
		this.maxFileBytes = options.maxFileBytes;

		if (this.maxFileBytes <= 0) {
			throw new Error('Max file size must be greater than zero.');
		}
	}

	getToolDefinition(): ToolDefinition {
		return {
			name: EDIT_FILE_TOOL_NAME,
			description:
				'Replace exact text in a UTF-8 file in the current workspace. Use this after reading the target file.',
			parameters: {
				type: 'object',
				required: ['path', 'oldText', 'newText'],
				additionalProperties: false,
				properties: {
					path: {
						type: 'string',
						description:
							'The path to the file to edit, relative to the workspace root.',
					},
					newText: {
						type: 'string',
						description: 'The replacement text. May be empty to remove oldText.',
					},
					oldText: {
						type: 'string',
						description:
							'The exact text to replace. The edit will only be applied if this text appears exactly once.',
					},
				},
			},
		};
	}

	async execute(toolInput: unknown): Promise<ToolExecutionResult> {
		const input = parseEditFileInput(toolInput);

		if (isAbsolute(input.path)) {
			throw new Error('edit_file requires a relative path.');
		}

		const targetPath = resolve(this.workspaceRoot, input.path);

		if (!isPathInside(this.workspaceRoot, targetPath)) {
			throw new Error(`Cannot edit file outside workspace: ${input.path}`);
		}

		const realWorkspaceRoot = await realpath(this.workspaceRoot);
		const realTargetPath = await realpath(targetPath);

		if (!isPathInside(realWorkspaceRoot, realTargetPath)) {
			throw new Error(`Cannot edit file outside workspace: ${input.path}`);
		}

		const fileStats = await stat(realTargetPath);

		if (!fileStats.isFile()) {
			throw new Error(`Path is not a file: ${input.path}`);
		}

		if (fileStats.size > this.maxFileBytes) {
			throw new Error(
				`File is too large: ${input.path} (${fileStats.size} bytes, max ${this.maxFileBytes})`,
			);
		}

		const content = await readFile(realTargetPath, 'utf8');
		const oldText = normalizeEscapedLineBreaks(input.oldText);
		const newText = normalizeEscapedLineBreaks(input.newText);
		const matchCount = content.split(oldText).length - 1;

		if (matchCount === 0) {
			throw new Error(`oldText was not found in file: ${input.path}`);
		}

		if (matchCount > 1) {
			throw new Error(
				`oldText appears multiple times in file: ${input.path}`,
			);
		}

		await writeFile(
			realTargetPath,
			content.replace(oldText, newText),
			'utf8',
		);

		return {
			toolName: EDIT_FILE_TOOL_NAME,
			output: {
				path: relative(realWorkspaceRoot, realTargetPath),
				replaced: true,
				matchCount,
			},
		};
	}
}

const parseEditFileInput = (input: unknown): EditFileInput => {
	if (typeof input !== 'object' || input === null) {
		throw new Error('edit_file requires an object input.');
	}

	const { path, oldText, newText } = input as {
		path?: unknown;
		oldText?: unknown;
		newText?: unknown;
	};

	if (typeof path !== 'string' || path.trim().length === 0) {
		throw new Error('edit_file requires a non-empty string path.');
	}

	if (typeof oldText !== 'string' || oldText.length === 0) {
		throw new Error('edit_file requires a non-empty string oldText.');
	}

	if (typeof newText !== 'string') {
		throw new Error('edit_file requires a string newText.');
	}

	return {
		path: path.trim(),
		oldText,
		newText,
	};
};

const normalizeEscapedLineBreaks = (text: string): string => {
	return text
		.replaceAll('\\r\\n', '\n')
		.replaceAll('\\n', '\n')
		.replaceAll('\\r', '\n');
};

const isPathInside = (parentPath: string, childPath: string): boolean => {
	const relativePath = relative(parentPath, childPath);

	return (
		relativePath.length === 0 ||
		(!relativePath.startsWith('..') && !isAbsolute(relativePath))
	);
};
