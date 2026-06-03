/**
 * Client IP resolution — one canonical place for both HTTP and WebSocket paths.
 *
 * Audit trails want the real client IP or nothing (null), so the connection/
 * request helpers return `string | undefined`. Callers that need a stable,
 * non-null key (e.g. rate-limit buckets) fall back to a sentinel at the call
 * site — see `ws.getRemoteAddress`.
 */

import type { WSConnection } from '$shared/utils/ws-server';

/** Structural subset of Bun's `Server` — just socket-address lookup, so we
 *  avoid coupling to its generic `Server<WebSocketData>` signature. */
type RequestIpResolver = { requestIP(request: Request): { address: string } | null };

/**
 * First client IP from forwarding headers, preferring `x-forwarded-for`'s
 * leftmost hop, then `x-real-ip`. Returns undefined when neither is present.
 */
export function clientIpFromHeaders(headers: Headers): string | undefined {
	const forwarded = headers.get('x-forwarded-for')?.split(',')[0].trim();
	if (forwarded) return forwarded;
	return headers.get('x-real-ip') ?? undefined;
}

/**
 * Client IP for an HTTP request: forwarding headers first (correct when behind
 * a reverse proxy), falling back to the socket address. Undefined when none
 * resolve.
 */
export function clientIpFromRequest(request: Request, server: RequestIpResolver | null): string | undefined {
	return clientIpFromHeaders(request.headers) ?? server?.requestIP(request)?.address ?? undefined;
}

/**
 * Client IP for a WebSocket connection — the socket's remote address, or
 * undefined when unavailable.
 */
export function clientIpFromConnection(conn: WSConnection): string | undefined {
	const raw = (conn as unknown as { raw?: { remoteAddress?: string } }).raw;
	return raw?.remoteAddress ?? undefined;
}
