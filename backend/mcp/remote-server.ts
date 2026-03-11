/**
 * Remote MCP HTTP Server for Open Code
 *
 * Serves custom MCP tools over HTTP (Streamable HTTP transport) so Open Code
 * can connect via `type: 'remote'` config instead of spawning a stdio subprocess.
 *
 * Tool handlers execute directly in the main Clopen process — no subprocess,
 * no WebSocket bridge. This is architecturally identical to how Claude Code
 * uses in-process MCP servers via createSdkMcpServer().
 *
 * Transport: WebStandardStreamableHTTPServerTransport (works natively with Bun)
 */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createRemoteMcpServer } from './servers/helper';
import { debug } from '$shared/utils/logger';

// Lazy imports to avoid circular dependencies at module load time
let _allServers: Parameters<typeof createRemoteMcpServer>[0] | null = null;
let _enabledConfig: Parameters<typeof createRemoteMcpServer>[1] | null = null;

async function getServerDeps() {
	if (!_allServers || !_enabledConfig) {
		const { allServers } = await import('./servers/index');
		const { mcpServersConfig } = await import('./config');
		_allServers = allServers;
		_enabledConfig = mcpServersConfig;
	}
	return { allServers: _allServers, enabledConfig: _enabledConfig };
}

// ============================================================================
// Session Management
// ============================================================================

/** Active transports keyed by MCP session ID */
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

/** Active MCP servers keyed by MCP session ID */
const servers = new Map<string, McpServer>();

/**
 * Handle an incoming MCP HTTP request (GET/POST/DELETE).
 *
 * Mounted at /mcp on the main Elysia server.
 * Follows the Streamable HTTP transport protocol:
 * - POST without session: initialization → create new transport + server
 * - POST with session: route to existing transport
 * - GET with session: SSE stream for server notifications
 * - DELETE with session: close session
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
	const sessionId = request.headers.get('mcp-session-id');

	// Existing session — route to its transport
	if (sessionId && transports.has(sessionId)) {
		const transport = transports.get(sessionId)!;
		return transport.handleRequest(request);
	}

	// New initialization request — create transport + MCP server
	if (request.method === 'POST') {
		// Parse body to check if it's an init request
		const body = await request.json();

		if (isInitializeRequest(body)) {
			const { allServers, enabledConfig } = await getServerDeps();

			const transport = new WebStandardStreamableHTTPServerTransport({
				sessionIdGenerator: () => crypto.randomUUID(),
				onsessioninitialized: (sid) => {
					transports.set(sid, transport);
					debug.log('mcp', `🌐 Remote MCP session initialized: ${sid}`);
				},
				onsessionclosed: (sid) => {
					transports.delete(sid);
					servers.delete(sid);
					debug.log('mcp', `🌐 Remote MCP session closed: ${sid}`);
				},
			});

			transport.onclose = () => {
				if (transport.sessionId) {
					transports.delete(transport.sessionId);
					servers.delete(transport.sessionId);
				}
			};

			// Create a fresh MCP server with all enabled tools (in-process handlers)
			const mcpServer = createRemoteMcpServer(allServers, enabledConfig);
			await mcpServer.connect(transport);

			// Store server reference for cleanup
			if (transport.sessionId) {
				servers.set(transport.sessionId, mcpServer);
			}

			// Handle the initialization request with pre-parsed body
			return transport.handleRequest(request, { parsedBody: body });
		}
	}

	// Invalid request
	return new Response(JSON.stringify({
		jsonrpc: '2.0',
		error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
		id: null,
	}), {
		status: 400,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * Close all active MCP sessions and transports.
 * Called during graceful server shutdown.
 */
export async function closeMcpServer(): Promise<void> {
	for (const [sessionId, transport] of transports) {
		try {
			await transport.close();
			debug.log('mcp', `🌐 Remote MCP transport closed: ${sessionId}`);
		} catch (error) {
			debug.error('mcp', `Error closing MCP transport ${sessionId}:`, error);
		}
	}
	transports.clear();
	servers.clear();
	debug.log('mcp', '🌐 All remote MCP sessions closed');
}
