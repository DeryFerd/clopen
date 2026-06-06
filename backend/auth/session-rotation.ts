/**
 * Session Token Rotation
 *
 * Rotates session tokens periodically to limit the window of opportunity
 * for token theft. When a session is rotated, the old token is invalidated
 * and a new one is issued.
 *
 * Rotation triggers:
 * - After a configurable period of time (default: 7 days)
 * - Configurable via CLOPEN_SESSION_ROTATION_DAYS environment variable
 * - Set to 0 to disable automatic rotation
 */

import { authQueries, type DBAuthSession } from '../database/queries/auth-queries';
import { generateSessionToken, hashToken } from './tokens';
import { debug } from '$shared/utils/logger';

/**
 * Default rotation interval in days.
 * Sessions older than this will be rotated on next use.
 */
const DEFAULT_ROTATION_DAYS = 7;

/**
 * Get the rotation interval from environment or use default.
 * Set CLOPEN_SESSION_ROTATION_DAYS=0 to disable automatic rotation.
 */
function getRotationDays(): number {
	const env = process.env.CLOPEN_SESSION_ROTATION_DAYS;
	if (env !== undefined) {
		const parsed = parseInt(env, 10);
		if (!Number.isNaN(parsed) && parsed >= 0) {
			return parsed;
		}
	}
	return DEFAULT_ROTATION_DAYS;
}

/**
 * Check if a session should be rotated based on its age.
 */
export function shouldRotateSession(session: { created_at: string }): boolean {
	const rotationDays = getRotationDays();
	if (rotationDays === 0) {
		return false; // Rotation disabled
	}

	const createdAt = new Date(session.created_at).getTime();
	const rotationMs = rotationDays * 24 * 60 * 60 * 1000;
	return Date.now() - createdAt > rotationMs;
}

/**
 * Result of a session rotation attempt.
 */
export interface RotationResult {
	rotated: boolean;
	newToken?: string;
	newExpiresAt?: string;
	newTokenHash?: string;
}

/**
 * Check and rotate a session if it's due.
 *
 * Creates a new session with a fresh token, copies the expiry from the old
 * session, and deletes the old session. Returns the new token details.
 *
 * Called during session validation (loginWithToken).
 */
export function checkAndRotateSession(session: DBAuthSession): RotationResult {
	if (!shouldRotateSession(session)) {
		return { rotated: false };
	}

	// Rotation disabled check
	if (getRotationDays() === 0) {
		return { rotated: false };
	}

	// Generate new token
	const newToken = generateSessionToken();
	const newTokenHash = hashToken(newToken);
	const now = new Date().toISOString();
	const newSessionId = `session-${crypto.randomUUID()}`;

	// Create new session (preserves expiry)
	authQueries.createSession({
		id: newSessionId,
		user_id: session.user_id,
		token_hash: newTokenHash,
		expires_at: session.expires_at,
		created_at: now,
		last_active_at: now
	});

	// Delete old session
	authQueries.deleteSession(session.id);

	const ageDays = Math.round((Date.now() - new Date(session.created_at).getTime()) / (24 * 60 * 60 * 1000));
	debug.log('auth', `Session rotated: ${session.id.slice(0, 16)}... -> ${newSessionId.slice(0, 16)}... (age: ${ageDays} days)`);

	return {
		rotated: true,
		newToken,
		newExpiresAt: session.expires_at,
		newTokenHash
	};
}

/**
 * Force rotate a session (e.g., after sensitive operation).
 * Returns the new token or null if rotation failed.
 */
export function forceRotateSession(sessionId: string, userId: string, expiresAt: string): RotationResult {
	// Generate new token
	const newToken = generateSessionToken();
	const newTokenHash = hashToken(newToken);
	const now = new Date().toISOString();
	const newSessionId = `session-${crypto.randomUUID()}`;

	// Create new session
	authQueries.createSession({
		id: newSessionId,
		user_id: userId,
		token_hash: newTokenHash,
		expires_at: expiresAt,
		created_at: now,
		last_active_at: now
	});

	// Delete old session
	authQueries.deleteSession(sessionId);

	debug.log('auth', `Session force-rotated: ${sessionId.slice(0, 16)}... -> ${newSessionId.slice(0, 16)}...`);

	return {
		rotated: true,
		newToken,
		newExpiresAt: expiresAt,
		newTokenHash
	};
}
