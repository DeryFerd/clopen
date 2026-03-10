/**
 * Engine Utilities
 *
 * Shared helpers used by engine status handlers.
 */

export function getBackendOS(): 'windows' | 'macos' | 'linux' {
	switch (process.platform) {
		case 'win32': return 'windows';
		case 'darwin': return 'macos';
		default: return 'linux';
	}
}

let _resolvedClaudeCommand: string | null = null;

/**
 * Resolves the correct Claude CLI command for the current platform.
 * On Windows, tries 'claude' first, then 'claude.cmd' as a fallback
 * for older Claude CLI installations. Result is cached.
 */
export async function resolveClaudeCommand(): Promise<string> {
	if (_resolvedClaudeCommand !== null) return _resolvedClaudeCommand;

	if (await _trySpawn('claude')) {
		_resolvedClaudeCommand = 'claude';
		return 'claude';
	}

	if (process.platform === 'win32' && await _trySpawn('claude.cmd')) {
		_resolvedClaudeCommand = 'claude.cmd';
		return 'claude.cmd';
	}

	_resolvedClaudeCommand = 'claude';
	return 'claude';
}

async function _trySpawn(command: string): Promise<boolean> {
	try {
		const proc = Bun.spawn([command, '--version'], { stdout: 'pipe', stderr: 'pipe' });
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
}

export async function detectCLI(command: string): Promise<{ installed: boolean; version: string | null }> {
	try {
		const proc = Bun.spawn([command, '--version'], {
			stdout: 'pipe',
			stderr: 'pipe'
		});

		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			// On Windows, try .cmd fallback for older Claude CLI versions
			if (process.platform === 'win32' && !command.endsWith('.cmd')) {
				return detectCLI(command + '.cmd');
			}
			return { installed: false, version: null };
		}

		const stdout = await new Response(proc.stdout).text();
		const raw = stdout.trim();
		// Extract only the version token (e.g. "2.1.52" from "2.1.52 (Claude Code)")
		// Takes everything before the first whitespace or parenthesis
		const version = raw.split(/[\s(]/)[0] || raw || null;
		return { installed: true, version };
	} catch {
		// On Windows, try .cmd fallback on spawn error (ENOENT)
		if (process.platform === 'win32' && !command.endsWith('.cmd')) {
			return detectCLI(command + '.cmd');
		}
		return { installed: false, version: null };
	}
}
