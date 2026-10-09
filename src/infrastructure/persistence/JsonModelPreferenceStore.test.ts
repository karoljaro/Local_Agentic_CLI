import { expect, test } from 'bun:test';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { SYNTHETIC_MODEL } from '@/test-support/modelFixtures';
import { ModelSelection } from '@/application/services/ModelSelection';
import { JsonModelPreferenceStore } from './JsonModelPreferenceStore';

const selectionFor = (store: JsonModelPreferenceStore) =>
	new ModelSelection({
		preference: store,
		catalog: {
			listModels: async () => ({ models: [{ name: SYNTHETIC_MODEL }, { name: 'other-model' }] }),
		},
		createModel: () => ({
			activate: async () => undefined,
			unload: async () => undefined,
			streamChat: async function* () {
				yield { contentDelta: 'answer' };
			},
		}),
	});

test('missing preference is nonfatal; successful activation survives restart separately from all sessions', async () => {
	const temp = await createTempDirectory('model-preference-');
	const path = join(temp.directory, '.agent', 'model-preference.json');
	try {
		const first = new JsonModelPreferenceStore(path);
		expect(await first.readLastSelectedModel()).toBeUndefined();
		const runtime = selectionFor(first);
		expect((await runtime.initialize()).status).toBe('selection-required');
		await runtime.switchModel(SYNTHETIC_MODEL);
		expect(await readFile(path, 'utf8')).toBe(
			JSON.stringify({ lastSelectedModel: SYNTHETIC_MODEL }) + '\n',
		);
		expect(await readdir(join(temp.directory, '.agent'))).toEqual(['model-preference.json']);
		expect(await selectionFor(new JsonModelPreferenceStore(path)).initialize()).toEqual({
			status: 'selected',
			modelName: SYNTHETIC_MODEL,
		});
	} finally {
		await temp.cleanup();
	}
});

for (const content of [
	'{',
	'null',
	'[]',
	'{}',
	'{"lastSelectedModel":42}',
	'{"lastSelectedModel":"  "}',
	'{"lastSelectedModel":null}',
]) {
	test(`corrupt or invalid preference is ignored and can be replaced: ${content}`, async () => {
		const temp = await createTempDirectory('corrupt-model-preference-');
		const path = join(temp.directory, 'model-preference.json');
		try {
			await writeFile(path, content);
			const store = new JsonModelPreferenceStore(path);
			expect(await store.readLastSelectedModel()).toBeUndefined();
			const runtime = selectionFor(store);
			expect((await runtime.initialize()).status).toBe('selection-required');
			await runtime.switchModel(SYNTHETIC_MODEL);
			expect(await new JsonModelPreferenceStore(path).readLastSelectedModel()).toBe(
				SYNTHETIC_MODEL,
			);
		} finally {
			await temp.cleanup();
		}
	});
}

test('atomic replacement overwrites the previous complete value and leaves no temporary file', async () => {
	const temp = await createTempDirectory('atomic-model-preference-');
	try {
		const path = join(temp.directory, 'model-preference.json');
		const store = new JsonModelPreferenceStore(path);
		await store.writeLastSelectedModel('old-model');
		await store.writeLastSelectedModel(` ${SYNTHETIC_MODEL} `);
		expect(await store.readLastSelectedModel()).toBe(SYNTHETIC_MODEL);
		expect(await readdir(temp.directory)).toEqual(['model-preference.json']);
	} finally {
		await temp.cleanup();
	}
});

test('rename failure removes the owned temporary file and leaves runtime activation successful with a warning', async () => {
	const temp = await createTempDirectory('failed-model-preference-');
	try {
		const path = join(temp.directory, 'blocked.json');
		await mkdir(path);
		const store = new JsonModelPreferenceStore(path);
		expect(await store.readLastSelectedModel()).toBeUndefined();
		const runtime = selectionFor(store);
		await expect(runtime.switchModel(SYNTHETIC_MODEL)).resolves.toBe(SYNTHETIC_MODEL);
		expect(runtime.getModelSelection()).toMatchObject({
			status: 'selected',
			modelName: SYNTHETIC_MODEL,
			warning: expect.stringContaining('could not remember'),
		});
		expect(await readdir(temp.directory)).toEqual(['blocked.json']);
	} finally {
		await temp.cleanup();
	}
});
