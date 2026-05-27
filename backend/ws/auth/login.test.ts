/**
 * Integration tests for audit log events in auth handlers.
 * 
 * These tests verify that the four session-creation paths that previously
 * had no audit trail now correctly log events to auth_audit_log:
 * - auth:setup
 * - auth:setup-no-auth
 * - auth:auto-login-no-auth
 * - auth:accept-invite
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Auth Login Handlers - Audit Log Integration', () => {
	const loginFilePath = join(__dirname, 'login.ts');
	const loginFileContent = readFileSync(loginFilePath, 'utf-8');

	it('should contain audit log calls for all four session-creation event types', () => {
		const eventTypes = [
			'auth:setup',
			'auth:setup-no-auth',
			'auth:auto-login-no-auth',
			'auth:accept-invite'
		];

		for (const eventType of eventTypes) {
			expect(loginFileContent).toContain(`eventType: '${eventType}'`);
		}
	});

	it('should call auditLogQueries.logEvent in all four handlers', () => {
		// Count occurrences of auditLogQueries.logEvent
		const logEventCalls = loginFileContent.match(/auditLogQueries\.logEvent/g);
		
		// Should have at least 6 calls: 4 new ones + auth:login + auth:logout + auth:logout-all
		expect(logEventCalls).toBeTruthy();
		expect(logEventCalls!.length).toBeGreaterThanOrEqual(6);
	});

	it('should capture IP address using ws.getRemoteAddress in all four new handlers', () => {
		// Verify IP capture exists near each new event type
		const eventTypes = [
			'auth:setup',
			'auth:setup-no-auth',
			'auth:auto-login-no-auth',
			'auth:accept-invite'
		];

		for (const eventType of eventTypes) {
			// Find the section containing this event type
			const eventIndex = loginFileContent.indexOf(`eventType: '${eventType}'`);
			expect(eventIndex).toBeGreaterThan(-1);
			
			// Check that IP is captured before this event type in the same handler
			// Look backwards up to 1000 characters to find the IP capture
			const handlerSection = loginFileContent.substring(Math.max(0, eventIndex - 1000), eventIndex + 200);
			
			// IP can be captured either directly in the call or in a variable before
			const hasIpCapture = handlerSection.includes('ws.getRemoteAddress') || 
			                     (handlerSection.includes('const ip =') && handlerSection.includes('ipAddress: ip'));
			expect(hasIpCapture).toBe(true);
			expect(handlerSection).toContain('ipAddress:');
		}
	});

	it('should wrap audit log calls in try-catch to prevent auth flow breakage', () => {
		// Count try-catch blocks around auditLogQueries.logEvent calls
		const auditLogTryCatchBlocks = loginFileContent.match(/try \{[\s\S]*?auditLogQueries\.logEvent[\s\S]*?\} catch/g);
		
		// Should have at least 4 try-catch wrapped audit log calls (one for each new handler)
		expect(auditLogTryCatchBlocks).toBeTruthy();
		expect(auditLogTryCatchBlocks!.length).toBeGreaterThanOrEqual(4);
	});

	it('should include required fields in audit log events', () => {
		const eventTypes = [
			'auth:setup',
			'auth:setup-no-auth',
			'auth:auto-login-no-auth',
			'auth:accept-invite'
		];

		for (const eventType of eventTypes) {
			// Find the audit log call for this event type
			const eventIndex = loginFileContent.indexOf(`eventType: '${eventType}'`);
			expect(eventIndex).toBeGreaterThan(-1);
			
			// Get the audit log call section (from auditLogQueries.logEvent to the closing })
			const callStart = loginFileContent.lastIndexOf('auditLogQueries.logEvent', eventIndex);
			const callEnd = loginFileContent.indexOf('});', eventIndex);
			const auditLogCall = loginFileContent.substring(callStart, callEnd + 3);
			
			// Verify required fields are present
			expect(auditLogCall).toContain('userId:');
			expect(auditLogCall).toContain('actorUserId:');
			expect(auditLogCall).toContain('eventDetails:');
			expect(auditLogCall).toContain('ipAddress:');
		}
	});
});
