/**
 * HTTP upload route for files.
 *
 * The WebSocket-based upload path was wedging on the Vite dev proxy for
 * large transfers — the proxy reports `write EPIPE` and the client request
 * times out. HTTP is purpose-built for streaming large request bodies and
 * the same Vite proxy forwards it cleanly, so we route uploads here.
 *
 * Auth: `Authorization: Bearer <session-token>` (same token issued by
 * `auth:login` and stored in `localStorage` on the frontend).
 *
 * Query: `targetPath`, `fileName`, `fileSize` (decimal bytes).
 *
 * Body: raw file bytes (no multipart wrapping).
 */

import { Elysia } from 'elysia';
import { join } from 'node:path';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';

import { debug } from '$shared/utils/logger';
import { hashToken } from '../auth/tokens';
import { authQueries, fileAuditLogQueries } from '../database/queries';
import { requireFilePathAccessFor } from '../ws/files/path-access';
import { validateFileSize } from '../files/file-size-limit';

type AuthIdentity = { userId: string; role: string };

function getClientIp(request: Request): string | undefined {
	return request.headers.get('x-forwarded-for')?.split(',')[0].trim() 
		|| request.headers.get('x-real-ip') 
		|| undefined;
}

function authenticate(request: Request): AuthIdentity {
	const header = request.headers.get('authorization') || request.headers.get('Authorization');
	if (!header || !header.toLowerCase().startsWith('bearer ')) {
		throw Object.assign(new Error('Authorization required'), { status: 401 });
	}
	const token = header.slice(7).trim();
	if (!token) {
		throw Object.assign(new Error('Authorization required'), { status: 401 });
	}
	const session = authQueries.getSessionByTokenHash(hashToken(token));
	if (!session) {
		throw Object.assign(new Error('Invalid session token'), { status: 401 });
	}
	if (new Date(session.expires_at) < new Date()) {
		throw Object.assign(new Error('Session expired'), { status: 401 });
	}
	const user = authQueries.getUserById(session.user_id);
	if (!user) {
		throw Object.assign(new Error('User not found'), { status: 401 });
	}
	authQueries.updateLastActive(session.id);
	return { userId: user.id, role: user.role };
}

export const filesUploadRoute = new Elysia().post('/api/files/upload', async ({ request, query }) => {
	let identity: AuthIdentity;
	try {
		identity = authenticate(request);
	} catch (error) {
		const status = (error as { status?: number }).status ?? 401;
		const message = error instanceof Error ? error.message : 'Unauthorized';
		return new Response(message, { status });
	}

	const targetPathParam = typeof query.targetPath === 'string' ? query.targetPath : '';
	const fileNameParam = typeof query.fileName === 'string' ? query.fileName : '';
	const fileSizeParam = typeof query.fileSize === 'string' ? Number(query.fileSize) : NaN;

	if (!targetPathParam || !fileNameParam) {
		return new Response('Missing required query parameters: targetPath, fileName', { status: 400 });
	}
	if (!Number.isFinite(fileSizeParam) || fileSizeParam < 0) {
		return new Response('Invalid fileSize query parameter', { status: 400 });
	}

	try {
		validateFileSize(fileSizeParam);
	} catch (error) {
		// Log failed upload due to file size validation
		try {
			fileAuditLogQueries.logOperation({
				userId: identity.userId,
				action: 'upload',
				filePath: `${targetPathParam}/${fileNameParam}`,
				fileSize: fileSizeParam,
				ipAddress: getClientIp(request),
				success: false,
				errorMessage: 'File too large'
			});
		} catch (err) {
			debug.error('file', 'Failed to log upload failure', err);
		}
		return new Response(error instanceof Error ? error.message : 'Invalid file size', { status: 413 });
	}

	let resolvedTarget: string;
	let resolvedFinal: string;
	try {
		resolvedTarget = await requireFilePathAccessFor(targetPathParam, identity.role, identity.userId);
		const tentativeFinal = join(resolvedTarget, fileNameParam);
		resolvedFinal = await requireFilePathAccessFor(tentativeFinal, identity.role, identity.userId);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Access denied';
		// Log failed upload due to path access denied
		try {
			fileAuditLogQueries.logOperation({
				userId: identity.userId,
				action: 'upload',
				filePath: `${targetPathParam}/${fileNameParam}`,
				fileSize: fileSizeParam,
				ipAddress: getClientIp(request),
				success: false,
				errorMessage: 'Path access denied'
			});
		} catch (err) {
			debug.error('file', 'Failed to log upload failure', err);
		}
		return new Response(message, { status: 403 });
	}

	try {
		const targetStat = await stat(resolvedTarget).catch(() => null);
		if (!targetStat) {
			await mkdir(resolvedTarget, { recursive: true });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to prepare target directory';
		return new Response(message, { status: 500 });
	}

	if (await Bun.file(resolvedFinal).exists()) {
		// Log failed upload due to file already exists (early check)
		try {
			fileAuditLogQueries.logOperation({
				userId: identity.userId,
				action: 'upload',
				filePath: resolvedFinal,
				fileSize: fileSizeParam,
				ipAddress: getClientIp(request),
				success: false,
				errorMessage: 'File already exists'
			});
		} catch (err) {
			debug.error('file', 'Failed to log upload failure', err);
		}
		return new Response('File already exists', { status: 409 });
	}

	if (!request.body) {
		return new Response('Request body is empty', { status: 400 });
	}

	const tempPath = `${resolvedFinal}.${crypto.randomUUID()}.partial`;
	const writer = Bun.file(tempPath).writer();
	let written = 0;

	const cleanupTemp = async () => {
		try { await writer.end(); } catch { /* best-effort */ }
		try { await unlink(tempPath); } catch { /* best-effort */ }
	};

	try {
		const reader = request.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			const incoming = value.byteLength;
			if (written + incoming > fileSizeParam) {
				await cleanupTemp();
				return new Response('Received more bytes than declared file size', { status: 400 });
			}
			writer.write(value);
			written += incoming;
		}

		await writer.end();

		if (written !== fileSizeParam) {
			await unlink(tempPath).catch(() => {});
			return new Response(`Incomplete upload: received ${written} of ${fileSizeParam} bytes`, { status: 400 });
		}

		try {
			validateFileSize(written);
		} catch (error) {
			await unlink(tempPath).catch(() => {});
			// Log failed upload due to post-upload size validation
			try {
				fileAuditLogQueries.logOperation({
					userId: identity.userId,
					action: 'upload',
					filePath: resolvedFinal,
					fileSize: written,
					ipAddress: getClientIp(request),
					success: false,
					errorMessage: 'File too large'
				});
			} catch (err) {
				debug.error('file', 'Failed to log upload failure', err);
			}
			return new Response(error instanceof Error ? error.message : 'File too large', { status: 413 });
		}

		// Race-check: refuse to overwrite if the destination appeared mid-upload.
		if (await Bun.file(resolvedFinal).exists()) {
			await unlink(tempPath).catch(() => {});
			// Log failed upload due to file already exists (race condition)
			try {
				fileAuditLogQueries.logOperation({
					userId: identity.userId,
					action: 'upload',
					filePath: resolvedFinal,
					fileSize: written,
					ipAddress: getClientIp(request),
					success: false,
					errorMessage: 'File already exists (race condition)'
				});
			} catch (err) {
				debug.error('file', 'Failed to log upload failure', err);
			}
			return new Response('File already exists', { status: 409 });
		}

		await rename(tempPath, resolvedFinal);
		const stats = await stat(resolvedFinal);

		fileAuditLogQueries.logOperation({
			userId: identity.userId,
			action: 'upload',
			filePath: resolvedFinal,
			fileSize: stats.size,
			ipAddress: getClientIp(request)
		});

		return Response.json({
			message: 'File uploaded successfully',
			path: resolvedFinal,
			size: stats.size,
			modified: stats.mtime.toISOString()
		});
	} catch (error) {
		await cleanupTemp();
		debug.error('file', 'HTTP upload error:', error);
		const message = error instanceof Error ? error.message : 'Upload failed';
		// Log failed upload due to internal server error
		try {
			fileAuditLogQueries.logOperation({
				userId: identity.userId,
				action: 'upload',
				filePath: resolvedFinal,
				fileSize: written,
				ipAddress: getClientIp(request),
				success: false,
				errorMessage: message
			});
		} catch (err) {
			debug.error('file', 'Failed to log upload failure', err);
		}
		return new Response(message, { status: 500 });
	}
});
