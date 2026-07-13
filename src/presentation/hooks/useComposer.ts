import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInput, usePaste, type Key } from 'ink';
import {
	getCommandSuggestions,
	isCommandMenuInput,
	type CommandDefinition,
} from '../commands/commands';

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
	const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
	const [isCommandMenuDismissed, setCommandMenuDismissed] = useState(false);
	const submissionLockedRef = useRef(false);
	const commandSuggestions = useMemo(() => getCommandSuggestions(state.value), [state.value]);
	const isCommandMenuVisible =
		isActive && !isCommandMenuDismissed && isCommandMenuInput(state.value);

	useEffect(() => {
		if (canSubmit) {
			submissionLockedRef.current = false;
		}
	}, [canSubmit]);

	useEffect(() => {
		setSelectedCommandIndex((current) =>
			Math.min(current, Math.max(0, commandSuggestions.length - 1)),
		);
	}, [commandSuggestions.length]);

	const clear = useCallback(() => {
		setState(EMPTY_COMPOSER);
		setCommandMenuDismissed(false);
		setSelectedCommandIndex(0);
	}, []);
	const setValue = useCallback((value: string) => {
		setState({ value, cursorIndex: value.length });
		setCommandMenuDismissed(false);
		setSelectedCommandIndex(0);
	}, []);
	const insert = useCallback((text: string) => {
		if (text.length > 0) {
			setState((current) => insertAtCursor(current, text));
			setCommandMenuDismissed(false);
			setSelectedCommandIndex(0);
		}
	}, []);

	usePaste((text) => insert(normalizePaste(text)), { isActive });
	useInput(
		(value, key) => {
			if (isCommandMenuVisible && key.escape) {
				setCommandMenuDismissed(true);
				return;
			}
			if (isCommandMenuVisible && key.upArrow) {
				setSelectedCommandIndex((current) => Math.max(0, current - 1));
				return;
			}
			if (isCommandMenuVisible && key.downArrow) {
				if (commandSuggestions.length === 0) {
					return;
				}
				setSelectedCommandIndex((current) => Math.min(commandSuggestions.length - 1, current + 1));
				return;
			}
			if (isCommandMenuVisible && key.tab) {
				const selected = commandSuggestions[selectedCommandIndex];
				if (selected !== undefined) {
					setValue(selected.name);
					setCommandMenuDismissed(true);
				}
				return;
			}
			if (key.return) {
				const selectedCommand = isCommandMenuVisible
					? commandSuggestions[selectedCommandIndex]
					: undefined;
				const submitted = selectedCommand?.name ?? state.value.trim();
				if (submitted.length === 0 || !canSubmit || submissionLockedRef.current) {
					return;
				}

				submissionLockedRef.current = true;
				if (onSubmit(submitted)) {
					clear();
				} else {
					setCommandMenuDismissed(true);
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
				setCommandMenuDismissed(false);
				return;
			}
			if (key.delete) {
				setState(deleteAtCursor);
				setCommandMenuDismissed(false);
				return;
			}
			if (!isControlKey(key)) {
				insert(value);
			}
		},
		{ isActive },
	);

	return {
		...state,
		clear,
		setValue,
		commandMenu: {
			isVisible: isCommandMenuVisible,
			items: commandSuggestions,
			selectedIndex: selectedCommandIndex,
		},
	};
};

export type CommandMenuState = {
	isVisible: boolean;
	items: CommandDefinition[];
	selectedIndex: number;
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
