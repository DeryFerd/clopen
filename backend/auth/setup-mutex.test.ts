import { beforeEach, describe, expect, test } from 'bun:test';

/**
 * Tests for the in-process setup mutex used to serialize
 * `auth:setup` and `auth:setup-no-auth` against each other.
 *
 * Background: before the fix, both routes checked `needsSetup()`,
 * then created a user. Two concurrent requests could both pass the
 * check and both create a user. The mutex serializes the entire
 * critical section so the second request sees a populated users
 * table when it re-checks.
 */

import { setupMutex, SETUP_LOCK_KEY } from '$backend/auth/setup-mutex';

// A controllable "job" that records when it starts and ends so we can
// assert that the mutex keeps two calls in series.
let inFlight = 0;
let maxConcurrent = 0;
let order = 0;
let startedAt: number[] = [];
let endedAt: number[] = [];

const job = async (label: string) => {
	const myOrder = order++;
	inFlight += 1;
	maxConcurrent = Math.max(maxConcurrent, inFlight);
	startedAt.push(myOrder);
	// Yield to the event loop so a second caller has a chance to enqueue.
	await new Promise((r) => setTimeout(r, 5));
	inFlight -= 1;
	endedAt.push(myOrder);
	return label;
};

beforeEach(() => {
	inFlight = 0;
	maxConcurrent = 0;
	order = 0;
	startedAt = [];
	endedAt = [];
});

describe('setupMutex', () => {
	test('serializes two parallel calls under the same key', async () => {
		const results = await Promise.all([
			setupMutex.run(SETUP_LOCK_KEY, () => job('A')),
			setupMutex.run(SETUP_LOCK_KEY, () => job('B'))
		]);
		expect(results).toEqual(['A', 'B']);
		expect(maxConcurrent).toBe(1);
		// startedAt/endedAt record the order in which each job acquired
		// (startedAt) and released (endedAt) the lock. With strict
		// serialization, A's end must precede B's start.
		const aEnd = endedAt.indexOf(0);
		const bStart = startedAt.indexOf(1);
		expect(aEnd).toBeLessThan(bStart);
	});

	test('different keys run in parallel', async () => {
		const [a, b] = await Promise.all([
			setupMutex.run('key-a', () => job('A')),
			setupMutex.run('key-b', () => job('B'))
		]);
		expect(a).toBe('A');
		expect(b).toBe('B');
		// Two independent keys — overlap is allowed. The 5 ms yield
		// inside `job` ensures both runs are in flight at once.
		expect(maxConcurrent).toBe(2);
	});

	test('releases the lock when the inner function throws', async () => {
		let okRanAfterThrow = false;
		const trap = async () => {
			await new Promise((r) => setTimeout(r, 5));
			throw new Error('boom');
		};
		const ok = async () => {
			okRanAfterThrow = true;
			return 'ok';
		};
		await expect(setupMutex.run(SETUP_LOCK_KEY, trap)).rejects.toThrow('boom');
		const result = await setupMutex.run(SETUP_LOCK_KEY, ok);
		expect(result).toBe('ok');
		expect(okRanAfterThrow).toBe(true);
	});

	test('releases the lock when the inner function returns synchronously', async () => {
		const result = await setupMutex.run(SETUP_LOCK_KEY, () => 'sync');
		expect(result).toBe('sync');
		// Should not deadlock on a subsequent call.
		const next = await setupMutex.run(SETUP_LOCK_KEY, () => 'next');
		expect(next).toBe('next');
	});

	test('queues many concurrent calls under the same key without deadlocking', async () => {
		// A slow-but-async job so we can observe inFlight > 0.
		const slowJob = async (i: number) => {
			inFlight += 1;
			maxConcurrent = Math.max(maxConcurrent, inFlight);
			await new Promise((r) => setTimeout(r, 2));
			inFlight -= 1;
			return i;
		};
		const N = 25;
		const results = await Promise.all(
			Array.from({ length: N }, (_, i) => setupMutex.run(SETUP_LOCK_KEY, () => slowJob(i)))
		);
		expect(results).toEqual(Array.from({ length: N }, (_, i) => i));
		expect(maxConcurrent).toBe(1);
	});
});
