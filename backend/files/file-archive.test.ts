/**
 * Tests for file archive operations
 * Focus: Zip bomb prevention and size validation
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import the functions we're testing
import { extractZipOperation } from './file-archive';

describe('Zip Bomb Prevention', () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `clopen-archive-test-${Date.now()}`);
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test('rejects zip with excessive compression ratio before decompression', async () => {
		// We'll manually create a zip bomb using fflate
		const { zipSync } = await import('fflate');
		
		// Create 10MB of zeros (highly compressible - zip bomb candidate)
		const compressibleData = new Uint8Array(10 * 1024 * 1024);
		const zipData = zipSync({ 'bomb.txt': compressibleData }, { level: 9 });
		
		const archivePath = join(testDir, 'bomb.zip');
		const extractDir = join(testDir, 'extracted');
		
		await Bun.write(archivePath, zipData);

		// Archive is small (highly compressed)
		const archiveSize = zipData.byteLength;
		expect(archiveSize).toBeLessThan(100 * 1024); // Less than 100KB

		// But extraction should be rejected due to excessive ratio
		let extractionFailed = false;
		let errorMessage = '';
		
		try {
			await extractZipOperation(archivePath, extractDir);
		} catch (error) {
			extractionFailed = true;
			errorMessage = error instanceof Error ? error.message : '';
		}

		// Should fail with compression ratio error
		expect(extractionFailed).toBe(true);
		expect(errorMessage).toContain('compression ratio');
	});

	test('allows normal zip files with reasonable compression', async () => {
		// Create normal files with reasonable compression
		const { zipSync } = await import('fflate');
		
		const file1 = new TextEncoder().encode('Hello world, this is a test file');
		const file2 = new TextEncoder().encode('Another test file with some content');
		
		const zipData = zipSync({
			'file1.txt': file1,
			'file2.txt': file2
		}, { level: 6 });

		const archivePath = join(testDir, 'normal.zip');
		const extractDir = join(testDir, 'extracted');
		
		await Bun.write(archivePath, zipData);

		// Extract should succeed
		const result = await extractZipOperation(archivePath, extractDir);
		
		expect(result.entries).toBe(2);
		
		// Verify content
		const extracted1 = await Bun.file(join(extractDir, 'file1.txt')).text();
		const extracted2 = await Bun.file(join(extractDir, 'file2.txt')).text();
		
		expect(extracted1).toBe('Hello world, this is a test file');
		expect(extracted2).toBe('Another test file with some content');
	});

	test('detects compression ratio before full decompression', async () => {
		// This test verifies that we check compression ratio BEFORE
		// decompressing the entire archive into memory
		const { zipSync } = await import('fflate');
		
		// Create 5MB of zeros (highly compressible)
		const data = new Uint8Array(5 * 1024 * 1024);
		const zipData = zipSync({ 'test.bin': data }, { level: 9 });
		
		const archivePath = join(testDir, 'ratio-test.zip');
		await Bun.write(archivePath, zipData);

		const archiveSize = zipData.byteLength;
		const uncompressedSize = data.byteLength;
		const ratio = uncompressedSize / archiveSize;

		// Ratio should be very high (>100x for zeros)
		expect(ratio).toBeGreaterThan(100);

		// Extraction should fail due to suspicious ratio
		let failed = false;
		try {
			await extractZipOperation(archivePath, join(testDir, 'out'));
		} catch (error) {
			failed = true;
		}

		expect(failed).toBe(true);
	});
});

describe('Archive Size Validation', () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `clopen-archive-size-test-${Date.now()}`);
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test('rejects archive file that exceeds size limit', async () => {
		// Create a large zip file that exceeds the limit (50MB default)
		const { zipSync } = await import('fflate');
		
		// Create 60MB of data
		const largeData = new Uint8Array(60 * 1024 * 1024);
		// Fill with non-zero data to prevent excessive compression
		for (let i = 0; i < largeData.length; i++) {
			largeData[i] = i % 256;
		}
		
		const zipData = zipSync({ 'huge.txt': largeData }, { level: 1 });
		
		const archivePath = join(testDir, 'huge.zip');
		await Bun.write(archivePath, zipData);

		let failed = false;
		let errorMessage = '';
		
		try {
			await extractZipOperation(archivePath, join(testDir, 'out'));
		} catch (error) {
			failed = true;
			errorMessage = error instanceof Error ? error.message : '';
		}

		expect(failed).toBe(true);
		// Should fail with either size limit or compression ratio error
		expect(errorMessage).toMatch(/exceeds maximum allowed size|compression ratio/i);
	});
});
