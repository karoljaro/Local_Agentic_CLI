import type { ProcessResult } from '../ports/ProcessRunnerPort';
import type { ModelMessage } from '@/domain/ModelMessage';

// Derived against the default Phase 16 profile, including nested JSON escaping.
// These are request-only text bounds, not Phase 19 execution retention limits.
const STREAM_BYTES = 1_024;
const IDENTITY_BYTES = 256;
const ARGS_PREVIEW_BYTES = 512;
const MARKER = '\n[... context projection truncated ...]\n';
const encoder = new TextEncoder();
const markerBytes = encoder.encode(MARKER).length;

/** Canonical reducer messages/events remain authoritative and untouched. */
export const projectProcessObservation = (message: ModelMessage): ModelMessage => {
	if (message.role !== 'tool' || message.toolName !== 'run_process') return message;
	let result: unknown;
	try {
		result = JSON.parse(message.content);
	} catch {
		return message;
	}
	// Tool failures and malformed legacy observations must not become process results.
	if (!isProcessResult(result)) return message;
	const program = boundText(result.program, IDENTITY_BYTES);
	const cwd = boundText(result.cwd, IDENTITY_BYTES);
	const args = boundText(JSON.stringify(result.args), ARGS_PREVIEW_BYTES);
	const stdout = boundText(result.stdout, STREAM_BYTES);
	const stderr = boundText(result.stderr, STREAM_BYTES);
	const contextProjection = {
		programTruncated: program.truncated,
		argsTruncated: args.truncated,
		cwdTruncated: cwd.truncated,
		stdoutTruncated: stdout.truncated,
		stderrTruncated: stderr.truncated,
	};
	if (!Object.values(contextProjection).some(Boolean)) return message;
	return {
		...message,
		content: JSON.stringify({
			...result,
			program: program.text,
			args: args.truncated ? { count: result.args.length, preview: args.text } : result.args,
			cwd: cwd.text,
			stdout: stdout.text,
			stderr: stderr.text,
			contextProjection,
		}),
	};
};

const boundText = (text: string, limit: number): { text: string; truncated: boolean } => {
	const bytes = encoder.encode(text);
	if (bytes.length <= limit) return { text, truncated: false };
	const headBytes = Math.floor((limit - markerBytes) / 2);
	const decoder = new TextDecoder('utf-8');
	const head = decoder.decode(bytes.subarray(0, headBytes), { stream: true });
	let tailStart = bytes.length - (limit - markerBytes - headBytes);
	while ((bytes[tailStart]! & 0xc0) === 0x80) tailStart++;
	return {
		text: head + MARKER + new TextDecoder('utf-8').decode(bytes.subarray(tailStart)),
		truncated: true,
	};
};

const isProcessResult = (value: unknown): value is ProcessResult => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const result = value as Record<string, unknown>;
	return (
		['program', 'cwd', 'stdout', 'stderr'].every((key) => typeof result[key] === 'string') &&
		Array.isArray(result['args']) &&
		result['args'].every((arg) => typeof arg === 'string') &&
		(result['exitCode'] === null || Number.isInteger(result['exitCode'])) &&
		(result['signal'] === null || typeof result['signal'] === 'string') &&
		['timedOut', 'stdoutTruncated', 'stderrTruncated'].every(
			(key) => typeof result[key] === 'boolean',
		) &&
		['durationMs', 'stdoutBytes', 'stderrBytes'].every(
			(key) => typeof result[key] === 'number' && Number.isFinite(result[key]) && result[key] >= 0,
		)
	);
};
