import { t } from 'elysia';
import { createRouter } from '$shared/utils/ws-server';
import { needsSetup, getUserById, getAuthMode, isOnboardingComplete } from '$backend/auth/auth-service';
import { ws } from '$backend/utils/ws';

export const statusHandler = createRouter()
	.http('auth:status', {
		data: t.Object({}),
		response: t.Object({
			needsSetup: t.Boolean(),
			onboardingComplete: t.Boolean(),
			authenticated: t.Boolean(),
			authMode: t.Union([t.Literal('none'), t.Literal('required')]),
			user: t.Optional(t.Object({
				id: t.String(),
				name: t.String(),
				role: t.Union([t.Literal('admin'), t.Literal('member')]),
				color: t.String(),
				avatar: t.String(),
				createdAt: t.String()
			}))
		})
	}, async ({ conn }) => {
		const setup = needsSetup();
		const onboardingDone = isOnboardingComplete();
		const authMode = getAuthMode();
		const authenticated = ws.isAuthenticated(conn);

		let user = undefined;
		if (authenticated) {
			const state = ws.getConnectionState(conn);
			if (state?.userId) {
				const dbUser = getUserById(state.userId);
				if (dbUser) {
					user = dbUser;
				}
			}
		}

		return { needsSetup: setup, onboardingComplete: onboardingDone, authenticated, authMode, user };
	});
