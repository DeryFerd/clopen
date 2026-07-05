<script lang="ts">
	import { authStore } from '$frontend/stores/features/auth.svelte';

	let token = $state('');
	let error = $state('');
	let isLoading = $state(false);

	// Server-controlled lockout based on timestamp
	let serverLockedUntil = $state(0);
	let clientTime = $state(Date.now());
	let syncInterval: ReturnType<typeof setInterval> | null = null;

	// Start client time sync when locked out
	function startTimerSync() {
		if (syncInterval) return;
		syncInterval = setInterval(() => {
			clientTime = Date.now();
			if (clientTime >= serverLockedUntil) {
				stopTimerSync();
				error = '';
			}
		}, 100); // Update every 100ms for smoother countdown
	}

	function stopTimerSync() {
		if (syncInterval) {
			clearInterval(syncInterval);
			syncInterval = null;
		}
		serverLockedUntil = 0;
	}

	// Derived lockout state based on server timestamp
	const isLockedOut = $derived(clientTime < serverLockedUntil);
	const remainingSeconds = $derived(
		isLockedOut ? Math.ceil((serverLockedUntil - clientTime) / 1000) : 0
	);

	// Build display error with remaining time
	const displayError = $derived(
		isLockedOut
			? `Too many failed attempts. Try again in ${remainingSeconds} seconds.`
			: error
	);

	async function handleLogin() {
		const trimmed = token.trim();

		if (!trimmed) {
			error = 'Please enter your access token';
			return;
		}

		if (!trimmed.startsWith('clp_pat_')) {
			error = 'Invalid token format. Use your Personal Access Token (clp_pat_...)';
			return;
		}

		error = '';
		isLoading = true;

		try {
			await authStore.login(trimmed);
			// Success - clear any lockout
			stopTimerSync();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Login failed';
			error = message;

			// Check if error has lockedUntil timestamp from server
			const lockedUntil = (err as any)?.lockedUntil;
			if (typeof lockedUntil === 'number' && lockedUntil > Date.now()) {
				serverLockedUntil = lockedUntil;
				clientTime = Date.now();
				startTimerSync();
			}
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !isLockedOut) {
			handleLogin();
		}
	}
</script>

<div class="fixed inset-0 z-[9999] bg-white dark:bg-slate-950 flex items-center justify-center">
	<div class="flex flex-col items-center gap-6 text-center px-4 max-w-md w-full">
		<!-- Logo -->
		<div>
			<img src="/favicon.svg" alt="Clopen" class="w-16 h-16 rounded-2xl shadow-xl" />
		</div>

		<div class="space-y-1">
			<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Clopen</h1>
			<p class="text-sm text-slate-500 dark:text-slate-400">Enter your access token to sign in</p>
		</div>

		<div class="w-full space-y-4">
			<div class="text-left">
				<label for="token" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
					Access Token
				</label>
				<input
					id="token"
					type="password"
					bind:value={token}
					onkeydown={handleKeydown}
					placeholder="clp_pat_..."
					disabled={isLoading || isLockedOut}
					class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
				/>
			</div>

			{#if displayError}
				<p class="text-sm text-red-500">{displayError}</p>
			{/if}

			<button
				onclick={handleLogin}
				disabled={isLoading || !token.trim() || isLockedOut}
				class="w-full py-2 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{isLoading ? 'Signing in...' : 'Sign In'}
			</button>

			<p class="text-xs text-slate-400 dark:text-slate-500">
				Don't have a token? Ask your admin for an invite link.
			</p>
		</div>
	</div>
</div>
