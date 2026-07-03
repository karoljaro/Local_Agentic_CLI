import { useState } from 'react';
import { useInput } from 'ink';

type UseTextInputOptions = {
	isActive: boolean;
	onSubmit: (value: string) => void;
};

export const useTextInput = ({ isActive, onSubmit }: UseTextInputOptions) => {
	const [input, setInput] = useState('');
	const [cursorIndex, setCursorIndex] = useState(0);

	useInput(
		(value, key) => {
			if (key.return) {
				const prompt = input.trim();

				if (prompt.length === 0) {
					return;
				}

				setInput('');
				setCursorIndex(0);
				onSubmit(prompt);
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

			if (value.length > 0) {
				setInput(
					(currentInput) =>
						`${currentInput.slice(0, cursorIndex)}${value}${currentInput.slice(cursorIndex)}`,
				);
				setCursorIndex((currentIndex) => currentIndex + value.length);
			}
		},
		{ isActive },
	);

	return {
		cursorIndex,
		input,
	};
};

const isControlKey = (key: {
	ctrl: boolean;
	downArrow: boolean;
	escape: boolean;
	meta: boolean;
	pageDown: boolean;
	pageUp: boolean;
	tab: boolean;
	upArrow: boolean;
}): boolean => {
	return (
		key.ctrl ||
		key.meta ||
		key.tab ||
		key.escape ||
		key.upArrow ||
		key.downArrow ||
		key.pageUp ||
		key.pageDown
	);
};
