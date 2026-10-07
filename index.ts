import { readStartupMode } from '@/presentation/startupMode';
import { startTerminal } from '@/presentation/start';

await startTerminal(readStartupMode(process.argv));
