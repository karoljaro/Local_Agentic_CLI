import { readConfig } from '@/composition/config';
import { OllamaModelRuntime } from '@/composition/model/OllamaModelRuntime';
import { OllamaModelAdapter } from '@/infrastructure/model/OllamaModelAdapter';
import { JsonModelPreferenceStore } from '@/infrastructure/persistence/JsonModelPreferenceStore';
import { createTempDirectory } from '@/test-support/createTempDirectory';
import { requireLiveTestModel } from '@/test-support/modelFixtures';
import { join } from 'node:path';

// Optional and bounded: no inference, downloads, arbitrary model fallback, retries or benchmarks.
const smoke = async (): Promise<void> => {
	let modelName: string;
	try {
		modelName = requireLiveTestModel();
	} catch (error) {
		console.log(`SKIP: ${(error as Error).message}`);
		return;
	}
	console.log(`Live test model: ${modelName}`);
	const signal = AbortSignal.timeout(20_000);
	const temp = await createTempDirectory('codesh-model-smoke-');
	try {
		const base = readConfig();
		const preference = new JsonModelPreferenceStore(
			join(temp.directory, '.agent', 'model-preference.json'),
		);
		// A unique nonexistent synthetic identifier never deletes or changes installed artifacts.
		const stale = `codesh-smoke-absent-${crypto.randomUUID()}`;
		const runtime = new OllamaModelRuntime({ ...base, OLLAMA_MODEL: stale }, preference);
		const state = await runtime.initialize(signal);
		if (state.status !== 'unavailable')
			throw new Error(`Expected unavailable configured model; got ${JSON.stringify(state)}`);
		const { models } = await runtime.listModels({ signal });
		console.log(`Installed models: ${models.map((model) => model.name).join(', ') || '(none)'}`);
		if (!models.some((model) => model.name === modelName))
			throw new Error(
				`Live test model "${modelName}" is unavailable. Set TEST_MODEL=<installed-model>.`,
			);
		await new OllamaModelAdapter(base.OLLAMA_BASE_URL, stale).unload({ signal });
		if ((await runtime.switchModel(modelName, signal)) !== modelName)
			throw new Error('Manual selection did not commit.');
		const restart = new OllamaModelRuntime(
			{ ...base, OLLAMA_MODEL: undefined },
			new JsonModelPreferenceStore(join(temp.directory, '.agent', 'model-preference.json')),
		);
		await restart.initialize(signal);
		if (restart.getModelName() !== modelName)
			throw new Error('Restart did not restore remembered model.');
		console.log(
			'PASS: absent-old unload, manual activation, truthful selection and remembered restart.',
		);
	} finally {
		await temp.cleanup();
	}
};

try {
	await smoke();
} catch (error) {
	console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
