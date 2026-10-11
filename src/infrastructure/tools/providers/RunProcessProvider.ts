import type { ProcessInvocation, ProcessRunnerPort } from '@/application/ports/ProcessRunnerPort';
import { isProgramPath, workspaceRelativePath } from '@/infrastructure/file-system/workspacePaths';
import { z } from 'zod';
import { defineLocalTool, type LocalTool } from '../LocalTool';

export const PROCESS_DEFAULT_TIMEOUT_MS = 60_000;
export const PROCESS_MIN_TIMEOUT_MS = 1_000;
export const PROCESS_MAX_TIMEOUT_MS = 300_000;
export const PROCESS_MAX_PROGRAM_BYTES = 1_024;
export const PROCESS_MAX_ARGS = 128;
export const PROCESS_MAX_ARG_BYTES = 8_192;
export const PROCESS_MAX_ARGS_BYTES = 32_768;
export const PROCESS_MAX_CWD_BYTES = 4_096;

const boundedString = (maxBytes: number) =>
	z
		.string()
		.max(maxBytes)
		.refine(
			(value) => !value.includes('\0') && Buffer.byteLength(value, 'utf8') <= maxBytes,
			`Must contain no NUL and at most ${maxBytes} UTF-8 bytes.`,
		);

const workspacePath = (value: string, context: z.RefinementCtx): void => {
	try {
		workspaceRelativePath(value);
	} catch (error) {
		context.addIssue({ code: 'custom', message: (error as Error).message });
	}
};

const normalizePath = (value: string): string => {
	try {
		return workspaceRelativePath(value);
	} catch {
		return value;
	}
};

const inputSchema = z.strictObject({
	program: boundedString(PROCESS_MAX_PROGRAM_BYTES)
		.refine((value) => value.trim().length > 0, 'Program cannot be empty.')
		.superRefine((value, context) => {
			if (isProgramPath(value)) workspacePath(value, context);
		})
		.overwrite((value) => (isProgramPath(value) ? `./${normalizePath(value)}` : value)),
	args: z
		.array(boundedString(PROCESS_MAX_ARG_BYTES))
		.max(PROCESS_MAX_ARGS)
		.default([])
		.refine(
			(args) =>
				args.reduce((total, arg) => total + Buffer.byteLength(arg, 'utf8'), 0) <=
				PROCESS_MAX_ARGS_BYTES,
			`Arguments must total at most ${PROCESS_MAX_ARGS_BYTES} UTF-8 bytes.`,
		)
		.optional(),
	cwd: boundedString(PROCESS_MAX_CWD_BYTES)
		.trim()
		.min(1)
		.default('.')
		.superRefine(workspacePath)
		.overwrite(normalizePath)
		.optional(),
	timeoutMs: z
		.int()
		.min(PROCESS_MIN_TIMEOUT_MS)
		.max(PROCESS_MAX_TIMEOUT_MS)
		.default(PROCESS_DEFAULT_TIMEOUT_MS)
		.optional(),
});

export const runProcessTool = (runner: ProcessRunnerPort): LocalTool => {
	const tool = defineLocalTool({
		name: 'run_process',
		description:
			'Run one foreground process with direct argv in the workspace. No implicit shell or interactive stdin. Requires approval. Use for tests/checks/builds; non-zero exits are results. Prefer file tools for inspection/editing.',
		requiresApproval: true,
		invalidatesWorkspaceCache: true,
		inputSchema,
		execute: (input, options) =>
			runner.run(
				Object.freeze({
					program: input.program,
					args: Object.freeze(input.args ?? []),
					cwd: input.cwd ?? '.',
					timeoutMs: input.timeoutMs ?? PROCESS_DEFAULT_TIMEOUT_MS,
				}),
				options,
			),
	});
	return {
		...tool,
		prepare: (input) => {
			const prepared = tool.prepare(input);
			const projection = prepared.toolInput as ProcessInvocation;
			Object.freeze(projection.args);
			Object.freeze(projection);
			return Object.freeze(prepared);
		},
	};
};
