import { useCallback, useState } from 'react';
import { useInput, usePaste, type Key } from 'ink';

type UseTextInputOptions = {
	isActive: boolean;
	onSubmit: (value: string) => void;
};

export const useTextInput = ({ isActive, onSubmit }: UseTextInputOptions) => {
	const [input, setInput] = useState('');
	const [cursorIndex, setCursorIndex] = useState(0);

	const insertText = useCallback(
		(text: string): void => {
			if (text.length === 0) {
				return;
			}

			setInput(
				(currentInput) =>
					`${currentInput.slice(0, cursorIndex)}${text}${currentInput.slice(cursorIndex)}`,
			);
			setCursorIndex((currentIndex) => currentIndex + text.length);
		},
		[cursorIndex],
	);

	const clearInput = useCallback((): void => {
		setInput('');
		setCursorIndex(0);
	}, []);

	usePaste(
		(text) => {
			insertText(text.replaceAll('\r\n', '\n'));
		},
		{ isActive },
	);

	useInput(
		(value, key) => {
			if (key.return) {
				const prompt = input.trim();

				if (prompt.length === 0) {
					return;
				}

				clearInput();
				onSubmit(prompt);
				return;
			}

			if (key.ctrl && value === 'a') {
				setCursorIndex(0);
				return;
			}

			if (key.ctrl && value === 'e') {
				setCursorIndex(input.length);
				return;
			}

			if (key.ctrl && value === 'u') {
				clearInput();
				return;
			}

			if (key.leftArrow) {
				setCursorIndex((currentIndex) => Math.max(0, currentIndex - 1));
				return;
			}

			if (key.rightArrow) {
				setCursorIndex((currentIndex) => Math.min(input.length, currentIndex + 1));
				return;
			}

			if (key.home) {
				setCursorIndex(0);
				return;
			}

			if (key.end) {
				setCursorIndex(input.length);
				return;
			}

			if (key.backspace) {
				if (cursorIndex === 0) {
					return;
				}

				setInput(
					(currentInput) =>
						`${currentInput.slice(0, cursorIndex - 1)}${currentInput.slice(cursorIndex)}`,
				);
				setCursorIndex((currentIndex) => currentIndex - 1);
				return;
			}

			if (key.delete) {
				if (cursorIndex >= input.length) {
					return;
				}

				setInput(
					(currentInput) =>
						`${currentInput.slice(0, cursorIndex)}${currentInput.slice(cursorIndex + 1)}`,
				);
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
		cursorIndex,
		input,
	};
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
