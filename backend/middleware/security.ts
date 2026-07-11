import type { Elysia } from 'elysia';

/**
 * Security Headers Middleware
 *
 * Applies Content Security Policy (CSP) and other security headers to all responses.
 *
 * CSP Configuration Rationale:
 * - default-src 'self': Restrict all resources to same-origin by default
 * - script-src 'self' 'unsafe-inline' 'unsafe-eval': Monaco Editor requires eval for web workers and inline scripts
 * - style-src 'self' 'unsafe-inline': Monaco and Tailwind use inline styles
 * - img-src 'self' data: blob:: Support base64 images and blob URLs from browser preview
 * - connect-src 'self' ws: wss:: Allow WebSocket connections for real-time chat and file operations
 * - font-src 'self' data:: Support custom fonts and data URIs
 * - frame-ancestors 'none': Prevent clickjacking by disallowing embedding in iframes
 * - frame-src 'self': Allow iframes from same origin (browser preview)
 * - worker-src 'self' blob:: Monaco Editor uses web workers from blob URLs
 *
 * Additional Security Headers:
 * - X-Content-Type-Options: nosniff - Prevent MIME type sniffing
 * - X-Frame-Options: DENY - Additional clickjacking protection (redundant with CSP frame-ancestors but defense-in-depth)
 * - Referrer-Policy: strict-origin-when-cross-origin - Limit referrer information leakage
 * - Permissions-Policy: Controls browser features (camera, microphone, geolocation, etc.)
 */
export function securityMiddleware(app: Elysia) {
	return app.onAfterHandle(({ set }) => {
		// Content Security Policy
		set.headers['Content-Security-Policy'] = [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: blob:",
			"connect-src 'self' ws: wss:",
			"font-src 'self' data:",
			"frame-ancestors 'none'",
			"frame-src 'self'",
			"worker-src 'self' blob:"
		].join('; ');

		// Prevent MIME type sniffing
		set.headers['X-Content-Type-Options'] = 'nosniff';

		// Clickjacking protection (defense-in-depth with CSP frame-ancestors)
		set.headers['X-Frame-Options'] = 'DENY';

		// Referrer policy - limit information leakage
		set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';

		// Permissions policy - restrict browser features
		set.headers['Permissions-Policy'] = [
			'camera=()',
			'microphone=()',
			'geolocation=()',
			'payment=()',
			'usb=()',
			'magnetometer=()',
			'gyroscope=()',
			'accelerometer=()'
		].join(', ');
	});
}
