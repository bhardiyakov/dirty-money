// ============================================================================
// NpcGenBuild — monta o ATLAS de um tipo de personagem para o jogo: renderiza cada clipe nas 16 direções, recorta cada quadro no que
// tem desenho, junta quadros iguais (mirar = último quadro de sacar…) e empacota tudo em PÁGINAS de textura de 2 bytes por pixel
// (código da cor, alfa): uma ou mais por grupo de clipes (hot, act, fall, water, car, gym) e paridade da direção (pares / ímpares),
// carregadas sob demanda pelo jogo (NpcArt). Usado no BUILD (tools/asset_baker/bake.cjs: atlas prontos em assets/baked/, WebP + JSON) e
// pelo Worker do guarda-roupa (tools/asset_baker/wardrobe: o visual de uma roupa nova, só na tela de equipamento).
//
// Direções na ordem do JOGO: 0 = norte (de costas), 1 = nor-nordeste … sentido horário … 15 = nor-noroeste (yaw = −22,5°·d).
// Quadro: [x, y, w, h, ox, oy] = retângulo NA PÁGINA pd[dir] e canto superior esquerdo relativo aos pés (px; y para baixo = sul).
// Arquivos: o formato está no cabeçalho de tools/asset_baker/bake.cjs (manifesto JSON + páginas WebP + camadas de dano).
// ============================================================================

function NpcGenBuild(G) {
    'use strict';
    // Resolução: px do atlas por unidade do gerador (o original era 1,04). OUT_K = 0,5 → 26 px por metro no jogo (os atlas prontos);
    // HD_K = 1,0 → o dobro (alta definição: os atlas do jogo). Em alta, o z-buffer usa 2×2 amostras por pixel
    // (fino o bastante; 4×4 custaria 4× mais sem ganho).
    const OUT_K = 0.5, HD_K = 1.0;
    const PPU = 26;                    // TAMANHO no jogo: px por metro na resolução de referência (k 0,5) = Config.art.npcPpu — os pilotos
                                       // casam com o desenho das motos e barcos. Um atlas tem PPU × k / 0,5 px por metro.
    // quadro de trabalho (só o recorte vai para o atlas) e os pés nele, por resolução
    const frameFor = (k) => Math.round((112 * k) / 0.5), pivFor = (k) => [Math.round((56 * k) / 0.5), Math.round((72 * k) / 0.5)];
    const FRAME = frameFor(OUT_K), PIV = pivFor(OUT_K);
    const SPACING = 1 / 3;             // pontos da superfície (0,2 na escala original, proporcional)
    const DIRS = 16;                   // direções de todo clipe (o jogo LITE só usa as pares: buildAtlas({ dirs: 8 }) gera só elas)
    const ATLAS_MAX = 4096;            // lado máximo de uma página (o endereço de um quadro é x·4096 + y, exato em float)
    const PAGE_TARGET = 8 * 1024 * 1024;       // área que uma página procura não passar (8 Mpx = 16 MB de textura)
    // Grupos de páginas: o jogo carrega primeiro as do grupo "hot" (andar, correr, armas na mão), o resto quando um clipe dele toca.
    const GROUPS = {
        hot: ['idle', 'walk', 'run', 'scared', 'walk_up', 'aim', 'draw', 'shoot', 'holdup', 'idle_hold', 'walk_hold', 'run_hold', 'idle_pull', 'walk_pull',
            'walk_heavy', 'run_heavy', 'idle_heavy', 'crouch', 'sneak', 'strafe'],
        act: ['punch', 'punchL', 'kick', 'swing', 'stab', 'throw', 'hurt', 'surrender', 'kneel', 'handsup', 'grenade_pin', 'grenade_hold', 'grenade_throw',
            'molotov_light', 'molotov_hold', 'molotov_throw', 'roll', 'vault', 'baton_idle', 'baton_walk'],
        fall: ['dead', 'flail', 'tumble', 'lie', 'getup', 'climb'],
        water: ['swim', 'swim_idle', 'swim_breast', 'wade', 'wade_idle', 'swim_in', 'swim_out', 'swim_stand', 'dive_in', 'dive', 'dive_out', 'board_boat'],
        car: ['opendoor', 'enter', 'carjack', 'sitin', 'sitout', 'pick', 'pickpocket', 'rummage', 'ride_moto', 'ride_jetski', 'ride_bike', 'ride_boat', 'ride_back', 'mount'],
        gym: ['gym_curl', 'gym_bench', 'gym_squat'],
    };
    const GROUP_OF = {}, ORDER = Object.keys(GROUPS);
    for (const [g, l] of Object.entries(GROUPS)) for (const n of l) GROUP_OF[n] = g;

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

    // Poses e ritmo de um clipe: { poses, fps, loop, dirs } — de G.clipPoses (o catálogo: quadros, fps e direções por arma) ou, sem ele,
    // direto do G.CLIPS (arma traduzida para o objeto desenhado: o "smg" do BOPE é um fuzil).
    function clipDef(name, w0, typeId, opts = {}) {
        const def = G.CLIPS[name];
        if (G.clipPoses) {
            const r = G.clipPoses(name, w0, typeId, opts);
            if (!r) throw new Error('clipe desconhecido: ' + name + ':' + w0);
            const o = Array.isArray(r) ? { poses: r } : r;
            return {
                poses: o.poses, fps: o.fps !== undefined ? o.fps : (def && ((def.fpsFor && def.fpsFor[w0]) || def.fps)),
                loop: o.loop !== undefined ? o.loop : (def && (def.loopFor && w0 in def.loopFor ? def.loopFor[w0] : def.loop)), dirs: o.dirs || (def && def.dirs) || DIRS,
            };
        }
        if (!def) throw new Error('clipe desconhecido: ' + name + ':' + w0);
        const w = typeId ? G.weaponFor(typeId, w0) : w0;
        return { poses: def.fn(w, opts), fps: (def.fpsFor && def.fpsFor[w0]) || def.fps, loop: def.loopFor && w0 in def.loopFor ? def.loopFor[w0] : def.loop, dirs: def.dirs || DIRS };
    }

    // Quadros de um clipe ("nome:arma") nas 16 direções: { key, fps, loop, n, dirs, frames: [dir][f] = {w, h, ox, oy, data} }.
    // opts.dirs = no máximo tantas direções (8 = só as pares, a −45°·d: o jogo LITE); o resto de opts vai para o clipe (hand…).
    function renderClip(R, key, typeId, opts = {}) {
        const it = clipSteps(R, key, typeId, opts);
        let r = it.next();
        while (!r.done) r = it.next();
        return r.value;
    }
    // O mesmo, um quadro por passo (cada next() desenha um): o Worker do guarda-roupa ouve 'cancel' entre os quadros; o valor final
    // (done) é o clipe.
    function* clipSteps(R, key, typeId, opts = {}) {
        const [name, w0] = key.split(':'), c = clipDef(name, w0, typeId, opts);
        const D = opts.dirs && opts.dirs < c.dirs ? opts.dirs : c.dirs, frames = [];
        for (let d = 0; d < D; d++) {
            const row = [];
            for (const p of c.poses) { row.push(trim(R.render(p, (-360 / D) * d), [R.px, R.py])); yield; }
            frames.push(row);
        }
        return { key, fps: c.fps, loop: !!c.loop, n: c.poses.length, dirs: D, frames };
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
    const fkey = (f) => hashBytes(f.data, f.w, f.h) + ':' + f.ox + ',' + f.oy;
    const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    // prateleiras (do mais alto para o mais baixo, 1 px de folga): posiciona a lista e devolve a altura (múltipla de 4)
    function shelves(list, W) {
        let x = 0, y = 0, sh = 0;
        for (const u of list) { if (x + u.w > W) { x = 0; y += sh + 1; sh = 0; } u.x = x; u.y = y; x += u.w + 1; if (u.h > sh) sh = u.h; }
        return Math.ceil((y + sh + 1) / 4) * 4;
    }

    // Empacota em PÁGINAS: clips = [{ key, fps, loop, n, dirs, frames: [dir][f] }] → { pages: [{ w, h, g, par, data (RG), pieces }],
    // clips: { key: { fps, loop, n, dirs, pd, f } }, pieces }. Uma página = um grupo (GROUPS) e uma paridade de direção (par 0 = pares, e
    // todas as de um clipe de até 8 direções; 1 = ímpares); todos os quadros de um (clipe, paridade) na MESMA página (o quadro seguinte,
    // fr2, é lido da mesma textura). Páginas de até ~8 Mpx (PAGE_TARGET) e lado ≤ 4096. Quadros iguais só se juntam dentro da página.
    function packPages(clips) {
        const buckets = new Map();                                  // "g|par" → [{ c, d }]
        for (const c of clips) {
            const g = GROUP_OF[c.key.split(':')[0]] || 'act';
            for (let d = 0; d < c.dirs; d++) {
                const k = g + '|' + (c.dirs > 8 ? d & 1 : 0);
                if (!buckets.has(k)) buckets.set(k, []);
                buckets.get(k).push({ c, d });
            }
        }
        const keys = [...buckets.keys()].sort((a, b) => { const [ga, pa] = a.split('|'), [gb, pb] = b.split('|'); return ORDER.indexOf(ga) - ORDER.indexOf(gb) || pa - pb; });
        const pages = [];
        for (const k of keys) {
            const [g, par] = k.split('|');
            // as direções de uma paridade de um clipe vão juntas: agrupa por clipe e enche as páginas clipe a clipe
            const byClip = new Map();
            for (const e of buckets.get(k)) { if (!byClip.has(e.c)) byClip.set(e.c, []); byClip.get(e.c).push(e.d); }
            let cur = null;
            const flush = () => { if (cur && cur.items.length) pages.push(cur); cur = null; };
            for (const [c, dirs] of byClip) {
                let area = 0; const local = new Set();
                for (const d of dirs) for (const f of c.frames[d]) { if (!f.w) continue; const h = fkey(f); if (!local.has(h)) { local.add(h); area += (f.w + 1) * (f.h + 1); } }
                if (cur && cur.area + area > PAGE_TARGET) flush();
                if (!cur) cur = { g, par: +par, items: [], area: 0 };
                cur.items.push({ c, dirs }); cur.area += area;
            }
            flush();
        }
        const loc = new Map();                                      // clipe → { pd: página por direção, ref: peça por quadro (dir·n + f) }
        let pieces = 0;
        pages.forEach((P, pi) => {
            const uniq = new Map(), list = [];
            for (const { c, dirs } of P.items) {
                let L = loc.get(c);
                if (!L) loc.set(c, (L = { pd: new Array(c.dirs).fill(-1), ref: new Array(c.dirs * c.n).fill(null) }));
                for (const d of dirs) {
                    L.pd[d] = pi;
                    const row = c.frames[d];
                    for (let fi = 0; fi < row.length; fi++) {
                        const f = row[fi];
                        if (!f.w) continue;
                        let h = fkey(f), u = uniq.get(h);
                        while (u && !same(u.f.data, f.data)) { h += '#'; u = uniq.get(h); }          // (colisão do hash: outra imagem)
                        if (!u) { u = { f, w: f.w, h: f.h, x: 0, y: 0 }; uniq.set(h, u); list.push(u); }
                        L.ref[d * c.n + fi] = u;
                    }
                }
            }
            list.sort((a, b) => b.h - a.h || b.w - a.w);
            let W = P.area > 3 * 1024 * 1024 ? 4096 : P.area > 900 * 1024 ? 2048 : 1024, H = shelves(list, W);
            while (H > ATLAS_MAX && W < ATLAS_MAX) { W *= 2; H = shelves(list, W); }
            if (H > ATLAS_MAX) throw new Error(`[NPCS] página ${pi} (${P.g}/${P.par}) ${W}×${H} passa de ${ATLAS_MAX} px`);
            const data = new Uint8Array(W * H * 2);
            for (const u of list) for (let r = 0; r < u.h; r++) data.set(u.f.data.subarray(r * u.w * 2, (r + 1) * u.w * 2), ((u.y + r) * W + u.x) * 2);
            P.w = W; P.h = H; P.data = data; P.pieces = list.length; pieces += list.length;
        });
        const meta = {};
        for (const c of clips) {
            const L = loc.get(c), fr = [];
            for (let i = 0; i < c.dirs * c.n; i++) { const u = L && L.ref[i]; fr.push(u ? [u.x, u.y, u.w, u.h, u.f.ox, u.f.oy] : [0, 0, 0, 0, 0, 0]); }
            meta[c.key] = { fps: c.fps, loop: c.loop, n: c.n, dirs: c.dirs, pd: L ? L.pd.map((p) => (p < 0 ? 0 : p)) : new Array(c.dirs).fill(0), f: fr };
        }
        return { pages: pages.map(({ w, h, g, par, data, pieces: n }) => ({ w, h, g, par, data, pieces: n })), clips: meta, pieces };
    }

    // Atlas inteiro de um tipo (ou de uma ficha qualquer: o jogador), na forma da memória: { k, v, frame, pivot, clips, pages, pieces }.
    // keys = lista de clipes; onClip(i, total, key) = progresso; dirs = no máximo tantas direções (8 = só as pares: o jogo LITE).
    function buildAtlas(spec, keys, { typeId = null, hand = null, onClip = null, k = OUT_K, spacing = SPACING, dirs = 0 } = {}) {
        const R = rendererFor(spec, { k, spacing }), clips = [];
        keys.forEach((key, i) => {
            clips.push(renderClip(R, key, typeId, dirs ? { hand, dirs } : { hand }));
            if (onClip) onClip(i + 1, keys.length, key);
        });
        return atlasOf(clips, k);
    }
    // Os clipes já desenhados → o atlas (páginas + o formato).
    function atlasOf(clips, k = OUT_K) {
        const a = packPages(clips);
        a.frame = frameFor(k); a.k = k; a.v = G.SHADE === 'cel' ? 1 : 2; a.pivot = pivFor(k);          // v = formato (2: material + luz)
        return a;
    }
    // Buffers das páginas (para transferir de um Worker sem copiar).
    const atlasBuffers = (a) => a.pages.map((p) => p.data.buffer);

    Object.assign(G, {
        OUT_K, HD_K, PPU, FRAME, PIV, DIRS, ATLAS_MAX, PAGE_TARGET, GROUPS, GROUP_OF, frameFor, pivFor, SPACING, rendererFor, clipDef, renderClip, clipSteps, trimFrame: trim,
        packPages, packAtlas: packPages, buildAtlas, atlasOf, atlasBuffers,
    });
    return G;
}
