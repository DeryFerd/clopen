import type { DatabaseConnection } from '$shared/types/database/connection';
import { debug } from '$shared/utils/logger';

export const description = 'Create users table for authentication';

export const up = (db: DatabaseConnection): void => {
	debug.log('migration', 'Creating users table...');

	db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			avatar TEXT NOT NULL,
			role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
			personal_access_token_hash TEXT UNIQUE,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`);

	debug.log('migration', 'users table created');
};

export const down = (db: DatabaseConnection): void => {
	debug.log('migration', 'Dropping users table...');
	db.exec('DROP TABLE IF EXISTS users');
	debug.log('migration', 'users table dropped');
};
