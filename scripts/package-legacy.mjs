// Packages the current (legacy) browser game into dist-game/ so Tauri can embed it in the installer.
// Babylon.js and Havok already live in vendor/ (offline, frozen versions), so this is a plain copy that skips Windows
// Zone.Identifier leftovers.
// Usage: node scripts/package-legacy.mjs

import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'dist-game');
const ENTRIES = ['index.html', 'manifest.webmanifest', 'src', 'assets', 'vendor'];

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
for (const entry of ENTRIES) {
	await cp(join(ROOT, entry), join(OUTPUT, entry), {
		recursive: true,
		filter: (source) => !source.includes('Zone.Identifier'),
	});
}
console.log(`legacy game packaged into ${OUTPUT}`);
