import { useEffect, useState } from 'react';
import { Text } from 'ink';

export function App() {
	const [status, setStatus] = useState('idle');

	useEffect(() => {
		setTimeout(() => {
			setStatus('thinking');
		}, 1000);

		setTimeout(() => {
			setStatus('done');
		}, 3000);
	}, []);

	return <Text>Status: {status}</Text>;
}
