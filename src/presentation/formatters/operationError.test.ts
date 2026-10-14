import { expect, test } from 'bun:test';
import { errorDetailsText, operationError, safeDiagnosticText } from './operationError';

test('operation diagnostics preserve actual messages and codes, bounded causes, without stacks or arbitrary objects', () => {
	const cause = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
	const error = new Error('discovery failed', { cause });
	Object.assign(error, {
		request: { body: 'private prompt' },
		environment: { SECRET: 'private environment' },
	});
	const mapped = operationError(
		'Could not load models',
		'Ollama — model discovery',
		'The model list could not be retrieved.',
		error,
	);
	expect(mapped.details).toContain('discovery failed');
	expect(mapped.details).toContain('connection refused');
	expect(mapped.details).toContain('Code: ECONNREFUSED');
	expect(mapped.details).not.toContain('private');
	expect(mapped.details).not.toContain(' at ');
	expect(mapped.details).not.toContain('HTTP');
	expect(errorDetailsText(mapped)).toContain('Operation: Ollama — model discovery');
	const cycle = new Error('cycle');
	Object.assign(cycle, { cause: cycle });
	expect(operationError('title', 'op', 'summary', cycle).details.match(/cycle/g)).toHaveLength(3);
	expect(operationError('title', 'op', 'summary', { body: 'private' }).details).not.toContain(
		'private',
	);
});

test('details escape terminal controls and bidi overrides, retain Unicode/newlines, and redact known credential fields', () => {
	const raw =
		'café 漢字🙂\r\nnext\tline\x1b]52;c;secret\x07\u202e\nAuthorization: Bearer abc\nAPI_KEY=xyz\n{"access_token":"hidden","password":"private"}\nhttps://user:pass@host/path?token=sensitive';
	const safe = safeDiagnosticText(raw);
	expect(safe).toContain('café 漢字🙂\nnext\\tline');
	for (const secret of ['abc', 'xyz', 'hidden', 'private', 'user:pass', 'sensitive'])
		expect(safe).not.toContain(secret);
	expect(safe).toContain('[redacted]');
	expect(safe).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202e]/);
});

test('long diagnostics have an explicit bounded truncation marker for display and copy', () => {
	const error = operationError('title', 'operation', 'summary', new Error('🙂'.repeat(20_000)));
	expect(error.details.length).toBeLessThanOrEqual(16_384);
	expect(error.details).toEndWith('[Details truncated]');
	const copy = errorDetailsText(error);
	expect(copy.length).toBeLessThanOrEqual(16_384);
	expect(copy).toEndWith('[Details truncated]');
	expect(copy).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
});
