// ============================================================================
// HeliSheet — o helicóptero da polícia como sprite pré-renderizado visto de cima.
//
// O CORPO é assado em 16 direções pelo mesmo baker dos carros (paleta de pinturas do CarSheet:
// a linha 6 é a "viatura": azul-marinho com detalhes brancos). O ROTOR PRINCIPAL é outra
// textura (pás + disco translúcido) num quad que gira por cima, em passos discretos — assim ele
// gira rápido sem multiplicar os frames do corpo. Interface igual à do CarSheet (SpriteActor).
// ============================================================================

class HeliSheet {
    // Modelo olhando para +Z (nariz), em unidades de mundo. Compacto: cabe no frame de 128px girando.
    static get SCALE() { return 2.2; }                     // o modelo base é compacto; este fator o leva ao tamanho de um helicóptero policial de verdade (~12 u de comprimento, rotor de ~11 u)
    static model() {
        const B = SpriteBaker, S = CarSheet.SLOT, P = [];
        // Fuselagem (bolha) com faixa branca e vidro do cockpit na frente.
        P.push(B.ellipsoid(S.paint, [0, 1.0, 0.3], [0.62, 0.55, 1.08], 0));
        P.push(B.ellipsoid(S.paint2, [0, 1.42, 0.05], [0.2, 0.2, 0.75], 0));
        P.push(B.ellipsoid(S.glass, [0, 1.12, 0.95], [0.5, 0.4, 0.5], 0));
        // Cabine de motor (corcunda) e o mastro do rotor.
        P.push(B.ellipsoid(S.dark, [0, 1.68, -0.15], [0.34, 0.24, 0.45], 0));
        P.push(B.sphere(S.chrome, [0, 1.98, 0.0], 0.13));
        // Cauda: viga, estabilizador vertical e o rotor de cauda.
        P.push(B.capsule(S.paint, [0, 1.12, -0.7], [0, 1.28, -2.45], 0.17));
        P.push(B.box(S.paint2, [0, 1.62, -2.35], [0.05, 0.34, 0.3], 0, 0.02));
        P.push(B.box(S.paint, [0, 1.35, -2.0], [0.55, 0.05, 0.2], 0, 0.02));          // estabilizador horizontal
        P.push(B.box(S.dark, [0.17, 1.62, -2.5], [0.03, 0.34, 0.04], 0, 0.01));        // rotor de cauda (pá em pé)
        // Esquis de pouso: dois tubos e as travessas.
        for (const sx of [-1, 1]) {
            P.push(B.capsule(S.dark, [sx * 0.56, 0.2, -0.75], [sx * 0.56, 0.2, 1.05], 0.065));
            P.push(B.capsule(S.dark, [sx * 0.5, 0.25, 0.55], [sx * 0.3, 0.7, 0.45], 0.045));
            P.push(B.capsule(S.dark, [sx * 0.5, 0.25, -0.35], [sx * 0.3, 0.7, -0.3], 0.045));
        }
        // Farol de busca embaixo do nariz (aparece como ponto claro à frente).
        P.push(B.sphere(S.head, [0, 0.55, 1.2], 0.12));
        // Escala tudo (posições, raios e meias-medidas) pelo fator SCALE.
        const k = HeliSheet.SCALE, m = (v) => v.map((x) => x * k);
        for (const p of P) {
            if (p.c) p.c = m(p.c);
            if (p.a) { p.a = m(p.a); p.b = m(p.b); }
            if (p.t === 'e') p.r = m(p.r); else if (p.t === 's' || p.t === 'c') p.r *= k;
            if (p.t === 'b') { p.h = m(p.h); p.bevel *= k; }
        }
        return P;
    }

    constructor(scene, palette, { dirs = 16, frame = 256 } = {}) {
        this.scene = scene;
        this.dirs = dirs;
        this.frame = frame;
        this.name = 'heli';
        this.palette = palette;
        const t0 = performance.now();
        const W = dirs * frame, H = frame;
        const data = new Uint8Array(W * H * 4);
        const prims = HeliSheet.model();
        for (let d = 0; d < dirs; d++) {
            const img = SpriteBaker.bake(prims, { size: frame, heading: (d * Math.PI * 2) / dirs, shadow: false });
            for (let y = 0; y < frame; y++) data.set(img.subarray(y * frame * 4, (y + 1) * frame * 4), (y * W + d * frame) * 4);
        }
        const tex = SpriteMaterial.atlasTexture(scene, data, W, H);
        const material = SpriteMaterial.create(scene, 'heli_body', tex, palette);
        this._clip = { name: 'static', weapon: 'none', frames: 1, dirs, fps: 1, loop: true, texture: tex, material, frame, W, H };
        console.log(`[HELI] ${dirs} direções em ${(performance.now() - t0).toFixed(0)} ms`);

        this.rotorMaterial = HeliSheet._rotorMaterial(scene, frame);
    }

    getClip() { return this._clip; }

    // Rotor principal: disco translúcido + 2 pás, em pixels duros (sem suavização).
    static _rotorMaterial(scene, size) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d', { willReadFrequently: true });      // lê os pixels de volta logo abaixo: canvas na CPU, sem esperar a GPU
        const R = size * 0.43, cx = size / 2, cy = size / 2;
        g.fillStyle = 'rgba(205,212,225,0.2)';                       // disco de "borrão" do rotor
        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(28,30,38,0.95)';                       // as duas pás
        g.lineWidth = Math.round(size * 0.04); g.lineCap = 'butt';
        g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
        g.lineWidth = Math.round(size * 0.024);
        g.beginPath(); g.moveTo(cx, cy - R * 0.9); g.lineTo(cx, cy + R * 0.9); g.stroke();
        g.fillStyle = '#9aa3b0'; g.beginPath(); g.arc(cx, cy, size * 0.035, 0, Math.PI * 2); g.fill();   // cubo
        // Endurece o alfa (estilo pixel art): só 3 níveis.
        const img = g.getImageData(0, 0, size, size), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3];
            d[i + 3] = a < 24 ? 0 : (a < 120 ? 56 : 235);
        }
        g.putImageData(img, 0, 0);

        const tex = new BABYLON.DynamicTexture('heliRotor', { width: size, height: size }, scene, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        tex.getContext().putImageData(img, 0, 0);
        tex.hasAlpha = true;
        tex.update(false);
        const m = new BABYLON.StandardMaterial('heliRotorMat', scene);
        m.diffuseTexture = tex;
        m.useAlphaFromDiffuseTexture = true;
        m.disableLighting = true;
        m.emissiveColor = SpriteMaterial.sharedTint();       // escurece à noite como os sprites
        m.specularColor = BABYLON.Color3.Black();
        m.backFaceCulling = false;
        return m;
    }
}
