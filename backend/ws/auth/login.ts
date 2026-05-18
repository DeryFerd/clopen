import { t } from 'elysia';
import { createRouter } from '$shared/utils/ws-server';
import {
	createAdmin,
	getAuthMode,
	loginWithToken,
	createUserFromInvite,
	logout,
	logoutAllSessions,
	validateInviteToken,
	regeneratePAT,
	updateUserName,
	createOrGetNoAuthAdmin,
	needsSetup
} from '$backend/auth/auth-service';
import { settingsQueries, auditLogQueries } from '$backend/database/queries';
import { getTokenType } from '$backend/auth/tokens';
import { authRateLimiter } from '$backend/auth/rate-limiter';
import { ws } from '$backend/utils/ws';

const authUserSchema = t.Object({
	id: t.String(),
	name: t.String(),
	role: t.Union([t.Literal('admin'), t.Literal('member')]),
	color: t.String(),
	avatar: t.String(),
	createdAt: t.String()
});

export const loginHandler = createRouter()
	// Setup — create first admin (only works when no users exist)
	.http('auth:setup', {
		data: t.Object({
			name: t.String({ minLength: 1 })
		}),
		response: t.Object({
			user: authUserSchema,
			sessionToken: t.String(),
			personalAccessToken: t.String(),
			expiresAt: t.String()
		})
	}, async ({ data, conn }) => {
		const result = createAdmin(data.name);

		// Save authMode to system settings
		const currentSettings = settingsQueries.get('system:settings');
		const parsed = currentSettings?.value
			? (typeof currentSettings.value === 'string' ? JSON.parse(currentSettings.value) : currentSettings.value)
			: {};
		parsed.authMode = 'required';
		settingsQueries.set('system:settings', JSON.stringify(parsed));

		// Set auth on connection
		const tokenHash = (await import('$backend/auth/tokens')).hashToken(result.sessionToken);
		ws.setAuth(conn, result.user.id, result.user.role, tokenHash);

		return result;
	})

	// Setup no-auth mode — create default admin, save authMode setting
	.http('auth:setup-no-auth', {
		data: t.Object({}),
		response: t.Object({
			user: authUserSchema,
			sessionToken: t.String(),
			expiresAt: t.String()
		})
	}, async ({ conn }) => {
		if (!needsSetup()) {
			throw new Error('Setup already completed.');
		}

		// Save authMode to system settings
		const currentSettings = settingsQueries.get('system:settings');
		const parsed = currentSettings?.value
			? (typeof currentSettings.value === 'string' ? JSON.parse(currentSettings.value) : currentSettings.value)
			: {};
		parsed.authMode = 'none';
		settingsQueries.set('system:settings', JSON.stringify(parsed));

		// Create or get default admin
		const result = createOrGetNoAuthAdmin();

		// Set auth on connection
		const tokenHash = (await import('$backend/auth/tokens')).hashToken(result.sessionToken);
		ws.setAuth(conn, result.user.id, result.user.role, tokenHash);

		return result;
	})

	// Auto-login for no-auth mode (returning visitors)
	.http('auth:auto-login-no-auth', {
		data: t.Object({}),
		response: t.Object({
			user: authUserSchema,
			sessionToken: t.String(),
			expiresAt: t.String()
		})
	}, async ({ conn }) => {
		if (getAuthMode() !== 'none') {
			throw new Error('Auto-login is only available in no-auth mode');
		}

		const result = createOrGetNoAuthAdmin();

		// Set auth on connection
		const tokenHash = (await import('$backend/auth/tokens')).hashToken(result.sessionToken);
		ws.setAuth(conn, result.user.id, result.user.role, tokenHash);

		return result;
	})

	// Login with token (PAT or session token)
	.http('auth:login', {
		data: t.Object({
			token: t.String({ minLength: 1 })
		}),
		response: t.Object({
			user: authUserSchema,
			sessionToken: t.String(),
			expiresAt: t.String()
		})
	}, async ({ data, conn }) => {
		const ip = ws.getRemoteAddress(conn);
		const tokenType = getTokenType(data.token);

		// Session tokens are re-authentication (reconnect) — skip rate limit entirely.
		// Only rate-limit PAT and unknown tokens (brute-force targets).
		const isRateLimited = tokenType !== 'session';

		if (isRateLimited) {
			const rateLimitError = authRateLimiter.check(ip, 'auth:login');
			if (rateLimitError) {
				throw new Error(rateLimitError);
			}
		}

		try {
			const result = loginWithToken(data.token);

			// Success — clear any rate limit record for this IP
			if (isRateLimited) {
				authRateLimiter.recordSuccess(ip);
			}

			auditLogQueries.logEvent({
				userId: result.user.id,
				actorUserId: result.user.id,
				eventType: 'auth:login',
				eventDetails: `User ${result.user.name} logged in via ${tokenType} token`,
				ipAddress: ip
			});

			ws.setAuth(conn, result.user.id, result.user.role, result.tokenHash);

			return {
				user: result.user,
				sessionToken: result.sessionToken,
				expiresAt: result.expiresAt
			};
		} catch (err) {
			// Record failure for rate limiting (only non-session tokens)
			if (isRateLimited) {
				authRateLimiter.recordFailure(ip, 'auth:login');
			}
			throw err;
		}
	})

	// Accept invite — create user from invite token
	.http('auth:accept-invite', {
		data: t.Object({
			inviteToken: t.String({ minLength: 1 }),
			name: t.String({ minLength: 1 })
		}),
		response: t.Object({
			user: authUserSchema,
			sessionToken: t.String(),
			personalAccessToken: t.String(),
			expiresAt: t.String()
		})
	}, async ({ data, conn }) => {
		const ip = ws.getRemoteAddress(conn);

		// Rate limit check
		const rateLimitError = authRateLimiter.check(ip, 'auth:accept-invite');
		if (rateLimitError) {
			throw new Error(rateLimitError);
		}

		try {
			const result = createUserFromInvite(data.inviteToken, data.name);

			authRateLimiter.recordSuccess(ip);

			// Set auth on connection
			const tokenHash = (await import('$backend/auth/tokens')).hashToken(result.sessionToken);
			ws.setAuth(conn, result.user.id, result.user.role, tokenHash);

			// Notify admin sessions so their User Management list refreshes.
			ws.emit.global('auth:users-changed', { type: 'added', userId: result.user.id });

			return result;
		} catch (err) {
			authRateLimiter.recordFailure(ip, 'auth:accept-invite');
			throw err;
		}
	})

	// Validate invite token (for UI, doesn't consume the invite)
	.http('auth:validate-invite', {
		data: t.Object({
			inviteToken: t.String({ minLength: 1 })
		}),
		response: t.Object({
			valid: t.Boolean(),
			error: t.Optional(t.String())
		})
	}, async ({ data, conn }) => {
		const ip = ws.getRemoteAddress(conn);

		const rateLimitError = authRateLimiter.check(ip, 'auth:validate-invite');
		if (rateLimitError) {
			return { valid: false, error: rateLimitError };
		}

		const result = validateInviteToken(data.inviteToken);

		// Record failure if invalid token (probing)
		if (!result.valid) {
			authRateLimiter.recordFailure(ip, 'auth:validate-invite');
		}

		return { valid: result.valid, error: result.error };
	})

	// Logout — clear session
	.http('auth:logout', {
		data: t.Object({}),
		response: t.Object({ success: t.Boolean() })
	}, async ({ conn }) => {
		const state = ws.getConnectionState(conn);
		const userId = state?.userId;
		if (state?.sessionTokenHash) logout(state.sessionTokenHash);
		ws.clearAuth(conn);
		if (userId) {
			auditLogQueries.logEvent({
				userId,
				actorUserId: userId,
				eventType: 'auth:logout',
				eventDetails: 'User logged out',
				ipAddress: ws.getRemoteAddress(conn)
			});
		}
		return { success: true };
	})

	// Regenerate Personal Access Token
	.http('auth:regenerate-pat', {
		data: t.Object({}),
		response: t.Object({
			personalAccessToken: t.String()
		})
	}, async ({ conn }) => {
		const userId = ws.getUserId(conn);
		const pat = regeneratePAT(userId);
		return { personalAccessToken: pat };
	})

	// Logout all sessions (admin only — used when switching auth mode)
	.http('auth:logout-all', {
		data: t.Object({}),
		response: t.Object({ count: t.Number() })
	}, async ({ conn }) => {
		const adminId = ws.getUserId(conn);
		const count = logoutAllSessions();
		ws.emit.global('auth:force-logout', { reason: 'Auth mode changed' });
		ws.clearAllAuth();
		auditLogQueries.logEvent({
			userId: adminId,
			actorUserId: adminId,
			eventType: 'auth:logout-all',
			eventDetails: `Admin logged out all sessions (${count} sessions cleared)`,
			ipAddress: ws.getRemoteAddress(conn)
		});
		return { count };
	})

	// Update display name (authenticated user)
	.http('auth:update-name', {
		data: t.Object({
			newName: t.String({ minLength: 1 })
		}),
		response: authUserSchema
	}, async ({ data, conn }) => {
		const userId = ws.getUserId(conn);
		return updateUserName(userId, data.newName);
	});
