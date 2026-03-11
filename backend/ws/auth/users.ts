import { t } from 'elysia';
import { createRouter } from '$shared/utils/ws-server';
import { listUsers, removeUser } from '$backend/auth/auth-service';

export const usersHandler = createRouter()
	// List all users (admin only — enforced by auth gate)
	.http('auth:list-users', {
		data: t.Object({}),
		response: t.Array(t.Object({
			id: t.String(),
			name: t.String(),
			role: t.Union([t.Literal('admin'), t.Literal('member')]),
			color: t.String(),
			avatar: t.String(),
			createdAt: t.String()
		}))
	}, async () => {
		return listUsers();
	})

	// Remove user (admin only)
	.http('auth:remove-user', {
		data: t.Object({
			userId: t.String({ minLength: 1 })
		}),
		response: t.Object({
			success: t.Boolean()
		})
	}, async ({ data }) => {
		removeUser(data.userId);
		return { success: true };
	});
