import { useEffect, useState } from 'react';
import { useInput } from 'ink';

type UseSelectableListInput<TItem> = {
	isActive: boolean;
	items: TItem[];
	onSelect: (item: TItem) => void;
};

export const useSelectableList = <TItem>({
	isActive,
	items,
	onSelect,
}: UseSelectableListInput<TItem>) => {
	const [selectedIndex, setSelectedIndex] = useState(0);

	useEffect(() => {
		setSelectedIndex((currentIndex) => Math.min(currentIndex, Math.max(0, items.length - 1)));
	}, [items.length]);

	useInput(
		(value, key) => {
			if (items.length === 0) {
				return;
			}

			if (key.upArrow || value === 'k') {
				setSelectedIndex((currentIndex) => Math.max(0, currentIndex - 1));
				return;
			}

			if (key.downArrow || value === 'j') {
				setSelectedIndex((currentIndex) => Math.min(items.length - 1, currentIndex + 1));
				return;
			}

			if (key.pageUp) {
				setSelectedIndex((currentIndex) => Math.max(0, currentIndex - 10));
				return;
			}

			if (key.pageDown) {
				setSelectedIndex((currentIndex) => Math.min(items.length - 1, currentIndex + 10));
				return;
			}

			if (key.home) {
				setSelectedIndex(0);
				return;
			}

			if (key.end) {
				setSelectedIndex(items.length - 1);
				return;
			}

			if (key.return) {
				const selectedItem = items[selectedIndex];

				if (selectedItem !== undefined) {
					onSelect(selectedItem);
				}
			}
		},
		{ isActive },
	);

	return {
		selectedIndex,
	};
};
