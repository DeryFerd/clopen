/**
 * Engine Utilities
 *
 * Shared helpers used by engine status handlers.
 */

type EngineCommand = 'claude' | 'opencode';

export function getBackendOS(): 'windows' | 'macos' | 'linux' {
	switch (process.platform) {
		case 'win32': return 'windows';
		case 'darwin': return 'macos';
		default: return 'linux';
	}
}

const resolvedCommands = new Map<EngineCommand, string>();

/**
 * Resolves the correct CLI command for the current platform.
 * On Windows, tries the base command first, then falls back to
 * command.cmd for older CLI installations. Result is cached.
 */
export async function resolveCommand(command: EngineCommand): Promise<string> {
	const cached = resolvedCommands.get(command);
	if (cached) return cached;

	let resolved: string = command;

	if (!await trySpawn(command) && process.platform === 'win32') {
		const fallback = command + '.cmd';
		if (await trySpawn(fallback)) resolved = fallback;
	}

	resolvedCommands.set(command, resolved);
	return resolved;
}

async function trySpawn(command: string): Promise<boolean> {
	try {
		const proc = Bun.spawn([command, '--version'], { stdout: 'pipe', stderr: 'pipe' });
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}

export async function detectCLI(command: EngineCommand): Promise<{ installed: boolean; version: string | null }> {
	const resolved = await resolveCommand(command);

	try {
		const proc = Bun.spawn([resolved, '--version'], {
			stdout: 'pipe',
			stderr: 'pipe'
		});

		const exitCode = await proc.exited;
		if (exitCode !== 0) return { installed: false, version: null };

		const stdout = await new Response(proc.stdout).text();
		const raw = stdout.trim();
		// Extract only the version token (e.g. "2.1.52" from "2.1.52 (Claude Code)")
		const version = raw.split(/[\s(]/)[0] || raw || null;
		return { installed: true, version };
	} catch {
		return { installed: false, version: null };
	}
}
