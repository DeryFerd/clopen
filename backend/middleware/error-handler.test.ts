import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Elysia, t } from 'elysia';

/**
 * Tests for the redacted error summary returned to the client.
 *
 * Background: the global error handler used to return
 * `error.toString()` in dev mode, leaking absolute file paths,
 * stack frames, and any string the upstream library embedded in
 * the Error. We now return only the error message, capped at 200
 * chars and stripped of newlines, so a malicious or buggy library
 * can't smuggle a header or dump the user's project layout into
 * the browser.
 */

type Module = {
	devErrorSummary: (error: unknown) => string;
	errorHandlerMiddleware: (app: Elysia) => any;
};

async function loadWithNodeEnv(env: 'development' | 'production'): Promise<Module> {
	mock.module('../utils/env', () => ({
		SERVER_ENV: {
			NODE_ENV: env,
			PORT: 9141,
			PORT_FRONTEND: 9151,
			HOST: 'localhost',
			isDevelopment: env === 'development'
		}
	}));
	return (await import(`./error-handler.ts?env=${env}`)) as Module;
}

beforeEach(() => {
	// Nothing global to reset; each test re-imports.
});

describe('devErrorSummary', () => {
	test('returns the error message for a plain Error', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		expect(devErrorSummary(new Error('boom'))).toBe('boom');
	});

	test('does NOT include the stack frame in the summary', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		const err = new Error('plain message');
		const summary = devErrorSummary(err);
		// Error.toString() is "Error: plain message" plus a stack — the
		// stack would include the file path of this test file. The
		// summary must contain only the message.
		expect(summary).toBe('plain message');
		expect(summary).not.toContain('error-handler.test');
		expect(summary).not.toContain('at ');
	});

	test('strips newlines so a header can\'t be smuggled in', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		// Some libraries embed multi-line errors (e.g. child process
		// stderr). A newline + arbitrary header line would let a
		// downstream XSS sink render attacker-controlled content.
		const err = new Error('first line\r\nSet-Cookie: pwn=1');
		const summary = devErrorSummary(err);
		// All CR/LF are collapsed to a single space.
		expect(summary).not.toContain('\r');
		expect(summary).not.toContain('\n');
		expect(summary).toBe('first line Set-Cookie: pwn=1');
	});

	test('caps the response at 200 characters', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		const longMessage = 'A'.repeat(500);
		const summary = devErrorSummary(new Error(longMessage));
		expect(summary.length).toBe(200);
	});

	test('falls back to a generic string for empty / non-Error values', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		// Empty Error.message and nullish non-Errors collapse to a
		// generic message — better to say "An error occurred" than to
		// return the literal string "null" / "undefined" which would
		// help an attacker probe the server's error model.
		expect(devErrorSummary(new Error(''))).toBe('An error occurred');
		expect(devErrorSummary(null)).toBe('An error occurred');
		expect(devErrorSummary(undefined)).toBe('An error occurred');
		expect(devErrorSummary(42)).toBe('42');
	});

	test('redacts Windows absolute file paths in the message', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		const err = new Error("ENOENT: no such file or directory, open 'C:\\Users\\Alice\\Projects\\secret-project\\db.sqlite'");
		const summary = devErrorSummary(err);
		expect(summary).not.toContain('Alice');
		expect(summary).not.toContain('secret-project');
		expect(summary).not.toContain('Users');
		expect(summary).toContain('[PATH]');
	});

	test('redacts POSIX /home/<user>/<project> paths', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		const err = new Error("ENOENT: open '/home/alice/projects/secret/db.sqlite'");
		const summary = devErrorSummary(err);
		expect(summary).not.toContain('alice');
		expect(summary).not.toContain('secret');
		expect(summary).toContain('[PATH]');
	});

	test('redacts connection strings (postgres://user:pass@host/db)', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		const err = new Error('connect ECONNREFUSED postgres://admin:hunter2@db.internal:5432/app');
		const summary = devErrorSummary(err);
		expect(summary).not.toContain('hunter2');
		expect(summary).not.toContain('admin');
		expect(summary).not.toContain('db.internal');
		expect(summary).toContain('[URL]');
	});

	test('redacts embedded bearer / api-key tokens', async () => {
		const { devErrorSummary } = await loadWithNodeEnv('development');
		const err = new Error('upstream rejected: api_key=sk-abcdefghij1234567890 status=401');
		const summary = devErrorSummary(err);
		expect(summary).not.toContain('sk-abcdefghij1234567890');
		expect(summary).toContain('[REDACTED]');
	});

	test('production-mode middleware does not import dev helpers at runtime', async () => {
		// Sanity: the middleware can be re-imported in production mode
		// without throwing. This is a smoke test; if any module-level
		// code in error-handler.ts depended on `process.env.NODE_ENV`
		// being 'development' (the old code did, implicitly), this
		// would fail.
		const { errorHandlerMiddleware } = await loadWithNodeEnv('production');
		expect(typeof errorHandlerMiddleware).toBe('function');
	});
});

describe('VALIDATION responses', () => {
	/**
	 * Elysia's ValidationError.message is a JSON string that embeds the
	 * full submitted request body (`found: <value>`) — even in production.
	 * A field that fails validation (e.g. wrong type) can sit right next
	 * to a field that didn't (e.g. a password), and both get echoed back.
	 * These tests hit the middleware through a real request so they catch
	 * a regression even if a future change reaches for `error.message`
	 * again.
	 */
	async function appWithValidation(env: 'development' | 'production') {
		const { errorHandlerMiddleware } = await loadWithNodeEnv(env);
		return new Elysia()
			.use(errorHandlerMiddleware)
			.post('/login', ({ body }) => body, {
				body: t.Object({ username: t.String(), password: t.String(), age: t.Number() })
			});
	}

	async function postInvalid(app: Elysia) {
		return app.handle(new Request('http://localhost/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: 'alice', password: 'SuperSecret123!', age: 'not-a-number' })
		}));
	}

	test('does not echo the submitted request body in development', async () => {
		const res = await postInvalid(await appWithValidation('development'));
		const body = await res.text();
		expect(body).not.toContain('SuperSecret123!');
		expect(body).not.toContain('alice');
	});

	test('does not echo the submitted request body in production', async () => {
		const res = await postInvalid(await appWithValidation('production'));
		const body = await res.text();
		expect(body).not.toContain('SuperSecret123!');
		expect(body).not.toContain('alice');
	});
});
