import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { RELEASE_ARTIFACTS, validateReleaseArtifacts } from './release-artifacts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe('validateReleaseArtifacts', () => {
	test('accepts complete ELF and PE artifact pairs', async () => {
		const directory = await createArtifactDirectory();

		await expect(validateReleaseArtifacts(directory)).resolves.toBeUndefined();
	});

	test('rejects an artifact with an invalid binary signature', async () => {
		const directory = await createArtifactDirectory();
		await writeFile(join(directory, 'codesh.exe'), 'not-a-pe-binary');

		await expect(validateReleaseArtifacts(directory)).rejects.toThrow('is not a valid PE artifact');
	});

	test('rejects a non-executable Linux artifact', async () => {
		if (process.platform === 'win32') {
			return;
		}

		const directory = await createArtifactDirectory();
		await chmod(join(directory, 'codesh'), 0o644);

		await expect(validateReleaseArtifacts(directory)).rejects.toThrow('is not executable');
	});
});

const createArtifactDirectory = async (): Promise<string> => {
	const directory = await mkdtemp(join(tmpdir(), 'codesh-artifacts-test-'));
	temporaryDirectories.push(directory);
	await mkdir(directory, { recursive: true });

	for (const artifact of RELEASE_ARTIFACTS) {
		const signature = artifact.format === 'elf' ? [0x7f, 0x45, 0x4c, 0x46] : [0x4d, 0x5a];
		const path = join(directory, artifact.name);
		await writeFile(path, new Uint8Array([...signature, 0x01]));

		if (artifact.executable) {
			await chmod(path, 0o755);
		}
	}

	return directory;
};
