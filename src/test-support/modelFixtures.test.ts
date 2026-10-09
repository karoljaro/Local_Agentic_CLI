import { expect, test } from 'bun:test';
import { requireLiveTestModel, SYNTHETIC_MODEL } from './modelFixtures';

test('synthetic model is stable regardless of live TEST_MODEL or application configuration', () => {
	const previous = process.env['TEST_MODEL'];
	try {
		process.env['TEST_MODEL'] = 'local-live-model';
		expect(SYNTHETIC_MODEL).toBe('test-model');
		expect(requireLiveTestModel()).toBe('local-live-model');
		process.env['TEST_MODEL'] = '';
		expect(SYNTHETIC_MODEL).toBe('test-model');
	} finally {
		if (previous === undefined) delete process.env['TEST_MODEL'];
		else process.env['TEST_MODEL'] = previous;
	}
});

test('live helper uses exactly trimmed TEST_MODEL without an installed/configured fallback', () => {
	expect(
		requireLiveTestModel({ TEST_MODEL: ' live-model:fixture ', OLLAMA_MODEL: 'other-model' }),
	).toBe('live-model:fixture');
	for (const env of [
		{},
		{ TEST_MODEL: '' },
		{ TEST_MODEL: ' \t ' },
		{ OLLAMA_MODEL: 'other-model' },
	]) {
		expect(() => requireLiveTestModel(env)).toThrow(
			'No live test model configured. Set TEST_MODEL=<installed-model>.',
		);
	}
});
