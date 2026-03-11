<script lang="ts">
	import { authStore } from '$frontend/lib/stores/features/auth.svelte';
	import PageTemplate from '../common/PageTemplate.svelte';

	// Import modular components
	import ModelSettings from './model/ModelSettings.svelte';
	import AppearanceSettings from './appearance/AppearanceSettings.svelte';
	import UserSettings from './user/UserSettings.svelte';
	import NotificationSettings from './notifications/NotificationSettings.svelte';
	import GeneralSettings from './general/GeneralSettings.svelte';
	import UserManagement from './admin/UserManagement.svelte';
	import InviteManagement from './admin/InviteManagement.svelte';

	const isAdmin = $derived(authStore.isAdmin);
	const isNoAuth = $derived(authStore.isNoAuth);
</script>

<PageTemplate
	title="Settings"
	description="Application settings"
>
	<div class="flex-1 overflow-auto">
		<div class="space-y-6">

			<!-- Model Configuration -->
			<ModelSettings />

			<!-- Appearance Configuration -->
			<AppearanceSettings />

			<!-- User Settings (hidden in no-auth mode) -->
			{#if !isNoAuth}
				<UserSettings />
			{/if}

			<!-- Notification Settings -->
			<NotificationSettings />

			<!-- General Settings -->
			<GeneralSettings />

			<!-- Admin-only sections (hidden in no-auth mode) -->
			{#if isAdmin && !isNoAuth}
				<UserManagement />
				<InviteManagement />
			{/if}

		</div>
	</div>
</PageTemplate>
