import { createRouter } from '$shared/utils/ws-server';
import { t } from 'elysia';
import { statusHandler } from './status';
import { loginHandler } from './login';
import { inviteHandler } from './invites';
import { usersHandler } from './users';

export const authRouter = createRouter()
	.merge(statusHandler)
	.merge(loginHandler)
	.merge(inviteHandler)
	.merge(usersHandler)
	// Declare auth:error event (emitted by auth gate in WSRouter)
	.emit('auth:error', t.Object({
		error: t.String(),
		blockedAction: t.String()
	}))
	// Declare auth:force-logout event (emitted when auth mode switches to required)
	.emit('auth:force-logout', t.Object({
		reason: t.String()
	}));
