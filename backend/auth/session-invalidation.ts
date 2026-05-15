/**
 * Session Invalidation
 *
 * Provides functions to invalidate user sessions when project access changes
 * or other security-relevant events occur.
 */

import { ws } from '$backend/utils/ws';
import { debug } from '$shared/utils/logger';

/**
 * Invalidate all active WebSocket sessions for a specific user.
 * This clears their in-memory auth state and triggers a force-logout
 * event so the frontend knows to disconnect and re-authenticate.
 *
 * @param userId - The user whose sessions should be invalidated
 * @returns The number of connections that were cleared
 */
export function invalidateUserSessions(userId: string): number {
	const connections = ws.getConnectionsForUser(userId);
	if (connections.length === 0) {
		debug.log('auth', `No active sessions to invalidate for user ${userId}`);
		return 0;
	}

	const cleared = ws.clearAuthForConnections(connections);
	debug.log('auth', `Invalidated ${cleared} session(s) for user ${userId}`);

	// Notify the specific user's connections to force logout
	ws.emit.global('auth:force-logout-user', { userId, reason: 'Project access revoked' });

	return cleared;
}

/**
 * Get the number of active WebSocket connections for a user.
 * Useful for logging and debugging.
 *
 * @param userId - The user to check
 * @returns Number of active connections
 */
export function getActiveSessionCountForUser(userId: string): number {
	return ws.getConnectionsForUser(userId).length;
}
