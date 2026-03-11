/**
 * Migration: Add session_changes column to message_snapshots
 * Purpose: Store session-scoped file changes (old/new hash per file)
 * instead of full project state. This enables:
 * - Session-scoped restore (only undo changes within the session)
 * - Cross-session conflict detection
 * - Dramatically reduced storage (only changed files stored)
 *
 * session_changes JSON format:
 * {
 *   "filepath": { "oldHash": "sha256...", "newHash": "sha256..." },
 *   ...
 * }
 */

import type { DatabaseConnection } from '$shared/types/database/connection';
import { debug } from '$shared/utils/logger';

export const description = 'Add session_changes for session-scoped snapshot deltas';

export const up = (db: DatabaseConnection): void => {
	debug.log('migration', 'Adding session_changes column to message_snapshots...');

	db.exec(`
		ALTER TABLE message_snapshots
		ADD COLUMN session_changes TEXT
	`);

	debug.log('migration', 'session_changes column added');
};

export const down = (db: DatabaseConnection): void => {
	debug.log('migration', 'Removing session_changes column...');
	debug.warn('migration', 'Rollback not implemented for session_changes (SQLite limitation)');
};
