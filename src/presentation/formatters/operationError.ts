import { safeWorkspaceText } from './workspaceChanges';

export type OperationError = {
	title: string;
	operation: string;
	message: string;
	details: string;
};

// Keep only operation diagnostics, never serialize arbitrary exception objects,
// request bodies, environment objects or stacks. Redact before applying the cap.
export const safeDiagnosticText = (text: string, limit = 16_384): string => {
	const redacted = text
		.replace(/(authorization\s*[=:]\s*)(?:[^\r\n]+)/gi, '$1[redacted]')
		.replace(/\b(Bearer|Basic)\s+[\w+/=.-]+/gi, '$1 [redacted]')
		.replace(
			/(["']?(?:[\w-]*(?:api[_-]?key|token|secret|password)[\w-]*)["']?\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}\r\n]+)/gi,
			'$1[redacted]',
		)
		.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@');
	const safe = safeWorkspaceText(redacted.replace(/\r\n/g, '\n'), true);
	const suffix = '\n[Details truncated]';
	return safe.length <= limit
		? safe
		: `${safe.slice(0, Math.max(0, limit - suffix.length)).replace(/[\ud800-\udbff]$/, '')}${suffix}`;
};

export const operationError = (
	title: string,
	operation: string,
	message: string,
	error: unknown,
): OperationError => {
	const parts: string[] = [];
	let current = error;
	for (let depth = 0; depth < 3 && current !== undefined; depth++) {
		if (current instanceof Error) {
			parts.push(current.message);
			if (
				'code' in current &&
				(typeof current.code === 'string' || typeof current.code === 'number')
			)
				parts.push(`Code: ${current.code}`);
			current = current.cause;
		} else {
			parts.push(
				typeof current === 'string' ? current : 'No further diagnostic information available.',
			);
			break;
		}
	}
	return {
		title: safeDiagnosticText(title, 120),
		operation: safeDiagnosticText(operation, 240),
		message: safeDiagnosticText(message, 500),
		details: safeDiagnosticText(parts.join('\nCaused by: ')),
	};
};

export const errorDetailsText = (error: OperationError): string =>
	safeDiagnosticText(
		`${error.title}\nOperation: ${error.operation}\n${error.message}\n\n${error.details}`,
	);
