import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';

import { asSessionId, asToolCallId } from '@/domain/Ids';
import { StreamBuffer } from '../state/StreamBuffer';
import { ChatScreen } from './ChatScreen';

describe('ChatScreen visual flow', () => {
	test('keeps external breathing room around the composer while idle, waiting, and streaming', () => {
		for (const columns of [60, 28]) {
			for (const status of ['idle', 'waiting', 'streaming'] as const) {
				const output = renderChatState(status, columns);
				const lines = output.split('\n');
				const inputIndex = lines.findIndex((line) => line.includes('│ ›'));
				const hintsIndex = lines.findIndex((line) =>
					line.includes(status === 'idle' ? 'Enter send' : 'Type keep drafting'),
				);

				expect(inputIndex).toBeGreaterThan(0);
				expect(countBlankLinesBefore(lines, inputIndex)).toBeGreaterThanOrEqual(2);
				expect(hintsIndex).toBeGreaterThan(inputIndex);
				expect(lines.slice(inputIndex + 1, hintsIndex)).toEqual(['', '']);
				expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(columns);
			}
		}
	});

	test('keeps history, active stream, and composer readable at 24 columns', () => {
		const stream = new StreamBuffer(10_000);
		stream.start();
		stream.push('A streaming response with enough words to wrap safely.');
		stream.flush();
		const output = Bun.stripANSI(
			renderToString(
				<ChatScreen
					chat={{
						sessionId: asSessionId('session-1'),
						history: [{ id: 'user', kind: 'user', content: 'A long question for the agent.' }],
						activeTools: [],
						loadStatus: 'ready',
						turnStatus: 'streaming',
					}}
					commandMenu={{ isVisible: false, items: [], selectedIndex: 0 }}
					composer={{ value: 'next prompt', cursorIndex: 4 }}
					isComposerFocused
					modelName="current-model"
					onResolveApproval={() => undefined}
					pendingApproval={null}
					sessionId={asSessionId('session-1')}
					stream={stream}
					workspacePath="/workspace/project"
				/>,
				{ columns: 24 },
			),
		);

		expect(output).toContain('Assistant ·');
		expect(output).toContain('streaming');
		expect(output).toContain('keep drafting');
		expect(output).toContain('Esc/Ctrl+C');
		expect(output).toContain('model current-model');
		expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThanOrEqual(24);
		stream.dispose();
	});

	test('orders active tool, approval, and paused composer without merging their surfaces', () => {
		const stream = new StreamBuffer();
		const toolCallId = asToolCallId('tool-call-1');
		const output = Bun.stripANSI(
			renderToString(
				<ChatScreen
					chat={{
						sessionId: asSessionId('session-1'),
						history: [],
						activeTools: [
							{
								id: toolCallId,
								name: 'edit_file',
								description: 'Edit file · src/App.tsx',
								status: 'approval',
							},
						],
						loadStatus: 'ready',
						turnStatus: 'waiting',
					}}
					commandMenu={{ isVisible: false, items: [], selectedIndex: 0 }}
					composer={{ value: '', cursorIndex: 0 }}
					isComposerFocused={false}
					modelName="current-model"
					onResolveApproval={() => undefined}
					pendingApproval={{
						sessionId: asSessionId('session-1'),
						toolCallId,
						toolName: 'edit_file',
						toolInput: { path: 'src/App.tsx' },
					}}
					sessionId={asSessionId('session-1')}
					stream={stream}
					workspacePath="/workspace"
				/>,
				{ columns: 30 },
			),
		);
		const toolIndex = output.indexOf('waiting for approval');
		const approvalIndex = output.indexOf('APPROVAL');
		const composerIndex = output.indexOf('model current-model');

		expect(toolIndex).toBeGreaterThanOrEqual(0);
		expect(approvalIndex).toBeGreaterThan(toolIndex);
		expect(composerIndex).toBeGreaterThan(approvalIndex);
		expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThanOrEqual(30);
		stream.dispose();
	});
});

const renderChatState = (status: 'idle' | 'waiting' | 'streaming', columns: number): string => {
	const stream = new StreamBuffer(10_000);
	if (status === 'streaming') {
		stream.start();
		stream.push('Partial response.');
		stream.flush();
	}
	const output = Bun.stripANSI(
		renderToString(
			<ChatScreen
				chat={{
					sessionId: asSessionId('session-1'),
					history: [{ id: 'assistant', kind: 'assistant', content: 'Previous response.' }],
					activeTools: [],
					loadStatus: 'ready',
					turnStatus: status,
				}}
				commandMenu={{ isVisible: false, items: [], selectedIndex: 0 }}
				composer={{ value: 'draft', cursorIndex: 2 }}
				isComposerFocused
				modelName="current-model"
				onResolveApproval={() => undefined}
				pendingApproval={null}
				sessionId={asSessionId('session-1')}
				stream={stream}
				workspacePath="/workspace"
			/>,
			{ columns },
		),
	);
	stream.dispose();
	return output;
};

const countBlankLinesBefore = (lines: string[], index: number): number => {
	let count = 0;
	for (let lineIndex = index - 1; lineIndex >= 0 && lines[lineIndex] === ''; lineIndex -= 1) {
		count += 1;
	}
	return count;
};
