<script lang="ts">
	import { systemSettings, updateSystemSettings } from '$frontend/lib/stores/features/settings.svelte';
	import { authStore } from '$frontend/lib/stores/features/auth.svelte';
	import Icon from '../../common/Icon.svelte';
	import Dialog from '../../common/Dialog.svelte';
	import type { AuthMode } from '$shared/types/stores/settings';

	const isAdmin = $derived(authStore.isAdmin);
	const currentMode = $derived(systemSettings.authMode);

	let showConfirmDialog = $state(false);
	let pendingMode = $state<AuthMode>('required');
	let showPatResult = $state(false);
	let generatedPat = $state('');
	let patCopied = $state(false);

	function requestModeChange(mode: AuthMode) {
		if (mode === currentMode) return;
		pendingMode = mode;
		showConfirmDialog = true;
	}

	async function confirmModeChange() {
		showConfirmDialog = false;

		updateSystemSettings({ authMode: pendingMode });

		// If switching from no-auth to with-auth, generate PAT for current user
		if (pendingMode === 'required' && currentMode === 'none') {
			try {
				const pat = await authStore.regeneratePAT();
				generatedPat = pat;
				showPatResult = true;
			} catch {
				// User may already have a PAT
			}
		}
	}

	async function copyPat() {
		if (generatedPat) {
			await navigator.clipboard.writeText(generatedPat);
			patCopied = true;
			setTimeout(() => { patCopied = false; }, 2000);
		}
	}

	function dismissPat() {
		showPatResult = false;
		generatedPat = '';
		patCopied = false;
	}
</script>

{#if isAdmin}
<div class="py-1">
	<h3 class="text-base font-bold text-slate-900 dark:text-slate-100 mb-1.5">Authentication</h3>
	<p class="text-sm text-slate-600 dark:text-slate-500 mb-5">Configure how users access Clopen</p>

	<div class="flex flex-col gap-3.5">
		<!-- No Login -->
		<button
			type="button"
			class="w-full text-left p-4 bg-slate-100/80 dark:bg-slate-800/80 border rounded-xl transition-all
				{currentMode === 'none'
					? 'border-violet-500/50 ring-1 ring-violet-500/20'
					: 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}"
			onclick={() => requestModeChange('none')}
		>
			<div class="flex items-center gap-3.5">
				<div class="flex items-center justify-center w-10 h-10 rounded-lg shrink-0
					{currentMode === 'none'
						? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
						: 'bg-slate-200/80 dark:bg-slate-700 text-slate-400'}">
					<Icon name="lucide:lock-open" class="w-5 h-5" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="text-sm font-semibold text-slate-900 dark:text-slate-100">No Login</div>
					<div class="text-xs text-slate-600 dark:text-slate-500">
						No authentication required. Anyone with access to this URL can use Clopen.
					</div>
				</div>
				{#if currentMode === 'none'}
					<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 shrink-0">
						<span class="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
						Active
					</div>
				{/if}
			</div>
		</button>

		<!-- With Login -->
		<button
			type="button"
			class="w-full text-left p-4 bg-slate-100/80 dark:bg-slate-800/80 border rounded-xl transition-all
				{currentMode === 'required'
					? 'border-violet-500/50 ring-1 ring-violet-500/20'
					: 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}"
			onclick={() => requestModeChange('required')}
		>
			<div class="flex items-center gap-3.5">
				<div class="flex items-center justify-center w-10 h-10 rounded-lg shrink-0
					{currentMode === 'required'
						? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
						: 'bg-slate-200/80 dark:bg-slate-700 text-slate-400'}">
					<Icon name="lucide:lock" class="w-5 h-5" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="text-sm font-semibold text-slate-900 dark:text-slate-100">With Login</div>
					<div class="text-xs text-slate-600 dark:text-slate-500">
						Authenticate with a Personal Access Token. Supports multiple users and invite links.
					</div>
				</div>
				{#if currentMode === 'required'}
					<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 shrink-0">
						<span class="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
						Active
					</div>
				{/if}
			</div>
		</button>
	</div>

	<!-- PAT Generated after switching to with-auth -->
	{#if showPatResult && generatedPat}
		<div class="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
			<p class="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
				Your Personal Access Token
			</p>
			<p class="text-xs text-amber-700 dark:text-amber-300 mb-3">
				Authentication is now required. Save this token — you'll need it to log in. It won't be shown again.
			</p>
			<div class="flex items-center gap-2">
				<code class="flex-1 px-3 py-2 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-xs font-mono text-slate-900 dark:text-slate-100 select-all break-all">
					{generatedPat}
				</code>
				<button
					onclick={copyPat}
					class="shrink-0 px-3 py-2 rounded bg-amber-100 dark:bg-amber-900 hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-medium transition-colors"
				>
					{patCopied ? 'Copied!' : 'Copy'}
				</button>
			</div>
			<button
				onclick={dismissPat}
				class="mt-3 text-xs text-amber-600 dark:text-amber-400 hover:underline"
			>
				Dismiss
			</button>
		</div>
	{/if}
</div>
{/if}

<!-- Confirm dialog -->
<Dialog
	bind:isOpen={showConfirmDialog}
	onClose={() => { showConfirmDialog = false; }}
	type="info"
	title="Change Authentication Mode"
	message={pendingMode === 'none'
		? 'Switching to Single User mode will disable login requirements. Existing users and sessions will be preserved but bypassed.'
		: 'Switching to Multi User mode will require login. A Personal Access Token will be generated for your account.'}
	confirmText="Confirm"
	cancelText="Cancel"
	showCancel={true}
	onConfirm={confirmModeChange}
/>
