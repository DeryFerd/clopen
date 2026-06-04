import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { debug } from '$shared/utils/logger';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const KEY_FILE = join(homedir(), '.clopen', 'credential-key');
const CIPHER_VERSION = 'v1';

let cachedKey: CryptoKey | null = null;

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
	}
	return bytes;
}

function base64Encode(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes));
}

function base64Decode(str: string): Uint8Array {
	const binary = atob(str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function loadOrCreateKey(): Promise<CryptoKey> {
	const envKey = process.env.CLOPEN_CREDENTIAL_KEY;
	if (envKey) {
		const raw = hexToBytes(envKey);
		const rawArr = new ArrayBuffer(raw.byteLength);
		new Uint8Array(rawArr).set(raw);
		return await crypto.subtle.importKey('raw', rawArr, ALGORITHM, false, ['encrypt', 'decrypt']);
	}

	let raw: Uint8Array;
	try {
		const stored = await readFile(KEY_FILE, 'utf-8');
		raw = hexToBytes(stored.trim());
	} catch {
		raw = crypto.getRandomValues(new Uint8Array(32));
		await mkdir(join(homedir(), '.clopen'), { recursive: true });
		await writeFile(KEY_FILE, bytesToHex(raw), 'utf-8');
		debug.log('auth', `Generated credential encryption key at ${KEY_FILE}`);
	}

	const rawArr = new ArrayBuffer(raw.byteLength);
	new Uint8Array(rawArr).set(raw);
	return await crypto.subtle.importKey('raw', rawArr, ALGORITHM, false, ['encrypt', 'decrypt']);
}

async function getKey(): Promise<CryptoKey> {
	if (!cachedKey) {
		cachedKey = await loadOrCreateKey();
	}
	return cachedKey;
}

export function isEncrypted(value: string): boolean {
	return value.startsWith(`${CIPHER_VERSION}:`);
}

export async function encryptCredential(plaintext: string): Promise<string> {
	const key = await getKey();
	const ivRaw = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const ivArr = new ArrayBuffer(12);
	new Uint8Array(ivArr).set(ivRaw);
	const encoded = new TextEncoder().encode(plaintext);
	const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv: ivArr }, key, encoded);
	const encryptedBytes = new Uint8Array(encrypted);
	const authTag = encryptedBytes.slice(-16);
	const ciphertext = encryptedBytes.slice(0, -16);
	const payload = `${CIPHER_VERSION}:${base64Encode(ivRaw)}:${base64Encode(authTag)}:${base64Encode(ciphertext)}`;
	return payload;
}

export async function decryptCredential(payload: string): Promise<string> {
	if (!isEncrypted(payload)) return payload;

	const parts = payload.split(':');
	if (parts.length !== 4) return payload;

	const ivRaw = base64Decode(parts[1]);
	const authTag = base64Decode(parts[2]);
	const ciphertext = base64Decode(parts[3]);

	const combined = new Uint8Array(ciphertext.length + authTag.length);
	combined.set(ciphertext, 0);
	combined.set(authTag, ciphertext.length);

	const key = await getKey();
	const ivArr = new ArrayBuffer(12);
	new Uint8Array(ivArr).set(ivRaw);
	const combinedBuf = new ArrayBuffer(combined.byteLength);
	new Uint8Array(combinedBuf).set(combined);
	const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv: ivArr }, key, combinedBuf);
	return new TextDecoder().decode(decrypted);
}

export function resetCredentialKeyCache(): void {
	cachedKey = null;
}
