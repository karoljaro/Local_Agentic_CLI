import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';

import { Markdown } from './Markdown';

const renderMarkdown = (source: string): string => {
	return Bun.stripANSI(renderToString(<Markdown>{source}</Markdown>));
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
});
