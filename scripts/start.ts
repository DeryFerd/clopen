#!/usr/bin/env bun

/**
 * Production start script — resolves available port before starting backend.
 * Mirrors scripts/dev.ts: ensures port is truly available (IPv4 + IPv6)
 * before the backend binds, avoiding silent hangs from zombie processes.
 */

import { findAvailablePort } from '../backend/utils/port-utils';

const desiredPort = process.env.PORT ? parseInt(process.env.PORT) : 9141;
const host = process.env.HOST || 'localhost';

const port = await findAvailablePort(desiredPort);

if (port !== desiredPort) {
	console.log(`⚠️ Port ${desiredPort} in use, using ${port}`);
}

// Set resolved port before importing backend (env.ts reads at import time)
process.env.PORT = String(port);
process.env.NODE_ENV = 'production';

await import('../backend/index.ts');
