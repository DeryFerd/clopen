/**
 * Session Invalidation
 *
 * Provides functions to invalidate user sessions when project access changes
 * or other security-relevant events occur.
 */

import { ws } from '$backend/utils/ws';
import { debug } from '$shared/utils/logger';
import { ptySessionManager } from '$backend/terminal/pty-session-manager';

/**
 * Invalidate all active WebSocket sessions for a specific user.
 * This clears their in-memory auth state and triggers a force-logout
 * event so the frontend knows to disconnect and re-authenticate.
 *
 * Also kills any PTY terminal sessions belonging to the specified
 * project to prevent orphaned processes from continuing to run
 * after access is revoked.
 *
 * @param userId - The user whose sessions should be invalidated
 * @param projectId - Optional project ID to scope PTY cleanup
 * @returns The number of connections that were cleared
 */
export function invalidateUserSessions(userId: string, projectId?: string): number {
	const connections = ws.getConnectionsForUser(userId);
	if (connections.length === 0) {
		debug.log('auth', `No active sessions to invalidate for user ${userId}`);
	} else {
		const cleared = ws.clearAuthForConnections(connections);
		debug.log('auth', `Invalidated ${cleared} session(s) for user ${userId}`);
	}

	// Notify only this user's active connections to force logout.
	ws.emit.user(userId, 'auth:force-logout-user', { reason: 'Project access revoked' });

	// Kill PTY sessions for the affected project to prevent orphaned
	// processes from running after access is revoked.
	if (projectId) {
		killUserPtySessionsForProject(userId, projectId);
	}

	return connections.length;
}

/**
 * Kill all PTY terminal sessions for a specific user and project.
 * Prevents orphaned shell processes from continuing to run after
 * project access is revoked.
 */
function killUserPtySessionsForProject(userId: string, projectId: string): void {
	const allSessions = ptySessionManager.getAllSessions();
	let killedCount = 0;

	for (const session of allSessions) {
		if (session.projectId === projectId) {
			// Check if any connection for this user has this project as
			// their current project context. If not, the user no longer
			// has active access to this project's terminal.
			const userConnections = ws.getConnectionsForUser(userId);
			const hasProjectContext = userConnections.some(
				(conn) => ws.getProjectId(conn) === projectId
			);

			if (!hasProjectContext) {
				debug.log('auth', `Killing PTY session ${session.sessionId} for user ${userId} (project ${projectId} access revoked)`);
				ptySessionManager.killSession(session.sessionId, 'SIGKILL');
				killedCount++;
			}
		}
	}

	if (killedCount > 0) {
		debug.log('auth', `Killed ${killedCount} PTY session(s) for user ${userId} in project ${projectId}`);
	}
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
