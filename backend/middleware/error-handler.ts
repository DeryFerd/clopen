import type { Elysia } from 'elysia';
import { SERVER_ENV } from '../utils/env';

/**
 * Generic message returned in production. Never includes any
 * information derived from the error itself.
 */
const PROD_RESPONSE_MESSAGE = 'An error occurred';

/**
 * Maximum number of characters of an error string that may appear in
 * a response body. Errors thrown deep in the stack (SQL, fs, network)
 * can carry absolute paths, stack frames, and — in the worst case —
 * embedded connection strings or tokens. Capping the response to a
 * short, generic string prevents that payload from reaching the
 * browser while the full error is still logged server-side.
 */
const MAX_RESPONSE_LENGTH = 200;

/**
 * Redaction regex set.
 *
 * The Error class itself doesn't put secrets in the message, but
 * downstream libraries (Bun.sql, Node's ENOENT, ssh2, fetch
 * wrappers) routinely embed them. We can't predict every shape, so
 * we redact the well-known patterns and let everything else pass
 * through (capped and newline-stripped). The full error is still
 * logged server-side — `console.error('[Error]', code, reqInfo, error)`
 * in the handler — so operators can see what really happened.
 */
const REDACT_PATTERNS: readonly { re: RegExp; replacement: string }[] = [
	// Windows-style absolute paths: C:\Users\Alice\Projects\secret  →  C:\…\secret
	{ re: /[A-Za-z]:\\[^\s'"]+/g, replacement: '[PATH]' },
	// POSIX absolute paths: /home/alice/projects/secret  →  /[…]/secret
	{ re: /(?:\/(?:home|root|Users|var|etc|tmp|opt)\/)[^\s'"]+/g, replacement: '[PATH]' },
	// Bare /home/…/project/… on macOS/Linux (no leading prefix)
	{ re: /\/[^\s'"]+\.(?:sqlite|sqlite3|db|sql)(?:\b|$)/gi, replacement: '[DB]' },
	// Connection-string-style credentials: postgres://user:pw@host:5432/db
	{ re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"]+/gi, replacement: '[URL]' },
	// Bearer / Basic / token-shaped secrets that snuck into a message
	{ re: /\b(?:Bearer|Basic|Token|api[_-]?key|secret)\s*[=:]\s*[A-Za-z0-9._\-+/=]{8,}/gi, replacement: '[REDACTED]' }
];

/** Strip CR/LF so a maliciously-crafted `error.message` can't smuggle a header. */
function singleLine(s: string): string {
	return s.replace(/[\r\n]+/g, ' ');
}

/** Apply the redaction patterns to a string. */
function redact(s: string): string {
	let out = s;
	for (const { re, replacement } of REDACT_PATTERNS) {
		out = out.replace(re, replacement);
	}
	return out;
}

/** Build a redacted, capped error summary safe to return to the client. */
export function devErrorSummary(error: unknown): string {
	let raw: string;
	if (error instanceof Error) {
		raw = error.message;
	} else if (error == null) {
		return PROD_RESPONSE_MESSAGE;
	} else {
		raw = String(error);
	}
	const cleaned = singleLine(redact(raw));
	return cleaned.slice(0, MAX_RESPONSE_LENGTH) || PROD_RESPONSE_MESSAGE;
}

/**
 * Global Error Handler Middleware
 * Catches all errors and returns consistent error responses.
 *
 * The full `error` is always logged server-side (see `console.error`
 * on the `default` branch). The body returned to the client is
 * redacted:
 *   - production: a single generic string
 *   - development: the error message (not the full toString()) capped
 *     at 200 chars, with CR/LF stripped and well-known PII patterns
 *     (absolute paths, connection strings, embedded credentials)
 *     replaced. We no longer return `error.toString()` because that
 *     includes the stack trace and absolute file paths — both of
 *     which can leak project layout or PII in dev mode, especially
 *     when the dev server is reachable over LAN (CLOPEN_HOST=0.0.0.0).
 */
export function errorHandlerMiddleware(app: Elysia) {
	return app.onError(({ code, error, set, request }) => {
		// Build a single-line request descriptor so 404s/etc. can be traced
		// back to the offending URL without dumping the full Error stack
		// (which previously logged just "NOT_FOUND" with no path info).
		let reqInfo = '';
		try {
			const url = new URL(request.url);
			reqInfo = `${request.method} ${url.pathname}${url.search}`;
		} catch { /* request.url unavailable */ }

		// Handle different error types
		switch (code) {
			case 'VALIDATION':
				console.error('[Error]', code, reqInfo, error.message);
				set.status = 400;
				return {
					success: false,
					error: 'Validation error',
					message: error.message
				};

			case 'NOT_FOUND':
				// 404s are common in dev (probes, hot-reload pings, deep-link
				// refreshes). Log the path at warn level instead of dumping
				// the full Error stack on every miss.
				console.warn('[404]', reqInfo || '(unknown path)');
				set.status = 404;
				return {
					success: false,
					error: 'Not found',
					message: error.message
				};

			case 'PARSE':
				console.error('[Error]', code, reqInfo);
				set.status = 400;
				return {
					success: false,
					error: 'Parse error',
					message: 'Invalid request body'
				};

			default:
				console.error('[Error]', code, reqInfo, error);
				set.status = 500;
				return {
					success: false,
					error: 'Internal server error',
					message: SERVER_ENV.NODE_ENV === 'production'
						? PROD_RESPONSE_MESSAGE
						: devErrorSummary(error)
				};
		}
	});
}
