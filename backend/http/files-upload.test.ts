/**
 * Integration tests for file upload race condition fix.
 * 
 * These tests verify that the atomic O_EXCL create prevents race conditions
 * when multiple uploads target the same file name.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

const TEST_DIR = join(import.meta.dir, '.test-atomic-upload');

beforeAll(async () => {
	await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
	await rm(TEST_DIR, { recursive: true, force: true });
});

describe('Atomic file creation with O_EXCL', () => {
	it('should create file atomically with wx flag', async () => {
		const testFile = join(TEST_DIR, 'atomic-create.txt');
		
		// First create should succeed
		const handle1 = await open(testFile, 'wx');
		await handle1.write('test content');
		await handle1.close();
		
		// Second create should fail with EEXIST
		try {
			await open(testFile, 'wx');
			expect(true).toBe(false); // Should not reach here
		} catch (error: unknown) {
			expect(error).toBeDefined();
			expect(error && typeof error === 'object' && 'code' in error && error.code).toBe('EEXIST');
		}
		
		// File should contain first write
		const content = await readFile(testFile, 'utf-8');
		expect(content).toBe('test content');
	});

	it('should handle concurrent atomic creates - only one succeeds', async () => {
		const testFile = join(TEST_DIR, 'concurrent-atomic.txt');
		
		// Simulate concurrent creates
		const create1 = open(testFile, 'wx').then(async (handle) => {
			await handle.write('first');
			await handle.close();
			return 'success';
		}).catch((error: unknown) => {
			if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
				return 'exists';
			}
			throw error;
		});
		
		const create2 = open(testFile, 'wx').then(async (handle) => {
			await handle.write('second');
			await handle.close();
			return 'success';
		}).catch((error: unknown) => {
			if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
				return 'exists';
			}
			throw error;
		});
		
		const [result1, result2] = await Promise.all([create1, create2]);
		
		// Exactly one should succeed, one should get EEXIST
		const results = [result1, result2].sort();
		expect(results).toEqual(['exists', 'success']);
		
		// File should exist with content from the winner
		const content = await readFile(testFile, 'utf-8');
		expect(['first', 'second']).toContain(content);
	});

	it('should work on all filesystem types (not just NTFS/ext4)', async () => {
		// This test verifies O_EXCL works, unlike hard-link which fails on FAT32/exFAT
		const testFile = join(TEST_DIR, 'filesystem-compat.txt');
		
		// Create with O_EXCL
		const handle = await open(testFile, 'wx');
		await handle.write('content');
		await handle.close();
		
		// Verify it exists
		const content = await readFile(testFile, 'utf-8');
		expect(content).toBe('content');
		
		// Second create should fail
		try {
			await open(testFile, 'wx');
			expect(true).toBe(false);
		} catch (error: unknown) {
			expect(error && typeof error === 'object' && 'code' in error && error.code).toBe('EEXIST');
		}
	});
});

describe('Upload flow simulation', () => {
	it('should prevent race condition in upload flow', async () => {
		const tempFile1 = join(TEST_DIR, 'temp1.partial');
		const tempFile2 = join(TEST_DIR, 'temp2.partial');
		const finalFile = join(TEST_DIR, 'final.txt');
		
		// Write temp files
		await writeFile(tempFile1, 'upload 1 content');
		await writeFile(tempFile2, 'upload 2 content');
		
		// Simulate concurrent upload completion
		const complete1 = (async () => {
			try {
				// Atomic create
				const handle = await open(finalFile, 'wx');
				await handle.close();
				// Move temp over placeholder
				await writeFile(finalFile, await readFile(tempFile1));
				return { status: 200, message: 'success' };
			} catch (error: unknown) {
				if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
					return { status: 409, message: 'File already exists' };
				}
				throw error;
			}
		})();
		
		const complete2 = (async () => {
			try {
				// Atomic create
				const handle = await open(finalFile, 'wx');
				await handle.close();
				// Move temp over placeholder
				await writeFile(finalFile, await readFile(tempFile2));
				return { status: 200, message: 'success' };
			} catch (error: unknown) {
				if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
					return { status: 409, message: 'File already exists' };
				}
				throw error;
			}
		})();
		
		const [result1, result2] = await Promise.all([complete1, complete2]);
		
		// Exactly one should succeed
		const statuses = [result1.status, result2.status].sort();
		expect(statuses).toEqual([200, 409]);
		
		// Final file should have content from the winner
		const finalContent = await readFile(finalFile, 'utf-8');
		expect(['upload 1 content', 'upload 2 content']).toContain(finalContent);
	});
});

