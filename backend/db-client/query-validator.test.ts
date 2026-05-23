import { describe, expect, test } from 'bun:test';
import { validateQuery, validateSqlQuery, validateMongoQuery, validateRedisCommand } from './query-validator';

describe('SQL Query Validation', () => {
	test('should allow safe SELECT queries', () => {
		const result = validateSqlQuery('postgres', 'SELECT * FROM users WHERE id = $1', [123]);
		expect(result.safe).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test('should block xp_cmdshell attempts', () => {
		const result = validateSqlQuery('mysql', "SELECT * FROM users; EXEC xp_cmdshell('dir')");
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block COPY FROM PROGRAM attempts', () => {
		const result = validateSqlQuery('postgres', "COPY users FROM PROGRAM 'cat /etc/passwd'");
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block INTO OUTFILE attempts', () => {
		const result = validateSqlQuery('mysql', "SELECT * FROM users INTO OUTFILE '/tmp/users.txt'");
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block stacked DROP queries', () => {
		const result = validateSqlQuery('postgres', 'SELECT * FROM users; DROP TABLE users');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block UNION-based information_schema injection', () => {
		const result = validateSqlQuery('mysql', 'SELECT * FROM users UNION SELECT * FROM information_schema.tables');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should warn about inline string values', () => {
		const result = validateSqlQuery('postgres', "SELECT * FROM users WHERE name = 'admin'");
		expect(result.safe).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	test('should warn about inline numeric values', () => {
		const result = validateSqlQuery('mysql', 'SELECT * FROM users WHERE id = 123');
		expect(result.safe).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	test('should warn about SLEEP function', () => {
		const result = validateSqlQuery('mysql', 'SELECT * FROM users WHERE id = 1 AND SLEEP(5)');
		expect(result.safe).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	test('should block excessively long queries', () => {
		const longQuery = 'SELECT * FROM users WHERE ' + 'id = 1 OR '.repeat(20000) + 'id = 2';
		const result = validateSqlQuery('postgres', longQuery);
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should warn about excessive nesting', () => {
		const nestedQuery = 'SELECT * FROM users WHERE id IN (' + '('.repeat(60) + '1' + ')'.repeat(60) + ')';
		const result = validateSqlQuery('postgres', nestedQuery);
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});

describe('MongoDB Query Validation', () => {
	test('should allow safe find queries', () => {
		const result = validateMongoQuery('{"op":"find","filter":{"name":"test"}}');
		expect(result.safe).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test('should block $where operator', () => {
		const result = validateMongoQuery('{"op":"find","filter":{"$where":"this.name == \'admin\'"}}');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block mapReduce operation', () => {
		const result = validateMongoQuery('{"op":"mapReduce","map":"function() {}","reduce":"function() {}"}');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block $function operator', () => {
		const result = validateMongoQuery('{"op":"aggregate","pipeline":[{"$addFields":{"result":{"$function":{"body":"function() { return 1; }","args":[],"lang":"js"}}}}]}');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should reject invalid JSON', () => {
		const result = validateMongoQuery('not valid json');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});
});

describe('Redis Command Validation', () => {
	test('should allow safe GET commands', () => {
		const result = validateRedisCommand('GET mykey');
		expect(result.safe).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test('should allow safe SET commands', () => {
		const result = validateRedisCommand('["SET", "mykey", "myvalue"]');
		expect(result.safe).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test('should block FLUSHDB command', () => {
		const result = validateRedisCommand('FLUSHDB');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block FLUSHALL command', () => {
		const result = validateRedisCommand('["FLUSHALL"]');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block CONFIG command', () => {
		const result = validateRedisCommand('CONFIG GET *');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block EVAL command', () => {
		const result = validateRedisCommand('EVAL "return redis.call(\'GET\', KEYS[1])" 1 mykey');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should block SCRIPT command', () => {
		const result = validateRedisCommand('SCRIPT LOAD "return 1"');
		expect(result.safe).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});

	test('should warn about KEYS command', () => {
		const result = validateRedisCommand('KEYS *');
		expect(result.safe).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});

	test('should warn about SMEMBERS command', () => {
		const result = validateRedisCommand('["SMEMBERS", "myset"]');
		expect(result.safe).toBe(true);
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});

describe('Main validateQuery function', () => {
	test('should route to SQL validator for postgres', () => {
		const result = validateQuery('postgres', 'SELECT * FROM users WHERE id = $1', [123]);
		expect(result.safe).toBe(true);
	});

	test('should route to MongoDB validator', () => {
		const result = validateQuery('mongodb', '{"op":"find","filter":{"name":"test"}}');
		expect(result.safe).toBe(true);
	});

	test('should route to Redis validator', () => {
		const result = validateQuery('redis', 'GET mykey');
		expect(result.safe).toBe(true);
	});

	test('should block dangerous SQL in postgres', () => {
		const result = validateQuery('postgres', "SELECT * FROM users; DROP TABLE users");
		expect(result.safe).toBe(false);
	});

	test('should block dangerous MongoDB operations', () => {
		const result = validateQuery('mongodb', '{"op":"find","filter":{"$where":"this.name == \'admin\'"}}');
		expect(result.safe).toBe(false);
	});

	test('should block dangerous Redis commands', () => {
		const result = validateQuery('redis', 'FLUSHALL');
		expect(result.safe).toBe(false);
	});
});
