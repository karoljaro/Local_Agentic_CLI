import { describe, expect, test } from 'bun:test';

import { handleChatCommand } from './handleChatCommand';

describe('handleChatCommand', () => {
	test('unloads the current model before opening the model picker', async () => {
		const events: string[] = [];

		await handleChatCommand({
			...createDependencies(events),
			command: { type: 'open-models' },
		});

		expect(events).toEqual(['unload:start', 'unload:end', 'release-chat', 'open-models']);
	});

	test('unloads the current model before switching model directly', async () => {
		const events: string[] = [];

		await handleChatCommand({
			...createDependencies(events),
			command: { type: 'switch-model', modelName: 'llama3.1' },
		});

		expect(events).toEqual([
			'unload:start',
			'unload:end',
			'switch-model:llama3.1',
			'model-changed:normalized-llama3.1',
			'append:system:assistant:Model switched to normalized-llama3.1.',
			'status:idle',
		]);
	});

	test('does not open the model picker when unload fails', async () => {
		const events: string[] = [];

		await handleChatCommand({
			...createDependencies(events, { unloadResult: false }),
			command: { type: 'open-models' },
		});

		expect(events).toEqual(['unload:start', 'unload:end']);
	});

	test('does not switch model when unload fails', async () => {
		const events: string[] = [];

		await handleChatCommand({
			...createDependencies(events, { unloadResult: false }),
			command: { type: 'switch-model', modelName: 'llama3.1' },
		});

		expect(events).toEqual(['unload:start', 'unload:end']);
	});

	test('opens resume without unloading the current model', async () => {
		const events: string[] = [];

		await handleChatCommand({
			...createDependencies(events),
			command: { type: 'resume' },
		});

		expect(events).toEqual(['release-chat', 'resume']);
	});
});

type CreateDependenciesOptions = {
	unloadResult?: boolean;
};

const createDependencies = (
	events: string[],
	options: CreateDependenciesOptions = {},
): Omit<Parameters<typeof handleChatCommand>[0], 'command'> => {
	return {
		appendTranscriptEntry: (prefix, role, content) => {
			events.push(`append:${prefix}:${role}:${content}`);
		},
		onModelNameChange: (modelName) => {
			events.push(`model-changed:${modelName}`);
		},
		onOpenModels: () => {
			events.push('open-models');
		},
		onResume: () => {
			events.push('resume');
		},
		releaseChatView: () => {
			events.push('release-chat');
		},
		setStatus: (status) => {
			events.push(`status:${status}`);
		},
		switchModel: (modelName) => {
			events.push(`switch-model:${modelName}`);
			return `normalized-${modelName}`;
		},
		unloadCurrentModel: async () => {
			events.push('unload:start');
			await Promise.resolve();
			events.push('unload:end');
			return options.unloadResult ?? true;
		},
	};
};
