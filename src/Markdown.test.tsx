import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';

import { Markdown } from './Markdown';

const renderMarkdown = (markdown: string, maxWidth = 40): string =>
	Bun.stripANSI(
		renderToString(<Markdown maxWidth={maxWidth}>{markdown}</Markdown>),
	);

describe('Markdown', () => {
	test('renders basic formatting and fenced code', () => {
		const output = renderMarkdown(
			'**Result**\n\n```ts\nconst value = 1;\n```',
		);

		expect(output).toContain('Result');
		expect(output).toContain('ts');
		expect(output).toContain('const value = 1;');
	});

	test('does not render raw HTML', () => {
		const output = renderMarkdown(
			'<script>alert("unsafe")</script>\n\nVisible text',
		);

		expect(output).not.toContain('unsafe');
		expect(output).toContain('Visible text');
	});

	test('keeps tables within the configured width', () => {
		const output = renderMarkdown(
			'| Name | Description |\n| --- | --- |\n| Long value | Long description |',
			24,
		);

		expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThanOrEqual(
			24,
		);
	});
});
