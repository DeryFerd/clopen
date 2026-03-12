/**
 * Update Status Store
 * Tracks npm package update availability and auto-update state
 */

import ws from '$frontend/utils/ws';
import { systemSettings } from '$frontend/stores/features/settings.svelte';
import { debug } from '$shared/utils/logger';

interface UpdateState {
	currentVersion: string;
	latestVersion: string;
	updateAvailable: boolean;
	checking: boolean;
	updating: boolean;
	dismissed: boolean;
	error: string | null;
	errorType: 'check' | 'update' | null;
	updateOutput: string | null;
	updateSuccess: boolean;
}

export const updateState = $state<UpdateState>({
	currentVersion: '',
	latestVersion: '',
	updateAvailable: false,
	checking: false,
	updating: false,
	dismissed: false,
	error: null,
	errorType: null,
	updateOutput: null,
	updateSuccess: false
});

let checkInterval: ReturnType<typeof setInterval> | null = null;

/** Check for updates from npm registry */
export async function checkForUpdate(): Promise<void> {
	if (updateState.checking || updateState.updating) return;

	updateState.checking = true;
	updateState.error = null;
	updateState.errorType = null;

	try {
		const result = await ws.http('system:check-update', {});
		updateState.currentVersion = result.currentVersion;
		updateState.latestVersion = result.latestVersion;
		updateState.updateAvailable = result.updateAvailable;

		// Auto-update if enabled and update is available
		if (result.updateAvailable && systemSettings.autoUpdate) {
			debug.log('server', 'Auto-update enabled, starting update...');
			await runUpdate();
		}
	} catch (err) {
		updateState.error = err instanceof Error ? err.message : 'Failed to check for updates';
		updateState.errorType = 'check';
		debug.error('server', 'Update check failed:', err);
	} finally {
		updateState.checking = false;
	}
}

/** Run the package update */
export async function runUpdate(): Promise<void> {
	if (updateState.updating) return;

	updateState.updating = true;
	updateState.error = null;
	updateState.errorType = null;
	updateState.updateOutput = null;

	try {
		const result = await ws.http('system:run-update', {});
		updateState.updateOutput = result.output;
		updateState.updateSuccess = true;
		updateState.updateAvailable = false;
		updateState.latestVersion = result.newVersion;

		debug.log('server', 'Update completed successfully');
	} catch (err) {
		updateState.error = err instanceof Error ? err.message : 'Update failed';
		updateState.errorType = 'update';
		debug.error('server', 'Update failed:', err);
	} finally {
		updateState.updating = false;
	}
}

/** Dismiss the update banner */
export function dismissUpdate(): void {
	updateState.dismissed = true;
}

/** Start periodic update checks (every 30 minutes) */
export function startUpdateChecker(): void {
	// Initial check after 5 seconds (let the app settle)
	setTimeout(() => {
		checkForUpdate();
	}, 5000);

	// Periodic check every 30 minutes
	if (checkInterval) clearInterval(checkInterval);
	checkInterval = setInterval(() => {
		updateState.dismissed = false; // Reset dismissal on new checks
		checkForUpdate();
	}, 30 * 60 * 1000);
}

/** Stop periodic update checks */
export function stopUpdateChecker(): void {
	if (checkInterval) {
		clearInterval(checkInterval);
		checkInterval = null;
	}
}
