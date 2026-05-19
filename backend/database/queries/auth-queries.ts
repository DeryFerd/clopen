import { getDatabase } from '../index';

export interface DBUser {
	id: string;
	name: string;
	color: string;
	avatar: string;
	role: 'admin' | 'member';
	personal_access_token_hash: string | null;
	created_at: string;
	updated_at: string;
}

export interface DBAuthSession {
	id: string;
	user_id: string;
	token_hash: string;
	expires_at: string;
	created_at: string;
	last_active_at: string;
	ip_address: string | null;
	user_agent: string | null;
}

export interface DBInviteToken {
	id: string;
	token_hash: string;
	role: 'admin' | 'member';
	label: string | null;
	created_by: string;
	max_uses: number;
	use_count: number;
	expires_at: string | null;
	created_at: string;
}

export const authQueries = {
	// ===================== Users =====================

	createUser(user: Omit<DBUser, 'updated_at'> & { updated_at?: string }): DBUser {
		const db = getDatabase();
		const now = new Date().toISOString();
		db.prepare(`
			INSERT INTO users (id, name, color, avatar, role, personal_access_token_hash, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			user.id,
			user.name,
			user.color,
			user.avatar,
			user.role,
			user.personal_access_token_hash,
			user.created_at,
			user.updated_at ?? now
		);
		return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DBUser;
	},

	getUserById(id: string): DBUser | null {
		const db = getDatabase();
		return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DBUser | null;
	},

	getUserByPatHash(hash: string): DBUser | null {
		const db = getDatabase();
		return db.prepare('SELECT * FROM users WHERE personal_access_token_hash = ?').get(hash) as DBUser | null;
	},

	getAllUsers(): DBUser[] {
		const db = getDatabase();
		return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as DBUser[];
	},

	countUsers(): number {
		const db = getDatabase();
		const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
		return result.count;
	},

	countAdmins(): number {
		const db = getDatabase();
		const result = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
		return result.count;
	},

	updateUser(id: string, fields: Partial<Pick<DBUser, 'name' | 'color' | 'avatar' | 'personal_access_token_hash'>>): void {
		const db = getDatabase();
		const now = new Date().toISOString();
		const sets: string[] = ['updated_at = ?'];
		const values: any[] = [now];

		if (fields.name !== undefined) { sets.push('name = ?'); values.push(fields.name); }
		if (fields.color !== undefined) { sets.push('color = ?'); values.push(fields.color); }
		if (fields.avatar !== undefined) { sets.push('avatar = ?'); values.push(fields.avatar); }
		if (fields.personal_access_token_hash !== undefined) { sets.push('personal_access_token_hash = ?'); values.push(fields.personal_access_token_hash); }

		values.push(id);
		db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
	},

	deleteUser(id: string): void {
		const db = getDatabase();
		db.prepare('DELETE FROM users WHERE id = ?').run(id);
	},

	// ===================== Auth Sessions =====================

	createSession(session: DBAuthSession): DBAuthSession {
		const db = getDatabase();
		db.prepare(`
			INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at, last_active_at, ip_address, user_agent)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			session.id,
			session.user_id,
			session.token_hash,
			session.expires_at,
			session.created_at,
			session.last_active_at,
			session.ip_address ?? null,
			session.user_agent ?? null
		);
		return db.prepare('SELECT * FROM auth_sessions WHERE id = ?').get(session.id) as DBAuthSession;
	},

	getSessionByTokenHash(hash: string): DBAuthSession | null {
		const db = getDatabase();
		return db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(hash) as DBAuthSession | null;
	},

	updateLastActive(id: string): void {
		const db = getDatabase();
		const now = new Date().toISOString();
		db.prepare('UPDATE auth_sessions SET last_active_at = ? WHERE id = ?').run(now, id);
	},

	deleteSession(id: string): void {
		const db = getDatabase();
		db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(id);
	},

	deleteSessionByTokenHash(hash: string): void {
		const db = getDatabase();
		db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hash);
	},

	deleteSessionsByUserId(userId: string): void {
		const db = getDatabase();
		db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
	},

	deleteExpiredSessions(): number {
		const db = getDatabase();
		const now = new Date().toISOString();
		const result = db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(now) as { changes: number };
		return result.changes;
	},

	// ===================== Invite Tokens =====================

	createInvite(invite: DBInviteToken): DBInviteToken {
		const db = getDatabase();
		db.prepare(`
			INSERT INTO invite_tokens (id, token_hash, role, label, created_by, max_uses, use_count, expires_at, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			invite.id,
			invite.token_hash,
			invite.role,
			invite.label,
			invite.created_by,
			invite.max_uses,
			invite.use_count,
			invite.expires_at,
			invite.created_at
		);
		return db.prepare('SELECT * FROM invite_tokens WHERE id = ?').get(invite.id) as DBInviteToken;
	},

	getInviteByTokenHash(hash: string): DBInviteToken | null {
		const db = getDatabase();
		return db.prepare('SELECT * FROM invite_tokens WHERE token_hash = ?').get(hash) as DBInviteToken | null;
	},

	incrementUseCount(id: string): void {
		const db = getDatabase();
		db.prepare('UPDATE invite_tokens SET use_count = use_count + 1 WHERE id = ?').run(id);
	},

	getAllInvites(): DBInviteToken[] {
		const db = getDatabase();
		return db.prepare('SELECT * FROM invite_tokens ORDER BY created_at DESC').all() as DBInviteToken[];
	},

	revokeInvite(id: string): void {
		const db = getDatabase();
		db.prepare('DELETE FROM invite_tokens WHERE id = ?').run(id);
	},

	deleteAllSessions(): number {
		const db = getDatabase();
		const result = db.prepare('DELETE FROM auth_sessions').run() as { changes: number };
		return result.changes;
	},

	getSessionsForUser(userId: string): DBAuthSession[] {
		const db = getDatabase();
		return db.prepare(`
			SELECT * FROM auth_sessions
			WHERE user_id = ? AND expires_at > datetime('now')
			ORDER BY last_active_at DESC
		`).all(userId) as DBAuthSession[];
	}
};
