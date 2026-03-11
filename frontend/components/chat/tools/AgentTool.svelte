<script lang="ts">
	import { tick } from 'svelte';
	import type { AgentToolInput, SubAgentActivity } from '$shared/types/messaging';
	import { InfoLine } from './components';
	import TextMessage from '../formatters/TextMessage.svelte';

	const { toolInput }: { toolInput: AgentToolInput } = $props();

	const description = $derived(toolInput.input.description || '');
	const subagentType = $derived(toolInput.input.subagent_type || 'general-purpose');
	const subMessages = $derived(toolInput.$subMessages);
	const toolUseCount = $derived(subMessages?.filter(a => a.type === 'tool_use').length ?? 0);
	const result = $derived(toolInput.$result);

	let scrollContainer: HTMLDivElement | undefined = $state();

	// Auto-scroll to bottom when new activities arrive
	$effect(() => {
		const len = subMessages?.length ?? 0;
		if (len > 0 && scrollContainer) {
			tick().then(() => {
				if (scrollContainer) {
					scrollContainer.scrollTop = scrollContainer.scrollHeight;
				}
			});
		}
	});

	function getToolBrief(activity: SubAgentActivity): string {
		if (!activity.toolInput) return '';
		switch (activity.toolName) {
			case 'Bash': return activity.toolInput.command || '';
			case 'Read': return activity.toolInput.file_path || '';
			case 'Write': return activity.toolInput.file_path || '';
			case 'Edit': return activity.toolInput.file_path || '';
			case 'Glob': return activity.toolInput.pattern || '';
			case 'Grep': return activity.toolInput.pattern || '';
			case 'WebFetch': return activity.toolInput.url || '';
			case 'WebSearch': return activity.toolInput.query || '';
			default: return '';
		}
	}
</script>

<!-- Header card -->
<div class="bg-white dark:bg-slate-800 rounded-md border border-slate-200/60 dark:border-slate-700/60 p-3 mb-2">
	<div class="space-y-1">
		<InfoLine icon="lucide:search" text={description} />
		<InfoLine icon="lucide:bot" text="Using {subagentType} agent" />
	</div>
</div>

<!-- Sub-agent tool calls (separate from header) -->
{#if subMessages && subMessages.length > 0}
<div class="bg-white dark:bg-slate-800 rounded-md border border-slate-200/60 dark:border-slate-700/60 p-3">
	<div class="text-xs text-slate-500 dark:text-slate-400 mb-2">
		{toolUseCount} tool {toolUseCount === 1 ? 'call' : 'calls'}:
	</div>
	<div bind:this={scrollContainer} class="max-h-64 overflow-y-auto wrap-break-word">
		<ul class="list-disc pl-5 space-y-0.5">
			{#each subMessages as activity}
				{#if activity.type === 'tool_use'}
					<li class="text-xs text-slate-600 dark:text-slate-400">
						<span class="font-medium">{activity.toolName}</span>
						{#if getToolBrief(activity)}
							<span class="text-slate-400 dark:text-slate-500 ml-1">{getToolBrief(activity)}</span>
						{/if}
					</li>
				{:else if activity.type === 'text'}
					<li class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
						{activity.text}
					</li>
				{/if}
			{/each}
		</ul>
	</div>
</div>
{/if}

<!-- Tool Result -->
<!-- {#if result}
	{@const resultContent = result.content as any}
	<div class="mt-4">
		{#if typeof resultContent === 'string'}
			<TextMessage content={resultContent} />
		{:else if Array.isArray(resultContent)}
			{#each resultContent as block}
				{#if typeof block === 'object' && block.type === 'text'}
					<TextMessage content={block.text} />
				{/if}
			{/each}
		{:else}
			<TextMessage content={JSON.stringify(resultContent)} />
		{/if}
	</div>
{/if} -->
