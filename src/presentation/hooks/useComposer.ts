import { useCallback, useEffect, useRef, useState } from 'react';
import { useInput, usePaste, type Key } from 'ink';

export type ComposerState = {
	value: string;
	cursorIndex: number;
};

type UseComposerOptions = {
	isActive: boolean;
	canSubmit: boolean;
	onSubmit: (value: string) => boolean;
};

const EMPTY_COMPOSER: ComposerState = { value: '', cursorIndex: 0 };

export const useComposer = ({ isActive, canSubmit, onSubmit }: UseComposerOptions) => {
	const [state, setState] = useState<ComposerState>(EMPTY_COMPOSER);
	const submissionLockedRef = useRef(false);

	useEffect(() => {
		if (canSubmit) {
			submissionLockedRef.current = false;
		}
	}, [canSubmit]);

	const clear = useCallback(() => setState(EMPTY_COMPOSER), []);
	const setValue = useCallback((value: string) => {
		setState({ value, cursorIndex: value.length });
	}, []);
	const insert = useCallback((text: string) => {
		if (text.length > 0) {
			setState((current) => insertAtCursor(current, text));
		}
	}, []);

	usePaste((text) => insert(normalizePaste(text)), { isActive });
	useInput(
		(value, key) => {
			if (key.return) {
				const submitted = state.value.trim();
				if (submitted.length === 0 || !canSubmit || submissionLockedRef.current) {
					return;
				}

				submissionLockedRef.current = true;
				if (onSubmit(submitted)) {
					clear();
				}
				return;
			}

			if (key.ctrl && value === 'a') {
				setState((current) => moveCursor(current, 0));
				return;
			}
			if (key.ctrl && value === 'e') {
				setState((current) => moveCursor(current, current.value.length));
				return;
			}
			if (key.ctrl && value === 'u') {
				clear();
				return;
			}
			if (key.leftArrow) {
				setState((current) => moveCursor(current, current.cursorIndex - 1));
				return;
			}
			if (key.rightArrow) {
				setState((current) => moveCursor(current, current.cursorIndex + 1));
				return;
			}
			if (key.home) {
				setState((current) => moveCursor(current, 0));
				return;
			}
			if (key.end) {
				setState((current) => moveCursor(current, current.value.length));
				return;
			}
			if (key.backspace) {
				setState(deleteBeforeCursor);
				return;
			}
			if (key.delete) {
				setState(deleteAtCursor);
				return;
			}
			if (!isControlKey(key)) {
				insert(value);
			}
		},
		{ isActive },
	);

	return { ...state, clear, setValue };
};

export const insertAtCursor = (state: ComposerState, text: string): ComposerState => ({
	value: `${state.value.slice(0, state.cursorIndex)}${text}${state.value.slice(state.cursorIndex)}`,
	cursorIndex: state.cursorIndex + text.length,
});

export const deleteBeforeCursor = (state: ComposerState): ComposerState => {
	if (state.cursorIndex === 0) {
		return state;
	}
	return {
		value: `${state.value.slice(0, state.cursorIndex - 1)}${state.value.slice(state.cursorIndex)}`,
		cursorIndex: state.cursorIndex - 1,
	};
};

export const deleteAtCursor = (state: ComposerState): ComposerState => {
	if (state.cursorIndex >= state.value.length) {
		return state;
	}
	return {
		value: `${state.value.slice(0, state.cursorIndex)}${state.value.slice(state.cursorIndex + 1)}`,
		cursorIndex: state.cursorIndex,
	};
};

const moveCursor = (state: ComposerState, cursorIndex: number): ComposerState => ({
	...state,
	cursorIndex: Math.min(state.value.length, Math.max(0, cursorIndex)),
});

const normalizePaste = (text: string): string => {
	return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
};

const isControlKey = (key: Key): boolean => {
	return (
		key.ctrl ||
		key.meta ||
		key.super ||
		key.hyper ||
		key.tab ||
		key.escape ||
		key.upArrow ||
		key.downArrow ||
		key.pageUp ||
		key.pageDown
	);
};
