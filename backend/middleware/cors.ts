import { cors } from '@elysiajs/cors';
import { SERVER_ENV } from '../utils/env';

/**
 * CORS Middleware Configuration
 * Single port setup — frontend and backend share the same origin.
 */
const port = SERVER_ENV.PORT;
const host = SERVER_ENV.HOST;
export const corsMiddleware = cors({
	origin: `http://${host}:${port}`,
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	exposeHeaders: ['Content-Type']
});
