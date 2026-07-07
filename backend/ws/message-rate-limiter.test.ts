import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { WSConnection } from '$shared/utils/ws-server';
import { MessageRateLimiter } from './message-rate-limiter';

type CloseCall = { code?: number; reason?: string };

function createMockConnection(): { conn: WSConnection; closeCalls: CloseCall[] } {
	const closeCalls: CloseCall[] = [];
	const conn: WSConnection = {
		readyState: 1,
		send: () => {},
		close: (code?: number, reason?: string) => {
			closeCalls.push({ code, reason });
		}
	};
	return { conn, closeCalls };
}

const originalDateNow = Date.now;

describe('MessageRateLimiter', () => {
	beforeEach(() => {
		const fixedNow = 1_700_000_000_000;
		Date.now = () => fixedNow;
	});

	afterEach(() => {
		Date.now = originalDateNow;
	});

	test('allows traffic under the warning threshold', () => {
		const limiter = new MessageRateLimiter();
		const { conn, closeCalls } = createMockConnection();

		for (let i = 0; i < 49; i++) {
			expect(limiter.checkRateLimit(conn, 'chat:send')).toBe(true);
		}

		const stats = limiter.getConnectionStats(conn);
		expect(stats?.messagesDropped).toBe(0);
		expect(closeCalls.length).toBe(0);
	});

	test('drops messages once throttle threshold is reached', () => {
		const limiter = new MessageRateLimiter();
		const { conn, closeCalls } = createMockConnection();

		for (let i = 0; i < 99; i++) {
			expect(limiter.checkRateLimit(conn, 'chat:send')).toBe(true);
		}

		expect(limiter.checkRateLimit(conn, 'chat:send')).toBe(false);
		const stats = limiter.getConnectionStats(conn);
		expect(stats?.isThrottled).toBe(true);
		expect(stats?.messagesDropped).toBe(1);
		expect(closeCalls.length).toBe(0);
	});

	test('drops and closes connection at disconnect threshold', () => {
		const limiter = new MessageRateLimiter({
			warningThreshold: 50,
			throttleThreshold: 300,
			disconnectThreshold: 200,
			windowMs: 1000,
			baseLockoutMs: 5000,
			maxLockoutMs: 1800000,
			lockoutResetMs: 300000
		});
		const { conn, closeCalls } = createMockConnection();

		for (let i = 0; i < 199; i++) {
			expect(limiter.checkRateLimit(conn, 'chat:send')).toBe(true);
		}

		expect(limiter.checkRateLimit(conn, 'chat:send')).toBe(false);
		const stats = limiter.getConnectionStats(conn);
		expect(stats?.isFlagged).toBe(true);
		expect(stats?.messagesDropped).toBe(1);
		expect(closeCalls.length).toBe(1);
		expect(closeCalls[0]).toEqual({ code: 1008, reason: 'Rate limit exceeded' });
	});

	test('applies exponential backoff for repeat violations', () => {
		let currentTime = 1_700_000_000_000;
		Date.now = () => currentTime;

		const limiter = new MessageRateLimiter({
			warningThreshold: 50,
			throttleThreshold: 100,
			disconnectThreshold: 200,
			windowMs: 1000,
			baseLockoutMs: 5000, // 5 seconds base
			maxLockoutMs: 1800000, // 30 minutes max
			lockoutResetMs: 300000 // 5 minutes reset
		});
		const { conn } = createMockConnection();

		// First violation: trigger throttle
		for (let i = 0; i < 100; i++) {
			limiter.checkRateLimit(conn, 'test');
		}

		let stats = limiter.getConnectionStats(conn);
		expect(stats?.lockoutCount).toBe(1);
		expect(stats?.lockedUntil).toBe(currentTime + 5000); // 5s lockout

		// Try during lockout - should be rejected
		currentTime += 2000; // 2 seconds later
		expect(limiter.checkRateLimit(conn, 'test')).toBe(false);

		// Wait for lockout to expire
		currentTime += 4000; // Total 6 seconds (past 5s lockout)
		
		// Second violation: should get 10s lockout (2^1 * 5s)
		for (let i = 0; i < 100; i++) {
			limiter.checkRateLimit(conn, 'test');
		}

		stats = limiter.getConnectionStats(conn);
		expect(stats?.lockoutCount).toBe(2);
		expect(stats?.lockedUntil).toBe(currentTime + 10000); // 10s lockout

		// Wait for lockout to expire
		currentTime += 11000;

		// Third violation: should get 20s lockout (2^2 * 5s)
		for (let i = 0; i < 100; i++) {
			limiter.checkRateLimit(conn, 'test');
		}

		stats = limiter.getConnectionStats(conn);
		expect(stats?.lockoutCount).toBe(3);
		expect(stats?.lockedUntil).toBe(currentTime + 20000); // 20s lockout
	});

	test('resets lockout count after reset period without violations', () => {
		let currentTime = 1_700_000_000_000;
		Date.now = () => currentTime;

		const limiter = new MessageRateLimiter({
			warningThreshold: 50,
			throttleThreshold: 100,
			disconnectThreshold: 200,
			windowMs: 1000,
			baseLockoutMs: 5000,
			maxLockoutMs: 1800000,
			lockoutResetMs: 300000 // 5 minutes
		});
		const { conn } = createMockConnection();

		// First violation
		for (let i = 0; i < 100; i++) {
			limiter.checkRateLimit(conn, 'test');
		}

		let stats = limiter.getConnectionStats(conn);
		expect(stats?.lockoutCount).toBe(1);

		// Wait past lockout + reset period (5 minutes + 5 seconds)
		currentTime += 305000;

		// Send normal traffic (under threshold)
		for (let i = 0; i < 10; i++) {
			expect(limiter.checkRateLimit(conn, 'test')).toBe(true);
		}

		stats = limiter.getConnectionStats(conn);
		expect(stats?.lockoutCount).toBe(0); // Should be reset
	});

	test('caps lockout duration at max', () => {
		let currentTime = 1_700_000_000_000;
		Date.now = () => currentTime;

		const limiter = new MessageRateLimiter({
			warningThreshold: 50,
			throttleThreshold: 100,
			disconnectThreshold: 200,
			windowMs: 1000,
			baseLockoutMs: 5000,
			maxLockoutMs: 30000, // 30 seconds max
			lockoutResetMs: 300000
		});
		const { conn } = createMockConnection();

		// Multiple violations to exceed max
		// 1st: 5s, 2nd: 10s, 3rd: 20s, 4th: 40s (but capped to 30s)
		for (let round = 0; round < 4; round++) {
			for (let i = 0; i < 100; i++) {
				limiter.checkRateLimit(conn, 'test');
			}
			
			const stats = limiter.getConnectionStats(conn);
			
			// For 4th violation, verify it's capped
			if (round === 3) {
				expect(stats?.lockoutCount).toBe(4);
				// 4th violation: 2^3 * 5000 = 40000, capped at 30000
				const expectedLockout = currentTime + 30000;
				expect(stats?.lockedUntil).toBe(expectedLockout);
			}
			
			currentTime += 45000; // Wait past any lockout
		}
	});
});
