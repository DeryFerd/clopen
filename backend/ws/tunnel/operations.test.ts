import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockStartQuickTunnel = mock(async (_port: number, _autoStopMinutes: number) => ({
	publicUrl: 'https://quick.example.com',
	timings: {},
	restarted: false
}));
const mockSetRemoteIngressUpdateCallback = mock(() => {});
const mockSetStatusChangedCallback = mock(() => {});

mock.module('../../tunnel/global-tunnel-manager', () => ({
	globalTunnelManager: {
		setRemoteIngressUpdateCallback: mockSetRemoteIngressUpdateCallback,
		setStatusChangedCallback: mockSetStatusChangedCallback,
		startQuickTunnel: mockStartQuickTunnel
	}
}));

mock.module('../../tunnel/tunnel-config', () => ({
	getRemoteTunnelConfigById: mock(() => null),
	getLocalTunnelConfigById: mock(() => null),
	addLocalTunnelConfig: mock(() => null),
	removeLocalTunnelConfig: mock(() => null),
	addLocalTunnelIngress: mock(() => null),
	removeLocalTunnelIngress: mock(() => null),
	getAuthorizedZone: mock(() => null),
	setAuthorizedZone: mock(() => {}),
	clearAuthorizedZone: mock(() => {})
}));

const mockGetUserId = mock(() => 'user-1');
const mockGetRemoteAddress = mock(() => '203.0.113.10');
const mockGetRole = mock(() => 'member');

mock.module('$backend/utils/ws', () => ({
	ws: {
		getUserId: mockGetUserId,
		getRemoteAddress: mockGetRemoteAddress,
		getRole: mockGetRole,
		emit: {
			global: mock(() => {}),
			user: mock(() => {})
		}
	}
}));

const mockCanCreateTunnel = mock(() => ({ allowed: true }));
const mockRecordTunnelCreation = mock(() => {});
const mockGetStatus = mock(() => ({
	count: 0,
	limit: 10,
	resetAt: null
}));

mock.module('../../tunnel/tunnel-rate-limiter', () => ({
	tunnelRateLimiter: {
		canCreateTunnel: mockCanCreateTunnel,
		recordTunnelCreation: mockRecordTunnelCreation,
		getStatus: mockGetStatus
	}
}));

const mockLogQuickTunnelStart = mock(() => {});
const mockLogQuickTunnelStop = mock(() => {});
const mockLogQuickTunnelRestart = mock(() => {});

mock.module('../../tunnel/tunnel-audit-logger', () => ({
	tunnelAuditLogger: {
		logQuickTunnelStart: mockLogQuickTunnelStart,
		logQuickTunnelStop: mockLogQuickTunnelStop,
		logQuickTunnelRestart: mockLogQuickTunnelRestart,
		logRemoteTunnelStart: mock(() => {}),
		logRemoteTunnelStop: mock(() => {}),
		logLocalTunnelStart: mock(() => {}),
		logLocalTunnelStop: mock(() => {})
	}
}));

const mockGetRecentLogs = mock(() => []);
const mockGetEventsByType = mock(() => []);

mock.module('../../database/queries/audit-log-queries', () => ({
	auditLogQueries: {
		getRecentLogs: mockGetRecentLogs,
		getEventsByType: mockGetEventsByType
	}
}));

mock.module('$shared/utils/logger', () => ({
	debug: {
		log: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {})
	}
}));

const { operationsHandler } = await import('./operations');

function createConnection() {
	const sent: Array<{ action: string; payload: any }> = [];

	return {
		conn: {
			readyState: 1,
			send(message: string) {
				sent.push(JSON.parse(message));
			},
			close() {}
		},
		sent
	};
}

describe('operationsHandler quick tunnel routes', () => {
	beforeEach(() => {
		mockStartQuickTunnel.mockReset();
		mockStartQuickTunnel.mockImplementation(async () => ({
			publicUrl: 'https://quick.example.com',
			timings: {},
			restarted: false
		}));
		mockCanCreateTunnel.mockReset();
		mockCanCreateTunnel.mockImplementation(() => ({ allowed: true }));
		mockRecordTunnelCreation.mockClear();
		mockLogQuickTunnelStart.mockClear();
		mockLogQuickTunnelStop.mockClear();
	});

	test('rejects tunnel:quick:start before launching a tunnel when the user is over limit', async () => {
		mockCanCreateTunnel.mockImplementation(() => ({
			allowed: false,
			retryAfter: 60
		}));

		const { conn, sent } = createConnection();

		await (operationsHandler as any).handleMessage(conn, JSON.stringify({
			action: 'tunnel:quick:start',
			payload: {
				requestId: 'req-1',
				data: { port: 3000, autoStopMinutes: 30 }
			}
		}));

		expect(mockStartQuickTunnel).not.toHaveBeenCalled();
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			action: 'tunnel:quick:start:response',
			payload: {
				success: false,
				requestId: 'req-1'
			}
		});
		expect(sent[0].payload.error).toContain('Rate limit exceeded');
	});

	test('allows tunnel creation and logs audit event when under limit', async () => {
		const { conn, sent } = createConnection();

		await (operationsHandler as any).handleMessage(conn, JSON.stringify({
			action: 'tunnel:quick:start',
			payload: {
				requestId: 'req-2',
				data: { port: 3000 }
			}
		}));

		expect(mockStartQuickTunnel).toHaveBeenCalled();
		expect(mockRecordTunnelCreation).toHaveBeenCalledWith('user-1');
		expect(mockLogQuickTunnelStart).toHaveBeenCalledWith('user-1', 3000, {
			ipAddress: '203.0.113.10',
			autoStopMinutes: 60
		});
		expect(sent[0]).toMatchObject({
			action: 'tunnel:quick:start:response',
			payload: {
				success: true,
				requestId: 'req-2'
			}
		});
	});
});

describe('operationsHandler monitoring routes', () => {
	beforeEach(() => {
		mockGetRecentLogs.mockReset();
		mockGetRecentLogs.mockImplementation(() => []);
		mockGetEventsByType.mockReset();
		mockGetEventsByType.mockImplementation(() => []);
		mockGetRole.mockReset();
		mockGetRole.mockImplementation(() => 'member');
		mockGetUserId.mockReset();
		mockGetUserId.mockImplementation(() => 'user-1');
	});

	test('tunnel:monitoring:rate-limit-status allows members to check their own status', async () => {
		const { conn, sent } = createConnection();

		await (operationsHandler as any).handleMessage(conn, JSON.stringify({
			action: 'tunnel:monitoring:rate-limit-status',
			payload: {
				requestId: 'req-1',
				data: {}
			}
		}));

		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			action: 'tunnel:monitoring:rate-limit-status:response',
			payload: {
				success: true,
				requestId: 'req-1'
			}
		});
		expect(sent[0].payload.data).toMatchObject({
			userId: 'user-1'
		});
	});

	test('tunnel:monitoring:rate-limit-status rejects member checking another user', async () => {
		const { conn, sent } = createConnection();

		await (operationsHandler as any).handleMessage(conn, JSON.stringify({
			action: 'tunnel:monitoring:rate-limit-status',
			payload: {
				requestId: 'req-2',
				data: { userId: 'user-2' }
			}
		}));

		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			action: 'tunnel:monitoring:rate-limit-status:response',
			payload: {
				success: false,
				error: 'Admin access required to check other users rate limits',
				requestId: 'req-2'
			}
		});
	});

	test('tunnel:monitoring:rate-limit-status allows admin to check any user', async () => {
		mockGetRole.mockImplementation(() => 'admin');
		const { conn, sent } = createConnection();

		await (operationsHandler as any).handleMessage(conn, JSON.stringify({
			action: 'tunnel:monitoring:rate-limit-status',
			payload: {
				requestId: 'req-3',
				data: { userId: 'user-2' }
			}
		}));

		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			action: 'tunnel:monitoring:rate-limit-status:response',
			payload: {
				success: true,
				requestId: 'req-3'
			}
		});
		expect(sent[0].payload.data).toMatchObject({
			userId: 'user-2'
		});
	});
});
