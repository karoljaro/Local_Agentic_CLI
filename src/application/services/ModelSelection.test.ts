import { describe, expect, test } from 'bun:test';
import type { ModelPreferencePort } from '../ports/ModelPreferencePort';
import { SYNTHETIC_MODEL, TEST_CONTEXT_PROFILE } from '@/test-support/modelFixtures';
import { createDeferred } from '@/test-support/createDeferred';
import { collectAsyncIterable } from '@/test-support/collectAsyncIterable';
import { throwIfAborted } from './cancellation';
import { ModelSelection, ModelUseError, type ModelSelectionState } from './ModelSelection';

const OTHER = 'other-model';
const MISSING = 'removed-model';
const setup = (options: { configured?: string; remembered?: string; models?: string[] } = {}) => {
	const f = {
		models: options.models ?? [SYNTHETIC_MODEL, OTHER],
		remembered: options.remembered as string | undefined,
		writes: [] as string[],
		operations: [] as string[],
		signals: [] as AbortSignal[],
		faults: {} as Partial<
			Record<'list' | 'unload' | 'activate' | 'chat' | 'write' | 'create', unknown>
		>,
		beforeUnload: undefined as (() => Promise<void>) | undefined,
		beforeActivate: undefined as (() => Promise<void>) | undefined,
		onCreate: undefined as (() => void) | undefined,
	};
	const preference: ModelPreferencePort = {
		readLastSelectedModel: async () => f.remembered,
		writeLastSelectedModel: async (name) => {
			if ('write' in f.faults) throw f.faults.write;
			f.writes.push(name);
			f.remembered = name;
		},
	};
	const dependencies = {
		configuredModel: options.configured,
		preference,
		catalog: {
			listModels: async () => {
				f.operations.push('list');
				if ('list' in f.faults) throw f.faults.list;
				return { models: f.models.map((name) => ({ name })) };
			},
		},
		createModel: (name: string) => {
			f.operations.push(`create:${name}`);
			if ('create' in f.faults) throw f.faults.create;
			f.onCreate?.();
			return {
				activate: async (input?: { signal?: AbortSignal }) => {
					f.operations.push(`activate:${name}`);
					if (input?.signal) f.signals.push(input.signal);
					await f.beforeActivate?.();
					if ('activate' in f.faults) throw f.faults.activate;
				},
				unload: async (input?: { signal?: AbortSignal }) => {
					f.operations.push(`unload:${name}`);
					if (input?.signal) f.signals.push(input.signal);
					await f.beforeUnload?.();
					if ('unload' in f.faults) throw f.faults.unload;
				},
				streamChat: async function* () {
					f.operations.push(`chat:${name}`);
					if ('chat' in f.faults) throw f.faults.chat;
					yield { contentDelta: `answer:${name}` };
				},
			};
		},
	};
	return { f, dependencies, selection: new ModelSelection(dependencies) };
};

describe('startup model resolution', () => {
	const cases: {
		name: string;
		configured?: string;
		remembered?: string;
		models: string[];
		expected?: string;
		status: ModelSelectionState['status'];
	}[] = [
		{
			name: 'explicit installed beats remembered',
			configured: OTHER,
			remembered: SYNTHETIC_MODEL,
			models: [SYNTHETIC_MODEL, OTHER],
			expected: OTHER,
			status: 'selected',
		},
		{
			name: 'remembered installed without explicit',
			remembered: OTHER,
			models: [SYNTHETIC_MODEL, OTHER],
			expected: OTHER,
			status: 'selected',
		},
		{
			name: 'stale remembered with sole model',
			remembered: MISSING,
			models: [SYNTHETIC_MODEL],
			expected: SYNTHETIC_MODEL,
			status: 'selected',
		},
		{
			name: 'stale remembered with many',
			remembered: MISSING,
			models: [OTHER, SYNTHETIC_MODEL],
			status: 'selection-required',
		},
		{
			name: 'sole installed',
			models: [SYNTHETIC_MODEL],
			expected: SYNTHETIC_MODEL,
			status: 'selected',
		},
		{
			name: 'many without preference',
			models: [OTHER, SYNTHETIC_MODEL],
			status: 'selection-required',
		},
		{ name: 'zero installed', models: [], status: 'no-models' },
		{
			name: 'explicit missing does not fall through',
			configured: MISSING,
			remembered: OTHER,
			models: [OTHER],
			status: 'unavailable',
		},
		{
			name: 'explicit missing with zero installed',
			configured: MISSING,
			models: [],
			status: 'unavailable',
		},
		{
			name: 'stale remembered with zero installed',
			remembered: MISSING,
			models: [],
			status: 'no-models',
		},
	];
	for (const item of cases)
		test(item.name, async () => {
			const { selection, f } = setup(item);
			expect(selection.getModelName()).toBeUndefined();
			const state = await selection.initialize();
			expect(state.status).toBe(item.status);
			expect(selection.getModelName()).toBe(item.expected);
			expect(f.writes).toEqual([]);
			expect(
				f.operations.filter(
					(op) => op.startsWith('activate:') || op.startsWith('unload:') || op.startsWith('chat:'),
				),
			).toEqual([]);
			if (state.status !== 'selected') {
				expect(state.message).toContain('/model');
				await expect(selection.requireModel()).rejects.toThrow(state.message);
			}
		});

	test('provider order cannot resolve multiple installed models', async () => {
		for (const models of [
			[SYNTHETIC_MODEL, OTHER],
			[OTHER, SYNTHETIC_MODEL],
		]) {
			const { selection } = setup({ models });
			expect(await selection.initialize()).toMatchObject({
				status: 'selection-required',
				message: expect.stringContaining('Use /model'),
			});
		}
	});

	test('provider discovery failure is nonfatal, retains cause, and does not suggest swapping models', async () => {
		const { selection, f } = setup();
		f.faults.list = new Error('provider unreachable');
		const state = await selection.initialize();
		expect(state).toEqual({
			status: 'unresolved',
			message: 'Could not resolve available models: provider unreachable',
		});
		await expect(selection.requireModel()).rejects.toThrow('provider unreachable');
		expect(JSON.stringify(state)).not.toContain('/model');
		delete f.faults.list;
		await expect(selection.switchModel(SYNTHETIC_MODEL)).resolves.toBe(SYNTHETIC_MODEL);
	});
});

describe('manual selection lifecycle', () => {
	test('validates, unloads, confirms activation, commits and then remembers the normalized selection', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		f.beforeActivate = async () => {
			entered.resolve();
			await release.promise;
		};
		f.operations.length = 0;
		const signal = new AbortController().signal;
		const switching = selection.switchModel(` ${OTHER} `, signal);
		try {
			await entered.promise;
			expect(f.operations).toEqual([
				'list',
				`unload:${SYNTHETIC_MODEL}`,
				`create:${OTHER}`,
				`activate:${OTHER}`,
			]);
			expect(selection.getModelName()).toBeUndefined();
			expect(f.writes).toEqual([]);
			release.resolve();
			expect(await switching).toBe(OTHER);
			expect(selection.getModelName()).toBe(OTHER);
			expect(f.signals).toEqual([signal, signal]);
			expect(f.writes).toEqual([OTHER]);
			expect(
				await collectAsyncIterable(
					selection.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
				),
			).toEqual([{ contentDelta: `answer:${OTHER}` }]);
		} finally {
			release.resolve();
		}
	});

	test('unavailable selection is rejected before unload, activation or preference update', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		f.operations.length = 0;
		await expect(selection.switchModel(MISSING)).rejects.toThrow('unavailable. Use /model');
		expect(selection.getModelName()).toBe(SYNTHETIC_MODEL);
		expect(f.operations).toEqual(['list']);
		expect(f.writes).toEqual([]);
	});

	test('stale current still unloads as desired state and can switch to an installed model', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		f.models = [OTHER];
		await expect(selection.switchModel(OTHER)).resolves.toBe(OTHER);
		expect(f.operations).toContain(`unload:${SYNTHETIC_MODEL}`);
		expect(selection.getModelName()).toBe(OTHER);
		expect(f.writes).toEqual([OTHER]);
	});

	test('unrelated unload failure remains the actual failure and retains a valid old selection', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		const cause = new Error('server failed during unload');
		f.faults.unload = cause;
		await expect(selection.switchModel(OTHER)).rejects.toBe(cause);
		expect(selection.getModelName()).toBe(SYNTHETIC_MODEL);
		expect(f.operations).not.toContain(`activate:${OTHER}`);
		expect(f.writes).toEqual([]);
		expect(cause.message).not.toContain('/model');
	});

	for (const kind of ['model', 'transport', 'construction'] as const)
		test(`${kind} activation path failure never commits or remembers attempted model after unload`, async () => {
			const { selection, f } = setup({ configured: SYNTHETIC_MODEL, remembered: SYNTHETIC_MODEL });
			await selection.initialize();
			const cause =
				kind === 'model'
					? new ModelUseError('unsupported', 'cannot load selected model')
					: new Error(`${kind} failed`);
			f.faults[kind === 'construction' ? 'create' : 'activate'] = cause;
			await expect(selection.switchModel(OTHER)).rejects.toBe(cause);
			expect(selection.getModelName()).toBeUndefined();
			expect(f.writes).toEqual([]);
			expect(f.remembered).toBe(SYNTHETIC_MODEL);
			if (kind === 'model')
				expect(cause.message).toBe(
					'cannot load selected model Use /model to choose another installed model.',
				);
			else expect(cause.message).not.toContain('/model');
		});

	test('same-model activation failure cannot retain an unavailable selected model', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		f.faults.activate = new ModelUseError('unavailable', 'model disappeared');
		await expect(selection.switchModel(SYNTHETIC_MODEL)).rejects.toThrow('model disappeared');
		expect(selection.getModelName()).toBeUndefined();
		expect(f.writes).toEqual([]);
		expect(f.operations).not.toContain(`unload:${SYNTHETIC_MODEL}`);
	});

	test('successful manual recovery replaces unresolved state but leaves external configuration unchanged on restart', async () => {
		const { selection, f, dependencies } = setup({ configured: MISSING });
		expect((await selection.initialize()).status).toBe('unavailable');
		expect(await selection.switchModel(OTHER)).toBe(OTHER);
		expect(selection.getModelSelection()).toEqual({ status: 'selected', modelName: OTHER });
		expect(f.remembered).toBe(OTHER);
		const restart = new ModelSelection(dependencies);
		expect((await restart.initialize()).status).toBe('unavailable');
		expect(restart.getModelName()).toBeUndefined();
	});

	test('fresh runtime restores remembered successful selection without eager provider activation', async () => {
		const { selection, f, dependencies } = setup();
		await selection.initialize();
		await selection.switchModel(OTHER);
		f.operations.length = 0;
		const restart = new ModelSelection(dependencies);
		expect(await restart.initialize()).toEqual({ status: 'selected', modelName: OTHER });
		expect(f.operations).toEqual(['list', `create:${OTHER}`]);
		f.models = [SYNTHETIC_MODEL];
		expect(await new ModelSelection(dependencies).initialize()).toEqual({
			status: 'selected',
			modelName: SYNTHETIC_MODEL,
		});
	});

	test('preference write failure warns without invalidating a confirmed activation', async () => {
		const { selection, f } = setup();
		f.faults.write = new Error('disk full');
		await expect(selection.switchModel(OTHER)).resolves.toBe(OTHER);
		expect(selection.getModelSelection()).toMatchObject({
			status: 'selected',
			modelName: OTHER,
			warning: expect.stringContaining('disk full'),
		});
		expect(f.writes).toEqual([]);
	});

	test('blank and already-aborted selections have no provider effects', async () => {
		const { selection, f } = setup();
		await expect(selection.switchModel(' \t ')).rejects.toThrow('Model name cannot be empty');
		const request = new AbortController();
		request.abort('custom reason');
		await expect(selection.switchModel(OTHER, request.signal)).rejects.toHaveProperty(
			'name',
			'AbortError',
		);
		expect(f.operations).toEqual([]);
		expect(f.writes).toEqual([]);
	});

	for (const boundary of [
		'during unload',
		'after unload',
		'construction',
		'activation',
		'after activation',
	] as const)
		test(`cancellation ${boundary} never claims rollback or remembers the attempted model`, async () => {
			const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
			await selection.initialize();
			const request = new AbortController();
			if (boundary === 'during unload')
				f.beforeUnload = async () => {
					request.abort('custom');
					throw request.signal.reason;
				};
			if (boundary === 'after unload')
				f.beforeUnload = async () => {
					request.abort('custom');
				};
			if (boundary === 'construction') f.onCreate = () => request.abort('custom');
			if (boundary === 'activation')
				f.beforeActivate = async () => {
					request.abort('custom');
					throwIfAborted(request.signal);
				};
			if (boundary === 'after activation')
				f.beforeActivate = async () => {
					request.abort('custom');
				};
			await expect(selection.switchModel(OTHER, request.signal)).rejects.toHaveProperty(
				'name',
				'AbortError',
			);
			expect(selection.getModelName()).toBe(
				boundary === 'during unload' ? SYNTHETIC_MODEL : undefined,
			);
			expect(f.writes).toEqual([]);
		});

	test('independent unload error is preserved even if cancellation is pending', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		const request = new AbortController();
		const cause = new Error('independent provider error');
		f.beforeUnload = async () => {
			request.abort('custom');
			throw cause;
		};
		await expect(selection.switchModel(OTHER, request.signal)).rejects.toBe(cause);
		expect(selection.getModelName()).toBe(SYNTHETIC_MODEL);
	});

	test('concurrent manual switches serialize activation and preference commits', async () => {
		const { selection, f } = setup();
		const entered = createDeferred<void>();
		const release = createDeferred<void>();
		f.beforeActivate = async () => {
			entered.resolve();
			await release.promise;
		};
		const first = selection.switchModel(SYNTHETIC_MODEL);
		const second = selection.switchModel(OTHER);
		await entered.promise;
		expect(f.operations).not.toContain(`activate:${OTHER}`);
		release.resolve();
		expect(await Promise.all([first, second])).toEqual([SYNTHETIC_MODEL, OTHER]);
		expect(f.writes).toEqual([SYNTHETIC_MODEL, OTHER]);
		expect(selection.getModelName()).toBe(OTHER);
	});
});

describe('runtime availability and inference', () => {
	test('a disappeared active model clears selection at a fresh turn boundary with /model guidance', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		f.models = [OTHER];
		await expect(selection.requireModel()).rejects.toThrow(
			'Selected model "test-model" is unavailable. Use /model',
		);
		expect(selection.getModelName()).toBeUndefined();
		expect(f.writes).toEqual([]);
		await selection.switchModel(OTHER);
		expect(selection.getModelSelection()).toEqual({ status: 'selected', modelName: OTHER });
	});

	test('a provider model-not-found during inference clears selection and keeps the recovery hint', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		f.faults.chat = new ModelUseError('unavailable', 'provider reports missing model');
		await expect(
			collectAsyncIterable(
				selection.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
			),
		).rejects.toThrow('provider reports missing model Use /model');
		expect(selection.getModelName()).toBeUndefined();
		delete f.faults.chat;
		await selection.switchModel(OTHER);
		expect(selection.getModelSelection()).toEqual({ status: 'selected', modelName: OTHER });
	});

	test('inference transport failure retains valid selection and the original error without false guidance', async () => {
		const { selection, f } = setup({ configured: SYNTHETIC_MODEL });
		await selection.initialize();
		const cause = new Error('network outage');
		f.faults.chat = cause;
		await expect(
			collectAsyncIterable(
				selection.streamChat({ contextProfile: TEST_CONTEXT_PROFILE, messages: [] }),
			),
		).rejects.toBe(cause);
		expect(selection.getModelName()).toBe(SYNTHETIC_MODEL);
		expect(cause.message).not.toContain('/model');
	});
});

test('an older catalog refresh cannot clear a more recently confirmed model selection', async () => {
	const { f, dependencies } = setup();
	const old = createDeferred<{ models: { name: string }[] }>();
	let calls = 0;
	dependencies.catalog.listModels = async () =>
		++calls === 1 ? old.promise : { models: [{ name: SYNTHETIC_MODEL }, { name: OTHER }] };
	const selection = new ModelSelection(dependencies);
	const oldListing = selection.listModels({ forceRefresh: true });
	await selection.switchModel(OTHER);
	old.resolve({ models: [{ name: SYNTHETIC_MODEL }] });
	await oldListing;
	expect(selection.getModelName()).toBe(OTHER);
	expect(f.writes).toEqual([OTHER]);
	expect((await selection.listModels()).models).toEqual([
		{ name: SYNTHETIC_MODEL },
		{ name: OTHER },
	]);
});
