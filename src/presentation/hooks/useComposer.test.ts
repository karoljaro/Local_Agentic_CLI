import { describe, expect, test } from 'bun:test';

import { deleteAtCursor, deleteBeforeCursor, insertAtCursor } from './useComposer';

describe('composer editing', () => {
	test('inserts and deletes around the cursor without losing text', () => {
		const inserted = insertAtCursor({ value: 'helo', cursorIndex: 3 }, 'l');
		expect(inserted).toEqual({ value: 'hello', cursorIndex: 4 });
		expect(deleteBeforeCursor(inserted)).toEqual({ value: 'helo', cursorIndex: 3 });
		expect(deleteAtCursor({ value: 'hello', cursorIndex: 1 })).toEqual({
			value: 'hllo',
			cursorIndex: 1,
		});
	});
});
