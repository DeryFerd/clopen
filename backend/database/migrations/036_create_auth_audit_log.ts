/**
 * Migration 036: Create auth_audit_log table
 */

import type { DatabaseConnection } from '$shared/types/database/connection';

export const description = 'Create auth audit log table';

export function up(db: DatabaseConnection): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS auth_audit_log (
			id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
			user_id TEXT NOT NULL,
			actor_user_id TEXT,
			event_type TEXT NOT NULL,
			event_details TEXT,
			ip_address TEXT,
			user_agent TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON auth_audit_log(user_id);
		CREATE INDEX IF NOT EXISTS idx_auth_audit_actor_user_id ON auth_audit_log(actor_user_id);
		CREATE INDEX IF NOT EXISTS idx_auth_audit_event_type ON auth_audit_log(event_type);
		CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth_audit_log(created_at);
	`);
}

export function down(db: DatabaseConnection): void {
	db.exec(`DROP TABLE IF EXISTS auth_audit_log;`);
}
