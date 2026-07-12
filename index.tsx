import { render } from 'ink';
import { App } from '@/App';
import { readStartupMode } from '@/presentation/startupMode';

render(<App initialMode={readStartupMode(process.argv)} />);
