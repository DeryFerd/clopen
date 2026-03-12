import { join } from 'path';
import { homedir } from 'os';

/**
 * Returns the Clopen data directory.
 * - development: ~/.clopen-dev
 * - everything else (production, undefined): ~/.clopen
 */
export function getClopenDir(): string {
	return join(homedir(), process.env.NODE_ENV === 'development' ? '.clopen-dev' : '.clopen');
}
