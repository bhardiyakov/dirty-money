// ============================================================================
// Pixel — utilitários de pixel art procedural.
// RNG determinístico (a mesma arte a cada reload), ruído TILEÁVEL, rampas de
// cor estilo Donkey Kong Country (sombras frias, luzes quentes) e o
// PixelCanvas: um buffer RGBA que vira textura NEAREST do Babylon.
// ============================================================================

const Pixel = {
    // mulberry32: RNG pequeno, rápido e determinístico.
    rng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    // Hash inteiro 2D -> [0,1). Sem estado: base do ruído tileável.
    // Cor média (gama, 0..1) dos pixels opacos de uma imagem RGBA — amostrando no máximo ~4.000 deles.
    average(d) {
        const n = d.length >> 2, step = Math.max(1, Math.floor(n / 4096));
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < n; i += step) { const o = i << 2, a = d[o + 3] / 255; r += d[o] * a; g += d[o + 1] * a; b += d[o + 2] * a; w += a; }
        return w ? [r / w / 255, g / w / 255, b / w / 255] : [0.5, 0.5, 0.5];
    },

    hash(x, y, seed = 0) {
        let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    },

    // Ruído de valor suave e TILEÁVEL: wx/wy = nº de células até repetir.
    noise(x, y, cell, seed, wx, wy) {
        const fx = x / cell, fy = y / cell;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = fx - ix, ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const mx = (v) => ((v % wx) + wx) % wx;
        const my = (v) => ((v % wy) + wy) % wy;
        const a = this.hash(mx(ix), my(iy), seed);
        const b = this.hash(mx(ix + 1), my(iy), seed);
        const c = this.hash(mx(ix), my(iy + 1), seed);
        const d = this.hash(mx(ix + 1), my(iy + 1), seed);
        return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    },

    // '#rrggbb' -> [r,g,b]
    hex(h) {
        if (typeof h !== 'string') return h;
        const s = h.replace('#', '');
        return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    },

    mix(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    },

    scale(c, k) {
        return [c[0] * k, c[1] * k, c[2] * k];
    },

    clamp(c) {
        return [Math.max(0, Math.min(255, Math.round(c[0]))), Math.max(0, Math.min(255, Math.round(c[1]))), Math.max(0, Math.min(255, Math.round(c[2])))];
    },

    // Rampa de 5 tons no estilo pré-renderizado do DKC:
    //   0 contorno | 1 sombra | 2 base | 3 luz | 4 brilho
    // Sombras esfriam (roxo/azul) e luzes esquentam (amarelo) em vez de só escurecer.
    ramp5(base) {
        const c = Array.isArray(base) ? base : this.hex(base);
        const coolShadow = [48, 36, 104];
        const warmLight = [255, 238, 186];
        return [
            this.clamp(this.mix(this.scale(c, 0.26), [14, 8, 38], 0.55)),
            this.clamp(this.mix(this.scale(c, 0.64), coolShadow, 0.22)),
            this.clamp(c),
            this.clamp(this.mix(this.scale(c, 1.1), warmLight, 0.2)),
            this.clamp(this.mix(this.scale(c, 1.2), [255, 252, 232], 0.55)),
        ];
    },

    // Escolhe um item de uma lista com base em um valor 0..1.
    pick(list, r) {
        return list[Math.min(list.length - 1, Math.floor(r * list.length))];
    },
};

// ----------------------------------------------------------------------------
// PixelCanvas — buffer RGBA w×h. As coordenadas fazem "wrap" (módulo), o que
// facilita desenhar texturas tileáveis sem cuidar das bordas. Linha 0 = topo.
// ----------------------------------------------------------------------------
class PixelCanvas {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.data = new Uint8Array(w * h * 4);
    }

    set(x, y, c, a = 255) {
        x = ((x | 0) % this.w + this.w) % this.w;
        y = ((y | 0) % this.h + this.h) % this.h;
        const i = (y * this.w + x) * 4;
        this.data[i] = c[0];
        this.data[i + 1] = c[1];
        this.data[i + 2] = c[2];
        this.data[i + 3] = a;
    }

    // Igual a set(), mas ignora pixels fora da imagem (sem wrap).
    setClip(x, y, c, a = 255) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        this.set(x, y, c, a);
    }

    get(x, y) {
        x = ((x | 0) % this.w + this.w) % this.w;
        y = ((y | 0) % this.h + this.h) % this.h;
        const i = (y * this.w + x) * 4;
        return [this.data[i], this.data[i + 1], this.data[i + 2]];
    }

    fill(c, a = 255) {
        for (let i = 0; i < this.data.length; i += 4) {
            this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
        }
    }

    rect(x, y, w, h, c, a = 255) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
    }

    // Retângulo com bisel: luz no topo/esquerda, sombra embaixo/direita.
    bevel(x, y, w, h, base, hi, lo) {
        this.rect(x, y, w, h, base);
        for (let i = 0; i < w; i++) { this.set(x + i, y, hi); this.set(x + i, y + h - 1, lo); }
        for (let j = 0; j < h; j++) { this.set(x, y + j, hi); this.set(x + w - 1, y + j, lo); }
    }

    hline(x, y, len, c) { for (let i = 0; i < len; i++) this.set(x + i, y, c); }
    vline(x, y, len, c) { for (let j = 0; j < len; j++) this.set(x, y + j, c); }

    // Disco preenchido (pixel art: sem antialias).
    disc(cx, cy, r, c) {
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
            if (i * i + j * j <= r * r + r * 0.5) this.set(cx + i, cy + j, c);
        }
    }

    // Preenche com tons de uma paleta usando ruído (manchas) + grão por pixel.
    noiseFill(palette, seed, cell = 6, grain = 0.5) {
        const wx = Math.max(1, Math.round(this.w / cell));
        const wy = Math.max(1, Math.round(this.h / cell));
        for (let y = 0; y < this.h; y++) {
            for (let x = 0; x < this.w; x++) {
                const n = Pixel.noise(x, y, this.w / wx, seed, wx, wy);
                const g = Pixel.hash(x, y, seed + 17);
                const v = n * (1 - grain) + g * grain;
                this.set(x, y, Pixel.pick(palette, v));
            }
        }
    }

    // Copia outro PixelCanvas (com transparência binária) para (dx, dy).
    blit(src, dx, dy) {
        for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
            const i = (y * src.w + x) * 4;
            if (src.data[i + 3] > 0) this.setClip(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2]], src.data[i + 3]);
        }
    }

    // Vira textura do Babylon (pixels nítidos). `mips` evita cintilar ao longe. Ladrilho (repete, com mipmaps: chão, telhados) com o
    // gráfico suave ligado (Smooth): filtro trilinear em vez dos pixels duros — e troca na hora quando o jogador muda o ajuste.
    toTexture(scene, { wrap = true, mips = true, aniso = 1 } = {}) {
        const tile = wrap && mips, smooth = tile && typeof Smooth !== 'undefined' && Smooth.on;
        const sampling = smooth ? BABYLON.Texture.TRILINEAR_SAMPLINGMODE : mips ? BABYLON.Texture.NEAREST_NEAREST_MIPNEAREST : BABYLON.Texture.NEAREST_SAMPLINGMODE;
        const tex = BABYLON.RawTexture.CreateRGBATexture(this.data, this.w, this.h, scene, mips, false, sampling);
        const mode = wrap ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE;
        tex.wrapU = mode;
        tex.wrapV = mode;
        tex.anisotropicFilteringLevel = smooth ? Math.max(4, aniso) : aniso;
        if (tile) { tex._dmTile = true; tex._dmAniso = aniso; }
        tex._dmAvg = Pixel.average(this.data);           // (a cor sólida da superfície no visual de maquete: render/Diorama.js)
        return tex;
    }
}
