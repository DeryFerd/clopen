<script lang="ts">
	import { connectionState } from '$frontend/stores/ui/connection.svelte';
	import Icon from '$frontend/components/common/display/Icon.svelte';
	import ws from '$frontend/utils/ws';
	import { slide } from 'svelte/transition';

	const showBanner = $derived(
		connectionState.status !== 'connected' || connectionState.justReconnected
	);

	const isReconnecting = $derived(connectionState.status === 'reconnecting');
	const isDisconnected = $derived(connectionState.status === 'disconnected');
	const isReconnected = $derived(connectionState.justReconnected && connectionState.status === 'connected');

	function handleReconnect() {
		ws.reconnect();
	}
</script>

{#if showBanner}
	<div
		transition:slide={{ duration: 300 }}
		class="flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium
			{isReconnected
				? 'bg-emerald-600 text-white'
				: isDisconnected
					? 'bg-red-600 text-white'
					: 'bg-amber-600 text-white'}"
		role="status"
		aria-live="polite"
	>
		{#if isReconnected}
			<Icon name="lucide:wifi" class="w-4 h-4" />
			<span>Reconnected</span>
		{:else if isReconnecting}
			<Icon name="lucide:loader-circle" class="w-4 h-4 animate-spin" />
			<span>Reconnecting{#if connectionState.reconnectAttempts > 1}&nbsp;(attempt {connectionState.reconnectAttempts}){/if}...</span>
			<button
				onclick={handleReconnect}
				class="ml-1 px-2 py-0.5 text-xs font-semibold rounded bg-white/20 hover:bg-white/30 transition-colors"
			>
				Reconnect now
			</button>
		{:else}
			<Icon name="lucide:wifi-off" class="w-4 h-4" />
			<span>Connection lost</span>
			<button
				onclick={handleReconnect}
				class="ml-1 px-2 py-0.5 text-xs font-semibold rounded bg-white/20 hover:bg-white/30 transition-colors"
			>
				Reconnect now
			</button>
		{/if}
	</div>
{/if}
