/**
 * Setup mutex — serializes the initial setup flow.
 *
 * The setup routes (`auth:setup`, `auth:setup-no-auth`) and the no-auth
 * auto-login route all check `needsSetup()` to decide whether to create
 * the first admin. Without coordination, two near-simultaneous requests
 * can both pass that check and both create users (and write the
 * `system:settings.authMode` setting in different orders, depending on
 * which route wins the race).
 *
 * This is a single-process mutex: Clopen's Elysia server runs as a
 * single Node/Bun process, so the race lives entirely in-process and
 * an in-process lock is sufficient. A future multi-process deployment
 * would need a DB-level lock, but the `users` table would already need
 * a unique constraint to prevent duplicate-admin creation in that
 * case.
 *
 * The lock is per-key so the setup flow can run alongside other
 * unrelated operations — but in practice all three setup routes use
 * the same key, so they always serialize against each other.
 *
 * Implementation note: we hand the caller a "ticket" promise that
 * resolves only when the previous holder's `release()` runs. Awaiting
 * the ticket is what blocks later callers; the Map only ever holds
 * the tail of the chain, so there's no leak.
 */

class SetupMutex {
	/** Tail of the per-key promise chain. */
	private tails = new Map<string, Promise<void>>();

	/**
	 * Run `fn` while holding the lock for `key`. The lock is released
	 * when the returned promise settles, regardless of outcome.
	 */
	async run<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
		// Capture the previous tail; whatever it was, we queue behind it.
		const previous = this.tails.get(key) ?? Promise.resolve();

		// Build a "ticket" that resolves only when this caller's fn()
		// settles AND its release() is invoked. We chain `previous` so
		// any rejection from the previous holder is absorbed — the
		// current call should never reject solely because the previous
		// one did.
		let release!: () => void;
		const ticket = new Promise<void>((resolve) => {
			release = resolve;
		});
		const myTurn = previous.catch(() => undefined).then(() => ticket);

		// Publish our tail before we start running, so callers arriving
		// after us queue behind this ticket rather than behind `previous`.
		this.tails.set(key, myTurn);

		// Wait for the previous holder (if any) to release the lock.
		await previous.catch(() => undefined);

		try {
			return await fn();
		} finally {
			release();
			// Eager cleanup: if no one queued behind us, drop the entry.
			if (this.tails.get(key) === myTurn) {
				this.tails.delete(key);
			}
		}
	}
}

export const setupMutex = new SetupMutex();

/** Lock key used by all setup routes. */
export const SETUP_LOCK_KEY = 'setup';
