import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { invalidateUserSessions, getActiveSessionCountForUser } from './session-invalidation';

const mockGetConnectionsForUser = mock(() => [] as any[]);
const mockClearAuthForConnections = mock(() => 0);
const mockGetProjectChatSessions = mock(() => new Map());
const mockEmitUser = mock(() => {});
const mockGetProjectId = mock(() => undefined as string | undefined);

const mockKillSession = mock(() => {});
const mockGetAllSessions = mock(() => [] as Array<{
	sessionId: string;
	projectId?: string;
	userId: string;
}>);

mock.module('$backend/utils/ws', () => ({
	ws: {
		getConnectionsForUser: mockGetConnectionsForUser,
		clearAuthForConnections: mockClearAuthForConnections,
		getProjectChatSessions: mockGetProjectChatSessions,
		getProjectId: mockGetProjectId,
		emit: {
			user: mockEmitUser
		}
	}
}));

mock.module('$backend/terminal/pty-session-manager', () => ({
	ptySessionManager: {
		getAllSessions: mockGetAllSessions,
		killSession: mockKillSession
	}
}));

describe('invalidateUserSessions', () => {
	beforeEach(() => {
		mockGetConnectionsForUser.mockClear();
		mockClearAuthForConnections.mockClear();
		mockGetProjectChatSessions.mockClear();
		mockEmitUser.mockClear();
		mockKillSession.mockClear();
		mockGetAllSessions.mockClear();
		mockGetProjectId.mockClear();
		mockGetProjectId.mockReturnValue(undefined);
	});

	test('clears auth on all connections for a user', () => {
		mockGetConnectionsForUser.mockReturnValue(['conn1', 'conn2', 'conn3']);
		mockClearAuthForConnections.mockReturnValue(3);

		const cleared = invalidateUserSessions('user-123');

		expect(cleared).toBe(3);
		expect(mockGetConnectionsForUser).toHaveBeenCalledWith('user-123');
		expect(mockClearAuthForConnections).toHaveBeenCalledWith(['conn1', 'conn2', 'conn3']);
		expect(mockEmitUser).toHaveBeenCalledWith('user-123', 'auth:force-logout-user', { reason: 'Project access revoked' });
	});

	test('returns 0 when user has no active connections', () => {
		mockGetConnectionsForUser.mockReturnValue([]);
		mockClearAuthForConnections.mockReturnValue(0);

		const cleared = invalidateUserSessions('user-456');

		expect(cleared).toBe(0);
	});

	test('kills all PTY sessions in project when user loses access (no project context)', () => {
		mockGetConnectionsForUser.mockReturnValue(['conn1']);
		mockClearAuthForConnections.mockReturnValue(1);
		mockGetProjectId.mockReturnValue(undefined); // User has no active project context
		mockGetAllSessions.mockReturnValue([
			{ sessionId: 'bob-session', projectId: 'proj-1', userId: 'bob' },
			{ sessionId: 'alice-session', projectId: 'proj-1', userId: 'alice' }
		]);

		invalidateUserSessions('bob', 'proj-1');

		// Should kill ALL sessions in proj-1 since user has no active project context
		// (PTY sessions don't have userId, so we can't filter by owner)
		expect(mockKillSession).toHaveBeenCalledTimes(2);
		expect(mockKillSession).toHaveBeenCalledWith('bob-session', 'SIGKILL');
		expect(mockKillSession).toHaveBeenCalledWith('alice-session', 'SIGKILL');
	});

	test('kills all PTY sessions for project when user has no websocket connections', () => {
		mockGetConnectionsForUser.mockReturnValue([]);
		mockGetAllSessions.mockReturnValue([
			{ sessionId: 'bob-session', projectId: 'proj-1', userId: 'bob' },
			{ sessionId: 'alice-session', projectId: 'proj-1', userId: 'alice' }
		]);

		const cleared = invalidateUserSessions('bob', 'proj-1');

		expect(cleared).toBe(0);
		// Should kill all sessions in proj-1 since user has no connections (no project context)
		expect(mockKillSession).toHaveBeenCalledTimes(2);
	});
});

describe('getActiveSessionCountForUser', () => {
	beforeEach(() => {
		mockGetConnectionsForUser.mockClear();
	});

	test('returns count of active connections for user', () => {
		mockGetConnectionsForUser.mockReturnValue(['conn1', 'conn2']);

		const count = getActiveSessionCountForUser('user-789');

		expect(count).toBe(2);
		expect(mockGetConnectionsForUser).toHaveBeenCalledWith('user-789');
	});

	test('returns 0 when user has no connections', () => {
		mockGetConnectionsForUser.mockReturnValue([]);

		const count = getActiveSessionCountForUser('user-none');

		expect(count).toBe(0);
	});
});
