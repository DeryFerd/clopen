/**
 * Default backend cleanup handlers for fully removed projects.
 */
import { disposeProjectEngines } from '../engine';
import { projectContextService } from '../mcp/project-context';
import { fileWatcher } from '../files/file-watcher';
import { registerProjectCleanup } from './project-cleanup-registry';

registerProjectCleanup({
	name: 'engine',
	run: (projectId) => disposeProjectEngines(projectId)
});

registerProjectCleanup({
	name: 'mcp-context',
	run: (projectId) => projectContextService.clearByProjectId(projectId)
});

registerProjectCleanup({
	name: 'file-watcher',
	run: (projectId) => {
		fileWatcher.stopWatching(projectId);
	}
});
