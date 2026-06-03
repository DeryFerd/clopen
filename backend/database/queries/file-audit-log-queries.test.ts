/**
 * Tests for file audit log queries
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

type FileAuditRow = {
	id: string;
	user_id: string;
	project_id: string | null;
	action: string;
	file_path: string;
	file_size: number | null;
	source_path: string | null;
	target_path: string | null;
	ip_address: string | null;
	user_agent: string | null;
	success: number;
	error_message: string | null;
	created_at: string;
};

let rows: FileAuditRow[] = [];
let nextId = 1;

const mockDb = {
	prepare(sql: string) {
		const normalized = sql.replace(/\s+/g, ' ').trim();

		if (normalized.includes('INSERT INTO file_audit_log')) {
			return {
				run: (
					id: string,
					userId: string,
					projectId: string | null,
					action: string,
					filePath: string,
					fileSize: number | null,
					sourcePath: string | null,
					targetPath: string | null,
					ipAddress: string | null,
					userAgent: string | null,
					success: number,
					errorMessage: string | null,
					createdAt: string
				) => {
					rows.push({
						id,
						user_id: userId,
						project_id: projectId,
						action,
						file_path: filePath,
						file_size: fileSize,
						source_path: sourcePath,
						target_path: targetPath,
						ip_address: ipAddress,
						user_agent: userAgent,
						success,
						error_message: errorMessage,
						created_at: createdAt || new Date(Date.UTC(2026, 4, 22, 0, 0, nextId++)).toISOString()
					});
				}
			};
		}

		if (normalized.includes('WHERE user_id = ?')) {
			return {
				all: (userId: string, limit: number) =>
					[...rows]
						.filter(row => row.user_id === userId)
						.sort((a, b) => b.created_at.localeCompare(a.created_at))
						.slice(0, limit)
			};
		}

		if (normalized.includes('WHERE project_id = ?')) {
			return {
				all: (projectId: string, limit: number) =>
					[...rows]
						.filter(row => row.project_id === projectId)
						.sort((a, b) => b.created_at.localeCompare(a.created_at))
						.slice(0, limit)
			};
		}

		if (normalized.includes('WHERE file_path = ?')) {
			return {
				all: (filePath: string, limit: number) =>
					[...rows]
						.filter(row => row.file_path === filePath)
						.sort((a, b) => b.created_at.localeCompare(a.created_at))
						.slice(0, limit)
			};
		}

		if (normalized.includes('WHERE action = ?')) {
			return {
				all: (action: string, limit: number) =>
					[...rows]
						.filter(row => row.action === action)
						.sort((a, b) => b.created_at.localeCompare(a.created_at))
						.slice(0, limit)
			};
		}

		if (normalized.includes('WHERE success = 0')) {
			return {
				all: (limit: number) =>
					[...rows]
						.filter(row => row.success === 0)
						.sort((a, b) => b.created_at.localeCompare(a.created_at))
						.slice(0, limit)
			};
		}

		if (normalized.includes('ORDER BY created_at DESC LIMIT ?')) {
			return {
				all: (limit: number) =>
					[...rows]
						.sort((a, b) => b.created_at.localeCompare(a.created_at))
						.slice(0, limit)
			};
		}

		if (normalized.includes('DELETE FROM file_audit_log WHERE created_at < ?')) {
			return {
				run: (cutoff: string) => {
					const before = rows.length;
					rows = rows.filter(row => row.created_at >= cutoff);
					return { changes: before - rows.length };
				}
			};
		}

		throw new Error(`Unexpected SQL in test: ${normalized}`);
	}
};

mock.module('../index', () => ({
	getDatabase: () => mockDb
}));

const { fileAuditLogQueries } = await import('./file-audit-log-queries');

describe('File Audit Log Queries', () => {
	const testUserId = 'test-user-123';
	const testProjectId = 'test-project-456';

	beforeEach(() => {
		rows = [];
		nextId = 1;
	});

	test('logs file upload operation', () => {
		const result = fileAuditLogQueries.logOperation({
			userId: testUserId,
			projectId: testProjectId,
			action: 'upload',
			filePath: '/test/file.txt',
			fileSize: 1024,
			ipAddress: '127.0.0.1',
			userAgent: 'test-agent',
			success: true
		});

		expect(result).toBe(true);

		const logs = fileAuditLogQueries.getByUser(testUserId, 10);
		expect(logs.length).toBeGreaterThan(0);
		
		const lastLog = logs[0];
		expect(lastLog.action).toBe('upload');
		expect(lastLog.file_path).toBe('/test/file.txt');
		expect(lastLog.file_size).toBe(1024);
		expect(lastLog.success).toBe(1);
	});

	test('logs failed file operation', () => {
		const result = fileAuditLogQueries.logOperation({
			userId: testUserId,
			action: 'delete',
			filePath: '/test/protected.txt',
			success: false,
			errorMessage: 'Permission denied'
		});

		expect(result).toBe(true);

		const failedLogs = fileAuditLogQueries.getFailedOperations(10);
		const lastFailed = failedLogs.find(log => log.file_path === '/test/protected.txt');
		
		expect(lastFailed).toBeDefined();
		expect(lastFailed?.success).toBe(0);
		expect(lastFailed?.error_message).toBe('Permission denied');
	});

	test('retrieves logs by project', () => {
		fileAuditLogQueries.logOperation({
			userId: testUserId,
			projectId: testProjectId,
			action: 'write',
			filePath: '/project/file1.txt'
		});

		fileAuditLogQueries.logOperation({
			userId: testUserId,
			projectId: testProjectId,
			action: 'write',
			filePath: '/project/file2.txt'
		});

		const projectLogs = fileAuditLogQueries.getByProject(testProjectId, 10);
		expect(projectLogs.length).toBeGreaterThanOrEqual(2);
		
		const projectPaths = projectLogs.map(log => log.file_path);
		expect(projectPaths).toContain('/project/file1.txt');
		expect(projectPaths).toContain('/project/file2.txt');
	});

	test('retrieves logs by file path', () => {
		const testPath = '/test/tracked-file.txt';
		
		fileAuditLogQueries.logOperation({
			userId: testUserId,
			action: 'write',
			filePath: testPath
		});

		fileAuditLogQueries.logOperation({
			userId: testUserId,
			action: 'read',
			filePath: testPath
		});

		const fileLogs = fileAuditLogQueries.getByFilePath(testPath, 10);
		expect(fileLogs.length).toBeGreaterThanOrEqual(2);
		expect(fileLogs.every(log => log.file_path === testPath)).toBe(true);
	});

	test('retrieves logs by action type', () => {
		fileAuditLogQueries.logOperation({
			userId: testUserId,
			action: 'zip',
			filePath: '/test/archive.zip',
			fileSize: 5000
		});

		const zipLogs = fileAuditLogQueries.getByAction('zip', 10);
		expect(zipLogs.length).toBeGreaterThan(0);
		expect(zipLogs.every(log => log.action === 'zip')).toBe(true);
	});

	test('logs move operation with source and target', () => {
		const result = fileAuditLogQueries.logOperation({
			userId: testUserId,
			action: 'move',
			filePath: '/old/path/file.txt',
			sourcePath: '/old/path/file.txt',
			targetPath: '/new/path/file.txt'
		});

		expect(result).toBe(true);

		const logs = fileAuditLogQueries.getByAction('move', 10);
		const moveLog = logs.find(log => log.target_path === '/new/path/file.txt');
		
		expect(moveLog).toBeDefined();
		expect(moveLog?.source_path).toBe('/old/path/file.txt');
		expect(moveLog?.target_path).toBe('/new/path/file.txt');
	});

	test('getRecent retrieves most recent logs across all users', () => {
		// Create logs for different users
		fileAuditLogQueries.logOperation({
			userId: 'user-1',
			action: 'upload',
			filePath: '/user1/file.txt'
		});

		fileAuditLogQueries.logOperation({
			userId: 'user-2',
			action: 'delete',
			filePath: '/user2/file.txt'
		});

		fileAuditLogQueries.logOperation({
			userId: 'user-3',
			action: 'write',
			filePath: '/user3/file.txt'
		});

		const recentLogs = fileAuditLogQueries.getRecent(10);
		
		expect(recentLogs.length).toBeGreaterThanOrEqual(3);
		// Should be sorted by created_at DESC
		for (let i = 0; i < recentLogs.length - 1; i++) {
			expect(recentLogs[i].created_at >= recentLogs[i + 1].created_at).toBe(true);
		}
	});

	test('getRecent respects limit parameter', () => {
		// Create 5 logs
		for (let i = 0; i < 5; i++) {
			fileAuditLogQueries.logOperation({
				userId: testUserId,
				action: 'write',
				filePath: `/test/file${i}.txt`
			});
		}

		const recentLogs = fileAuditLogQueries.getRecent(3);
		expect(recentLogs.length).toBe(3);
	});

	test('deleteOlderThan removes old entries', () => {
		const now = new Date();
		const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
		const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

		// Manually insert old and recent logs
		rows.push({
			id: 'old-1',
			user_id: testUserId,
			project_id: null,
			action: 'upload',
			file_path: '/old/file1.txt',
			file_size: 100,
			source_path: null,
			target_path: null,
			ip_address: null,
			user_agent: null,
			success: 1,
			error_message: null,
			created_at: old.toISOString()
		});

		rows.push({
			id: 'recent-1',
			user_id: testUserId,
			project_id: null,
			action: 'upload',
			file_path: '/recent/file1.txt',
			file_size: 200,
			source_path: null,
			target_path: null,
			ip_address: null,
			user_agent: null,
			success: 1,
			error_message: null,
			created_at: recent.toISOString()
		});

		const beforeCount = rows.length;
		const deletedCount = fileAuditLogQueries.deleteOlderThan(30);

		expect(deletedCount).toBeGreaterThan(0);
		expect(rows.length).toBeLessThan(beforeCount);
		
		// Recent log should still exist
		const recentLogs = fileAuditLogQueries.getRecent(10);
		expect(recentLogs.some(log => log.file_path === '/recent/file1.txt')).toBe(true);
		// Old log should be gone
		expect(recentLogs.some(log => log.file_path === '/old/file1.txt')).toBe(false);
	});

	test('deleteOlderThan returns 0 when no old entries', () => {
		// Create only recent logs
		fileAuditLogQueries.logOperation({
			userId: testUserId,
			action: 'upload',
			filePath: '/recent/file.txt'
		});

		const deletedCount = fileAuditLogQueries.deleteOlderThan(30);
		expect(deletedCount).toBe(0);
	});
});
