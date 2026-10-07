// ============================================================================
// CarAtlasBuild — rasteriza os carros do gerador (gerador.js) na densidade do jogo e monta o atlas que o jogo lê
// (assets/cars/carros-atlas.js). Roda no navegador (sem Node/Python): o SVG é desenhado pelo próprio navegador num <canvas>.
//
// Duas texturas com o MESMO layout (pré-multiplicadas pelo alfa, para filtrar/mipmap sem franjas):
//   A = (K.r, K.g, K.b, alfa)      K = cor do carro com as tintas em preto
//   B = (M1, M2, limiar, desvio)   M1/M2 = quanto a pintura/pintura 2 entram no pixel (cor = K + M1·P + M2·P2);
//                                  limiar = fase de amassado em que a marca aparece (64/128/192; 255 = nunca);
//                                  desvio = escurece (<128) ou clareia (>128) o pixel quando a marca aparece.
// Mais: a lâmina da porta de cada modelo (mesma codificação) e um bloco escuro sólido (vão da porta aberta).
// ============================================================================

const CarAtlasBuild = {
    PPU: 40,           // px do atlas por metro do jogo (o jogo desenha a 20 px/m: 2× de folga para girar o sprite sem serrilhado)
    SCALE: 1.0,        // metros do jogo por metro do desenho
    PAD: 4,            // espaço entre peças no atlas (mipmaps sem vazar a vizinha)
    WIDTH: 1024,

    async raster(svg, w, h) {
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
    },

    // Uma peça (carro ou porta) codificada: { w, h, A, B } (Uint8 RGBA cada).
    async encodePiece(svgOf, w, h, { fixed, twoTone, dmg }) {
        const black = { paint: '#000000', paint2: '#000000' };
        const jobs = [this.raster(svgOf(black), w, h)];
        jobs.push(fixed ? null : this.raster(svgOf({ paint: '#ffffff', paint2: '#000000' }), w, h));
        jobs.push(fixed || !twoTone ? null : this.raster(svgOf({ paint: '#000000', paint2: '#ffffff' }), w, h));
        jobs.push(dmg ? this.raster(dmg('thr'), w, h) : null, dmg ? this.raster(dmg('shift'), w, h) : null);
        const [c0, c1, c2, thr, sh] = await Promise.all(jobs.map((j) => j || Promise.resolve(null)));
        const n = w * h, A = new Uint8Array(n * 4), B = new Uint8Array(n * 4);
        const pm = (d, i, k) => (d[i + k] * d[i + 3]) / 255;          // canal pré-multiplicado
        for (let p = 0; p < n; p++) {
            const i = p * 4, a = c0[i + 3];
            if (a === 0) { B[i + 2] = 255; B[i + 3] = 128; continue; }
            for (let k = 0; k < 3; k++) A[i + k] = Math.round(pm(c0, i, k));
            A[i + 3] = a;
            const dm = (c) => (c ? Math.max(0, ((pm(c, i, 0) - pm(c0, i, 0)) + (pm(c, i, 1) - pm(c0, i, 1)) + (pm(c, i, 2) - pm(c0, i, 2))) / 3) : 0);
            B[i] = Math.round(Math.min(a, dm(c1)));
            B[i + 1] = Math.round(Math.min(a, dm(c2)));
            // camadas de dano: fora da carroceria (recorte) vêm transparentes → "nunca" / "nada"
            if (thr) { const ta = thr[i + 3] / 255; B[i + 2] = Math.round(thr[i] * ta + 255 * (1 - ta)); } else B[i + 2] = 255;
            if (sh) { const sa = sh[i + 3] / 255, v = sh[i] * sa + 128 * (1 - sa); B[i + 3] = Math.min(255, Math.round(v / 6) * 6 + 2); } else B[i + 3] = 128;      // (degraus de 6: comprime melhor, invisível)
        }
        return { w, h, A, B };
    },

    // Usa tinta 2 em algum lugar? (teto de outra cor, faixas, retrovisor...) — senão nem renderiza a 3ª passada.
    usesP2(c) {
        const s = JSON.stringify(c);
        return /"P2"/.test(s);
    },

    async buildPieces(onProgress) {
        const G = CarGen, f = (this.PPU * this.SCALE) / G.S, out = [];
        let k = 0;
        for (const c of G.CARS) {
            const PADc = c.pad || 10;
            const w = Math.round((c.L + PADc * 2) * f), h = Math.round((c.W + PADc * 2) * f);
            const two = c.custom ? !!c.color2 : this.usesP2(c);
            // (carros: sem as rodas da frente — o jogo as desenha à parte, esterçando; motos, bicicletas e barcos: veiculos.js, sem porta)
            const body = await this.encodePiece((o) => G.svgOf(c, Object.assign({ size: [w, h], tag: '_' + (k++), noFrontTires: true }, o)), w, h,
                { fixed: c.fixed, twoTone: two, dmg: (mode) => G.damageSVG(c, mode, [w, h]) });
            let door = null;
            if (!c.noDoor) {
                const dw = Math.round((c.door_len + 4) * f), dh = Math.max(4, Math.round(15 * f));
                door = await this.encodePiece((o) => G.doorSVG(c, Object.assign({ size: [dw, dh], tag: '_' + (k++) }, o)), dw, dh, { fixed: c.fixed, twoTone: false });
            }
            out.push({ c, body, door, two });
            if (onProgress) onProgress(out.length, G.CARS.length, c.id);
        }
        return out;
    },

    // Empacota em prateleiras (mais altas primeiro) numa largura fixa; altura arredondada para potência de 2.
    pack(rects) {
        const W = this.WIDTH, P = this.PAD;
        const order = rects.slice().sort((a, b) => b.h - a.h || b.w - a.w);
        let x = P, y = P, shelf = 0;
        for (const r of order) {
            if (x + r.w + P > W) { x = P; y += shelf + P; shelf = 0; }
            r.x = x; r.y = y;
            x += r.w + P;
            shelf = Math.max(shelf, r.h);
        }
        let H = 1; while (H < y + shelf + P) H *= 2;
        return { W, H };
    },

    async build(onProgress) {
        const t0 = performance.now();
        const pieces = await this.buildPieces(onProgress);
        const solid = { w: 8, h: 8, A: new Uint8Array(256), B: new Uint8Array(256) };
        for (let i = 0; i < 64; i++) { solid.A.set([11, 12, 15, 255], i * 4); solid.B.set([0, 0, 255, 128], i * 4); }
        const rects = [{ p: solid, w: 8, h: 8, key: 'solid' }];
        for (const pc of pieces) { rects.push({ p: pc.body, w: pc.body.w, h: pc.body.h, key: pc.c.id }); if (pc.door) rects.push({ p: pc.door, w: pc.door.w, h: pc.door.h, key: pc.c.id + ':door' }); }
        const tire = await this.encodePiece(() => CarGen.tireSVG([60, 18]), 60, 18, { fixed: true, twoTone: false });       // pneu da frente (esterça)
        rects.push({ p: tire, w: tire.w, h: tire.h, key: 'tire' });
        const { W, H } = this.pack(rects);
        const A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4);
        for (let i = 0; i < W * H; i++) { B[i * 4 + 2] = 255; B[i * 4 + 3] = 128; }
        for (const r of rects) {
            for (let y = 0; y < r.h; y++) {
                A.set(r.p.A.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * W + r.x) * 4);
                B.set(r.p.B.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * W + r.x) * 4);
            }
        }
        const at = (key) => { const r = rects.find((q) => q.key === key); return [r.x, r.y, r.w, r.h]; };
        const S = CarGen.S, m = (px) => +((px / S) * this.SCALE).toFixed(3);
        const models = {};
        for (const pc of pieces) {
            const c = pc.c;
            if (c.custom) {                                     // moto, bicicleta, barco: sem porta nem pneu avulso; luzes do catálogo (em m)
                models[c.id] = { name: c.nome, cat: c.categoria, kind: c.kind, fixed: !!c.fixed, p2: pc.two, color: c.color, color2: c.color2 || null,
                    r: at(c.id), len: m(c.L), wid: m(c.W), lamps: c.lamps, door: null, siren: null, bed: null };
                continue;
            }
            const by0 = c.body_y0 || 0, hl = c.head || ['band', 9, 3, 24], tl = c.tail || ['band', 7, 3, 22];
            const lampY = (spec, pos) => (spec[0] === 'band' ? by0 + (spec[2] + spec[3]) / 2 : pos[1] + (spec[0] === 'round2' ? pos[2] * 1.1 : 0));
            const head = lampY(hl, c.head_pos || [c.L - 9, 14, 7]), tail = lampY(tl, c.tail_pos || [8, 14, 6]);
            models[c.id] = {
                name: c.nome, cat: c.categoria, fixed: !!c.fixed, p2: pc.two, color: c.color, color2: c.color2 || null,
                r: at(c.id), len: m(c.L), wid: m(c.W),
                lamps: { x: m(c.W / 2 - (head + tail) / 2), zF: m(c.L / 2 - 4), zR: m(-c.L / 2 + 4) },
                door: { r: at(c.id + ':door'), len: m(c.door_len + 4), thick: m(15), hingeZ: m(c.door_hinge - c.L / 2), hingeX: m(c.W / 2 - by0) },
                siren: c.lightbar ? { z: m(c.lightbar[0] - c.L / 2) } : null,
                bed: c.bed ? { z0: m(c.bed.x0 - c.L / 2), z1: m(c.bed.x1 - c.L / 2) } : null,
                // pneu da frente (desenhado à parte, esterçando): centro (z à frente, x para o lado) e tamanho — o mesmo retângulo do carSVG
                tire: (() => { const tr = c.wheel_r, tw = c.tire_out ?? 2.5, fx = Math.max(...c.wheels_x); return { z: m(fx - c.L / 2), x: m(c.W / 2 - by0 - (10 - tw) / 2), len: m(2 * tr), wid: m(10 + tw) }; })(),
            };
        }
        const pngA = await PNGEnc.encode(W, H, A), pngB = await PNGEnc.encode(W, H, B);
        const ms = performance.now() - t0;
        return { W, H, A, B, models, solid: at('solid'), tire: at('tire'), pngA, pngB, ms, pieces };
    },

    // Texto do arquivo assets/cars/carros-atlas.js (PNGs em base64 dentro de um .js: funciona também aberto por duplo clique, file://).
    toJS(res) {
        const meta = { version: 2, ppu: this.PPU, scale: this.SCALE, w: res.W, h: res.H, solid: res.solid, tire: res.tire, models: res.models };
        return '// ============================================================================\n' +
            '// GERADO por tools/carros/index.html (gerador.js) — não edite à mão: mude o gerador e gere de novo.\n' +
            `// ${Object.keys(res.models).length} veículos (carros, motos, bicicletas e barcos) vistos de cima, ${this.PPU} px/m, atlas ${res.W}×${res.H} (A: cor+alfa, B: pinturas+amassados).\n` +
            '// ============================================================================\n' +
            'var CAR_ATLAS = ' + JSON.stringify(meta) + ';\n' +
            `CAR_ATLAS.a = '${PNGEnc.base64(res.pngA)}';\n` +
            `CAR_ATLAS.b = '${PNGEnc.base64(res.pngB)}';\n`;
    },
};

// Codificador PNG RGBA 8 bits com filtro por linha (o melhor dos 5, pela soma dos valores absolutos) + deflate do navegador.
const PNGEnc = {
    _crcT: null,
    crc32(buf, s, e) {
        let T = this._crcT;
        if (!T) { T = this._crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
        let c = 0xffffffff;
        for (let i = s; i < e; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    },
    chunk(type, data) {
        const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
        dv.setUint32(0, data.length);
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
        out.set(data, 8);
        dv.setUint32(8 + data.length, this.crc32(out, 4, 8 + data.length));
        return out;
    },
    async deflate(raw) {
        const cs = new CompressionStream('deflate');
        return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(cs)).arrayBuffer());
    },
    async encode(w, h, rgba) {
        const bpp = 4, stride = w * bpp, rows = new Uint8Array((stride + 1) * h), cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
        for (let y = 0; y < h; y++) {
            const cur = rgba.subarray(y * stride, (y + 1) * stride), up = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
            let best = 0, bestSum = Infinity;
            for (let f = 0; f < 5; f++) {
                const o = cand[f]; let sum = 0;
                for (let x = 0; x < stride; x++) {
                    const a = x >= bpp ? cur[x - bpp] : 0, b = up ? up[x] : 0, c = up && x >= bpp ? up[x - bpp] : 0;
                    let pr;
                    if (f === 0) pr = 0; else if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
                    else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
                    const v = (cur[x] - pr) & 255;
                    o[x] = v; sum += v < 128 ? v : 256 - v;
                }
                if (sum < bestSum) { bestSum = sum; best = f; }
            }
            rows[y * (stride + 1)] = best;
            rows.set(cand[best], y * (stride + 1) + 1);
        }
        const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
        dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
        const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), this.chunk('IHDR', ihdr), this.chunk('IDAT', await this.deflate(rows)), this.chunk('IEND', new Uint8Array(0))];
        let n = 0; for (const p of parts) n += p.length;
        const out = new Uint8Array(n); n = 0; for (const p of parts) { out.set(p, n); n += p.length; }
        return out;
    },
    base64(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    },
};
