// ============================================================================
// SpriteIO — arte em ARQUIVO (PNG) no lugar da arte procedural, folha por folha.
//
// O jogo nasceu desenhando tudo por código (SpriteBaker/PixelCanvas). Este módulo deixa trocar qualquer folha por um PNG pronto, sem
// mexer no resto: quando `assets/sprites/manifest.json` lista a folha, ela é lida do arquivo; quando não lista (ou o arquivo não
// existe / o jogo foi aberto por duplo clique em file://), ela continua sendo desenhada por código, como antes.
//
// FORMATO (o exportador gera exatamente isto — ver SpriteExport.js e docs/sprites-png.md):
//   • PNG INDEXADO de 8 bits (paleta de 256). O ÍNDICE do pixel é o que importa: índice = rampa × 5 + nível (rampa = parte do
//     desenho: pele, camisa, pintura, vidro…; nível 0..4 = contorno, sombra, base, luz, brilho). 254 = transparente, 255 = sombra
//     projetada (o jogo pinta translúcida). As CORES da paleta embutida são só uma referência (a variante usada na exportação): quem
//     pinta é a paleta do jogo (pal/*.png), uma linha por variante — é assim que um único desenho vira dezenas de pedestres.
//   • Personagem: um PNG por clipe, colunas = direções (0 = norte, sentido horário), linhas = quadros da animação.
//   • Paletas (pal/*.png): RGB comum, largura = rampas × 5, uma linha por variante.
//   (Carros não passam por aqui: vêm do atlas vetorial pronto — CarArt, assets/cars/carros-atlas.js — que usa só o PNG abaixo.)
//
// Uso no código: SpriteIO.indices(key, W, H) → Uint8Array (W×H índices) ou null;  SpriteIO.rgba(key) → { w, h, data } ou null.
// Os PNGs ficam comprimidos na memória (poucos MB) e são decodificados na hora em que a folha é pedida (~1–5 ms, bem menos que
// desenhar por código).
// ============================================================================

const SpriteIO = {
    BASE: './assets/sprites/',
    TRANSPARENT: 254,
    SHADOW: 255,
    manifest: null,            // { version, entries: { key: { file, w, h, kind } } }
    _bytes: new Map(),         // key → Uint8Array (PNG comprimido), quando já baixado
    _wait: new Map(),          // key → Promise do download em andamento
    ready: Promise.resolve(),  // resolve quando o que a CARGA do jogo usa foi baixado (ver tier)
    all: Promise.resolve(),    // ...e quando todo o manifesto foi baixado
    used: new Set(),           // chaves lidas de arquivo nesta sessão (painel dev)

    // Prioridade de download de cada arquivo: 0 = antes do menu (paletas e o 1º segundo de jogo: `eager`), 1 = o que a carga do jogo
    // monta (personagens do dia a dia), 2 = sob demanda (mochilas, SWAT/exército) — baixado em segundo plano sem segurar nada; se
    // for pedido antes de chegar, é desenhado por código daquela vez.
    tier(key, eager) {
        if (eager(key)) return 0;
        if (/^char\/(player_|swat\/|army\/)/.test(key)) return 2;
        return 1;
    },

    // Lê o manifesto e baixa os arquivos por prioridade (acima). Sem manifesto (ou em file://), tudo segue procedural.
    async init(eager = () => false) {
        if (typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return;
        let man = null;
        try {
            const r = await fetch(this.BASE + 'manifest.json', { cache: 'no-cache' });
            if (r.ok) man = await r.json();
        } catch (e) { /* sem manifesto: procedural */ }
        if (!man || !man.entries || !Object.keys(man.entries).length) return;
        this.manifest = man;
        const keys = Object.keys(man.entries), T = [[], [], []];
        for (const k of keys) T[this.tier(k, eager)].push(k);
        const pool = async (list, n) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) await this._fetch(list[i++]); })); };
        await pool(T[0], 8);
        this.ready = pool(T[1], 6);
        this.all = this.ready.then(() => pool(T[2], 3));
        console.log(`[SPRITES] manifesto: ${keys.length} arquivos (${T[0].length} já, ${T[1].length} para a carga, ${T[2].length} sob demanda)`);
    },

    has(key) { return !!(this.manifest && this.manifest.entries[key]); },

    _fetch(key) {
        if (this._bytes.has(key)) return Promise.resolve();
        if (this._wait.has(key)) return this._wait.get(key);
        const e = this.manifest.entries[key];
        const p = fetch(this.BASE + e.file).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { if (b) this._bytes.set(key, new Uint8Array(b)); })
            .catch(() => {}).finally(() => this._wait.delete(key));
        this._wait.set(key, p);
        return p;
    },

    // Índices (W×H, 254 = transparente, 255 = sombra) da folha `key`, se ela está no manifesto, já foi baixada e tem o tamanho
    // esperado; senão null (quem chama desenha por código). Tamanho errado = aviso no console (o desenho não bate com o layout).
    indices(key, W, H) {
        const b = this._bytes.get(key);
        if (!b) return null;
        try {
            const img = PNG.decode(b);
            if (img.w !== W || img.h !== H) { console.warn(`[SPRITES] ${key}: ${img.w}×${img.h}, esperado ${W}×${H} — usando o desenho por código`); return null; }
            this.used.add(key);
            // Folhas que o jogo nunca descarta (personagens do dia a dia): o PNG comprimido não será lido de novo — solta a memória.
            if (/^char\/(player|civA|civB|police|rider|courier)\//.test(key)) this._bytes.delete(key);
            return PNG.toIndices(img);
        } catch (e) {
            console.warn(`[SPRITES] ${key}: PNG inválido (${e.message}) — usando o desenho por código`);
            return null;
        }
    },

    // Imagem RGBA (paletas). null se não houver arquivo.
    rgba(key) {
        const b = this._bytes.get(key);
        if (!b) return null;
        try { const img = PNG.decode(b); this.used.add(key); return { w: img.w, h: img.h, data: PNG.toRGBA(img) }; }
        catch (e) { console.warn(`[SPRITES] ${key}: PNG inválido (${e.message})`); return null; }
    },

    // Paleta editada em arquivo: as linhas do PNG `key` (mesma largura) substituem as geradas por código em `data` (RGBA W×H). Linhas a
    // mais no arquivo são ignoradas; a menos, ficam as do código. Devolve quantas linhas vieram do arquivo.
    paletteOverlay(key, data, W, H) {
        const img = this.rgba(key);
        if (!img) return 0;
        if (img.w !== W) { console.warn(`[SPRITES] ${key}: largura ${img.w}, esperado ${W} — paleta do código mantida`); return 0; }
        const rows = Math.min(H, img.h);
        data.set(img.data.subarray(0, rows * W * 4), 0);
        return rows;
    },

    // Índices de PNG a partir da saída do SpriteBaker (RGBA: R = rampa, G = nível, A = cobertura; R > 250 = sombra).
    fromBaker(data, n) {
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            if (data[i * 4 + 3] < 128) { out[i] = 254; continue; }
            const r = data[i * 4];
            out[i] = r > 250 ? 255 : r * 5 + data[i * 4 + 1];
        }
        return out;
    },
};

// ============================================================================
// PNG — codificador/decodificador mínimo (só o necessário aqui): leitura de PNG 8 bits (indexado 1/2/4/8 bits, cinza, cinza+alfa,
// RGB, RGBA; sem entrelaçamento) com inflate SÍNCRONO em JS (o decodificador do navegador converteria para RGBA e perderia os
// índices); escrita de PNG indexado e RGBA (compressão pelo CompressionStream do navegador — só o exportador usa).
// ============================================================================

const PNG = {
    _crcT: null,
    crc32(buf, start = 0, end = buf.length) {
        let T = this._crcT;
        if (!T) { T = this._crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
        let c = 0xffffffff;
        for (let i = start; i < end; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    },

    // ------------------------------------------------------------------ leitura
    decode(b) {
        const info = this._parse(b);
        return this._unfilter(info, Inflate.zlib(info.z, (info.stride + 1) * info.h));
    },

    // O mesmo, com a descompressão NATIVA do navegador (DecompressionStream: ~10× mais rápida que o Inflate em JS para imagens
    // grandes — o atlas dos carros). Sem suporte (navegadores antigos), cai no Inflate síncrono.
    async decodeAsync(b) {
        const info = this._parse(b);
        if (typeof DecompressionStream !== 'function') return this.decode(b);
        const raw = new Uint8Array(await new Response(new Blob([info.z]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
        return this._unfilter(info, raw);
    },

    // ------------------------------------------------------------------ pixels de 2 bytes (atlas paginados dos personagens 2,5D: NpcArt)
    // PNG.decodeRG(base64 | bytes) → Promise<{ w, h, data }> com data = RG intercalado (w × h × 2). Aceita o PNG "planar" (cinza 8 bits,
    // w × 2h: em cima o 1º byte de cada pixel, embaixo o 2º — comprime melhor) e o cinza+alfa antigo (já intercalado). Tudo FORA da
    // thread principal: Worker de um Blob (funciona em file://) com base64 → inflate nativo (DecompressionStream) → filtros → intercala.
    // Sem Worker / sem DecompressionStream (ou o Worker falhou): o mesmo aqui, com o decodificador acima.
    RG_WORKERS: 2,
    _rgW: null, _rgJobs: new Map(), _rgSeq: 0, _rgOff: false,
    decodeRG(src) {
        const ws = this._rgOff ? null : this._rgPool();
        if (!ws) return this._rgMain(src);
        return new Promise((ok, fail) => {
            const job = ++this._rgSeq, w = ws.reduce((a, b) => (b._n < a._n ? b : a));
            w._n++;
            this._rgJobs.set(job, { ok, fail, src, w });
            w.postMessage({ job, src });
        });
    },
    _rgPool() {
        if (this._rgW) return this._rgW.length ? this._rgW : null;
        this._rgW = [];
        if (typeof Worker !== 'function' || typeof DecompressionStream !== 'function' || typeof Blob !== 'function' || typeof URL === 'undefined') return null;
        try {
            const url = URL.createObjectURL(new Blob(['(' + this._rgWorkerMain + ')();'], { type: 'text/javascript' }));
            for (let i = 0; i < this.RG_WORKERS; i++) {
                const w = new Worker(url);
                w._n = 0;
                w.onmessage = (e) => this._rgDone(w, e.data);
                w.onerror = (e) => { e.preventDefault(); this._rgBroken(w, e.message || 'erro no Worker'); };
                this._rgW.push(w);
            }
        } catch (e) { this._rgW = []; return null; }
        return this._rgW;
    },
    _rgDone(w, m) {
        const J = this._rgJobs.get(m.job);
        if (!J) return;
        this._rgJobs.delete(m.job); w._n--;
        if (!m.error) { J.ok({ w: m.w, h: m.h, data: m.data }); return; }
        // falhou no Worker: tenta aqui (se aqui der certo, o problema era o Worker — os próximos já vêm direto para cá)
        this._rgMain(J.src).then((img) => { if (!this._rgOff) console.warn('[PNG] Worker de decodificação falhou (' + m.error + ') — decodificando na thread principal'); this._rgOff = true; J.ok(img); }, J.fail);
    },
    _rgBroken(w, msg) {
        for (const [job, J] of this._rgJobs) if (J.w === w) this._rgDone(w, { job, error: msg });
    },
    async _rgMain(src) {
        const b = typeof src === 'string' ? this.b64(src) : src, img = await this.decodeAsync(b);
        if (img.type === 4 && img.ch === 2) return { w: img.w, h: img.h, data: img.data };
        if (img.type !== 0 || img.ch !== 1 || img.h & 1) throw new Error('PNG de atlas com formato inesperado');
        const H = img.h >> 1, B = img.w * H, px = img.data, out = new Uint8Array(B * 2);
        for (let i = 0; i < B; i++) { out[i * 2] = px[i]; out[i * 2 + 1] = px[B + i]; }
        return { w: img.w, h: H, data: out };
    },
    b64(s) {
        if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(s);
        const t = atob(s), u = new Uint8Array(t.length);
        for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
        return u;
    },
    // Código do Worker (vai como texto: não enxerga nada da página).
    _rgWorkerMain: function () {
        const b64 = (s) => { if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(s); const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
        self.onmessage = async (e) => {
            const m = e.data;
            try {
                const b = typeof m.src === 'string' ? b64(m.src) : m.src, dv = new DataView(b.buffer, b.byteOffset, b.byteLength), idat = [];
                let p = 8, w = 0, h = 0, type = -1;
                while (p + 8 <= b.length) {
                    const len = dv.getUint32(p), t = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
                    if (t === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); type = b[p + 17]; if (b[p + 16] !== 8 || b[p + 20]) throw new Error('PNG de 8 bits sem entrelaçamento'); }
                    else if (t === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
                    else if (t === 'IEND') break;
                    p += 12 + len;
                }
                if (type !== 0 && type !== 4) throw new Error('tipo de cor ' + type);
                const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
                const bpp = type === 4 ? 2 : 1, S = w * bpp, px = new Uint8Array(S * h);
                if (raw.length < (S + 1) * h) throw new Error('PNG truncado');
                for (let y = 0; y < h; y++) {                                  // filtros de linha (nenhum/sub/up/média/Paeth)
                    const f = raw[y * (S + 1)], s = y * (S + 1) + 1, o = y * S, u = o - S;
                    px.set(raw.subarray(s, s + S), o);
                    if (f === 1) { for (let x = bpp; x < S; x++) px[o + x] += px[o + x - bpp]; }
                    else if (f === 2) { if (y) for (let x = 0; x < S; x++) px[o + x] += px[u + x]; }
                    else if (f === 3) { for (let x = 0; x < S; x++) px[o + x] += ((x >= bpp ? px[o + x - bpp] : 0) + (y ? px[u + x] : 0)) >> 1; }
                    else if (f === 4) {
                        for (let x = 0; x < S; x++) {
                            const a = x >= bpp ? px[o + x - bpp] : 0, bb = y ? px[u + x] : 0, c = y && x >= bpp ? px[u + x - bpp] : 0;
                            const q = a + bb - c, pa = q > a ? q - a : a - q, pb = q > bb ? q - bb : bb - q, pc = q > c ? q - c : c - q;
                            px[o + x] += pa <= pb && pa <= pc ? a : (pb <= pc ? bb : c);
                        }
                    }
                }
                let out = px, H = h;
                if (type === 0) {                                              // planar → RG intercalado
                    if (h & 1) throw new Error('PNG planar de altura ímpar');
                    H = h >> 1; const B = w * H; out = new Uint8Array(B * 2);
                    for (let i = 0; i < B; i++) { out[i * 2] = px[i]; out[i * 2 + 1] = px[B + i]; }
                }
                self.postMessage({ job: m.job, w, h: H, data: out }, [out.buffer]);
            } catch (err) { self.postMessage({ job: m.job, error: String((err && err.message) || err) }); }
        };
    },

    // Cabeçalho e dados comprimidos (IDATs concatenados) de um PNG.
    _parse(b) {
        const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
        for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) throw new Error('não é PNG');
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        let p = 8, w = 0, h = 0, depth = 8, type = 0, plte = null, trns = null;
        const idat = [];
        while (p < b.length) {
            const len = dv.getUint32(p), t = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]), d = p + 8;
            if (t === 'IHDR') {
                w = dv.getUint32(d); h = dv.getUint32(d + 4); depth = b[d + 8]; type = b[d + 9];
                if (b[d + 12] !== 0) throw new Error('entrelaçado não suportado');
            } else if (t === 'PLTE') plte = b.subarray(d, d + len);
            else if (t === 'tRNS') trns = b.subarray(d, d + len);
            else if (t === 'IDAT') idat.push(b.subarray(d, d + len));
            else if (t === 'IEND') break;
            p = d + len + 4;
        }
        if (depth !== 8 && !(type === 3 && (depth === 1 || depth === 2 || depth === 4))) throw new Error(`profundidade ${depth} não suportada`);
        let n = 0; for (const c of idat) n += c.length;
        const z = new Uint8Array(n); n = 0; for (const c of idat) { z.set(c, n); n += c.length; }
        const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
        if (!ch) throw new Error(`tipo de cor ${type} não suportado`);
        return { w, h, depth, type, ch, plte, trns, z, bpp: Math.max(1, (ch * depth) >> 3), stride: (w * ch * depth + 7) >> 3 };
    },

    // Desfaz os filtros de linha (sub/up/média/Paeth) dos dados descomprimidos.
    _unfilter(info, raw) {
        const { w, h, depth, type, ch, plte, trns, bpp, stride } = info;
        const px = new Uint8Array(stride * h);
        for (let y = 0; y < h; y++) {                                       // um laço apertado por tipo de filtro (sem desvio por byte)
            const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride, up = dst - stride, top = y > 0;
            px.set(raw.subarray(src, src + stride), dst);
            if (f === 1) { for (let x = bpp; x < stride; x++) px[dst + x] += px[dst + x - bpp]; }
            else if (f === 2) { if (top) for (let x = 0; x < stride; x++) px[dst + x] += px[up + x]; }
            else if (f === 3) {
                for (let x = 0; x < stride; x++) px[dst + x] += ((x >= bpp ? px[dst + x - bpp] : 0) + (top ? px[up + x] : 0)) >> 1;
            } else if (f === 4) {
                for (let x = 0; x < stride; x++) {
                    const a = x >= bpp ? px[dst + x - bpp] : 0, b = top ? px[up + x] : 0, c = top && x >= bpp ? px[up + x - bpp] : 0;
                    const q = a + b - c, pa = q > a ? q - a : a - q, pb = q > b ? q - b : b - q, pc = q > c ? q - c : c - q;
                    px[dst + x] += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
                }
            }
        }
        // índices de 1/2/4 bits → 1 byte por pixel
        let data = px, outCh = ch;
        if (type === 3 && depth < 8) {
            data = new Uint8Array(w * h);
            const per = 8 / depth, mask = (1 << depth) - 1;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const byte = px[y * stride + Math.floor(x / per)], sh = 8 - depth * (x % per + 1);
                data[y * w + x] = (byte >> sh) & mask;
            }
            outCh = 1;
        }
        return { w, h, type, ch: outCh, data, plte, trns };
    },

    // Índices de paleta (254 = transparente). Indexado: o próprio índice (cor com alfa 0 no tRNS = transparente; a sombra, 255, é
    // translúcida e continua sendo sombra). Cinza: o valor do cinza é o índice (alfa do canal, se houver). RGB/RGBA não têm índice: erro.
    toIndices(img) {
        const n = img.w * img.h, out = new Uint8Array(n), d = img.data;
        if (img.type === 3) {
            const alpha = new Uint8Array(256).fill(255);
            if (img.trns) alpha.set(img.trns.subarray(0, 256));
            for (let i = 0; i < n; i++) { const v = d[i]; out[i] = alpha[v] === 0 ? 254 : v; }
        } else if (img.type === 0) { for (let i = 0; i < n; i++) out[i] = d[i]; }
        else if (img.type === 4) { for (let i = 0; i < n; i++) out[i] = d[i * 2 + 1] < 128 ? 254 : d[i * 2]; }
        else throw new Error('PNG colorido (RGB/RGBA) não tem índices: salve como INDEXADO');
        return out;
    },

    toRGBA(img) {
        const n = img.w * img.h, out = new Uint8Array(n * 4), d = img.data;
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            if (img.type === 6) { out[o] = d[o]; out[o + 1] = d[o + 1]; out[o + 2] = d[o + 2]; out[o + 3] = d[o + 3]; }
            else if (img.type === 2) { out[o] = d[i * 3]; out[o + 1] = d[i * 3 + 1]; out[o + 2] = d[i * 3 + 2]; out[o + 3] = 255; }
            else if (img.type === 3) { const v = d[i]; out[o] = img.plte[v * 3]; out[o + 1] = img.plte[v * 3 + 1]; out[o + 2] = img.plte[v * 3 + 2]; out[o + 3] = img.trns && v < img.trns.length ? img.trns[v] : 255; }
            else { const v = img.type === 4 ? d[i * 2] : d[i]; out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = img.type === 4 ? d[i * 2 + 1] : 255; }
        }
        return out;
    },

    // ------------------------------------------------------------------ escrita (exportador)
    async _deflate(raw) {
        const cs = new CompressionStream('deflate');
        const out = new Response(new Blob([raw]).stream().pipeThrough(cs));
        return new Uint8Array(await out.arrayBuffer());
    },

    _chunk(type, data) {
        const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
        dv.setUint32(0, data.length);
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
        out.set(data, 8);
        dv.setUint32(8 + data.length, this.crc32(out, 4, 8 + data.length));
        return out;
    },

    async _png(w, h, type, rows, extra = []) {
        const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
        dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = type;
        const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), this._chunk('IHDR', ihdr), ...extra, this._chunk('IDAT', await this._deflate(rows)), this._chunk('IEND', new Uint8Array(0))];
        let n = 0; for (const q of parts) n += q.length;
        const out = new Uint8Array(n); n = 0; for (const q of parts) { out.set(q, n); n += q.length; }
        return out;
    },

    // PNG indexado de 8 bits. idx: W×H índices; plte: 256×3 cores (referência visual); alpha: 256 valores de alfa (tRNS).
    async encodeIndexed(w, h, idx, plte, alpha) {
        const rows = new Uint8Array((w + 1) * h);
        for (let y = 0; y < h; y++) rows.set(idx.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);       // filtro 0 (nenhum) em cada linha
        return this._png(w, h, 3, rows, [this._chunk('PLTE', plte), this._chunk('tRNS', alpha)]);
    },

    async encodeRGBA(w, h, rgba) {
        const rows = new Uint8Array((w * 4 + 1) * h);
        for (let y = 0; y < h; y++) rows.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
        return this._png(w, h, 6, rows);
    },
};

// ============================================================================
// Inflate — descompressão DEFLATE (RFC 1951) síncrona, com envelope zlib (RFC 1950). Blocos armazenados, Huffman fixo e dinâmico.
// ============================================================================

const Inflate = {
    _LBASE: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258],
    _LEXT: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0],
    _DBASE: [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577],
    _DEXT: [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13],
    _ORDER: [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],

    // Tabela de Huffman canônica: { count[16], sym[] } a partir dos comprimentos.
    _table(lens, n) {
        const count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(n);
        for (let i = 0; i < n; i++) count[lens[i]]++;
        count[0] = 0;
        for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
        for (let i = 0; i < n; i++) if (lens[i]) sym[offs[lens[i]]++] = i;
        return { count, sym };
    },

    zlib(src, sizeHint = 0) {
        if ((src[0] & 0x0f) !== 8) throw new Error('zlib: método desconhecido');
        return this.raw(src, 2, sizeHint);
    },

    raw(src, start = 0, sizeHint = 0) {
        let out = new Uint8Array(Math.max(1024, sizeHint)), op = 0;
        let pos = start, bit = 0, buf = 0;
        const need = (n) => { while (bit < n) { if (pos >= src.length) throw new Error('inflate: fim inesperado'); buf |= src[pos++] << bit; bit += 8; } };
        const bits = (n) => { if (!n) return 0; need(n); const v = buf & ((1 << n) - 1); buf >>>= n; bit -= n; return v; };
        const grow = (n) => { if (op + n <= out.length) return; let m = out.length * 2; while (m < op + n) m *= 2; const o = new Uint8Array(m); o.set(out.subarray(0, op)); out = o; };
        const decode = (t) => {
            let code = 0, first = 0, index = 0;
            for (let len = 1; len < 16; len++) {
                code |= bits(1);
                const c = t.count[len];
                if (code - c < first) return t.sym[index + (code - first)];
                index += c; first += c; first <<= 1; code <<= 1;
            }
            throw new Error('inflate: código inválido');
        };
        let fixedL = null, fixedD = null;
        let last = 0;
        while (!last) {
            last = bits(1);
            const type = bits(2);
            if (type === 0) {                                                  // armazenado
                buf = 0; bit = 0;
                const len = src[pos] | (src[pos + 1] << 8); pos += 4;
                grow(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
                continue;
            }
            let lt, dt;
            if (type === 1) {
                if (!fixedL) {
                    const l = new Uint8Array(288);
                    for (let i = 0; i < 144; i++) l[i] = 8; for (let i = 144; i < 256; i++) l[i] = 9; for (let i = 256; i < 280; i++) l[i] = 7; for (let i = 280; i < 288; i++) l[i] = 8;
                    fixedL = this._table(l, 288);
                    fixedD = this._table(new Uint8Array(30).fill(5), 30);
                }
                lt = fixedL; dt = fixedD;
            } else if (type === 2) {
                const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
                const cl = new Uint8Array(19);
                for (let i = 0; i < hclen; i++) cl[this._ORDER[i]] = bits(3);
                const ct = this._table(cl, 19), lens = new Uint8Array(hlit + hdist);
                for (let i = 0; i < hlit + hdist;) {
                    const s = decode(ct);
                    if (s < 16) lens[i++] = s;
                    else if (s === 16) { const prev = lens[i - 1]; for (let r = 3 + bits(2); r > 0; r--) lens[i++] = prev; }
                    else if (s === 17) { for (let r = 3 + bits(3); r > 0; r--) lens[i++] = 0; }
                    else { for (let r = 11 + bits(7); r > 0; r--) lens[i++] = 0; }
                }
                lt = this._table(lens.subarray(0, hlit), hlit);
                dt = this._table(lens.subarray(hlit), hdist);
            } else throw new Error('inflate: bloco inválido');
            for (;;) {
                const s = decode(lt);
                if (s < 256) { grow(1); out[op++] = s; continue; }
                if (s === 256) break;
                const li = s - 257, len = this._LBASE[li] + bits(this._LEXT[li]);
                const di = decode(dt), dist = this._DBASE[di] + bits(this._DEXT[di]);
                grow(len);
                for (let k = 0; k < len; k++, op++) out[op] = out[op - dist];
            }
        }
        return out.subarray(0, op);
    },
};
