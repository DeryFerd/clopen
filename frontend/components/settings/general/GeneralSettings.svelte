<script lang="ts">
	import DataManagementSettings from './DataManagementSettings.svelte';
	import AdvancedSettings from './AdvancedSettings.svelte';
	import UpdateSettings from './UpdateSettings.svelte';
	import AuthModeSettings from './AuthModeSettings.svelte';
</script>

<AuthModeSettings />

<div class="mt-6">
	<UpdateSettings />
</div>

<div class="mt-6">
	<DataManagementSettings />
</div>

<div class="mt-6">
	<AdvancedSettings />
</div>
