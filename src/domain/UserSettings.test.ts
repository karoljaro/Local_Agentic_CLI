import { expect, test } from 'bun:test';
import {
	EndpointSchema,
	SETTINGS_DEFAULTS,
	SettingsValuesSchema,
	parseSettingsDocument,
	parseSettingInput,
} from './UserSettings';

test('first-run defaults preserve the production input/output/safety budget and automatic model selection', () => {
	expect(SettingsValuesSchema.parse(SETTINGS_DEFAULTS)).toEqual({
		ollamaBaseUrl: 'http://localhost:11434',
		lastSelectedModel: null,
		keepAlive: '0',
		contextWindowTokens: 16384,
		maxOutputTokens: 4096,
	});
	expect(16384 - 4096 - Math.ceil(16384 / 16)).toBe(11264);
	expect(parseSettingsDocument({ version: 1, preferences: {} })).toEqual({
		version: 1,
		preferences: {},
	});
});
for (const value of [
	'http://localhost:11434',
	'https://remote.example:443/ollama/',
	'http://[::1]:11434',
	' https://remote.example/base ',
]) {
	test(`supported endpoint ${value}`, () => expect(EndpointSchema.parse(value)).toBe(value.trim()));
}
for (const value of [
	'',
	'localhost:11434',
	'ftp://example.com',
	'http://user:secret@example.com',
	'http://@example.com',
	'http://localhost:99999',
	'http://',
	'http://bad..host',
	'http://host_with_underscore',
	'http://localhost?token=secret',
	'http://localhost?',
	'http://localhost#',
	'http://local\nhost',
	'http:\\localhost',
	'http://localhost/path with spaces',
]) {
	test(`rejects malformed/unsafe endpoint ${JSON.stringify(value)}`, () =>
		expect(EndpointSchema.safeParse(value).success).toBe(false));
}
for (const patch of [
	{ contextWindowTokens: 0 },
	{ contextWindowTokens: 8191 },
	{ contextWindowTokens: 1048577 },
	{ maxOutputTokens: 0 },
	{ maxOutputTokens: 1.5 },
	{ maxOutputTokens: 262145 },
	{ maxOutputTokens: 16384 },
	{ contextWindowTokens: 8192, maxOutputTokens: 4096 },
	{ contextWindowTokens: 16384, maxOutputTokens: 12288 },
]) {
	test(`rejects invalid application budgets ${JSON.stringify(patch)}`, () =>
		expect(SettingsValuesSchema.safeParse({ ...SETTINGS_DEFAULTS, ...patch }).success).toBe(false));
}
test('a reduced output reservation permits a coherent smaller context', () => {
	expect(
		SettingsValuesSchema.parse({
			...SETTINGS_DEFAULTS,
			contextWindowTokens: 8192,
			maxOutputTokens: 2048,
		}),
	).toMatchObject({ contextWindowTokens: 8192, maxOutputTokens: 2048 });
});
for (const document of [
	{ version: 2, preferences: {} },
	{ version: 1, preferences: {}, unknown: 'secret' },
	{ version: 1, preferences: { testModel: 'diagnostic-only' } },
	{ version: 1, preferences: { lastSelectedModel: 'bad\x1bname' } },
]) {
	test(`unsupported document preserved ${JSON.stringify(document)}`, () =>
		expect(() => parseSettingsDocument(document)).toThrow());
}
test('numeric input is decimal integer input, without coercing blank/float/exponent text', () => {
	for (const text of ['', '2.3', '1e4', '-1', 'Infinity'])
		expect(() => parseSettingInput('contextWindowTokens', text)).toThrow('whole number');
	expect(parseSettingInput('maxOutputTokens', ' 2048 ')).toBe(2048);
});
test('a test-used tag is a valid ordinary selection without a dedicated test preference', () => {
	expect(
		SettingsValuesSchema.parse({ ...SETTINGS_DEFAULTS, lastSelectedModel: 'test-model' })
			.lastSelectedModel,
	).toBe('test-model');
});
