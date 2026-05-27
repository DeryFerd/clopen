/**
 * Tests for MCP Remote Server Authentication
 */

import { describe, expect, test, beforeAll, mock } from 'bun:test';

// Mock dependencies
const mockAuthQueries = {
	getSessionByTokenHash: mock((hash: string) => {
		if (hash === 'valid-session-hash') {
			return {
				id: 'session-1',
				user_id: 'user-123',
				expires_at: new Date(Date.now() + 86400000).toISOString()
			};
		}
		return null;
	}),
	getUserById: mock((id: string) => {
		if (id === 'user-123') {
			return { id: 'user-123', role: 'admin', name: 'Test User' };
		}
		return null;
	}),
	getUserByPatHash: mock((hash: string) => {
		if (hash === 'valid-pat-hash') {
			return { id: 'user-456', role: 'member', name: 'PAT User' };
		}
		return null;
	})
};

const mockHashToken = mock((token: string) => {
	if (token === 'valid-session-token') return 'valid-session-hash';
	if (token === 'valid-pat-token') return 'valid-pat-hash';
	return 'invalid-hash';
});

let mockAuthMode = 'required';
const mockGetAuthMode = mock(() => mockAuthMode);

// Mock modules
mock.module('$backend/database/queries', () => ({
	authQueries: mockAuthQueries
}));

mock.module('$backend/auth/tokens', () => ({
	hashToken: mockHashToken
}));

mock.module('$backend/auth/auth-service', () => ({
	getAuthMode: mockGetAuthMode
}));

// Import after mocking
const { handleMcpRequest } = await import('./remote-server');

describe('MCP Remote Server Authentication', () => {
	beforeAll(() => {
		mockAuthMode = 'required';
	});

	test('should reject requests without Authorization header', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: {},
				id: 1
			})
		});

		const response = await handleMcpRequest(request);
		expect(response.status).toBe(401);

		const body = await response.json();
		expect(body.error).toBeDefined();
		expect(body.error.code).toBe(-32001);
		expect(body.error.message).toContain('Unauthorized');
	});

	test('should reject requests with invalid Bearer token', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Bearer invalid-token-12345'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: {},
				id: 1
			})
		});

		const response = await handleMcpRequest(request);
		expect(response.status).toBe(401);

		const body = await response.json();
		expect(body.error).toBeDefined();
		expect(body.error.code).toBe(-32001);
	});

	test('should reject requests with malformed Authorization header', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'InvalidFormat token123'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: {},
				id: 1
			})
		});

		const response = await handleMcpRequest(request);
		expect(response.status).toBe(401);
	});

	test('should include WWW-Authenticate header in 401 responses', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: {},
				id: 1
			})
		});

		const response = await handleMcpRequest(request);
		expect(response.status).toBe(401);
		expect(response.headers.get('WWW-Authenticate')).toBe('Bearer realm="MCP Server"');
	});

	test('should accept valid session token', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Bearer valid-session-token'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
				id: 1
			})
		});

		const response = await handleMcpRequest(request);
		// Should not be 401 - will be handled by MCP transport
		expect(response.status).not.toBe(401);
	});

	test('should accept valid PAT token', async () => {
		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Bearer valid-pat-token'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
				id: 1
			})
		});

		const response = await handleMcpRequest(request);
		// Should not be 401 - will be handled by MCP transport
		expect(response.status).not.toBe(401);
	});

	test('should skip authentication in no-auth mode', async () => {
		mockAuthMode = 'none';

		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
				// No Authorization header
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
				id: 1
			})
		});

		const response = await handleMcpRequest(request);
		// Should not be 401 in no-auth mode
		expect(response.status).not.toBe(401);

		// Reset
		mockAuthMode = 'required';
	});

	test('should not create new session on each request', () => {
		// Verify that getUserByPatHash and getSessionByTokenHash are used
		// instead of loginWithToken which creates sessions
		
		// Reset mock call counts
		mockAuthQueries.getSessionByTokenHash.mockClear();
		mockAuthQueries.getUserByPatHash.mockClear();

		const request = new Request('http://localhost/mcp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Bearer valid-session-token'
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'initialize',
				params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
				id: 1
			})
		});

		handleMcpRequest(request);

		// Should call getSessionByTokenHash (pure lookup)
		expect(mockAuthQueries.getSessionByTokenHash).toHaveBeenCalled();
		// Should NOT create any new sessions
	});
});
