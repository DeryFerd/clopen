import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockLogEvent = mock(() => true);
const mockDebugLog = mock(() => {});
const mockDebugError = mock(() => {});

mock.module('$backend/database/queries/audit-log-queries', () => ({
	auditLogQueries: {
		logEvent: mockLogEvent
	}
}));

mock.module('$shared/utils/logger', () => ({
	debug: {
		log: mockDebugLog,
		error: mockDebugError
	}
}));

const { tunnelAuditLogger } = await import('./tunnel-audit-logger');

describe('tunnelAuditLogger', () => {
	beforeEach(() => {
		mockLogEvent.mockClear();
		mockDebugLog.mockClear();
		mockDebugError.mockClear();
	});

	test('persists quick tunnel start events through the audit log query layer', () => {
		tunnelAuditLogger.logQuickTunnelStart('user-1', 3000, {
			ipAddress: '203.0.113.10',
			autoStopMinutes: 30
		});

		expect(mockLogEvent).toHaveBeenCalledTimes(1);

		const calls = mockLogEvent.mock.calls as unknown[][];
		const entry = calls[0]?.[0] as Record<string, unknown>;
		expect(entry).toMatchObject({
			userId: 'user-1',
			actorUserId: 'user-1',
			eventType: 'tunnel:quick:start',
			ipAddress: '203.0.113.10'
		});
		expect(JSON.parse(entry.eventDetails as string)).toEqual({
			tunnelType: 'quick',
			port: 3000,
			autoStopMinutes: 30,
			restarted: false
		});
	});

	test('persists quick tunnel stop events', () => {
		tunnelAuditLogger.logQuickTunnelStop('user-1', 3000, {
			ipAddress: '203.0.113.10'
		});

		expect(mockLogEvent).toHaveBeenCalledTimes(1);
		const calls = mockLogEvent.mock.calls as unknown[][];
		const entry = calls[0]?.[0] as Record<string, unknown>;
		expect(entry.eventType).toBe('tunnel:quick:stop');
		expect(JSON.parse(entry.eventDetails as string)).toEqual({
			tunnelType: 'quick',
			port: 3000
		});
	});

	test('persists quick tunnel restart events', () => {
		tunnelAuditLogger.logQuickTunnelRestart('user-1', 3000, {
			ipAddress: '203.0.113.10',
			autoStopMinutes: 60
		});

		expect(mockLogEvent).toHaveBeenCalledTimes(1);
		const calls = mockLogEvent.mock.calls as unknown[][];
		const entry = calls[0]?.[0] as Record<string, unknown>;
		expect(entry.eventType).toBe('tunnel:quick:restart');
		expect(JSON.parse(entry.eventDetails as string)).toEqual({
			tunnelType: 'quick',
			port: 3000,
			autoStopMinutes: 60,
			restarted: true
		});
	});

	test('persists remote tunnel start events', () => {
		tunnelAuditLogger.logRemoteTunnelStart('user-1', 'config-1', 'My Tunnel', {
			ipAddress: '203.0.113.10'
		});

		expect(mockLogEvent).toHaveBeenCalledTimes(1);
		const calls = mockLogEvent.mock.calls as unknown[][];
		const entry = calls[0]?.[0] as Record<string, unknown>;
		expect(entry.eventType).toBe('tunnel:remote:start');
		expect(JSON.parse(entry.eventDetails as string)).toEqual({
			tunnelType: 'remote',
			configId: 'config-1',
			label: 'My Tunnel'
		});
	});

	test('persists local tunnel start events', () => {
		tunnelAuditLogger.logLocalTunnelStart('user-1', 'local-1', 'dev-tunnel', {
			ipAddress: '203.0.113.10'
		});

		expect(mockLogEvent).toHaveBeenCalledTimes(1);
		const calls = mockLogEvent.mock.calls as unknown[][];
		const entry = calls[0]?.[0] as Record<string, unknown>;
		expect(entry.eventType).toBe('tunnel:local:start');
		expect(JSON.parse(entry.eventDetails as string)).toEqual({
			tunnelType: 'local',
			configId: 'local-1',
			name: 'dev-tunnel'
		});
	});

	test('does not throw when audit log write fails', () => {
		mockLogEvent.mockImplementationOnce(() => {
			throw new Error('DB write failed');
		});

		expect(() => {
			tunnelAuditLogger.logQuickTunnelStart('user-1', 3000, {});
		}).not.toThrow();

		expect(mockDebugError).toHaveBeenCalled();
	});
});
