import { describe, expect, test } from 'bun:test';

import { asSessionId } from '@/domain/Ids';
import { InMemoryAgentMetrics } from './InMemoryAgentMetrics';

describe('InMemoryAgentMetrics', () => {
	test('aggregates model rounds and tool resource metrics for a completed turn', () => {
		const metrics = new InMemoryAgentMetrics();
		const turn = metrics.startTurn(asSessionId('session-1'));

		turn.recordModelRequest(100);
		turn.recordModelRequest(250);
		turn.recordToolExecution({
			toolName: 'search_file',
			durationMs: 12.5,
			outputCharacters: 80,
			failed: false,
			reused: false,
		});
		turn.recordToolExecution({
			toolName: 'search_file',
			durationMs: 0.5,
			outputCharacters: 32,
			failed: false,
			reused: true,
		});
		turn.complete();

		expect(metrics.snapshot()).toEqual({
			completedTurns: [
				{
					sessionId: asSessionId('session-1'),
					modelRounds: 2,
					modelRequestCharacters: { total: 350, max: 250 },
					tools: {
						executions: 2,
						failed: 0,
						reused: 1,
						outputCharacters: { total: 112, max: 80 },
						durationMs: { total: 13, max: 12.5 },
						byTool: {
							search_file: {
								executions: 2,
								failed: 0,
								reused: 1,
								outputCharacters: { total: 112, max: 80 },
								durationMs: { total: 13, max: 12.5 },
							},
						},
					},
				},
			],
		});
	});

	test('bounds completed turns and supports session filtering', () => {
		const metrics = new InMemoryAgentMetrics(2);

		for (const sessionId of ['session-1', 'session-2', 'session-1']) {
			metrics.startTurn(asSessionId(sessionId)).complete();
		}

		expect(metrics.snapshot().completedTurns.map((turn) => turn.sessionId)).toEqual([
			asSessionId('session-2'),
			asSessionId('session-1'),
		]);
		expect(metrics.snapshot(asSessionId('session-1')).completedTurns).toHaveLength(1);
	});
});
