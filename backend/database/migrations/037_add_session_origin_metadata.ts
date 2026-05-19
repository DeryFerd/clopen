/**
 * Migration 037: Add origin metadata columns to auth_sessions
 */

import type { DatabaseConnection } from '$shared/types/database/connection';

export const description = 'Add ip_address and user_agent columns to auth_sessions';

export function up(db: DatabaseConnection): void {
	db.exec(`
		ALTER TABLE auth_sessions ADD COLUMN ip_address TEXT;
		ALTER TABLE auth_sessions ADD COLUMN user_agent TEXT;
		CREATE INDEX IF NOT EXISTS idx_auth_sessions_ip_address ON auth_sessions(ip_address);
	`);
}

export function down(db: DatabaseConnection): void {
	// SQLite does not support DROP COLUMN on all versions; use a safe no-op
	// for down migration since these columns are non-critical metadata.
}
