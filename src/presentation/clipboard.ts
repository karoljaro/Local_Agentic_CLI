import {
	createClipboard,
	createHostClipboard,
	createRendererClipboardAdapter,
	type CliRenderer,
	type ClipboardService,
	type ClipboardWriteResult,
} from '@opentui/core';
import { safeDiagnosticText } from './formatters/operationError';

export type CopyClipboard = Pick<ClipboardService, 'writeText' | 'dispose'>;

// The installed native service owns platform IO, bounds, cancellation and teardown.
export const createAppClipboard = (renderer: CliRenderer): CopyClipboard =>
	createClipboard({
		host: createHostClipboard({
			timeoutMs: 1500,
			maxWriteBytes: 1024 * 1024,
			maxConcurrentOperations: 1,
		}),
		terminal: createRendererClipboardAdapter(renderer),
	});

export const copyResultFeedback = (result: ClipboardWriteResult): string => {
	if (result.host.status === 'written') return 'Copied to clipboard';
	if (result.terminal.status === 'attempted')
		return 'Sent to terminal clipboard · receipt cannot be confirmed';
	if (result.host.status === 'failed')
		return `Could not copy: ${safeDiagnosticText(result.host.error.message, 500)}`;
	if (result.host.status === 'timed-out') return 'Could not copy: clipboard operation timed out';
	if (result.terminal.status === 'local-failure')
		return 'Could not copy: terminal clipboard write failed';
	return 'Could not copy: no supported clipboard backend is available';
};
