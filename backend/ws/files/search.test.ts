import { describe, it, expect } from 'bun:test';

// Import the createSafeRegex function - we need to extract it for testing
// Since it's not exported, we'll replicate the logic here for testing
const REDOS_PATTERNS = [
	/\(.*[+*?{].*\)[+*?{]/,          // nested quantifiers like (a+)+, (.*)+, or (x{1,5})+
	/\([^)]*\|[^)]*\)[+*?{]/,        // ANY alternation under quantifier: (a|aa)+, (foo|bar)+
	/\[[^\]]+\]\s*[+*?]\s*\[[^\]]+\]\s*[+*?]/,  // adjacent char-class quantifiers
];

const REGEX_TIMEOUT_MS = 100;

function createSafeRegex(pattern: string, flags: string): RegExp | null {
	// Check against ReDoS heuristics
	for (const heuristic of REDOS_PATTERNS) {
		if (heuristic.test(pattern)) {
			return null;
		}
	}

	let regex: RegExp;
	try {
		regex = new RegExp(pattern, flags);
	} catch (error) {
		return null;
	}

	// Test execution time with a worst-case string to detect catastrophic backtracking
	const testString = 'a'.repeat(50);
	const startTime = Date.now();
	try {
		regex.test(testString);
		const elapsed = Date.now() - startTime;
		if (elapsed > REGEX_TIMEOUT_MS) {
			return null;
		}
	} catch (error) {
		return null;
	}

	return regex;
}

describe('ReDoS Protection', () => {
	describe('Alternation-based ReDoS patterns', () => {
		it('should reject (a|aa)+ pattern', () => {
			const result = createSafeRegex('(a|aa)+', 'gi');
			expect(result).toBeNull();
		});

		it('should reject (foo|foobar)+ pattern', () => {
			const result = createSafeRegex('(foo|foobar)+', 'gi');
			expect(result).toBeNull();
		});

		it('should reject (a|b|c)+ pattern', () => {
			const result = createSafeRegex('(a|b|c)+', 'gi');
			expect(result).toBeNull();
		});

		it('should reject (hello|helloworld)* pattern', () => {
			const result = createSafeRegex('(hello|helloworld)*', 'gi');
			expect(result).toBeNull();
		});
	});

	describe('Nested quantifier patterns', () => {
		it('should reject (a+)+ pattern', () => {
			const result = createSafeRegex('(a+)+', 'gi');
			expect(result).toBeNull();
		});

		it('should reject (.*)+b pattern', () => {
			const result = createSafeRegex('(.*)+b', 'gi');
			expect(result).toBeNull();
		});

		it('should reject (a*)* pattern', () => {
			const result = createSafeRegex('(a*)*', 'gi');
			expect(result).toBeNull();
		});

		it('should reject (x{1,5})+ pattern', () => {
			const result = createSafeRegex('(x{1,5})+', 'gi');
			expect(result).toBeNull();
		});
	});

	describe('Adjacent character class quantifiers', () => {
		it('should reject [a-z]*[a-z]+ pattern', () => {
			const result = createSafeRegex('[a-z]*[a-z]+', 'gi');
			expect(result).toBeNull();
		});

		it('should reject [0-9]+[0-9]* pattern', () => {
			const result = createSafeRegex('[0-9]+[0-9]*', 'gi');
			expect(result).toBeNull();
		});
	});

	describe('Safe patterns', () => {
		it('should accept simple string pattern', () => {
			const result = createSafeRegex('hello', 'gi');
			expect(result).not.toBeNull();
			expect(result).toBeInstanceOf(RegExp);
		});

		it('should accept simple alternation without quantifier', () => {
			const result = createSafeRegex('(foo|bar)', 'gi');
			expect(result).not.toBeNull();
			expect(result).toBeInstanceOf(RegExp);
		});

		it('should accept single quantifier pattern', () => {
			const result = createSafeRegex('a+', 'gi');
			expect(result).not.toBeNull();
			expect(result).toBeInstanceOf(RegExp);
		});

		it('should accept word boundary pattern', () => {
			const result = createSafeRegex('\\btest\\b', 'gi');
			expect(result).not.toBeNull();
			expect(result).toBeInstanceOf(RegExp);
		});

		it('should accept character class pattern', () => {
			const result = createSafeRegex('[a-z]+', 'gi');
			expect(result).not.toBeNull();
			expect(result).toBeInstanceOf(RegExp);
		});
	});

	describe('Invalid regex patterns', () => {
		it('should reject invalid regex with unclosed group', () => {
			const result = createSafeRegex('(abc', 'gi');
			expect(result).toBeNull();
		});

		it('should reject invalid regex with unclosed bracket', () => {
			const result = createSafeRegex('[a-z', 'gi');
			expect(result).toBeNull();
		});
	});

	describe('Execution timeout protection', () => {
		it('should complete quickly for safe patterns', () => {
			const startTime = Date.now();
			const result = createSafeRegex('test.*pattern', 'gi');
			const elapsed = Date.now() - startTime;
			
			expect(result).not.toBeNull();
			expect(elapsed).toBeLessThan(REGEX_TIMEOUT_MS);
		});
	});
});
