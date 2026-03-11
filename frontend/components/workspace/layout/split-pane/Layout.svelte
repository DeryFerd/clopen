<script lang="ts">
	import { type SplitNode, setPanelAtPath, closePanelAtPath, PANEL_OPTIONS } from '$frontend/stores/ui/workspace.svelte';
	import Icon from '$frontend/components/common/display/Icon.svelte';
	import PanelContainer from '../../PanelContainer.svelte';
	import Container from './Container.svelte';

	interface Props {
		node: SplitNode;
		path?: number[]; // Path in tree for resize updates
	}

	const { node, path = [] }: Props = $props();
</script>

{#if node.type === 'panel'}
	<!-- Panel Leaf: Render panel wrapper -->
	{#if node.panelId}
		<div class="split-pane-panel h-full w-full overflow-hidden">
			<PanelContainer panelId={node.panelId} />
		</div>
	{:else}
		<!-- Empty slot: Panel picker -->
		<div
			class="split-pane-empty flex flex-col items-center justify-center gap-4 h-full w-full bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
		>
			<span class="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Choose Panel</span>
			<div class="grid grid-cols-3 gap-2">
				{#each PANEL_OPTIONS as option}
					<button
						type="button"
						class="flex flex-col items-center justify-center gap-2 w-26 h-18 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer transition-all duration-150 hover:bg-violet-500/10 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400"
						onclick={() => setPanelAtPath(path, option.id)}
					>
						<Icon name={option.icon} class="w-5 h-5" />
						<span>{option.title}</span>
					</button>
				{/each}
				<!-- Close / Cancel button -->
				{#if path.length > 0}
					<button
						type="button"
						class="flex flex-col items-center justify-center gap-2 w-26 h-18 bg-transparent border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-400 dark:text-slate-500 cursor-pointer transition-all duration-150 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400"
						onclick={() => closePanelAtPath(path)}
						title="Remove this panel slot"
					>
						<Icon name="lucide:x" class="w-5 h-5" />
						<span>Cancel</span>
					</button>
				{/if}
			</div>
		</div>
	{/if}
{:else if node.type === 'split'}
	<!-- Split Container: Render split with two children -->
	<Container
		direction={node.direction}
		ratio={node.ratio}
		path={path}
		child1={node.children[0]}
		child2={node.children[1]}
	/>
{/if}
