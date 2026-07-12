import { useCallback, useEffect, useRef, useState } from 'react';
import { useInput } from 'ink';

import type { ToolApprovalRequest } from '@/application/use-cases/RunAgentTurn';
import type { PresentationController } from '../adapters/PresentationController';
import type { AppScreen, StartupMode } from '../types';
import { useChatSession } from './useChatSession';
import { useComposer } from './useComposer';

export const usePresentation = (controller: PresentationController, initialMode: StartupMode) => {
	const [screen] = useState<AppScreen>(() => (initialMode === 'resume' ? 'resume' : 'chat'));
	const [sessionId] = useState(() => controller.createSessionId());
	const [modelName, setModelName] = useState(() => controller.getModelName());
	const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null);
	const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null);
	const onModelNameChange = useCallback((nextModelName: string) => setModelName(nextModelName), []);
	const chat = useChatSession({
		controller,
		modelName,
		onModelNameChange,
		restoreSessionModel: false,
		sessionId,
	});

	useEffect(() => {
		return controller.setApprovalHandler((request) => {
			return new Promise<boolean>((resolve) => {
				approvalResolveRef.current?.(false);
				approvalResolveRef.current = resolve;
				setPendingApproval(request);
			});
		});
	}, [controller]);

	useEffect(() => {
		return () => {
			approvalResolveRef.current?.(false);
			approvalResolveRef.current = null;
		};
	}, []);

	const resolveApproval = useCallback((approved: boolean) => {
		const resolve = approvalResolveRef.current;
		approvalResolveRef.current = null;
		setPendingApproval(null);
		resolve?.(approved);
	}, []);

	const composer = useComposer({
		isActive: screen === 'chat' && pendingApproval === null,
		canSubmit:
			screen === 'chat' &&
			pendingApproval === null &&
			chat.state.loadStatus === 'ready' &&
			chat.state.turnStatus === 'idle',
		onSubmit: chat.runPrompt,
	});

	useInput(
		(_value, key) => {
			if (key.escape) {
				chat.abortTurn();
			}
		},
		{
			isActive: screen === 'chat' && pendingApproval === null && chat.state.turnStatus !== 'idle',
		},
	);

	return {
		chat,
		composer,
		modelName,
		pendingApproval,
		resolveApproval,
		screen,
		sessionId,
	};
};
