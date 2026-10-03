// ============================================================================
// HideSprites — o TOPO (visto de cima) dos esconderijos, em pixel art: caçamba de lixo, caixotes e latão.
// Um atlas pequeno com material iluminado (recebe sol/sombra como o resto do mundo). O volume (laterais) é
// desenhado pelo WorldBuilder com caixas de cor sólida; aqui é só a tampa/topo com o detalhe.
// ============================================================================

const HideSprites = {
    SIZE: { dumpster: [52, 26], crate_big: [32, 32], crate: [24, 24], barrel: [22, 22] },
    POS: { dumpster: [0, 0], crate_big: [56, 0], crate: [92, 0], barrel: [0, 32] },
    W: 128, H: 64,

    _draw(p, kind, ox, oy) {
        const hex = Pixel.hex;
        const R = (x, y, w, h, c) => p.rect(ox + x, oy + y, w, h, hex(c));
        const B = (x, y, w, h, c) => { const b = hex(c); p.bevel(ox + x, oy + y, w, h, b, Pixel.clamp(Pixel.mix(b, [255, 255, 255], 0.3)), Pixel.clamp(Pixel.mix(b, [0, 0, 20], 0.4))); };
        const S = (x, y, c) => p.set(ox + x, oy + y, hex(c));
        const rng = Pixel.rng(kind.length * 977);
        if (kind === 'dumpster') {
            R(0, 0, 52, 26, '#24472f');
            B(1, 1, 24, 24, '#3d7a50'); B(26, 1, 25, 24, '#3d7a50');
            for (const x of [1, 26]) for (let k = 0; k < 3; k++) R(x + 3, 5 + k * 6, 18, 1, '#58a06e');
            R(23, 9, 6, 8, '#1c2820'); R(24, 10, 4, 1, '#6b7a70');                  // puxador
            R(0, 22, 3, 4, '#111318'); R(49, 22, 3, 4, '#111318'); R(0, 0, 3, 3, '#111318'); R(49, 0, 3, 3, '#111318');   // rodinhas
            for (let i = 0; i < 14; i++) S(2 + Math.floor(rng() * 48), 2 + Math.floor(rng() * 22), '#8a5a2e');            // ferrugem
            R(10, 12, 5, 2, '#d8d2c0'); R(34, 6, 4, 3, '#c85a3c');                    // lixo aparecendo pela fresta
        } else if (kind === 'crate_big' || kind === 'crate') {
            const n = kind === 'crate_big' ? 32 : 24;
            R(0, 0, n, n, '#7a4f26'); B(0, 0, n, n, '#a8743c'); B(3, 3, n - 6, n - 6, '#b98448');
            for (let y = 6; y < n - 4; y += 5) R(4, y, n - 8, 1, '#7d5226');
            for (let i = 4; i < n - 4; i++) { S(i, i, '#8a5a2a'); S(i, n - 1 - i, '#8a5a2a'); S(i + 1, i, '#8a5a2a'); }
            for (const [x, y] of [[1, 1], [n - 2, 1], [1, n - 2], [n - 2, n - 2]]) S(x, y, '#d0d4da');
        } else {                                                                      // barrel (latão)
            p.disc(ox + 11, oy + 11, 10, hex('#3c434d')); p.disc(ox + 11, oy + 11, 9, hex('#6a7380'));
            p.disc(ox + 11, oy + 11, 7, hex('#4f5762')); p.disc(ox + 11, oy + 11, 6, hex('#5c6570'));
            R(8, 10, 6, 2, '#2e343c'); S(6, 6, '#9aa4b2'); S(7, 5, '#9aa4b2'); S(8, 5, '#9aa4b2');
            for (let a = 0; a < 6.28; a += 0.5) S(11 + Math.round(Math.cos(a) * 9), 11 + Math.round(Math.sin(a) * 9), '#8892a0');
        }
    },

    create(scene) {
        const p = new PixelCanvas(this.W, this.H);
        this.rects = {};
        for (const k of Object.keys(this.SIZE)) {
            const [w, h] = this.SIZE[k], [x, y] = this.POS[k];
            this._draw(p, k, x, y);
            this.rects[k] = [x / this.W, y / this.H, (x + w) / this.W, (y + h) / this.H];       // v = 0 é o topo da imagem
        }
        const tex = p.toTexture(scene, { wrap: false, mips: false });
        tex.hasAlpha = true;
        const m = new BABYLON.StandardMaterial('hideAtlas', scene);
        m.diffuseTexture = tex;
        m.specularColor = BABYLON.Color3.Black();
        m.useAlphaFromDiffuseTexture = true;
        m.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
        m.alphaCutOff = 0.5;
        this.material = m;
        return m;
    },
};
