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
			windowMs: 1000
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
});
