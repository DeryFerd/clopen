import { describe, expect, test, beforeEach, mock } from 'bun:test';

mock.module('$shared/utils/logger', () => ({
	debug: {
		log: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {})
	}
}));

import { tunnelRateLimiter } from './tunnel-rate-limiter';

describe('Tunnel Rate Limiter', () => {
	beforeEach(() => {
		// Clear all rate limits before each test
		tunnelRateLimiter.clearAll();
	});

	test('should allow tunnel creation when under limit', () => {
		const userId = 'user-123';
		const result = tunnelRateLimiter.canCreateTunnel(userId);
		expect(result.allowed).toBe(true);
		expect(result.retryAfter).toBeUndefined();
	});

	test('should track tunnel creation count', () => {
		const userId = 'user-123';
		
		// Create 3 tunnels
		for (let i = 0; i < 3; i++) {
			tunnelRateLimiter.recordTunnelCreation(userId);
		}
		
		const status = tunnelRateLimiter.getStatus(userId);
		expect(status.count).toBe(3);
		expect(status.limit).toBe(10);
		expect(status.resetAt).toBeGreaterThan(Date.now());
	});

	test('should block tunnel creation when limit exceeded', () => {
		const userId = 'user-123';
		
		// Create 10 tunnels (max limit)
		for (let i = 0; i < 10; i++) {
			tunnelRateLimiter.recordTunnelCreation(userId);
		}
		
		// 11th tunnel should be blocked
		const result = tunnelRateLimiter.canCreateTunnel(userId);
		expect(result.allowed).toBe(false);
		expect(result.retryAfter).toBeGreaterThan(0);
	});

	test('should reset limit after window expires', () => {
		const userId = 'user-123';
		
		// Create 10 tunnels
		for (let i = 0; i < 10; i++) {
			tunnelRateLimiter.recordTunnelCreation(userId);
		}
		
		// Should be blocked
		expect(tunnelRateLimiter.canCreateTunnel(userId).allowed).toBe(false);
		
		// Manually reset (simulating window expiry)
		tunnelRateLimiter.resetUser(userId);
		
		// Should be allowed again
		expect(tunnelRateLimiter.canCreateTunnel(userId).allowed).toBe(true);
	});

	test('should track different users independently', () => {
		const user1 = 'user-1';
		const user2 = 'user-2';
		
		// User 1 creates 5 tunnels
		for (let i = 0; i < 5; i++) {
			tunnelRateLimiter.recordTunnelCreation(user1);
		}
		
		// User 2 creates 3 tunnels
		for (let i = 0; i < 3; i++) {
			tunnelRateLimiter.recordTunnelCreation(user2);
		}
		
		const status1 = tunnelRateLimiter.getStatus(user1);
		const status2 = tunnelRateLimiter.getStatus(user2);
		
		expect(status1.count).toBe(5);
		expect(status2.count).toBe(3);
	});

	test('should return zero count for new user', () => {
		const userId = 'new-user';
		const status = tunnelRateLimiter.getStatus(userId);
		
		expect(status.count).toBe(0);
		expect(status.limit).toBe(10);
		expect(status.resetAt).toBeNull();
	});

	test('should clear all limits', () => {
		const user1 = 'user-1';
		const user2 = 'user-2';
		
		tunnelRateLimiter.recordTunnelCreation(user1);
		tunnelRateLimiter.recordTunnelCreation(user2);
		
		tunnelRateLimiter.clearAll();
		
		expect(tunnelRateLimiter.getStatus(user1).count).toBe(0);
		expect(tunnelRateLimiter.getStatus(user2).count).toBe(0);
	});
});
