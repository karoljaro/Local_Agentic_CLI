import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Text, useInput, usePaste, useWindowSize } from 'ink';
import { InputSurface, KeyHints, SelectionRow, type KeyHint } from './Interactive';

type SelectionScreenProps<TItem> = {
	canCancel: boolean;
	emptyMessage: string;
	error?: string | undefined;
	filterPlaceholder: string;
	getKey: (item: TItem) => string;
	getSearchText: (item: TItem) => string;
	estimatedItemHeight?: number | undefined;
	items: TItem[];
	onCancel: () => void;
	onSelect: (item: TItem) => void;
	renderItem: (item: TItem, selected: boolean) => ReactNode;
	secondaryMessage?: string | undefined;
	status: 'idle' | 'loading' | 'submitting';
	title: string;
};

export const SelectionScreen = <TItem,>({
	canCancel,
	emptyMessage,
	error,
	filterPlaceholder,
	getKey,
	getSearchText,
	estimatedItemHeight = 1,
	items,
	onCancel,
	onSelect,
	renderItem,
	secondaryMessage,
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

	const maxVisibleRows = Math.max(
		3,
		Math.min(12, Math.floor(Math.max(3, rows - 8) / estimatedItemHeight)),
	);
	const firstVisibleIndex = Math.max(
		0,
		Math.min(selectedIndex - Math.floor(maxVisibleRows / 2), filteredItems.length - maxVisibleRows),
	);
	const visibleItems = filteredItems.slice(firstVisibleIndex, firstVisibleIndex + maxVisibleRows);

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					◇ {title}
				</Text>
			</Box>
			<InputSurface ariaLabel={`Filter ${title}`} focused={status === 'idle'} marker="⌕">
				<FilterText focused={status === 'idle'} placeholder={filterPlaceholder} query={query} />
			</InputSurface>

			<Box
				aria-label={`${title} options`}
				aria-role="listbox"
				borderBottom={false}
				borderColor="gray"
				borderLeft
				borderLeftDimColor
				borderRight={false}
				borderStyle="single"
				borderTop={false}
				flexDirection="column"
				marginTop={1}
				paddingLeft={1}
			>
				{status === 'loading' ? <Text color="gray">◌ Loading…</Text> : null}
				{status === 'loading'
					? null
					: visibleItems.map((item, visibleIndex) => {
							const absoluteIndex = firstVisibleIndex + visibleIndex;
							const selected = absoluteIndex === selectedIndex;
							return (
								<SelectionRow key={getKey(item)} selected={selected}>
									{renderItem(item, selected)}
								</SelectionRow>
							);
						})}
				{status !== 'loading' && filteredItems.length === 0 ? (
					<Text color="gray">· {query.length === 0 ? emptyMessage : 'No matches.'}</Text>
				) : null}
				{secondaryMessage === undefined ? null : (
					<Text color="gray" dimColor>
						· {secondaryMessage}
					</Text>
				)}
				{error === undefined ? null : <Text color="red">! {error}</Text>}
				{status === 'submitting' ? <Text color="yellow">◌ Applying selection…</Text> : null}
			</Box>
			<Box marginTop={1} paddingLeft={2}>
				<KeyHints hints={getSelectionHints(canCancel)} />
			</Box>
		</Box>
	);
};

const FilterText = ({
	focused,
	placeholder,
	query,
}: {
	focused: boolean;
	placeholder: string;
	query: string;
}) => {
	if (query.length === 0) {
		return (
			<Text color="gray" italic>
				{focused ? <Text inverse> </Text> : null}
				{placeholder}
			</Text>
		);
	}

	return (
		<Text wrap="truncate-end">
			{query}
			{focused ? <Text inverse> </Text> : null}
		</Text>
	);
};

const getSelectionHints = (canCancel: boolean): KeyHint[] => {
	return [
		{ key: '↑↓', label: 'move' },
		{ key: 'Enter', label: 'select' },
		...(canCancel ? [{ key: 'Esc', label: 'back' }] : []),
		{ key: 'Ctrl+U', label: 'clear filter' },
	];
};

const normalizePaste = (value: string): string => {
	return value.replaceAll('\r', '').replaceAll('\n', ' ');
};
