/**
 * db-client — query validation and safety checks.
 *
 * Provides validation for user-submitted queries to prevent SQL injection
 * and other security issues. This is defense-in-depth alongside parameterized
 * queries.
 */

import type { DbDriver } from '$shared/types/db-client';

export interface QueryValidationResult {
	safe: boolean;
	warnings: string[];
	errors: string[];
}

/**
 * Dangerous SQL patterns that should never appear in user queries.
 * These patterns indicate potential SQL injection attempts or unsafe practices.
 */
const DANGEROUS_SQL_PATTERNS = [
	// Command execution attempts
	/xp_cmdshell/i,
	/exec\s*\(/i,
	/execute\s*\(/i,
	/sp_executesql/i,
	
	// File operations
	/into\s+outfile/i,
	/into\s+dumpfile/i,
	/load_file/i,
	/load\s+data\s+infile/i,
	
	// PostgreSQL specific dangerous functions
	/copy\s+.*\s+from\s+program/i,
	/copy\s+.*\s+to\s+program/i,
	/pg_read_file/i,
	/pg_ls_dir/i,
	
	// MySQL specific dangerous functions
	/sys_exec/i,
	/sys_eval/i,
	
	// Stacked queries (multiple statements)
	/;\s*(drop|delete|truncate|alter|create|grant|revoke)/i,
	
	// Union-based injection patterns
	/union\s+.*\s+select.*\s+from\s+information_schema/i,
	/union\s+.*\s+select.*\s+from\s+pg_/i,
	/union\s+.*\s+select.*\s+from\s+mysql\./i,
	/union\s+select.*information_schema/i,
	/union\s+select.*pg_catalog/i,
];

/**
 * Patterns that are suspicious but might be legitimate in some contexts.
 * These generate warnings but don't block execution.
 */
const SUSPICIOUS_SQL_PATTERNS = [
	// Potential blind SQL injection
	/sleep\s*\(/i,
	/benchmark\s*\(/i,
	/waitfor\s+delay/i,
	/pg_sleep/i,
	
	// Information disclosure
	/@@version/i,
	/version\s*\(/i,
	/current_user/i,
	/user\s*\(/i,
	/database\s*\(/i,
	
	// Potential privilege escalation
	/grant\s+/i,
	/revoke\s+/i,
	
	// Dangerous DDL operations
	/drop\s+database/i,
	/drop\s+schema/i,
];

/**
 * Validate a SQL query for security issues.
 * 
 * This is defense-in-depth and should be used alongside parameterized queries.
 * It catches obvious injection attempts but is not a substitute for proper
 * parameterization.
 */
export function validateSqlQuery(driver: DbDriver, query: string, params?: unknown[]): QueryValidationResult {
	const warnings: string[] = [];
	const errors: string[] = [];
	
	// Skip validation for non-SQL drivers
	if (driver === 'mongodb' || driver === 'redis') {
		return { safe: true, warnings, errors };
	}
	
	// Check for dangerous patterns
	for (const pattern of DANGEROUS_SQL_PATTERNS) {
		if (pattern.test(query)) {
			errors.push(`Query contains dangerous pattern: ${pattern.source}`);
		}
	}
	
	// Check for suspicious patterns
	for (const pattern of SUSPICIOUS_SQL_PATTERNS) {
		if (pattern.test(query)) {
			warnings.push(`Query contains suspicious pattern: ${pattern.source}`);
		}
	}
	
	// Check if query uses parameterized values
	if (!params || params.length === 0) {
		// Look for potential string concatenation or inline values
		const hasQuotedStrings = /'[^']*'/.test(query) || /"[^"]*"/.test(query);
		const hasInlineNumbers = /=\s*\d+/.test(query) || />\s*\d+/.test(query) || /<\s*\d+/.test(query);
		
		if (hasQuotedStrings || hasInlineNumbers) {
			warnings.push(
				'Query contains inline values. Consider using parameterized queries for better security and performance.'
			);
		}
	}
	
	// Check for excessively long queries (potential DoS)
	if (query.length > 100000) {
		errors.push('Query exceeds maximum length (100KB)');
	}
	
	// Check for excessive nesting (potential DoS)
	const nestingLevel = (query.match(/\(/g) || []).length;
	if (nestingLevel > 50) {
		warnings.push('Query has excessive nesting which may impact performance');
	}
	
	return {
		safe: errors.length === 0,
		warnings,
		errors
	};
}

/**
 * Validate MongoDB query for security issues.
 */
export function validateMongoQuery(query: string): QueryValidationResult {
	const warnings: string[] = [];
	const errors: string[] = [];
	
	try {
		const parsed = JSON.parse(query);
		
		// Check for $where operator (allows arbitrary JavaScript execution)
		if (JSON.stringify(parsed).includes('$where')) {
			errors.push('MongoDB $where operator is not allowed (arbitrary code execution risk)');
		}
		
		// Check for mapReduce (can execute arbitrary JavaScript)
		if (parsed.op === 'mapReduce') {
			errors.push('MongoDB mapReduce is not allowed (arbitrary code execution risk)');
		}
		
		// Check for $function operator (allows arbitrary JavaScript execution)
		if (JSON.stringify(parsed).includes('$function')) {
			errors.push('MongoDB $function operator is not allowed (arbitrary code execution risk)');
		}
		
	} catch (err) {
		errors.push('Invalid MongoDB query JSON');
	}
	
	return {
		safe: errors.length === 0,
		warnings,
		errors
	};
}

/**
 * Validate Redis command for security issues.
 */
export function validateRedisCommand(command: string): QueryValidationResult {
	const warnings: string[] = [];
	const errors: string[] = [];
	
	let cmd: string;
	
	// Parse command
	const trimmed = command.trim();
	if (trimmed.startsWith('[')) {
		try {
			const parsed = JSON.parse(trimmed);
			if (Array.isArray(parsed) && parsed.length > 0) {
				cmd = String(parsed[0]).toUpperCase();
			} else {
				errors.push('Invalid Redis command format');
				return { safe: false, warnings, errors };
			}
		} catch {
			errors.push('Invalid Redis command JSON');
			return { safe: false, warnings, errors };
		}
	} else {
		cmd = (trimmed.split(/\s+/)[0] ?? '').toUpperCase();
	}
	
	// Block dangerous commands
	const DANGEROUS_REDIS_COMMANDS = [
		'FLUSHDB',
		'FLUSHALL',
		'SHUTDOWN',
		'CONFIG',
		'SAVE',
		'BGSAVE',
		'BGREWRITEAOF',
		'DEBUG',
		'MIGRATE',
		'SLAVEOF',
		'REPLICAOF',
		'SCRIPT',
		'EVAL',
		'EVALSHA',
	];
	
	if (DANGEROUS_REDIS_COMMANDS.includes(cmd)) {
		errors.push(`Redis command ${cmd} is not allowed (dangerous operation)`);
	}
	
	// Warn about potentially expensive commands
	const EXPENSIVE_REDIS_COMMANDS = ['KEYS', 'SMEMBERS', 'HGETALL', 'ZRANGE'];
	if (EXPENSIVE_REDIS_COMMANDS.includes(cmd)) {
		warnings.push(`Redis command ${cmd} may be expensive on large datasets`);
	}
	
	return {
		safe: errors.length === 0,
		warnings,
		errors
	};
}

/**
 * Main validation entry point that routes to the appropriate validator.
 */
export function validateQuery(driver: DbDriver, query: string, params?: unknown[]): QueryValidationResult {
	switch (driver) {
		case 'mongodb':
			return validateMongoQuery(query);
		case 'redis':
			return validateRedisCommand(query);
		case 'mysql':
		case 'postgres':
		case 'sqlite':
			return validateSqlQuery(driver, query, params);
		default:
			return { safe: true, warnings: [], errors: [] };
	}
}
