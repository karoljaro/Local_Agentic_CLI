import { expect, test } from 'bun:test';
import {
	createClipboard,
	createRendererClipboardAdapter,
	type HostClipboardService,
} from '@opentui/core';
import { copyResultFeedback } from './clipboard';

test('clipboard feedback separates host success, unacknowledged terminal transport and actual failures', () => {
	const terminal = { status: 'not-attempted' as const, capability: 'unsupported' as const };
	expect(copyResultFeedback({ host: { status: 'written' }, terminal })).toBe('Copied to clipboard');
	expect(
		copyResultFeedback({
			host: { status: 'not-attempted' },
			terminal: { status: 'attempted', capability: 'supported' },
		}),
	).toContain('receipt cannot be confirmed');
	expect(
		copyResultFeedback({
			host: { status: 'failed', error: new Error('actual refusal') },
			terminal,
		}),
	).toContain('actual refusal');
	expect(copyResultFeedback({ host: { status: 'timed-out' }, terminal })).toContain('timed out');
	expect(copyResultFeedback({ host: { status: 'unsupported' }, terminal })).toContain(
		'no supported clipboard',
	);
	expect(
		copyResultFeedback({
			host: { status: 'unsupported' },
			terminal: { status: 'local-failure', capability: 'unknown' },
		}),
	).toContain('terminal clipboard write failed');
});

test('installed clipboard policy uses host locally, falls back to native OSC 52 and avoids remote host writes', async () => {
	const writes: string[] = [];
	const terminalWrites: string[] = [];
	let supported = true;
	let remote = false;
	let disposed = false;
	const host: HostClipboardService = {
		maxWriteBytes: 1024,
		read: async () => ({ status: 'empty' }),
		clear: async () => ({ status: 'cleared' }),
		writeText: async (text) => {
			writes.push(text);
			return { status: supported ? 'written' : 'unsupported' };
		},
		dispose: async () => {
			disposed = true;
		},
	};
	const clipboard = createClipboard({
		host,
		terminal: createRendererClipboardAdapter({
			get capabilities() {
				return { remote, osc52_support: 'supported' as const };
			},
			copyToClipboardOSC52: (text) => {
				terminalWrites.push(text);
				return true;
			},
			clearClipboardOSC52: () => true,
		}),
	});
	try {
		expect(
			(await clipboard.writeText('local', { destination: 'best-available' })).host.status,
		).toBe('written');
		expect(terminalWrites).toEqual([]);
		supported = false;
		expect(
			(await clipboard.writeText('fallback', { destination: 'best-available' })).terminal.status,
		).toBe('attempted');
		remote = true;
		await clipboard.writeText('remote', { destination: 'best-available' });
		expect(writes).toEqual(['local', 'fallback']);
		expect(terminalWrites).toEqual(['fallback', 'remote']);
	} finally {
		await clipboard.dispose();
	}
	expect(disposed).toBe(true);
});
