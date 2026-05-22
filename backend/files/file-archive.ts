import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { zipSync, unzipSync } from 'fflate';

import { debug } from '$shared/utils/logger';
import { getMaxFileSize, validateFileSize } from './file-size-limit';

interface ZipTree {
	[path: string]: Uint8Array | ZipTree;
}

function setInTree(tree: ZipTree, parts: string[], value: Uint8Array | ZipTree): void {
	if (parts.length === 0) return;
	if (parts.length === 1) {
		tree[parts[0]] = value;
		return;
	}
	const head = parts[0];
	const existing = tree[head];
	const child: ZipTree = existing && !(existing instanceof Uint8Array)
		? (existing as ZipTree)
		: {};
	tree[head] = child;
	setInTree(child, parts.slice(1), value);
}

async function readPathIntoTree(sourcePath: string, rootName: string, tree: ZipTree): Promise<void> {
	const stats = await stat(sourcePath);
	if (stats.isFile()) {
		const data = new Uint8Array(await Bun.file(sourcePath).arrayBuffer());
		setInTree(tree, rootName.split('/'), data);
		return;
	}
	if (stats.isDirectory()) {
		const entries = await readdir(sourcePath);
		if (entries.length === 0) {
			setInTree(tree, rootName.split('/'), {} as ZipTree);
			return;
		}
		for (const entry of entries) {
			await readPathIntoTree(
				join(sourcePath, entry),
				`${rootName}/${entry}`,
				tree
			);
		}
	}
}

export async function createZipOperation(sourcePaths: string[], targetZipPath: string): Promise<{ message: string; path: string; size: number; modified: string }> {
	if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
		throw new Error('At least one source path is required');
	}
	if (!targetZipPath) {
		throw new Error('Target zip path is required');
	}

	try {
		const targetFile = Bun.file(targetZipPath);
		if (await targetFile.exists()) {
			throw new Error('Target archive already exists');
		}

		const tree: ZipTree = {};

		for (const source of sourcePaths) {
			const name = basename(source);
			if (!name || name === '.' || name === '..') {
				throw new Error(`Invalid source path: ${source}`);
			}
			await readPathIntoTree(source, name, tree);
		}

		const zipped = zipSync(tree as Record<string, Uint8Array>, { level: 6 });
		validateFileSize(zipped.byteLength);
		await Bun.write(targetZipPath, zipped);
		const stats = await stat(targetZipPath);

		return {
			message: 'Archive created successfully',
			path: targetZipPath,
			size: stats.size,
			modified: stats.mtime.toISOString()
		};
	} catch (error) {
		debug.error('file', 'Create zip error:', error);
		if (error instanceof Error) {
			if (error.message.includes('EPERM')) {
				throw new Error('Permission denied while creating archive');
			}
			if (error.message.includes('ENOSPC')) {
				throw new Error('Not enough space on disk');
			}
			throw error;
		}
		throw new Error('Failed to create archive');
	}
}

function isSafeEntryPath(entryPath: string, targetRoot: string): boolean {
	if (!entryPath) return false;
	if (isAbsolute(entryPath)) return false;
	const normalized = entryPath.replace(/\\/g, '/');
	if (normalized.split('/').some((segment) => segment === '..')) return false;
	const full = join(targetRoot, normalized);
	const rel = relative(targetRoot, full);
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export async function extractZipOperation(archivePath: string, targetDir: string): Promise<{ message: string; path: string; entries: number; modified: string }> {
	if (!archivePath) {
		throw new Error('Archive path is required');
	}
	if (!targetDir) {
		throw new Error('Target directory is required');
	}

	const archiveFile = Bun.file(archivePath);
	if (!(await archiveFile.exists())) {
		throw new Error('Archive does not exist');
	}

	const limit = getMaxFileSize();
	const limitMB = Math.floor(limit / (1024 * 1024));
	const stats = await stat(archivePath);
	if (stats.size > limit) {
		throw new Error(`Archive exceeds maximum allowed size of ${limitMB}MB`);
	}

	try {
		const targetExists = await Bun.file(targetDir).exists();
		if (targetExists) {
			const targetStats = await stat(targetDir);
			if (!targetStats.isDirectory()) {
				throw new Error('Target path exists and is not a directory');
			}
		} else {
			await mkdir(targetDir, { recursive: true });
		}

		const data = new Uint8Array(await archiveFile.arrayBuffer());
		
		// SECURITY: Check compression ratio BEFORE full decompression to prevent zip bomb DoS.
		// Parse zip central directory to calculate uncompressed size without decompressing.
		const uncompressedSize = calculateUncompressedSize(data);
		const compressedSize = stats.size;
		const compressionRatio = uncompressedSize / compressedSize;
		
		// Reject suspicious compression ratios (>100x indicates potential zip bomb)
		const MAX_COMPRESSION_RATIO = 100;
		if (compressionRatio > MAX_COMPRESSION_RATIO) {
			throw new Error(
				`Suspicious compression ratio (${Math.floor(compressionRatio)}x). ` +
				`Archive may be a zip bomb. Maximum allowed ratio is ${MAX_COMPRESSION_RATIO}x.`
			);
		}
		
		// Also check if uncompressed size exceeds limit
		if (uncompressedSize > limit) {
			throw new Error(`Extracted content would exceed maximum allowed size of ${limitMB}MB`);
		}

		const unzipped = unzipSync(data);

		let totalBytes = 0;
		for (const buf of Object.values(unzipped)) {
			totalBytes += buf.byteLength;
		}
		
		// Final safety check after decompression (should already be caught above)
		if (totalBytes > limit) {
			throw new Error(`Extracted content exceeds maximum allowed size of ${limitMB}MB`);
		}

		let entryCount = 0;
		for (const [entryPath, content] of Object.entries(unzipped)) {
			if (!isSafeEntryPath(entryPath, targetDir)) {
				throw new Error(`Unsafe path in archive: ${entryPath}`);
			}
			const normalized = entryPath.replace(/\\/g, '/');
			const isDirEntry = normalized.endsWith('/');
			const fullPath = join(targetDir, normalized.split('/').join(sep));

			if (isDirEntry) {
				await mkdir(fullPath, { recursive: true });
				continue;
			}
			await mkdir(dirname(fullPath), { recursive: true });
			await writeFile(fullPath, content);
			entryCount++;
		}

		const targetStats = await stat(targetDir);
		return {
			message: 'Archive extracted successfully',
			path: targetDir,
			entries: entryCount,
			modified: targetStats.mtime.toISOString()
		};
	} catch (error) {
		debug.error('file', 'Extract zip error:', error);
		if (error instanceof Error) {
			if (error.message.includes('EPERM')) {
				throw new Error('Permission denied while extracting archive');
			}
			if (error.message.includes('ENOSPC')) {
				throw new Error('Not enough space on disk');
			}
			throw error;
		}
		throw new Error('Failed to extract archive');
	}
}

/**
 * Calculate total uncompressed size from zip central directory without decompressing.
 * This prevents zip bomb DoS by checking size before memory allocation.
 * 
 * ZIP file structure:
 * - Local file headers + compressed data
 * - Central directory (contains uncompressed sizes)
 * - End of central directory record
 */
function calculateUncompressedSize(zipData: Uint8Array): number {
	// Find End of Central Directory Record (EOCD)
	// Signature: 0x06054b50 (little-endian: 50 4b 05 06)
	const eocdSignature = 0x06054b50;
	let eocdOffset = -1;
	
	// Search from end (EOCD is at the end, but may have comment after it)
	for (let i = zipData.length - 22; i >= 0; i--) {
		const sig = zipData[i] | (zipData[i + 1] << 8) | (zipData[i + 2] << 16) | (zipData[i + 3] << 24);
		if (sig === eocdSignature) {
			eocdOffset = i;
			break;
		}
	}
	
	if (eocdOffset === -1) {
		throw new Error('Invalid ZIP file: End of Central Directory not found');
	}
	
	// Read central directory offset and size from EOCD
	const cdSize = zipData[eocdOffset + 12] | (zipData[eocdOffset + 13] << 8) | 
	               (zipData[eocdOffset + 14] << 16) | (zipData[eocdOffset + 15] << 24);
	const cdOffset = zipData[eocdOffset + 16] | (zipData[eocdOffset + 17] << 8) | 
	                 (zipData[eocdOffset + 18] << 16) | (zipData[eocdOffset + 19] << 24);
	
	// Parse central directory to sum uncompressed sizes
	let totalUncompressedSize = 0;
	let offset = cdOffset;
	const cdEnd = cdOffset + cdSize;
	const centralFileHeaderSignature = 0x02014b50;
	
	while (offset < cdEnd) {
		const sig = zipData[offset] | (zipData[offset + 1] << 8) | 
		            (zipData[offset + 2] << 16) | (zipData[offset + 3] << 24);
		
		if (sig !== centralFileHeaderSignature) {
			break;
		}
		
		// Read uncompressed size (offset 24-27 in central directory file header)
		const uncompressedSize = zipData[offset + 24] | (zipData[offset + 25] << 8) | 
		                         (zipData[offset + 26] << 16) | (zipData[offset + 27] << 24);
		totalUncompressedSize += uncompressedSize;
		
		// Read filename length and extra field length to skip to next entry
		const filenameLen = zipData[offset + 28] | (zipData[offset + 29] << 8);
		const extraLen = zipData[offset + 30] | (zipData[offset + 31] << 8);
		const commentLen = zipData[offset + 32] | (zipData[offset + 33] << 8);
		
		// Central directory file header is 46 bytes + variable fields
		offset += 46 + filenameLen + extraLen + commentLen;
	}
	
	return totalUncompressedSize;
}

