/**
 * File Size Limit Validation
 *
 * Enforces maximum file size limits on write and upload operations
 * to prevent disk exhaustion attacks (DoS).
 *
 * Supports a global default limit and optional per-project overrides.
 */

import { settingsQueries, projectQueries } from '$backend/database/queries';
import { resolve } from 'node:path';

/** Default maximum file size: 50MB */
export const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** Absolute hard cap: 500MB — no project can exceed this regardless of settings */
export const ABSOLUTE_MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const SETTINGS_KEY_PREFIX = 'project:';
const SETTINGS_KEY_SUFFIX = ':fileSizeLimit';

function buildSettingsKey(projectId: string): string {
	return `${SETTINGS_KEY_PREFIX}${projectId}${SETTINGS_KEY_SUFFIX}`;
}

/**
 * Resolve a file path to its owning project ID.
 * Returns null if the path doesn't belong to any registered project.
 */
function resolveProjectIdFromPath(filePath: string): string | null {
	const resolved = resolve(filePath);
	const allProjects = projectQueries.getAll();

	for (const project of allProjects) {
		const projectRoot = resolve(project.path);
		if (resolved === projectRoot || resolved.startsWith(projectRoot + '/') || resolved.startsWith(projectRoot + '\\')) {
			return project.id;
		}
	}

	return null;
}

/**
 * Get the file size limit for a specific project.
 * Falls back to DEFAULT_MAX_FILE_SIZE if no project-specific limit is set.
 * @param projectId - The project ID to look up
 * @returns The max file size in bytes for this project
 */
export function getFileSizeLimitForProject(projectId: string): number {
	const key = buildSettingsKey(projectId);
	const setting = settingsQueries.get(key);
	if (!setting?.value) {
		return DEFAULT_MAX_FILE_SIZE;
	}

	const parsed = parseInt(setting.value, 10);
	if (isNaN(parsed) || parsed <= 0) {
		return DEFAULT_MAX_FILE_SIZE;
	}

	// Enforce absolute cap regardless of configured value
	return Math.min(parsed, ABSOLUTE_MAX_FILE_SIZE);
}

/**
 * Set the file size limit for a specific project.
 * @param projectId - The project ID
 * @param limitBytes - The max file size in bytes (0 to reset to default)
 */
export function setFileSizeLimitForProject(projectId: string, limitBytes: number): void {
	const key = buildSettingsKey(projectId);

	if (limitBytes <= 0 || limitBytes === DEFAULT_MAX_FILE_SIZE) {
		// Reset to default — remove the setting
		settingsQueries.delete(key);
		return;
	}

	// Enforce absolute cap
	const capped = Math.min(limitBytes, ABSOLUTE_MAX_FILE_SIZE);
	settingsQueries.set(key, String(capped));
}

/**
 * Validate that a file size is within the allowed limit.
 * @param size - File size in bytes
 * @param filePath - Optional file path to resolve project-specific limits
 * @throws Error if size is negative or exceeds the allowed limit
 */
export function validateFileSize(size: number, filePath?: string): void {
	if (size < 0) {
		throw new Error('Invalid file size: size cannot be negative');
	}

	const projectId = filePath ? resolveProjectIdFromPath(filePath) : null;
	const limit = projectId ? getFileSizeLimitForProject(projectId) : DEFAULT_MAX_FILE_SIZE;

	if (size > limit) {
		const maxMB = (limit / (1024 * 1024)).toFixed(0);
		throw new Error(`File size exceeds maximum allowed size of ${maxMB}MB`);
	}
}
