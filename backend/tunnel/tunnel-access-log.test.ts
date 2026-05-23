import { describe, expect, test, beforeEach } from 'bun:test';
import { tunnelAccessLogger } from './tunnel-access-log';

describe('Tunnel Access Logger', () => {
	beforeEach(() => {
		// Clear logs before each test
		tunnelAccessLogger.clearLogs();
	});

	test('should log tunnel creation', () => {
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'quick-3000',
			action: 'created',
			userId: 'user-123',
			port: 3000,
			publicUrl: 'https://test.trycloudflare.com'
		});

		const logs = tunnelAccessLogger.getRecentLogs(10);
		expect(logs).toHaveLength(1);
		expect(logs[0].tunnelType).toBe('quick');
		expect(logs[0].action).toBe('created');
		expect(logs[0].userId).toBe('user-123');
		expect(logs[0].port).toBe(3000);
	});

	test('should log tunnel stop', () => {
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'quick-3000',
			action: 'stopped',
			userId: 'user-123',
			port: 3000
		});

		const logs = tunnelAccessLogger.getRecentLogs(10);
		expect(logs).toHaveLength(1);
		expect(logs[0].action).toBe('stopped');
	});

	test('should get logs for specific tunnel', () => {
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-1',
			action: 'created',
			userId: 'user-123'
		});

		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-2',
			action: 'created',
			userId: 'user-123'
		});

		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-1',
			action: 'stopped',
			userId: 'user-123'
		});

		const tunnel1Logs = tunnelAccessLogger.getLogsForTunnel('tunnel-1');
		expect(tunnel1Logs).toHaveLength(2);
		expect(tunnel1Logs[0].action).toBe('created');
		expect(tunnel1Logs[1].action).toBe('stopped');
	});

	test('should get logs for specific user', () => {
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-1',
			action: 'created',
			userId: 'user-1'
		});

		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-2',
			action: 'created',
			userId: 'user-2'
		});

		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-3',
			action: 'created',
			userId: 'user-1'
		});

		const user1Logs = tunnelAccessLogger.getLogsForUser('user-1');
		expect(user1Logs).toHaveLength(2);
		expect(user1Logs.every(log => log.userId === 'user-1')).toBe(true);
	});

	test('should calculate statistics correctly', () => {
		// Create 3 quick tunnels
		for (let i = 0; i < 3; i++) {
			tunnelAccessLogger.log({
				tunnelType: 'quick',
				tunnelId: `quick-${i}`,
				action: 'created',
				userId: 'user-1'
			});
		}

		// Create 2 remote tunnels
		for (let i = 0; i < 2; i++) {
			tunnelAccessLogger.log({
				tunnelType: 'remote',
				tunnelId: `remote-${i}`,
				action: 'created',
				userId: 'user-2'
			});
		}

		const stats = tunnelAccessLogger.getStatistics();
		expect(stats.totalCreated).toBe(5);
		expect(stats.byType.quick).toBe(3);
		expect(stats.byType.remote).toBe(2);
		expect(stats.byUser['user-1']).toBe(3);
		expect(stats.byUser['user-2']).toBe(2);
	});

	test('should track active tunnels correctly', () => {
		// Create and start a tunnel
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-1',
			action: 'created',
			userId: 'user-1'
		});

		// Create another tunnel
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-2',
			action: 'created',
			userId: 'user-1'
		});

		// Stop first tunnel
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-1',
			action: 'stopped',
			userId: 'user-1'
		});

		const stats = tunnelAccessLogger.getStatistics();
		expect(stats.totalCreated).toBe(2);
		expect(stats.totalActive).toBe(1); // Only tunnel-2 is active
	});

	test('should limit log entries to MAX_LOGS', () => {
		// Create 1100 log entries (more than MAX_LOGS of 1000)
		// Suppress debug output for this test to avoid timeout
		const originalLog = console.log;
		console.log = () => {};
		
		for (let i = 0; i < 1100; i++) {
			tunnelAccessLogger.log({
				tunnelType: 'quick',
				tunnelId: `tunnel-${i}`,
				action: 'created',
				userId: 'user-1'
			});
		}
		
		console.log = originalLog;

		const logs = tunnelAccessLogger.getRecentLogs(2000);
		expect(logs.length).toBeLessThanOrEqual(1000);
	});

	test('should include timestamp in logs', () => {
		const beforeLog = Date.now();
		
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-1',
			action: 'created',
			userId: 'user-1'
		});

		const afterLog = Date.now();
		const logs = tunnelAccessLogger.getRecentLogs(1);
		
		expect(logs[0].timestamp).toBeDefined();
		const logTime = new Date(logs[0].timestamp).getTime();
		expect(logTime).toBeGreaterThanOrEqual(beforeLog);
		expect(logTime).toBeLessThanOrEqual(afterLog);
	});

	test('should clear all logs', () => {
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: 'tunnel-1',
			action: 'created',
			userId: 'user-1'
		});

		tunnelAccessLogger.clearLogs();
		
		const logs = tunnelAccessLogger.getRecentLogs(10);
		expect(logs).toHaveLength(0);
	});
});
