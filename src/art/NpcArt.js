// ============================================================================
// NpcArt — os personagens 2,5D (o pacote de NPCs: civis, PM, BOPE, Exército, traficantes e o protagonista) no jogo.
//
// Os desenhos vêm de atlas prontos (gerados por tools/npcs a partir de src/art/npcgen): 16 direções por quadro (atlas antigos: 8; pilotando,
// 16), vistos do alto a 56° (não giram: cada direção tem o seu desenho). Cada pixel guarda 2 bytes — formato 2 (sombreado contínuo, "pré-
// renderizado"): o MATERIAL (× 8 + nível de água) e a LUZ (0–204 anda pela rampa de 5 tons do material; acima, o brilho especular;
// os 2 bits baixos da luz = cobertura do pixel de borda: a silhueta sai suavizada, como um render 3D, sem contorno preto);
// cores fixas (sombra, contorno, clarão…) guardam o código e o alfa. (Formato 1, o do pacote: código = material × 8 + tom, e o alfa.)
// A cor vem da PALETA (uma linha por variante): o mesmo desenho vira dezenas de pessoas diferentes (pele, cabelo, roupa) e a roupa
// do jogador muda de cor na hora. A sombra de contato já vem desenhada; debaixo d'água o corpo é tingido de azul.
//
// ATLAS PAGINADO: assets/npcs/<tipo>.js (carregado pelo index.html) é só o MANIFESTO — clipes, retângulos e em que página mora cada
// direção de cada clipe (pd). Os pixels ficam nas PÁGINAS assets/npcs/<tipo>/p<i>.js (NPC_PAGE(tipo, i, PNG planar em base64)), cada
// uma com um GRUPO de clipes (hot = parado/andar/correr/mirar…, act, fall, water, car, gym) e uma PARIDADE de direção (0 = as pares — e
// todas as de um clipe de até 8 direções —, 1 = as ímpares): o quadro e o próximo (mistura) estão sempre na mesma textura.
//   • Na carga da página só o protagonista é decodificado (pares primeiro); o resto vem quando um ator precisa: <script> injetado (vale
//     em http(s), Tauri e file://) → Worker decodifica (PNG.decodeRG) → textura + material da página. Fila com prioridade: o que um
//     ator NA TELA precisa agora > hot par > hot ímpar > outros grupos par > ímpar; até 2 decodificações ao mesmo tempo.
//   • Página que ainda não chegou: o ator segue mostrando o último quadro desenhado (ou a direção vizinha, se a página dela já está
//     pronta); ator novo sem nada desenhado fica escondido até a página chegar (SpriteActor._npcDraw).
//   • Memória: passou do orçamento (Config.art.vramMB), as páginas sem uso há 15 s saem da GPU (as menos usadas primeiro) e voltam
//     sozinhas quando pedidas de novo; atlas de dano sem uso há 30 s saem inteiros (voltam do IndexedDB). Os atlas que o jogador
//     usa agora ficam presos.
//   • Perfil leve (Config.art.npcDirs = 8): só as páginas pares (o SpriteActor só escolhe direções pares) e os atlas gerados no jogo
//     já saem com 8 direções.
// O formato antigo (o PNG inteiro, cinza+alfa, dentro do manifesto) continua valendo: um atlas de uma página só.
//
//   NpcArt.sheet(tipo)            folha de um tipo (getClip como a CharacterSheet) — o SpriteActor toca os clipes dela
//   NpcArt.row(tipo, variante)    linha da paleta de uma variante (a cor das roupas)
//   NpcArt.pick(grupo, semente)   { tipo, linha } de alguém de um lugar/papel (casual, biz, poor, beach, police, swat, gang1…)
//   NpcArt.remap(folha, var, nome) troca o boneco antigo (civA/civB/police/swat/army + variante de cor) por um tipo novo
//   NpcArt.mem()                  páginas na GPU, MB, fila… (testes / painel)
//
// Quadro (atributo `fr` do quad): 3 números = (x,y) e (w,h) do retângulo NA PÁGINA e o canto superior esquerdo relativo aos pés.
// ============================================================================

const NpcArt = {
    G: null,                       // o gerador (fichas, paletas; o Worker do jogador usa o mesmo código)
    atlases: {},                   // id → atlas { id, data (metadados), pages, file (páginas em arquivo: podem sair da GPU), dmg, cache, gen }
    sheets: {},                    // id → NpcSheet
    ready: null,                   // Promise: as páginas do dia a dia (hot) do protagonista prontas (o resto chega sob demanda)
    ROWS: 384,                     // linhas da paleta (variantes); 0 = jogador
    _rows: new Map(),              // chave → linha
    _nextRow: 1,
    sharp: 1,
    BASE: './assets/npcs/',
    HERO: ['protagonista', 'protagonista_tatico', 'protagonista_armas'],
    now: 0,                        // relógio do jogo (s; NpcArt.tick): última vez que cada página foi desenhada (LRU)
    stats: { decoded: 0, decodeMs: 0, uploads: 0, evicted: 0, dropped: 0, failed: 0 },

    // (?npc=0 na URL: volta aos bonecos antigos — comparar/depurar)
    available() { return typeof NPC_ATLAS !== 'undefined' && Object.keys(NPC_ATLAS).length > 0 && typeof NpcGenCore === 'function' && !/[?&]npc=0\b/.test(location.search); },

    gen() {
        if (!this.G) { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); this.G = G; }
        return this.G;
    },

    // Direções desenhadas (16; perfil leve: 8 — só as páginas pares) e o orçamento de memória de vídeo das páginas.
    get dirs() { return (typeof Config !== 'undefined' && Config.art && Config.art.npcDirs) || 16; },
    get lite() { return this.dirs <= 8; },
    budget() { return ((typeof Config !== 'undefined' && Config.art && Config.art.vramMB) || 640) * 1048576; },

    // ------------------------------------------------------------------ manifestos e páginas
    // Lê os manifestos (nada é decodificado) e põe na fila as páginas do protagonista (pares primeiro).
    load() {
        if (this.ready) return this.ready;
        const t0 = performance.now();
        for (const [id, d] of Object.entries(NPC_ATLAS)) if (!this.atlases[id]) this._fromManifest(id, d);
        const hero = this.HERO.map((id) => this.atlases[id]).filter(Boolean);
        for (const par of [0, 1]) for (const A of hero) for (const P of A.pages) if (P.par === par) this._want(P);
        const M = this.atlases.protagonista, hot = M ? M.pages.filter((P) => P.g === 'hot' && this._dirOk(P)) : [];
        this.ready = Promise.all(hot.map((P) => this._wait(P))).then(() => {
            let n = 0, px = 0; for (const A of Object.values(this.atlases)) for (const P of A.pages) { n++; px += P.w * P.h; }
            console.log(`[NPCS] ${Object.keys(this.atlases).length} atlas, ${n} páginas (${Math.round(px * 2 / 1048576)} MB se todas carregassem); protagonista pronto em ${Math.round(performance.now() - t0)} ms`);
        });
        return this.ready;
    },
    _fromManifest(id, d) {
        const pages = d.paged && d.pages ? d.pages.map((p) => ({ w: p.w, h: p.h, g: p.g || 'hot', par: p.par || 0, file: p.file, bytes: p.bytes || 0 }))
            : [{ w: d.w, h: d.h, g: 'hot', par: 0, file: id + '.js', legacy: true, bytes: d.png ? Math.round(d.png.length * 0.75) : 0 }];      // (formato antigo: o PNG está no manifesto)
        return this._atlas(id, { clips: d.clips, k: d.k, v: d.v, frame: d.frame }, pages, true, d);
    },
    _atlas(id, data, pages, file, src = null) {
        // (gen: um número por atlas criado — o mesmo id recarregado, como o dano que voltou do aparelho, é outro: SpriteActor.update refaz o clipe)
        const A = { id, data, pages, file, src, gen: (this._genSeq = (this._genSeq || 0) + 1), cache: null, dmg: /#d\d+$/.test(id), born: this.now, hot: false, carClip: null };
        pages.forEach((P, i) => { P.A = A; P.i = i; P.st = P.px ? 'ready' : 'idle'; P.used = 0; P.pri = 9; P.seq = 0; P.tex = null; P.mat = null; });
        this.atlases[id] = A;
        return A;
    },
    _dirOk(P) { return !(P.par && this.lite); },
    _pri(P) { return (P.g === 'hot' ? 1 : 3) + (P.par ? 1 : 0); },

    // Pede a página P. pri: 0 = um ator NA TELA precisa dela agora; sem pri, a do grupo (hot par 1, ímpar 2; outros 3/4). true = já na GPU.
    want(P, pri) { return this._want(P, pri); },
    _q: [], _fetched: [], _seq: 0, _loading: 0, _decoding: 0, _res: 0, _live: new Set(), _waiters: new Set(),
    _want(P, pri = this._pri(P)) {
        if (P.tex) return true;
        if (P.px) { if (this._scene) { this._upload(P); return true; } return false; }
        if (P.dead || !this._dirOk(P)) return false;
        if (P.st === 'idle' || (P.st === 'failed' && performance.now() >= P.retry)) { P.st = 'queued'; P.pri = pri; P.seq = ++this._seq; this._q.push(P); this._pump(); }
        else if (pri < P.pri && (P.st === 'queued' || P.st === 'fetched' || P.st === 'loading')) P.pri = pri;
        return false;
    },
    // Um ator começou a tocar `c`: as páginas do clipe para a fila (a da direção atual já vem pedida pelo desenho, com a prioridade dele).
    wantClip(c) { for (let i = 0; i < c.pd.length; i++) if (i === 0 || c.pd[i] !== c.pd[i - 1]) this._want(c.pages[c.pd[i]]); },
    // carregar (injetar o script) — até 2 adiantados; decodificar — até 2 ao mesmo tempo
    _pump() {
        while (this._loading + this._fetched.length < 2 && this._q.length) this._fetch(this._pop(this._q));
        while (this._decoding < 2 && this._fetched.length) this._decode(this._pop(this._fetched));
    },
    _pop(L) { let k = 0; for (let i = 1; i < L.length; i++) if (L[i].pri < L[k].pri || (L[i].pri === L[k].pri && L[i].seq < L[k].seq)) k = i; return L.splice(k, 1)[0]; },
    _fetch(P) {
        const A = P.A;
        P.st = 'loading';
        if (P.legacy && A.src && A.src.png) { P.b64 = A.src.png; A.src.png = null; P.st = 'fetched'; this._fetched.push(P); return; }
        if (typeof document === 'undefined') { this._fail(P, 'sem documento'); return; }
        this._loading++;
        const s = document.createElement('script');
        let over = false;
        const end = () => {
            if (over) return;
            over = true;
            s.remove();                                                     // (o texto base64 do script pode ser recolhido)
            this._loading--;
            if (P.legacy) { const d = NPC_ATLAS[A.id]; if (d && d.png) { P.b64 = d.png; d.png = null; } if (A.src) NPC_ATLAS[A.id] = A.src; }
            if (P.dead) P.b64 = null;
            else if (P.st === 'loading') { if (P.b64) { P.st = 'fetched'; this._fetched.push(P); } else this._fail(P, 'arquivo ' + P.file + ' não carregou'); }
            this._pump();
        };
        s.onload = end; s.onerror = end;
        s.async = true;
        s.src = this.BASE + P.file;
        document.head.appendChild(s);
    },
    // (chamado pela página ao rodar: NPC_PAGE)
    _onPage(id, i, b64) { const A = this.atlases[id], P = A && A.pages[i]; if (P && P.st === 'loading' && !P.legacy) P.b64 = b64; },
    async _decode(P) {
        P.st = 'decoding'; this._decoding++;
        const src = P.b64, t0 = performance.now();
        P.b64 = null;
        try {
            const img = await PNG.decodeRG(src);
            if (img.w !== P.w || img.h !== P.h) throw new Error(`página ${P.i}: ${img.w}×${img.h}, esperado ${P.w}×${P.h}`);
            this.stats.decoded++; this.stats.decodeMs += performance.now() - t0;
            if (!P.dead) { P.px = img.data; P.st = 'ready'; P.fails = 0; if (this._scene) this._upload(P); }
        } catch (e) { this._fail(P, e); }
        this._decoding--;
        this._wake(P);
        this._pump();
    },
    _fail(P, e) {
        P.st = 'failed'; P.fails = (P.fails || 0) + 1;
        P.retry = performance.now() + Math.min(60000, 4000 * P.fails);                // (tenta de novo mais tarde, cada vez mais espaçado — a rede pode voltar)
        this.stats.failed++;
        console.warn(`[NPCS] página ${P.i} de ${P.A.id} falhou:`, (e && e.message) || e);
        this._wake(P);
    },
    _wait(P) { return P.px || P.tex || P.st === 'failed' ? Promise.resolve() : new Promise((ok) => (P.waiters || (P.waiters = [])).push(ok)); },
    _wake(P) { if (P.waiters) { const w = P.waiters; P.waiters = null; for (const f of w) f(); } },

    // Página decodificada → textura (RG8 / LUMINANCE_ALPHA) + o material dela. Quem esperava por uma página tenta desenhar de novo.
    _upload(P) {
        const sc = this._scene;
        P.tex = new BABYLON.RawTexture(P.px, P.w, P.h, this._gl2 ? BABYLON.Constants.TEXTUREFORMAT_RG : BABYLON.Constants.TEXTUREFORMAT_LUMINANCE_ALPHA, sc, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
        P.tex.wrapU = P.tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        P.px = null; P.st = 'ready'; P.used = this.now;
        this._res += P.w * P.h * 2; this._live.add(P); this.stats.uploads++;
        this._bind(P);
        if (this._waiters.size) for (const a of [...this._waiters]) a._pageReady(P);
    },
    // Tira a página da GPU (o material fica, com uma textura vazia: quem ainda aponta para ele não quebra) — volta quando pedida.
    _evict(P) {
        if (!P.tex) return;
        P.tex.dispose(); P.tex = null; P.st = 'idle'; P.pri = 9;                    // (volta a ser pedida com a prioridade de quem pedir)
        if (P.mat) P.mat.setTexture('atlas', this._emptyTex());
        this._res -= P.w * P.h * 2; this._live.delete(P); this.stats.evicted++;
    },
    _emptyTex() {
        if (this._empty) return this._empty;
        this._empty = new BABYLON.RawTexture(new Uint8Array(4), 1, 1, this._gl2 ? BABYLON.Constants.TEXTUREFORMAT_RG : BABYLON.Constants.TEXTUREFORMAT_LUMINANCE_ALPHA, this._scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
        return this._empty;
    },
    // A cada ~2 s (tick): atlas de dano sem uso há 30 s saem inteiros; passou do orçamento, saem as páginas sem uso há 15 s (LRU).
    // Presos: os atlas que o jogador usa AGORA (o visual pronto ou o gerado, o tático e o das armas — com um visual gerado, o pronto
    // pode sair). Quem está na tela conta como uso (mesmo sem update todo quadro) e, desenhando uma página que saiu, pede de volta.
    _lru() {
        const now = this.now;
        if (typeof SpriteActor !== 'undefined') for (const a of SpriteActor.live) {
            const P = a._pg;
            if (!P || !a.clip || !a.clip.npc || !a.mesh || a.mesh.isDisposed() || !a._onScreen()) continue;
            if (P.tex) P.used = now; else if (!P.dead) a._applyUV();
        }
        for (const A of Object.values(this.atlases)) {
            if (!A.dmg) continue;
            let u = A.born; for (const P of A.pages) if (P.used > u) u = P.used;
            if (now - u >= 30) { this.dropAtlas(A.id); this.stats.dropped++; }
        }
        const B = this.budget();
        if (this._res <= B) return;
        const h = this._lib && this._lib.sheets.hero, pin = h ? [h.atlasName, h.extraAtlas, h.armsAtlas, h.fallbackAtlas] : this.HERO;
        const L = [...this._live].filter((P) => P.A.file && !pin.includes(P.A.id) && now - P.used >= 15).sort((a, b) => a.used - b.used);
        for (const P of L) { if (this._res <= B) break; this._evict(P); }
    },
    // Memória (testes / painel dev).
    mem() {
        let pages = 0, live = 0, cpu = 0; const by = {};
        for (const A of Object.values(this.atlases)) for (const P of A.pages) { pages++; if (P.tex) { live++; by[A.id] = (by[A.id] || 0) + 1; } if (P.px) cpu += P.px.byteLength; }
        return Object.assign({ pages, live, texMB: Math.round(this._res / 1048576), budgetMB: Math.round(this.budget() / 1048576), cpuMB: Math.round(cpu / 1048576), queued: this._q.length + this._fetched.length + this._loading + this._decoding, byAtlas: by }, this.stats);
    },

    // ------------------------------------------------------------------ GPU
    init(scene) {
        if (this._scene === scene) return;
        this._scene = scene;
        this.gen();
        this._gl2 = scene.getEngine().webGLVersion >= 2;
        this._empty = null;
        this._palette();
        this._register();
        for (const A of Object.values(this.atlases)) for (const P of A.pages) if (P.tex || P.mat) { P.tex = null; P.mat = null; if (A.file && P.st === 'ready') P.st = 'idle'; }
        this._live.clear(); this._res = 0;
        for (const A of Object.values(this.atlases)) for (const P of A.pages) if (P.px) this._upload(P);         // (o protagonista, decodificado na carga da página)
        // Ordem de desenho do grupo 1 (o dos carros, ver CarArt): os personagens 2,5D vão logo depois dos carros e portas e antes das
        // copas (alphaIndex ALPHA) e, entre eles, do NORTE para o SUL — quem está mais ao sul fica por cima (a cabeça cresce para o norte).
        scene.setRenderingOrder(1, null, null, (a, b) => {
            if (a._alphaIndex !== b._alphaIndex) return a._alphaIndex > b._alphaIndex ? 1 : -1;
            const ma = a.getMesh(), mb = b.getMesh();
            if (ma._ysort && mb._ysort) {                                  // (com a câmera bússola girada: "norte" = para cima da tela)
                const y = typeof CompassCamera !== 'undefined' ? CompassCamera.yaw : 0;
                if (!y) return mb.position.z - ma.position.z;
                return (mb.position.z - ma.position.z) * Math.cos(y) + (mb.position.x - ma.position.x) * Math.sin(y);
            }
            return b._distanceToCamera - a._distanceToCamera;
        });
    },
    // Recorte da carroceria nos atlas `ids` (os do jogador entrando no carro): c = { x, z, fx, fz, hl, hw, h } ou null (desliga).
    // (vale também para as páginas que chegarem / voltarem depois)
    setClip(ids, c) {
        for (const id of ids) {
            const A = id && this.atlases[id];
            if (!A) continue;
            A.carClip = c || null;
            for (const P of A.pages) if (P.mat) this._clipU(P.mat, A.carClip);
        }
    },
    _clipU(m, c) {
        if (c) { m.setVector4('clipA', new BABYLON.Vector4(c.x, c.z, c.fx, c.fz)); m.setVector4('clipB', new BABYLON.Vector4(c.hl, c.hw, c.h, c.inside ? 2 : 1)); }
        else { m.setVector4('clipA', new BABYLON.Vector4(0, 0, 0, 1)); m.setVector4('clipB', new BABYLON.Vector4(0, 0, 0, 0)); }
    },
    ALPHA: -1.5,                   // entre as portas dos carros (-2) e as copas das árvores (-1)

    // Malha do personagem passa a (ou deixa de) ser 2,5D: grupo de desenho e ordem (ver init).
    sortMesh(mesh, on) {
        if (on) { mesh.renderingGroupId = 1; mesh.alphaIndex = this.ALPHA; mesh._ysort = true; }
        else if (mesh._ysort) { mesh._ysort = false; mesh.renderingGroupId = 0; mesh.alphaIndex = Number.MAX_VALUE; }
    },

    // Paleta: 256 colunas (código da cor) × ROWS linhas (variantes). Os códigos fixos (sombra, contorno, clarão…) valem em toda linha.
    _palette() {
        const W = 256, H = this.ROWS, data = new Uint8Array(W * H * 4);
        this._pal = { data, W, H };
        this._pal.tex = BABYLON.RawTexture.CreateRGBATexture(data, W, H, this._scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        this._pal.tex.wrapU = this._pal.tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        for (const [key, row] of this._rows) this._fillRow(row, this._rowSpec.get(key), false);
        this._pal.tex.update(data);
    },
    _rowSpec: new Map(),

    _fillRow(row, spec, upload = true) {
        const P = this._pal;
        if (!P) return;
        const G = this.gen(), ramps = G.rampsFor(spec), hex = G.hexrgb;
        for (let code = 0; code < 256; code++) {
            const tone = code & 7, mat = code >> 3;
            let c = null;
            if (code < 8 || tone > 4) c = G.SPECIAL[code] || null;
            else if (ramps[mat]) c = hex(ramps[mat][tone]);
            const o = (row * P.W + code) * 4;
            if (c) { P.data[o] = c[0]; P.data[o + 1] = c[1]; P.data[o + 2] = c[2]; P.data[o + 3] = 255; }
        }
        if (upload) P.tex.update(P.data);
    },

    // Linha da paleta da variante `v` do tipo `id` (cria na primeira vez).
    row(id, v = 0) {
        const key = id + '#' + v;
        let r = this._rows.get(key);
        if (r !== undefined) return r;
        r = this._nextRow < this.ROWS ? this._nextRow++ : 1 + (this.G.hashStr(key) % (this.ROWS - 1));
        this._rows.set(key, r);
        this._rowSpec.set(key, this.gen().variantSpec(id, v));
        this._fillRow(r, this._rowSpec.get(key));
        return r;
    },
    // Linha 0 = o jogador: as cores da roupa que ele veste (Outfit / PlayerLook). Muda na hora, em todas as animações.
    setPlayerColors(spec) {
        this._rows.set('player', 0);
        this._rowSpec.set('player', spec);
        this._fillRow(0, spec);
    },

    _register() {
        if (BABYLON.Effect.ShadersStore.npcArtVertexShader) return;
        // fr = (x*4096+y, w*4096+h, (ox+2048)*4096+(oy+2048)) do quadro; position = local (m) relativo aos pés; ppu = px por metro.
        BABYLON.Effect.ShadersStore.npcArtVertexShader = `
            precision highp float;
            attribute vec3 position;
            attribute vec4 color;
            attribute vec4 fr;
            attribute vec4 fr2;          // PRÓXIMO quadro (mesmo formato de fr) + peso da mistura em w (0 = só o quadro atual)
            uniform mat4 world;
            uniform mat4 viewProjection;
            uniform float ppu;
            uniform float lift;
            varying vec2 vPx;
            varying vec4 vFr;
            varying vec2 vC;
            varying vec3 vW;
            varying vec3 vPx2;
            varying vec4 vFr2;
            varying vec2 vG;
            vec2 un(float v) { float hi = floor(v / 4096.0 + 0.0001); return vec2(hi, v - hi * 4096.0); }
            void main(void) {
                vec2 xy = un(fr.x), wh = un(fr.y), o = un(fr.z) - 2048.0;
                vPx = vec2(xy.x - o.x + position.x * ppu, xy.y - o.y - position.z * ppu);
                vFr = vec4(xy, xy + wh);
                vec2 xy2 = un(fr2.x), wh2 = un(fr2.y), o2 = un(fr2.z) - 2048.0;
                vPx2 = vec3(xy2.x - o2.x + position.x * ppu, xy2.y - o2.y - position.z * ppu, fr2.w);
                vFr2 = vec4(xy2, xy2 + wh2);
                vC = color.rg;
                vW = vec3(position.x, position.z, color.a);                 // x e "altura" na imagem (m), linha d'água (m, 0 = seco)
                vec4 wp = world * vec4(position, 1.0);
                vG = wp.xz;                                                 // (ponto do chão onde este pixel do desenho cai: recorte do carro)
                gl_Position = viewProjection * wp;
                // "De pé" para a profundidade: o desenho cresce para o norte (cabeça ~1 m acima dos pés na imagem), mas é uma pessoa em pé —
                // a parte de cima testa a profundidade como se estivesse mais ALTA (não some atrás da parede/telhado baixo logo ao norte).
                // Com os pés debaixo de um toldo (color.b = altura dele, SpriteActor._updateCover), o corpo inteiro fica abaixo do toldo.
                float up = max(position.z, 0.0) * lift;
                if (color.b > 0.5) up = min(up, color.b - 0.15 - wp.y);
                vec4 lp = viewProjection * (wp + vec4(0.0, up, 0.0, 0.0));
                gl_Position.z = lp.z / lp.w * gl_Position.w;
            }`;
        // Bilinear feito à mão sobre a cor JÁ pintada (o atlas tem códigos, não cores): suave de longe; `sharp` > 1 = de perto, nítido.
        // De longe (`mini` = texels do atlas por pixel da tela > 1,3: dirigindo, celular, tela pequena), o bilinear de 4 amostras pulava
        // texels — o boneco serrilhava e "fervia" andando. Aí vale a MÉDIA de n×n amostras sobre a pegada do pixel (filtro de caixa).
        BABYLON.Effect.ShadersStore.npcArtFragmentShader = `
            precision highp float;
            varying vec2 vPx;
            varying vec4 vFr;
            varying vec2 vC;
            uniform sampler2D atlas;
            uniform sampler2D palette;
            uniform vec2 atlasSize;
            uniform float palRows;
            uniform vec3 tint;
            uniform float sharp;
            uniform float mini;
            uniform float la;
            uniform float fmt;
            uniform float wt;
            uniform float ppu;
            varying vec3 vW;
            varying vec3 vPx2;
            varying vec4 vFr2;
            varying vec2 vG;
            uniform vec4 clipA;          // recorte da carroceria (entrando no carro): centro (x, z) e frente (fx, fz)
            uniform vec4 clipB;          // meio comprimento, meia largura, altura máxima na imagem (m) e o modo em w (ver main)
            float hb(float n) { return fract(sin(n) * 43758.5453); }
            vec4 tap(vec2 t, vec4 R) {
                if (t.x < R.x || t.y < R.y || t.x >= R.z || t.y >= R.w) return vec4(0.0);
                vec4 s = texture2D(atlas, (t + 0.5) / atlasSize);
                float code = floor(s.r * 255.0 + 0.5), b1 = floor((la > 0.5 ? s.a : s.g) * 255.0 + 0.5);
                float mat = floor(code / 8.0), tone = code - mat * 8.0, row = (floor(vC.x + 0.5) + 0.5) / palRows;
                vec3 c; float a, a8;
                if (fmt < 1.5) {                                                   // formato 1: código (material × 8 + tom) e alfa
                    a8 = b1; a = a8 / 255.0;
                    if (a < 0.002) return vec4(0.0);
                    c = texture2D(palette, vec2((code + 0.5) / 256.0, row)).rgb;
                    if (a8 < 254.5 && (code == 1.0 || (code >= 8.0 && tone < 4.5)))
                        c = mix(c, vec3(0.1804, 0.4078, 0.5569), 0.45 + 0.45 * clamp((200.0 - a8) / 150.0, 0.0, 1.0));
                } else if (code < 8.0 || tone > 4.5) {                             // formato 2, cor fixa: [código, alfa]
                    a8 = b1; a = a8 / 255.0;
                    if (a < 0.002) return vec4(0.0);
                    c = texture2D(palette, vec2((code + 0.5) / 256.0, row)).rgb;
                } else {                                                           // formato 2, material: [material × 8 + água, LUZ]
                    // luz 0–204 anda pela rampa de 5 tons do material (sombreado contínuo); acima disso, o brilho (quase branco).
                    // Os 2 bits baixos da luz = cobertura do pixel de borda (0 = cheio; 1–3 = 75/50/25%): silhueta suavizada, sem contorno.
                    float cov = mod(b1, 4.0); b1 -= cov;
                    float u = min(b1, 204.0) / 204.0 * 4.0, i0 = floor(u), i1 = min(i0 + 1.0, 4.0);
                    vec3 c0 = texture2D(palette, vec2((mat * 8.0 + i0 + 0.5) / 256.0, row)).rgb;
                    vec3 c1 = texture2D(palette, vec2((mat * 8.0 + i1 + 0.5) / 256.0, row)).rgb;
                    c = mix(c0, c1, u - i0);
                    if (b1 > 204.0) c = mix(c, c1 + (1.0 - c1) * 0.65, (b1 - 204.0) / 51.0);
                    a8 = tone < 0.5 ? 255.0 : 200.0 - (tone - 1.0) / 3.0 * 150.0;
                    if (tone > 0.5) c = mix(c, vec3(0.1804, 0.4078, 0.5569), 0.45 + 0.45 * clamp((200.0 - a8) / 150.0, 0.0, 1.0));     // debaixo d'água
                    a = a8 / 255.0 * (1.0 - cov * 0.25);
                }
                if (code > 0.5) c *= tint * vC.y;
                return vec4(c * a, a);
            }
            // bilinear do quadro cujo retângulo no atlas é R (px), no ponto p (px)
            vec4 sampleFrame(vec2 px, vec4 R) {
                if (mini > 1.3) {
                    float n = min(4.0, ceil(mini));
                    vec4 acc = vec4(0.0);
                    for (int j = 0; j < 4; j++) for (int k = 0; k < 4; k++) {
                        if (float(k) >= n || float(j) >= n) continue;
                        acc += tap(floor(px + ((vec2(float(k), float(j)) + 0.5) / n - 0.5) * mini), R);
                    }
                    return acc / (n * n);
                }
                vec2 p = px - 0.5, i = floor(p), f = clamp((p - i - 0.5) * sharp + 0.5, 0.0, 1.0);
                return mix(mix(tap(i, R), tap(i + vec2(1.0, 0.0), R), f.x), mix(tap(i + vec2(0.0, 1.0), R), tap(i + vec2(1.0, 1.0), R), f.x), f.y);
            }
            void main(void) {
                vec4 c = sampleFrame(vPx, vFr);
                // mistura com o PRÓXIMO quadro da animação (gráfico suave): a pose muda em degradê, sem o salto seco entre quadros
                if (vPx2.z > 0.004) c = mix(c, sampleFrame(vPx2.xy, vFr2), vPx2.z);
                // Vadeando (vW.z = profundidade da água no corpo, m): abaixo da linha d'água o desenho fica tingido de mar e some aos
                // poucos com a profundidade, e a linha balança com uma franja de espuma. Na imagem, 1 m de altura sobe 0,56 m (câmera 56°).
                if (vW.z > 0.01 && c.a > 0.02) {
                    float wl = vW.z * 0.56 + 0.018 * sin(vW.x * 26.0 + wt * 6.0) + 0.012 * sin(vW.x * 61.0 - wt * 9.0);
                    float below = wl - vW.y;
                    if (below > -0.03) {
                        vec3 rgb = c.rgb / c.a;
                        float sub = smoothstep(-0.006, 0.006, below), deep = smoothstep(0.0, 0.32, below);
                        rgb = mix(rgb, mix(vec3(0.27, 0.55, 0.62), vec3(0.15, 0.36, 0.48), deep), sub * (0.5 + 0.3 * deep));
                        float foam = 1.0 - smoothstep(0.004, 0.026, abs(below - 0.004));
                        rgb = mix(rgb, vec3(0.86, 0.95, 0.97) * tint, foam * 0.85);
                        float a = c.a * (1.0 - sub * (0.25 + 0.6 * deep)) + foam * 0.3 * (1.0 - c.a);
                        c = vec4(rgb * a, a);
                    }
                }
                // Entrando/saindo do carro (Player.setCarClip): o que está abaixo da altura que já entrou some debaixo da carroceria —
                // os pés primeiro, a cabeça por último. Com os pés ainda fora, só o que cai SOBRE o carro; com os pés já dentro (modo 2),
                // todo o corpo abaixo dessa altura (o desenho cresce para o norte: senão a cabeça "atravessava" a borda do teto).
                if (clipB.w > 0.5 && vW.y < clipB.z) {
                    vec2 d = vG - clipA.xy;
                    if (clipB.w > 1.5 || (abs(dot(d, clipA.zw)) < clipB.x && abs(dot(d, vec2(clipA.w, -clipA.z))) < clipB.y)) discard;
                }
                if (c.a < 0.02) discard;
                gl_FragColor = c;
            }`;
    },

    // Material de uma página (o mesmo shader para todas; cada página tem a sua textura e o seu tamanho). Também refaz o que mudou
    // enquanto ela estava fora da GPU (zoom, relógio da água, recorte do carro).
    _bind(P) {
        const A = P.A;
        let m = P.mat;
        if (!m) {
            m = P.mat = new BABYLON.ShaderMaterial('npcArt_' + A.id + '_' + P.i, this._scene, { vertex: 'npcArt', fragment: 'npcArt' }, {
                attributes: ['position', 'color', 'fr', 'fr2'],
                uniforms: ['world', 'viewProjection', 'ppu', 'lift', 'atlasSize', 'palRows', 'tint', 'sharp', 'mini', 'la', 'fmt', 'wt', 'clipA', 'clipB'],
                samplers: ['atlas', 'palette'],
                needAlphaBlending: true,
            });
            m.setTexture('palette', this._pal.tex);
            m.setFloat('ppu', this.ppuOf(A));
            m.setFloat('fmt', A.data.v || 1);
            m.setFloat('lift', 4.0);
            m.setVector2('atlasSize', new BABYLON.Vector2(P.w, P.h));
            m.setFloat('palRows', this.ROWS);
            m.setColor3('tint', SpriteMaterial.sharedTint());
            m.setFloat('la', this._gl2 ? 0 : 1);
            m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
            m.backFaceCulling = false;
        }
        m.setTexture('atlas', P.tex || this._emptyTex());
        m.setFloat('sharp', this._sharpOf(A));
        m.setFloat('mini', this._miniOf(A));
        m.setFloat('wt', this._wt || 0);
        this._clipU(m, A.carClip);
        return m;
    },

    // TAMANHO dos personagens no mundo: px por metro na resolução de referência (atlas com k = 0,5). Um atlas em alta definição
    // (k = 1) tem o dobro de px por metro — ppuOf.
    get ppu() { return (Config.art && Config.art.npcPpu) || 26; },
    ppuOf(A) { return this.ppu * ((A.data.k || 0.5) / 0.5); },

    // Nitidez conforme o zoom: px de tela por texel do atlas (> 1 = ampliado: sem borrar). Chamado a cada quadro pelo jogo.
    _spm: 0,
    // (até 1,6: de perto o boneco fica nítido, mas liso — sem os "quadradinhos" de pixel art ampliada)
    _sharpOf(A) { return Math.max(1, Math.min(1.6, (this._spm || this.ppu) / this.ppuOf(A))); },
    _miniOf(A) { return Math.max(1, Math.min(6, this.ppuOf(A) / (this._spm || this.ppu))); },

    // Relógio da linha d'água (ondulação de quem vadeia): um uniform por página na GPU. Também o relógio do LRU (~2 s).
    _lruT: 0,
    tick(t) {
        this.now = t;
        this._wt = t % 1000;
        for (const P of this._live) P.mat.setFloat('wt', this._wt);
        if (t - this._lruT >= 2) { this._lruT = t; this._lru(); }
    },

    setZoom(screenPxPerMeter) {
        if (Math.abs(screenPxPerMeter - this._spm) < 0.05) return;
        this._spm = screenPxPerMeter;
        this.sharp = this._sharpOf({ data: {} });
        for (const A of Object.values(this.atlases)) {
            const s = this._sharpOf(A), mi = this._miniOf(A);
            for (const P of A.pages) if (P.mat) { P.mat.setFloat('sharp', s); P.mat.setFloat('mini', mi); }
        }
    },

    // ------------------------------------------------------------------ clipes
    // Clipe pronto para o SpriteActor: { npc: true, pk: { fr, box, n }, pages, pd (página de cada direção), fps, loop, frames, dirs }.
    // A textura/material vem da página da direção desenhada (pages[pd[dir]].mat, quando ela está na GPU). null = o atlas não tem.
    clip(id, key) {
        const A = this.atlases[id];
        if (!A) return null;
        const c = A.data.clips[key];
        if (!c) return null;
        if (!A.hot) { A.hot = true; for (const P of A.pages) if (P.g === 'hot') this._want(P); }       // (o tipo apareceu: o dia a dia dele já vai para a fila)
        const cache = A.cache || (A.cache = new Map());                 // (fora dos metadados: o atlas do jogador vai inteiro para o IndexedDB)
        if (cache.has(key)) return cache.get(key);
        const ppu = this.ppuOf(A), n = c.n, dirs = c.dirs || 8, fr = new Float32Array(n * dirs * 3), pd = new Int16Array(dirs);    // (dirs ausente = cache antigo: 8)
        for (let d = 0; d < dirs; d++) { const p = c.pd ? c.pd[d] : 0; pd[d] = p >= 0 && p < A.pages.length ? p : 0; }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        c.f.forEach((q, i) => {
            const [x, y, w, h, ox, oy] = q, P = A.pages[pd[Math.min(dirs - 1, Math.floor(i / n))]];
            if (w && (x + w > Math.min(4096, P.w) || y + h > Math.min(4096, P.h)) && !A.warned) { A.warned = true; console.warn(`[NPCS] ${id}: quadro fora da página (x·4096 + y) em ${key}`); }
            fr[i * 3] = x * 4096 + y; fr[i * 3 + 1] = w * 4096 + h; fr[i * 3 + 2] = (ox + 2048) * 4096 + (oy + 2048);
            if (!w) return;
            x0 = Math.min(x0, ox); y0 = Math.min(y0, oy); x1 = Math.max(x1, ox + w); y1 = Math.max(y1, oy + h);
        });
        if (x0 === Infinity) { x0 = y0 = 0; x1 = y1 = 1; }
        // caixa do quad em metros (x leste, z norte), relativa aos pés: a imagem cresce para baixo = sul
        const box = [x0 / ppu, -y1 / ppu, x1 / ppu, -y0 / ppu];
        const [name, weapon] = key.split(':');
        const clip = {
            name, weapon, npc: true, atlas: id, gen: A.gen || 0, frames: n, dirs, fps: c.fps, loop: c.loop, pk: { fr, box, n }, pages: A.pages, pd, shared: true, frame: 0, W: 0, H: 0,
            gaitK: this.STRIDE.test(name) ? 1 / this.scaleOf(id) : 1,         // (passada com o pé plantado: o ritmo pela escala do tipo — scaleOf)
            get material() { const P = this.pages[this.pd[0]]; return (P && P.mat) || null; },      // (compatibilidade: o da direção 0)
        };
        cache.set(key, clip);
        return clip;
    },

    // Atlas gerado em tempo de jogo (o visual do jogador: PlayerLook; o machucado: dmgSheet) — já decodificado. Aceita a forma paginada
    // ({ k, v, frame, clips, pages: [{ w, h, g, par, data }] }) e a antiga ({ w, h, data, clips }: uma página só).
    addAtlas(id, a) {
        if (this.atlases[id]) this.dropAtlas(id);
        const g = this.paged(a);
        const pages = g.pages.map((p) => ({ w: p.w, h: p.h, g: p.g || 'hot', par: p.par || 0, px: p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data) }));
        const A = this._atlas(id, { clips: g.clips, k: g.k || 0.5, v: g.v || 2, frame: g.frame }, pages, false);
        return A;
    },
    // Atlas gerado (G.buildAtlas / G.packPages / o empacotador antigo G.packAtlas) → a forma paginada (com dirs e pd em todo clipe).
    paged(a, k, frame) {
        if (!a) return a;
        let clips = a.clips;
        const pages = a.pages || [{ w: a.w, h: a.h, g: 'hot', par: 0, data: a.data }];
        for (const c of Object.values(clips)) { if (!c.dirs) c.dirs = 8; if (!c.pd) c.pd = new Array(c.dirs).fill(0); }
        return { k: a.k != null ? a.k : k, v: a.v || 2, frame: a.frame != null ? a.frame : frame, clips, pages };
    },
    // Atlas paginado ↔ o que vai para o IndexedDB (cada página comprimida: ~4× menos espaço). Sem CompressionStream (Safari < 16.4,
    // Firefox < 113) — ou se comprimir falhar —, a página vai CRUA (data) e o resultado sai com raw: true (quem guarda decide quanto cabe:
    // PlayerLook._idbPut); o unzip lê as duas formas. Página comprimida sem DecompressionStream para abrir = null (refaz).
    get canZip() { return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'; },
    async zip(a) {
        const pages = [];
        let raw = false;
        for (const p of a.pages) {
            let z = null;
            if (this.canZip) { try { z = await this._deflate(p.data); } catch (e) { z = null; } }
            if (z) { pages.push({ w: p.w, h: p.h, g: p.g, par: p.par, z }); continue; }
            raw = true;
            const d = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data);
            pages.push({ w: p.w, h: p.h, g: p.g, par: p.par, data: d.byteOffset || d.byteLength !== d.buffer.byteLength ? d.slice() : d });     // (vista de um buffer maior: o IndexedDB guardaria o buffer inteiro)
        }
        return raw ? { k: a.k, v: a.v, frame: a.frame, clips: a.clips, pages, raw } : { k: a.k, v: a.v, frame: a.frame, clips: a.clips, pages };
    },
    async unzip(a) {
        if (!a || !a.pages) return null;                                     // (formato de antes das páginas: refaz)
        const pages = [];
        try { for (const p of a.pages) pages.push({ w: p.w, h: p.h, g: p.g, par: p.par, data: p.z ? await this._inflate(p.z) : p.data }); }
        catch (e) { return null; }                                          // (comprimido e sem DecompressionStream: refaz)
        return { k: a.k, v: a.v, frame: a.frame, clips: a.clips, pages };
    },
    // Geração do desenho de um tipo (o atlas foi trocado: os clipes já tocando são refeitos — SpriteActor.update).
    // (atlas descartado — o visual antigo do jogador — = -1: quem ainda o usa, como o piloto da moto, também refaz o clipe)
    genOf(id) { const A = this.atlases[id]; return A ? A.gen || 0 : -1; },
    // Escala do desenho de um atlas: cada tipo sai na escala da ficha (spec.scale; NpcGenBuild: charScale = scale·k/1,04) num quad do mesmo
    // tamanho para todos, então o pé plantado anda scale × o do corpo de referência (escala 1 — o protagonista, onde Config.anim.walk/run e
    // os fatores do jogo foram medidos: strafe, wade, SpriteActor.CLIMB, walk_heavy). Medido (motion.cjs footSpeed, 34 tipos × as passadas,
    // qualquer arma): footSpeed ÷ o da referência = scale (±0,1%). Os clipes de passada (STRIDE) tocam a 1/scale: sem deslize em nenhum tipo.
    // Dano (#dN) = o tipo; visual gerado do jogador (hero:…) = a ficha dele (PLAYER_DEFAULT + roupa: sem scale → 1), ou A.scale se quem
    // registrou o atlas a informou.
    STRIDE: /^(walk|run|walk_up|climb|scared|sneak|strafe|wade|walk_hold|run_hold|walk_pull|walk_heavy|run_heavy|baton_walk)$/,
    scaleOf(id) {
        const A = this.atlases[id];
        if (A && A.scale > 0) return A.scale;
        let k = 1;
        try { const G = this.gen(), s = G.BY_ID[String(id).replace(/#d\d+$/, '')]; if (s) k = G.fullSpec(s).scale || 1; } catch (e) { /* sem o gerador: 1 */ }
        if (A) A.scale = k;
        return k;
    },

    // Atlas gerados no aparelho (os de dano) ficam no IndexedDB, comprimidos, sob esta versão.
    HD_VERSION: 8,                 // mude quando o gerador mudar o desenho (os atlas guardados são refeitos) — 2: atlas até 4096 de lado; 3: passada longa; 4: subida (walk_up, climb); 5: corpo da malha 3D; 6: braços soltos, cabeça maior, silhueta feminina, luz; 7: visual 3D sem contorno; 8: 16 direções, mais quadros, páginas
    hdOn() { return !!(typeof Config !== 'undefined' && Config.art && Config.art.hd) && !!this._scene; },
    async _deflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); },
    async _inflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); },
    _db() {
        if (this._dbp) return this._dbp;
        return (this._dbp = new Promise((ok) => {
            try {
                const r = indexedDB.open('dirty-money-hd', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('atlas');
                r.onsuccess = () => {
                    const db = r.result;
                    try {                                                          // (versões antigas do desenho: apaga)
                        const st = db.transaction('atlas', 'readwrite').objectStore('atlas'), q = st.getAllKeys(), pre = `v${this.HD_VERSION}.`;
                        q.onsuccess = () => { for (const k of q.result) if (!String(k).startsWith(pre)) st.delete(k); };
                    } catch (e) { /* segue */ }
                    ok(db);
                };
                r.onerror = () => ok(null);
            } catch (e) { ok(null); }
        }));
    },
    async _dbGet(k) {
        const db = await this._db();
        if (!db) return null;
        return new Promise((ok) => {
            try { const q = db.transaction('atlas').objectStore('atlas').get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }
            catch (e) { ok(null); }
        });
    },
    async _dbPut(k, v) {
        const db = await this._db();
        if (!db) return;
        try { db.transaction('atlas', 'readwrite').objectStore('atlas').put(v, k); } catch (e) { console.warn('[NPCS] atlas de dano não guardado:', e && e.message); }
    },

    // Descarta um atlas (o visual antigo do jogador, um atlas de dano sem uso…): texturas, materiais e quem o desenhava (esconde até
    // desenhar de novo: o SpriteActor refaz o clipe no próximo update).
    dropAtlas(id) {
        const A = this.atlases[id];
        if (!A) return;
        delete this.atlases[id];
        if (typeof SpriteActor !== 'undefined') for (const a of SpriteActor.live) if (a._pg && a._pg.A === A) a._lostPage();
        for (const P of A.pages) {
            P.dead = true;
            if (P.tex) { P.tex.dispose(); this._res -= P.w * P.h * 2; this._live.delete(P); }
            if (P.mat) P.mat.dispose();
            P.tex = P.mat = P.px = P.b64 = null;
            this._wake(P);
        }
        this._q = this._q.filter((P) => P.A !== A); this._fetched = this._fetched.filter((P) => P.A !== A);
        for (const s of Object.values(this.sheets)) if (s.uses(id)) s.clips = {};      // (nada de clipe guardado apontando para ele)
    },

    // Folha de um tipo. legacy = folha antiga para o que o atlas não tem (a primeira que pedir fica).
    sheet(id, legacy = null, legacyVariant = 2) {
        const s = this.sheets[id] || (this.sheets[id] = new NpcSheet(id));
        if (legacy && !s.legacy) { s.legacy = legacy; s.legacyVariant = legacyVariant; }
        return s;
    },

    // ------------------------------------------------------------------ ESTADO DE DANO pintado (ficha.dmg — NpcGenMesh.paintDamage)
    // Pedestre/policial machucado: a folha "<tipo>#d<nível>" usa o atlas do tipo com o dano PINTADO na roupa e na pele (gerado aqui num
    // Worker na 1ª vez e guardado no aparelho, comprimido; as cores continuam as da paleta de cada um) e, enquanto não fica pronto — ou
    // para o clipe que ele não tem —, o atlas normal do tipo. Sem uso há 30 s, sai da memória (volta do aparelho). O jogador usa o
    // PlayerLook (o dano entra na ficha do visual).
    DMG_CLIPS: /^(idle|walk|run|scared|hurt|dead|surrender|kneel|aim|shoot|draw|holdup|punch|punchL|kick|flail|lie|getup|tumble|swing|holdup)$/,
    dmgSheet(id, lvl) {
        const sid = id + '#d' + lvl;
        let s = this.sheets[sid];
        if (!s) {
            const b = this.sheets[id];
            s = this.sheets[sid] = new NpcSheet(sid);
            s.fallbackAtlas = id; s.baseId = id; s.dmgLvl = lvl;
            if (b) { s.legacy = b.legacy; s.legacyVariant = b.legacyVariant; }
        }
        this._dmgWant(id, lvl);
        return s;
    },
    // O ator passa a usar a folha do nível de dano (0 = a normal), no mesmo clipe e na mesma fase.
    applyDamage(actor, lvl) {
        const sh = actor.sheet;
        if (!sh || !sh.isNpc || sh.npcRemap || (this._lib && sh === this._lib.sheets.hero)) return;
        const base = sh.baseId || sh.id, to = lvl > 0 ? this.dmgSheet(base, lvl) : this.sheets[base];
        if (!to || to === sh) return;
        const name = actor.clipName || 'idle', w = actor.clip ? actor.clip.weapon : 'none', ph = actor.phase;
        actor.useSheet(to);
        if (actor.play(name, w, { restart: true })) actor.setPhase(ph);
    },
    _dmgQ: [], _dmgBusy: false,
    _dmgWant(id, lvl) {
        const sid = id + '#d' + lvl;
        if (this.atlases[sid] || this._dmgQ.includes(sid) || this._dmgNow === sid || !this.atlases[id]) return;
        this._dmgQ.push(sid);
        this._dmgPump();
    },
    async _dmgPump() {
        if (this._dmgBusy || !this._dmgQ.length) return;
        this._dmgBusy = true;
        const sid = this._dmgNow = this._dmgQ.shift(), [id, d] = sid.split('#d'), G = this.gen(), B = this.atlases[id], k = (B && B.data.k) || 1, dirs = this.lite ? 8 : 0;
        const key = `v${this.HD_VERSION}.${k}.${dirs || 'n'}|${sid}`;
        try {
            if (!B) throw new Error('tipo sem atlas');
            let a = await this.unzip(await this._dbGet(key));
            if (!a) {
                const keys = G.TYPES[id].clips.filter((c) => this.DMG_CLIPS.test(c.split(':')[0]));
                a = this.paged(await new Promise((ok, fail) => {
                    const wk = PlayerLook._worker('dmg'), job = (this._dmgJob = (this._dmgJob || 0) + 1);
                    wk.onmessage = (e) => { wk._busy = false; if (e.data.job !== job) return; if (e.data.error) fail(new Error(e.data.error)); else ok(e.data.atlas); };
                    wk.postMessage({ type: 'atlas', job, id, keys, k, dmg: +d, dirs });       // (perfil leve: 8 direções)
                }), k, G.frameFor(k));
                if (this.canZip) this.zip(a).then((z) => !z.raw && this._dbPut(key, z), () => {});     // (sem compressão não guarda: 34 tipos × 3 níveis crus = GBs)
            }
            if (this.atlases[id]) {
                this.addAtlas(sid, a);
                const s = this.sheets[sid];
                if (s) {                                                          // quem já usa a folha passa aos clipes pintados (na mesma fase)
                    s.clips = {};
                    if (typeof SpriteActor !== 'undefined') for (const x of SpriteActor.live) if (x.sheet === s && x.clip && x.clip.npc && x.clip.atlas !== sid) x.replay();
                }
            }
        } catch (e) { console.warn('[NPCS] dano de ' + sid + ' falhou:', e); }
        this._dmgNow = null; this._dmgBusy = false;
        this._dmgPump();
    },

    // Liga o NpcArt à biblioteca de sprites: as folhas antigas de gente passam a virar tipos 2,5D; o jogador ganha a folha "hero".
    attach(lib) {
        if (!this.available()) return false;
        this.init(lib.scene);
        // (rider/courier: quem pilota moto, bicicleta, jet ski e lancha — o tipo ganha os clipes ride_* em 16 direções)
        for (const k of ['civA', 'civB', 'police', 'swat', 'army', 'rider', 'courier']) {
            const s = lib.sheets[k];
            if (s) s.npcRemap = (v, name) => this.remap(k, v, name, s);
        }
        const hero = lib.sheets.hero = this.sheet('protagonista', lib.sheets.player, 0);
        if (this.atlases.protagonista_armas) hero.armsAtlas = 'protagonista_armas';           // (as armas novas: PlayerLook troca pelo do visual gerado)
        this._lib = lib;
        hero.legacyVariant = 0;
        lib.npc = this;
        return true;
    },

    // ------------------------------------------------------------------ quem é quem
    // Grupo de roupa (lugar) a partir da variante de cor antiga (CharacterRig.VARIANT_GROUPS) e da folha antiga.
    _groupOf(sheetName, v) {
        if (sheetName === 'courier' || (sheetName === 'rider' && v >= CharacterRig.VARIANT_COURIER && v < CharacterRig.VARIANT_COURIER + CharacterRig.COURIERS)) return 'courier';
        if (sheetName === 'police') return 'police';
        if (sheetName === 'swat') return 'swat';
        if (sheetName === 'army') return 'army';
        if (v === 1) return 'police';
        const VG = CharacterRig.VARIANT_GROUPS;
        for (const [g, [a, b]] of Object.entries(VG)) if (v >= a && v <= b) return g;
        if (v === CharacterRig.VARIANT_SWAT) return 'swat';
        if (v === CharacterRig.VARIANT_ARMY) return 'army';
        return 'casual';
    },
    // Tipo + variante de alguém de um grupo, escolhido pela semente (mesma semente = mesma pessoa).
    pick(group, seed) {
        const G = this.gen();
        let types = G.typesFor(group).filter((id) => this.atlases[id]);
        if (!types.length) types = G.typesFor('casual').filter((id) => this.atlases[id]);
        if (!types.length) return null;
        const id = types[seed % types.length], v = Math.floor(seed / 977) % G.TYPES[id].nvar;
        return { id, v, row: this.row(id, v) };
    },
    _seen: new Map(),
    // Boneco antigo → tipo novo. A semente vem do nome do sprite (cada NPC tem o seu) + a variante antiga.
    remap(sheetName, variant, name, legacy = null) {
        if (!this._scene) return null;
        // Piloto variante 0 = o jogador (subiu na moto/barco): a folha dele, com o visual dele.
        if ((sheetName === 'rider' || sheetName === 'courier') && variant === 0 && this._lib && this._lib.sheets.hero) return { sheet: this._lib.sheets.hero, row: 0, type: 'protagonista' };
        const n = (this._seen.get(name) || 0) + 1;
        this._seen.set(name, n);
        const seed = this.gen().hashStr(`${name}#${n}:${sheetName}:${variant}`);
        const p = this.pick(this._groupOf(sheetName, variant), seed);
        return p ? { sheet: this.sheet(p.id, legacy, variant), row: p.row, type: p.id } : null;
    },
};

// Página de atlas carregada: assets/npcs/<tipo>/p<i>.js chama isto ao rodar (o <script> foi injetado pelo NpcArt._fetch).
function NPC_PAGE(id, i, b64) { NpcArt._onPage(id, i, b64); }

// ----------------------------------------------------------------------------
// NpcSheet — folha de um tipo 2,5D com a interface da CharacterSheet (o SpriteActor e o resto do jogo não precisam saber).
// Clipe que o atlas não tem: com outra arma → a versão sem arma; senão → a folha antiga equivalente (ex.: subir na moto).
// ----------------------------------------------------------------------------
class NpcSheet {
    constructor(id) {
        this.id = id; this.name = id; this.atlasName = id; this.isNpc = true;
        this.dirs = 8; this.frame = 64;
        this.clips = {}; this.jobs = {}; this.pending = [];
        this.legacy = null;               // CharacterSheet para o que o atlas não tem (definida pela SpriteLibrary)
        this.legacyVariant = 2;
        this.fallbackAtlas = null;        // outro atlas do mesmo personagem (o jogador: o pronto, enquanto o novo visual é gerado)
        this.extraAtlas = null;           // atlas COMPANHEIRO com o que não coube no principal (o jogador: os clipes táticos)
        this.armsAtlas = null;            // o outro companheiro do jogador: as armas novas (silenciador, RPG, lança-foguetes, minigun)
        this.dmgLvl = 0;                  // folha de dano (NpcArt.dmgSheet): o nível
    }
    uses(id) { return this.atlasName === id || this.fallbackAtlas === id || this.extraAtlas === id || this.armsAtlas === id; }
    _key(name, weapon) { return name + ':' + (weapon || 'none'); }
    getClip(name, weapon = 'none') {
        const w = weapon || 'none', key = this._key(name, w);
        if (key in this.clips) return this.clips[key];
        // (folha de dano cujo atlas saiu da memória por falta de uso: volta do aparelho — enquanto isso, o atlas normal do tipo)
        if (this.dmgLvl && !NpcArt.atlases[this.atlasName] && NpcArt.DMG_CLIPS.test(name)) NpcArt._dmgWant(this.baseId, this.dmgLvl);
        let c = NpcArt.clip(this.atlasName, key) || (this.fallbackAtlas && NpcArt.clip(this.fallbackAtlas, key)) || (this.extraAtlas && NpcArt.clip(this.extraAtlas, key)) || (this.armsAtlas && NpcArt.clip(this.armsAtlas, key));
        if (!c && w !== 'none') {
            const def = CharacterRig.CLIPS[name];
            if (def && !def.weapons) c = NpcArt.clip(this.atlasName, this._key(name, 'none')) || (this.fallbackAtlas && NpcArt.clip(this.fallbackAtlas, this._key(name, 'none')));
        }
        if (!c && w === 'knife') c = this.getClip(name, 'none');            // (faca sem o desenho dela neste atlas: o clipe de mãos livres)
        if (!c && this.legacy && CharacterRig.CLIPS[name]) c = this.legacy.getClip(name, w);      // (clipes novos, como 'holdup', só existem aqui)
        if (!c && CharacterRig.CLIPS[name] && !CharacterRig.CLIPS[name].weapons) c = NpcArt.clip(this.atlasName, 'idle:none');
        this.clips[key] = c || null;
        return this.clips[key];
    }
    // Troca o atlas (o jogador com outra roupa): os clipes são procurados de novo.
    setAtlas(id) { this.atlasName = id; this.clips = {}; }
    _resolve(name, weapon) { const def = CharacterRig.CLIPS[name]; if (!def) return null; let w = weapon || 'none'; if (def.weapons && !def.weapons.includes(w)) return null; return { def, w, key: name + ':' + w }; }
    warm() {} queue() {} pump() { return false; } disposeClips() { this.clips = {}; }
}

if (NpcArt.available()) NpcArt.load();          // manifestos já; as páginas do protagonista decodificam durante a carga da página / menu
