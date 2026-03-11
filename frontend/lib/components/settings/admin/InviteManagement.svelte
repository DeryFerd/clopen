<script lang="ts">
	import { authStore } from '$frontend/lib/stores/features/auth.svelte';
	import { addNotification } from '$frontend/lib/stores/ui/notification.svelte';
	import Icon from '../../common/Icon.svelte';
	import Dialog from '../../common/Dialog.svelte';
	import ws from '$frontend/lib/utils/ws';
	import { debug } from '$shared/utils/logger';

	interface Invite {
		id: string;
		role: string;
		label: string | null;
		max_uses: number;
		use_count: number;
		expires_at: string | null;
		created_at: string;
	}

	let invites = $state<Invite[]>([]);
	let loading = $state(true);
	let isCreating = $state(false);

	// Store generated URLs by invite ID — persisted in sessionStorage so
	// they survive page refresh (raw token only available at creation time)
	const STORAGE_KEY = 'clopen-invite-urls';
	let inviteURLs = $state<Record<string, string>>({});

	function loadStoredURLs() {
		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) inviteURLs = JSON.parse(stored);
		} catch { /* ignore */ }
	}

	function saveURLsToStorage() {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(inviteURLs));
	}

	// Per-invite copy feedback
	let copiedId = $state<string | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;

	// Revoke state
	let showRevokeConfirm = $state(false);
	let inviteToRevoke = $state<Invite | null>(null);

	// Countdown ticker
	let tick = $state(0);
	let tickInterval: ReturnType<typeof setInterval> | null = null;

	// Filter: only show unused and not-expired invites
	const activeInvites = $derived.by(() => {
		void tick;
		const now = Date.now();
		return invites.filter(inv => {
			const usedUp = inv.max_uses > 0 && inv.use_count >= inv.max_uses;
			const expired = inv.expires_at !== null && new Date(inv.expires_at).getTime() < now;
			return !usedUp && !expired;
		});
	});

	function formatCountdown(expiresAt: string): string {
		void tick;
		const remaining = new Date(expiresAt).getTime() - Date.now();
		if (remaining <= 0) return 'Expired';

		const totalSec = Math.ceil(remaining / 1000);
		const min = Math.floor(totalSec / 60);
		const sec = totalSec % 60;
		return `${min}:${String(sec).padStart(2, '0')}`;
	}

	function startTicker() {
		if (tickInterval) return;
		tickInterval = setInterval(() => { tick++; }, 1000);
	}

	function stopTicker() {
		if (tickInterval) {
			clearInterval(tickInterval);
			tickInterval = null;
		}
	}

	async function loadInvites() {
		loading = true;
		try {
			invites = await ws.http('auth:list-invites', {});
		} catch (error) {
			debug.error('auth', 'Failed to load invites:', error);
		} finally {
			loading = false;
		}
	}

	async function generateInvite() {
		isCreating = true;
		try {
			const result = await ws.http('auth:create-invite', {
				maxUses: 1,
				expiresInMinutes: 15
			});

			const baseURL = window.location.origin;
			const url = `${baseURL}/#invite/${result.inviteToken}`;
			inviteURLs = { ...inviteURLs, [result.invite.id]: url };
			saveURLsToStorage();

			addNotification({ type: 'success', title: 'Created', message: 'Invite link created' });
			await loadInvites();
		} catch (error) {
			debug.error('auth', 'Failed to create invite:', error);
			addNotification({ type: 'error', title: 'Error', message: 'Failed to create invite' });
		} finally {
			isCreating = false;
		}
	}

	function copyInviteURL(inviteId: string) {
		const url = inviteURLs[inviteId];
		if (!url) return;
		navigator.clipboard.writeText(url);
		copiedId = inviteId;
		if (copiedTimer) clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => { copiedId = null; }, 2000);
	}

	function confirmRevoke(invite: Invite) {
		inviteToRevoke = invite;
		showRevokeConfirm = true;
	}

	async function revokeInvite() {
		if (!inviteToRevoke) return;
		const revokedId = inviteToRevoke.id;
		try {
			await ws.http('auth:revoke-invite', { id: revokedId });
			const { [revokedId]: _, ...rest } = inviteURLs;
			inviteURLs = rest;
			saveURLsToStorage();
			invites = invites.filter(inv => inv.id !== revokedId);
			addNotification({ type: 'success', title: 'Revoked', message: 'Invite link has been revoked' });
		} catch (error) {
			debug.error('auth', 'Failed to revoke invite:', error);
			addNotification({ type: 'error', title: 'Error', message: 'Failed to revoke invite' });
		} finally {
			showRevokeConfirm = false;
			inviteToRevoke = null;
		}
	}

	// Load on mount + start ticker + restore URLs from storage
	$effect(() => {
		if (authStore.isAdmin) {
			loadStoredURLs();
			loadInvites();
			startTicker();
			return () => stopTicker();
		}
	});
</script>

{#if authStore.isAdmin}
<div class="py-1">
	<h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-1.5">Invite</h3>
	<p class="text-sm text-slate-600 dark:text-slate-500 mb-5">Generate invite links for new team members</p>

	{#if loading}
		<div class="flex items-center justify-center gap-3 py-8 text-slate-600 dark:text-slate-500 text-sm">
			<div class="w-5 h-5 border-2 border-violet-500/20 border-t-violet-600 rounded-full animate-spin"></div>
			<span>Loading...</span>
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#each activeInvites as invite (invite.id)}
				{@const url = inviteURLs[invite.id]}
				<div class="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
					<div class="flex-1 min-w-0 font-mono text-xs text-slate-600 dark:text-slate-400 truncate select-all">
						{url ?? '—'}
					</div>
					{#if url}
						<button
							type="button"
							onclick={() => copyInviteURL(invite.id)}
							class="flex items-center justify-center w-7 h-7 rounded-md transition-all shrink-0
								{copiedId === invite.id
								? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
								: 'hover:bg-violet-100 dark:hover:bg-violet-900/30 text-slate-400 hover:text-violet-600 dark:hover:text-violet-400'}"
							title="Copy link"
						>
							<Icon name={copiedId === invite.id ? 'lucide:check' : 'lucide:copy'} class="w-3.5 h-3.5" />
						</button>
					{/if}
					{#if invite.expires_at}
						<span class="text-xs font-mono text-slate-500 tabular-nums shrink-0">
							{formatCountdown(invite.expires_at)}
						</span>
					{/if}
					<button
						type="button"
						onclick={() => confirmRevoke(invite)}
						class="flex items-center justify-center w-7 h-7 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-all shrink-0"
						title="Revoke invite"
					>
						<Icon name="lucide:x" class="w-3.5 h-3.5" />
					</button>
				</div>
			{/each}

			<button
				type="button"
				onclick={generateInvite}
				disabled={isCreating}
				class="inline-flex items-center gap-1.5 py-2 px-3.5 mt-1 bg-violet-500/10 dark:bg-violet-500/10 border border-violet-500/20 dark:border-violet-500/25 rounded-lg text-violet-600 dark:text-violet-400 text-xs font-semibold cursor-pointer transition-all duration-150 hover:bg-violet-500/20 hover:border-violet-600/40 self-start disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{#if isCreating}
					<div class="w-3.5 h-3.5 border-2 border-violet-600/30 border-t-violet-600 rounded-full animate-spin"></div>
					Generating...
				{:else}
					<Icon name="lucide:plus" class="w-3.5 h-3.5" />
					Generate Invite Link
				{/if}
			</button>
		</div>
	{/if}
</div>

<Dialog
	bind:isOpen={showRevokeConfirm}
	onClose={() => { showRevokeConfirm = false; inviteToRevoke = null; }}
	title="Revoke Invite"
	type="warning"
	message="Revoke this invite? Anyone with this link will no longer be able to join."
	confirmText="Revoke"
	cancelText="Cancel"
	showCancel={true}
	onConfirm={revokeInvite}
/>
{/if}
