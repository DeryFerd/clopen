/**
 * Tunnel Audit Logger
 * 
 * Centralized logging of all tunnel operations to the persistent audit log.
 * Integrates with auditLogQueries.logEvent() for database storage.
 * 
 * Event types follow the pattern: tunnel:<operation>
 * - tunnel:quick:start
 * - tunnel:quick:stop
 * - tunnel:quick:restart
 * - tunnel:remote:start
 * - tunnel:remote:stop
 * - tunnel:local:start
 * - tunnel:local:stop
 */

import { auditLogQueries } from '$backend/database/queries/audit-log-queries';
import { debug } from '$shared/utils/logger';

/**
 * Metadata for tunnel operations
 */
export interface TunnelMetadata {
	/** IP address of the client making the request */
	ipAddress?: string;
	/** Auto-stop duration in minutes (for quick tunnels) */
	autoStopMinutes?: number;
	/** Whether this is a restart operation */
	restarted?: boolean;
}

/**
 * Event details stored in the audit log
 */
interface QuickTunnelDetails {
	tunnelType: 'quick';
	port: number;
	autoStopMinutes?: number;
	restarted?: boolean;
}

interface RemoteTunnelDetails {
	tunnelType: 'remote';
	configId: string;
	label: string;
}

interface LocalTunnelDetails {
	tunnelType: 'local';
	configId: string;
	name: string;
}

type TunnelEventDetails = QuickTunnelDetails | RemoteTunnelDetails | LocalTunnelDetails;

/**
 * Tunnel Audit Logger
 * 
 * Logs all tunnel operations to the persistent audit log table.
 */
export class TunnelAuditLogger {
	/**
	 * Log an event to the audit log
	 */
	private logEvent(
		userId: string,
		eventType: string,
		eventDetails: TunnelEventDetails,
		metadata: TunnelMetadata
	): void {
		try {
			auditLogQueries.logEvent({
				userId,
				actorUserId: userId,
				eventType,
				eventDetails: JSON.stringify(eventDetails),
				ipAddress: metadata.ipAddress
			});
			debug.log('tunnel', `Audit log: ${eventType} for user ${userId}`);
		} catch (error) {
			debug.error('tunnel', `Failed to log audit event ${eventType}:`, error);
		}
	}

	/**
	 * Log quick tunnel start
	 */
	logQuickTunnelStart(userId: string, port: number, metadata: TunnelMetadata): void {
		this.logEvent(
			userId,
			'tunnel:quick:start',
			{
				tunnelType: 'quick',
				port,
				autoStopMinutes: metadata.autoStopMinutes,
				restarted: false
			},
			metadata
		);
	}

	/**
	 * Log quick tunnel stop
	 */
	logQuickTunnelStop(userId: string, port: number, metadata: TunnelMetadata): void {
		this.logEvent(
			userId,
			'tunnel:quick:stop',
			{
				tunnelType: 'quick',
				port
			},
			metadata
		);
	}

	/**
	 * Log quick tunnel restart
	 */
	logQuickTunnelRestart(userId: string, port: number, metadata: TunnelMetadata): void {
		this.logEvent(
			userId,
			'tunnel:quick:restart',
			{
				tunnelType: 'quick',
				port,
				autoStopMinutes: metadata.autoStopMinutes,
				restarted: true
			},
			metadata
		);
	}

	/**
	 * Log remote tunnel start
	 */
	logRemoteTunnelStart(userId: string, configId: string, label: string, metadata: TunnelMetadata): void {
		this.logEvent(
			userId,
			'tunnel:remote:start',
			{
				tunnelType: 'remote',
				configId,
				label
			},
			metadata
		);
	}

	/**
	 * Log remote tunnel stop
	 */
	logRemoteTunnelStop(userId: string, configId: string, label: string, metadata: TunnelMetadata): void {
		this.logEvent(
			userId,
			'tunnel:remote:stop',
			{
				tunnelType: 'remote',
				configId,
				label
			},
			metadata
		);
	}

	/**
	 * Log local tunnel start
	 */
	logLocalTunnelStart(userId: string, configId: string, name: string, metadata: TunnelMetadata): void {
		this.logEvent(
			userId,
			'tunnel:local:start',
			{
				tunnelType: 'local',
				configId,
				name
			},
			metadata
		);
	}

	/**
	 * Log local tunnel stop
	 */
	logLocalTunnelStop(userId: string, configId: string, name: string, metadata: TunnelMetadata): void {
		this.logEvent(
			userId,
			'tunnel:local:stop',
			{
				tunnelType: 'local',
				configId,
				name
			},
			metadata
		);
	}
}

/**
 * Singleton instance of the tunnel audit logger
 */
export const tunnelAuditLogger = new TunnelAuditLogger();
