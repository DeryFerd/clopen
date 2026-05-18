import { describe, expect, test } from 'bun:test';
import { validateFileSize } from './file-size-limit';

describe('validateFileSize', () => {
	test('accepts files within the default size limit', () => {
		// Default limit is 50MB
		const withinLimit = 50 * 1024 * 1024; // 50MB
		expect(() => validateFileSize(withinLimit)).not.toThrow();
	});

	test('rejects files exceeding the default size limit', () => {
		const overLimit = (50 * 1024 * 1024) + 1; // 50MB + 1 byte
		expect(() => validateFileSize(overLimit)).toThrow(/File size exceeds/);
	});

	test('accepts small files', () => {
		expect(() => validateFileSize(1024)).not.toThrow(); // 1KB
		expect(() => validateFileSize(0)).not.toThrow(); // 0 bytes
	});

	test('rejects very large files', () => {
		const huge = 500 * 1024 * 1024; // 500MB
		expect(() => validateFileSize(huge)).toThrow(/File size exceeds/);
	});

	test('rejects negative sizes', () => {
		expect(() => validateFileSize(-1)).toThrow(/Invalid file size/);
	});
});
