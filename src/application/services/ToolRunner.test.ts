import { describe, expect, test } from 'bun:test';

import type { ClockPort } from '@/application/ports/ClockPort';
import type { IdGeneratorPort } from '@/application/ports/IdGeneratorPort';
import {
	asEventId,
	asISODateTime,
	asMessageId,
	asSessionId,
	asToolCallId,
	type EventId,
	type ISODateTime,
	type MessageId,
	type SessionId,
	type ToolCallId,
} from '@/domain/Ids';
import type { ToolDefinition } from '@/domain/Tool';
import { InMemorySessionStore } from '@/test-support/InMemorySessionStore';
import { RecordingToolExecutor } from '@/test-support/RecordingToolExecutor';
import { ToolRunner } from './ToolRunner';

class FixedClock implements ClockPort {
	now(): ISODateTime {
		return asISODateTime('2026-07-12T12:00:00.000Z');
	}
}

class RecordingIdGenerator implements IdGeneratorPort {
	toolCallCount = 0;
	private nextNumber = 1;

	nextEventId(): EventId {
		return asEventId(`event-${this.nextNumber++}`);
	}

	nextMessageId(): MessageId {
		return asMessageId(`message-${this.nextNumber++}`);
	}

	nextSessionId(): SessionId {
		return asSessionId(`session-${this.nextNumber++}`);
	}

	nextToolCallId(): ToolCallId {
		this.toolCallCount += 1;
		return asToolCallId(`tool-call-${this.nextNumber++}`);
	}
}

const searchTool: ToolDefinition = {
	name: 'search_file',
	description: 'Search files',
	deduplicate: true,
	parameters: {},
};

describe('ToolRunner', () => {
	test('prepares the complete batch before assigning tool call ids', () => {
		const idGenerator = new RecordingIdGenerator();
		const toolExecutor = new RecordingToolExecutor(
			[searchTool],
			(request) => ({ toolName: request.toolName, output: {} }),
			(request) => {
				if (
					typeof request.toolInput !== 'object' ||
					request.toolInput === null ||
					!('query' in request.toolInput) ||
					typeof request.toolInput.query !== 'string'
				) {
					throw new Error('invalid search input');
				}

				return request;
			},
		);
		const runner = new ToolRunner({
			sessionStore: new InMemorySessionStore(),
			clock: new FixedClock(),
			idGenerator,
			toolExecutor,
		});

		expect(() =>
			runner.prepareToolCalls([
				{ name: 'search_file', arguments: { query: 'valid' } },
				{ name: 'search_file', arguments: { query: 42 } },
			]),
		).toThrow('invalid search input');
		expect(idGenerator.toolCallCount).toBe(0);
	});

	test('scopes deduplicated results to one runner instance', async () => {
		const sessionStore = new InMemorySessionStore();
		const idGenerator = new RecordingIdGenerator();
		const toolExecutor = new RecordingToolExecutor([searchTool], (request) => ({
			toolName: request.toolName,
			output: { matches: ['result'] },
		}));
		const dependencies = {
			sessionStore,
			clock: new FixedClock(),
			idGenerator,
			toolExecutor,
		};
		const firstRunner = new ToolRunner(dependencies);
		const [firstCall, secondCall] = firstRunner.prepareToolCalls([
			{ name: 'search_file', arguments: { query: 'needle' } },
			{ name: 'search_file', arguments: { query: 'needle' } },
		]);

		if (firstCall === undefined || secondCall === undefined) {
			throw new Error('Expected prepared tool calls.');
		}

		await firstRunner.executeToolCalls(asSessionId('session-1'), [firstCall]);
		const repeated = await firstRunner.executeToolCalls(asSessionId('session-1'), [secondCall]);
		expect(toolExecutor.receivedRequests).toHaveLength(1);
		expect(repeated.toolMessages[0]?.content).toContain('"cached":true');

		const nextRunner = new ToolRunner(dependencies);
		const nextCall = nextRunner.prepareToolCalls([
			{ name: 'search_file', arguments: { query: 'needle' } },
		])[0];

		if (nextCall === undefined) {
			throw new Error('Expected a prepared tool call.');
		}

		await nextRunner.executeToolCalls(asSessionId('session-2'), [nextCall]);
		expect(toolExecutor.receivedRequests).toHaveLength(2);
	});
});
