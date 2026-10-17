#!/usr/bin/env node
// ============================================================================
// tools/asset_baker/bake.cjs — BUILD-TIME ASSET BAKING dos personagens 2,5D.
//
// O gerador procedural (tools/asset_baker/generator: malha 3D, roupas, animações, sombreado, efeitos e o dano pintado) roda AQUI, no
// Node, e grava arquivos estáticos que o jogo só carrega — o navegador não gera mais nenhum desenho durante o jogo:
//
//   assets/baked/npcs/<tipo>.json         manifesto: clipes, retângulos dos quadros, páginas e as camadas de dano (formato abaixo)
//   assets/baked/npcs/<tipo>/p<i>.webp    páginas do atlas (WebP sem perdas; R = byte 0, G = byte 1 do pixel de 2 bytes, B = 0)
//   assets/baked/npcs/<tipo>/d<n>p<i>.webp CAMADA DE DANO n (1 sujo, 2 machucado, 3 muito machucado) da página i: mesmo tamanho e mesmo
//                                         layout da página base; pixel ≠ (0, 0) = o pixel machucado, (0, 0) = igual ao da base. Quase toda
//                                         vazia (comprime para poucos KB) — o jogo junta base + camada na decodificação (NpcArt).
//   assets/baked/npcs/protagonista_mao_<bolsa>.json (+ páginas) os clipes de CARREGAR do protagonista com a bolsa da mão (maleta, bolsa
//                                         de lona, mala de rodinhas): a bolsa só aparece nesses clipes, então ela não muda o resto do visual
//   assets/baked/npc-data.json            dados do jogo: tipos, variantes de cor, paletas, ficha do jogador, ponta do cano das armas,
//                                         sentar no carro, lista dos manifestos e o hash do gerador
//   assets/baked/wardrobe.worker.js       o gerador empacotado num Worker — carregado SÓ pela tela de equipamento (src/player/Wardrobe.js),
//                                         que monta o visual de uma roupa nova e o guarda no IndexedDB
//
//   node tools/asset_baker/bake.cjs [opções] [tipos...]     (sem tipos: todos; `npm run bake` na raiz faz o mesmo)
//     -j N, --workers N   Workers em paralelo (padrão: núcleos − 1, de 1 a 8; ~0,5 GB de memória cada no pior tipo)
//     --no-dmg            sem as camadas de dano (mais rápido; o jogo mostra o desenho limpo nos machucados)
//     --data              só npc-data.json e wardrobe.worker.js (sem renderizar: mudou paleta, tipo ou o código do Worker)
//     --fast              WebP com esforço 4 (~4× mais rápido, ~8% maior) — para testes
//     --clips LISTA       só estes clipes: "walk" = walk:* ; "idle:none" ; curinga "shoot:*", "*:pistol" (exige --out: atlas incompletos)
//     --out PASTA         onde gravar (padrão: assets/baked do repositório)
//     --dirs 8            no máximo 8 direções (só as pares)
//     --dry               renderiza e codifica sem gravar (mede tempo e tamanho)
//     --list              lista os tipos (clipes, quadros, quadros com dano) e sai
//
// Manifesto (<tipo>.json): { v, id, label, k, frame, pivot, scale, pages: [{ w, h, g, par, file, bytes }], clips: { "nome:arma": { fps,
// loop, n, dirs, pd, f } }, dmg: { clips: [chaves com dano], levels: { "1": { "<página>": "<arquivo da camada>" }, "2": …, "3": … } } }
// f = [x, y, w, h, ox, oy] por quadro (dir·n + quadro): retângulo NA PÁGINA pd[dir] e o canto superior esquerdo relativo aos pés.
// ============================================================================
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), crypto = require('crypto');

const HERE = __dirname, ROOT = path.resolve(HERE, '..', '..');
const GEN_DIR = path.join(HERE, 'generator');
// O gerador, na ordem de dependência (malha3d.js define NPC_MESH3D, que o NpcGenMesh lê).
const GEN = ['NpcGenCore.js', 'NpcGenChar.js', 'NpcGenRender.js', 'NpcGenAnims.js', 'NpcGenTypes.js', 'NpcGenBuild.js', 'malha3d.js', 'NpcGenMesh.js'];
const WORKER_MAIN = path.join(HERE, 'wardrobe', 'worker-main.js');

// Clipes que ganham camada de dano. NPCs: o que eles fazem machucados (fugir, render-se, cair, brigar, atirar). Jogador (os três atlas
// do protagonista e os visuais montados no guarda-roupa): também o que ele mais faz andando por aí machucado.
const DMG_NPC = ['idle', 'walk', 'run', 'scared', 'hurt', 'dead', 'surrender', 'kneel', 'aim', 'shoot', 'draw', 'holdup', 'punch', 'punchL', 'kick',
	'flail', 'lie', 'getup', 'tumble', 'swing'];
const DMG_PLAYER = DMG_NPC.concat(['crouch', 'sneak', 'strafe', 'roll', 'walk_up', 'climb', 'walk_heavy', 'run_heavy', 'idle_heavy', 'stab',
	'idle_hold', 'walk_hold', 'run_hold', 'idle_pull', 'walk_pull']);
const PLAYER_TYPES = new Set(['protagonista', 'protagonista_tatico', 'protagonista_armas']);
const dmgNames = (id) => new Set(PLAYER_TYPES.has(id) ? DMG_PLAYER : DMG_NPC);
const DMG_LEVELS = [1, 2, 3];
// Atlas EXTRAS (não são tipos do gerador): os clipes de carregar a bolsa da mão com a ficha do protagonista — um por bolsa. base = a ficha
// (e o tipo para as armas desenhadas), hand = a bolsa, keys(G) = os clipes.
const HAND_KINDS = ['briefcase', 'duffel', 'suitcase'];
const EXTRAS = {};
for (const h of HAND_KINDS) EXTRAS['protagonista_mao_' + h] = { base: 'protagonista', hand: h, keys: (G) => G.PLAYER_HAND.concat(h === 'suitcase' ? G.PLAYER_PULL : []) };

function loadGen() {
	for (const f of GEN) vm.runInThisContext(fs.readFileSync(path.join(GEN_DIR, f), 'utf8'), { filename: path.join(GEN_DIR, f) });
	return vm.runInThisContext('(() => { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); return G; })()');
}
// Hash do gerador (código + malha): vai no npc-data.json e no Worker do guarda-roupa — os visuais guardados no aparelho são de uma
// versão do gerador; mudou o desenho, eles são refeitos (PlayerLook.ck) sem precisar subir número de versão à mão.
function genHash() {
	const h = crypto.createHash('sha1');
	for (const f of GEN) h.update(fs.readFileSync(path.join(GEN_DIR, f)));
	return h.digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------- WebP
// Página RG (2 bytes por pixel) → WebP sem perdas RGB (R = byte 0, G = byte 1, B = 0). `exact`: o codificador não mexe em nada.
let sharp = null;
async function webp(rg, w, h, effort) {
	if (!sharp) { sharp = require('sharp'); sharp.concurrency(1); sharp.cache(false); }
	const n = w * h, rgb = Buffer.alloc(n * 3);
	for (let i = 0, j = 0; i < n; i++, j += 3) { rgb[j] = rg[i * 2]; rgb[j + 1] = rg[i * 2 + 1]; }
	return sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).webp({ lossless: true, exact: true, effort, quality: effort >= 6 ? 100 : 80 }).toBuffer();
}

// ---------------------------------------------------------------- um tipo (num Worker)
// Renderiza todos os clipes, empacota as páginas e grava; depois, para cada nível de dano, renderiza os clipes com dano e grava só a
// DIFERENÇA de cada quadro, no mesmo retângulo da página base (o dano só repinta a roupa e a pele: a geometria, o recorte e os quadros
// repetidos são os mesmos). Devolve os números.
async function buildType(G, job, progress) {
	const { id, keys, k, dirs, out, dry, dmg, effort } = job, base = job.base || id, spec = G.BY_ID[base], t0 = Date.now();
	const opts = dirs ? { hand: job.hand || null, dirs } : { hand: job.hand || null };
	let R = G.rendererFor(spec, { k });
	const tb = Date.now(), clips = [];
	let last = tb;
	keys.forEach((key, i) => {
		if (i) R = G.rendererFor(spec, { k });                         // (rendererFor também arma o esqueleto global da ficha)
		clips.push(G.renderClip(R, key, base, opts));
		const t = Date.now(); if (t - last > 15000) { last = t; progress(['base', i + 1, keys.length, key]); }
	});
	const a = G.atlasOf(clips, k);
	clips.length = 0;
	const tr = Date.now(), dir = path.join(out, 'npcs', id), pages = [];
	if (!dry) fs.mkdirSync(dir, { recursive: true });
	let bytes = 0, area = 0, frames = 0;
	for (let i = 0; i < a.pages.length; i++) {
		const P = a.pages[i], buf = await webp(P.data, P.w, P.h, effort), file = `${id}/p${i}.webp`;
		if (!dry) fs.writeFileSync(path.join(out, 'npcs', file), buf);
		bytes += buf.length; area += P.w * P.h;
		pages.push({ w: P.w, h: P.h, g: P.g, par: P.par, file, bytes: buf.length });
	}
	for (const c of Object.values(a.clips)) frames += c.n * c.dirs;
	const te = Date.now();

	// camadas de dano
	const names = dmgNames(base), dkeys = dmg ? keys.filter((key) => names.has(key.split(':')[0])) : [];
	const levels = {}, stat = { frames: 0, mismatch: 0, conflict: 0, bytes: 0 };
	for (const lv of dkeys.length ? DMG_LEVELS : []) {
		const sp = Object.assign({}, spec, { dmg: lv }), ov = new Map(), touched = new Set();
		dkeys.forEach((key, i) => {
			const RL = G.rendererFor(sp, { k }), c = G.renderClip(RL, key, base, opts), m = a.clips[key];
			for (let d = 0; d < c.dirs; d++) {
				const pi = m.pd[d], P = a.pages[pi], W = P.w;
				let O = ov.get(pi);
				if (!O) ov.set(pi, (O = new Uint8Array(P.w * P.h * 2)));
				for (let fi = 0; fi < c.n; fi++) {
					const f = c.frames[d][fi], r = m.f[d * m.n + fi];
					stat.frames++;
					if (!f.w && !r[2]) continue;
					if (f.w !== r[2] || f.h !== r[3] || f.ox !== r[4] || f.oy !== r[5]) { stat.mismatch++; continue; }      // (fica o desenho limpo)
					for (let y = 0; y < f.h; y++) {
						let s = y * f.w * 2, o = ((r[1] + y) * W + r[0]) * 2;
						for (let x = 0; x < f.w; x++, s += 2, o += 2) {
							const b0 = f.data[s], b1 = f.data[s + 1];
							if (b0 === P.data[o] && b1 === P.data[o + 1]) continue;
							if ((O[o] || O[o + 1]) && (O[o] !== b0 || O[o + 1] !== b1)) { stat.conflict++; continue; }   // (quadro repetido na base, diferente machucado)
							O[o] = b0; O[o + 1] = b1;
							touched.add(pi);
						}
					}
				}
			}
			const t = Date.now(); if (t - last > 15000) { last = t; progress(['dano ' + lv, i + 1, dkeys.length, key]); }
		});
		const L = levels[lv] = {};
		for (const [pi, O] of ov) {
			if (!touched.has(pi)) continue;                              // (página sem nada machucado: a base serve)
			const P = a.pages[pi], buf = await webp(O, P.w, P.h, effort), file = `${id}/d${lv}p${pi}.webp`;
			if (!dry) fs.writeFileSync(path.join(out, 'npcs', file), buf);
			L[pi] = file; stat.bytes += buf.length;
		}
	}
	const td = Date.now();
	for (const P of a.pages) P.data = null;

	const man = { v: a.v, id, label: (spec.label || id) + (job.hand ? ' (' + job.hand + ')' : ''), k: a.k, frame: a.frame, pivot: a.pivot, scale: G.fullSpec(spec).scale || 1, pages, clips: a.clips };
	if (dkeys.length) man.dmg = { clips: dkeys, levels };
	if (!dry) {
		const tmp = path.join(out, 'npcs', id + '.json.tmp');
		fs.writeFileSync(tmp, JSON.stringify(man));
		fs.renameSync(tmp, path.join(out, 'npcs', id + '.json'));
		const keep = new Set(pages.map((p) => path.basename(p.file)));
		for (const L of Object.values(levels)) for (const f of Object.values(L)) keep.add(path.basename(f));
		for (const f of fs.readdirSync(dir)) if (/\.webp$/.test(f) && !keep.has(f)) fs.unlinkSync(path.join(dir, f));      // páginas velhas
	}
	return { id, clips: Object.keys(a.clips).length, frames, pieces: a.pieces, pages: pages.length, area, bytes, dmg: stat, msBake: tb - t0, msRender: tr - tb, msEncode: te - tr, msDmg: td - te };
}

if (!isMainThread) {
	const G = loadGen();
	parentPort.on('message', (job) => {
		buildType(G, job, (p) => parentPort.postMessage({ id: job.id, progress: p }))
			.then((r) => parentPort.postMessage(r), (e) => parentPort.postMessage({ id: job.id, error: String((e && e.stack) || e) }));
	});
	return;
}

// ---------------------------------------------------------------- npc-data.json (dados do jogo, sem código do gerador)
// Campos da ficha que decidem as CORES (rampsFor): é só o que cada variante precisa levar — a forma já está desenhada no atlas.
const COLOR_KEYS = ['skin', 'hair_color', 'top_color', 'bottom_color', 'shoe_color', 'sole_color', 'lace_color', 'bag_color', 'strap_color',
	'vest_color', 'hat_color', 'accent', 'accent2', 'cargo_color', 'gender'];
function npcData(G, hash, atlases) {
	const pick = (s) => { const o = {}; for (const k of COLOR_KEYS) if (s[k] !== undefined) o[k] = s[k]; return o; };      // (null também: vence o DEFAULT)
	const types = {}, variants = {};
	for (const [id, t] of Object.entries(G.TYPES)) {
		const s = G.fullSpec(G.BY_ID[id] || {});
		types[id] = { label: s.label || id, nvar: t.nvar, groups: t.groups, clips: t.clips, guns: t.guns || {}, scale: s.scale || 1 };
		variants[id] = [];
		for (let v = 0; v < t.nvar; v++) variants[id].push(pick(G.variantSpec(id, v)));
	}
	// ponta do cano (clarão do tiro) de cada arma do jogador, no espaço do desenho (Combat.muzzleOffset)
	const muzzle = {}, spec = G.fullSpec(G.PLAYER_DEFAULT), looks = new Set();
	for (const id of PLAYER_TYPES) for (const key of G.TYPES[id].clips) { const [n, w] = key.split(':'); if (n === 'shoot') looks.add(w); }
	for (const look of looks) {
		try {
			G.setRig(G.rigFor(spec));
			const poses = G.clipPoses ? G.clipPoses('shoot', look, 'protagonista').poses : G.CLIPS.shoot.fn(G.weaponFor('protagonista', look));
			const P = poses.map((q) => (q.adult ? q.adult() : q)).find((q) => q.effects && q.effects.some((e) => e.type === 'flash'));
			if (!P) continue;
			const pos = P.effects.find((e) => e.type === 'flash').pos, kk = (spec.scale || 1) / 52;     // (52 unidades do gerador por metro)
			muzzle[look] = { p: [pos[0] * kk, pos[1] * kk, pos[2] * kk], R: Array.from(new G.Camera().R) };
		} catch (e) { console.warn('ponta do cano de ' + look + ':', e.message); }
	}
	const special = {};
	for (const [code, rgb] of Object.entries(G.SPECIAL)) special[code] = Array.from(rgb);
	return {
		v: 1, genHash: hash, OUT_K: G.OUT_K, HD_K: G.HD_K, PPU: G.PPU, geom: { frame: 112, pivot: [56, 72], refK: 0.5 },
		atlases, M: G.M, PAL: G.PAL, SPECIAL: special, DEFAULT: G.fullSpec({}), SHAPE_KEYS: G.SHAPE_KEYS.filter((k) => k !== 'dmg' && k !== 'hand'),      // (dano e bolsa da mão: atlas à parte)
		types, variants, muzzle, SIT_IN: G.SIT_IN || null,
		dmg: { npc: DMG_NPC, player: DMG_PLAYER, levels: DMG_LEVELS },
		player: {
			DEFAULT: G.PLAYER_DEFAULT, CLIPS: G.PLAYER_CLIPS, TAC: G.PLAYER_TAC, ARMS: G.PLAYER_ARMS, ARMS_LOOKS: G.ARMS_LOOKS, HAND: G.PLAYER_HAND,
			PULL: G.PLAYER_PULL, HEAVY: G.PLAYER_HEAVY, FIRST: G.PLAYER_FIRST,
			HANDS: Object.fromEntries(HAND_KINDS.map((h) => [h, 'protagonista_mao_' + h])),      // bolsa da mão → atlas pronto dos clipes de carregar
		},
	};
}
// O jogo calcula as cores do jogador (roupa tingida) com NpcData.rampsFor — uma cópia, sobre os dados, do rampsFor do gerador. Confere
// que as duas dão o mesmo resultado em todas as variantes e em fichas do jogador com cada cor da paleta (senão o build falha).
function checkRamps(G, data) {
	const ctx = vm.createContext({ console, fetch: undefined });
	vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'art', 'NpcData.js'), 'utf8') + '\nthis.NpcData = NpcData;', ctx, { filename: 'NpcData.js' });
	const D = ctx.NpcData;
	D.use(JSON.parse(JSON.stringify(data)));
	const specs = [];
	for (const id of Object.keys(G.TYPES)) for (let v = 0; v < G.TYPES[id].nvar; v++) specs.push([G.variantSpec(id, v), D.variantSpec(id, v)]);
	for (const name of Object.keys(G.PAL)) for (const f of COLOR_KEYS) if (f !== 'gender') { const s = Object.assign({}, G.PLAYER_DEFAULT, { [f]: name }); specs.push([s, s]); }
	specs.push([Object.assign({}, G.PLAYER_DEFAULT, { gender: 'f', hair_color: 'loiro' }), Object.assign({}, G.PLAYER_DEFAULT, { gender: 'f', hair_color: 'loiro' })]);
	let bad = 0;
	for (const [a, b] of specs) {
		const A = G.rampsFor(a), B = D.rampsFor(b);
		for (const m of Object.keys(A)) if (JSON.stringify(A[m]) !== JSON.stringify(B[m])) { if (bad++ < 5) console.error(`rampsFor diferente: material ${m}`, a.id || '', A[m], B[m]); }
	}
	const gk = G.shapeKey(G.PLAYER_DEFAULT).split(';').filter((p) => !/^(dmg|hand)=/.test(p)).join(';');
	if (gk !== D.shapeKey(G.PLAYER_DEFAULT)) { bad++; console.error('shapeKey diferente:', gk, D.shapeKey(G.PLAYER_DEFAULT)); }
	if (bad) throw new Error(`NpcData (src/art/NpcData.js) não bate com o gerador em ${bad} casos: ajuste o rampsFor/shapeKey de lá`);
	console.log(`paletas: NpcData.rampsFor = gerador em ${specs.length} fichas`);
}
// O gerador inteiro num Worker só (texto): a tela de equipamento carrega este arquivo e nada do gerador entra na thread principal.
function wardrobeBundle(hash) {
	const parts = [`// GERADO por tools/asset_baker/bake.cjs — não edite à mão (fonte: tools/asset_baker/generator e tools/asset_baker/wardrobe).\n` +
		`// O gerador dos personagens 2,5D empacotado num Worker: só a tela de equipamento o carrega (src/player/Wardrobe.js).\n'use strict';\nconst GEN_HASH = ${JSON.stringify(hash)};\n`];
	for (const f of GEN) parts.push(`// ---- ${f}\n` + fs.readFileSync(path.join(GEN_DIR, f), 'utf8'));
	parts.push(`// ---- wardrobe/worker-main.js\n` + fs.readFileSync(WORKER_MAIN, 'utf8'));
	return parts.join('\n');
}
function writeData(G, OUT, hash) {
	const dir = path.join(OUT, 'npcs');
	const atlases = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.json$/.test(f)).map((f) => f.slice(0, -5)).sort() : [];
	const data = npcData(G, hash, atlases);
	checkRamps(G, data);
	fs.mkdirSync(OUT, { recursive: true });
	fs.writeFileSync(path.join(OUT, 'npc-data.json'), JSON.stringify(data));
	fs.writeFileSync(path.join(OUT, 'wardrobe.worker.js'), wardrobeBundle(hash));
	console.log(`npc-data.json (${atlases.length} atlas) e wardrobe.worker.js gravados em ${path.relative(ROOT, OUT) || '.'} — gerador ${hash}`);
}

// ---------------------------------------------------------------- linha de comando
const argv = process.argv.slice(2), opt = { ids: [], workers: 0, clips: null, out: null, dirs: 0, dry: false, list: false, dmg: true, data: false, fast: false };
for (let i = 0; i < argv.length; i++) {
	const a = argv[i], val = () => { if (i + 1 >= argv.length) { console.error('falta o valor de ' + a); process.exit(2); } return argv[++i]; };
	if (a === '-j' || a === '--workers') opt.workers = +val();
	else if (a === '--clips') opt.clips = val().split(',').map((s) => s.trim()).filter(Boolean);
	else if (a === '--out') opt.out = path.resolve(val());
	else if (a === '--dirs') opt.dirs = +val();
	else if (a === '--dry') opt.dry = true;
	else if (a === '--list') opt.list = true;
	else if (a === '--no-dmg') opt.dmg = false;
	else if (a === '--data') opt.data = true;
	else if (a === '--fast') opt.fast = true;
	else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 33).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
	else if (a.startsWith('-')) { console.error('opção desconhecida: ' + a); process.exit(2); }
	else opt.ids.push(a);
}
const G = loadGen(), HASH = genHash();
const OUT = opt.out || path.join(ROOT, 'assets', 'baked'), K = G.HD_K, EFFORT = opt.fast ? 4 : 6;
if (opt.data) { writeData(G, OUT, HASH); process.exit(0); }
if (opt.clips && !opt.out && !opt.dry && !opt.list) { console.error('--clips gera atlas INCOMPLETOS: use --out <pasta> (ou --dry)'); process.exit(2); }
const ALL = Object.keys(G.TYPES).concat(Object.keys(EXTRAS));
const bad = opt.ids.filter((id) => !G.TYPES[id] && !EXTRAS[id]);
if (bad.length) { console.error('tipo desconhecido: ' + bad.join(', ') + '\ntipos: ' + ALL.join(' ')); process.exit(2); }
const glob = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const pats = opt.clips && opt.clips.map((p) => glob(p.includes(':') ? p : p + ':*'));
const keysOf = (id) => (EXTRAS[id] ? EXTRAS[id].keys(G) : G.TYPES[id].clips).filter((key) => !pats || pats.some((r) => r.test(key)));
// custo = quadros a renderizar (poses × direções; com dano, + 3 × os dos clipes com dano), para começar pelos maiores
function cost(id, keys) {
	let n = 0, d = 0;
	const X = EXTRAS[id], base = X ? X.base : id, names = dmgNames(base);
	for (const key of keys) {
		const [name, w0] = key.split(':');
		let c = 10 * G.DIRS;
		try { const cd = G.clipDef(name, w0, base, X ? { hand: X.hand } : {}); c = cd.poses.length * (opt.dirs && opt.dirs < cd.dirs ? opt.dirs : cd.dirs); } catch (e) { /* estimativa */ }
		n += c; if (names.has(name)) d += c;
	}
	return { frames: n, dmgFrames: d, total: n + (opt.dmg ? d * DMG_LEVELS.length : 0) };
}
const ids = (opt.ids.length ? opt.ids : ALL).map((id) => { const keys = keysOf(id), X = EXTRAS[id]; return Object.assign({ id, keys, base: X && X.base, hand: X && X.hand }, cost(id, keys)); });
if (opt.list) {
	let tf = 0, td = 0;
	for (const t of ids) { console.log(`${t.id.padEnd(22)} ${String(t.keys.length).padStart(3)} clipes ${String(t.frames).padStart(6)} quadros ${String(t.dmgFrames).padStart(6)} com dano`); tf += t.frames; td += t.dmgFrames; }
	console.log(`${ids.length} tipos, ${tf} quadros (+ ${td} × ${DMG_LEVELS.length} níveis de dano)`);
	process.exit(0);
}
const jobs = ids.filter((t) => t.keys.length).sort((a, b) => b.total - a.total);
const N = Math.max(1, Math.min(jobs.length, opt.workers || Math.min(8, Math.max(1, os.cpus().length - 1))));
const MB = (b) => (b / 1048576).toFixed(1) + ' MB', S = (ms) => (ms / 1000).toFixed(0) + ' s';
console.log(`${jobs.length} tipos, ${jobs.reduce((s, t) => s + t.total, 0)} quadros a renderizar, ${N} workers, k ${K}, WebP esforço ${EFFORT}${opt.dirs ? ', ' + opt.dirs + ' direções' : ''}` +
	`${opt.dmg ? '' : ', sem dano'}${opt.clips ? ', clipes ' + opt.clips.join(',') : ''} → ${opt.dry ? '(sem gravar)' : path.relative(ROOT, OUT) || '.'}`);
const t0 = Date.now(), queue = jobs.slice(), tot = { frames: 0, pages: 0, area: 0, bytes: 0, dmgBytes: 0, mismatch: 0, conflict: 0, types: 0 }, errors = [];
let left = jobs.length;
const pool = [];
if (!opt.dry) fs.mkdirSync(path.join(OUT, 'npcs'), { recursive: true });
function finish() {
	for (const w of pool) w.terminate();
	console.log(`FIM: ${tot.types} tipos, ${tot.frames} quadros, ${tot.pages} páginas ${(tot.area / 1e6).toFixed(0)} Mpx (${MB(tot.area * 2)} de textura), ` +
		`WebP ${MB(tot.bytes)} + dano ${MB(tot.dmgBytes)} em ${S(Date.now() - t0)}` + (tot.mismatch ? ` — ${tot.mismatch} quadros com dano de outro tamanho (ficam limpos)` : '') +
		(tot.conflict ? ` — ${tot.conflict} pixels em conflito (quadros repetidos)` : '') + (errors.length ? ` — ERROS: ${errors.join(' ')}` : ''));
	if (!opt.dry && !errors.length) writeData(G, OUT, HASH);
	process.exitCode = errors.length ? 1 : 0;
}
if (!jobs.length) { finish(); return; }
for (let w = 0; w < N; w++) {
	const worker = new Worker(__filename, { workerData: {} });
	pool.push(worker);
	const next = () => {
		const t = queue.shift();
		if (!t) { worker.terminate(); return; }
		worker.postMessage({ id: t.id, base: t.base, hand: t.hand, keys: t.keys, k: K, dirs: opt.dirs, out: OUT, dry: opt.dry, dmg: opt.dmg, effort: EFFORT });
	};
	worker.on('message', (m) => {
		if (m.progress) { const [st, i, n, key] = m.progress; console.log(`  ${m.id}: ${st} ${i}/${n} (${key})`); return; }
		left--;
		if (m.error) { errors.push(m.id); console.error(`ERRO ${m.id}:\n${m.error}`); }
		else {
			tot.types++; tot.frames += m.frames; tot.pages += m.pages; tot.area += m.area; tot.bytes += m.bytes; tot.dmgBytes += m.dmg.bytes; tot.mismatch += m.dmg.mismatch; tot.conflict += m.dmg.conflict;
			console.log(`${m.id.padEnd(22)} ${String(m.frames).padStart(6)} quadros ${String(m.pages).padStart(2)} páginas WebP ${MB(m.bytes).padStart(8)} dano ${MB(m.dmg.bytes).padStart(7)} ` +
				`(assar ${S(m.msBake)}, render ${S(m.msRender)}, webp ${S(m.msEncode)}, dano ${S(m.msDmg)}) [${jobs.length - left}/${jobs.length}]`);
		}
		if (!left) finish(); else next();
	});
	worker.on('error', (e) => { console.error('Worker caiu:', e); errors.push('worker'); process.exitCode = 1; });
	next();
}
