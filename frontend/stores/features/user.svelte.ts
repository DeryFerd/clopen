/**
 * User Store - Svelte 5 Runes
 *
 * Delegates to auth store for user identity.
 * Kept for backward compatibility with components that import userStore.
 */

import { authStore } from './auth.svelte';
import { debug } from '$shared/utils/logger';
import ws from '$frontend/utils/ws';

// Re-export user type from auth store
export type { AuthUser as AnonymousUser } from './auth.svelte';

// User store (delegates to auth store)
export const userStore = {
	get currentUser() {
		const user = authStore.currentUser;
		if (!user) return null;
		// Return in the shape expected by existing components
		return {
			id: user.id,
			name: user.name,
			color: user.color,
			avatar: user.avatar,
			createdAt: user.createdAt
		};
	},

	get isInitializing() {
		return authStore.authState === 'loading';
	},

	// No-op: auth store handles initialization before WorkspaceLayout mounts
	async initialize() {
		debug.log('user', 'initialize() called — auth store handles this');
	},

	// Update user name via auth store
	async updateName(newName: string): Promise<boolean> {
		try {
			await authStore.updateName(newName);
			return true;
		} catch (error) {
			debug.error('user', 'Failed to update user name:', error);
			return false;
		}
	},

	// No-op: user data comes from auth store
	refresh() {
		debug.log('user', 'refresh() called — user data comes from auth store');
	}
};
