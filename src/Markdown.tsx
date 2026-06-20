import { Fragment, useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import { marked, type Token, type Tokens } from 'marked';

type MarkdownProps = {
	children: string;
	/** Maksymalna szerokość bloków takich jak tabela, kod i separator. */
	maxWidth?: number;
	/** Czy dopisywać adres po tekście linku. */
	showLinkUrls?: boolean;
	/** Sposób obsługi zbyt długich linii kodu. */
	codeWrap?: 'wrap' | 'truncate-end';
};

type BlockTokenProps = {
	token: Token;
	width: number;
	showLinkUrls: boolean;
	codeWrap: 'wrap' | 'truncate-end';
	compact?: boolean;
};

type InlineTokensProps = {
	tokens: Token[];
	showLinkUrls: boolean;
};

export function Markdown({
	children,
	maxWidth,
	showLinkUrls = true,
	codeWrap = 'truncate-end',
}: MarkdownProps) {
	const { stdout } = useStdout();
	const terminalWidth = Math.max(
		10,
		stdout.columns ?? process.stdout.columns ?? 80
	);
	const width = Math.max(
		10,
		Math.min(maxWidth ?? terminalWidth - 2, terminalWidth)
	);

	const tokens = useMemo(
		() =>
			marked.lexer(children, {
				gfm: true,
				breaks: true,
			}),
		[children]
	);

	return (
		<Box flexDirection="column">
			{tokens.map((token, index) => (
				<BlockToken
					key={`${token.type}-${index}`}
					token={token}
					width={width}
					showLinkUrls={showLinkUrls}
					codeWrap={codeWrap}
				/>
			))}
		</Box>
	);
}

function InlineTokens({ tokens, showLinkUrls }: InlineTokensProps) {
	return (
		<>
			{tokens.map((token, index) => (
				<InlineToken
					key={`${token.type}-${index}`}
					token={token}
					showLinkUrls={showLinkUrls}
				/>
			))}
		</>
	);
}

function InlineToken({
	token,
	showLinkUrls,
}: {
	token: Token;
	showLinkUrls: boolean;
}) {
	switch (token.type) {
		case 'text': {
			const value = token as Tokens.Text;

			return value.tokens?.length ? (
				<InlineTokens
					tokens={value.tokens}
					showLinkUrls={showLinkUrls}
				/>
			) : (
				value.text
			);
		}

		case 'escape':
			return (token as Tokens.Escape).text;

		case 'strong': {
			const value = token as Tokens.Strong;
			return (
				<Text bold>
					<InlineTokens
						tokens={value.tokens}
						showLinkUrls={showLinkUrls}
					/>
				</Text>
			);
		}

		case 'em': {
			const value = token as Tokens.Em;
			return (
				<Text italic>
					<InlineTokens
						tokens={value.tokens}
						showLinkUrls={showLinkUrls}
					/>
				</Text>
			);
		}

		case 'del': {
			const value = token as Tokens.Del;
			return (
				<Text strikethrough>
					<InlineTokens
						tokens={value.tokens}
						showLinkUrls={showLinkUrls}
					/>
				</Text>
			);
		}

		case 'codespan':
			return (
				<Text inverse>{` ${(token as Tokens.Codespan).text} `}</Text>
			);

		case 'link': {
			const value = token as Tokens.Link;
			const label = inlinePlainText(value.tokens).trim();
			const shouldShowUrl =
				showLinkUrls &&
				normaliseUrl(label) !== normaliseUrl(value.href);

			return (
				<>
					<Text underline>
						<InlineTokens
							tokens={value.tokens}
							showLinkUrls={showLinkUrls}
						/>
					</Text>
					{shouldShowUrl ? (
						<Text dimColor>{` (${value.href})`}</Text>
					) : null}
				</>
			);
		}

		case 'image': {
			const value = token as Tokens.Image;
			return (
				<Text dimColor>{`[image: ${value.text || value.href}]`}</Text>
			);
		}

		case 'br':
			return '\n';

		case 'html':
			// Surowy HTML celowo nie jest wykonywany ani wyświetlany w terminalu.
			return null;

		default: {
			const value = token as Tokens.Generic;

			if (value.tokens?.length) {
				return (
					<InlineTokens
						tokens={value.tokens}
						showLinkUrls={showLinkUrls}
					/>
				);
			}

			return typeof value['text'] === 'string' ? value['text'] : null;
		}
	}
}

function BlockToken({
	token,
	width,
	showLinkUrls,
	codeWrap,
	compact = false,
}: BlockTokenProps) {
	switch (token.type) {
		case 'space':
		case 'def':
		case 'html':
			return null;

		case 'heading': {
			const value = token as Tokens.Heading;

			return (
				<Box
					marginTop={value.depth === 1 ? 1 : 0}
					marginBottom={value.depth <= 2 ? 1 : 0}
				>
					<Text
						bold
						underline={value.depth === 1}
						dimColor={value.depth >= 4}
					>
						<InlineTokens
							tokens={value.tokens}
							showLinkUrls={showLinkUrls}
						/>
					</Text>
				</Box>
			);
		}

		case 'paragraph': {
			const value = token as Tokens.Paragraph;

			return (
				<Box marginBottom={compact ? 0 : 1}>
					<Text wrap="wrap">
						<InlineTokens
							tokens={value.tokens}
							showLinkUrls={showLinkUrls}
						/>
					</Text>
				</Box>
			);
		}

		case 'text': {
			const value = token as Tokens.Text;

			return (
				<Text wrap="wrap">
					{value.tokens?.length ? (
						<InlineTokens
							tokens={value.tokens}
							showLinkUrls={showLinkUrls}
						/>
					) : (
						value.text
					)}
				</Text>
			);
		}

		case 'code': {
			const value = token as Tokens.Code;
			const lines = value.text.split('\n');

			return (
				<Box
					flexDirection="column"
					borderStyle="round"
					paddingX={1}
					width={width}
					marginBottom={compact ? 0 : 1}
				>
					{value.lang ? <Text dimColor>{value.lang}</Text> : null}
					{lines.map((line, index) => (
						<Text key={index} wrap={codeWrap}>
							{line || ' '}
						</Text>
					))}
				</Box>
			);
		}

		case 'blockquote': {
			const value = token as Tokens.Blockquote;

			return (
				<Box
					flexDirection="column"
					borderStyle="single"
					borderTop={false}
					borderRight={false}
					borderBottom={false}
					paddingLeft={1}
					marginBottom={compact ? 0 : 1}
				>
					{value.tokens.map((child, index) => (
						<BlockToken
							key={`${child.type}-${index}`}
							token={child}
							width={Math.max(10, width - 2)}
							showLinkUrls={showLinkUrls}
							codeWrap={codeWrap}
							compact
						/>
					))}
				</Box>
			);
		}

		case 'list': {
			const value = token as Tokens.List;
			const start = value.start === '' ? 1 : value.start;
			const labels = value.items.map((item, index) => {
				if (item.task) {
					return item.checked ? '[x]' : '[ ]';
				}

				return value.ordered ? `${start + index}.` : '•';
			});
			const markerWidth = Math.max(
				...labels.map((label) => label.length)
			);

			return (
				<Box flexDirection="column" marginBottom={compact ? 0 : 1}>
					{value.items.map((item, index) => (
						<Box key={index} alignItems="flex-start">
							<Text>{`${(labels[index] ?? '').padStart(markerWidth)} `}</Text>
							<Box flexDirection="column" flexGrow={1}>
								{item.tokens.map((child, childIndex) => (
									<BlockToken
										key={`${child.type}-${childIndex}`}
										token={child}
										width={Math.max(
											10,
											width - markerWidth - 1
										)}
										showLinkUrls={showLinkUrls}
										codeWrap={codeWrap}
										compact={!value.loose}
									/>
								))}
							</Box>
						</Box>
					))}
				</Box>
			);
		}

		case 'table':
			return (
				<TableBlock
					table={token as Tokens.Table}
					width={width}
					showLinkUrls={showLinkUrls}
					compact={compact}
				/>
			);

		case 'hr':
			return (
				<Box marginBottom={compact ? 0 : 1}>
					<Text dimColor>
						{'─'.repeat(Math.max(3, Math.min(width, 40)))}
					</Text>
				</Box>
			);

		default: {
			const value = token as Tokens.Generic;

			if (value.tokens?.length) {
				return (
					<Box flexDirection="column">
						{value.tokens.map((child, index) => (
							<BlockToken
								key={`${child.type}-${index}`}
								token={child}
								width={width}
								showLinkUrls={showLinkUrls}
								codeWrap={codeWrap}
								compact={compact}
							/>
						))}
					</Box>
				);
			}

			return null;
		}
	}
}

function TableBlock({
	table,
	width,
	showLinkUrls,
	compact,
}: {
	table: Tokens.Table;
	width: number;
	showLinkUrls: boolean;
	compact: boolean;
}) {
	const columnCount = table.header.length;

	if (columnCount === 0) {
		return null;
	}

	const preferredWidths = table.header.map((header, columnIndex) => {
		const cellWidths = [
			displayLength(inlineDisplayText(header.tokens, showLinkUrls)),
			...table.rows.map((row) =>
				displayLength(
					inlineDisplayText(
						row[columnIndex]?.tokens ?? [],
						showLinkUrls
					)
				)
			),
		];

		return Math.max(3, ...cellWidths);
	});

	// 1 znak lewego obramowania + dla każdej kolumny: 2 spacje i prawy separator.
	const borderOverhead = 1 + columnCount * 3;
	const availableForContent = Math.max(columnCount, width - borderOverhead);
	const preferredContentWidth = preferredWidths.reduce(
		(sum, cellWidth) => sum + cellWidth,
		0
	);
	const tableContentWidth = Math.min(
		availableForContent,
		preferredContentWidth
	);
	const columnWidths = allocateColumnWidths(
		preferredWidths,
		tableContentWidth
	);

	const topBorder = `┌${columnWidths.map((cellWidth) => '─'.repeat(cellWidth + 2)).join('┬')}┐`;
	const headerBorder = `├${columnWidths.map((cellWidth) => '─'.repeat(cellWidth + 2)).join('┼')}┤`;
	const bottomBorder = `└${columnWidths.map((cellWidth) => '─'.repeat(cellWidth + 2)).join('┴')}┘`;

	return (
		<Box flexDirection="column" marginBottom={compact ? 0 : 1}>
			<Text dimColor>{topBorder}</Text>
			<TableRow
				cells={table.header}
				columnWidths={columnWidths}
				showLinkUrls={showLinkUrls}
				header
			/>
			<Text dimColor>{headerBorder}</Text>
			{table.rows.map((row, index) => (
				<Fragment key={index}>
					<TableRow
						cells={row}
						columnWidths={columnWidths}
						showLinkUrls={showLinkUrls}
					/>
				</Fragment>
			))}
			<Text dimColor>{bottomBorder}</Text>
		</Box>
	);
}

function TableRow({
	cells,
	columnWidths,
	showLinkUrls,
	header = false,
}: {
	cells: Tokens.TableCell[];
	columnWidths: number[];
	showLinkUrls: boolean;
	header?: boolean;
}) {
	return (
		<Box>
			<Text dimColor>│</Text>
			{columnWidths.map((columnWidth, index) => {
				const cell = cells[index];
				const alignment = cell?.align ?? 'left';

				return (
					<Fragment key={index}>
						<Box
							width={columnWidth + 2}
							paddingX={1}
							justifyContent={
								alignment === 'right'
									? 'flex-end'
									: alignment === 'center'
										? 'center'
										: 'flex-start'
							}
						>
							<Text bold={header} wrap="truncate-end">
								{cell ? (
									<InlineTokens
										tokens={cell.tokens}
										showLinkUrls={showLinkUrls}
									/>
								) : null}
							</Text>
						</Box>
						<Text dimColor>│</Text>
					</Fragment>
				);
			})}
		</Box>
	);
}

function allocateColumnWidths(
	preferredWidths: number[],
	totalWidth: number
): number[] {
	if (preferredWidths.length === 0) {
		return [];
	}

	const minimumWidth: number =
		totalWidth >= preferredWidths.length * 3 ? 3 : 1;
	const widths: number[] = preferredWidths.map(() => minimumWidth);
	const targets: number[] = preferredWidths.map((width) =>
		Math.max(minimumWidth, width)
	);
	let remaining = Math.max(
		0,
		totalWidth - minimumWidth * preferredWidths.length
	);

	while (remaining > 0) {
		const growable = widths
			.map((width, index) => ({ width, index }))
			.filter(({ width, index }) => {
				const target = targets[index];
				return target !== undefined && width < target;
			});

		if (growable.length === 0) {
			for (
				let index = 0;
				remaining > 0;
				index = (index + 1) % widths.length
			) {
				widths[index] = (widths[index] ?? 0) + 1;
				remaining -= 1;
			}
			break;
		}

		for (const { index } of growable) {
			widths[index] = (widths[index] ?? 0) + 1;
			remaining -= 1;

			if (remaining === 0) {
				break;
			}
		}
	}

	return widths;
}

function inlinePlainText(tokens: Token[]): string {
	return tokens.map(tokenPlainText).join('');
}

function tokenPlainText(token: Token): string {
	switch (token.type) {
		case 'br':
			return ' ';
		case 'image':
			return (token as Tokens.Image).text;
		case 'codespan':
			return (token as Tokens.Codespan).text;
		case 'escape':
			return (token as Tokens.Escape).text;
		case 'text': {
			const value = token as Tokens.Text;
			return value.tokens?.length
				? inlinePlainText(value.tokens)
				: value.text;
		}
		case 'strong':
		case 'em':
		case 'del':
		case 'link':
			return inlinePlainText(
				(token as Tokens.Strong | Tokens.Em | Tokens.Del | Tokens.Link)
					.tokens
			);
		default: {
			const value = token as Tokens.Generic;
			return value.tokens?.length
				? inlinePlainText(value.tokens)
				: typeof value['text'] === 'string'
					? value['text']
					: '';
		}
	}
}

function inlineDisplayText(tokens: Token[], showLinkUrls: boolean): string {
	return tokens
		.map((token) => {
			if (token.type !== 'link') {
				return tokenPlainText(token);
			}

			const link = token as Tokens.Link;
			const label = inlinePlainText(link.tokens);
			const shouldShowUrl =
				showLinkUrls && normaliseUrl(label) !== normaliseUrl(link.href);

			return shouldShowUrl ? `${label} (${link.href})` : label;
		})
		.join('');
}

function displayLength(value: string): number {
	// Poprawnie liczy pary surogatów (np. emoji). Dla pełnego CJK można podmienić na string-width.
	return Array.from(value).length;
}

function normaliseUrl(value: string): string {
	return value
		.trim()
		.replace(/^https?:\/\//, '')
		.replace(/\/$/, '');
}
