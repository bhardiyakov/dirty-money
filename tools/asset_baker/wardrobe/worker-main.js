// ============================================================================
// Worker do GUARDA-ROUPA (tela de equipamento). Vai empacotado com o gerador em assets/baked/wardrobe.worker.js (bake.cjs) e só é
// carregado por src/player/Wardrobe.js enquanto a tela de equipamento está aberta — fechou, o Worker é encerrado (terminate) e nada do
// gerador fica na memória do jogo.
//
// Mensagens (a thread principal só orquestra: nenhum pixel do visual passa por ela):
//   { type: 'preview', job, spec, k, dirs }        → { job, frames: [RGBA por direção], W, H, k }    (o boneco girando da tela)
//   { type: 'clips', job, ck, part, spec, keys, k, dirs }
//        desenha os clipes que ainda não estão no aparelho e grava cada um (comprimido) em  part|<ck>|<part>|<clipe>
//        → { job, clip, of } por clipe pronto, { job, frac } no meio de um clipe, { job, done: true } no fim ({ job, cancelled } / { job, error })
//   { type: 'pack', job, ck, sets: [{ key, part, keys }], k }
//        lê os clipes gravados de cada conjunto, empacota as páginas (G.packPages), grava o atlas pronto em <key> (o formato de
//        NpcArt.unzip: páginas comprimidas) e apaga os clipes avulsos → { job, packed: [keys] }
//   { type: 'cancel', job }                       interrompe entre um quadro e outro (o que já foi gravado fica: continua depois)
// ============================================================================
const G = {};
NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G);

// ---------------------------------------------------------------- IndexedDB (o mesmo banco da thread principal: PlayerLook)
const DB_NAME = 'dirty-money-visual', DB_VER = 2, STORE = 'atlas', LOOKS_MAX = 32, RAW_MAX = 8, PARTS_LOOKS = 3;
let _db = null;
function db() {
    return _db || (_db = new Promise((ok, fail) => {
        const r = indexedDB.open(DB_NAME, DB_VER);
        r.onupgradeneeded = () => { const d = r.result; if (d.objectStoreNames.contains(STORE)) r.transaction.objectStore(STORE).clear(); else d.createObjectStore(STORE); };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
        r.onblocked = () => fail(new Error('IndexedDB bloqueado'));
    }));
}
const req = (q) => new Promise((ok, fail) => { q.onsuccess = () => ok(q.result); q.onerror = () => fail(q.error); });
async function get(k) { const d = await db(); return req(d.transaction(STORE).objectStore(STORE).get(k)); }
async function has(k) { const d = await db(); return (await req(d.transaction(STORE).objectStore(STORE).count(k))) > 0; }
async function put(k, v) {
    const d = await db(), t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(v, k);
    return new Promise((ok, fail) => { t.oncomplete = () => ok(); t.onerror = () => fail(t.error); t.onabort = () => fail(t.error || new Error('sem espaço no aparelho')); });
}
async function delPrefix(prefix) {
    const d = await db(), t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(IDBKeyRange.bound(prefix, prefix + '￿'));
    return new Promise((ok) => { t.oncomplete = t.onerror = t.onabort = () => ok(); });
}
// Tabela '#t' (chave → quando foi gravada): no máximo LOOKS_MAX atlas prontos (RAW_MAX sem compressão); sai o mais antigo — nunca um
// do visual que está sendo gravado agora (ck).
async function touch(keys, raw, ck) {
    const d = await db(), t = d.transaction(STORE, 'readwrite'), st = t.objectStore(STORE), T = (await req(st.get('#t'))) || {}, now = Date.now();
    for (const k of keys) T[k] = now;
    const max = raw ? RAW_MAX : LOOKS_MAX, ks = Object.keys(T).filter((k) => !k.startsWith(ck)).sort((a, b) => T[a] - T[b]);
    while (Object.keys(T).length > max && ks.length) { const x = ks.shift(); delete T[x]; st.delete(x); }
    st.put(T, '#t');
    return new Promise((ok) => { t.oncomplete = t.onerror = t.onabort = () => ok(); });
}
// Clipes avulsos de no máximo PARTS_LOOKS visuais (os experimentados por último): os de visuais mais antigos saem.
async function touchParts(ck) {
    const d = await db(), t = d.transaction(STORE, 'readwrite'), st = t.objectStore(STORE), T = (await req(st.get('#parts'))) || {};
    T[ck] = Date.now();
    const old = Object.keys(T).sort((a, b) => T[b] - T[a]).slice(PARTS_LOOKS);
    for (const k of old) { delete T[k]; st.delete(IDBKeyRange.bound('part|' + k + '|', 'part|' + k + '|￿')); }
    st.put(T, '#parts');
    return new Promise((ok) => { t.oncomplete = t.onerror = t.onabort = () => ok(); });
}

// ---------------------------------------------------------------- compressão (CompressionStream; sem ela, cru)
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const deflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
const inflate = async (u8) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());

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

async function runClips(m) {
    await touchParts(m.ck);
    const opts = { hand: m.spec.hand || null, dirs: m.dirs || undefined };
    let lastFrac = 0;
    for (const key of m.keys) {
        const pk = partKey(m.ck, m.part, key);
        if (await has(pk)) { self.postMessage({ job: m.job, clip: key, cached: true }); continue; }
        const R = G.rendererFor(m.spec, { k: m.k }), [name, w0] = key.split(':'), cd = G.clipDef(name, w0, null, opts);
        const total = cd.poses.length * (opts.dirs && opts.dirs < cd.dirs ? opts.dirs : cd.dirs), it = G.clipSteps(R, key, null, opts);
        let c, i = 0;
        for (let r = it.next(); ; r = it.next(), i++) {
            if (r.done) { c = r.value; break; }
            await breathe(m.job);
            const t = performance.now();
            if (t - lastFrac > 400) { lastFrac = t; self.postMessage({ job: m.job, frac: i / total }); }
        }
        await put(pk, await clipRecord(c));
        self.postMessage({ job: m.job, clip: key });
    }
}
async function runPack(m) {
    const done = [];
    let raw = false;
    for (const S of m.sets) {
        const clips = [];
        for (const key of S.keys) {
            const r = await get(partKey(m.ck, S.part, key));
            if (!r) throw new Error('clipe ' + key + ' (' + S.part + ') não está no aparelho');
            clips.push(await clipFrom(r));
        }
        const a = G.packPages(clips), pages = [];
        clips.length = 0;
        for (const p of a.pages) {
            if (canZip) pages.push({ w: p.w, h: p.h, g: p.g, par: p.par, z: await deflate(p.data) });
            else { raw = true; pages.push({ w: p.w, h: p.h, g: p.g, par: p.par, data: p.data }); }
            p.data = null;
        }
        const rec = { k: m.k, v: G.SHADE === 'cel' ? 1 : 2, frame: G.frameFor(m.k), clips: a.clips, pages, gen: GEN_HASH, t: Date.now() };
        if (raw) rec.raw = true;
        await put(S.key, rec);
        await delPrefix(`part|${m.ck}|${S.part}|`);
        done.push(S.key);
    }
    await touch(done, raw, m.ck);
    return done;
}
function runPreview(m) {
    const k = m.k || G.OUT_K, R = G.rendererFor(m.spec, { k }), pose = G.CLIPS.idle.fn(m.spec.weaponLook || 'none')[0], ramps = G.rampsFor(m.spec), frames = [];
    const D = m.dirs || 8;
    for (let d = 0; d < D; d++) frames.push(G.colorize(R.render(pose, (-360 / D) * d, false), ramps));      // (sem a sombra no chão: o pedestal já é o chão)
    self.postMessage({ job: m.job, frames, W: G.frameFor(k), H: G.frameFor(k), k }, frames.map((f) => f.buffer));
}

let chain = Promise.resolve();
async function run(m) {
    if (drop.has(m.job)) { self.postMessage({ job: m.job, cancelled: true }); return; }
    try {
        if (m.type === 'preview') runPreview(m);
        else if (m.type === 'clips') { await runClips(m); self.postMessage({ job: m.job, done: true }); }
        else if (m.type === 'pack') self.postMessage({ job: m.job, packed: await runPack(m) });
    } catch (err) {
        if (err === STOP) self.postMessage({ job: m.job, cancelled: true });
        else self.postMessage({ job: m.job, error: String((err && err.stack) || err) });
    }
}
self.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'cancel') { drop.add(m.job); return; }
    chain = chain.then(() => run(m));
};
