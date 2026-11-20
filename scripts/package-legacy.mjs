// Packages the current (legacy) browser game into dist-game/ — the folder Vercel publishes and Tauri embeds in the installer.
// Babylon.js and Havok already live in vendor/ (offline, frozen versions), so this is a plain copy that skips Windows
// Zone.Identifier leftovers.
//
// It also ships the service worker (sw.js) with its MANIFEST written in: every file with a content fingerprint, the list the game
// downloads on the first visit (`pre`: code, libraries, cars, textures — everything except the big character pages and the HD cars,
// which are cached as the game asks for them) and the version of the whole set. With it, the installed game opens from the device
// and works offline; a new deploy changes the version, and only the files whose fingerprint changed are downloaded again.
// Usage: node scripts/package-legacy.mjs

import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'dist-game');
const ENTRIES = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'assets', 'vendor'];
// Not in the first download (cached on demand, by fingerprint): the character pages (~400 MB), the HD cars of the tuning garage and the
// car radio's music (~26 MB).
const ON_DEMAND = [/^assets\/baked\/npcs\//, /^assets\/cars\/hd\//, /^assets\/_npcprev\//, /^assets\/music\//];

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
for (const entry of ENTRIES) {
	await cp(join(ROOT, entry), join(OUTPUT, entry), {
		recursive: true,
		filter: (source) => !source.includes('Zone.Identifier'),
	});
}

// ------------------------------------------------------------------ the service worker manifest
async function* walk(dir) {
	for (const d of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, d.name);
		if (d.isDirectory()) yield* walk(p);
		else yield p;
	}
}
const files = {}, pre = [];
let preBytes = 0, allBytes = 0;
const whole = createHash('sha1');
for await (const abs of walk(OUTPUT)) {
	const path = relative(OUTPUT, abs).split(sep).join('/');
	if (path === 'sw.js') continue;
	const buf = await readFile(abs);
	const h = createHash('sha1').update(buf).digest('hex').slice(0, 12);
	files[path] = h;
	allBytes += buf.length;
	if (!ON_DEMAND.some((re) => re.test(path))) { pre.push(path); preBytes += buf.length; }
}
for (const path of Object.keys(files).sort()) whole.update(path + ':' + files[path] + '\n');
const version = whole.digest('hex').slice(0, 10);
const swPath = join(OUTPUT, 'sw.js'), sw = await readFile(swPath, 'utf8');
const line = /^self\.DM_MANIFEST = null;.*$/m;
if (!line.test(sw)) throw new Error('sw.js: the DM_MANIFEST line was not found');
await writeFile(swPath, sw.replace(line, `self.DM_MANIFEST = ${JSON.stringify({ v: version, pre, files })};`));

const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
console.log(`legacy game packaged into ${OUTPUT}`);
console.log(`service worker: version ${version} · ${Object.keys(files).length} files (${mb(allBytes)}) · first download ${pre.length} files (${mb(preBytes)})`);
