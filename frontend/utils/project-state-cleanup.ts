/**
 * Project State Cleanup Registry
 *
 * Centralized cleanup system for in-memory project state Maps
 * to prevent memory leaks when projects are removed.
 */

type CleanupFn = (projectId: string, projectPath?: string) => void;

const cleanupRegistry = new Set<CleanupFn>();

/**
 * Register a cleanup function to be called when a project is removed.
 * @param fn - Cleanup function receiving projectId and optional projectPath
 */
export function registerProjectCleanup(fn: CleanupFn): void {
	cleanupRegistry.add(fn);
}

/**
 * Execute all registered cleanup functions for a project.
 * Called when a project is removed from the workspace.
 *
 * @param projectId - ID of the project being removed
 * @param projectPath - Optional filesystem path of the project
 */
export function cleanupProjectState(projectId: string, projectPath?: string): void {
	for (const fn of cleanupRegistry) {
		try {
			fn(projectId, projectPath);
		} catch (error) {
			// Continue with other cleanups even if one fails
			console.error('Project cleanup failed:', error);
		}
	}
}
