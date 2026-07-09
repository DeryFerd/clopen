import { beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * Tests for the CORS origin policy.
 *
 * The CORS middleware is constructed at module load from
 * `SERVER_ENV.HOST` / `SERVER_ENV.PORT`. We re-import the module
 * with different HOST values via `mock.module` to verify each branch
 * of the policy.
 *
 *   HOST = "0.0.0.0"  → array of concrete origins (localhost,
 *                       127.0.0.1, every non-internal IPv4).
 *   HOST = "localhost" → single origin "http://localhost:PORT".
 *   HOST = "1.2.3.4"   → single origin "http://1.2.3.4:PORT".
 */

type Module = {
	buildCorsOrigins: () => string | string[];
	corsMiddleware: unknown;
};

async function loadWithHost(host: string, port = 9141): Promise<Module> {
	mock.module('../utils/env', () => ({
		SERVER_ENV: {
			NODE_ENV: 'development',
			PORT: port,
			PORT_FRONTEND: 9151,
			HOST: host,
			isDevelopment: true
		}
	}));
	// Bust the module cache so the cors module re-runs its top-level
	// initialiser with the freshly mocked env. (Bun caches the module
	// between tests; `mock.module` alone isn't enough — the cors
	// module has already been loaded with the previous env values.)
	const mod = (await import(`./cors.ts?h=${host}`)) as Module;
	return mod;
}

beforeEach(() => {
	// No global setup needed — each test re-imports.
});

describe('buildCorsOrigins', () => {
	test('returns a single origin for a named host', async () => {
		const { buildCorsOrigins } = await loadWithHost('localhost', 9141);
		expect(buildCorsOrigins()).toBe('http://localhost:9141');
	});

	test('returns a single origin for a real IP', async () => {
		const { buildCorsOrigins } = await loadWithHost('192.168.1.50', 9141);
		expect(buildCorsOrigins()).toBe('http://192.168.1.50:9141');
	});

	test('expands 0.0.0.0 into an array of concrete origins', async () => {
		const { buildCorsOrigins } = await loadWithHost('0.0.0.0', 9141);
		const origins = buildCorsOrigins();
		expect(Array.isArray(origins)).toBe(true);
		const list = origins as string[];
		// Must always include the loopback forms a browser will use.
		expect(list).toContain('http://localhost:9141');
		expect(list).toContain('http://127.0.0.1:9141');
		// And at least one IPv4 origin from the local network interfaces.
		// (If the test runner has no non-internal IPv4, fall back to the
		// loopback-only assertion above.)
		const ipv4s = list.filter((o) => /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/.test(o));
		expect(ipv4s.length).toBeGreaterThanOrEqual(2);
	});

	test('uses the configured port for every origin entry', async () => {
		const { buildCorsOrigins } = await loadWithHost('0.0.0.0', 9141);
		const list = buildCorsOrigins() as string[];
		for (const o of list) {
			expect(o.endsWith(':9141')).toBe(true);
		}
	});

	test('does NOT include 0.0.0.0 as an origin', async () => {
		// Browsers reject 0.0.0.0 as a valid origin. The 0.0.0.0 branch
		// must replace it with concrete addresses, not echo it back.
		const { buildCorsOrigins } = await loadWithHost('0.0.0.0', 9141);
		const list = buildCorsOrigins() as string[];
		for (const o of list) {
			expect(o.includes('0.0.0.0')).toBe(false);
		}
	});
});
