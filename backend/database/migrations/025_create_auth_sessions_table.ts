import type { DatabaseConnection } from '$shared/types/database/connection';
import { debug } from '$shared/utils/logger';

export const description = 'Create auth_sessions table for login session management';

export const up = (db: DatabaseConnection): void => {
	debug.log('migration', 'Creating auth_sessions table...');

	db.exec(`
		CREATE TABLE IF NOT EXISTS auth_sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			last_active_at TEXT NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)
	`);

	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
		ON auth_sessions(token_hash)
	`);

	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
		ON auth_sessions(user_id)
	`);

	debug.log('migration', 'auth_sessions table created');
};

export const down = (db: DatabaseConnection): void => {
	debug.log('migration', 'Dropping auth_sessions table...');
	db.exec('DROP TABLE IF EXISTS auth_sessions');
	debug.log('migration', 'auth_sessions table dropped');
};
