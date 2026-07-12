import { describe, expect, test } from 'bun:test';
import { renderToString } from 'ink';

import { asSessionId } from '@/domain/Ids';
import { COMMANDS } from '../commands/commands';
import { Composer } from './Composer';

describe('Composer visual hierarchy', () => {
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

	test('keeps the input, dropdown, and metadata inside a narrow terminal', () => {
		const output = Bun.stripANSI(renderComposer(28));
		expect(Math.max(...output.split('\n').map((line) => line.length))).toBeLessThanOrEqual(28);
		expect(output).toContain('Choose a');
		expect(output).toContain('local model');
		expect(output).toContain('model current-model');
	});
});

const renderComposer = (columns: number): string => {
	return renderToString(
		<Composer
			canSubmit
			commandMenu={{ isVisible: true, items: [...COMMANDS], selectedIndex: 0 }}
			cursorIndex={1}
			isFocused
			modelName="current-model"
			sessionId={asSessionId('session-1')}
			turnStatus="idle"
			value="/"
			workspacePath="/workspace"
		/>,
		{ columns },
	);
};
