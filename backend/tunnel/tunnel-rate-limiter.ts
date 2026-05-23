/**
 * Tunnel Rate Limiter
 *
 * Prevents abuse by limiting tunnel creation rate per user.
 */

import { debug } from '$shared/utils/logger';

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

class TunnelRateLimiter {
	private limits = new Map<string, RateLimitEntry>();
	private readonly WINDOW_MS = 60 * 60 * 1000; // 1 hour
	private readonly MAX_TUNNELS_PER_HOUR = 10; // Max 10 tunnels per hour per user

	/**
	 * Check if user can create a new tunnel
	 */
	canCreateTunnel(userId: string): { allowed: boolean; retryAfter?: number } {
		const now = Date.now();
		const entry = this.limits.get(userId);

		// No entry or expired window - allow
		if (!entry || now >= entry.resetAt) {
			return { allowed: true };
		}

		// Check if under limit
		if (entry.count < this.MAX_TUNNELS_PER_HOUR) {
			return { allowed: true };
		}

		// Rate limited
		const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
		debug.warn('tunnel-rate-limit', `User ${userId} rate limited. Retry after ${retryAfter}s`);
		return { allowed: false, retryAfter };
	}

	/**
	 * Record a tunnel creation
	 */
	recordTunnelCreation(userId: string): void {
		const now = Date.now();
		const entry = this.limits.get(userId);

		if (!entry || now >= entry.resetAt) {
			// New window
			this.limits.set(userId, {
				count: 1,
				resetAt: now + this.WINDOW_MS
			});
		} else {
			// Increment count
			entry.count++;
		}
	}

	/**
	 * Get current rate limit status for a user
	 */
	getStatus(userId: string): { count: number; limit: number; resetAt: number | null } {
		const entry = this.limits.get(userId);
		const now = Date.now();

		if (!entry || now >= entry.resetAt) {
			return {
				count: 0,
				limit: this.MAX_TUNNELS_PER_HOUR,
				resetAt: null
			};
		}

		return {
			count: entry.count,
			limit: this.MAX_TUNNELS_PER_HOUR,
			resetAt: entry.resetAt
		};
	}

	/**
	 * Reset rate limit for a user (admin only)
	 */
	resetUser(userId: string): void {
		this.limits.delete(userId);
		debug.log('tunnel-rate-limit', `Rate limit reset for user ${userId}`);
	}

	/**
	 * Clear all rate limits (admin only)
	 */
	clearAll(): void {
		this.limits.clear();
		debug.log('tunnel-rate-limit', 'All rate limits cleared');
	}

	/**
	 * Cleanup expired entries periodically
	 */
	cleanup(): void {
		const now = Date.now();
		for (const [userId, entry] of this.limits.entries()) {
			if (now >= entry.resetAt) {
				this.limits.delete(userId);
			}
		}
	}
}

export const tunnelRateLimiter = new TunnelRateLimiter();

// Cleanup expired entries every 5 minutes
setInterval(() => {
	tunnelRateLimiter.cleanup();
}, 5 * 60 * 1000);
