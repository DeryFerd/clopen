import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { acquireSetupLock, releaseSetupLock, isSetupLocked } from './setup-lock';

describe('setup-lock', () => {
	beforeEach(() => {
		// Ensure lock is released before each test
		releaseSetupLock();
	});

	afterEach(() => {
		// Clean up after each test
		releaseSetupLock();
	});

	test('acquireSetupLock returns true when lock is available', () => {
		expect(acquireSetupLock()).toBe(true);
	});

	test('acquireSetupLock returns false when lock is already held', () => {
		expect(acquireSetupLock()).toBe(true);
		expect(acquireSetupLock()).toBe(false);
	});

	test('isSetupLocked returns true after lock is acquired', () => {
		acquireSetupLock();
		expect(isSetupLocked()).toBe(true);
	});

	test('isSetupLocked returns false when lock is not held', () => {
		expect(isSetupLocked()).toBe(false);
	});

	test('releaseSetupLock allows re-acquiring', () => {
		acquireSetupLock();
		releaseSetupLock();
		expect(acquireSetupLock()).toBe(true);
	});

	test('releaseSetupLock when not locked does not throw', () => {
		expect(() => releaseSetupLock()).not.toThrow();
	});
});
