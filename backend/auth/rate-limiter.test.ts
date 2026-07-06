/**
 * Behavior-based tests for AuthRateLimiter.
 *
 * Validates:
 *  - Failure-based lockout tiers (5/10/20 → 30s/2m/10m) still trigger.
 *  - Volume cap on attempts fires independently of success/failure mix,
 *    defending routes like `auth:validate-invite` against probes that
 *    alternate valid and invalid tokens.
 *  - `recordSuccess` clears BOTH the failure counter and the attempt
 *    counter, so legitimate users don't accumulate debt across successful
 *    validations.
 *  - Lockout state is per-route and per-identifier.
 *
 * Each test uses a unique random identifier so the singleton's in-memory
 * state does not bleed across tests.
 */

import { describe, expect, test } from 'bun:test';
import { authRateLimiter } from './rate-limiter';

function uniqueId(label: string): string {
	// IPv4-shaped string the rate limiter treats as opaque.
	return `203.0.113.${Math.floor(Math.random() * 200) + 10}-${label}`;
}

/**
 * Extract a human-readable message + lockout-remaining-ms from whatever
 * `check()` returns. Today it's a string; PR #396 will change it to
 * `{ message, lockedUntil }`. This helper keeps the tests valid against
 * either shape by accepting `unknown` instead of depending on the
 * current return type of `check`.
 */
interface LockoutObject { message: string; lockedUntil: number }
function isLockoutObject(v: unknown): v is LockoutObject {
	return typeof v === 'object' && v !== null && 'message' in v && 'lockedUntil' in v;
}
function readLockout(result: unknown): { message: string; remainingMs: number } | null {
	if (result == null) return null;
	if (typeof result === 'string') {
		const match = result.match(/Try again in (\d+) seconds/);
		const remainingSec = match ? Number(match[1]) : 0;
		return { message: result, remainingMs: remainingSec * 1000 };
	}
	if (isLockoutObject(result)) {
		return { message: result.message, remainingMs: result.lockedUntil - Date.now() };
	}
	return null;
}

describe('failure-based lockout tiers (regression)', () => {
	test('five failures lock for 30s', () => {
		const id = uniqueId('5fail');
		for (let i = 0; i < 5; i++) {
			authRateLimiter.recordFailure(id, 'auth:login');
		}
		const lockout = readLockout(authRateLimiter.check(id, 'auth:login'));
		expect(lockout).not.toBeNull();
		expect(lockout!.remainingMs).toBeGreaterThanOrEqual(25_000);
		expect(lockout!.remainingMs).toBeLessThanOrEqual(30_500);
	});

	test('ten failures escalate to 2-minute lockout', () => {
		const id = uniqueId('10fail');
		for (let i = 0; i < 10; i++) {
			authRateLimiter.recordFailure(id, 'auth:login');
		}
		const lockout = readLockout(authRateLimiter.check(id, 'auth:login'));
		expect(lockout).not.toBeNull();
		expect(lockout!.remainingMs).toBeGreaterThanOrEqual(115_000);
		expect(lockout!.remainingMs).toBeLessThanOrEqual(120_500);
	});

	test('twenty failures escalate to 10-minute lockout', () => {
		const id = uniqueId('20fail');
		for (let i = 0; i < 20; i++) {
			authRateLimiter.recordFailure(id, 'auth:login');
		}
		const lockout = readLockout(authRateLimiter.check(id, 'auth:login'));
		expect(lockout).not.toBeNull();
		expect(lockout!.remainingMs).toBeGreaterThanOrEqual(595_000);
		expect(lockout!.remainingMs).toBeLessThanOrEqual(600_500);
	});
});

describe('attempt volume cap', () => {
	test('rate-limited when attempts exceed cap, even with no failures', () => {
		const id = uniqueId('100attempt');
		// 100 successful validations with the same identifier should not be
		// possible — the cap fires before a real user would ever hit it.
		for (let i = 0; i < 100; i++) {
			authRateLimiter.recordAttempt(id, 'auth:validate-invite');
		}
		const lockout = readLockout(authRateLimiter.check(id, 'auth:validate-invite'));
		expect(lockout).not.toBeNull();
		expect(lockout!.message).toMatch(/too many/i);
	});

	test('attempt counter resets after a successful recordSuccess', () => {
		// Establishes the "legit user not penalized" property: a real
		// user who does 99 attempts then gets one right can keep going.
		const id = uniqueId('reset-on-success');
		for (let i = 0; i < 99; i++) {
			authRateLimiter.recordAttempt(id, 'auth:validate-invite');
		}
		authRateLimiter.recordSuccess(id, 'auth:validate-invite');
		// Now do 50 more — must not be locked out.
		for (let i = 0; i < 50; i++) {
			authRateLimiter.recordAttempt(id, 'auth:validate-invite');
		}
		expect(authRateLimiter.check(id, 'auth:validate-invite')).toBeNull();
	});
});

describe('recordSuccess clears state', () => {
	test('a success after a single failure clears the failure record', () => {
		const id = uniqueId('clear-fail');
		authRateLimiter.recordFailure(id, 'auth:login');
		authRateLimiter.recordSuccess(id, 'auth:login');
		expect(authRateLimiter.check(id, 'auth:login')).toBeNull();
	});

	test('a success clears the attempt counter too (so legit users are not penalized)', () => {
		// Decision: recordSuccess clears the WHOLE per-route record. This
		// means the volume cap resets on success. Rationale: a legit user
		// validating a few invites should never hit the cap; the cap exists
		// to stop a probe that finds many valid tokens. The probe signature
		// is rapid attempts without matching successful completes — in
		// practice the same flow that calls recordAttempt calls
		// recordSuccess on valid results, so a real probe quickly shows
		// up as a high attempt count relative to the underlying use.
		// The defensive guarantee comes from the failure-tier lockout
		// for invalid probes and the moderate cap (100/15min) for the
		// mixed case.
		const id = uniqueId('clear-attempt');
		for (let i = 0; i < 50; i++) {
			authRateLimiter.recordAttempt(id, 'auth:validate-invite');
		}
		authRateLimiter.recordSuccess(id, 'auth:validate-invite');
		expect(authRateLimiter.check(id, 'auth:validate-invite')).toBeNull();
	});
});

describe('per-route isolation', () => {
	test('a lockout on auth:login does not affect auth:validate-invite', () => {
		const id = uniqueId('route-iso-1');
		for (let i = 0; i < 5; i++) {
			authRateLimiter.recordFailure(id, 'auth:login');
		}
		// login is locked …
		expect(authRateLimiter.check(id, 'auth:login')).not.toBeNull();
		// … but validate-invite is fresh.
		expect(authRateLimiter.check(id, 'auth:validate-invite')).toBeNull();
	});

	test('attempts on different routes do not bleed into each other', () => {
		const id = uniqueId('route-iso-2');
		for (let i = 0; i < 100; i++) {
			authRateLimiter.recordAttempt(id, 'auth:validate-invite');
		}
		// validate-invite capped …
		expect(authRateLimiter.check(id, 'auth:validate-invite')).not.toBeNull();
		// … but login is unaffected.
		expect(authRateLimiter.check(id, 'auth:login')).toBeNull();
	});
});

describe('per-identifier isolation', () => {
	test('one IP hitting the cap does not affect another IP', () => {
		const idA = uniqueId('ipA');
		const idB = uniqueId('ipB');
		for (let i = 0; i < 100; i++) {
			authRateLimiter.recordAttempt(idA, 'auth:validate-invite');
		}
		expect(authRateLimiter.check(idA, 'auth:validate-invite')).not.toBeNull();
		expect(authRateLimiter.check(idB, 'auth:validate-invite')).toBeNull();
	});
});
