import { describe, expect, test } from 'bun:test';

import { readConfig } from './config';

describe('readConfig', () => {
	test('reserves output independently of the daemon 4096-token failure window', () => {
		expect(readConfig({})).toMatchObject({
			MODEL_CONTEXT_TOKENS: 16_384,
			MODEL_MAX_OUTPUT_TOKENS: 4_096,
		});
	});
	test('keeps the default system guidance compact and provider-independent', () => {
		const prompt = readConfig({}).SYSTEM_PROMPT;
		expect(prompt).toContain('workspace-relative');
		expect(prompt.length).toBeLessThanOrEqual(400);
		expect(prompt).not.toMatch(/ollama|gemma|llama/i);
	});

	test('uses defaults when env values are missing', () => {
		expect(readConfig({})).toEqual({
			OLLAMA_BASE_URL: 'http://localhost:11434',
			OLLAMA_KEEP_ALIVE: '0',
			SYSTEM_PROMPT: 'Use workspace-relative paths.',
			MODEL_CONTEXT_TOKENS: 16_384,
			MODEL_MAX_OUTPUT_TOKENS: 4_096,
		});
	});

	for (const blank of ['', ' \t\n ']) {
		test(`uses the same defaults when every env value is blank: ${JSON.stringify(blank)}`, () => {
			expect(
				readConfig({
					OLLAMA_BASE_URL: blank,
					OLLAMA_MODEL: blank,
					OLLAMA_KEEP_ALIVE: blank,
					SYSTEM_PROMPT: blank,
					MODEL_CONTEXT_TOKENS: blank,
					MODEL_MAX_OUTPUT_TOKENS: blank,
				}),
			).toEqual({ ...readConfig({}), OLLAMA_MODEL: undefined });
		});
	}

	test('explicit env values override every production default', () => {
		expect(
			readConfig({
				OLLAMA_BASE_URL: ' http://127.0.0.1:22123/ ',
				OLLAMA_MODEL: ' fixture-model ',
				OLLAMA_KEEP_ALIVE: ' -1 ',
				SYSTEM_PROMPT: ' fixture prompt ',
				MODEL_CONTEXT_TOKENS: ' 8192 ',
				MODEL_MAX_OUTPUT_TOKENS: ' 2048 ',
			}),
		).toEqual({
			OLLAMA_BASE_URL: 'http://127.0.0.1:22123/',
			OLLAMA_MODEL: 'fixture-model',
			OLLAMA_KEEP_ALIVE: '-1',
			SYSTEM_PROMPT: 'fixture prompt',
			MODEL_CONTEXT_TOKENS: 8_192,
			MODEL_MAX_OUTPUT_TOKENS: 2_048,
		});
	});

	test('trims values and treats empty strings as missing', () => {
		expect(
			readConfig({
				OLLAMA_BASE_URL: '  http://localhost:11435  ',
				OLLAMA_MODEL: '  ',
				OLLAMA_KEEP_ALIVE: '  2m  ',
				SYSTEM_PROMPT: '  Custom prompt  ',
				MODEL_CONTEXT_TOKENS: ' 32768 ',
			}),
		).toEqual({
			OLLAMA_BASE_URL: 'http://localhost:11435',
			OLLAMA_MODEL: undefined,
			OLLAMA_KEEP_ALIVE: '2m',
			SYSTEM_PROMPT: 'Custom prompt',
			MODEL_CONTEXT_TOKENS: 32_768,
			MODEL_MAX_OUTPUT_TOKENS: 4_096,
		});
	});

	test('throws a readable error for invalid config', () => {
		expect(() =>
			readConfig({
				OLLAMA_BASE_URL: 'not-a-url',
			}),
		).toThrow('Invalid configuration');
		expect(() => readConfig({ MODEL_CONTEXT_TOKENS: '0' })).toThrow('Invalid configuration');
	});

	for (const invalid of ['0', '-1', '1.5', 'Infinity', 'NaN', 'not-a-number', '9007199254740992']) {
		for (const field of ['MODEL_CONTEXT_TOKENS', 'MODEL_MAX_OUTPUT_TOKENS']) {
			test(`rejects invalid ${field}=${invalid}`, () => {
				expect(() => readConfig({ [field]: invalid })).toThrow('Invalid configuration');
			});
		}
	}
	for (const output of ['8192', '16384']) {
		test(`output must be below the configured window: ${output}`, () => {
			expect(() =>
				readConfig({ MODEL_CONTEXT_TOKENS: '8192', MODEL_MAX_OUTPUT_TOKENS: output }),
			).toThrow('maximum output tokens must be smaller than the context window');
		});
	}
});
