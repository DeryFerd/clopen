<script lang="ts">
	import type { ExitPlanModeToolInput } from '$shared/types/messaging';
	import { InfoLine, CodeBlock } from './components';
	import TextMessage from '../formatters/TextMessage.svelte';

	const { toolInput }: { toolInput: ExitPlanModeToolInput } = $props();

	const plan = $derived((toolInput.input as any).plan as string || '');
</script>

<div class="bg-white dark:bg-slate-800 rounded-md border border-slate-200/60 dark:border-slate-700/60 p-3 mb-4">
	<!-- Plan Info -->
	<div class="flex gap-3 mb-2.5">
		<InfoLine icon="lucide:map" text="Exiting plan mode with proposed plan" />
	</div>
	
	<CodeBlock code={plan} type="neutral" />
</div>

<!-- Tool Result -->
{#if toolInput.$result}
	<div class="">
		{#if typeof toolInput.$result.content === 'string'}
			<TextMessage content={toolInput.$result.content} />
		{:else}
			<TextMessage content={JSON.stringify(toolInput.$result.content)} />
		{/if}
	</div>
{/if}