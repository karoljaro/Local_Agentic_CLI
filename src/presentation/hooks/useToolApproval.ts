import { useEffect, useRef, useState } from 'react';
import { useInput } from 'ink';

import type { ToolApprovalRequest } from '@/application/use-cases/RunAgentTurn';
import type { Runtime } from '@/composition/createRuntime';

export const useToolApproval = (runtime: Runtime) => {
	const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null);
	const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null);

	useEffect(() => {
		const unregister = runtime.setToolApprovalHandler((request) => {
			return new Promise<boolean>((resolve) => {
				approvalResolveRef.current?.(false);
				approvalResolveRef.current = resolve;
				setPendingApproval(request);
			});
		});

		return () => {
			unregister();
			approvalResolveRef.current?.(false);
			approvalResolveRef.current = null;
		};
	}, [runtime]);

	const resolveToolApproval = (approved: boolean): void => {
		const resolve = approvalResolveRef.current;

		approvalResolveRef.current = null;
		setPendingApproval(null);
		resolve?.(approved);
	};

	useInput(
		(value, key) => {
			const normalizedValue = value.toLowerCase();

			if (normalizedValue === 'y') {
				resolveToolApproval(true);
				return;
			}

			if (normalizedValue === 'n' || key.escape) {
				resolveToolApproval(false);
			}
		},
		{ isActive: pendingApproval !== null },
	);

	return {
		pendingApproval,
	};
};
