import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { invalidateUserSessions, getActiveSessionCountForUser } from './session-invalidation';

const mockGetConnectionsForUser = mock(() => [] as any[]);
const mockClearAuthForConnections = mock(() => 0);
const mockGetProjectChatSessions = mock(() => new Map());
const mockEmitUser = mock(() => {});

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

	test('kills only PTY sessions owned by the revoked user in the project', () => {
		mockGetConnectionsForUser.mockReturnValue(['conn1']);
		mockClearAuthForConnections.mockReturnValue(1);
		mockGetAllSessions.mockReturnValue([
			{ sessionId: 'alice-session', projectId: 'proj-1', userId: 'alice' },
			{ sessionId: 'bob-session', projectId: 'proj-1', userId: 'bob' },
			{ sessionId: 'bob-other', projectId: 'proj-2', userId: 'bob' }
		]);

		invalidateUserSessions('bob', 'proj-1');

		expect(mockKillSession).toHaveBeenCalledTimes(1);
		expect(mockKillSession).toHaveBeenCalledWith('bob-session', 'SIGKILL');
	});

	test('kills PTY sessions when user has no websocket connections but project access was revoked', () => {
		mockGetConnectionsForUser.mockReturnValue([]);
		mockGetAllSessions.mockReturnValue([
			{ sessionId: 'bob-session', projectId: 'proj-1', userId: 'bob' },
			{ sessionId: 'alice-session', projectId: 'proj-1', userId: 'alice' }
		]);

		const cleared = invalidateUserSessions('bob', 'proj-1');

		expect(cleared).toBe(0);
		expect(mockKillSession).toHaveBeenCalledTimes(1);
		expect(mockKillSession).toHaveBeenCalledWith('bob-session', 'SIGKILL');
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
