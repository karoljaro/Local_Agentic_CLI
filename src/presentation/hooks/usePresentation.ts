import { abortError, throwIfAborted } from '@/application/services/cancellation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useInput } from 'ink';

import type { ListedModel } from '@/application/ports/ModelCatalogPort';
import type { ToolApprovalRequest } from '@/application/use-cases/RunAgentTurn';
import type { SessionId } from '@/domain/Ids';
import type { PresentationController } from '../adapters/PresentationController';
import { parseCommand } from '../commands/commands';
import type { ResumeChoice } from '../screens/ResumeScreen';
import { buildSessionOption } from '../state/sessionSummary';
import type { AppScreen, ModelSelectionState, SessionSelectionState, StartupMode } from '../types';
import { useChatSession } from './useChatSession';
import { useComposer } from './useComposer';

const EMPTY_MODEL_SELECTION: ModelSelectionState = { status: 'idle', items: [] };
const EMPTY_SESSION_SELECTION: SessionSelectionState = { status: 'idle', items: [] };

export const usePresentation = (controller: PresentationController, initialMode: StartupMode) => {
	const { exit } = useApp();
	const [screen, setScreen] = useState<AppScreen>(() =>
		initialMode === 'resume' ? 'resume' : 'chat',
	);
	const [hasChat, setHasChat] = useState(initialMode === 'new');
	const [sessionId, setSessionId] = useState(() => controller.createSessionId());
	const [restoreSessionModel, setRestoreSessionModel] = useState(false);
	const [modelName, setModelName] = useState(() => controller.getModelName());
	const [modelSelection, setModelSelection] = useState<ModelSelectionState>(EMPTY_MODEL_SELECTION);
	const [sessionSelection, setSessionSelection] =
		useState<SessionSelectionState>(EMPTY_SESSION_SELECTION);
	const [isCommandBusy, setCommandBusy] = useState(false);
	const [pendingApproval, setPendingApproval] = useState<ToolApprovalRequest | null>(null);
	const approvalResolveRef = useRef<{
		request: ToolApprovalRequest;
		resolve: (approved: boolean) => void;
		cancel: () => void;
	} | null>(null);
	const onModelNameChange = useCallback((nextModelName: string) => setModelName(nextModelName), []);
	const chat = useChatSession({
		controller,
		modelName,
		onModelNameChange,
		restoreSessionModel,
		sessionId,
	});

	useEffect(() => {
		const warmupController = new AbortController();
		void controller.listModels(warmupController.signal).catch(() => {
			// Opening the model screen reports the actionable error.
		});
		return () => warmupController.abort();
	}, [controller]);

	useEffect(() => {
		if (screen !== 'models') {
			return;
		}

		const request = new AbortController();
		setModelSelection({ status: 'loading', items: [] });
		void controller
			.listModels(request.signal)
			.then((result) => {
				if (!request.signal.aborted) {
					setModelSelection({ status: 'idle', items: result.models });
				}
			})
			.catch((caughtError: unknown) => {
				if (!request.signal.aborted) {
					setModelSelection({
						status: 'idle',
						items: [],
						error: toError(caughtError).message,
					});
				}
			});

		return () => request.abort();
	}, [controller, screen]);

	useEffect(() => {
		if (screen !== 'resume') {
			return;
		}

		let cancelled = false;
		setSessionSelection({ status: 'loading', items: [] });
		const load = async (): Promise<void> => {
			try {
				const sessions = await controller.listSessions();
				const options = await Promise.all(
					sessions.map(async ({ sessionId: listedSessionId }) => {
						try {
							const events = await controller.listSessionEvents(listedSessionId);
							return buildSessionOption(listedSessionId, events);
						} catch {
							return { sessionId: listedSessionId };
						}
					}),
				);
				if (!cancelled) {
					setSessionSelection({
						status: 'idle',
						items: options.sort((left, right) =>
							(right.lastActiveAt ?? '').localeCompare(left.lastActiveAt ?? ''),
						),
					});
				}
			} catch (caughtError) {
				if (!cancelled) {
					setSessionSelection({
						status: 'idle',
						items: [],
						error: toError(caughtError).message,
					});
				}
			}
		};

		void load();
		return () => {
			cancelled = true;
		};
	}, [controller, screen]);

	useEffect(() => {
		let disposed = false;
		const unregister = controller.setApprovalHandler((request, { signal }) => {
			return new Promise<boolean>((resolve, reject) => {
				throwIfAborted(signal);
				if (disposed) throw abortError();
				approvalResolveRef.current?.cancel();
				// A distinct presentation identity also protects repeated requests with the same IDs.
				const displayedRequest = { ...request };
				let settled = false;
				const finish = (approved: boolean, cancelled = false) => {
					if (settled) return;
					settled = true;
					signal?.removeEventListener('abort', onAbort);
					if (approvalResolveRef.current === pending) {
						approvalResolveRef.current = null;
						setPendingApproval((current) => (current === displayedRequest ? null : current));
					}
					if (cancelled) reject(abortError());
					else resolve(approved);
				};
				const onAbort = () => finish(false, true);
				const pending = {
					request: displayedRequest,
					resolve: (approved: boolean) => finish(approved),
					cancel: onAbort,
				};
				approvalResolveRef.current = pending;
				signal?.addEventListener('abort', onAbort, { once: true });
				setPendingApproval(displayedRequest);
				if (signal?.aborted) onAbort();
			});
		});
		return () => {
			disposed = true;
			unregister();
			approvalResolveRef.current?.cancel();
		};
	}, [controller]);

	const resolveApproval = useCallback(
		(approved: boolean) => {
			const pending = approvalResolveRef.current;
			if (pending !== null && pending.request === pendingApproval) pending.resolve(approved);
		},
		[pendingApproval],
	);

	const switchModel = useCallback(
		async (nextModelName: string): Promise<boolean> => {
			setCommandBusy(true);
			const request = new AbortController();
			try {
				const selected = await controller.switchModel(nextModelName, request.signal);
				setModelName(selected);
				setRestoreSessionModel(false);
				chat.appendSystemMessage(`Model switched to ${selected}.`);
				return true;
			} catch (caughtError) {
				chat.appendSystemMessage(toError(caughtError).message, 'error');
				return false;
			} finally {
				setCommandBusy(false);
			}
		},
		[chat, controller],
	);

	const submit = useCallback(
		(value: string): boolean => {
			const command = parseCommand(value);
			if (command === null) {
				return chat.runPrompt(value);
			}
			switch (command.type) {
				case 'select-model':
					setScreen('models');
					return false;
				case 'resume-session':
					setScreen('resume');
					return false;
				case 'switch-model':
					void switchModel(command.modelName);
					return true;
				case 'invalid':
					chat.appendSystemMessage(command.message, 'error');
					return true;
			}
		},
		[chat, switchModel],
	);

	const composer = useComposer({
		isActive: screen === 'chat' && pendingApproval === null,
		canSubmit:
			screen === 'chat' &&
			pendingApproval === null &&
			!isCommandBusy &&
			chat.state.loadStatus === 'ready' &&
			chat.state.turnStatus === 'idle',
		onSubmit: submit,
	});

	const selectModel = useCallback(
		(model: ListedModel) => {
			setModelSelection((current) => ({ status: 'submitting', items: current.items }));
			void switchModel(model.name).then((switched) => {
				if (switched) {
					composer.clear();
					setScreen('chat');
					return;
				}
				setModelSelection((current) => ({
					status: 'idle',
					items: current.items,
					error: 'Could not switch model. See the chat error for details.',
				}));
			});
		},
		[composer, switchModel],
	);

	const selectSession = useCallback(
		(choice: ResumeChoice) => {
			const selectedSessionId: SessionId =
				choice.type === 'new' ? controller.createSessionId() : choice.session.sessionId;
			setRestoreSessionModel(choice.type === 'existing');
			setSessionId(selectedSessionId);
			setHasChat(true);
			composer.clear();
			setScreen('chat');
		},
		[composer, controller],
	);

	const cancelScreen = useCallback(() => {
		if (hasChat) {
			setScreen('chat');
		}
	}, [hasChat]);
	const canCancelTurn =
		screen === 'chat' && pendingApproval === null && chat.state.turnStatus !== 'idle';

	useInput((value, key) => {
		if (key.ctrl && value.toLowerCase() === 'c') {
			if (canCancelTurn) {
				chat.abortTurn();
				return;
			}

			exit();
			return;
		}

		if (key.escape && canCancelTurn) {
			chat.abortTurn();
		}
	});

	return {
		canCancelScreen: hasChat,
		cancelScreen,
		chat,
		composer,
		modelName,
		modelSelection,
		pendingApproval,
		resolveApproval,
		screen,
		selectModel,
		selectSession,
		sessionId,
		sessionSelection,
	};
};

const toError = (caughtError: unknown): Error => {
	return caughtError instanceof Error ? caughtError : new Error(String(caughtError));
};
