import type { ToolExecutionOptions } from './ToolExecutorPort';

export type ProcessInvocation = {
	readonly program: string;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly timeoutMs: number;
};

export type ProcessResult = {
	program: string;
	args: string[];
	cwd: string;
	exitCode: number | null;
	signal: string | null;
	timedOut: boolean;
	durationMs: number;
	stdout: string;
	stderr: string;
	stdoutTruncated: boolean;
	stderrTruncated: boolean;
	stdoutBytes: number;
	stderrBytes: number;
};

/** One owned foreground child. Approval remains exclusively in ToolRunner. */
export interface ProcessRunnerPort {
	run(input: ProcessInvocation, options: ToolExecutionOptions): Promise<ProcessResult>;
}
