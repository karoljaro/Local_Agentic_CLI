import { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';

const FRAME_INTERVAL_MS = 120;
const SCAN_WIDTH = 28;
const TEXT_PADDING_X = 1;

const PULSE_FRAMES = ['◌', '○', '◍', '●', '◍', '○'] as const;
const SIGNAL_PHRASES = [
	'reading context',
	'planning answer',
	'waiting for first token',
	'aligning response',
] as const;

export const WaitingForResponse = () => {
	const frame = useAnimationFrame();
	const pulse = PULSE_FRAMES[frame % PULSE_FRAMES.length] ?? PULSE_FRAMES[0];
	const phrase =
		SIGNAL_PHRASES[Math.floor(frame / 10) % SIGNAL_PHRASES.length] ?? SIGNAL_PHRASES[0];
	const scanner = useMemo(() => buildScanner(frame), [frame]);

	return (
		<Box paddingX={TEXT_PADDING_X}>
			<Text>
				<Text color="yellow">{pulse}</Text>
				<Text color="gray"> model wake </Text>
				<Text color="cyan">{scanner}</Text>
				<Text color="gray"> {phrase}</Text>
			</Text>
		</Box>
	);
};

const useAnimationFrame = (): number => {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setFrame((currentFrame) => (currentFrame + 1) % Number.MAX_SAFE_INTEGER);
		}, FRAME_INTERVAL_MS);

		return () => clearInterval(interval);
	}, []);

	return frame;
};

const buildScanner = (frame: number): string => {
	const head = frame % SCAN_WIDTH;

	return Array.from({ length: SCAN_WIDTH }, (_value, index) => {
		if (index === head) {
			return '◆';
		}

		if (index === previousIndex(head)) {
			return '◇';
		}

		return '·';
	}).join('');
};

const previousIndex = (index: number): number => {
	return index === 0 ? SCAN_WIDTH - 1 : index - 1;
};
