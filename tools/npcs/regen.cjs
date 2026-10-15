#!/usr/bin/env node
// ============================================================================
// tools/npcs/regen.cjs — gera de novo os atlas dos NPCs no formato PAGINADO (assets/npcs/<tipo>.js = manifesto, assets/npcs/<tipo>/p<i>.js
// = páginas; ver src/art/npcgen/NpcGenBuild.js) no Node, em worker_threads: um tipo por Worker, os maiores primeiro. É o jeito oficial
// de regenerar (a ferramenta do navegador, tools/npcs/index.html, faz o mesmo, mais devagar). Não mexe em assets/npcs/malha3d.js.
//
//   node tools/npcs/regen.cjs [opções] [tipos...]          (sem tipos: todos os de NpcGenTypes)
//     -j N, --workers N   Workers em paralelo (padrão: núcleos − 1, de 1 a 8; ~0,4 GB de memória cada no pior tipo)
//     --clips LISTA       só estes clipes, separados por vírgula: "walk" = walk:* ; "idle:none" ; curinga: "shoot:*", "*:pistol" (testes)
//     --out PASTA         onde gravar (padrão: assets/npcs do repositório; obrigatório com --clips, para não estragar os atlas prontos)
//     --dirs 8            no máximo 8 direções (só as pares, como o jogo LITE)
//     --k K               resolução (padrão G.HD_K = 1, a dos atlas prontos)
//     --dry               renderiza, empacota e comprime sem gravar nada (mede tempo e tamanho)
//     --list              lista os tipos (clipes, quadros) e sai
//     --root PASTA        outra cópia do jogo (padrão: a deste arquivo)
// ============================================================================
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs'), path = require('path'), zlib = require('zlib'), vm = require('vm'), os = require('os');

// O gerador (os mesmos arquivos do jogo e da ferramenta) neste contexto do Node: G pronto.
const GEN = ['src/art/npcgen/NpcGenCore.js', 'src/art/npcgen/NpcGenChar.js', 'src/art/npcgen/NpcGenRender.js', 'src/art/npcgen/NpcGenAnims.js', 'src/art/npcgen/NpcGenTypes.js',
    'src/art/npcgen/NpcGenBuild.js', 'assets/npcs/malha3d.js', 'src/art/npcgen/NpcGenMesh.js'];
function loadGen(root) {
    for (const f of GEN) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: path.join(root, f) });
    return vm.runInThisContext('(() => { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); return G; })()');
}

// Um tipo: renderiza, empacota, comprime (PNG cinza w × 2h, zlib 9) e grava as páginas e o manifesto. Devolve os números.
function buildType(G, { id, keys, k, dirs, out, dry }, progress) {
    const t0 = Date.now(), spec = G.BY_ID[id];
    G.rendererFor(spec, { k });                                     // assa a ficha antes (fica no cache): o tempo por quadro é só o do render
    const tb = Date.now();
    let last = tb;
    const a = G.buildAtlas(spec, keys, { typeId: id, k, dirs, onClip: (i, n, key) => { const t = Date.now(); if (progress && t - last > 10000) { last = t; progress([i, n, key]); } } });
    const t1 = Date.now(), dir = path.join(out, id), pages = [];
    let jsBytes = 0, area = 0, frames = 0;
    if (!dry) fs.mkdirSync(dir, { recursive: true });
    a.pages.forEach((P, i) => {
        const png = Buffer.from(G.pngFile(P.w, P.h * 2, 0, zlib.deflateSync(G.pageRows(P.w, P.h, P.data), { level: 9, memLevel: 9 })));
        const file = G.pageFile(id, i), js = G.pageJS(id, i, png.toString('base64'));
        if (!dry) fs.writeFileSync(path.join(out, file), js);
        jsBytes += js.length; area += P.w * P.h;
        pages.push({ w: P.w, h: P.h, g: P.g, par: P.par, file, bytes: png.length });
        P.data = null;
    });
    const man = G.manifestJS(id, a, spec.label, pages);
    jsBytes += man.length;
    if (!dry) {
        const tmp = path.join(out, id + '.js.tmp');
        fs.writeFileSync(tmp, man);
        fs.renameSync(tmp, path.join(out, id + '.js'));
        for (const f of fs.readdirSync(dir)) { const m = /^p(\d+)\.js$/.exec(f); if (m && +m[1] >= pages.length) fs.unlinkSync(path.join(dir, f)); }      // páginas velhas
    }
    for (const c of Object.values(a.clips)) frames += c.n * c.dirs;
    return { id, clips: Object.keys(a.clips).length, frames, pieces: a.pieces, pages: pages.length, area, png: pages.reduce((s, p) => s + p.bytes, 0), js: jsBytes, msBake: tb - t0, msRender: t1 - tb, msPack: Date.now() - t1 };
}

if (!isMainThread) {
    const G = loadGen(workerData.root);
    parentPort.on('message', (job) => {
        try { parentPort.postMessage(buildType(G, job, (p) => parentPort.postMessage({ id: job.id, progress: p }))); }
        catch (e) { parentPort.postMessage({ id: job.id, error: String((e && e.stack) || e) }); }
    });
    return;
}

// ---------------------------------------------------------------- linha de comando
const argv = process.argv.slice(2), opt = { ids: [], workers: 0, clips: null, out: null, dirs: 0, k: 0, dry: false, list: false, root: path.resolve(__dirname, '..', '..') };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i], val = () => { if (i + 1 >= argv.length) { console.error('falta o valor de ' + a); process.exit(2); } return argv[++i]; };
    if (a === '-j' || a === '--workers') opt.workers = +val();
    else if (a === '--clips') opt.clips = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') opt.out = path.resolve(val());
    else if (a === '--dirs') opt.dirs = +val();
    else if (a === '--k') opt.k = +val();
    else if (a === '--root') opt.root = path.resolve(val());
    else if (a === '--dry') opt.dry = true;
    else if (a === '--list') opt.list = true;
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
    else if (a.startsWith('-')) { console.error('opção desconhecida: ' + a); process.exit(2); }
    else opt.ids.push(a);
}
const G = loadGen(opt.root);
const OUT = opt.out || path.join(opt.root, 'assets', 'npcs'), K = opt.k || G.HD_K;
if (opt.clips && !opt.out && !opt.dry && !opt.list) { console.error('--clips gera atlas INCOMPLETOS: use --out <pasta> (ou --dry)'); process.exit(2); }
const bad = opt.ids.filter((id) => !G.TYPES[id]);
if (bad.length) { console.error('tipo desconhecido: ' + bad.join(', ') + '\ntipos: ' + Object.keys(G.TYPES).join(' ')); process.exit(2); }
const glob = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const pats = opt.clips && opt.clips.map((p) => glob(p.includes(':') ? p : p + ':*'));
const keysOf = (id) => G.TYPES[id].clips.filter((key) => !pats || pats.some((r) => r.test(key)));
// custo de um tipo = quadros a renderizar (poses × direções), para começar pelos maiores
function cost(id, keys) {
    let n = 0;
    for (const key of keys) {
        const [name, w0] = key.split(':');
        try { const c = G.clipDef(name, w0, id, {}); n += c.poses.length * (opt.dirs && opt.dirs < c.dirs ? opt.dirs : c.dirs); } catch (e) { n += 10 * G.DIRS; }
    }
    return n;
}
const ids = (opt.ids.length ? opt.ids : Object.keys(G.TYPES)).map((id) => { const keys = keysOf(id); return { id, keys, cost: cost(id, keys) }; });
if (opt.list) {
    let tot = 0;
    for (const t of ids) { console.log(`${t.id.padEnd(22)} ${String(t.keys.length).padStart(3)} clipes ${String(t.cost).padStart(6)} quadros`); tot += t.cost; }
    console.log(`${ids.length} tipos, ${tot} quadros`);
    process.exit(0);
}
const jobs = ids.filter((t) => t.keys.length).sort((a, b) => b.cost - a.cost);
for (const t of ids) if (!t.keys.length) console.log(`(sem clipes com esse filtro: ${t.id})`);
const N = Math.max(1, Math.min(jobs.length, opt.workers || Math.min(8, Math.max(1, os.cpus().length - 1))));
const MB = (b) => (b / 1048576).toFixed(1) + ' MB', S = (ms) => (ms / 1000).toFixed(0) + ' s';
console.log(`${jobs.length} tipos, ${jobs.reduce((s, t) => s + t.cost, 0)} quadros, ${N} workers, k ${K}${opt.dirs ? ', ' + opt.dirs + ' direções' : ''}${opt.clips ? ', clipes ' + opt.clips.join(',') : ''} → ${opt.dry ? '(sem gravar)' : OUT}`);
const t0 = Date.now(), queue = jobs.slice(), tot = { frames: 0, pieces: 0, pages: 0, area: 0, png: 0, js: 0, ms: 0, render: 0, types: 0 }, errors = [];
let left = jobs.length;
if (!opt.dry) fs.mkdirSync(OUT, { recursive: true });
function finish() {
    const wall = Date.now() - t0;
    console.log(`FIM: ${tot.types} tipos, ${tot.frames} quadros (${tot.pieces} distintos), ${tot.pages} páginas ${(tot.area / 1e6).toFixed(0)} Mpx (${MB(tot.area * 2)} de textura), ` +
        `PNG ${MB(tot.png)}, JS ${MB(tot.js)} em ${S(wall)} (${S(tot.ms)} somando os workers; render ${(tot.render / Math.max(1, tot.frames)).toFixed(0)} ms/quadro)` + (errors.length ? ` — ERROS: ${errors.join(' ')}` : ''));
    process.exitCode = errors.length ? 1 : 0;
}
function spawn() {
    const w = new Worker(__filename, { workerData: { root: opt.root } });
    let cur = null;
    const next = () => {
        const t = cur = queue.shift();
        if (!t) { w.terminate(); return; }
        w.postMessage({ id: t.id, keys: t.keys, k: K, dirs: opt.dirs, out: OUT, dry: opt.dry });
    };
    w.on('message', (m) => {
        if (m.progress) { console.log(`  … ${m.id} ${m.progress[0]}/${m.progress[1]} ${m.progress[2]}  [${S(Date.now() - t0)}]`); return; }
        cur = null;
        if (m.error) { errors.push(m.id); console.log('ERRO', m.id, m.error); }
        else {
            const ms = m.msBake + m.msRender + m.msPack;
            console.log(`ok ${m.id.padEnd(22)} ${m.clips} clipes, ${m.frames} quadros (${m.pieces} distintos), ${m.pages} páginas ${(m.area / 1e6).toFixed(1)} Mpx, ` +
                `PNG ${MB(m.png)}, JS ${MB(m.js)}, ${S(ms)} (assar ${S(m.msBake)}; ${(m.msRender / m.frames).toFixed(0)} ms/quadro; PNG ${S(m.msPack)})  [${S(Date.now() - t0)}]`);
            for (const k of ['frames', 'pieces', 'pages', 'area', 'png', 'js']) tot[k] += m[k];
            tot.ms += ms; tot.render += m.msRender; tot.types++;
        }
        if (--left === 0) finish();
        next();
    });
    // Worker que morreu (falta de memória…): o tipo dele conta como erro e um Worker novo segue com a fila
    w.on('error', (e) => { console.log('ERRO no worker' + (cur ? ' (' + cur.id + ')' : ''), (e && e.stack) || e); });
    w.on('exit', (code) => {
        if (!cur) return;
        console.log(`ERRO: o worker de ${cur.id} parou (código ${code})`);
        errors.push(cur.id); cur = null;
        if (--left === 0) finish(); else if (queue.length) spawn();
    });
    next();
}
for (let i = 0; i < N; i++) spawn();
