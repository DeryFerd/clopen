import { describe, test, expect, beforeEach, afterEach, beforeAll } from 'bun:test';
import { shouldRotateSession, checkAndRotateSession, forceRotateSession } from './session-rotation';
import { authQueries } from '../database/queries/auth-queries';
import { hashToken } from './tokens';
import { initializeDatabase, closeDatabase } from '../database';

describe('Session Rotation', () => {
	const originalEnv = process.env.CLOPEN_SESSION_ROTATION_DAYS;

	beforeAll(async () => {
		await initializeDatabase();
	});

	afterEach(() => {
		// Restore original env
		if (originalEnv !== undefined) {
			process.env.CLOPEN_SESSION_ROTATION_DAYS = originalEnv;
		} else {
			delete process.env.CLOPEN_SESSION_ROTATION_DAYS;
		}
	});

	describe('shouldRotateSession', () => {
		test('returns false for sessions younger than rotation interval', () => {
			const session = {
				created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() // 6 days old
			};

			expect(shouldRotateSession(session)).toBe(false);
		});

		test('returns true for sessions older than rotation interval (7 days default)', () => {
			const session = {
				created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() // 8 days old
			};

			expect(shouldRotateSession(session)).toBe(true);
		});

		test('returns false when rotation is disabled (CLOPEN_SESSION_ROTATION_DAYS=0)', () => {
			process.env.CLOPEN_SESSION_ROTATION_DAYS = '0';

			const session = {
				created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days old
			};

			expect(shouldRotateSession(session)).toBe(false);
		});

		test('respects custom rotation interval from environment', () => {
			process.env.CLOPEN_SESSION_ROTATION_DAYS = '14'; // 14 days

			const youngSession = {
				created_at: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString()
			};
			expect(shouldRotateSession(youngSession)).toBe(false);

			const oldSession = {
				created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
			};
			expect(shouldRotateSession(oldSession)).toBe(true);
		});
	});

	describe('checkAndRotateSession', () => {
		let testUserId: string;
		let testSessionId: string;

		beforeEach(() => {
			testUserId = `user-test-${crypto.randomUUID()}`;
			testSessionId = `session-test-${crypto.randomUUID()}`;

			// Create a test user
			authQueries.createUser({
				id: testUserId,
				name: 'Test User',
				color: '#ff0000',
				avatar: 'TU',
				role: 'member',
				personal_access_token_hash: hashToken('test-pat'),
				created_at: new Date().toISOString()
			});
		});

		afterEach(() => {
			// Cleanup
			try {
				authQueries.deleteSessionsByUserId(testUserId);
				authQueries.deleteUser(testUserId);
			} catch {
				// Best effort cleanup
			}
		});

		test('does not rotate young sessions', () => {
			const session = authQueries.createSession({
				id: testSessionId,
				user_id: testUserId,
				token_hash: hashToken('test-token'),
				expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
				created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day old
				last_active_at: new Date().toISOString()
			});

			const result = checkAndRotateSession(session);

			expect(result.rotated).toBe(false);
			expect(result.newToken).toBeUndefined();

			// Original session should still exist
			const stillExists = authQueries.getSessionByTokenHash(hashToken('test-token'));
			expect(stillExists).not.toBeNull();
		});

		test('rotates old sessions and returns new token', () => {
			const oldSession = authQueries.createSession({
				id: testSessionId,
				user_id: testUserId,
				token_hash: hashToken('old-token'),
				expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
				created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days old
				last_active_at: new Date().toISOString()
			});

			const result = checkAndRotateSession(oldSession);

			expect(result.rotated).toBe(true);
			expect(result.newToken).toBeDefined();
			expect(result.newExpiresAt).toBe(oldSession.expires_at);
			expect(result.newTokenHash).toBeDefined();

			// Old session should be deleted
			const oldGone = authQueries.getSessionByTokenHash(hashToken('old-token'));
			expect(oldGone).toBeNull();

			// New session should exist
			const newExists = authQueries.getSessionByTokenHash(result.newTokenHash!);
			expect(newExists).not.toBeNull();
			expect(newExists?.user_id).toBe(testUserId);
		});

		test('preserves expiry when rotating', () => {
			const originalExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
			const oldSession = authQueries.createSession({
				id: testSessionId,
				user_id: testUserId,
				token_hash: hashToken('old-token-2'),
				expires_at: originalExpiry,
				created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days old
				last_active_at: new Date().toISOString()
			});

			const result = checkAndRotateSession(oldSession);

			expect(result.rotated).toBe(true);
			expect(result.newExpiresAt).toBe(originalExpiry);

			// Verify new session has same expiry
			const newSession = authQueries.getSessionByTokenHash(result.newTokenHash!);
			expect(newSession?.expires_at).toBe(originalExpiry);
		});
	});

	describe('forceRotateSession', () => {
		let testUserId: string;
		let testSessionId: string;

		beforeEach(() => {
			testUserId = `user-test-${crypto.randomUUID()}`;
			testSessionId = `session-test-${crypto.randomUUID()}`;

			authQueries.createUser({
				id: testUserId,
				name: 'Test User',
				color: '#ff0000',
				avatar: 'TU',
				role: 'member',
				personal_access_token_hash: hashToken('test-pat'),
				created_at: new Date().toISOString()
			});
		});

		afterEach(() => {
			try {
				authQueries.deleteSessionsByUserId(testUserId);
				authQueries.deleteUser(testUserId);
			} catch {
				// Best effort cleanup
			}
		});

		test('rotates session regardless of age', () => {
			const session = authQueries.createSession({
				id: testSessionId,
				user_id: testUserId,
				token_hash: hashToken('young-token'),
				expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
				created_at: new Date().toISOString(), // Brand new
				last_active_at: new Date().toISOString()
			});

			const result = forceRotateSession(session.id, testUserId, session.expires_at);

			expect(result.rotated).toBe(true);
			expect(result.newToken).toBeDefined();
			expect(result.newTokenHash).toBeDefined();

			// Old session should be gone
			const oldGone = authQueries.getSessionByTokenHash(hashToken('young-token'));
			expect(oldGone).toBeNull();

			// New session should exist
			const newExists = authQueries.getSessionByTokenHash(result.newTokenHash!);
			expect(newExists).not.toBeNull();
		});
	});
});
