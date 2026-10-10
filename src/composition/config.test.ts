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
		expect(prompt).toContain('choose tools');
		expect(prompt).toContain('correctable tool errors autonomously');
		expect(prompt).toContain('known paths directly');
		expect(prompt).toContain('user-visible ambiguity');
		expect(prompt).toContain('Respect denials');
		expect(prompt).toContain('actual arguments and error');
		expect(prompt.length).toBeLessThanOrEqual(400);
		expect(prompt).not.toMatch(/ollama|qwen|gemma|llama|ministral/i);
	});

	test('uses defaults when env values are missing', () => {
		expect(readConfig({})).toEqual({
			OLLAMA_BASE_URL: 'http://localhost:11434',
			OLLAMA_KEEP_ALIVE: '0',
			SYSTEM_PROMPT:
				'Use workspace-relative paths. For clear requests, choose tools and recover from correctable tool errors autonomously. Use known paths directly. Ask only about user-visible ambiguity or required information tools cannot safely obtain. Respect denials; stop if safe recovery is unavailable. If asked about a failed call, explain its actual arguments and error, then continue safe unfinished work.',
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

describe('history embedding configuration', () => {
	test('is disabled by default without selecting an embedding model', () => {
		expect(readConfig({}).HISTORY_EMBEDDING_MODEL).toBeUndefined();
	});

	for (const blank of ['', ' \t\n ']) {
		test(`blank embedding configuration disables retrieval: ${JSON.stringify(blank)}`, () => {
			expect(
				readConfig({ HISTORY_EMBEDDING_MODEL: blank }).HISTORY_EMBEDDING_MODEL,
			).toBeUndefined();
		});
	}

	test('trims an explicitly configured embedding model independently of chat', () => {
		const config = readConfig({
			HISTORY_EMBEDDING_MODEL: ' test-embedding-model ',
			OLLAMA_MODEL: ' test-chat-model ',
			TEST_MODEL: ' live-test-only-model ',
		});
		expect(config.HISTORY_EMBEDDING_MODEL).toBe('test-embedding-model');
		expect(config.OLLAMA_MODEL).toBe('test-chat-model');
		expect(config).not.toHaveProperty('TEST_MODEL');
	});

	test('chat and live-test models never supply a hidden embedding fallback', () => {
		for (const env of [
			{ OLLAMA_MODEL: 'test-chat-model' },
			{ TEST_MODEL: 'live-test-only-model' },
			{ OLLAMA_MODEL: 'test-chat-model', TEST_MODEL: 'live-test-only-model' },
		]) {
			expect(readConfig(env).HISTORY_EMBEDDING_MODEL).toBeUndefined();
		}
	});

	test('embedding configuration does not create a chat model or change context defaults', () => {
		const config = readConfig({ HISTORY_EMBEDDING_MODEL: 'test-embedding-model' });
		expect(config.OLLAMA_MODEL).toBeUndefined();
		expect(config.MODEL_CONTEXT_TOKENS).toBe(16_384);
		expect(config.MODEL_MAX_OUTPUT_TOKENS).toBe(4_096);
		expect(config.OLLAMA_KEEP_ALIVE).toBe('0');
	});
});
