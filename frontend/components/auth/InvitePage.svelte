<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$frontend/stores/features/auth.svelte';
	import ws from '$frontend/utils/ws';

	let name = $state('');
	let error = $state('');
	let isLoading = $state(false);
	let isValidating = $state(true);
	let inviteValid = $state(false);
	let showPAT = $state(false);
	let patCopied = $state(false);

	// Rate limit countdown
	let lockoutSeconds = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	function parseRateLimitSeconds(message: string): number {
		const match = message.match(/Try again in (\d+) seconds/);
		return match ? parseInt(match[1], 10) : 0;
	}

	function startCountdown(seconds: number) {
		stopCountdown();
		lockoutSeconds = seconds;
		countdownInterval = setInterval(() => {
			lockoutSeconds -= 1;
			if (lockoutSeconds <= 0) {
				stopCountdown();
				error = '';
			}
		}, 1000);
	}

	function stopCountdown() {
		lockoutSeconds = 0;
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	const isLockedOut = $derived(lockoutSeconds > 0);

	const displayError = $derived(
		isLockedOut
			? `Too many failed attempts. Try again in ${lockoutSeconds} seconds.`
			: error
	);

	// Extract invite token from URL hash
	const hash = window.location.hash;
	const inviteToken = hash.startsWith('#invite/') ? hash.slice(8) : '';

	onMount(async () => {
		if (!inviteToken) {
			error = 'No invite token found';
			isValidating = false;
			return;
		}

		try {
			const result = await ws.http('auth:validate-invite', { inviteToken });
			inviteValid = result.valid;
			if (!result.valid) {
				error = result.error ?? 'Invalid invite token';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to validate invite';
		} finally {
			isValidating = false;
		}
	});

	async function handleAccept() {
		if (!name.trim()) {
			error = 'Please enter a display name';
			return;
		}

		error = '';
		isLoading = true;

		try {
			await authStore.acceptInvite(inviteToken, name.trim());
			showPAT = true;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to accept invite';
			error = message;

			const seconds = parseRateLimitSeconds(message);
			if (seconds > 0) {
				startCountdown(seconds);
			}
		} finally {
			isLoading = false;
		}
	}

	async function copyPAT() {
		if (authStore.personalAccessToken) {
			await navigator.clipboard.writeText(authStore.personalAccessToken);
			patCopied = true;
			setTimeout(() => { patCopied = false; }, 2000);
		}
	}

	function handleContinue() {
		authStore.completeInvite();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !showPAT && !isLockedOut) {
			handleAccept();
		}
	}
</script>

<div class="fixed inset-0 z-[9999] bg-white dark:bg-slate-950 flex items-center justify-center">
	<div class="flex flex-col items-center gap-6 text-center px-4 max-w-md w-full">
		<!-- Logo -->
		<div>
			<img src="/favicon.svg" alt="Clopen" class="w-16 h-16 rounded-2xl shadow-xl" />
		</div>

		{#if isValidating}
			<div class="space-y-2">
				<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Clopen</h1>
				<p class="text-sm text-slate-500 dark:text-slate-400">Validating invite...</p>
			</div>
		{:else if !inviteValid && !showPAT}
			<!-- Invalid invite -->
			<div class="space-y-4">
				<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Invalid Invite</h1>
				<p class="text-sm text-red-500">{error}</p>
				<a
					href="/"
					class="inline-block py-2 px-4 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
				>
					Go to Login
				</a>
			</div>
		{:else if !showPAT}
			<!-- Accept invite form -->
			<div class="space-y-1">
				<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">You've been invited</h1>
				<p class="text-sm text-slate-500 dark:text-slate-400">Enter your name to join Clopen</p>
			</div>

			<div class="w-full space-y-4">
				<div class="text-left">
					<label for="name" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
						Display Name
					</label>
					<input
						id="name"
						type="text"
						bind:value={name}
						onkeydown={handleKeydown}
						placeholder="Enter your name"
						disabled={isLoading || isLockedOut}
						class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
					/>
				</div>

				{#if displayError}
					<p class="text-sm text-red-500">{displayError}</p>
				{/if}

				<button
					onclick={handleAccept}
					disabled={isLoading || !name.trim() || isLockedOut}
					class="w-full py-2 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isLoading ? 'Joining...' : 'Join'}
				</button>
			</div>
		{:else}
			<!-- PAT Display -->
			<div class="space-y-1">
				<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome!</h1>
				<p class="text-sm text-slate-500 dark:text-slate-400">Your account has been created</p>
			</div>

			<div class="w-full space-y-4">
				<div class="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
					<p class="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
						Your Personal Access Token
					</p>
					<p class="text-xs text-amber-700 dark:text-amber-300 mb-3">
						Save this token — you'll need it to log in on other devices. It won't be shown again.
					</p>
					<div class="flex items-center gap-2">
						<code class="flex-1 px-3 py-2 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-xs font-mono text-slate-900 dark:text-slate-100 select-all break-all">
							{authStore.personalAccessToken}
						</code>
						<button
							onclick={copyPAT}
							class="shrink-0 px-3 py-2 rounded bg-amber-100 dark:bg-amber-900 hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-medium transition-colors"
						>
							{patCopied ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>

				<button
					onclick={handleContinue}
					class="w-full py-2 px-4 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
				>
					Continue to Clopen
				</button>
			</div>
		{/if}
	</div>
</div>
