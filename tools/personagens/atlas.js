// ============================================================================
// CharAtlasBuild — monta o atlas dos personagens (assets/chars/personagens-atlas.js) com o CharRender: todos os quadros de todas
// as animações de cada tipo de corpo (SpriteLibrary.SHEETS), UMA direção cada (o jogo gira o sprite), mais as bolsas do jogador
// como camada à parte (só os pixels que a bolsa muda, com a oclusão certa).
//
// Quais clipes entram: tudo para `player` e `civA` (o civil A também vira bandido armado, pedestre e figurante); para as outras
// folhas, a lista do jogo (CharacterSheet.sets). Clipe que faltar numa folha, o jogo pega o mesmo clipe do civA.
// ============================================================================

const CharAtlasBuild = {
    WIDTH: 2048,
    PAD: 2,
    FULL: ['player', 'civA'],
    RIDER_ONLY: /^(ride_|park_|fallen_|mount$)/,
    BAGS: ['cross', 'pack', 'tactical'],
    // Clipes de carregar peso: só o jogador. Neles não vai bolsa nas costas; vai a bolsa da MÃO (look.hand), uma camada por tipo.
    PLAYER_ONLY: /^((idle|walk|run)_(hold|pull)|walk_heavy)$/,
    HAND_CLIPS: /_(hold|pull)$/,
    HANDS: { duffel: /_hold$/, briefcase: /_hold$/, suitcase: /_(hold|pull)$/ },

    // [clipe, arma] de uma folha.
    combos(sheet) {
        const out = [], seen = new Set();
        const add = (n, w) => {
            const def = CharacterRig.CLIPS[n];
            if (!def) return;
            let ww = w || 'none';
            if (def.weapons) { if (!def.weapons.includes(ww)) return; } else if (!def.armed) ww = 'none';
            const key = n + ':' + ww;
            if (!seen.has(key)) { seen.add(key); out.push([n, ww]); }
        };
        if (this.FULL.includes(sheet)) {
            for (const [n, def] of Object.entries(CharacterRig.CLIPS)) {
                if (this.RIDER_ONLY.test(n) || (sheet !== 'player' && this.PLAYER_ONLY.test(n))) continue;
                const ws = def.weapons || (def.armed ? ['none', 'pistol', 'smg', 'shotgun', 'bat'] : ['none']);
                for (const w of ws) add(n, w);
            }
        } else for (const [n, w] of CharacterSheet.sets()[sheet] || []) add(n, w);
        return out;
    },

    // Pose do quadro f de N (mesma conta da CharacterSheet).
    pose(def, f, w) { const N = def.frames, t = def.loop ? f / N : (N > 1 ? f / (N - 1) : 0); return def.pose(t, w); },

    // Gera tudo. Bolsas: o quadro com e sem a bolsa, na mesma caixa; a camada é a diferença (CharRender.diff).
    async build(onProgress = () => {}) {
        const t0 = performance.now(), R = CharRender, S = SpriteLibrary.SHEETS;
        const pieces = [], sheets = {}, hashes = new Map();
        const hash = (f) => { let h = 2166136261; const d = f.data; for (let i = 0; i < d.length; i += 3) h = Math.imul(h ^ d[i], 16777619); return `${f.w}x${f.h}:${f.ox},${f.oz}:${h >>> 0}`; };
        const piece = (f) => {
            if (!f.w) return null;
            const k = hash(f);
            if (hashes.has(k)) return hashes.get(k);
            const p = { f, w: f.w, h: f.h };
            hashes.set(k, p); pieces.push(p);
            return p;
        };
        let done = 0, total = 0;
        const plan = Object.keys(S).map((name) => ({ name, combos: this.combos(name) }));
        for (const s of plan) for (const [n] of s.combos) total += CharacterRig.CLIPS[n].frames;
        for (const { name, combos } of plan) {
            const look = S[name].look, entry = sheets[name] = { clips: {}, bags: name === 'player' ? {} : null, half: 0 };
            for (const [n, w] of combos) {
                const def = CharacterRig.CLIPS[n], frames = [], bagFrames = {};
                // camadas deste clipe: bolsas das costas (look.bag) ou, nos clipes de carregar, a bolsa da mão do tipo certo (look.hand)
                const layers = !entry.bags ? [] : this.HAND_CLIPS.test(n)
                    ? Object.keys(this.HANDS).filter((k) => this.HANDS[k].test(n)).map((k) => [k, { hand: k }])
                    : this.BAGS.map((k) => [k, { bag: k }]);
                for (const [b] of layers) bagFrames[b] = [];
                for (let f = 0; f < def.frames; f++) {
                    const pose = this.pose(def, f, w);
                    const body = R.crop(R.render(CharacterRig.build(pose, look)));
                    frames.push(piece(body));
                    // raio máximo do conteúdo (o quad do jogo precisa cobrir o boneco girado + a sombra)
                    if (body.w) for (const [x, z] of [[body.ox, body.oz], [body.ox + body.w, body.oz], [body.ox, body.oz - body.h], [body.ox + body.w, body.oz - body.h]]) entry.half = Math.max(entry.half, hypot(x, z) / R.PPU);
                    for (const [b, extra] of layers) {
                        const pb = CharacterRig.build(this.pose(def, f, w), Object.assign({}, look, extra));
                        const p0 = CharacterRig.build(this.pose(def, f, w), look);
                        const bb = R._bounds(pb), m = 2, box = { l: Math.floor(bb.x0 * R.PPU) - m, r: Math.ceil(bb.x1 * R.PPU) + m, t: Math.ceil(bb.z1 * R.PPU) + m, b: Math.floor(bb.z0 * R.PPU) - m };
                        bagFrames[b].push(piece(R.crop(R.diff(R.render(pb, box), R.render(p0, box)))));
                    }
                    done++;
                }
                entry.clips[n + ':' + w] = frames;
                for (const [b] of layers) (entry.bags[b] || (entry.bags[b] = {}))[n + ':' + w] = bagFrames[b];
                onProgress(done, total, `${name} ${n}${w !== 'none' ? ' ' + w : ''}`);
                await new Promise((r) => setTimeout(r, 0));
            }
        }
        // ---- empacota (prateleiras, mais altos primeiro)
        const P = this.PAD, Wd = this.WIDTH;
        pieces.sort((a, b) => b.h - a.h || b.w - a.w);
        let x = P, y = P, shelf = 0;
        for (const p of pieces) {
            if (x + p.w + P > Wd) { x = P; y += shelf + P; shelf = 0; }
            p.x = x; p.y = y; x += p.w + P; shelf = Math.max(shelf, p.h);
        }
        // altura: múltiplo de 16 (não precisa ser potência de 2: sem mipmaps). O shader codifica y < 2048 (CharArt.packed).
        const H = Math.ceil((y + shelf + P) / 16) * 16;
        if (H > 2048) throw new Error(`atlas dos personagens estourou: ${H} px de altura (máx. 2048) — corte quadros/clipes`);
        const data = new Uint8Array(Wd * H * 4);
        for (const p of pieces) for (let r = 0; r < p.h; r++) data.set(p.f.data.subarray(r * p.w * 4, (r + 1) * p.w * 4), ((p.y + r) * Wd + p.x) * 4);
        // ---- metadados: [x, y, w, h, ox, oz] por quadro (0 = quadro vazio)
        const ref = (p) => (p ? [p.x, p.y, p.w, p.h, p.f.ox, p.f.oz] : 0);
        const meta = {};
        for (const [name, e] of Object.entries(sheets)) {
            meta[name] = { half: +(e.half + 0.35).toFixed(2), clips: {} };
            for (const [k, fr] of Object.entries(e.clips)) meta[name].clips[k] = fr.map(ref);
            if (e.bags) { meta[name].bags = {}; for (const [b, cl] of Object.entries(e.bags)) { meta[name].bags[b] = {}; for (const [k, fr] of Object.entries(cl)) meta[name].bags[b][k] = fr.map(ref); } }
        }
        const png = await PNGEnc.encode(Wd, H, data);
        return { W: Wd, H, data, meta, png, frames: done, pieces: pieces.length, ms: performance.now() - t0 };
    },

    toJS(res) {
        const meta = { version: 1, ppu: CharRender.PPU, w: res.W, h: res.H, sheets: res.meta };
        return '// ============================================================================\n' +
            '// GERADO por tools/personagens/index.html (a partir das poses do CharacterRig) — não edite à mão.\n' +
            `// ${res.frames} quadros (${res.pieces} imagens distintas), uma direção cada, ${CharRender.PPU} px/m, atlas ${res.W}×${res.H}.\n` +
            '// RGBA: R = slot do material × 16, G = luminosidade × alfa (0,5 = cor base), A = cobertura. Ver src/art/CharArt.js.\n' +
            '// ============================================================================\n' +
            'var CHAR_ATLAS = ' + JSON.stringify(meta) + ';\n' +
            `CHAR_ATLAS.a = '${PNGEnc.base64(res.png)}';\n`;
    },
};
