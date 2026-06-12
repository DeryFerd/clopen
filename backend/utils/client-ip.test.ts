import { describe, expect, test } from 'bun:test';

import { clientIpFromHeaders, clientIpFromRequest, clientIpFromConnection } from './client-ip';

describe('clientIpFromHeaders', () => {
	test('prefers the leftmost x-forwarded-for hop', () => {
		const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' });
		expect(clientIpFromHeaders(headers)).toBe('203.0.113.7');
	});

	test('falls back to x-real-ip when x-forwarded-for is absent', () => {
		const headers = new Headers({ 'x-real-ip': '198.51.100.5' });
		expect(clientIpFromHeaders(headers)).toBe('198.51.100.5');
	});

	test('returns undefined when no forwarding header is present', () => {
		expect(clientIpFromHeaders(new Headers())).toBeUndefined();
	});
});

describe('clientIpFromRequest', () => {
	const makeServer = (address: string | null) => ({
		requestIP: () => (address === null ? null : { address }),
	});

	test('uses forwarding headers when present, ignoring the socket', () => {
		const request = new Request('http://localhost/upload', {
			headers: { 'x-forwarded-for': '203.0.113.7' },
		});
		expect(clientIpFromRequest(request, makeServer('10.0.0.1'))).toBe('203.0.113.7');
	});

	test('falls back to the socket address on a direct connection', () => {
		const request = new Request('http://localhost/upload');
		expect(clientIpFromRequest(request, makeServer('::1'))).toBe('::1');
	});

	test('returns undefined when neither header nor socket resolves', () => {
		const request = new Request('http://localhost/upload');
		expect(clientIpFromRequest(request, makeServer(null))).toBeUndefined();
		expect(clientIpFromRequest(request, null)).toBeUndefined();
	});
});

describe('clientIpFromConnection', () => {
	test('reads the socket remote address', () => {
		const conn = { raw: { remoteAddress: '192.168.1.100' } } as any;
		expect(clientIpFromConnection(conn)).toBe('192.168.1.100');
	});

	test('returns undefined when the address is unavailable', () => {
		expect(clientIpFromConnection({ raw: {} } as any)).toBeUndefined();
		expect(clientIpFromConnection({} as any)).toBeUndefined();
	});
});
