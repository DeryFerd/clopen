/**
 * File Size Limit Validation
 *
 * Enforces maximum file size limits on write and upload operations
 * to prevent disk exhaustion attacks (DoS).
 */

/** Default maximum file size: 50MB */
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Validate that a file size is within the allowed limit.
 * @param size - File size in bytes
 * @throws Error if size is negative or exceeds MAX_FILE_SIZE
 */
export function validateFileSize(size: number): void {
	if (size < 0) {
		throw new Error('Invalid file size: size cannot be negative');
	}
	if (size > MAX_FILE_SIZE) {
		const maxMB = MAX_FILE_SIZE / (1024 * 1024);
		throw new Error(`File size exceeds maximum allowed size of ${maxMB}MB`);
	}
}
