import { describe, expect, test } from 'bun:test';

import { createRuntime } from './createRuntime';

describe('createRuntime', () => {
	test('exposes and switches the active model name', () => {
		const runtime = createRuntime({
			OLLAMA_BASE_URL: 'http://localhost:11434',
			OLLAMA_MODEL: 'initial-model',
			SYSTEM_PROMPT: 'You are a local coding agent.',
		});

		expect(runtime.getModelName()).toBe('initial-model');
		expect(runtime.workspacePath).toBe(process.cwd());
		expect(runtime.switchModel('  next-model  ')).toBe('next-model');
		expect(runtime.getModelName()).toBe('next-model');
		expect(() => runtime.switchModel(' ')).toThrow(
			'Ollama model name cannot be empty.',
		);
	});
});
