import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';
import { Children, type ReactElement, type ReactNode } from 'react';

import { asSessionId } from '@/domain/Ids';
import { COMMANDS } from '../commands/commands';
import { Composer } from './Composer';

describe('Composer visual hierarchy', () => {
	test('stretches its root, input surface, and dropdown surface to the available width', () => {
		const composer = Composer(createComposerProps()) as ReactElement<LayoutProps>;
		const surface = Children.toArray(composer.props.children)[0] as ReactElement<LayoutProps>;
		const [inputSurface, dropdownSurface] = Children.toArray(
			surface.props.children,
		) as ReactElement<LayoutProps>[];

		expect(composer.props.alignSelf).toBe('stretch');
		expect(composer.props.width).toBe('100%');
		expect(surface.props.width).toBe('100%');
		expect(inputSurface?.props.width).toBe('100%');
		expect(dropdownSurface?.props.width).toBe('100%');
	});

	test('keeps one presentation-only cell between the empty cursor and placeholder', () => {
		const output = Bun.stripANSI(
			renderComposer(60, { commandMenuVisible: false, cursorIndex: 0, value: '' }),
		);

		expect(output).toContain('›   Ask about this workspace…');
	});

	test('renders entered text without adding the empty-state spacer to its value', () => {
		const output = Bun.stripANSI(
			renderComposer(60, { commandMenuVisible: false, cursorIndex: 2, value: 'hello' }),
		);

		expect(output).toContain('› hello');
		expect(output).not.toContain('›  hello');
	});

	test('anchors the command dropdown between input and secondary composer text', () => {
		const output = Bun.stripANSI(renderComposer(60));
		const inputIndex = output.indexOf('› /');
		const menuIndex = output.indexOf('/model [name]');
		const helpIndex = output.indexOf('Enter open');
		const metadataIndex = output.indexOf('model current-model');

		expect(inputIndex).toBeGreaterThanOrEqual(0);
		expect(menuIndex).toBeGreaterThan(inputIndex);
		expect(helpIndex).toBeGreaterThan(menuIndex);
		expect(metadataIndex).toBeGreaterThan(helpIndex);
	});

	test('centers the input in the same three-row surface when closed, open, and resized', () => {
		for (const columns of [60, 28]) {
			const openOutput = Bun.stripANSI(renderComposer(columns));
			const closedOutput = Bun.stripANSI(renderComposer(columns, { commandMenuVisible: false }));
			const openLines = openOutput.split('\n');
			const closedLines = closedOutput.split('\n');

			expect(openLines.slice(0, 4)).toEqual(closedLines.slice(0, 4));
			expect(closedLines[0]).toBe('');
			expect(closedLines[1]).toBe('');
			expect(closedLines[2]).toContain('› /');
			expect(closedLines[3]).toBe('');
			expect(closedLines[4]).toBe('');
			expect(closedLines[5]).toContain('Enter send');
			expect(openLines[4]).toContain('/model [name]');
			expect(Math.max(...openLines.map((line) => line.length))).toBeLessThanOrEqual(columns);
			expect(Math.max(...closedLines.map((line) => line.length))).toBeLessThanOrEqual(columns);
			expect(openOutput).toContain('Esc close\n\n\n  Enter send');
			expect(closedOutput).not.toContain('\n │\n  Enter send');
		}
	});

	test('keeps the vertical focus accent on the input instead of the expanded menu', () => {
		for (const columns of [60, 28]) {
			const lines = Bun.stripANSI(renderComposer(columns)).split('\n');
			const composerHelpIndex = lines.findIndex((line) => line.includes('Enter send'));

			expect(lines[2]).toContain('│');
			expect(composerHelpIndex).toBeGreaterThan(4);
			expect(lines.slice(4, composerHelpIndex).every((line) => !line.includes('│'))).toBe(true);
		}
	});

	test('keeps active and inactive commands plus metadata inside a narrow terminal', () => {
		const modelSelected = Bun.stripANSI(renderComposer(28));
		const resumeSelected = Bun.stripANSI(renderComposer(28, { selectedIndex: 1 }));

		for (const output of [modelSelected, resumeSelected]) {
			expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThanOrEqual(28);
			expect(output).toContain('Choose');
			expect(output).toContain('a local model');
			expect(output).toContain('model current-model');
		}
		expect(modelSelected).toContain('› /model [name]');
		expect(modelSelected).toContain('    /resume');
		expect(resumeSelected).toContain('   /model [name]');
		expect(resumeSelected).toContain('›  /resume');
	});
});

type RenderComposerOptions = {
	commandMenuVisible?: boolean;
	cursorIndex?: number;
	selectedIndex?: number;
	value?: string;
};

type LayoutProps = {
	alignSelf?: string;
	children?: ReactNode;
	width?: number | string;
};

const createComposerProps = (options: RenderComposerOptions = {}) => ({
	canSubmit: true,
	commandMenu: {
		isVisible: options.commandMenuVisible ?? true,
		items: [...COMMANDS],
		selectedIndex: options.selectedIndex ?? 0,
	},
	cursorIndex: options.cursorIndex ?? 1,
	isFocused: true,
	modelName: 'current-model',
	sessionId: asSessionId('session-1'),
	turnStatus: 'idle' as const,
	value: options.value ?? '/',
	workspacePath: '/workspace',
});

const renderComposer = (columns: number, options: RenderComposerOptions = {}): string => {
	return renderToString(<Composer {...createComposerProps(options)} />, { columns });
};
