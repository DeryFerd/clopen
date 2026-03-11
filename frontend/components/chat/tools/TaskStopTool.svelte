<script lang="ts">
	import type { TaskStopToolInput } from '$shared/types/messaging';
	import { InfoLine } from './components';
	import TextMessage from '../formatters/TextMessage.svelte';

	const { toolInput }: { toolInput: TaskStopToolInput } = $props();

	const taskId = $derived(toolInput.input.task_id || toolInput.input.shell_id || 'unknown');
</script>

<div class="bg-white dark:bg-slate-800 rounded-md border border-slate-200/60 dark:border-slate-700/60 p-3">
	<div class="flex gap-3">
		<InfoLine icon="lucide:circle-x" text="Stopping task: {taskId}" />
	</div>
</div>

<!-- Tool Result -->
{#if toolInput.$result}
	<div class="mt-4 bg-white dark:bg-slate-800 rounded-md border border-slate-200/60 dark:border-slate-700/60 p-3">
		{#if typeof toolInput.$result.content === 'string'}
			<TextMessage content={toolInput.$result.content} />
		{:else}
			<TextMessage content={JSON.stringify(toolInput.$result.content)} />
		{/if}
	</div>
{/if}
