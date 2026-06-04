export const BLOCKED_EXTENSIONS = new Set([
	'.exe', '.dll', '.com', '.bat', '.cmd', '.ps1', '.psm1', '.psd1',
	'.vbs', '.vbe', '.jse', '.wsf', '.wsh', '.msi', '.msp',
	'.scr', '.pif', '.scf', '.lnk', '.inf',
	'.sh', '.bash', '.zsh', '.ksh', '.csh',
	'.app', '.dmg', '.pkg',
	'.elf', '.so', '.o', '.ko',
	'.jar', '.class',
	'.pyc', '.pyo',
]);

const MAGIC_BYTES: Record<string, Uint8Array[]> = {
	png: [new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
	jpeg: [new Uint8Array([0xFF, 0xD8, 0xFF])],
	webp: [new Uint8Array([0x52, 0x49, 0x46, 0x46])],
	gif: [new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
	pdf: [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
	zip: [new Uint8Array([0x50, 0x4B, 0x03, 0x04]), new Uint8Array([0x50, 0x4B, 0x05, 0x06]), new Uint8Array([0x50, 0x4B, 0x07, 0x08])],
	gzip: [new Uint8Array([0x1F, 0x8B])],
	bmp: [new Uint8Array([0x42, 0x4D])],
	tiff: [new Uint8Array([0x49, 0x49, 0x2A, 0x00]), new Uint8Array([0x4D, 0x4D, 0x00, 0x2A])],
	mp4: [new Uint8Array([0x00, 0x00, 0x00])],
	mp3: [new Uint8Array([0x49, 0x44, 0x33])],
	json: [new Uint8Array([0x7B]), new Uint8Array([0x5B])],
	xml: [new Uint8Array([0x3C])],
	svg: [new Uint8Array([0x3C, 0x73, 0x76, 0x67])],
	html: [new Uint8Array([0x3C, 0x68, 0x74, 0x6D, 0x6C]), new Uint8Array([0x3C, 0x21, 0x44, 0x4F])],
	txt: [],
	md: [],
	css: [new Uint8Array([0x2F, 0x2A])],
};

export function isBlockedExtension(fileName: string): boolean {
	const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
	return BLOCKED_EXTENSIONS.has(ext);
}

export function matchesMagicByte(data: Uint8Array, extension: string): boolean {
	const ext = extension.toLowerCase();
	const magicList = MAGIC_BYTES[ext];
	if (!magicList || magicList.length === 0) return true;
	return magicList.some((magic) => {
		if (data.length < magic.length) return false;
		return magic.every((byte, i) => data[i] === byte);
	});
}
