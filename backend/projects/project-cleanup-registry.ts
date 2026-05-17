import { debug } from '$shared/utils/logger';

export type ProjectCleanupHandler = {
	name: string;
	run: (projectId: string) => void | Promise<void>;
};

class ProjectCleanupRegistry {
	private handlers: ProjectCleanupHandler[] = [];

	register(handler: ProjectCleanupHandler): void {
		this.handlers.push(handler);
	}

	async runAll(projectId: string): Promise<void> {
		for (const handler of this.handlers) {
			try {
				await handler.run(projectId);
			} catch (error) {
				debug.warn('project', `Cleanup handler "${handler.name}" failed for ${projectId}:`, error);
			}
		}
	}

	/** @internal Test helper */
	_getHandlerNames(): string[] {
		return this.handlers.map((handler) => handler.name);
	}

	/** @internal Test helper */
	_clearHandlers(): void {
		this.handlers = [];
	}
}

export const projectCleanupRegistry = new ProjectCleanupRegistry();

export function registerProjectCleanup(handler: ProjectCleanupHandler): void {
	projectCleanupRegistry.register(handler);
}

export async function runProjectCleanups(projectId: string): Promise<void> {
	await projectCleanupRegistry.runAll(projectId);
}
