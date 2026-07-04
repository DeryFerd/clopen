import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { initializeDatabase, closeDatabase, getDatabase } from '$backend/database';
import { authQueries } from '$backend/database/queries';

function createUserId(): string {
	return `user-${crypto.randomUUID()}`;
}

function createInviteId(): string {
	return `invite-${crypto.randomUUID()}`;
}

describe('authQueries.incrementUseCount', () => {
	beforeAll(async () => {
		await initializeDatabase();
	});

	afterAll(() => {
		closeDatabase();
	});

	test('does not increment beyond max_uses for limited invites', () => {
		const now = new Date().toISOString();
		const userId = createUserId();
		const inviteId = createInviteId();
		const tokenHash = `hash-${crypto.randomUUID()}`;

		authQueries.createUser({
			id: userId,
			name: 'Invite Limit Tester',
			color: '#2563EB',
			avatar: 'ILT',
			role: 'admin',
			personal_access_token_hash: null,
			created_at: now
		});

		authQueries.createInvite({
			id: inviteId,
			token_hash: tokenHash,
			role: 'member',
			label: 'atomic-check',
			created_by: userId,
			max_uses: 1,
			use_count: 0,
			expires_at: null,
			created_at: now
		});

		authQueries.incrementUseCount(inviteId);
		authQueries.incrementUseCount(inviteId);

		const row = getDatabase().prepare('SELECT use_count FROM invite_tokens WHERE id = ?').get(inviteId) as { use_count: number };
		expect(row.use_count).toBe(1);

		getDatabase().prepare('DELETE FROM invite_tokens WHERE id = ?').run(inviteId);
		authQueries.deleteUser(userId);
	});
});
