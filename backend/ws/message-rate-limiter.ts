/**
 * WebSocket Message Rate Limiter
 *
 * Protects against DoS via message spam from authenticated connections.
 * Tracks message frequency per connection with a sliding window.
 *
 * Thresholds:
 *   50 messages/second  → warning logged
 *   100 messages/second → connection throttled (messages dropped)
 *   200 messages/second → connection flagged for potential disconnect
 */

import { debug } from '$shared/utils/logger';
import type { WSConnection } from '$shared/utils/ws-server';

interface RateLimitConfig {
	warningThreshold: number;
	throttleThreshold: number;
	disconnectThreshold: number;
	windowMs: number;
	// Exponential backoff configuration
	baseLockoutMs: number;
	maxLockoutMs: number;
	lockoutResetMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
	warningThreshold: 50,
	throttleThreshold: 100,
	disconnectThreshold: 200,
	windowMs: 1000,
	baseLockoutMs: 5000, // 5 seconds base lockout
	maxLockoutMs: 1800000, // 30 minutes max lockout
	lockoutResetMs: 300000 // 5 minutes without violations resets backoff
};

interface ConnectionRateState {
	messageTimestamps: number[];
	isWarning: boolean;
	isThrottled: boolean;
	isFlagged: boolean;
	messagesDropped: number;
	// Exponential backoff state
	lockoutCount: number;
	lockedUntil: number;
	lastLockoutTime: number;
}

export class MessageRateLimiter {
	private config: RateLimitConfig;
	private connectionStates = new WeakMap<object, ConnectionRateState>();

	constructor(config?: Partial<RateLimitConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	private getState(conn: WSConnection): ConnectionRateState {
		const raw = (conn as any).raw ?? conn;
		let state = this.connectionStates.get(raw);
		if (!state) {
			state = {
				messageTimestamps: [],
				isWarning: false,
				isThrottled: false,
				isFlagged: false,
				messagesDropped: 0,
				lockoutCount: 0,
				lockedUntil: 0,
				lastLockoutTime: 0
			};
			this.connectionStates.set(raw, state);
		}
		return state;
	}

	checkRateLimit(conn: WSConnection, action: string): boolean {
		const state = this.getState(conn);
		const now = Date.now();

		// Check if connection is currently locked out
		if (state.lockedUntil > now) {
			state.messagesDropped++;
			return false;
		}

		// Reset lockout count if enough time has passed since last violation
		if (state.lastLockoutTime > 0 && now - state.lastLockoutTime > this.config.lockoutResetMs) {
			state.lockoutCount = 0;
			debug.log('rate-limit', `Lockout count reset for connection after ${this.config.lockoutResetMs}ms without violations`);
		}

		const windowStart = now - this.config.windowMs;
		state.messageTimestamps = state.messageTimestamps.filter(ts => ts > windowStart);
		state.messageTimestamps.push(now);

		const messageCount = state.messageTimestamps.length;
		const messagesPerSecond = messageCount / (this.config.windowMs / 1000);

		if (messagesPerSecond >= this.config.disconnectThreshold) {
			if (!state.isFlagged) {
				state.isFlagged = true;
				state.isThrottled = true;
				state.isWarning = false;

				// Apply exponential backoff before disconnect
				state.lockoutCount++;
				state.lastLockoutTime = now;
				const lockoutDuration = Math.min(
					this.config.baseLockoutMs * Math.pow(2, state.lockoutCount - 1),
					this.config.maxLockoutMs
				);
				state.lockedUntil = now + lockoutDuration;

				debug.warn('rate-limit', `Connection flagged for disconnect: ${messagesPerSecond.toFixed(0)} msg/s on action ${action}. Lockout #${state.lockoutCount} for ${lockoutDuration}ms`);
				
				try {
					conn.close(1008, 'Rate limit exceeded');
				} catch (error) {
					debug.warn('rate-limit', 'Failed to close rate-limited connection:', error);
				}
			}
			state.messagesDropped++;
			return false;
		}

		if (messagesPerSecond >= this.config.throttleThreshold) {
			if (!state.isThrottled) {
				state.isThrottled = true;
				state.isWarning = false;

				// Apply exponential backoff for throttle violations
				state.lockoutCount++;
				state.lastLockoutTime = now;
				const lockoutDuration = Math.min(
					this.config.baseLockoutMs * Math.pow(2, state.lockoutCount - 1),
					this.config.maxLockoutMs
				);
				state.lockedUntil = now + lockoutDuration;

				debug.warn('rate-limit', `Connection throttled: ${messagesPerSecond.toFixed(0)} msg/s on action ${action}. Lockout #${state.lockoutCount} for ${lockoutDuration}ms`);
			}
			state.messagesDropped++;
			return false;
		}

		if (messagesPerSecond >= this.config.warningThreshold) {
			if (!state.isWarning) {
				state.isWarning = true;
				state.isThrottled = false;
				state.isFlagged = false;
				debug.warn('rate-limit', `High message rate: ${messagesPerSecond.toFixed(0)} msg/s on action ${action}`);
			}
			return true;
		}

		state.isWarning = false;
		state.isThrottled = false;
		state.isFlagged = false;
		return true;
	}

	isFlaggedForDisconnect(conn: WSConnection): boolean {
		return this.getState(conn).isFlagged;
	}

	getConnectionStats(conn: WSConnection): { messagesPerSecond: number; isThrottled: boolean; isFlagged: boolean; messagesDropped: number; lockoutCount: number; lockedUntil: number } | null {
		const state = this.getState(conn);
		const now = Date.now();
		const windowStart = now - this.config.windowMs;
		const recentMessages = state.messageTimestamps.filter(ts => ts > windowStart);
		const messagesPerSecond = recentMessages.length / (this.config.windowMs / 1000);
		return { 
			messagesPerSecond, 
			isThrottled: state.isThrottled, 
			isFlagged: state.isFlagged, 
			messagesDropped: state.messagesDropped,
			lockoutCount: state.lockoutCount,
			lockedUntil: state.lockedUntil
		};
	}

	reset(conn: WSConnection): void {
		const raw = (conn as any).raw ?? conn;
		this.connectionStates.delete(raw);
	}

}

export const messageRateLimiter = new MessageRateLimiter();
