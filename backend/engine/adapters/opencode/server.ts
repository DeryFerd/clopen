/**
 * Open Code Server & Client Manager
 *
 * Manages the Open Code server lifecycle via `createOpencode()` from the SDK
 * and provides an OpencodeClient singleton for all engine instances.
 *
 * Uses `createOpencode()` which starts the server in-process and returns
 * both the server handle and a connected client.
 */

import type { OpencodeClient } from '@opencode-ai/sdk';
import { getOpenCodeMcpConfig } from '../../../mcp';
import { debug } from '$shared/utils/logger';
import { findAvailablePort } from '../../../utils/port-utils';

const OPENCODE_PORT = 4096;
const OPENCODE_HOST = '127.0.0.1';

let serverHandle: { url: string; close(): void } | null = null;
let client: OpencodeClient | null = null;
let initPromise: Promise<void> | null = null;
let ready = false;

/**
 * Get (or create) the OpenCode client.
 * Concurrency-safe: multiple callers share a single init promise.
 *
 * Uses `createOpencode()` from the SDK to start the server and create a client.
 */
export async function ensureClient(): Promise<OpencodeClient> {
	if (client && ready) return client;

	if (initPromise) {
		await initPromise;
		return client!;
	}

	initPromise = init();
	try {
		await initPromise;
		return client!;
	} catch (error) {
		initPromise = null;
		throw error;
	}
}

async function init(): Promise<void> {
	debug.log('engine', 'Initializing Open Code client via createOpencode()...');

	const { createOpencode } = await import('@opencode-ai/sdk');

	// Build MCP config from enabled servers
	const mcpConfig = getOpenCodeMcpConfig();
	if (Object.keys(mcpConfig).length > 0) {
		debug.log('engine', `Open Code server: injecting ${Object.keys(mcpConfig).length} MCP server(s)`);
		for (const [name, config] of Object.entries(mcpConfig)) {
			debug.log('engine', `  → ${name}: ${config.type} (${(config as any).url || (config as any).command?.join(' ')})`);
		}
	}

	const actualPort = await findAvailablePort(OPENCODE_PORT);
	if (actualPort !== OPENCODE_PORT) {
		debug.log('engine', `Open Code port ${OPENCODE_PORT} in use, using ${actualPort} instead`);
	}

	const result = await createOpencode({
		hostname: OPENCODE_HOST,
		port: actualPort,
		...(Object.keys(mcpConfig).length > 0 && {
			config: { mcp: mcpConfig },
		}),
	});

	serverHandle = result.server;
	client = result.client;
	ready = true;

	debug.log('engine', `Open Code client ready (server: ${result.server.url})`);
}

/**
 * Get the current client (if initialized).
 * Returns null if not yet initialized. Use ensureClient() for guaranteed access.
 */
export function getClient(): OpencodeClient | null {
	return ready ? client : null;
}

/**
 * Get the OpenCode server base URL (e.g. "http://127.0.0.1:4096").
 * Used for direct HTTP calls to v2 endpoints not available on the v1 client.
 */
export function getServerUrl(): string | null {
	return serverHandle?.url ?? null;
}

/**
 * Dispose the OpenCode client and stop the server.
 * Called during full server shutdown (disposeAllEngines).
 */
export async function disposeOpenCodeClient(): Promise<void> {
	if (serverHandle) {
		try {
			debug.log('engine', `Closing Open Code server (${serverHandle.url})...`);
			ready = false;
			serverHandle.close();
		} catch (error) {
			debug.error('engine', 'Error closing Open Code server:', error);
		}
		serverHandle = null;
	}

	client = null;
	ready = false;
	initPromise = null;
	debug.log('engine', 'Open Code client disposed');
}
