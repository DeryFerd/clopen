import { cors } from '@elysiajs/cors';
import { networkInterfaces } from 'os';
import { SERVER_ENV } from '../utils/env';

/**
 * CORS Middleware Configuration
 * Single port setup — frontend and backend share the same origin.
 *
 * Origins are derived from the configured HOST:
 *   - HOST = a real hostname or "localhost": single origin, the
 *     configured host:port.
 *   - HOST = "0.0.0.0" (LAN-binding): browsers do NOT treat 0.0.0.0
 *     as a valid origin, so we must accept every concrete address
 *     the user might reach the server on: localhost, 127.0.0.1, and
 *     every non-internal IPv4 reported by the OS. Otherwise the
 *     browser blocks credentialed CORS requests and the session
 *     silently drops.
 *
 * Exported separately so tests can verify the policy without
 * running a full Elysia app.
 */
const port = SERVER_ENV.PORT;
const host = SERVER_ENV.HOST;

function getLocalIps(): string[] {
	const ips: string[] = [];
	for (const ifaces of Object.values(networkInterfaces())) {
		for (const iface of ifaces ?? []) {
			if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
		}
	}
	return ips;
}

export function buildCorsOrigins(): string | string[] {
	if (host === '0.0.0.0') {
		const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
		for (const ip of getLocalIps()) {
			origins.push(`http://${ip}:${port}`);
		}
		return origins;
	}
	return `http://${host}:${port}`;
}

export const corsMiddleware = cors({
	origin: buildCorsOrigins(),
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	exposeHeaders: ['Content-Type']
});
