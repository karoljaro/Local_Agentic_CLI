import { describe, expect, spyOn, test } from 'bun:test';

import { SessionService } from '@/application/services/SessionService';
import { JsonlSessionStore } from '@/infrastructure/persistence/JsonlSessionStore';
import { asSessionId } from '@/domain/Ids';
import { promptSubmittedEvent } from '@/test-support/AgentEventFixtures';
import { RuntimePresentationController } from '@/presentation/adapters/PresentationController';

import { createRuntime } from './createRuntime';

describe('createRuntime', () => {
	test('injects one service into loop/listing and routes preview/publication through that owner', async () => {
		const read = spyOn(JsonlSessionStore.prototype, 'readSessionEvents').mockResolvedValue([]);
		const append = spyOn(JsonlSessionStore.prototype, 'appendSessionEvent').mockResolvedValue(
			undefined,
		);
		try {
			const runtime = createRuntime({
				OLLAMA_BASE_URL: 'http://localhost:11434',
				OLLAMA_MODEL: 'model',
				OLLAMA_KEEP_ALIVE: '0',
				SYSTEM_PROMPT: 'test',
				MAX_CONTEXT_CHARACTERS: 120_000,
			});
			const ownerOf = (component: unknown) =>
				(
					component as {
						dependencies: { sessionStore: SessionService };
					}
				).dependencies.sessionStore;
			const service = ownerOf(runtime.runAgentTurn);
			expect(service).toBeInstanceOf(SessionService);
			expect(ownerOf(runtime.listSessions)).toBe(service);
			expect(ownerOf(runtime.listSessionEvents)).toBe(service);
			const controller = new RuntimePresentationController(runtime);
			const id = asSessionId('selected');
			await controller.listSessionEvents(id);
			await controller.readSessionPreviewEvents(asSessionId('preview'));
			await controller.listSessionEvents(id);
			expect(read).toHaveBeenCalledTimes(2); // Preview did not evict the selected session.
			let observed = '';
			const unsubscribe = runtime.subscribeSessionEvents((event) => {
				observed = String(event.id);
			});
			const prompt = promptSubmittedEvent({ sessionId: id });
			await service.appendSessionEvent(prompt);
			expect(observed).toBe(String(prompt.id));
			expect(await controller.listSessionEvents(id)).toEqual([prompt]);
			expect(append).toHaveBeenCalledTimes(1);
			unsubscribe();
		} finally {
			read.mockRestore();
			append.mockRestore();
		}
	});

	test('exposes and switches the active model name', () => {
		const runtime = createRuntime({
			OLLAMA_BASE_URL: 'http://localhost:11434',
			OLLAMA_MODEL: 'initial-model',
			OLLAMA_KEEP_ALIVE: '0',
			SYSTEM_PROMPT: 'You are a local coding agent.',
			MAX_CONTEXT_CHARACTERS: 120_000,
		});

		expect(runtime.getModelName()).toBe('initial-model');
		expect(runtime.getAgentMetrics()).toEqual({ completedTurns: [] });
		expect(runtime.workspacePath).toBe(process.cwd());
		expect(runtime.switchModel('  next-model  ')).toBe('next-model');
		expect(runtime.getModelName()).toBe('next-model');
		expect(() => runtime.switchModel(' ')).toThrow('Ollama model name cannot be empty.');
	});
});
