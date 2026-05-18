/**
 * Auth Audit Log Queries
 */

import { getDatabase } from '../index';
import { debug } from '$shared/utils/logger';

export interface AuthAuditLogEntry {
	id: string;
	user_id: string;
	actor_user_id: string | null;
	event_type: string;
	event_details: string | null;
	ip_address: string | null;
	user_agent: string | null;
	created_at: string;
}

type AuditLogInput = {
	userId: string;
	actorUserId?: string;
	eventType: string;
	eventDetails?: string;
	ipAddress?: string;
	userAgent?: string;
};

function insertAuditLog(entry: AuditLogInput): void {
	const db = getDatabase();
	db.prepare(`
		INSERT INTO auth_audit_log (user_id, actor_user_id, event_type, event_details, ip_address, user_agent)
		VALUES (?, ?, ?, ?, ?, ?)
	`).run(
		entry.userId,
		entry.actorUserId ?? null,
		entry.eventType,
		entry.eventDetails ?? null,
		entry.ipAddress ?? null,
		entry.userAgent ?? null
	);
}

export const auditLogQueries = {
	logEvent(entry: AuditLogInput): boolean {
		try {
			insertAuditLog(entry);
			return true;
		} catch (error) {
			debug.error('auth', `Failed to write audit log for event ${entry.eventType}:`, error);
			return false;
		}
	},

	getUserLogs(userId: string, limit: number = 50): AuthAuditLogEntry[] {
		const db = getDatabase();
		return db.prepare(`
			SELECT * FROM auth_audit_log
			WHERE user_id = ?
			ORDER BY created_at DESC
			LIMIT ?
		`).all(userId, limit) as AuthAuditLogEntry[];
	},

	getEventsByType(eventType: string, limit: number = 50): AuthAuditLogEntry[] {
		const db = getDatabase();
		return db.prepare(`
			SELECT * FROM auth_audit_log
			WHERE event_type = ?
			ORDER BY created_at DESC
			LIMIT ?
		`).all(eventType, limit) as AuthAuditLogEntry[];
	},

	getRecentLogs(limit: number = 100): AuthAuditLogEntry[] {
		const db = getDatabase();
		return db.prepare(`
			SELECT * FROM auth_audit_log
			ORDER BY created_at DESC
			LIMIT ?
		`).all(limit) as AuthAuditLogEntry[];
	},

	getLogsByDateRange(startDate: string, endDate: string, limit: number = 100): AuthAuditLogEntry[] {
		const db = getDatabase();
		return db.prepare(`
			SELECT * FROM auth_audit_log
			WHERE created_at BETWEEN ? AND ?
			ORDER BY created_at DESC
			LIMIT ?
		`).all(startDate, endDate, limit) as AuthAuditLogEntry[];
	},

	deleteOldLogs(beforeDate: string): number {
		const db = getDatabase();
		const result = db.prepare(`DELETE FROM auth_audit_log WHERE created_at < ?`).run(beforeDate) as { changes: number };
		return result.changes;
	}
};
