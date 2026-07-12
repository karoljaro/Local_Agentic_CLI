import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Text, useInput, usePaste, useWindowSize } from 'ink';

type SelectionScreenProps<TItem> = {
	canCancel: boolean;
	emptyMessage: string;
	error?: string | undefined;
	getKey: (item: TItem) => string;
	getSearchText: (item: TItem) => string;
	items: TItem[];
	onCancel: () => void;
	onSelect: (item: TItem) => void;
	renderItem: (item: TItem, selected: boolean) => ReactNode;
	status: 'idle' | 'loading' | 'submitting';
	title: string;
};

export const SelectionScreen = <TItem,>({
	canCancel,
	emptyMessage,
	error,
	getKey,
	getSearchText,
	items,
	onCancel,
	onSelect,
	renderItem,
	status,
	title,
}: SelectionScreenProps<TItem>) => {
	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const { rows } = useWindowSize();
	const filteredItems = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return normalizedQuery.length === 0
			? items
			: items.filter((item) => getSearchText(item).toLowerCase().includes(normalizedQuery));
	}, [getSearchText, items, query]);

	useEffect(() => {
		setSelectedIndex((current) => Math.min(current, Math.max(0, filteredItems.length - 1)));
	}, [filteredItems.length]);

	usePaste((text) => setQuery((current) => `${current}${normalizePaste(text)}`), {
		isActive: status === 'idle',
	});
	useInput((value, key) => {
		if (key.escape) {
			if (canCancel) {
				onCancel();
			}
			return;
		}
		if (status !== 'idle') {
			return;
		}
		if (key.upArrow) {
			setSelectedIndex((current) => Math.max(0, current - 1));
			return;
		}
		if (key.downArrow) {
			setSelectedIndex((current) => Math.min(filteredItems.length - 1, current + 1));
			return;
		}
		if (key.pageUp) {
			setSelectedIndex((current) => Math.max(0, current - 8));
			return;
		}
		if (key.pageDown) {
			setSelectedIndex((current) => Math.min(filteredItems.length - 1, current + 8));
			return;
		}
		if (key.home) {
			setSelectedIndex(0);
			return;
		}
		if (key.end) {
			setSelectedIndex(Math.max(0, filteredItems.length - 1));
			return;
		}
		if (key.return) {
			const selected = filteredItems[selectedIndex];
			if (selected !== undefined) {
				onSelect(selected);
			}
			return;
		}
		if (key.backspace || key.delete) {
			setQuery((current) => current.slice(0, -1));
			setSelectedIndex(0);
			return;
		}
		if (key.ctrl && value === 'u') {
			setQuery('');
			setSelectedIndex(0);
			return;
		}
		if (!key.ctrl && !key.meta && !key.tab && value.length > 0) {
			setQuery((current) => `${current}${value}`);
			setSelectedIndex(0);
		}
	});

	const maxVisibleRows = Math.max(3, Math.min(12, rows - 8));
	const firstVisibleIndex = Math.max(
		0,
		Math.min(selectedIndex - Math.floor(maxVisibleRows / 2), filteredItems.length - maxVisibleRows),
	);
	const visibleItems = filteredItems.slice(firstVisibleIndex, firstVisibleIndex + maxVisibleRows);

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box justifyContent="space-between">
				<Text bold>{title}</Text>
				<Text color="gray">↑/↓ choose · Enter confirm{canCancel ? ' · Esc back' : ''}</Text>
			</Box>
			<Box marginY={1}>
				<Text color="cyan">/ </Text>
				<Text>{query}</Text>
				<Text inverse> </Text>
			</Box>

			{status === 'loading' ? <Text color="gray">Loading…</Text> : null}
			{visibleItems.map((item, visibleIndex) => {
				const absoluteIndex = firstVisibleIndex + visibleIndex;
				return <Box key={getKey(item)}>{renderItem(item, absoluteIndex === selectedIndex)}</Box>;
			})}
			{status !== 'loading' && filteredItems.length === 0 ? (
				<Text color="gray">{query.length === 0 ? emptyMessage : 'No matches.'}</Text>
			) : null}
			{error === undefined ? null : <Text color="red">! {error}</Text>}
			{status === 'submitting' ? <Text color="yellow">Applying selection…</Text> : null}
		</Box>
	);
};

const normalizePaste = (value: string): string => {
	return value.replaceAll('\r', '').replaceAll('\n', ' ');
};
