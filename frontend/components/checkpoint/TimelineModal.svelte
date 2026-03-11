<script lang="ts">
	import Modal from '$frontend/components/common/overlay/Modal.svelte';
	import Dialog from '$frontend/components/common/overlay/Dialog.svelte';
	import Icon from '$frontend/components/common/display/Icon.svelte';
	import DiffBlock from '$frontend/components/chat/tools/components/DiffBlock.svelte';
	import TimelineGraph from './timeline/TimelineGraph.svelte';
	import { sessionState, loadMessagesForSession } from '$frontend/stores/core/sessions.svelte';
	import { appState } from '$frontend/stores/core/app.svelte';
	import { addNotification } from '$frontend/stores/ui/notification.svelte';
	import { debug } from '$shared/utils/logger';
	import { buildGraph } from './timeline/graph-builder';
	import { startAnimation } from './timeline/animation';
	import { snapshotService } from '$frontend/services/snapshot/snapshot.service';
	import type { RestoreConflict, ConflictResolution } from '$frontend/services/snapshot/snapshot.service';
	import type { TimelineResponse, GraphNode, GraphEdge, VersionGroup, AnimationState } from './timeline/types';
	import ws from '$frontend/utils/ws';

	let {
		isOpen = $bindable(false),
		onClose = () => {},
		sessionIdOverride = undefined,
		readonly = false
	}: {
		isOpen: boolean;
		onClose: () => void;
		sessionIdOverride?: string;
		readonly?: boolean;
	} = $props();

	let timelineData = $state<TimelineResponse | null>(null);
	let loading = $state(false);
	let processingAction = $state(false);

	// Confirmation dialog state
	let showConfirmDialog = $state(false);
	let pendingNode = $state<GraphNode | null>(null);

	// Conflict resolution modal state
	let showConflictModal = $state(false);
	let conflictList = $state<RestoreConflict[]>([]);
	let conflictResolutions = $state<ConflictResolution>({});
	let conflictCheckingNode = $state<GraphNode | null>(null);
	let expandedDiffs = $state<Set<string>>(new Set());

	// Graph visualization state
	let graphNodes = $state<GraphNode[]>([]);
	let graphEdges = $state<GraphEdge[]>([]);
	let versionGroups = $state<VersionGroup[]>([]);
	let svgWidth = $state(800);
	let svgHeight = $state(600);

	// Animation state
	const animationState = $state<AnimationState>({
		isAnimating: false,
		restoringNodeId: null,
		progress: 0,
		oldNodePositions: new Map(),
		oldNodeStyles: new Map(),
		oldVersionGroups: []
	});

	// Scroll container reference
	let scrollContainer = $state<HTMLElement | undefined>();
	let isContentReady = $state(false);
	let hasScrolledToBottom = $state(false);

	// Track message count for realtime updates
	let previousMessageCount = $state(0);
	let isInitialLoad = $state(true);

	// Track if modal was opened
	let wasOpen = $state(false);

	// Get the session ID to use (override or current)
	const sessionId = $derived(sessionIdOverride || sessionState.currentSession?.id);

	// Load timeline data when modal opens
	$effect(() => {
		if (isOpen && !wasOpen && sessionId) {
			isContentReady = false;
			hasScrolledToBottom = false;
			isInitialLoad = true;
			previousMessageCount = sessionState.messages.length;
			loadTimeline();
			wasOpen = true;
		} else if (!isOpen && wasOpen) {
			hasScrolledToBottom = false;
			isInitialLoad = true;
			wasOpen = false;
		}
	});

	// Realtime updates: reload timeline when messages change
	$effect(() => {
		const currentMessageCount = sessionState.messages.length;

		if (
			!readonly &&
			isOpen &&
			currentMessageCount !== previousMessageCount &&
			previousMessageCount > 0 &&
			!processingAction &&
			!animationState.isAnimating &&
			!loading
		) {
			previousMessageCount = currentMessageCount;
			loadTimeline();
		}
	});

	// Reload timeline when a snapshot is captured (stats become available after stream ends)
	$effect(() => {
		if (!isOpen) return;

		const unsub = ws.on('snapshot:captured', (data: { chatSessionId: string }) => {
			if (data.chatSessionId === sessionId && !processingAction && !animationState.isAnimating) {
				loadTimeline();
			}
		});

		return unsub;
	});

	// Scroll to bottom on initial load
	$effect(() => {
		if (timelineData && graphNodes.length > 0 && scrollContainer && !hasScrolledToBottom) {
			setTimeout(() => {
				if (scrollContainer && !hasScrolledToBottom) {
					scrollContainer.scrollTop = scrollContainer.scrollHeight;
					hasScrolledToBottom = true;
					requestAnimationFrame(() => {
						isContentReady = true;
					});
				}
			}, 250);
		} else if (timelineData && graphNodes.length > 0 && hasScrolledToBottom && !isContentReady) {
			isContentReady = true;
		}
	});

	async function loadTimeline() {
		const showLoading = isInitialLoad;

		if (showLoading) {
			loading = true;
		}

		try {
			if (!sessionId) {
				throw new Error('No session ID available');
			}

			timelineData = await snapshotService.getTimeline(sessionId);
			rebuildGraph();
		} catch (error) {
			debug.error('snapshot', 'Error loading timeline:', error);
			addNotification({
				type: 'error',
				title: 'Timeline Error',
				message: error instanceof Error ? error.message : 'Failed to load checkpoint timeline',
				duration: 5000
			});
		} finally {
			if (showLoading) {
				loading = false;
				isInitialLoad = false;
			}
		}
	}

	function rebuildGraph(captureOldState = false) {
		if (!timelineData) return;

		if (captureOldState && !animationState.isAnimating) {
			animationState.oldNodePositions = new Map(
				graphNodes.map(n => [n.id, { x: n.x, y: n.y }])
			);
			animationState.oldNodeStyles = new Map(
				graphNodes.map(n => [n.id, { type: n.type }])
			);
			animationState.oldVersionGroups = [...versionGroups];
		}

		const graphData = buildGraph(timelineData);
		graphNodes = graphData.nodes;
		graphEdges = graphData.edges;
		versionGroups = graphData.versionGroups;
		svgWidth = graphData.svgWidth;
		svgHeight = graphData.svgHeight;
	}

	// Handle node click - check conflicts first, then show appropriate dialog
	async function handleNodeClick(node: GraphNode) {
		if (readonly) return;
		if (processingAction || node.isCurrent || animationState.isAnimating || appState.isLoading) return;

		const currentSessionId = sessionState.currentSession?.id;
		if (!currentSessionId) return;

		// Check for conflicts before showing confirmation
		try {
			const conflictCheck = await snapshotService.checkConflicts(
				node.checkpoint.messageId,
				currentSessionId
			);

			if (conflictCheck.hasConflicts) {
				// Show conflict resolution modal
				conflictList = conflictCheck.conflicts;
				conflictResolutions = {};
				expandedDiffs = new Set();
				// Default all to 'keep' (safer default)
				for (const conflict of conflictCheck.conflicts) {
					conflictResolutions[conflict.filepath] = 'keep';
				}
				conflictCheckingNode = node;
				showConflictModal = true;
			} else {
				// No conflicts - show simple confirmation dialog
				pendingNode = node;
				showConfirmDialog = true;
			}
		} catch (error) {
			debug.error('snapshot', 'Error checking conflicts:', error);
			// Fallback to simple confirmation on error
			pendingNode = node;
			showConfirmDialog = true;
		}
	}

	// Execute restore after conflict resolution
	async function confirmConflictRestore() {
		if (!conflictCheckingNode) return;

		showConflictModal = false;
		const node = conflictCheckingNode;
		conflictCheckingNode = null;

		await executeRestore(node, conflictResolutions);
	}

	// Execute restore after simple confirmation
	async function confirmRestore() {
		if (!pendingNode) return;
		await executeRestore(pendingNode);
	}

	// Shared restore execution logic
	async function executeRestore(node: GraphNode, resolutions?: ConflictResolution) {
		processingAction = true;

		// Capture current state for animation
		rebuildGraph(true);

		// Update current node immediately to prevent flicker
		const previousCurrentId = timelineData?.currentHeadId;
		if (timelineData) {
			timelineData.currentHeadId = node.id;
			graphNodes = graphNodes.map(n => ({
				...n,
				isCurrent: n.id === node.id
			}));
		}

		try {
			if (!sessionState.currentSession?.id) {
				throw new Error('No active session');
			}

			await snapshotService.restore(
				node.checkpoint.messageId,
				sessionState.currentSession.id,
				resolutions
			);

			// Reload messages
			await loadMessagesForSession(sessionState.currentSession.id);

			// Reload timeline
			const newTimelineData = await snapshotService.getTimeline(sessionState.currentSession.id);

			if (JSON.stringify(newTimelineData.nodes) !== JSON.stringify(timelineData?.nodes)) {
				timelineData = newTimelineData;
				rebuildGraph();

				// Start animation
				animationState.isAnimating = true;
				animationState.restoringNodeId = node.id;

				startAnimation(
					node.id,
					(progress) => {
						animationState.progress = progress;
					},
					() => {
						animationState.isAnimating = false;
						animationState.restoringNodeId = null;
						animationState.progress = 0;
						animationState.oldNodePositions.clear();
						animationState.oldNodeStyles.clear();
						animationState.oldVersionGroups = [];
					}
				);
			} else {
				if (timelineData) {
					timelineData.currentHeadId = newTimelineData.currentHeadId;
				}
				rebuildGraph();
			}
		} catch (error) {
			// Revert optimistic update on error
			if (timelineData && previousCurrentId) {
				timelineData.currentHeadId = previousCurrentId;
				graphNodes = graphNodes.map(n => ({
					...n,
					isCurrent: n.id === previousCurrentId
				}));
			}

			debug.error('snapshot', 'Restore error:', error);
			addNotification({
				type: 'error',
				title: 'Restore Failed',
				message: error instanceof Error ? error.message : 'Unknown error',
				duration: 5000
			});
		} finally {
			processingAction = false;
			pendingNode = null;
		}
	}

	function getTruncatedMessage(text: string, maxLength: number = 85): string {
		if (text.length <= maxLength) return text;
		return text.substring(0, maxLength) + '...';
	}

	function toggleDiff(filepath: string) {
		const next = new Set(expandedDiffs);
		if (next.has(filepath)) {
			next.delete(filepath);
		} else {
			next.add(filepath);
		}
		expandedDiffs = next;
	}

	function formatFilePath(filepath: string): string {
		const parts = filepath.split('/');
		if (parts.length <= 2) return filepath;
		return '.../' + parts.slice(-2).join('/');
	}

	function formatTimestamp(iso: string): string {
		try {
			const date = new Date(iso);
			return date.toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}
</script>

<Modal bind:isOpen={isOpen} bind:contentRef={scrollContainer} size="lg" onClose={onClose}>
	{#snippet header()}
		<div class="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
			<div class="flex items-center gap-3">
				<h2 id="modal-title" class="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100">
					Restore Checkpoint
				</h2>
				{#if readonly}
					<div class="flex items-center gap-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
						<Icon name="lucide:eye" class="w-3 h-3 text-purple-600 dark:text-purple-400" />
						<span class="text-xs text-purple-600 dark:text-purple-400">View Only</span>
					</div>
				{:else if processingAction}
					<div class="flex items-center gap-2 px-3 py-1.5 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
						<div class="animate-spin rounded-full h-3 w-3 border-b-2 border-violet-600"></div>
						<span class="text-xs text-violet-600 dark:text-violet-400">Restoring...</span>
					</div>
				{:else if appState.isLoading}
					<div class="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
						{#if appState.isWaitingInput}
							<Icon name="lucide:message-circle-question-mark" class="w-3 h-3 text-amber-600 dark:text-amber-400" />
							<span class="text-xs text-amber-600 dark:text-amber-400">Waiting for input...</span>
						{:else}
							<Icon name="lucide:loader" class="w-3 h-3 text-amber-600 dark:text-amber-400 animate-spin" />
							<span class="text-xs text-amber-600 dark:text-amber-400">Chat in progress...</span>
						{/if}
					</div>
				{/if}
			</div>

			<button
				type="button"
				class="p-1.5 md:p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
				onclick={onClose}
				aria-label="Close modal"
			>
				<svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/snippet}

	{#snippet children()}
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
				<span class="ml-3 text-slate-600 dark:text-slate-400">Loading timeline...</span>
			</div>
		{:else if timelineData && graphNodes.length > 0}
			<div class="transition-opacity duration-200" style="opacity: {isContentReady ? 1 : 0}">
				<!-- SVG Timeline Graph -->
				<TimelineGraph
					{graphNodes}
					{graphEdges}
					{versionGroups}
					{svgWidth}
					{svgHeight}
					{animationState}
					{readonly}
					isDisabled={appState.isLoading}
					onNodeClick={handleNodeClick}
				/>
			</div>
		{:else if timelineData && graphNodes.length === 0}
			<div class="text-center py-12">
				<Icon
					name="lucide:git-branch"
					class="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3"
				/>
				<p class="text-slate-600 dark:text-slate-400">No checkpoints yet</p>
				<p class="text-sm text-slate-500 dark:text-slate-500 mt-1">
					Checkpoints are created automatically with each message
				</p>
			</div>
		{:else}
			<div class="text-center py-12">
				<Icon
					name="lucide:circle-x"
					class="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3"
				/>
				<p class="text-slate-600 dark:text-slate-400">Failed to load timeline</p>
			</div>
		{/if}
	{/snippet}
</Modal>

<!-- Simple Confirmation Dialog (no conflicts) -->
<Dialog
	bind:isOpen={showConfirmDialog}
	type="warning"
	title="Restore Checkpoint"
	message={pendingNode
		? `Are you sure you want to restore to this checkpoint?\n"${getTruncatedMessage(pendingNode.checkpoint.messageText)}"\nThis will restore your files to this point within this session.`
		: ''}
	confirmText="Restore"
	cancelText="Cancel"
	showCancel={true}
	onConfirm={confirmRestore}
	onClose={() => {
		showConfirmDialog = false;
		pendingNode = null;
	}}
/>

<!-- Conflict Resolution Modal -->
<Modal
	bind:isOpen={showConflictModal}
	size="md"
	onClose={() => {
		showConflictModal = false;
		conflictCheckingNode = null;
		conflictList = [];
		conflictResolutions = {};
		expandedDiffs = new Set();
	}}
>
	{#snippet header()}
		<div class="flex items-start gap-4 px-4 py-3 md:px-6 md:py-4">
			<div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3">
				<Icon name="lucide:triangle-alert" class="w-6 h-6 text-amber-600 dark:text-amber-400" />
			</div>
			<div class="flex-1">
				<h3 id="modal-title" class="text-lg font-semibold text-slate-900 dark:text-slate-100">
					Restore Conflict Detected
				</h3>
				<p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
					The following files were also modified in other sessions. Choose how to handle each file:
				</p>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="space-y-3">
			{#each conflictList as conflict}
				<div class="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
					<div class="flex items-center justify-between gap-2 mb-2">
						<div class="flex items-center gap-2 min-w-0">
							<Icon name="lucide:file-warning" class="w-4 h-4 text-amber-500 shrink-0" />
							<span class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" title={conflict.filepath}>
								{formatFilePath(conflict.filepath)}
							</span>
						</div>
						{#if conflict.restoreContent && conflict.currentContent}
							<button
								class="shrink-0 flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors
									{expandedDiffs.has(conflict.filepath)
										? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600'
										: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
									}"
								onclick={() => toggleDiff(conflict.filepath)}
							>
								<Icon name="lucide:git-compare" class="w-3 h-3" />
								{expandedDiffs.has(conflict.filepath) ? 'Hide Diff' : 'View Diff'}
							</button>
						{/if}
					</div>
					<p class="text-xs text-slate-500 dark:text-slate-400 mb-2">
						Modified by another session on {formatTimestamp(conflict.modifiedAt)}
					</p>

					<!-- Diff View -->
					{#if expandedDiffs.has(conflict.filepath) && conflict.restoreContent && conflict.currentContent}
						<div class="mb-3">
							<div class="flex items-center gap-3 mb-1.5 text-3xs text-slate-500 dark:text-slate-400">
								<span class="flex items-center gap-1">
									<span class="inline-block w-2 h-2 rounded-sm bg-red-400"></span>
									Restore version
								</span>
								<span class="flex items-center gap-1">
									<span class="inline-block w-2 h-2 rounded-sm bg-green-400"></span>
									Current version
								</span>
							</div>
							<DiffBlock
								oldString={conflict.restoreContent}
								newString={conflict.currentContent}
							/>
						</div>
					{/if}

					<div class="flex gap-2">
						<button
							class="relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
							onclick={() => { conflictResolutions[conflict.filepath] = 'restore'; }}
						>
							{#if conflictResolutions[conflict.filepath] === 'restore'}
								<span class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-green-500 dark:bg-green-600 border-2 border-white dark:border-slate-900">
									<Icon name="lucide:check" class="w-3 h-3 text-white" />
								</span>
							{/if}
							Restore
						</button>
						<button
							class="relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
							onclick={() => { conflictResolutions[conflict.filepath] = 'keep'; }}
						>
							{#if conflictResolutions[conflict.filepath] === 'keep'}
								<span class="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-green-500 dark:bg-green-600 border-2 border-white dark:border-slate-900">
									<Icon name="lucide:check" class="w-3 h-3 text-white" />
								</span>
							{/if}
							Keep Current
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/snippet}

	{#snippet footer()}
		<button
			onclick={() => {
				showConflictModal = false;
				conflictCheckingNode = null;
				conflictList = [];
				conflictResolutions = {};
				expandedDiffs = new Set();
			}}
			class="px-6 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 font-semibold"
		>
			Cancel
		</button>
		<button
			onclick={confirmConflictRestore}
			class="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all duration-200 font-semibold"
		>
			Proceed with Restore
		</button>
	{/snippet}
</Modal>
