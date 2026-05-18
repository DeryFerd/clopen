import type { DeviceSize, Rotation } from '$frontend/utils/preview-constants';
import { registerProjectCleanup } from '$frontend/utils/project-state-cleanup';

export interface ProjectPreviewState {
	isOpen: boolean;
	url: string;
	mode: 'split' | 'tab';
	deviceSize: DeviceSize;
	rotation: Rotation;
}

const projectPreviewState = new Map<string, ProjectPreviewState>();

export function getProjectPreviewState(projectId: string): ProjectPreviewState | undefined {
	return projectPreviewState.get(projectId);
}

export function setProjectPreviewState(projectId: string, state: ProjectPreviewState): void {
	projectPreviewState.set(projectId, state);
}

export function clearProjectPreviewState(projectId: string): void {
	projectPreviewState.delete(projectId);
}

registerProjectCleanup((projectId) => {
	clearProjectPreviewState(projectId);
});
