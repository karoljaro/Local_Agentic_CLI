import type { Runtime } from '@/composition/createRuntime';
import type { SessionId } from '@/domain/Ids';

export type StartupMode = 'new' | 'resume';

export type SessionOption = {
	sessionId: SessionId;
	lastActiveAt?: string;
	preview?: string;
};

// Presentation consumes the real composition contract without a parallel method surface.
export type PresentationRuntime = Pick<
	Runtime,
	| 'createSessionId'
	| 'getModelName'
	| 'listModels'
	| 'listSessions'
	| 'listSessionEvents'
	| 'readSessionPreviewEvents'
	| 'runTurn'
	| 'setApprovalHandler'
	| 'subscribeSessionEvents'
	| 'switchModel'
	| 'workspacePath'
>;
export type TurnInput = Parameters<Runtime['runTurn']>[0];
export type TurnOutput = ReturnType<Runtime['runTurn']>;
export type TurnDelta = TurnOutput extends AsyncIterable<infer Delta> ? Delta : never;
