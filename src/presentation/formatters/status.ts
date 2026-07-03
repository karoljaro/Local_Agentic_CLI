import type { UiStatus } from '@/presentation/chat/types';

export const getStatusText = (status: UiStatus): string => {
	switch (status) {
		case 'idle':
			return 'ready';
		case 'loading':
			return 'loading';
		case 'streaming':
			return 'streaming';
	}
};

export const getStatusColor = (status: UiStatus): 'green' | 'yellow' => {
	return status === 'idle' ? 'green' : 'yellow';
};
