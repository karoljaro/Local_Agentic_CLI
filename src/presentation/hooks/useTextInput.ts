import { useCallback, useState } from 'react';
import { useInput, usePaste, type Key } from 'ink';

type UseTextInputOptions = {
	isActive: boolean;
	onSubmit: (value: string) => void;
};

type TextInputState = {
	cursorIndex: number;
	value: string;
};

const EMPTY_INPUT_STATE: TextInputState = {
	cursorIndex: 0,
	value: '',
};

export const useTextInput = ({ isActive, onSubmit }: UseTextInputOptions) => {
	const [state, setState] = useState<TextInputState>(EMPTY_INPUT_STATE);

	const clearInput = useCallback((): void => {
		setState(EMPTY_INPUT_STATE);
	}, []);

	const insertText = useCallback((text: string): void => {
		if (text.length === 0) {
			return;
		}

		setState((currentState) => insertAtCursor(currentState, text));
	}, []);

	usePaste(
		(text) => {
			insertText(normalisePaste(text));
		},
		{ isActive },
	);

	useInput(
		(value, key) => {
			if (key.return) {
				const prompt = state.value.trim();

				if (prompt.length === 0) {
					return;
				}

				clearInput();
				onSubmit(prompt);
				return;
			}

			if (key.ctrl && value === 'a') {
				setState((currentState) => moveCursor(currentState, 0));
				return;
			}

			if (key.ctrl && value === 'e') {
				setState((currentState) => moveCursor(currentState, currentState.value.length));
				return;
			}

			if (key.ctrl && value === 'u') {
				clearInput();
				return;
			}

			if (key.leftArrow) {
				setState((currentState) => moveCursor(currentState, currentState.cursorIndex - 1));
				return;
			}

			if (key.rightArrow) {
				setState((currentState) => moveCursor(currentState, currentState.cursorIndex + 1));
				return;
			}

			if (key.home) {
				setState((currentState) => moveCursor(currentState, 0));
				return;
			}

			if (key.end) {
				setState((currentState) => moveCursor(currentState, currentState.value.length));
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

			if (isControlKey(key)) {
				return;
			}

			insertText(value);
		},
		{ isActive },
	);

	return {
		cursorIndex: state.cursorIndex,
		input: state.value,
	};
};

const insertAtCursor = (state: TextInputState, text: string): TextInputState => {
	const beforeCursor = state.value.slice(0, state.cursorIndex);
	const afterCursor = state.value.slice(state.cursorIndex);

	return {
		cursorIndex: state.cursorIndex + text.length,
		value: `${beforeCursor}${text}${afterCursor}`,
	};
};

const deleteBeforeCursor = (state: TextInputState): TextInputState => {
	if (state.cursorIndex === 0) {
		return state;
	}

	return {
		cursorIndex: state.cursorIndex - 1,
		value: `${state.value.slice(0, state.cursorIndex - 1)}${state.value.slice(state.cursorIndex)}`,
	};
};

const deleteAtCursor = (state: TextInputState): TextInputState => {
	if (state.cursorIndex >= state.value.length) {
		return state;
	}

	return {
		cursorIndex: state.cursorIndex,
		value: `${state.value.slice(0, state.cursorIndex)}${state.value.slice(state.cursorIndex + 1)}`,
	};
};

const moveCursor = (state: TextInputState, cursorIndex: number): TextInputState => {
	return {
		...state,
		cursorIndex: clamp(cursorIndex, 0, state.value.length),
	};
};

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

const normalisePaste = (text: string): string => {
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
