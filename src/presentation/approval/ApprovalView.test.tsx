import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';

import { asSessionId, asToolCallId } from '@/domain/Ids';
import { ApprovalView } from './ApprovalView';

describe('ApprovalView', () => {
	test('shows a concise action and decisions while keeping large details hidden', () => {
		const output = Bun.stripANSI(
			renderToString(
				<ApprovalView
					onResolve={() => undefined}
					request={{
						sessionId: asSessionId('session-1'),
						toolCallId: asToolCallId('tool-call-1'),
						toolName: 'edit_file',
						toolInput: {
							path: 'src/App.tsx',
							oldText: 'a'.repeat(500),
							newText: 'b'.repeat(500),
						},
					}}
				/>,
				{ columns: 28 },
			),
		);

		expect(output).toContain('? APPROVAL');
		expect(output).toContain('Edit file');
		expect(output).toContain('src/App.tsx');
		expect(output).toContain('○ [y] Approve');
		expect(output).toContain('● [n] Reject');
		expect(output).not.toContain('a'.repeat(50));
		expect(output).not.toContain('b'.repeat(50));
		expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThanOrEqual(28);
	});
});
