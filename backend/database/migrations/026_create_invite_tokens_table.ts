import type { DatabaseConnection } from '$shared/types/database/connection';
import { debug } from '$shared/utils/logger';

export const description = 'Create invite_tokens table for invite link management';

export const up = (db: DatabaseConnection): void => {
	debug.log('migration', 'Creating invite_tokens table...');

	db.exec(`
		CREATE TABLE IF NOT EXISTS invite_tokens (
			id TEXT PRIMARY KEY,
			token_hash TEXT NOT NULL UNIQUE,
			role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
			label TEXT,
			created_by TEXT NOT NULL,
			max_uses INTEGER NOT NULL DEFAULT 1,
			use_count INTEGER NOT NULL DEFAULT 0,
			expires_at TEXT,
			created_at TEXT NOT NULL,
			FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
		)
	`);

	debug.log('migration', 'invite_tokens table created');
};

export const down = (db: DatabaseConnection): void => {
	debug.log('migration', 'Dropping invite_tokens table...');
	db.exec('DROP TABLE IF EXISTS invite_tokens');
	debug.log('migration', 'invite_tokens table dropped');
};
