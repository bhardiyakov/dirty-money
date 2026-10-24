// tools/asset_baker/weapons_preview.cjs — folha de conferência das armas na mão: renderiza clipes escolhidos (o gerador, na hora,
// sem atlas) em algumas direções e grava um PNG ampliado. Só para conferir o desenho; não vai para o jogo.
//
//   node tools/asset_baker/weapons_preview.cjs saida.png [tipo:clipe ...] [--dirs 4,6,8] [--zoom 3] [--frame 0] [--k 1]
//   ex.: node tools/asset_baker/weapons_preview.cjs /tmp/a.png protagonista:aim:pistol protagonista_armas:aim:rpg --dirs 2,4,6,8,12
//
// Direções do jogo: 0 = norte (de costas), 4 = leste, 8 = sul (de frente), 12 = oeste (16 no total).
const fs = require('fs'), path = require('path'), vm = require('vm');
const HERE = __dirname, GEN_DIR = path.join(HERE, 'generator');
const GEN = ['NpcGenCore.js', 'NpcGenChar.js', 'NpcGenRender.js', 'NpcGenAnims.js', 'NpcGenTypes.js', 'NpcGenBuild.js', 'malha3d.js', 'NpcGenMesh.js', 'veiculos_occ.js', 'armas_sprites.js']
	.filter((f) => fs.existsSync(path.join(GEN_DIR, f)));
for (const f of GEN) vm.runInThisContext(fs.readFileSync(path.join(GEN_DIR, f), 'utf8'), { filename: path.join(GEN_DIR, f) });
const G = vm.runInThisContext('(() => { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); return G; })()');
const sharp = require(path.join(HERE, 'node_modules', 'sharp'));

const args = process.argv.slice(2), out = args.shift();
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const dirs16 = opt('--dirs', '4,8,12').split(',').map(Number), zoom = +opt('--zoom', 3), frameSel = opt('--frame', 'all'), K = +opt('--k', G.HD_K);      // (k: px por unidade — HD_K = o dos atlas do jogo)
const items = args;

(async () => {
	const rows = [];
	for (const it of items) {
		const [type, name, w] = it.split(':');
		const spec = G.variantSpec(type, 0), ramps = G.rampsFor(spec), R = G.rendererFor(G.BY_ID[type], { k: K });
		const c = G.clipDef(name, w || 'none', type, {});
		const poses = frameSel === 'all' ? c.poses : [c.poses[Math.min(c.poses.length - 1, +frameSel)]];
		for (const d16 of dirs16) {
			const d = Math.round((d16 * c.dirs) / 16) % c.dirs;
			rows.push({ label: `${it} d${d16}`, frames: poses.map((p) => { const fr = R.render(p, (-360 / c.dirs) * d); return { W: fr.W, H: fr.H, rgba: G.colorize(fr, ramps) }; }) });
		}
	}
	// recorte comum (a área com pixel de todos os quadros), para a folha não ficar enorme
	let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
	for (const r of rows) for (const f of r.frames) for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) if (f.rgba[(y * f.W + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
	const cw = x1 - x0 + 3, ch = y1 - y0 + 3, cols = Math.max(...rows.map((r) => r.frames.length));
	const W = cols * cw, H = rows.length * ch, buf = Buffer.alloc(W * H * 4);
	for (let i = 0; i < W * H; i++) { buf[i * 4] = 0x6a; buf[i * 4 + 1] = 0x70; buf[i * 4 + 2] = 0x80; buf[i * 4 + 3] = 255; }
	rows.forEach((r, ri) => r.frames.forEach((f, fi) => {
		for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
			const s = (y * f.W + x) * 4, a = f.rgba[s + 3] / 255; if (!a) continue;
			const o = ((ri * ch + (y - y0) + 1) * W + fi * cw + (x - x0) + 1) * 4;
			for (let k = 0; k < 3; k++) buf[o + k] = Math.round(f.rgba[s + k] * a + buf[o + k] * (1 - a));
		}
	}));
	await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).resize(W * zoom, H * zoom, { kernel: 'nearest' }).png().toFile(out);
	console.log(out, rows.map((r) => `${r.label} (${r.frames.length})`).join(' · '));
})();
