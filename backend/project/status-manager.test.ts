import { describe, expect, test } from 'bun:test';
import {
	clearProjectPresence,
	getProjectStatusData,
	updateUserPresence
} from './status-manager';

async function getSingleProjectStatus(projectId: string) {
	const status = await getProjectStatusData(projectId);
	if (Array.isArray(status)) {
		throw new Error('expected single-project status payload');
	}
	return status;
}

describe('clearProjectPresence', () => {
	test('removes active users for the project from status data', async () => {
		updateUserPresence('proj-presence', 'user-1', 'Alice', 'join');

		const before = await getSingleProjectStatus('proj-presence');
		expect(before.activeUsers).toHaveLength(1);

		clearProjectPresence('proj-presence');

		const after = await getSingleProjectStatus('proj-presence');
		expect(after.activeUsers).toEqual([]);
	});

	test('is a no-op when the project has no presence entry', () => {
		expect(() => clearProjectPresence('proj-never-seen')).not.toThrow();
	});
});
