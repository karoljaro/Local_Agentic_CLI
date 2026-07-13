import { Fragment, useMemo, type ReactNode } from 'react';
import { Box, Text, Transform } from 'ink';
import { marked, type Token, type Tokens } from 'marked';

type MarkdownProps = {
	children: string;
	compact?: boolean;
};

type BlockProps = {
	token: Token;
	compact: boolean;
};

export const Markdown = ({ children, compact = false }: MarkdownProps) => {
	const tokens = useMemo(() => marked.lexer(children, { gfm: true, breaks: true }), [children]);

	return (
		<Box flexDirection="column">
			{tokens.map((token, index) => (
				<Block key={`${token.type}:${index}`} token={token} compact={compact} />
			))}
		</Box>
	);
};

const Block = ({ token, compact }: BlockProps): ReactNode => {
	switch (token.type) {
		case 'space':
		case 'def':
		case 'html':
			return null;
		case 'heading': {
			const heading = token as Tokens.Heading;
			return (
				<Box marginBottom={compact || heading.depth > 2 ? 0 : 1}>
					<Text bold dimColor={heading.depth > 3} underline={heading.depth === 1}>
						<Inline tokens={heading.tokens} />
					</Text>
				</Box>
			);
		}
		case 'paragraph': {
			const paragraph = token as Tokens.Paragraph;
			return (
				<Box marginBottom={compact ? 0 : 1}>
					<Text wrap="wrap">
						<Inline tokens={paragraph.tokens} />
					</Text>
				</Box>
			);
		}
		case 'text': {
			const text = token as Tokens.Text;
			return <Text wrap="wrap">{text.tokens ? <Inline tokens={text.tokens} /> : text.text}</Text>;
		}
		case 'code': {
			const code = token as Tokens.Code;
			return (
				<Box flexDirection="column" marginBottom={compact ? 0 : 1}>
					{code.lang ? <Text color="gray">{code.lang}</Text> : null}
					{code.text.split('\n').map((line, index) => (
						<Transform key={index} transform={normalizeTerminalLine}>
							<Text wrap="wrap">{line.length === 0 ? ' ' : line}</Text>
						</Transform>
					))}
				</Box>
			);
		}
		case 'list': {
			const list = token as Tokens.List;
			const start = list.start === '' ? 1 : list.start;
			return (
				<Box flexDirection="column" marginBottom={compact ? 0 : 1}>
					{list.items.map((item, index) => {
						const marker = item.task
							? item.checked
								? '[x]'
								: '[ ]'
							: list.ordered
								? `${start + index}.`
								: '•';
						return (
							<Box alignItems="flex-start" key={index}>
								<Text>{marker} </Text>
								<Box flexDirection="column" flexGrow={1}>
									{item.tokens.map((child, childIndex) => (
										<Block
											compact={!list.loose}
											key={`${child.type}:${childIndex}`}
											token={child}
										/>
									))}
								</Box>
							</Box>
						);
					})}
				</Box>
			);
		}
		case 'blockquote': {
			const quote = token as Tokens.Blockquote;
			return (
				<Box flexDirection="column" marginBottom={compact ? 0 : 1}>
					<Text color="gray">quote</Text>
					{quote.tokens.map((child, index) => (
						<Block compact key={`${child.type}:${index}`} token={child} />
					))}
				</Box>
			);
		}
		case 'hr':
			return <Text color="gray">────────────────────────</Text>;
		default: {
			const generic = token as Tokens.Generic;
			return generic.tokens?.map((child, index) => (
				<Block compact={compact} key={`${child.type}:${index}`} token={child} />
			));
		}
	}
};

const Inline = ({ tokens }: { tokens: Token[] }) => {
	return (
		<>
			{tokens.map((token, index) => (
				<Fragment key={`${token.type}:${index}`}>{renderInline(token)}</Fragment>
			))}
		</>
	);
};

const renderInline = (token: Token): ReactNode => {
	switch (token.type) {
		case 'text': {
			const text = token as Tokens.Text;
			return text.tokens ? <Inline tokens={text.tokens} /> : text.text;
		}
		case 'escape':
			return (token as Tokens.Escape).text;
		case 'strong':
			return (
				<Text bold>
					<Inline tokens={(token as Tokens.Strong).tokens} />
				</Text>
			);
		case 'em':
			return (
				<Text italic>
					<Inline tokens={(token as Tokens.Em).tokens} />
				</Text>
			);
		case 'del':
			return (
				<Text strikethrough>
					<Inline tokens={(token as Tokens.Del).tokens} />
				</Text>
			);
		case 'codespan':
			return <Text inverse>{` ${(token as Tokens.Codespan).text} `}</Text>;
		case 'link': {
			const link = token as Tokens.Link;
			return (
				<>
					<Text underline>
						<Inline tokens={link.tokens} />
					</Text>
					<Text color="gray"> {link.href}</Text>
				</>
			);
		}
		case 'image': {
			const image = token as Tokens.Image;
			return <Text color="gray">[image: {image.text || image.href}]</Text>;
		}
		case 'br':
			return '\n';
		case 'html':
			return null;
		default: {
			const generic = token as Tokens.Generic;
			return generic.tokens ? <Inline tokens={generic.tokens} /> : generic['text'];
		}
	}
};

const normalizeTerminalLine = (line: string): string => {
	return line.replaceAll('\r', '').replaceAll('\t', '  ');
};
