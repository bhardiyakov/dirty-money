// ============================================================================
// Wardrobe Worker. Bundled with the generator and src/storage/LookStore.js into assets/baked/wardrobe.worker.js (bake.cjs) and loaded
// only by src/player/Wardrobe.js while a look is being drawn (or the equipment screen is open) — then the Worker is terminated and
// nothing of the generator stays in the game's memory.
//
// Messages:
//   { type: 'warm', spec, k }                      builds the renderer of a look (the cold start, ~4 s, happens before any outfit change;
//                                                  then the item under the mouse: wearing it draws at once) → { warmed: true }
//   { type: 'preview', job, spec, k, dirs }        → { job, frames: [RGBA per direction], W, H, k }    (the spinning figure on screen)
//   { type: 'clips', job, ck, part, spec, keys, k, dirs, live, first }
//        draws the clips not yet on the device and stores each one (deflated) in  part|<ck>|<part>|<clip>
//        → { job, clip, of } per finished clip, { job, frac } halfway through a clip, { job, done: true } at the end ({ job, cancelled } / { job, error })
//        live: every direction also goes to the game as soon as it is drawn (a clip already on the device: all of it, at once) →
//        { job, live: { key, fps, loop, n, dirs, rows: [[dir, [{ w, h, ox, oy, data }]]] } } — the player wears the new look while it is
//        being drawn (NpcArt.liveAdd). first = where the player faces (0–1 of a turn): that direction is drawn first, then its neighbours.
//   { type: 'pack', job, ck, sets: [{ key, part, keys }], k }
//        reads the stored clips of each set, packs the pages (G.packPages), stores the finished atlas in <key> (LookStore format: one
//        PNG per page, as bytes) and deletes the loose clips → { job, packed: [keys] }
//   { type: 'cancel', job }                       stops between two frames (what is already stored stays: it resumes later)
// ============================================================================
const G = {};
NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G);

// ---------------------------------------------------------------- device storage (LookStore: the same database the main thread reads)
const LOOKS_MAX = 32, RAW_MAX = 8, PARTS_LOOKS = 3;
// '#t' table (key → when it was stored): at most LOOKS_MAX packed atlases (RAW_MAX with raw pages); the oldest goes — never one of the
// look being stored right now (ck). Bookkeeping failures do not fail the look.
function touch(keys, raw, ck) {
	return LookStore.transact('readwrite', async (st) => {
		const T = (await LookStore.request(st.get('#t'))) || {}, now = Date.now();
		for (const k of keys) T[k] = now;
		const max = raw ? RAW_MAX : LOOKS_MAX, old = Object.keys(T).filter((k) => !k.startsWith(ck)).sort((a, b) => T[a] - T[b]);
		while (Object.keys(T).length > max && old.length) { const k = old.shift(); delete T[k]; st.delete(k); }
		st.put(T, '#t');
	}).catch(() => {});
}
// Loose clips of at most PARTS_LOOKS looks (the ones tried most recently): those of older looks go.
function touchParts(ck) {
	return LookStore.transact('readwrite', async (st) => {
		const T = (await LookStore.request(st.get('#parts'))) || {};
		T[ck] = Date.now();
		for (const k of Object.keys(T).sort((a, b) => T[b] - T[a]).slice(PARTS_LOOKS)) { delete T[k]; st.delete(IDBKeyRange.bound('part|' + k + '|', 'part|' + k + '|￿')); }
		st.put(T, '#parts');
	}).catch(() => {});
}

// ---------------------------------------------------------------- compressão (CompressionStream; sem ela, cru)
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const deflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
const inflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());

// ---------------------------------------------------------------- packed page → stored Blob
// A PNG of the 2-byte pixels (R = byte 0, G = byte 1, B = 0, opaque: no premultiplication, so the bytes survive exactly), decoded later
// off the main thread like the baked WebP pages (AtlasDecoder). Without OffscreenCanvas here (Safari < 16.4): the raw bytes.
const canPng = typeof OffscreenCanvas === 'function' && typeof OffscreenCanvas.prototype.convertToBlob === 'function';
async function pageBlob(p) {
	if (!canPng) return new Blob([p.data], { type: LookStore.RAW_TYPE });
	const n = p.w * p.h, rgba = new Uint8ClampedArray(n * 4);
	for (let i = 0, j = 0; i < n; i++, j += 4) { rgba[j] = p.data[i * 2]; rgba[j + 1] = p.data[i * 2 + 1]; rgba[j + 3] = 255; }
	const canvas = new OffscreenCanvas(p.w, p.h);
	canvas.getContext('2d').putImageData(new ImageData(rgba, p.w, p.h), 0, 0);
	return canvas.convertToBlob({ type: 'image/png' });
}

// Clipe desenhado → registro do aparelho: os quadros num buffer só (comprimido) + os retângulos.
async function clipRecord(c) {
	let n = 0;
	for (const row of c.frames) for (const f of row) n += f.data.length;
	const buf = new Uint8Array(n), fr = [];
	let o = 0;
	for (const row of c.frames) fr.push(row.map((f) => { buf.set(f.data, o); const r = [f.w, f.h, f.ox, f.oy, o]; o += f.data.length; return r; }));
	return { key: c.key, fps: c.fps, loop: c.loop, n: c.n, dirs: c.dirs, fr, z: canZip ? await deflate(buf) : null, raw: canZip ? null : buf };
}
async function clipFrom(r) {
	const buf = r.z ? await inflate(r.z) : r.raw;
	const frames = r.fr.map((row) => row.map(([w, h, ox, oy, o]) => ({ w, h, ox, oy, data: buf.subarray(o, o + w * h * 2) })));
	return { key: r.key, fps: r.fps, loop: r.loop, n: r.n, dirs: r.dirs, frames };
}

// ---------------------------------------------------------------- desenho, com pausa para ouvir 'cancel'
const drop = new Set(), STOP = {};
let tYield = 0;
const tick = () => new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = () => ok(); ch.port2.postMessage(0); });
async function breathe(job) {
	if (performance.now() - tYield < 30) return;
	await tick();
	tYield = performance.now();
	if (drop.has(job)) throw STOP;
}
const partKey = (ck, part, key) => `part|${ck}|${part}|${key}`;

const HERO = 'protagonista';          // (a arma do jogo → a desenhada: a AK-47 do jogador é o fuzil da AK — NpcGenTypes.PLAYER_GUNS)
// Directions of a clip in drawing order: the one the player faces (first, 0–1 of a turn), then outward to both sides.
function dirOrder(D, first) {
	const d0 = ((Math.round((first || 0) * D) % D) + D) % D, out = [d0];
	for (let i = 1; out.length < D; i++) { out.push((d0 + i) % D); if (out.length < D) out.push((d0 - i + D) % D); }
	return out;
}
// Drawn directions → the game (copies: the clip keeps its frames to be stored).
function postLive(job, c, dirs) {
	const rows = [], buf = [];
	for (const d of dirs) rows.push([d, c.frames[d].map((f) => { const data = f.data.slice(); buf.push(data.buffer); return { w: f.w, h: f.h, ox: f.ox, oy: f.oy, data }; })]);
	self.postMessage({ job, live: { key: c.key, fps: c.fps, loop: c.loop, n: c.n, dirs: c.dirs, rows } }, buf);
}
async function runClips(m) {
	await touchParts(m.ck);
	const opts = { hand: m.spec.hand || null, dirs: m.dirs || undefined };
	let lastFrac = 0;
	for (const key of m.keys) {
		const pk = partKey(m.ck, m.part, key), rec = m.live ? await LookStore.get(pk) : null;
		if (rec || (!m.live && await LookStore.has(pk))) {
			if (rec) { const c = await clipFrom(rec); postLive(m.job, c, c.frames.map((_, d) => d)); }
			self.postMessage({ job: m.job, clip: key, cached: true });
			continue;
		}
		const R = G.rendererFor(m.spec, { k: m.k }), [name, w0] = key.split(':'), cd = G.clipDef(name, w0, HERO, opts);
		const D = opts.dirs && opts.dirs < cd.dirs ? opts.dirs : cd.dirs, total = cd.poses.length * D, piv = [R.px, R.py];
		const c = { key, fps: cd.fps, loop: !!cd.loop, n: cd.poses.length, dirs: D, frames: new Array(D) };
		let i = 0;
		for (const d of dirOrder(D, m.first)) {
			const row = [];
			for (const p of cd.poses) {
				await breathe(m.job);
				row.push(G.trimFrame(R.render(p, (-360 / D) * d), piv));
				const t = performance.now();
				i++;
				if (t - lastFrac > 400) { lastFrac = t; self.postMessage({ job: m.job, frac: i / total }); }
			}
			c.frames[d] = row;
			if (m.live) postLive(m.job, c, [d]);
		}
		await LookStore.put(pk, await clipRecord(c));
		self.postMessage({ job: m.job, clip: key });
	}
}
async function runPack(m) {
	const done = [], raw = !canPng;
	for (const S of m.sets) {
		const clips = [];
		for (const key of S.keys) {
			const r = await LookStore.get(partKey(m.ck, S.part, key));
			if (!r) throw new Error('clip ' + key + ' (' + S.part + ') is not on the device');
			clips.push(await clipFrom(r));
		}
		const a = G.packPages(clips), pages = [];
		clips.length = 0;
		for (const p of a.pages) {
			const blob = await pageBlob(p);
			pages.push({ w: p.w, h: p.h, g: p.g, par: p.par, type: blob.type, bytes: await blob.arrayBuffer() });
			p.data = null;
		}
		await LookStore.put(S.key, { k: m.k, v: G.SHADE === 'cel' ? 1 : 2, frame: G.frameFor(m.k), clips: a.clips, pages, gen: GEN_HASH, t: Date.now() });
		await LookStore.deletePrefix(`part|${m.ck}|${S.part}|`).catch(() => {});
		done.push(S.key);
	}
	await touch(done, raw, m.ck);
	return done;
}
function runPreview(m) {
	const k = m.k || G.OUT_K, R = G.rendererFor(m.spec, { k }), pose = G.CLIPS.idle.fn(G.weaponFor(HERO, m.spec.weaponLook || 'none'))[0], ramps = G.rampsFor(m.spec), frames = [];
	const D = m.dirs || 8;
	for (let d = 0; d < D; d++) frames.push(G.colorize(R.render(pose, (-360 / D) * d, false), ramps));      // (sem a sombra no chão: o pedestal já é o chão)
	self.postMessage({ job: m.job, frames, W: G.frameFor(k), H: G.frameFor(k), k }, frames.map((f) => f.buffer));
}

// ---------------------------------------------------------------- personagens 3D AO VIVO (src/art/Char3D.js)
// Em vez de desenhar quadros, manda ao jogo os PONTOS assados do personagem (no espaço de cada osso, com o 2º osso da malha 3D e o
// peso — skin linear de 2 ossos, como o skinPose do renderizador) e, por clipe, as matrizes dos ossos de cada pose: a GPU monta e
// ilumina o boneco na câmera de verdade. Cada MODELO (mid) é uma ficha: a do jogador (spec, com as rampas de cor dela) ou a de um TIPO
// de NPC (type: a forma é a mesma em todas as variantes — as cores vêm da paleta do jogo, por linha).
//   { type: 'char3d', job, mid, spec | npc, spacing }   → { job, mid, char3d: { bones, n, p1, n1, p2, n2, sk, mt, ramps?, scale } }
//   { type: 'char3dClip', job, mid, key }                → { job, mid, clip3d: { key, fps, loop, n, B, sc, props, newProps } }
//   { type: 'char3dDrop', mid }                          (o jogo largou o modelo)
const C3 = { BONES: ['root', 'pelvis', 'chest', 'head', 'uarm_R', 'farm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R', 'uarm_L', 'farm_L', 'hand_L', 'thigh_L', 'shin_L', 'foot_L'], models: new Map() };
function c3Model(m) {
	let M = C3.models.get(m.mid);
	if (!M) {
		if (!m.spec && !m.npc) throw new Error('modelo 3D desconhecido: ' + m.mid);
		if (m.npc && !G.TYPES[m.npc]) throw new Error('tipo desconhecido: ' + m.npc);
		M = { spec: m.spec || G.variantSpec(m.npc, 0), type: m.npc || HERO, own: !!m.spec, spacing: m.spacing || 1, sent: new Set() };
		C3.models.set(m.mid, M);
	}
	return M;
}
// O esqueleto da ficha (proporções) para as poses — o que o rendererFor faz, sem assar o corpo de novo.
function c3Rig(M) { const s = G.fullSpec(M.spec); G.setRig(G.rigFor(s)); G.CTX.rifle = s.rifle; G.CTX.scale = s.scale || 1; return s; }
function c3Body(m) {
	const M = c3Model(m), s = G.fullSpec(M.spec), baked = G.loadBaked(s, M.spacing), BI = {}, parts = Object.values(baked.body);
	C3.BONES.forEach((b, i) => { BI[b] = i; });
	let n = 0;
	for (const bk of parts) n += bk.n;
	const p1 = new Float32Array(n * 3), n1 = new Float32Array(n * 3), p2 = new Float32Array(n * 3), n2 = new Float32Array(n * 3), sk = new Float32Array(n * 4), mt = new Float32Array(n * 2);
	let o = 0;
	for (const bk of parts) {
		const b1 = BI[bk.bone] | 0;
		p1.set(bk.pos.subarray(0, bk.n * 3), o * 3); n1.set(bk.nrm.subarray(0, bk.n * 3), o * 3);
		if (bk.pos2) { p2.set(bk.pos2.subarray(0, bk.n * 3), o * 3); n2.set(bk.nrm2.subarray(0, bk.n * 3), o * 3); }
		const B2 = bk.bones2 ? bk.bones2.map((b) => BI[b] | 0) : null;
		for (let i = 0; i < bk.n; i++) {
			const j = (o + i) * 4, w = bk.w2 ? bk.w2[i] : 0;
			sk[j] = b1; sk[j + 1] = w > 0 && B2 ? B2[bk.b2[i]] : b1; sk[j + 2] = w > 0 ? w : 0;
			mt[(o + i) * 2] = bk.mat[i]; mt[(o + i) * 2 + 1] = bk.tone[i];
		}
		o += bk.n;
	}
	return { bones: C3.BONES, n, p1, n1, p2, n2, sk, mt, ramps: M.own ? c3Ramps(M.spec) : null, scale: s.scale || 1 };
}
function c3Ramps(spec) {
	const R = G.rampsFor(spec), out = new Uint8Array(32 * 5 * 4);
	for (const k of Object.keys(R)) {
		const m = +k;
		if (!(m >= 0 && m < 32) || !R[k]) continue;
		R[k].forEach((h, t) => { const c = typeof h === 'string' ? G.hexrgb(h) : h, o = (m * 5 + t) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; });
	}
	return out;
}
function c3Clip(m) {
	const M = c3Model(m), [name, w0] = m.key.split(':');
	c3Rig(M);
	const cd = G.clipDef(name, w0, M.type, { hand: M.spec.hand || null }), PR = G.bakeProps(M.spacing * 0.8);
	const n = cd.poses.length, NB = C3.BONES.length, B = new Float32Array(n * NB * 12), sc = new Float32Array(n), props = [], newProps = {};
	cd.poses.forEach((pose, f) => {
		const P = pose.adult ? pose.adult() : pose, BB = P.B || pose.bones();
		sc[f] = pose.scale || 1;
		C3.BONES.forEach((b, i) => { const X = BB[b], o = (f * NB + i) * 12; if (!X) return; B.set(X.R, o); B.set(X.t, o + 9); });
		const fp = [];
		for (const [pn, Mp] of P.props || []) {
			const bk = PR[pn];
			if (!bk) continue;
			const a = new Float32Array(12); a.set(Mp.R); a.set(Mp.t, 9); fp.push([pn, a]);
			if (!M.sent.has(pn)) {
				M.sent.add(pn);
				const mt = new Float32Array(bk.n * 2);
				for (let i = 0; i < bk.n; i++) { mt[i * 2] = bk.mat[i]; mt[i * 2 + 1] = bk.tone ? bk.tone[i] : 0; }
				newProps[pn] = { n: bk.n, p: Float32Array.from(bk.pos.subarray(0, bk.n * 3)), nrm: Float32Array.from(bk.nrm.subarray(0, bk.n * 3)), mt };
			}
		}
		props.push(fp);
	});
	return { key: m.key, fps: cd.fps, loop: !!cd.loop, n, B, sc, props, newProps };
}

let chain = Promise.resolve();
async function run(m) {
	if (drop.has(m.job)) { self.postMessage({ job: m.job, cancelled: true }); return; }
	try {
		if (m.type === 'warm') { try { G.rendererFor(m.spec, { k: m.k || G.OUT_K }); } finally { self.postMessage({ warmed: true }); } }
		else if (m.type === 'preview') runPreview(m);
		else if (m.type === 'clips') { await runClips(m); self.postMessage({ job: m.job, done: true }); }
		else if (m.type === 'pack') self.postMessage({ job: m.job, packed: await runPack(m) });
		else if (m.type === 'char3d') { const c = c3Body(m); self.postMessage({ job: m.job, mid: m.mid, char3d: c }, [c.p1.buffer, c.n1.buffer, c.p2.buffer, c.n2.buffer, c.sk.buffer, c.mt.buffer].concat(c.ramps ? [c.ramps.buffer] : [])); }
		else if (m.type === 'char3dClip') { const c = c3Clip(m); self.postMessage({ job: m.job, mid: m.mid, clip3d: c }); }
		else if (m.type === 'char3dDrop') C3.models.delete(m.mid);
	} catch (err) {
		if (err === STOP) self.postMessage({ job: m.job, cancelled: true });
		else self.postMessage({ job: m.job, mid: m.mid, key: m.key, error: String((err && err.stack) || err) });
	}
}
self.onmessage = (e) => {
	const m = e.data;
	if (m.type === 'cancel') { drop.add(m.job); return; }
	chain = chain.then(() => run(m));
};
