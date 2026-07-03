import { render } from 'ink';
import { App } from '@/App';
import { readStartupMode } from '@/presentation/chat/startupMode';

render(<App initialMode={readStartupMode(process.argv)} />);
