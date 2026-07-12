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
});
