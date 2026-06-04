/**
 * Unified Engine Queries — providers + accounts for ALL engines.
 *
 * The previous split (claude_accounts + opencode_providers + opencode_accounts)
 * is consolidated here into:
 *   engine_providers  — one row per (engine_type, slug)
 *   engine_accounts   — credentials under a provider
 *
 * Conventions:
 *   - `slug`       : machine id (e.g. 'anthropic', 'openai'). Lowercase, stable.
 *   - `name`       : display name (user-facing).
 *   - `provider_id`: FK to engine_providers.id (always numeric).
 *   - `credential` : generic secret (OAuth token for claude-code, API key for opencode).
 */

import type { EngineType } from '$shared/types/unified';
import { getDatabase } from '../index';
import { encryptCredential, decryptCredential, isEncrypted } from '../../auth/credential-crypto';

// ============================================================================
// Types
// ============================================================================

export interface EngineProvider {
	id: number;
	engine_type: EngineType;
	slug: string;
	name: string;
	npm: string | null;
	api_url: string | null;
	options: string;
	is_enabled: number;
	created_at: string;
}

export interface EngineAccount {
	id: number;
	provider_id: number;
	name: string;
	credential: string;
	is_active: number;
	created_at: string;
}

/** Provider with its accounts joined. */
export interface EngineProviderWithAccounts extends EngineProvider {
	accounts: EngineAccount[];
}

async function decryptAccount(account: EngineAccount | null): Promise<EngineAccount | null> {
	if (!account) return null;
	if (!isEncrypted(account.credential)) return account;
	return { ...account, credential: await decryptCredential(account.credential) };
}

async function decryptAccounts(accounts: EngineAccount[]): Promise<EngineAccount[]> {
	return Promise.all(accounts.map(a => decryptAccount(a).then(a => a!)));
}

// ============================================================================
// Queries
// ============================================================================

export const engineQueries = {
	// ------------------------------------------------------------------
	// Providers
	// ------------------------------------------------------------------

	getProviders(engineType?: EngineType): EngineProvider[] {
		const db = getDatabase();
		if (engineType) {
			return db.prepare(
				`SELECT * FROM engine_providers WHERE engine_type = ? ORDER BY created_at ASC`
			).all(engineType) as EngineProvider[];
		}
		return db.prepare(
			`SELECT * FROM engine_providers ORDER BY engine_type ASC, created_at ASC`
		).all() as EngineProvider[];
	},

	getEnabledProviders(engineType?: EngineType): EngineProvider[] {
		const db = getDatabase();
		if (engineType) {
			return db.prepare(
				`SELECT * FROM engine_providers WHERE engine_type = ? AND is_enabled = 1 ORDER BY created_at ASC`
			).all(engineType) as EngineProvider[];
		}
		return db.prepare(
			`SELECT * FROM engine_providers WHERE is_enabled = 1 ORDER BY engine_type ASC, created_at ASC`
		).all() as EngineProvider[];
	},

	getProvider(id: number): EngineProvider | null {
		const db = getDatabase();
		return db.prepare(`SELECT * FROM engine_providers WHERE id = ?`).get(id) as EngineProvider | null;
	},

	getProviderBySlug(engineType: EngineType, slug: string): EngineProvider | null {
		const db = getDatabase();
		return db.prepare(
			`SELECT * FROM engine_providers WHERE engine_type = ? AND slug = ?`
		).get(engineType, slug) as EngineProvider | null;
	},

	createProvider(data: {
		engineType: EngineType;
		slug: string;
		name: string;
		npm?: string | null;
		apiUrl?: string | null;
		options?: string;
	}): EngineProvider {
		const db = getDatabase();
		const result = db.prepare(`
			INSERT INTO engine_providers (engine_type, slug, name, npm, api_url, options)
			VALUES (?, ?, ?, ?, ?, ?)
		`).run(
			data.engineType,
			data.slug,
			data.name,
			data.npm ?? null,
			data.apiUrl ?? null,
			data.options ?? '{}',
		) as { lastInsertRowid: number | bigint };
		const id = Number(result.lastInsertRowid);
		return db.prepare(`SELECT * FROM engine_providers WHERE id = ?`).get(id) as EngineProvider;
	},

	updateProviderOptions(id: number, options: string): void {
		const db = getDatabase();
		db.prepare(`UPDATE engine_providers SET options = ? WHERE id = ?`).run(options, id);
	},

	toggleProvider(id: number, enabled: boolean): void {
		const db = getDatabase();
		db.prepare(`UPDATE engine_providers SET is_enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
	},

	deleteProvider(id: number): void {
		const db = getDatabase();
		// Accounts cascade via FK.
		db.prepare(`DELETE FROM engine_providers WHERE id = ?`).run(id);
	},

	// ------------------------------------------------------------------
	// Accounts
	// ------------------------------------------------------------------

	async getAccount(id: number): Promise<EngineAccount | null> {
		const db = getDatabase();
		const account = db.prepare(`SELECT * FROM engine_accounts WHERE id = ?`).get(id) as EngineAccount | null;
		return decryptAccount(account);
	},

	async getAccountsByProvider(providerId: number): Promise<EngineAccount[]> {
		const db = getDatabase();
		const accounts = db.prepare(
			`SELECT * FROM engine_accounts WHERE provider_id = ? ORDER BY created_at ASC`
		).all(providerId) as EngineAccount[];
		return decryptAccounts(accounts);
	},

	async getActiveAccount(providerId: number): Promise<EngineAccount | null> {
		const db = getDatabase();
		const account = db.prepare(
			`SELECT * FROM engine_accounts WHERE provider_id = ? AND is_active = 1`
		).get(providerId) as EngineAccount | null;
		return decryptAccount(account);
	},

	/**
	 * Get the active account for the first enabled provider of the given engine.
	 * For claude-code this is effectively the active Anthropic account.
	 */
	async getActiveAccountForEngine(engineType: EngineType): Promise<EngineAccount | null> {
		const db = getDatabase();
		const account = db.prepare(`
			SELECT a.*
			FROM engine_accounts a
			JOIN engine_providers p ON p.id = a.provider_id
			WHERE p.engine_type = ? AND p.is_enabled = 1 AND a.is_active = 1
			ORDER BY p.created_at ASC, a.created_at ASC
			LIMIT 1
		`).get(engineType) as EngineAccount | null;
		return decryptAccount(account);
	},

	async createAccount(providerId: number, name: string, credential: string): Promise<EngineAccount> {
		const db = getDatabase();
		const encrypted = await encryptCredential(credential);

		// If it's the first account for this provider → mark active.
		const count = (db.prepare(
			`SELECT COUNT(*) as count FROM engine_accounts WHERE provider_id = ?`
		).get(providerId) as { count: number }).count;
		const isActive = count === 0 ? 1 : 0;

		const result = db.prepare(`
			INSERT INTO engine_accounts (provider_id, name, credential, is_active)
			VALUES (?, ?, ?, ?)
		`).run(providerId, name, encrypted, isActive) as { lastInsertRowid: number | bigint };

		const id = Number(result.lastInsertRowid);
		const account = db.prepare(`SELECT * FROM engine_accounts WHERE id = ?`).get(id) as EngineAccount;
		return { ...account, credential };
	},

	switchAccount(accountId: number): void {
		const db = getDatabase();
		const account = db.prepare(`SELECT * FROM engine_accounts WHERE id = ?`).get(accountId) as EngineAccount | null;
		if (!account) return;
		db.prepare(`UPDATE engine_accounts SET is_active = 0 WHERE provider_id = ?`).run(account.provider_id);
		db.prepare(`UPDATE engine_accounts SET is_active = 1 WHERE id = ?`).run(accountId);
	},

	deleteAccount(accountId: number): void {
		const db = getDatabase();
		const account = db.prepare(`SELECT * FROM engine_accounts WHERE id = ?`).get(accountId) as EngineAccount | null;
		if (!account) return;

		const wasActive = account.is_active === 1;
		db.prepare(`DELETE FROM engine_accounts WHERE id = ?`).run(accountId);

		// If deleted account was active, activate the first remaining account for its provider.
		if (wasActive) {
			const remaining = db.prepare(
				`SELECT id FROM engine_accounts WHERE provider_id = ? ORDER BY created_at ASC LIMIT 1`
			).get(account.provider_id) as { id: number } | null;
			if (remaining) {
				db.prepare(`UPDATE engine_accounts SET is_active = 1 WHERE id = ?`).run(remaining.id);
			}
		}
	},

	renameAccount(accountId: number, name: string): void {
		const db = getDatabase();
		db.prepare(`UPDATE engine_accounts SET name = ? WHERE id = ?`).run(name, accountId);
	},

	/**
	 * Replace the stored credential for an existing account. Used by adapters
	 * whose CLI mutates an external dotfile in place (e.g. Codex's
	 * ~/.codex/auth.json token refresh) — the adapter snapshots the file back
	 * into `credential` after each stream so refreshed tokens survive across
	 * account switches.
	 */
	async updateAccountCredential(accountId: number, credential: string): Promise<void> {
		const db = getDatabase();
		const encrypted = await encryptCredential(credential);
		db.prepare(`UPDATE engine_accounts SET credential = ? WHERE id = ?`).run(encrypted, accountId);
	},

	// ------------------------------------------------------------------
	// Composite
	// ------------------------------------------------------------------

	async getProvidersWithAccounts(engineType?: EngineType): Promise<EngineProviderWithAccounts[]> {
		const providers = this.getProviders(engineType);
		const accountsByProvider = await Promise.all(
			providers.map(p => this.getAccountsByProvider(p.id))
		);
		return providers.map((p, i) => ({
			...p,
			accounts: accountsByProvider[i],
		}));
	},
};
