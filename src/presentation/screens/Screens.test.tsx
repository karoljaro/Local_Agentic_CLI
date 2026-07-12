import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';

import { asSessionId } from '@/domain/Ids';
import { ModelScreen } from './ModelScreen';
import { ResumeScreen } from './ResumeScreen';

describe('selection screens', () => {
	test('model screen marks current selection and reports loading errors', () => {
		const output = Bun.stripANSI(
			renderToString(
				<ModelScreen
					currentModelName="qwen:latest"
					onCancel={() => undefined}
					onSelect={() => undefined}
					selection={{
						status: 'idle',
						items: [
							{
								name: 'qwen:latest',
								parameterSize: '7B',
								quantizationLevel: 'Q4',
							},
						],
						error: 'catalog warning',
					}}
				/>,
			),
		);

		expect(output).toContain('Select model');
		expect(output).toContain('qwen:latest · current · 7B, Q4');
		expect(output).toContain('catalog warning');
	});

	test('resume screen shows new chat plus useful session metadata', () => {
		const sessionId = asSessionId('session-1');
		const output = Bun.stripANSI(
			renderToString(
				<ResumeScreen
					canCancel
					currentSessionId="different"
					onCancel={() => undefined}
					onSelect={() => undefined}
					selection={{
						status: 'idle',
						items: [
							{
								sessionId,
								lastActiveAt: '2026-07-12T12:00:00.000Z',
								preview: 'Explain the repository',
							},
						],
					}}
				/>,
			),
		);

		expect(output).toContain('New chat');
		expect(output).toContain('session-1');
		expect(output).toContain('Explain the repository');
	});
});
