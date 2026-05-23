/**
 * Tunnel Operations
 *
 * HTTP endpoints for tunnel management:
 * - Quick tunnel: start/stop with random URL
 * - Remote tunnel: start/stop dashboard-managed tunnels
 * - Local tunnel: auth, create, delete, ingress, route-dns, start/stop
 */

import { t } from 'elysia';
import { createRouter } from '$shared/utils/ws-server';
import { globalTunnelManager } from '../../tunnel/global-tunnel-manager';
import {
	getRemoteTunnelConfigById,
	getLocalTunnelConfigById,
	addLocalTunnelConfig,
	removeLocalTunnelConfig,
	addLocalTunnelIngress,
	removeLocalTunnelIngress,
	getAuthorizedZone,
	setAuthorizedZone,
	clearAuthorizedZone
} from '../../tunnel/tunnel-config';
import { tunnelAccessLogger } from '../../tunnel/tunnel-access-log';
import { tunnelRateLimiter } from '../../tunnel/tunnel-rate-limiter';
import { debug } from '$shared/utils/logger';
import { ws } from '$backend/utils/ws';

// Wire up ingress update callback to push via WS
globalTunnelManager.setRemoteIngressUpdateCallback((configId, ingress) => {
	ws.emit.global('tunnel:remote:ingress-update', { configId, ingress });
});

// Wire up status changed callback to push tunnel list via WS
globalTunnelManager.setStatusChangedCallback(() => {
	const tunnels = globalTunnelManager.getActiveTunnels();
	ws.emit.global('tunnel:status-changed', { tunnels });
});

export const operationsHandler = createRouter()

	// ═══════════════════════════════════════
	// Quick Tunnel
	// ═══════════════════════════════════════

	.http('tunnel:quick:start', {
		data: t.Object({
			port: t.Number({ minimum: 1, maximum: 65535 }),
			autoStopMinutes: t.Optional(t.Number({ minimum: 0 }))
		}),
		response: t.Any()
	}, async ({ data, conn }) => {
		const { port, autoStopMinutes = 60 } = data;
		const userId = ws.getUserId(conn);
		
		// Check rate limit
		const rateLimit = tunnelRateLimiter.canCreateTunnel(userId);
		if (!rateLimit.allowed) {
			throw new Error(`Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.`);
		}
		
		debug.log('tunnel', `[WS] Quick tunnel start: port=${port}, autoStop=${autoStopMinutes}, user=${userId}`);

		const result = await globalTunnelManager.startQuickTunnel(port, autoStopMinutes);
		
		// Record rate limit and access log
		tunnelRateLimiter.recordTunnelCreation(userId);
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: `quick-${port}`,
			action: 'created',
			userId,
			port,
			publicUrl: result.publicUrl,
			metadata: { autoStopMinutes }
		});
		
		return result;
	})

	.http('tunnel:quick:stop', {
		data: t.Object({
			port: t.Number()
		}),
		response: t.Object({ stopped: t.Boolean() })
	}, async ({ data, conn }) => {
		const userId = ws.getUserId(conn);
		
		await globalTunnelManager.stopQuickTunnel(data.port);
		
		// Log stop action
		tunnelAccessLogger.log({
			tunnelType: 'quick',
			tunnelId: `quick-${data.port}`,
			action: 'stopped',
			userId,
			port: data.port
		});
		
		return { stopped: true };
	})

	// ═══════════════════════════════════════
	// Remote Tunnel (Dashboard-managed)
	// ═══════════════════════════════════════

	.http('tunnel:remote:start', {
		data: t.Object({
			configId: t.String({ minLength: 1 })
		}),
		response: t.Any()
	}, async ({ data, conn }) => {
		const config = getRemoteTunnelConfigById(data.configId);
		if (!config) throw new Error('Remote tunnel config not found');
		
		const userId = ws.getUserId(conn);
		
		// Check rate limit
		const rateLimit = tunnelRateLimiter.canCreateTunnel(userId);
		if (!rateLimit.allowed) {
			throw new Error(`Rate limit exceeded. Please try again in ${rateLimit.retryAfter} seconds.`);
		}

		debug.log('tunnel', `[WS] Remote tunnel start: ${config.label}, user=${userId}`);
		const result = await globalTunnelManager.startRemoteTunnel(config);
		
		// Record rate limit and access log
		tunnelRateLimiter.recordTunnelCreation(userId);
		tunnelAccessLogger.log({
			tunnelType: 'remote',
			tunnelId: config.id,
			action: 'started',
			userId,
			metadata: { label: config.label }
		});
		
		return result;
	})

	.http('tunnel:remote:stop', {
		data: t.Object({
			configId: t.String({ minLength: 1 })
		}),
		response: t.Object({ stopped: t.Boolean() })
	}, async ({ data, conn }) => {
		const userId = ws.getUserId(conn);
		
		await globalTunnelManager.stopRemoteTunnel(data.configId);
		
		// Log stop action
		tunnelAccessLogger.log({
			tunnelType: 'remote',
			tunnelId: data.configId,
			action: 'stopped',
			userId
		});
		
		return { stopped: true };
	})

	.http('tunnel:remote:ingress', {
		data: t.Object({
			configId: t.String({ minLength: 1 })
		}),
		response: t.Object({
			ingress: t.Array(t.Object({
				hostname: t.Optional(t.String()),
				service: t.String()
			}))
		})
	}, async ({ data }) => {
		const ingress = globalTunnelManager.getRemoteTunnelIngress(data.configId);
		return { ingress };
	})

	// ═══════════════════════════════════════
	// Local Tunnel (Locally-managed)
	// ═══════════════════════════════════════

	.http('tunnel:local:auth-status', {
		data: t.Object({}),
		response: t.Object({
			authenticated: t.Boolean(),
			certPath: t.String(),
			zone: t.Nullable(t.String())
		})
	}, async () => {
		const auth = globalTunnelManager.checkCloudflaredAuth();
		const zone = getAuthorizedZone();
		return { ...auth, zone };
	})

	.http('tunnel:local:logout', {
		data: t.Object({}),
		response: t.Object({ success: t.Boolean() })
	}, async () => {
		globalTunnelManager.logoutCloudflared();
		clearAuthorizedZone();
		return { success: true };
	})

	.http('tunnel:local:set-zone', {
		data: t.Object({
			zone: t.String({ minLength: 1 })
		}),
		response: t.Object({ success: t.Boolean(), zone: t.String() })
	}, async ({ data }) => {
		setAuthorizedZone(data.zone);
		return { success: true, zone: data.zone };
	})

	// Login is event-driven (push URL back via WS event)
	.on('tunnel:local:login-start', {
		data: t.Object({})
	}, async ({ conn }) => {
		const userId = ws.getUserId(conn);

		await globalTunnelManager.loginCloudflared(
			(url) => {
				ws.emit.user(userId, 'tunnel:local:login-url', { url });
			},
			() => {
				ws.emit.user(userId, 'tunnel:local:login-complete', {});
			},
			(error) => {
				ws.emit.user(userId, 'tunnel:local:login-error', { message: error });
			}
		);
	})

	.on('tunnel:local:login-cancel', {
		data: t.Object({})
	}, async () => {
		globalTunnelManager.cancelLogin();
	})

	.http('tunnel:local:create', {
		data: t.Object({
			name: t.String({ minLength: 1, maxLength: 100 })
		}),
		response: t.Object({
			id: t.String(),
			name: t.String(),
			tunnelId: t.String()
		})
	}, async ({ data }) => {
		debug.log('tunnel', `[WS] Creating local tunnel: ${data.name}`);

		const result = await globalTunnelManager.createLocalTunnel(data.name);
		const config = addLocalTunnelConfig(data.name, result.tunnelId, result.credentialsFile);

		return { id: config.id, name: config.name, tunnelId: config.tunnelId };
	})

	.http('tunnel:local:delete', {
		data: t.Object({
			id: t.String({ minLength: 1 })
		}),
		response: t.Object({ success: t.Boolean() })
	}, async ({ data }) => {
		const config = getLocalTunnelConfigById(data.id);
		if (!config) throw new Error('Local tunnel config not found');

		// Stop if running
		if (globalTunnelManager.isLocalTunnelActive(data.id)) {
			await globalTunnelManager.stopLocalTunnel(data.id);
		}

		// Delete from Cloudflare
		try {
			await globalTunnelManager.deleteLocalTunnel(config.tunnelId, config.credentialsFile);
		} catch (error) {
			debug.warn('tunnel', `Could not delete tunnel from Cloudflare (may already be deleted):`, error);
		}

		// Remove from config and cleanup files
		removeLocalTunnelConfig(data.id);
		globalTunnelManager.cleanupLocalTunnelFiles(config.tunnelId);
		return { success: true };
	})

	.http('tunnel:local:ingress:add', {
		data: t.Object({
			id: t.String({ minLength: 1 }),
			hostname: t.String({ minLength: 1 }),
			service: t.String({ minLength: 1 })
		}),
		response: t.Object({
			success: t.Boolean(),
			ingress: t.Array(t.Object({
				hostname: t.String(),
				service: t.String()
			})),
			dnsRouted: t.Boolean(),
			dnsError: t.Nullable(t.String())
		})
	}, async ({ data }) => {
		const tunnelConfig = getLocalTunnelConfigById(data.id);
		if (!tunnelConfig) throw new Error('Local tunnel config not found');

		// Add ingress rule
		const config = addLocalTunnelIngress(data.id, data.hostname, data.service);
		if (!config) throw new Error('Failed to add ingress rule');

		// Auto route DNS using tunnel UUID (more reliable than name)
		let dnsRouted = false;
		let dnsError: string | null = null;
		try {
			await globalTunnelManager.routeDns(tunnelConfig.tunnelId, data.hostname);
			dnsRouted = true;
			debug.log('tunnel', `DNS routed for ${data.hostname} -> tunnel ${tunnelConfig.tunnelId}`);
		} catch (error) {
			dnsError = error instanceof Error ? error.message : String(error);
			debug.warn('tunnel', `Auto route-dns for ${data.hostname} failed:`, dnsError);
		}

		return { success: true, ingress: config.ingress, dnsRouted, dnsError };
	})

	.http('tunnel:local:ingress:remove', {
		data: t.Object({
			id: t.String({ minLength: 1 }),
			hostname: t.String({ minLength: 1 })
		}),
		response: t.Object({
			success: t.Boolean(),
			ingress: t.Array(t.Object({
				hostname: t.String(),
				service: t.String()
			}))
		})
	}, async ({ data }) => {
		const config = removeLocalTunnelIngress(data.id, data.hostname);
		if (!config) throw new Error('Local tunnel config not found');

		// Regenerate config.yml to stay in sync
		globalTunnelManager.writeLocalTunnelConfig(config);

		return { success: true, ingress: config.ingress };
	})

	.http('tunnel:local:start', {
		data: t.Object({
			id: t.String({ minLength: 1 })
		}),
		response: t.Any()
	}, async ({ data }) => {
		const config = getLocalTunnelConfigById(data.id);
		if (!config) throw new Error('Local tunnel config not found');

		debug.log('tunnel', `[WS] Starting local tunnel: ${config.name}`);
		const result = await globalTunnelManager.startLocalTunnel(config);
		return result;
	})

	.http('tunnel:local:stop', {
		data: t.Object({
			id: t.String({ minLength: 1 })
		}),
		response: t.Object({ stopped: t.Boolean() })
	}, async ({ data }) => {
		await globalTunnelManager.stopLocalTunnel(data.id);
		return { stopped: true };
	})

	// ═══════════════════════════════════════
	// Global Status
	// ═══════════════════════════════════════

	.http('tunnel:status', {
		data: t.Object({}),
		response: t.Object({
			tunnels: t.Array(t.Any())
		})
	}, async () => {
		return { tunnels: globalTunnelManager.getActiveTunnels() };
	})

	// ═══════════════════════════════════════
	// Monitoring & Access Control (Admin)
	// ═══════════════════════════════════════

	.http('tunnel:access-logs', {
		data: t.Object({
			limit: t.Optional(t.Number({ minimum: 1, maximum: 1000 }))
		}),
		response: t.Object({
			logs: t.Array(t.Any())
		})
	}, async ({ data, conn }) => {
		// Admin only
		const role = ws.getRole(conn);
		if (role !== 'admin') {
			throw new Error('Access denied: Admin role required');
		}
		
		const logs = tunnelAccessLogger.getRecentLogs(data.limit || 100);
		return { logs };
	})

	.http('tunnel:statistics', {
		data: t.Object({}),
		response: t.Object({
			totalCreated: t.Number(),
			totalActive: t.Number(),
			byType: t.Record(t.String(), t.Number()),
			byUser: t.Record(t.String(), t.Number())
		})
	}, async ({ conn }) => {
		// Admin only
		const role = ws.getRole(conn);
		if (role !== 'admin') {
			throw new Error('Access denied: Admin role required');
		}
		
		return tunnelAccessLogger.getStatistics();
	})

	.http('tunnel:rate-limit-status', {
		data: t.Object({
			userId: t.Optional(t.String())
		}),
		response: t.Object({
			count: t.Number(),
			limit: t.Number(),
			resetAt: t.Nullable(t.Number())
		})
	}, async ({ data, conn }) => {
		const role = ws.getRole(conn);
		const requestingUserId = ws.getUserId(conn);
		
		// Users can check their own status, admins can check any user
		const targetUserId = data.userId || requestingUserId;
		if (role !== 'admin' && targetUserId !== requestingUserId) {
			throw new Error('Access denied: Can only check your own rate limit status');
		}
		
		return tunnelRateLimiter.getStatus(targetUserId);
	})

	// ═══════════════════════════════════════
	// Event declarations (Server → Client)
	// ═══════════════════════════════════════

	.emit('tunnel:status-changed', t.Object({
		tunnels: t.Array(t.Any())
	}))

	.emit('tunnel:remote:ingress-update', t.Object({
		configId: t.String(),
		ingress: t.Array(t.Object({
			hostname: t.Optional(t.String()),
			service: t.String()
		}))
	}))

	.emit('tunnel:local:login-url', t.Object({
		url: t.String()
	}))

	.emit('tunnel:local:login-complete', t.Object({}))

	.emit('tunnel:local:login-error', t.Object({
		message: t.String()
	}));
