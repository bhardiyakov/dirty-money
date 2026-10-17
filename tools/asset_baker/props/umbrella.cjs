// ============================================================================
// Pedestrian umbrella (src/npc/NPC.js, in the rain): baked HERE with the game's own SpriteBaker and Pixel ramps, at the 56° camera of
// the 2.5D characters — the eight-panel canopy sits above the head, shifted north like the rest of the drawing. One CELL per canopy
// colour, centred in a PITCH-wide slot, side by side in a single power-of-two sheet (WebGL1 resamples any other size):
// assets/baked/props/umbrella.webp (lossless RGBA, binary alpha). The game only loads it.
// CELL, PITCH and pixels per metre must match NPC.UMB (N, pitch, ppu); the game checks the sheet width when it loads.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const COLORS = ['#d9453a', '#2f6fd0', '#e8c22c', '#2fa36a', '#7a4fb8', '#3a404a', '#e8742c', '#e86aa0'];
const CELL = 176, PITCH = 256, PPU = 36, ELEVATION = 56;
const SOURCES = ['src/storage/Store.js', 'src/config.js', 'src/art/Pixel.js', 'src/art/SpriteBaker.js'];      // (config.js reads the saved settings through Store)

// The game's art code (classic scripts) in a sandbox: { Pixel, SpriteBaker }.
function loadArt(root) {
	const ctx = vm.createContext({ console });
	for (const f of SOURCES) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
	return vm.runInContext('({ Pixel, SpriteBaker })', ctx);
}

// RGBA of one canopy colour: canopy (ramp 1, panels alternate with ramp 2), shaft and tip (ramp 3).
function cellRGBA({ Pixel, SpriteBaker: B }, color) {
	const index = B.bake([
		B.ellipsoid(1, [0, 2.05, 0], [0.98, 0.34, 0.98], 0.2, { cut: 2.03, panels: 8, mat2: 2 }),
		B.capsule(3, [0, 1.3, 0], [0, 2.38, 0], 0.025),
		B.sphere(3, [0, 2.42, 0], 0.05),
	], { size: CELL, ppu: PPU, elev: ELEVATION, shadow: false });
	const base = Pixel.hex(color), ramps = { 1: Pixel.ramp5(base), 2: Pixel.ramp5(Pixel.scale(base, 0.74)), 3: Pixel.ramp5('#d8dde4') };
	const rgba = new Uint8Array(CELL * CELL * 4);
	for (let p = 0; p < CELL * CELL; p++) {
		if (!index[p * 4 + 3]) continue;
		const rgb = ramps[index[p * 4]][index[p * 4 + 1]];
		rgba.set([rgb[0], rgb[1], rgb[2], 255], p * 4);
	}
	return rgba;
}

// Writes <outDir>/props/umbrella.webp. sharp = the WebP encoder (tools/asset_baker/node_modules).
async function bakeUmbrella(root, outDir, sharp) {
	const art = loadArt(root), width = PITCH * COLORS.length, margin = (PITCH - CELL) / 2, sheet = Buffer.alloc(width * PITCH * 4);
	COLORS.forEach((color, i) => {
		const cell = cellRGBA(art, color);
		for (let y = 0; y < CELL; y++) sheet.set(cell.subarray(y * CELL * 4, (y + 1) * CELL * 4), ((y + margin) * width + i * PITCH + margin) * 4);
	});
	const webp = await sharp(sheet, { raw: { width, height: PITCH, channels: 4 } }).webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
	const file = path.join(outDir, 'props', 'umbrella.webp');
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, webp);
	return { file: path.relative(root, file), width, height: PITCH, bytes: webp.length };
}

module.exports = { bakeUmbrella, COLORS, CELL, PITCH, PPU };
