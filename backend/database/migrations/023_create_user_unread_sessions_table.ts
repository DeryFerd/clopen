import type { DatabaseConnection } from '$shared/types/database/connection';
import { debug } from '$shared/utils/logger';

export const description = 'Create user_unread_sessions table for persisting per-user unread session state';

export const up = (db: DatabaseConnection): void => {
	debug.log('migration', 'Creating user_unread_sessions table...');

	db.exec(`
		CREATE TABLE IF NOT EXISTS user_unread_sessions (
			user_id TEXT NOT NULL,
			session_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			marked_at TEXT NOT NULL,
			PRIMARY KEY (user_id, session_id),
			FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
		)
	`);

	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_user_unread_sessions_user_project
		ON user_unread_sessions(user_id, project_id)
	`);

	debug.log('migration', 'user_unread_sessions table created');
};

export const down = (db: DatabaseConnection): void => {
	debug.log('migration', 'Dropping user_unread_sessions table...');
	db.exec('DROP TABLE IF EXISTS user_unread_sessions');
	debug.log('migration', 'user_unread_sessions table dropped');
};
