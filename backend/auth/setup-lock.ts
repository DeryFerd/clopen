/**
 * Setup Lock
 *
 * Prevents race conditions during initial system setup by ensuring only one
 * setup request can proceed at a time. This is an in-memory mutex that
 * serializes concurrent setup requests.
 *
 * Usage:
 * ```ts
 * if (!acquireSetupLock()) {
 *   throw new Error('Setup already in progress');
 * }
 * try {
 *   // perform setup
 * } finally {
 *   releaseSetupLock();
 * }
 * ```
 */

let isLocked = false;

/**
 * Attempt to acquire the setup lock.
 * @returns true if lock was acquired, false if already held
 */
export function acquireSetupLock(): boolean {
	if (isLocked) {
		return false;
	}
	isLocked = true;
	return true;
}

/**
 * Release the setup lock.
 * Safe to call even if lock is not held (no-op).
 */
export function releaseSetupLock(): void {
	isLocked = false;
}

/**
 * Check if the setup lock is currently held.
 * @returns true if a setup operation is in progress
 */
export function isSetupLocked(): boolean {
	return isLocked;
}
