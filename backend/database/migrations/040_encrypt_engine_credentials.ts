import type { DatabaseConnection } from '$shared/types/database/connection';
import { encryptCredential, isEncrypted } from '../../auth/credential-crypto';

export const id = '040';
export const description = 'Encrypt existing engine account credentials at rest';

export async function up(db: DatabaseConnection): Promise<void> {
	const rows = db.prepare(
		`SELECT id, credential FROM engine_accounts`
	).all() as { id: number; credential: string }[];

	const update = db.prepare(`UPDATE engine_accounts SET credential = ? WHERE id = ?`);

	for (const row of rows) {
		if (isEncrypted(row.credential)) continue;
		const encrypted = await encryptCredential(row.credential);
		update.run(encrypted, row.id);
	}
}

export async function down(_db: DatabaseConnection): Promise<void> {
}
