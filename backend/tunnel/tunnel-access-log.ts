/**
 * Tunnel Access Logging
 *
 * Tracks tunnel creation, access, and usage for security monitoring.
 */

import { debug } from '$shared/utils/logger';

export interface TunnelAccessLogEntry {
	timestamp: string;
	tunnelType: 'quick' | 'remote' | 'local';
	tunnelId: string;
	action: 'created' | 'started' | 'stopped' | 'accessed' | 'deleted';
	userId: string | null;
	port?: number;
	publicUrl?: string;
	metadata?: Record<string, unknown>;
}

class TunnelAccessLogger {
	private logs: TunnelAccessLogEntry[] = [];
	private readonly MAX_LOGS = 1000; // Keep last 1000 entries in memory

	/**
	 * Log a tunnel access event
	 */
	log(entry: Omit<TunnelAccessLogEntry, 'timestamp'>): void {
		const logEntry: TunnelAccessLogEntry = {
			...entry,
			timestamp: new Date().toISOString()
		};

		this.logs.push(logEntry);

		// Trim old logs if exceeding max
		if (this.logs.length > this.MAX_LOGS) {
			this.logs = this.logs.slice(-this.MAX_LOGS);
		}

		// Also log to debug for immediate visibility
		debug.log('tunnel-access', `[${entry.action}] ${entry.tunnelType} tunnel ${entry.tunnelId}`, {
			userId: entry.userId,
			port: entry.port,
			publicUrl: entry.publicUrl
		});
	}

	/**
	 * Get recent tunnel access logs
	 */
	getRecentLogs(limit: number = 100): TunnelAccessLogEntry[] {
		return this.logs.slice(-limit);
	}

	/**
	 * Get logs for a specific tunnel
	 */
	getLogsForTunnel(tunnelId: string): TunnelAccessLogEntry[] {
		return this.logs.filter(log => log.tunnelId === tunnelId);
	}

	/**
	 * Get logs for a specific user
	 */
	getLogsForUser(userId: string): TunnelAccessLogEntry[] {
		return this.logs.filter(log => log.userId === userId);
	}

	/**
	 * Get tunnel creation statistics
	 */
	getStatistics(): {
		totalCreated: number;
		totalActive: number;
		byType: Record<string, number>;
		byUser: Record<string, number>;
	} {
		const stats = {
			totalCreated: 0,
			totalActive: 0,
			byType: {} as Record<string, number>,
			byUser: {} as Record<string, number>
		};

		// Count created tunnels
		const createdLogs = this.logs.filter(log => log.action === 'created');
		stats.totalCreated = createdLogs.length;

		// Count by type
		for (const log of createdLogs) {
			stats.byType[log.tunnelType] = (stats.byType[log.tunnelType] || 0) + 1;
		}

		// Count by user
		for (const log of createdLogs) {
			if (log.userId) {
				stats.byUser[log.userId] = (stats.byUser[log.userId] || 0) + 1;
			}
		}

		// Calculate currently active tunnels (created but not stopped)
		const tunnelStates = new Map<string, 'active' | 'stopped'>();
		for (const log of this.logs) {
			if (log.action === 'created' || log.action === 'started') {
				tunnelStates.set(log.tunnelId, 'active');
			} else if (log.action === 'stopped' || log.action === 'deleted') {
				tunnelStates.set(log.tunnelId, 'stopped');
			}
		}
		stats.totalActive = Array.from(tunnelStates.values()).filter(state => state === 'active').length;

		return stats;
	}

	/**
	 * Clear all logs (admin only)
	 */
	clearLogs(): void {
		this.logs = [];
		debug.log('tunnel-access', 'Access logs cleared');
	}
}

export const tunnelAccessLogger = new TunnelAccessLogger();
