// ============================================================================
// NpcGenBuild — monta o ATLAS de um tipo de personagem para o jogo: renderiza cada clipe nas 8 direções, recorta cada quadro no que
// tem desenho, junta quadros iguais (mirar = último quadro de sacar…) e empacota tudo numa textura de 2 bytes por pixel
// (código da cor, alfa). Usado pela ferramenta (tools/npcs: atlas prontos em assets/npcs/) e pelo Worker do jogo (visual do jogador).
//
// Direções na ordem do JOGO: 0 = norte (de costas), 1 = nordeste … sentido horário … 7 = noroeste.
// Quadro: [x, y, w, h, ox, oy] = retângulo no atlas e canto superior esquerdo relativo aos pés (px; y para baixo = sul).
// ============================================================================

function NpcGenBuild(G) {
    'use strict';
    // Resolução: px do atlas por unidade do gerador (o original era 1,04). OUT_K = 0,5 → 26 px por metro no jogo (os atlas prontos);
    // HD_K = 1,0 → o dobro (alta definição: gerado no próprio jogo, ver NpcArt.hd). Em alta, o z-buffer usa 2×2 amostras por pixel
    // (fino o bastante; 4×4 custaria 4× mais sem ganho).
    const OUT_K = 0.5, HD_K = 1.0;
    const PPU = 26;                    // TAMANHO no jogo: px por metro na resolução de referência (k 0,5) = Config.art.npcPpu — os pilotos
                                       // casam com o desenho das motos e barcos. Um atlas tem PPU × k / 0,5 px por metro.
    // quadro de trabalho (só o recorte vai para o atlas) e os pés nele, por resolução
    const frameFor = (k) => Math.round((112 * k) / 0.5), pivFor = (k) => [Math.round((56 * k) / 0.5), Math.round((72 * k) / 0.5)];
    const FRAME = frameFor(OUT_K), PIV = pivFor(OUT_K);
    const SPACING = 1 / 3;             // pontos da superfície (0,2 na escala original, proporcional)
    const DIRS = 8;
    const ATLAS_MAX = 4096;            // lado máximo do atlas (o endereço de um quadro é x·4096 + y, exato em float)

    // Renderizador de uma ficha (assa as partes — com cache por ficha).
    const _cache = new Map();
    function rendererFor(spec, { k = OUT_K, spacing = SPACING } = {}) {
        const s = G.fullSpec(spec), key = JSON.stringify(s) + '|' + k + '|' + spacing;
        let r = _cache.get(key);
        if (!r) {
            const baked = G.loadBaked(s, spacing);
            r = new G.Renderer(baked, new G.Camera(), { W: frameFor(k), H: frameFor(k), pivot: pivFor(k), ss: k >= 1 ? 2 : 4, charScale: (s.scale * k) / 1.04 });
            r.spec = s;
            if (_cache.size > 3) _cache.delete(_cache.keys().next().value);
            _cache.set(key, r);
        }
        G.setRig(G.rigFor(s));
        G.CTX.rifle = s.rifle;
        return r;
    }

    // Quadros de um clipe ("nome:arma") nas 8 direções (pilotando: 16): { fps, loop, n, dirs, frames: [dir][f] = {w, h, ox, oy, code, alpha} }.
    function renderClip(R, key, typeId, opts = {}) {
        const [name, w0] = key.split(':'), def = G.CLIPS[name];
        if (!def) throw new Error('clipe desconhecido: ' + key);
        const w = typeId ? G.weaponFor(typeId, w0) : w0;
        const poses = def.fn(w, opts);
        const fps = (def.fpsFor && def.fpsFor[w0]) || def.fps;
        const frames = [];
        const D = def.dirs || DIRS;
        for (let d = 0; d < D; d++) {
            const row = [];
            for (const p of poses) row.push(trim(R.render(p, (-360 / D) * d), [R.px, R.py]));
            frames.push(row);
        }
        return { key, fps, loop: def.loopFor && w0 in def.loopFor ? def.loopFor[w0] : def.loop, n: poses.length, dirs: D, frames };
    }

    // Recorta o quadro no que tem pixel (com a posição relativa aos pés).
    function trim(fr, piv = PIV) {
        const W = fr.W, H = fr.H, a = fr.alpha;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) return { w: 0, h: 0, ox: 0, oy: 0, data: new Uint8Array(0) };
        const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8Array(w * h * 2);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y0 + y) * W + x0 + x, o = (y * w + x) * 2;
            if (fr.light) { const [b0, b1] = G.packPx(fr.code[i], a[i], fr.light[i]); data[o] = b0; data[o + 1] = b1; }      // (sombreado contínuo: material + luz)
            else { data[o] = fr.code[i]; data[o + 1] = a[i]; }
        }
        return { w, h, ox: x0 - piv[0], oy: y0 - piv[1], data };
    }

    const hashBytes = (b, w, h) => { let x = 2166136261 ^ w ^ (h << 12); for (let i = 0; i < b.length; i++) { x ^= b[i]; x = Math.imul(x, 16777619); } return (x >>> 0) + ':' + w + 'x' + h + ':' + b.length; };

    // Empacota (prateleiras, do mais alto para o mais baixo) e devolve o atlas: { w, h, data (RG), clips }.
    function pack(clips, maxW = 2048) {
        const uniq = new Map(), list = [];
        for (const c of clips) for (const row of c.frames) for (const f of row) {
            if (!f.w) { f.ref = null; continue; }
            const h = hashBytes(f.data, f.w, f.h) + ':' + f.ox + ',' + f.oy;
            let u = uniq.get(h);
            if (!u) { u = { f, x: 0, y: 0 }; uniq.set(h, u); list.push(u); }
            f.ref = u;
        }
        let area = 0; for (const u of list) area += (u.f.w + 1) * (u.f.h + 1);
        list.sort((a, b) => b.f.h - a.f.h || b.f.w - a.f.w);
        const shelves = (W) => {
            let x = 0, y = 0, sh = 0;
            for (const u of list) {
                if (x + u.f.w > W) { x = 0; y += sh + 1; sh = 0; }
                u.x = x; u.y = y; x += u.f.w + 1; if (u.f.h > sh) sh = u.f.h;
            }
            return Math.ceil((y + sh + 1) / 4) * 4;
        };
        // O jogo endereça o quadro como x·4096 + y (NpcArt.clip / shader): x e y têm de ficar abaixo de 4096. Atlas grande (o jogador
        // em alta definição passa de 6000 px de altura com 2048 de largura) → mais largo, até 4096.
        let W = area > 900 * 1024 ? maxW : 1024, H = shelves(W);
        while (H > ATLAS_MAX && W < ATLAS_MAX) { W *= 2; H = shelves(W); }
        if (H > ATLAS_MAX) console.warn(`[NPCS] atlas ${W}×${H} passa de ${ATLAS_MAX} px: quadros do fim vão sair errados`);
        const data = new Uint8Array(W * H * 2);
        for (const u of list) {
            const f = u.f;
            for (let r = 0; r < f.h; r++) data.set(f.data.subarray(r * f.w * 2, (r + 1) * f.w * 2), ((u.y + r) * W + u.x) * 2);
        }
        const out = {};
        for (const c of clips) {
            const fr = [];
            for (const row of c.frames) for (const f of row) fr.push(f.ref ? [f.ref.x, f.ref.y, f.w, f.h, f.ox, f.oy] : [0, 0, 0, 0, 0, 0]);
            out[c.key] = { fps: c.fps, loop: c.loop, n: c.n, f: fr };
            if (c.dirs && c.dirs !== DIRS) out[c.key].dirs = c.dirs;
        }
        return { w: W, h: H, data, clips: out, pieces: list.length };
    }

    // Atlas inteiro de um tipo (ou de uma ficha qualquer: o jogador). keys = lista de clipes; onClip(i, total, key) = progresso.
    function buildAtlas(spec, keys, { typeId = null, hand = null, onClip = null, k = OUT_K, spacing = SPACING } = {}) {
        const R = rendererFor(spec, { k, spacing }), clips = [];
        keys.forEach((key, i) => {
            clips.push(renderClip(R, key, typeId, { hand }));
            if (onClip) onClip(i + 1, keys.length, key);
        });
        const a = pack(clips);
        a.frame = frameFor(k); a.k = k; a.v = G.SHADE === 'cel' ? 1 : 2;          // v = formato (2: material + luz)
        return a;
    }

    Object.assign(G, { OUT_K, HD_K, PPU, FRAME, PIV, frameFor, pivFor, SPACING, rendererFor, renderClip, trimFrame: trim, packAtlas: pack, buildAtlas });
    return G;
}
