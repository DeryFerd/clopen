import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { invalidateUserSessions, getActiveSessionCountForUser } from './session-invalidation';

// Mock the ws module
const mockGetConnectionsForUser = mock(() => [] as any[]);
const mockClearAuthForConnections = mock(() => 0);
const mockEmitGlobal = mock(() => {});

mock.module('$backend/utils/ws', () => ({
	ws: {
		getConnectionsForUser: mockGetConnectionsForUser,
		clearAuthForConnections: mockClearAuthForConnections,
		emit: {
			global: mockEmitGlobal
		}
	}
}));

describe('invalidateUserSessions', () => {
	beforeEach(() => {
		mockGetConnectionsForUser.mockClear();
		mockClearAuthForConnections.mockClear();
		mockEmitGlobal.mockClear();
	});

	test('clears auth on all connections for a user', () => {
		mockGetConnectionsForUser.mockReturnValue(['conn1', 'conn2', 'conn3']);
		mockClearAuthForConnections.mockReturnValue(3);

		const cleared = invalidateUserSessions('user-123');

		expect(cleared).toBe(3);
		expect(mockGetConnectionsForUser).toHaveBeenCalledWith('user-123');
		expect(mockClearAuthForConnections).toHaveBeenCalledWith(['conn1', 'conn2', 'conn3']);
	});

	test('returns 0 when user has no active connections', () => {
		mockGetConnectionsForUser.mockReturnValue([]);
		mockClearAuthForConnections.mockReturnValue(0);

		const cleared = invalidateUserSessions('user-456');

		expect(cleared).toBe(0);
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
