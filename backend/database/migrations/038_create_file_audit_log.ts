/**
 * Migration: Create file_audit_log table
 * 
 * Tracks all file operations (upload, delete, move, rename, zip, unzip)
 * for security auditing and debugging purposes.
 */

import type { DatabaseConnection } from '$shared/types/database/connection';

export const description = 'Create file_audit_log table';

export function up(db: DatabaseConnection): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS file_audit_log (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			project_id TEXT,
			action TEXT NOT NULL,
			file_path TEXT NOT NULL,
			file_size INTEGER,
			source_path TEXT,
			target_path TEXT,
			ip_address TEXT,
			user_agent TEXT,
			success INTEGER NOT NULL DEFAULT 1,
			error_message TEXT,
			created_at TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_file_audit_log_user_id ON file_audit_log(user_id);
		CREATE INDEX IF NOT EXISTS idx_file_audit_log_project_id ON file_audit_log(project_id);
		CREATE INDEX IF NOT EXISTS idx_file_audit_log_action ON file_audit_log(action);
		CREATE INDEX IF NOT EXISTS idx_file_audit_log_created_at ON file_audit_log(created_at);
	`);
}

export function down(db: DatabaseConnection): void {
	db.exec(`
		DROP INDEX IF EXISTS idx_file_audit_log_created_at;
		DROP INDEX IF EXISTS idx_file_audit_log_action;
		DROP INDEX IF EXISTS idx_file_audit_log_project_id;
		DROP INDEX IF EXISTS idx_file_audit_log_user_id;
		DROP TABLE IF EXISTS file_audit_log;
	`);
}
