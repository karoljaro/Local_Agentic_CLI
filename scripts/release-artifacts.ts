import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type ArtifactFormat = 'elf' | 'pe';

export type ReleaseArtifact = {
	name: string;
	format: ArtifactFormat;
	executable: boolean;
};

export const RELEASE_ARTIFACTS: readonly ReleaseArtifact[] = [
	{ name: 'codesh', format: 'elf', executable: true },
	{ name: 'rg', format: 'elf', executable: true },
	{ name: 'codesh.exe', format: 'pe', executable: false },
	{ name: 'rg.exe', format: 'pe', executable: false },
];

const SIGNATURES: Record<ArtifactFormat, readonly number[]> = {
	elf: [0x7f, 0x45, 0x4c, 0x46],
	pe: [0x4d, 0x5a],
};

export const validateReleaseArtifacts = async (distDirectory: string): Promise<void> => {
	for (const artifact of RELEASE_ARTIFACTS) {
		await validateReleaseArtifact(join(distDirectory, artifact.name), artifact);
	}
};

export const validateReleaseArtifact = async (
	path: string,
	artifact: ReleaseArtifact,
): Promise<void> => {
	const metadata = await stat(path);
	const signature = SIGNATURES[artifact.format];

	if (!metadata.isFile() || metadata.size <= signature.length) {
		throw new Error(`${path} is not a non-empty release artifact.`);
	}

	if (artifact.executable && process.platform !== 'win32' && (metadata.mode & 0o111) === 0) {
		throw new Error(`${path} is not executable.`);
	}

	const prefix = await readPrefix(path, signature.length);

	if (!signature.every((byte, index) => prefix[index] === byte)) {
		throw new Error(`${path} is not a valid ${artifact.format.toUpperCase()} artifact.`);
	}
};

const readPrefix = async (path: string, length: number): Promise<Uint8Array> => {
	const handle = await open(path, 'r');
	const prefix = new Uint8Array(length);

	try {
		const { bytesRead } = await handle.read(prefix, 0, length, 0);

		if (bytesRead !== length) {
			throw new Error(`${path} is truncated.`);
		}

		return prefix;
	} finally {
		await handle.close();
	}
};
