import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';

import { asSessionId } from '@/domain/Ids';
import { Transcript } from './Transcript';

describe('Transcript', () => {
	test('renders one session header and non-colour role markers', () => {
		const output = Bun.stripANSI(
			renderToString(
				<Transcript
					history={[
						{ id: 'user', kind: 'user', content: 'Question' },
						{ id: 'assistant', kind: 'assistant', content: 'Answer' },
						{
							id: 'tool',
							kind: 'tool',
							content: 'Read file · README.md',
							label: 'read_file',
							status: 'success',
						},
					]}
					sessionId={asSessionId('session-1')}
				/>,
			),
		);

		expect(output.match(/codesh/g)).toHaveLength(1);
		expect(output).toContain('› You');
		expect(output).toContain('◆ Assistant');
		expect(output).toContain('✓ Tool · read_file');
	});

	test('wraps long user and assistant text at small terminal widths', () => {
		const output = Bun.stripANSI(
			renderToString(
				<Transcript
					history={[
						{
							id: 'user',
							kind: 'user',
							content: 'A long user message that must wrap without breaking the terminal layout.',
						},
						{
							id: 'assistant',
							kind: 'assistant',
							content: 'A long assistant response with `inline code` and more words.',
						},
					]}
					sessionId={asSessionId('session-1')}
				/>,
				{ columns: 28 },
			),
		);

		expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThanOrEqual(28);
	});
});
