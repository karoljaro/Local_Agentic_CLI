import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';

import { Markdown } from './Markdown';

const renderMarkdown = (source: string, columns = 80): string => {
	return Bun.stripANSI(renderToString(<Markdown>{source}</Markdown>, { columns }));
};

describe('Markdown', () => {
	test('renders headings, lists, inline code, and copyable fenced code', () => {
		const output = renderMarkdown(
			'# Result\n\n- first `value`\n- second\n\n```ts\nconst answer = 42;\n```',
		);

		expect(output).toContain('Result');
		expect(output).toContain('• first  value');
		expect(output).toContain('ts');
		expect(output).toContain('const answer = 42;');
	});

	test('suppresses raw HTML content', () => {
		const output = renderMarkdown('<script>hidden()</script>\n\nVisible');
		expect(output).not.toContain('hidden');
		expect(output).toContain('Visible');
	});

	test('wraps paragraphs and code within a narrow terminal', () => {
		const output = renderMarkdown(
			'Long paragraph with enough words to wrap safely.\n\n```ts\nconst longName = "abcdefghijklmnop";\n```',
			24,
		);

		expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThanOrEqual(24);
		expect(output).toContain('const longName');
	});
});
