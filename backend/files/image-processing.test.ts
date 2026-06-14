import { describe, expect, mock, test } from 'bun:test';

// Stub sharp before importing the module under test so no real image I/O
// happens during unit tests. mockPages is set per-test to control metadata.
let mockPages: number | undefined;

await mock.module('sharp', () => ({
	default: (_input: unknown, _opts?: unknown) => ({
		metadata: () =>
			Promise.resolve({
				width: 100,
				height: 100,
				format: 'gif',
				pages: mockPages,
			}),
	}),
}));

// Stub file-size-limit so the database is never touched.
await mock.module('./file-size-limit', () => ({
	validateFileSize: () => {},
}));

const { processImageEdit } = await import('./image-processing');

const RECIPE = { output: { format: 'gif' as const } };

describe('processImageEdit — animation frame limit', () => {
	test('rejects when frame count exceeds the 100-frame limit', async () => {
		mockPages = 101;
		await expect(processImageEdit('/dev/null', RECIPE)).rejects.toThrow(
			'Cannot process animated image: 101 frames exceeds the limit of 100'
		);
	});

	test('error message includes the actual and maximum frame counts', async () => {
		mockPages = 500;
		await expect(processImageEdit('/dev/null', RECIPE)).rejects.toThrow(
			'Cannot process animated image: 500 frames exceeds the limit of 100'
		);
	});

	test('allows animated images at exactly 100 frames', async () => {
		mockPages = 100;
		await expect(processImageEdit('/dev/null', RECIPE)).resolves.toBeDefined();
	});

	test('allows static images with no pages field', async () => {
		mockPages = undefined;
		await expect(processImageEdit('/dev/null', RECIPE)).resolves.toBeDefined();
	});
});
