// ============================================================================
// TileFactory — texturas pixel art TILEÁVEIS do mundo, desenhadas por código.
// Densidade: Config.art.ppu (20 px/u). Tudo é determinístico (seeds fixas).
//   chão:      asfalto, rua (faixas), faixa de pedestres, calçada, grama, areia,
//              concreto, praça, água (4 frames), orla.
//   prédios:   telhados e fachadas por "estilo"; cada fachada tem um mapa
//              emissivo com as janelas acesas (usado à noite).
// ============================================================================

const TileFactory = {
    // Estilos de fachada. Tile de 120×120 px = 2 baias × 2 andares (cada 3u × 3u).
    facadeStyles: {
        office0:  { kind: 'office', glassA: '#4f7ea3', glassB: '#a6d0e6', frame: '#33414f', span: '#2c3946' },
        office1:  { kind: 'office', glassA: '#35566f', glassB: '#7aa3bf', frame: '#26323d', span: '#1f2933' },
        office2:  { kind: 'office', glassA: '#4d8a82', glassB: '#b2dccd', frame: '#34443f', span: '#2a3834' },
        brick0:   { kind: 'brick', brick: ['#8a4b3a', '#94533f', '#7d4334', '#a05a44'], mortar: '#5a352c', trim: '#e6e1d2' },
        brick1:   { kind: 'brick', brick: ['#7b5c4c', '#86654f', '#6e5242', '#926f58'], mortar: '#4d3a30', trim: '#d8d2c0' },
        brick2:   { kind: 'brick', brick: ['#a46c4a', '#b0774f', '#955f40', '#bb8157'], mortar: '#6b4630', trim: '#f0ead8' },
        house0:   { kind: 'house', wall: '#e8dcb8', trim: '#fbf8ee', shutter: '#3f6b4a' },
        house1:   { kind: 'house', wall: '#9fb8cc', trim: '#f2f4f6', shutter: '#2f4a6b' },
        house2:   { kind: 'house', wall: '#d9a58b', trim: '#fff3e6', shutter: '#5a3b2e' },
        house3:   { kind: 'house', wall: '#b4d0ae', trim: '#f6faf0', shutter: '#7a3b3b' },
        metal0:   { kind: 'metal', a: '#8d9aa6', b: '#7b8894', hi: '#abb8c3' },
        metal1:   { kind: 'metal', a: '#b9a98e', b: '#a8987d', hi: '#d0c3aa' },
        concrete0: { kind: 'concrete', wall: '#a9a69d', glass: '#33414f' },
        concrete1: { kind: 'concrete', wall: '#c4bfb2', glass: '#2d3b4a' },
        // Prédios residenciais de luxo (a Lagoa): laje branca de cada andar avançando, varanda com guarda-corpo de vidro, janelão do piso ao teto.
        lux0:     { kind: 'resid', wall: '#f2efe8', glass: '#3a5a72', rail: '#b9dbe8', slab: '#fbfaf6' },
        lux1:     { kind: 'resid', wall: '#e7dcc8', glass: '#2f4a5e', rail: '#a8d0e0', slab: '#f3ece0' },
        lux2:     { kind: 'resid', wall: '#d9dcdf', glass: '#354b5c', rail: '#bfe0ea', slab: '#eef0f1' },
        lux3:     { kind: 'resid', wall: '#c9b8a0', glass: '#2b3d4c', rail: '#b0d6e4', slab: '#e2d6c4' },
        // Rural: celeiro vermelho, tábuas de madeira (cabanas) e madeira cinza envelhecida.
        barn0:    { kind: 'metal', a: '#9a3a2c', b: '#8a3226', hi: '#b8503e' },
        wood0:    { kind: 'metal', a: '#8a6238', b: '#7a5430', hi: '#a67a48' },
        wood1:    { kind: 'metal', a: '#8d8a80', b: '#7c7970', hi: '#a8a59a' },
        // Prédios especiais: hospital (vidro azul-claro, moldura branca) e delegacia (tijolo azul-marinho).
        hospital: { kind: 'office', glassA: '#6fb0c8', glassB: '#d6eef5', frame: '#e6eaec', span: '#cdd5da' },
        station:  { kind: 'brick', brick: ['#46598a', '#4e639a', '#40527f', '#566ca3'], mortar: '#27304d', trim: '#e8ebf4' },
        // Morro do Mirante (C.P.C): reboco pintado de cor viva (rosa, amarelo, turquesa, laranja, lilás) e tijolo cru.
        vid0:     { kind: 'house', wall: '#e98ab0', trim: '#fff2f6', shutter: '#3a6fb0' },
        vid1:     { kind: 'house', wall: '#f2cf4a', trim: '#fffbe8', shutter: '#2f8a5a' },
        vid2:     { kind: 'house', wall: '#4cc3c0', trim: '#effcfb', shutter: '#d9573a' },
        vid3:     { kind: 'house', wall: '#f08a3c', trim: '#fff1e2', shutter: '#3a4f8a' },
        vid4:     { kind: 'house', wall: '#a98ad8', trim: '#f6f0ff', shutter: '#e8c22c' },
        vid5:     { kind: 'house', wall: '#7fc46a', trim: '#f2fbee', shutter: '#b0453a' },
        // Roça: casa caipira caiada (janela azul ou verde), pau a pique cor de barro.
        caipira0: { kind: 'house', wall: '#efe9dc', trim: '#fbf8f0', shutter: '#2f5fa8' },
        caipira1: { kind: 'house', wall: '#f1e4c2', trim: '#fbf6e6', shutter: '#3f7a3a' },
        taipa0:   { kind: 'house', wall: '#c99466', trim: '#e8d2b4', shutter: '#6a4026' },
        // Serra rica: chalé enxaimel (reboco claro e vigas escuras) e casarão de pedra.
        chalet0:  { kind: 'timber', wall: '#f1ebdd', beam: '#4a3020', glass: '#2f3f52' },
        chalet1:  { kind: 'timber', wall: '#e9dcc0', beam: '#5a2f22', glass: '#2b3a4d' },
        stone0:   { kind: 'stone', stone: ['#9a9286', '#a8a094', '#8c8478', '#b4ab9c'], mortar: '#5e5850', trim: '#f2efe6', glass: '#30465c' },
        stone1:   { kind: 'stone', stone: ['#b4a48a', '#c2b296', '#a6967c', '#cdbea2'], mortar: '#6e624f', trim: '#fbf8f0', glass: '#2c4258' },
    },

    // Estilos de telhado. Tile de 160×160 px = 8u × 8u.
    roofStyles: {
        tar0:    { kind: 'tar', base: ['#3f4247', '#464950', '#4d5057', '#54575e'] },
        tar1:    { kind: 'tar', base: ['#4a4640', '#524d46', '#5a554d', '#625c53'] },
        conc0:   { kind: 'concrete', base: ['#8f9296', '#989b9f', '#a1a4a8', '#aaadb1'] },
        conc1:   { kind: 'concrete', base: ['#a39f94', '#aca89d', '#b5b1a6', '#bebaaf'] },
        tile0:   { kind: 'tile', colors: ['#b5533c', '#c4624a', '#a24632', '#cf6e52'] },
        tile1:   { kind: 'tile', colors: ['#8a5f48', '#99694f', '#7a5240', '#a67358'] },
        metal0:  { kind: 'metal', a: '#6f8497', b: '#62778a', hi: '#8fa5b8' },
        metal1:  { kind: 'metal', a: '#8c8f93', b: '#7d8084', hi: '#a9acb0' },
        garden0: { kind: 'garden', base: ['#5d9544', '#66a04b', '#538a3d', '#6faa52'] },
        // Favela: zinco (cinza e enferrujado), lonas coloridas e laje de concreto cru.
        redmetal: { kind: 'metal', a: '#a8402f', b: '#963828', hi: '#c25a46' },
        shingle:  { kind: 'tile', colors: ['#5a4a3c', '#665443', '#4e4034', '#6e5a48'] },
        zinc0:   { kind: 'zinc', a: '#8d9399', b: '#7b8187', hi: '#b5bbc0' },
        zinc1:   { kind: 'zinc', a: '#a08a72', b: '#8e7860', hi: '#c4ad92' },
        tarp0:   { kind: 'tarp', base: '#2f6fb5' },
        tarp1:   { kind: 'tarp', base: '#d9822b' },
        tarp2:   { kind: 'tarp', base: '#4f9a45' },
        slab0:   { kind: 'slab', base: ['#9a978f', '#a3a099', '#8d8a83', '#aaa7a0'] },
        slab1:   { kind: 'slab', base: ['#b4ada0', '#bdb6a9', '#a8a194', '#c4bdb0'] },
        // Telhados limpos (sem ar-condicionado) dos prédios especiais, onde vão os letreiros: hospital claro, delegacia azul.
        hosp:    { kind: 'concrete', clean: true, base: ['#dfe3e6', '#e5e8ea', '#eceff1', '#f2f4f5'] },
        police:  { kind: 'concrete', clean: true, base: ['#2f3f66', '#34456f', '#3a4c78', '#405382'] },
        // Laje do Mirante: piso pintado (terracota, verde-quadra, azul), caixa-d'água, vasos e, nas de festa, mesas e ombrelone.
        lajeV0:  { kind: 'laje', base: ['#b0583c', '#bc6244', '#a65036', '#c46a4a'], party: false },
        lajeV1:  { kind: 'laje', base: ['#3f8a5a', '#469462', '#38804f', '#4e9c6a'], party: true },
        lajeV2:  { kind: 'laje', base: ['#3f6fa8', '#4777b0', '#38679e', '#4f80b8'], party: false },
        lajeV3:  { kind: 'laje', base: ['#a9a59c', '#b2aea5', '#9f9b92', '#bbb7ae'], party: true },
        // Serra: ardósia (chalé) e telha de madeira escura; Roça: telha de barro velha (capim e musgo).
        slate0:  { kind: 'tile', colors: ['#47505a', '#4f5964', '#3f4750', '#58626e'] },
        cedar0:  { kind: 'tile', colors: ['#6a4630', '#744e36', '#5e3e2a', '#7e563c'] },
        clay0:   { kind: 'tile', colors: ['#a0583c', '#8e4e36', '#b06648', '#7e5a3a'] },
    },

    // Constrói todas as texturas (chame uma vez por cena). Com a cidade em alta definição (art/CityHD.js) os pisos, telhados,
    // fachadas e lojas saem repintados em HD, no mesmo desenho; o mar e o terreno do mundo grande continuam daqui.
    create(scene) {
        const T = {}, hd = typeof CityHD !== 'undefined' && CityHD.on ? CityHD : null;
        const tex = (p, o) => p.toTexture(scene, o);
        const t0 = performance.now();
        if (hd) hd.lastMs = 0;
        const floor = (name, seed, o) => hd ? hd.make(scene, name, seed) : tex(this[name](seed), o);

        T.asphalt = floor('asphalt', 11);
        T.road = floor('road', 21, { aniso: 4 });
        T.zebra = floor('zebra', 31, { aniso: 4 });
        T.sidewalk = floor('sidewalk', 41);
        T.grass = floor('grass', 51);
        T.sand = floor('sand', 61);
        T.concrete = floor('concrete', 71);
        T.plaza = floor('plaza', 81);
        // Terreno do mundo grande.
        T.dirt = floor('dirt', 101);
        T.rock = floor('rock', 111);
        T.swamp = tex(this.swamp(121));
        T.farm0 = tex(this.farm(131, 0)); T.farm1 = tex(this.farm(141, 1)); T.farm2 = tex(this.farm(151, 2));
        T.scrub = tex(this.scrub(161));
        T.forest = tex(this.forest(171));
        T.earth = floor('earth', 181);
        // Água: UMA textura; os 4 quadros da animação ficam na RAM (80×80) e WorldBuilder.update reescreve os pixels da textura (ver lá).
        T.waterFrames = [0, 1, 2, 3].map((f) => this.water(f).data);
        T.water = [tex(this.water(0))];

        T.roofs = {};
        for (const key of Object.keys(this.roofStyles)) {
            T.roofs[key] = hd ? hd.make(scene, 'roof', key) : tex(this.roof(key));
        }

        if (hd) T.shops = hd.shopAtlas(scene);
        else { const a = this.shopAtlas(); T.shops = { diffuse: tex(a.d, { aniso: 8, wrap: false }), emissive: tex(a.e, { aniso: 8, wrap: false }), cols: a.COLS, rows: a.ROWS }; }
        // Fachadas: { diffuse, emissive (as janelas acesas), grid (janelas no ladrilho, ver render/WindowLights.js), occ (casa/escritório) }.
        T.facades = {};
        for (const key of Object.keys(this.facadeStyles)) {
            if (hd) { T.facades[key] = hd.facade(scene, key); continue; }
            const f = this.facade(key);
            T.facades[key] = {
                diffuse: tex(f.diffuse, { aniso: 8 }),
                emissive: tex(f.emissive, { aniso: 8 }),
                grid: [0, 0], occ: 'home',                   // (pixel art: as janelas acesas já vêm sorteadas no desenho)
            };
        }
        T.machine = hd ? hd.machine(scene) : null;          // casas de máquinas no telhado (sem o HD: caixas de cor lisa)
        if (hd) { hd.release(); console.log(`[CIDADE] texturas em alta definição (${hd.Q * Config.art.ppu} px/u) em ${Math.round(hd.lastMs)} ms (total ${Math.round(performance.now() - t0)} ms)`); }
        return T;
    },

    // ------------------------------------------------------------------ chão
    _asphaltFill(p, seed) {
        const pal = ['#2f3238', '#34373d', '#393c43', '#3e4148', '#44474f'].map(Pixel.hex);
        p.noiseFill(pal, seed, 8, 0.55);
        const r = Pixel.rng(seed * 7 + 1);
        const light = Pixel.hex('#5a5d66'), dark = Pixel.hex('#232529');
        const n = (p.w * p.h) / 110;
        for (let i = 0; i < n; i++) p.set(r() * p.w, r() * p.h, light);
        for (let i = 0; i < n * 0.7; i++) p.set(r() * p.w, r() * p.h, dark);
        // Rachaduras: caminhadas aleatórias curtas.
        for (let k = 0; k < Math.max(2, (p.w * p.h) / 5000); k++) {
            let x = r() * p.w, y = r() * p.h;
            const len = 12 + r() * 20;
            for (let s = 0; s < len; s++) {
                p.set(x, y, dark);
                x += r() < 0.55 ? 1 : (r() < 0.3 ? -1 : 0);
                y += r() < 0.5 ? 1 : (r() < 0.2 ? -1 : 0);
            }
        }
    },

    asphalt(seed) {
        const p = new PixelCanvas(80, 80);
        this._asphaltFill(p, seed);
        return p;
    },

    // Rua: 160 px ao longo (8u) × 200 px de largura (10u). Pista de cada sentido tem 5u.
    road(seed) {
        const W = 160, H = 200;
        const p = new PixelCanvas(W, H);
        this._asphaltFill(p, seed);

        // Trilhas de pneu: faixa lisa e levemente mais escura no centro de cada pista.
        for (const cy of [50, 150]) {
            for (let y = cy - 9; y <= cy + 9; y++) for (let x = 0; x < W; x++) {
                if (Pixel.hash(x, y, seed + 3) < 0.5) p.set(x, y, Pixel.mix(p.get(x, y), [18, 19, 23], 0.32));
            }
        }
        // Linhas de borda brancas desbotadas, a 0,5u do meio-fio.
        const white = Pixel.hex('#cfd2d6');
        for (const y of [10, 11, 188, 189]) for (let x = 0; x < W; x++) {
            if (Pixel.hash(x, y, seed + 5) < 0.86) p.set(x, y, white);
        }
        // Centro: amarelo tracejado (4u de traço, 4u de vão) com sombrinha embaixo.
        const yellow = Pixel.hex('#eab62c'), yellowDark = Pixel.hex('#a37f1c');
        for (let x = 0; x < 80; x++) {
            for (let y = 98; y <= 101; y++) if (Pixel.hash(x, y, seed + 9) < 0.94) p.set(x, y, y === 101 ? yellowDark : yellow);
        }
        return p;
    },

    // Faixa de pedestres (zebra): 200 px (10u, atravessando a rua) × 60 px (3u de espessura).
    zebra(seed) {
        const W = 200, H = 60;
        const p = new PixelCanvas(W, H);
        this._asphaltFill(p, seed);
        const white = Pixel.hex('#d9dce0'), worn = Pixel.hex('#aeb2b8');
        for (let x = 0; x < W; x++) {
            if (x % 20 < 10 && x >= 10 && x < W - 10) {
                for (let y = 3; y < H - 3; y++) {
                    const h = Pixel.hash(x, y, seed + 4);
                    if (h < 0.1) continue;             // desgaste
                    p.set(x, y, h < 0.3 ? worn : white);
                }
            }
        }
        return p;
    },

    sidewalk(seed) {
        const p = new PixelCanvas(80, 80);
        const tones = ['#b9bdc2', '#b3b7bd', '#bfc3c8', '#aeb2b8'].map(Pixel.hex);
        const joint = Pixel.hex('#8b9097'), hi = Pixel.hex('#d3d7db');
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
            const base = Pixel.pick(tones, Pixel.hash(sx, sy, seed));
            for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
                const g = Pixel.hash(sx * 20 + x, sy * 20 + y, seed + 2);
                let c = base;
                if (g < 0.1) c = Pixel.mix(base, [255, 255, 255], 0.12);
                else if (g > 0.93) c = Pixel.mix(base, [60, 60, 70], 0.18);
                if (y === 0 || x === 0) c = joint;
                else if (y === 1 || x === 1) c = hi;
                p.set(sx * 20 + x, sy * 20 + y, c);
            }
        }
        // Manchas escuras (sujeira/chiclete).
        const r = Pixel.rng(seed);
        for (let i = 0; i < 6; i++) {
            const x = r() * 80, y = r() * 80;
            p.set(x, y, Pixel.hex('#7d8288')); p.set(x + 1, y, Pixel.hex('#7d8288'));
        }
        return p;
    },

    grass(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#4f8a3a', '#5a963f', '#62a046', '#6aa94c', '#74b356'].map(Pixel.hex), seed, 8, 0.45);
        const r = Pixel.rng(seed);
        const dark = Pixel.hex('#3b6e2d'), light = Pixel.hex('#92c964');
        for (let i = 0; i < 90; i++) {
            const x = r() * 80, y = r() * 80;
            p.set(x, y, dark); p.set(x, y + 1, dark);
        }
        for (let i = 0; i < 70; i++) {
            const x = r() * 80, y = r() * 80;
            p.set(x, y, light);
        }
        const flowers = ['#f4e35c', '#f2f2f6', '#f08aa8', '#c9a0f0'].map(Pixel.hex);
        for (let i = 0; i < 7; i++) p.set(r() * 80, r() * 80, Pixel.pick(flowers, r()));
        return p;
    },

    // ------------------------------------------------------------ terreno (mundo grande)
    // Terra batida de trilha/estrada de chão: pedrinhas claras e escuras.
    dirt(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#8a6a45', '#94724a', '#7d5f3d', '#a07c52', '#6f5436'].map(Pixel.hex), seed, 9, 0.5);
        const r = Pixel.rng(seed * 3 + 1), light = Pixel.hex('#b99a70'), dark = Pixel.hex('#54402a');
        for (let i = 0; i < 70; i++) { const x = r() * 80, y = r() * 80; p.set(x, y, light); p.set(x + 1, y, light); }
        for (let i = 0; i < 60; i++) { const x = r() * 80, y = r() * 80; p.set(x, y, dark); p.set(x, y + 1, dark); }
        for (let k = 0; k < 4; k++) {                                   // marcas de pneu/pegadas: linhas curtas mais escuras
            let x = r() * 80, y = r() * 80;
            for (let s = 0; s < 14; s++) { p.set(x, y, dark); x += 1; y += r() < 0.3 ? 1 : 0; }
        }
        return p;
    },

    // Pedra de morro/serra: estratos horizontais, rachaduras e lascas claras.
    rock(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#7c7a75', '#86837d', '#6f6d69', '#908d86', '#605e5b'].map(Pixel.hex), seed, 11, 0.45);
        const r = Pixel.rng(seed * 5 + 3), dark = Pixel.hex('#46443f'), light = Pixel.hex('#aaa79f'), warm = Pixel.hex('#8d7a63');
        for (let k = 0; k < 7; k++) {                                   // estratos
            const y0 = Math.floor(r() * 80), len = 20 + r() * 50, x0 = r() * 80;
            for (let s = 0; s < len; s++) { const y = y0 + (r() < 0.12 ? (r() < 0.5 ? -1 : 1) : 0); p.set(x0 + s, y, dark); if (r() < 0.5) p.set(x0 + s, y + 1, light); }
        }
        for (let i = 0; i < 40; i++) p.set(r() * 80, r() * 80, warm);
        for (let i = 0; i < 40; i++) { const x = r() * 80, y = r() * 80; p.set(x, y, light); p.set(x + 1, y + 1, dark); }
        return p;
    },

    // Pântano: lama verde-escura com poças e algas.
    swamp(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#3f5a3a', '#4a6640', '#364e33', '#566f46', '#2f4630'].map(Pixel.hex), seed, 8, 0.5);
        const r = Pixel.rng(seed * 7 + 2), mud = Pixel.hex('#2a3b2c'), alga = Pixel.hex('#8aa457'), water = Pixel.hex('#35546a');
        for (let b = 0; b < 5; b++) {                                   // poças
            const cx = r() * 80, cy = r() * 80, rad = 3 + r() * 5;
            for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y * 1.6 < rad * rad) p.set(cx + x, cy + y, (x + y) % 5 === 0 ? water : mud);
        }
        for (let i = 0; i < 70; i++) p.set(r() * 80, r() * 80, alga);
        return p;
    },

    // Plantação: fileiras de cultivo. kind 0 = terra arada com brotos, 1 = lavoura verde madura, 2 = trigo dourado.
    farm(seed, kind) {
        const p = new PixelCanvas(80, 80);
        const pals = [['#7a5a3a', '#8a6845', '#6e5032', '#94724a'], ['#5c9a3c', '#66a542', '#528c36', '#70ae4c'], ['#c9a94a', '#d6b756', '#bd9c40', '#dfc366']];
        p.noiseFill(pals[kind].map(Pixel.hex), seed, 7, 0.35);
        const r = Pixel.rng(seed * 11 + kind), dark = Pixel.hex(['#4f3a24', '#3a6a28', '#8e7430'][kind]), light = Pixel.hex(['#a58660', '#9acb68', '#efd985'][kind]);
        for (let y = 0; y < 80; y += 8) {                               // sulcos a cada 0,4u
            for (let x = 0; x < 80; x++) { p.set(x, y, dark); p.set(x, y + 1, dark); if (kind && r() < 0.5) p.set(x, y + 3, light); }
            if (kind === 0) for (let x = 2; x < 80; x += 6) { p.set(x, y + 4, Pixel.hex('#6fae48')); p.set(x, y + 3, Pixel.hex('#6fae48')); }
        }
        return p;
    },

    // Mato seco (cerrado): capim amarelado e tufos.
    scrub(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#a39a55', '#b0a65e', '#9a904d', '#bab067', '#8e8546'].map(Pixel.hex), seed, 8, 0.45);
        const r = Pixel.rng(seed * 13 + 5), dark = Pixel.hex('#6e6a35'), light = Pixel.hex('#d8cf86'), dirt = Pixel.hex('#8a6d4a');
        for (let i = 0; i < 80; i++) { const x = r() * 80, y = r() * 80; p.set(x, y, dark); p.set(x, y - 1, dark); }
        for (let i = 0; i < 60; i++) p.set(r() * 80, r() * 80, light);
        for (let i = 0; i < 18; i++) { const x = r() * 80, y = r() * 80; p.set(x, y, dirt); p.set(x + 1, y, dirt); }
        return p;
    },

    // Chão de mata: grama escura com folhas secas.
    forest(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#3d7232', '#47803a', '#356a2c', '#4f8a40', '#2f5f27'].map(Pixel.hex), seed, 8, 0.5);
        const r = Pixel.rng(seed * 17 + 7), dark = Pixel.hex('#244a1f'), leaf = [Pixel.hex('#8a6a3a'), Pixel.hex('#a8803f'), Pixel.hex('#6d5230')];
        for (let i = 0; i < 100; i++) { const x = r() * 80, y = r() * 80; p.set(x, y, dark); p.set(x, y + 1, dark); }
        for (let i = 0; i < 45; i++) p.set(r() * 80, r() * 80, Pixel.pick(leaf, r()));
        return p;
    },

    // Chão da favela: terra batida misturada com cimento e entulho.
    earth(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#9a8468', '#a48d70', '#8c765b', '#ad977a', '#7f6a51'].map(Pixel.hex), seed, 7, 0.55);
        const r = Pixel.rng(seed * 19 + 9), ash = Pixel.hex('#8d8a85'), dark = Pixel.hex('#5e4b38'), brick = Pixel.hex('#a5543e');
        for (let b = 0; b < 4; b++) { const cx = r() * 80, cy = r() * 80, rad = 4 + r() * 5; for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y < rad * rad && r() < 0.6) p.set(cx + x, cy + y, ash); }
        for (let i = 0; i < 60; i++) { const x = r() * 80, y = r() * 80; p.set(x, y, dark); p.set(x + 1, y, dark); }
        for (let i = 0; i < 10; i++) { const x = r() * 80, y = r() * 80; p.set(x, y, brick); p.set(x + 1, y, brick); }
        return p;
    },

    sand(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#dccb8e', '#e3d398', '#e9dba4', '#efe2b2', '#d5c283'].map(Pixel.hex), seed, 10, 0.4);
        const r = Pixel.rng(seed);
        // Ondulações do vento: arcos claros com sombra embaixo.
        for (let k = 0; k < 7; k++) {
            const cx = r() * 80, cy = r() * 80, len = 8 + r() * 14;
            for (let i = 0; i < len; i++) {
                const y = cy + Math.sin(i * 0.5) * 1.5;
                p.set(cx + i, y, Pixel.hex('#f4ebc4'));
                p.set(cx + i, y + 1, Pixel.hex('#c9b576'));
            }
        }
        for (let i = 0; i < 60; i++) p.set(r() * 80, r() * 80, Pixel.hex('#b39e63'));
        return p;
    },

    concrete(seed) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#7f8387', '#868a8e', '#8d9195', '#94989c'].map(Pixel.hex), seed, 10, 0.5);
        const r = Pixel.rng(seed);
        // Manchas de óleo.
        for (let k = 0; k < 4; k++) {
            const cx = r() * 80, cy = r() * 80, rad = 3 + r() * 4;
            for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
                if (x * x + y * y < rad * rad && Pixel.hash(x + cx, y + cy, seed) < 0.75) p.set(cx + x, cy + y, Pixel.hex('#5f6367'));
            }
        }
        // Juntas de dilatação a cada 4u (borda do tile).
        const j = Pixel.hex('#62666a');
        for (let i = 0; i < 80; i++) { p.set(i, 0, j); p.set(0, i, j); }
        return p;
    },

    // Praça do centro: lajotas quadradas de 2u em dois tons (xadrez) com juntas.
    plaza(seed) {
        const p = new PixelCanvas(80, 80);
        const a = ['#9d9ca2', '#a3a2a8'].map(Pixel.hex), b = ['#8f8e96', '#94939b'].map(Pixel.hex);
        for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
            const pal = (tx + ty) % 2 === 0 ? a : b;
            for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
                let c = Pixel.pick(pal, Pixel.hash(tx * 40 + x, ty * 40 + y, seed));
                if (x === 0 || y === 0) c = Pixel.hex('#6e6d76');
                else if (x === 1 || y === 1) c = Pixel.hex('#b6b5bc');
                p.set(tx * 40 + x, ty * 40 + y, c);
            }
        }
        return p;
    },

    // Água: 4 frames que alternam (brilhos e ondas se mexem). Tile de 80 px = 4u.
    water(frame) {
        const p = new PixelCanvas(80, 80);
        p.noiseFill(['#2a6586', '#2d6a8c', '#306f92', '#2b6788'].map(Pixel.hex), 5, 10, 0.25);
        const r = Pixel.rng(99); // mesma posição-base em todos os frames
        const light = Pixel.hex('#5fa7c6'), spark = Pixel.hex('#c4e8f2'), dark = Pixel.hex('#245a79');
        for (let k = 0; k < 16; k++) {
            const x = r() * 80, y = r() * 80, len = 4 + r() * 8;
            const dx = frame * 3 + Math.sin(frame * 1.7 + k) * 2;
            for (let i = 0; i < len; i++) p.set(x + dx + i, y, i === 0 || i === len - 1 ? dark : light);
            p.set(x + dx + 1, y + 1, dark);
        }
        const r2 = Pixel.rng(200 + frame * 13); // brilhos que piscam a cada frame
        for (let i = 0; i < 9; i++) p.set(r2() * 80, r2() * 80, spark);
        return p;
    },

    // ------------------------------------------------------------- telhados
    _ac(p, x, y) {
        // Unidade de ar-condicionado vista de cima, com ventilador.
        p.bevel(x, y, 38, 28, Pixel.hex('#c5c9cd'), Pixel.hex('#eceff1'), Pixel.hex('#7f868c'));
        p.disc(x + 12, y + 14, 8, Pixel.hex('#3a3f46'));
        p.disc(x + 12, y + 14, 6, Pixel.hex('#565c64'));
        p.hline(x + 6, y + 14, 13, Pixel.hex('#252a30'));
        p.vline(x + 12, y + 8, 13, Pixel.hex('#252a30'));
        for (let i = 0; i < 5; i++) p.hline(x + 24, y + 5 + i * 4, 10, Pixel.hex('#8d949a'));
    },

    _vent(p, x, y) {
        p.disc(x, y, 5, Pixel.hex('#9aa0a6'));
        p.disc(x, y, 3, Pixel.hex('#41464d'));
        p.set(x - 1, y - 1, Pixel.hex('#d5d9dc'));
    },

    // Caixa-d'água redonda vista de cima (tampa com aro e brilho).
    _tank(p, x, y, color) {
        const c = Pixel.hex(color);
        p.disc(x + 2, y + 2, 14, Pixel.hex('#2a2a30'));                                  // sombra
        p.disc(x, y, 13, Pixel.mix(c, [0, 0, 20], 0.4));
        p.disc(x, y, 11, c);
        p.disc(x, y, 7, Pixel.mix(c, [255, 255, 255], 0.18));
        p.disc(x - 3, y - 3, 2, Pixel.mix(c, [255, 255, 255], 0.7));
        p.disc(x + 3, y + 3, 1, Pixel.mix(c, [0, 0, 0], 0.5));
    },

    roof(key) {
        const st = this.roofStyles[key];
        const seed = key.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
        const r = Pixel.rng(seed);
        const p = new PixelCanvas(160, 160);

        if (st.kind === 'tar' || st.kind === 'concrete') {
            p.noiseFill(st.base.map(Pixel.hex), seed, 10, 0.5);
            // Emendas das mantas / lajes a cada 2u.
            const seam = Pixel.mix(Pixel.hex(st.base[0]), [0, 0, 0], 0.25);
            for (let i = 0; i < 160; i += 40) { p.vline(i, 0, 160, seam); }
            if (st.kind === 'concrete') for (let i = 0; i < 160; i += 40) p.hline(0, i, 160, seam);
            for (let i = 0; i < 160; i++) if (Pixel.hash(i, 3, seed) < 0.3) p.set(r() * 160, r() * 160, Pixel.hex('#c9ccd0'));
            if (!st.clean) {
                this._ac(p, 14 + Math.floor(r() * 20), 18 + Math.floor(r() * 20));
                if (st.kind === 'concrete') this._ac(p, 92 + Math.floor(r() * 16), 96 + Math.floor(r() * 16));
                this._vent(p, 120 + Math.floor(r() * 20), 30 + Math.floor(r() * 20));
                this._vent(p, 40 + Math.floor(r() * 20), 120 + Math.floor(r() * 20));
                this._vent(p, 130, 130);
            }
        } else if (st.kind === 'tile') {
            const cols = st.colors.map(Pixel.hex);
            for (let row = 0; row < 20; row++) {
                const off = (row % 2) * 7;
                for (let x = 0; x < 160; x++) {
                    const sh = Math.floor((x + off) / 14);
                    const base = Pixel.pick(cols, Pixel.hash(sh, row, seed));
                    for (let y = 0; y < 8; y++) {
                        let c = base;
                        if (y === 0) c = Pixel.mix(base, [255, 235, 200], 0.28);
                        else if (y >= 6) c = Pixel.mix(base, [30, 10, 20], y === 7 ? 0.5 : 0.28);
                        if ((x + off) % 14 === 13) c = Pixel.mix(base, [30, 10, 20], 0.4);
                        p.set(x, row * 8 + y, c);
                    }
                }
            }
            // Cumeeira (linha mais clara) no meio.
            for (let x = 0; x < 160; x++) { p.set(x, 80, Pixel.hex('#7a3a2c')); p.set(x, 79, Pixel.hex('#d9836a')); }
        } else if (st.kind === 'metal') {
            const a = Pixel.hex(st.a), b = Pixel.hex(st.b), hi = Pixel.hex(st.hi);
            for (let x = 0; x < 160; x++) {
                const m = x % 10;
                const c = m < 2 ? hi : (m < 6 ? a : b);
                for (let y = 0; y < 160; y++) {
                    p.set(x, y, Pixel.hash(x, y, seed) < 0.06 ? Pixel.mix(c, [255, 255, 255], 0.1) : c);
                }
            }
            // Claraboia.
            p.bevel(100, 24, 40, 30, Pixel.hex('#7fb3cf'), Pixel.hex('#d9f0fa'), Pixel.hex('#2f5b78'));
            this._vent(p, 30, 110);
        } else if (st.kind === 'zinc') {
            // Telha de zinco ondulada (favela): faixas a cada 6 px, ferrugem, pedras/pneus pesando a telha e, às vezes, caixa-d'água.
            const a = Pixel.hex(st.a), b = Pixel.hex(st.b), hi = Pixel.hex(st.hi);
            for (let x = 0; x < 160; x++) {
                const m = x % 6, c = m < 1 ? hi : (m < 4 ? a : b);
                for (let y = 0; y < 160; y++) p.set(x, y, Pixel.hash(x, y, seed) < 0.05 ? Pixel.mix(c, [255, 255, 255], 0.1) : c);
            }
            for (let k = 0; k < 4; k++) p.hline(0, 38 + k * 40, 160, Pixel.mix(a, [20, 20, 25], 0.35));       // emendas das chapas
            const rust = Pixel.hex('#8a4a2a');
            for (let k = 0; k < 9; k++) {                                                                      // manchas de ferrugem
                const cx = r() * 160, cy = r() * 160, rad = 4 + r() * 8;
                for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y * 1.3 < rad * rad && r() < 0.65) p.set(cx + x, cy + y, Pixel.mix(rust, a, r() * 0.5));
            }
            for (let k = 0; k < 6; k++) { const cx = 10 + r() * 140, cy = 10 + r() * 140; p.disc(cx, cy, 4, Pixel.hex('#2c2c30')); p.disc(cx, cy, 2, Pixel.hex('#4a4a50')); }   // pneu/pedra
            if (r() < 0.6) this._tank(p, 100 + Math.floor(r() * 30), 28 + Math.floor(r() * 30), r() < 0.5 ? '#3f78b5' : '#c9ccd0');
        } else if (st.kind === 'tarp') {
            // Lona colorida esticada com cordas, rugas e pedras nas pontas.
            const base = Pixel.hex(st.base), dark = Pixel.mix(base, [10, 10, 30], 0.35), light = Pixel.mix(base, [255, 255, 255], 0.22);
            p.noiseFill([Pixel.mix(base, [0, 0, 0], 0.12), base, Pixel.mix(base, [255, 255, 255], 0.08)], seed, 9, 0.35);
            for (let k = 0; k < 14; k++) {                                                                      // rugas diagonais
                let x = r() * 160, y = r() * 160; const len = 20 + r() * 40;
                for (let s = 0; s < len; s++) { p.set(x, y, r() < 0.5 ? light : dark); x += 1; y += 0.5; }
            }
            const rope = Pixel.hex('#c9b58a');
            for (let i = 0; i < 160; i += 40) { p.vline(i, 0, 160, rope); }
            for (let k = 0; k < 7; k++) { const cx = 8 + r() * 144, cy = 8 + r() * 144; p.disc(cx, cy, 4, Pixel.hex('#7d7d80')); p.disc(cx - 1, cy - 1, 2, Pixel.hex('#9c9ca0')); }
        } else if (st.kind === 'slab') {
            // Laje de concreto cru: manchas, ferros de espera nas quinas, roupas no varal, antena e caixa-d'água.
            p.noiseFill(st.base.map(Pixel.hex), seed, 10, 0.55);
            const stain = Pixel.hex('#5f5c56');
            for (let k = 0; k < 10; k++) { const cx = r() * 160, cy = r() * 160, rad = 5 + r() * 10; for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y < rad * rad && r() < 0.35) p.set(cx + x, cy + y, stain); }
            const rebar = Pixel.hex('#b0602f'), rebarD = Pixel.hex('#6e3a1c');
            for (const [x, y] of [[6, 6], [152, 6], [6, 152], [152, 152], [80, 6], [80, 152]]) { p.disc(x, y, 3, rebarD); p.disc(x, y, 2, rebar); }          // vergalhões
            for (let k = 0; k < 6; k++) {                                                                       // varal: roupas coloridas em fileira
                const cl = ['#e8e3d4', '#d9453a', '#2f86d0', '#e8c22c', '#2fa36a', '#9a6bd0'];
                p.hline(24, 100, 70, Pixel.hex('#3a3a3e'));
                p.rect(26 + k * 11, 101, 8, 9, Pixel.hex(cl[k % cl.length]));
            }
            this._tank(p, 34 + Math.floor(r() * 20), 30, '#3f78b5');
            p.disc(120, 40, 3, Pixel.hex('#c9ccd0')); p.set(120, 40, Pixel.hex('#ffffff'));                         // antena parabólica
            p.hline(112, 40, 16, Pixel.hex('#7a7f85'));
        } else if (st.kind === 'laje') {
            // Laje pintada do Mirante: piso colorido com juntas, mureta, caixa-d'água azul, vasos de planta e (festa) mesas e ombrelones.
            p.noiseFill(st.base.map(Pixel.hex), seed, 10, 0.45);
            const seam = Pixel.mix(Pixel.hex(st.base[0]), [0, 0, 0], 0.18);
            for (let i = 0; i < 160; i += 32) { p.vline(i, 0, 160, seam); p.hline(0, i, 160, seam); }
            this._tank(p, 18 + Math.floor(r() * 16), 18 + Math.floor(r() * 16), '#3f78b5');
            for (let k = 0; k < 5; k++) { const cx = 8 + r() * 144, cy = 120 + r() * 32; p.disc(cx, cy, 5, Pixel.hex('#8a4a2a')); p.disc(cx, cy, 4, Pixel.hex(['#3f8a3a', '#2f7a34', '#5aa04a'][k % 3])); }      // vasos
            if (st.party) {
                const tc = ['#e8e3d4', '#e8452a', '#f2c230', '#2f86d0'];
                for (let k = 0; k < 4; k++) {
                    const cx = 70 + (k % 2) * 46, cy = 50 + Math.floor(k / 2) * 46;
                    p.disc(cx, cy, 16, Pixel.hex(tc[k])); for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; p.set(cx + Math.cos(t) * 15, cy + Math.sin(t) * 15, Pixel.mix(Pixel.hex(tc[k]), [0, 0, 0], 0.3)); }
                    p.disc(cx, cy, 2, Pixel.hex('#3a3a3e'));
                }
                for (let k = 0; k < 10; k++) { const cx = 60 + r() * 90, cy = 30 + r() * 100; p.rect(cx, cy, 4, 4, Pixel.hex('#f2f2f2')); }      // cadeiras de plástico
                for (let x = 0; x < 160; x += 6) p.set(x, 8 + Math.round(Math.sin(x / 12) * 2), Pixel.hex(['#ffd25a', '#ff7a5a', '#7ad0ff'][x % 3]));   // varal de lâmpadas
            } else {
                for (let k = 0; k < 6; k++) { const cl = ['#e8e3d4', '#d9453a', '#2f86d0', '#e8c22c', '#2fa36a', '#9a6bd0']; p.hline(80, 70, 66, Pixel.hex('#3a3a3e')); p.rect(82 + k * 10, 71, 7, 9, Pixel.hex(cl[k])); }
            }
        } else if (st.kind === 'garden') {
            p.noiseFill(st.base.map(Pixel.hex), seed, 8, 0.5);
            // Canteiros e caminho de pedra.
            for (let i = 0; i < 160; i++) { p.set(i, 80, Pixel.hex('#b8bcc0')); p.set(i, 81, Pixel.hex('#b8bcc0')); p.set(i, 79, Pixel.hex('#8a8f94')); }
            p.bevel(14, 14, 44, 28, Pixel.hex('#7a5a3c'), Pixel.hex('#a07c56'), Pixel.hex('#4a3524'));
            for (let i = 0; i < 24; i++) p.set(16 + r() * 40, 16 + r() * 24, Pixel.hex('#3f7a2f'));
            for (let i = 0; i < 8; i++) p.set(16 + r() * 40, 16 + r() * 24, Pixel.hex('#f08aa8'));
        }
        return p;
    },

    // ------------------------------------------------------------- fachadas de LOJAS (térreo do comércio)
    // Atlas 5×2 de células 120×72 px (6 u × 3,6 u): letreiro, vitrines, porta; mapa emissivo acende de noite.
    SHOPS: [
        { id: 'lanchonete', sign: '#d9453a', wall: '#8c6a4a', glass: '#4a6a7a', icon: 'cup', name: 'Lanchonete', poi: 'lanchonete' },
        { id: 'conveniencia', sign: '#2fa36a', wall: '#d7dbd0', glass: '#5a7f8c', icon: 'cart', name: 'Conveniência', poi: 'conveniencia' },
        { id: 'farmacia', sign: '#2fae8f', wall: '#e6e9e6', glass: '#5f8f98', icon: 'cross', name: 'Farmácia' },
        { id: 'roupas', sign: '#d46a9e', wall: '#c9b2c0', glass: '#6a6f8a', icon: 'shirt', name: 'Boutique', poi: 'boutique' },
        { id: 'banco', sign: '#2f5fb0', wall: '#b4bcc8', glass: '#3f5a78', icon: 'coin', name: 'Banco' },
        { id: 'bar', sign: '#9a4fd0', wall: '#4a3a55', glass: '#2f2f48', icon: 'cup', name: 'Bar', poi: 'lanchonete' },
        { id: 'padaria', sign: '#e0902a', wall: '#d9b98a', glass: '#6a7a78', icon: 'cup', name: 'Padaria', poi: 'lanchonete' },
        { id: 'celular', sign: '#2fb4d0', wall: '#9aa7b0', glass: '#3f6a80', icon: 'phone', name: 'Celulares' },
        { id: 'oficina', sign: '#e8c22c', wall: '#6a6e74', glass: '#3a4048', icon: 'wrench', name: 'Pay n Pay', poi: 'paynspray' },
        { id: 'armas', sign: '#4a5a32', wall: '#4a4f48', glass: '#2a3a3a', icon: 'gun', name: 'Loja de Armas', poi: 'gunshop' },
        { id: 'pizzaria', sign: '#c0392b', wall: '#b08a60', glass: '#5a6a70', icon: 'pizza', name: 'Pizzaria', poi: 'lanchonete' },
        { id: 'saladas', sign: '#3fa34d', wall: '#d8e0b8', glass: '#6a9a8a', icon: 'leaf', name: 'Saladas & Sucos', poi: 'lanchonete' },
        { id: 'italiano', sign: '#7a1f2b', wall: '#3a2a28', glass: '#2a2430', icon: 'fork', name: 'Ristorante', poi: 'lanchonete' },
        { id: 'japones', sign: '#b8282f', wall: '#2f3a30', glass: '#2a3030', icon: 'fish', name: 'Restaurante Japonês', poi: 'lanchonete' },
        { id: 'bocafumo', sign: '#2a2a2a', wall: '#5a5048', glass: '#1a1a1a', icon: 'smoke', name: 'Boca de Fumo' },
        { id: 'academia', sign: '#ff6a1a', wall: '#3a3f48', glass: '#28323e', icon: 'dumbbell', name: 'Academia', poi: 'academia' },
    ],

    shopAtlas() {
        const CW = 120, CH = 72, COLS = 5, ROWS = 4;
        const d = new PixelCanvas(CW * COLS, CH * ROWS), e = new PixelCanvas(CW * COLS, CH * ROWS);
        e.fill([0, 0, 0]);
        const H = Pixel.hex, warm = H('#ffd98a'), warm2 = H('#ffb866');
        this.SHOPS.forEach((S, i) => {
            const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH, r = Pixel.rng(500 + i * 37);
            const rect = (c, x, y, w, h, col) => c.rect(ox + x, oy + y, w, h, col);
            const wall = H(S.wall), sign = H(S.sign), glass = H(S.glass);
            // Parede com reboco, rodapé escuro.
            for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) d.set(ox + x, oy + y, Pixel.mix(wall, [0, 0, 0], 0.06 + 0.1 * Pixel.hash(x, y, 31 + i)));
            rect(d, 0, 62, CW, 10, Pixel.mix(wall, [0, 0, 0], 0.42));
            // Letreiro: faixa colorida com "letras" (barras brancas) e ícone.
            rect(d, 0, 0, CW, 17, Pixel.mix(sign, [0, 0, 0], 0.18)); rect(d, 0, 0, CW, 2, Pixel.mix(sign, [255, 255, 255], 0.35)); rect(d, 0, 15, CW, 2, Pixel.mix(sign, [0, 0, 0], 0.5));
            rect(e, 0, 1, CW, 15, Pixel.mix(sign, [255, 255, 255], 0.15));
            let tx = 30; const letters = 4 + Math.floor(r() * 4);
            for (let k = 0; k < letters; k++) { const w = 4 + Math.floor(r() * 4); rect(d, tx, 5, w, 7, H('#f7f4ea')); rect(e, tx, 5, w, 7, H('#fffdf0')); tx += w + 3; if (tx > CW - 12) break; }
            // Ícone do lado esquerdo do letreiro.
            const ix = 10, iy = 4;
            if (S.icon === 'cross') { rect(d, ix + 3, iy, 3, 9, H('#fff')); rect(d, ix, iy + 3, 9, 3, H('#fff')); }
            else if (S.icon === 'cup') { rect(d, ix, iy + 1, 8, 7, H('#f4f1e8')); rect(d, ix + 8, iy + 3, 2, 3, H('#f4f1e8')); rect(d, ix + 1, iy + 2, 6, 2, H(S.sign)); }
            else if (S.icon === 'cart') { rect(d, ix, iy + 1, 10, 1, H('#fff')); rect(d, ix + 1, iy + 3, 8, 4, H('#fff')); d.disc(ox + ix + 2, oy + iy + 9, 1, H('#fff')); d.disc(ox + ix + 8, oy + iy + 9, 1, H('#fff')); }
            else if (S.icon === 'shirt') { rect(d, ix + 2, iy, 6, 3, H('#fff')); rect(d, ix, iy + 2, 10, 3, H('#fff')); rect(d, ix + 2, iy + 5, 6, 4, H('#fff')); }
            else if (S.icon === 'coin') { d.disc(ox + ix + 5, oy + iy + 4, 5, H('#f5d44a')); d.disc(ox + ix + 5, oy + iy + 4, 3, H('#c9a526')); }
            else if (S.icon === 'phone') { rect(d, ix + 2, iy, 6, 10, H('#1c1f26')); rect(d, ix + 3, iy + 1, 4, 7, H('#5fd0f0')); }
            else if (S.icon === 'wrench') { rect(d, ix, iy + 4, 10, 2, H('#2a2a2e')); rect(d, ix + 7, iy + 1, 3, 8, H('#2a2a2e')); }
            else if (S.icon === 'gun') { rect(d, ix, iy + 2, 10, 3, H('#f4f1e8')); rect(d, ix + 1, iy + 5, 3, 4, H('#f4f1e8')); }
            else if (S.icon === 'pizza') { d.disc(ox + ix + 5, oy + iy + 5, 5, H('#f0c860')); d.disc(ox + ix + 4, oy + iy + 4, 1, H('#c0392b')); d.disc(ox + ix + 7, oy + iy + 7, 1, H('#c0392b')); }
            else if (S.icon === 'leaf') { d.disc(ox + ix + 5, oy + iy + 5, 5, H('#e8f4d0')); rect(d, ix + 4, iy + 1, 2, 8, H('#3fa34d')); }
            else if (S.icon === 'fork') { rect(d, ix + 1, iy, 1, 9, H('#fff')); rect(d, ix + 4, iy, 1, 9, H('#fff')); rect(d, ix + 7, iy, 2, 9, H('#fff')); rect(d, ix, iy, 9, 3, H('#fff')); }
            else if (S.icon === 'fish') { d.disc(ox + ix + 4, oy + iy + 5, 4, H('#fff')); rect(d, ix + 7, iy + 3, 3, 5, H('#fff')); }
            else if (S.icon === 'smoke') { d.disc(ox + ix + 5, oy + iy + 5, 4, H('#9a9a9a')); d.disc(ox + ix + 5, oy + iy + 4, 2, H('#c9c9c9')); }
            else if (S.icon === 'dumbbell') { rect(d, ix, iy + 2, 2, 6, H('#fff')); rect(d, ix + 2, iy + 3, 1, 4, H('#fff')); rect(d, ix + 3, iy + 4, 4, 2, H('#fff')); rect(d, ix + 7, iy + 3, 1, 4, H('#fff')); rect(d, ix + 8, iy + 2, 2, 6, H('#fff')); }
            rect(e, ix, iy, 10, 10, H('#fffdf0'));
            if (S.id === 'oficina') {
                // Portão de garagem de enrolar (faixas horizontais) + luz.
                rect(d, 14, 22, 92, 40, H('#8d939a')); for (let y = 24; y < 62; y += 5) rect(d, 14, y, 92, 1, H('#5c6168'));
                rect(d, 14, 22, 92, 2, H('#c9ced4'));
                rect(e, 14, 22, 92, 3, warm2);
            } else {
                // Duas vitrines e a porta.
                for (const wx of [6, 76]) {
                    rect(d, wx - 1, 21, 40, 38, H('#2a2e34'));
                    rect(d, wx, 22, 38, 36, glass);
                    for (let y = 22; y < 58; y++) for (let x = wx; x < wx + 38; x++) if (((x - wx) + (y - 22)) % 14 < 2) d.set(ox + x, oy + y, Pixel.mix(glass, [255, 255, 255], 0.28));      // reflexo diagonal
                    rect(e, wx, 22, 38, 36, Pixel.mix(warm, [0, 0, 0], 0.35));
                    for (let k = 0; k < 3; k++) { const px = wx + 3 + Math.floor(r() * 26), pw = 5 + Math.floor(r() * 7); rect(d, px, 42 + Math.floor(r() * 10), pw, 6, H(['#c9453a', '#d9b050', '#2f86d0', '#e8e3d4'][k % 4])); rect(e, px, 42 + Math.floor(r() * 10), pw, 6, warm); }   // mercadoria
                }
                rect(d, 50, 22, 20, 50, H('#2a2e34')); rect(d, 52, 24, 16, 46, Pixel.mix(glass, [0, 0, 0], 0.25)); rect(d, 66, 46, 2, 6, H('#d9dde2'));
                rect(e, 52, 24, 16, 22, Pixel.mix(warm2, [0, 0, 0], 0.4));
            }
        });
        return { d, e, COLS, ROWS, CW, CH };
    },

    // ------------------------------------------------------------- fachadas
    // Retorna { diffuse, emissive } (120×120). Linha 0 = topo; baias de 60 px.
    facade(key) {
        const st = this.facadeStyles[key];
        const seed = key.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 13);
        const r = Pixel.rng(seed);
        const d = new PixelCanvas(120, 120);
        const e = new PixelCanvas(120, 120);
        e.fill([0, 0, 0]);
        const warm = Pixel.hex('#ffd98a'), warm2 = Pixel.hex('#ffb866');

        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
            const ox = cx * 60, oy = cy * 60;
            if (st.kind === 'office') this._facadeOffice(d, e, st, ox, oy, r, warm);
            else if (st.kind === 'brick') this._facadeBrick(d, e, st, ox, oy, r, warm2, seed);
            else if (st.kind === 'house') this._facadeHouse(d, e, st, ox, oy, r, warm2, seed);
            else if (st.kind === 'metal') this._facadeMetal(d, e, st, ox, oy, r, warm, seed);
            else if (st.kind === 'timber') this._facadeTimber(d, e, st, ox, oy, r, warm2, seed);
            else if (st.kind === 'stone') this._facadeStone(d, e, st, ox, oy, r, warm2, seed);
            else this._facadeConcrete(d, e, st, ox, oy, r, warm, seed);
        }
        return { diffuse: d, emissive: e };
    },

    // Cortina de vidro: moldura de aço, vidro com degradê e reflexo diagonal.
    _facadeOffice(d, e, st, ox, oy, r, warm) {
        const frame = Pixel.hex(st.frame), span = Pixel.hex(st.span);
        const A = Pixel.hex(st.glassA), B = Pixel.hex(st.glassB);
        d.rect(ox, oy, 60, 60, frame);
        const gx = ox + 4, gy = oy + 6, gw = 52, gh = 36;
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
            const t = (x + y * 0.7) / (gw + gh * 0.7);
            let c = Pixel.mix(A, B, t);
            const streak = ((x - y * 0.8 + 40) % 28 + 28) % 28;
            if (streak < 3) c = Pixel.mix(c, [255, 255, 255], 0.28);
            else if (streak < 5) c = Pixel.mix(c, [255, 255, 255], 0.1);
            d.set(gx + x, gy + y, c);
        }
        d.vline(gx + 25, gy, gh, frame); d.vline(gx + 26, gy, gh, frame);
        d.hline(gx, gy + 17, gw, frame);
        // Painel de peito (spandrel) com luz no topo.
        d.rect(ox, oy + 46, 60, 13, span);
        d.hline(ox, oy + 46, 60, Pixel.mix(span, [255, 255, 255], 0.22));
        d.hline(ox, oy + 59, 60, [10, 14, 20]);
        // Janelas acesas (metade do vidro, aleatório).
        if (r() < 0.45) {
            const half = r() < 0.5 ? 0 : 27;
            e.rect(gx + half, gy, 25, gh, warm);
        }
    },

    // Tijolo aparente com janelas de moldura clara, peitoril e verga.
    _facadeBrick(d, e, st, ox, oy, r, warm, seed) {
        const cols = st.brick.map(Pixel.hex), mortar = Pixel.hex(st.mortar), trim = Pixel.hex(st.trim);
        for (let y = 0; y < 60; y++) {
            const row = Math.floor(y / 4), off = (row % 2) * 4;
            for (let x = 0; x < 60; x++) {
                const bx = Math.floor((x + off) / 8);
                let c;
                if (y % 4 === 3 || (x + off) % 8 === 7) c = mortar;
                else {
                    c = Pixel.pick(cols, Pixel.hash(bx + ox, row + oy, seed));
                    if (y % 4 === 0) c = Pixel.mix(c, [255, 230, 200], 0.14);
                }
                d.set(ox + x, oy + y, c);
            }
        }
        for (const wx of [9, 35]) {
            const x = ox + wx, y = oy + 12, w = 16, h = 26;
            d.rect(x - 1, y - 1, w + 2, h + 2, trim);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                d.set(x + i, y + j, Pixel.mix(Pixel.hex('#27384d'), Pixel.hex('#4a6a8c'), (i + j * 0.5) / (w + h * 0.5)));
            }
            d.hline(x, y + 12, w, trim); d.vline(x + 8, y, h, trim);
            d.rect(x - 3, y + h + 1, w + 6, 3, Pixel.mix(trim, [0, 0, 0], 0.08));   // peitoril
            d.hline(x - 3, y + h + 4, w + 6, Pixel.mix(trim, [0, 0, 0], 0.5));
            d.rect(x - 2, y - 4, w + 4, 2, Pixel.mix(trim, [0, 0, 0], 0.18));       // verga
            if (r() < 0.42) {
                e.rect(x, y, w, h, warm);
                if (r() < 0.5) e.rect(x, y, 4, h, Pixel.hex('#c0503a'));              // cortina
            }
        }
    },

    // Casa de reboco liso com janela, venezianas coloridas e caixa de flores.
    _facadeHouse(d, e, st, ox, oy, r, warm, seed) {
        const wall = Pixel.hex(st.wall), trim = Pixel.hex(st.trim), shut = Pixel.hex(st.shutter);
        for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
            const g = Pixel.hash(ox + x, oy + y, seed);
            d.set(ox + x, oy + y, g < 0.12 ? Pixel.mix(wall, [255, 255, 255], 0.08) : (g > 0.9 ? Pixel.mix(wall, [60, 40, 70], 0.09) : wall));
        }
        d.hline(ox, oy + 58, 60, Pixel.mix(wall, [40, 20, 60], 0.35));           // linha do andar
        d.hline(ox, oy + 59, 60, Pixel.mix(wall, [40, 20, 60], 0.55));
        for (const wx of [8, 36]) {
            const x = ox + wx, y = oy + 13, w = 16, h = 24;
            d.rect(x - 1, y - 1, w + 2, h + 2, trim);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                d.set(x + i, y + j, Pixel.mix(Pixel.hex('#35506b'), Pixel.hex('#6d93b5'), (i * 0.5 + j) / (w * 0.5 + h)));
            }
            d.hline(x, y + 11, w, trim); d.vline(x + 7, y, h, trim); d.vline(x + 8, y, h, trim);
            d.rect(x - 6, y - 1, 5, h + 2, shut); d.rect(x + w + 1, y - 1, 5, h + 2, shut);   // venezianas
            for (let j = 1; j < h; j += 3) { d.hline(x - 6, y + j, 5, Pixel.mix(shut, [0, 0, 0], 0.35)); d.hline(x + w + 1, y + j, 5, Pixel.mix(shut, [0, 0, 0], 0.35)); }
            d.rect(x - 2, y + h + 1, w + 4, 4, Pixel.hex('#7a5638'));             // caixa de flores
            for (let i = 0; i < w + 2; i += 2) d.set(x - 1 + i, y + h, Pixel.pick(['#e8456a', '#f2d34a', '#f08aa8'].map(Pixel.hex), Pixel.hash(i, wx, seed)));
            if (r() < 0.4) e.rect(x, y, w, h, warm);
        }
    },

    // Enxaimel (chalé da serra): reboco claro, vigas escuras em quadro com uma diagonal por baia e janela com venezianas de madeira.
    _facadeTimber(d, e, st, ox, oy, r, warm, seed) {
        const wall = Pixel.hex(st.wall), beam = Pixel.hex(st.beam), glass = Pixel.hex(st.glass), hi = Pixel.mix(beam, [255, 230, 200], 0.18);
        for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
            const g = Pixel.hash(ox + x, oy + y, seed);
            d.set(ox + x, oy + y, g < 0.1 ? Pixel.mix(wall, [255, 255, 255], 0.1) : (g > 0.92 ? Pixel.mix(wall, [80, 60, 40], 0.08) : wall));
        }
        const bar = (x, y, w, h) => { d.rect(x, y, w, h, beam); if (w > h) d.hline(x, y, w, hi); else d.vline(x, y, h, hi); };
        bar(ox, oy, 60, 4); bar(ox, oy + 55, 60, 5); bar(ox + 28, oy, 4, 60); bar(ox, oy, 3, 60); bar(ox + 57, oy, 3, 60);
        for (let t = 0; t < 52; t++) { const y = oy + 4 + t; for (const [a, dir] of [[3, 1], [32, -1]]) { const x = ox + a + Math.round((dir > 0 ? t : 51 - t) * 24 / 52); d.rect(x, y, 3, 1, beam); } }
        for (const wx of [8, 37]) {                                                            // janela com venezianas de madeira e floreira
            const x = ox + wx, y = oy + 18, w = 15, h = 18;
            d.rect(x - 1, y - 1, w + 2, h + 2, beam);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) d.set(x + i, y + j, Pixel.mix(glass, Pixel.hex('#7aa0c2'), (i + j) / (w + h)));
            d.vline(x + 7, y, h, beam); d.hline(x, y + 8, w, beam);
            d.rect(x - 5, y - 1, 4, h + 2, Pixel.mix(beam, [255, 255, 255], 0.12)); d.rect(x + w + 1, y - 1, 4, h + 2, Pixel.mix(beam, [255, 255, 255], 0.12));
            d.rect(x - 2, y + h + 1, w + 4, 3, Pixel.hex('#5a3a22'));
            for (let i = 0; i < w + 2; i += 2) d.set(x - 1 + i, y + h, Pixel.pick(['#d9455a', '#f2d34a', '#e86aa0', '#8a5ad0'].map(Pixel.hex), Pixel.hash(i, wx, seed)));   // hortênsias e gerânios
            if (r() < 0.5) e.rect(x, y, w, h, warm);
        }
    },

    // Casarão de pedra: alvenaria irregular, janelões com moldura clara e cornija no alto.
    _facadeStone(d, e, st, ox, oy, r, warm, seed) {
        const cols = st.stone.map(Pixel.hex), mortar = Pixel.hex(st.mortar), trim = Pixel.hex(st.trim), glass = Pixel.hex(st.glass);
        for (let y = 0; y < 60; y++) {
            const row = Math.floor(y / 6), off = Math.floor(Pixel.hash(row, oy, seed) * 9);
            for (let x = 0; x < 60; x++) {
                const bx = Math.floor((x + off) / (9 + (row % 3)));
                const c = (y % 6 === 5 || (x + off) % (9 + (row % 3)) === 0) ? mortar : Pixel.pick(cols, Pixel.hash(bx + ox, row + oy, seed));
                d.set(ox + x, oy + y, y % 6 === 0 ? Pixel.mix(c, [255, 255, 255], 0.12) : c);
            }
        }
        d.rect(ox, oy, 60, 4, trim); d.hline(ox, oy + 4, 60, Pixel.mix(trim, [0, 0, 0], 0.35));           // cornija
        const x = ox + 10, y = oy + 12, w = 40, h = 30;
        d.rect(x - 2, y - 2, w + 4, h + 4, trim);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            let c = Pixel.mix(glass, Pixel.hex('#8fb6d4'), (i + j * 0.6) / (w + h * 0.6));
            if (((i - j + 60) % 22) < 2) c = Pixel.mix(c, [255, 255, 255], 0.3);
            d.set(x + i, y + j, c);
        }
        for (const vx of [13, 26]) d.vline(x + vx, y, h, trim);
        d.hline(x, y + 10, w, trim);
        d.rect(x - 4, y + h + 2, w + 8, 3, trim);
        if (r() < 0.55) e.rect(x, y, w, h, warm);
    },

    // Galpão de chapa ondulada com janela-fita no alto e manchas de ferrugem.
    _facadeMetal(d, e, st, ox, oy, r, warm, seed) {
        const a = Pixel.hex(st.a), b = Pixel.hex(st.b), hi = Pixel.hex(st.hi);
        for (let x = 0; x < 60; x++) {
            const m = x % 6;
            const c = m === 0 ? hi : (m < 4 ? a : b);
            for (let y = 0; y < 60; y++) d.set(ox + x, oy + y, Pixel.hash(ox + x, oy + y, seed) < 0.05 ? Pixel.mix(c, [255, 255, 255], 0.1) : c);
        }
        for (let k = 0; k < 3; k++) {
            const x = ox + Math.floor(r() * 56), y = oy + Math.floor(r() * 30);
            for (let j = 0; j < 14 + r() * 10; j++) d.set(x, y + j, Pixel.hex('#8a5a3a'));
        }
        d.rect(ox + 6, oy + 14, 48, 9, Pixel.hex('#27323d'));
        for (let i = 0; i < 48; i++) d.set(ox + 6 + i, oy + 14, Pixel.hex('#7f93a5'));
        for (const vx of [18, 30, 42]) d.vline(ox + vx, oy + 14, 9, Pixel.hex('#51606e'));
        d.hline(ox, oy + 59, 60, Pixel.mix(a, [0, 0, 0], 0.5));
        if (r() < 0.35) e.rect(ox + 6, oy + 15, 48, 7, warm);
    },

    // Concreto moderno: painéis com juntas e janela-fita escura.
    _facadeConcrete(d, e, st, ox, oy, r, warm, seed) {
        const wall = Pixel.hex(st.wall), glass = Pixel.hex(st.glass);
        for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
            const g = Pixel.hash(ox + x, oy + y, seed);
            d.set(ox + x, oy + y, g < 0.14 ? Pixel.mix(wall, [255, 255, 255], 0.1) : (g > 0.88 ? Pixel.mix(wall, [40, 40, 60], 0.12) : wall));
        }
        d.vline(ox, oy, 60, Pixel.mix(wall, [0, 0, 0], 0.3));
        d.hline(ox, oy + 59, 60, Pixel.mix(wall, [0, 0, 0], 0.45));
        d.rect(ox + 2, oy + 10, 56, 26, glass);
        for (let i = 0; i < 56; i++) d.set(ox + 2 + i, oy + 10, Pixel.mix(glass, [255, 255, 255], 0.25));
        for (const vx of [16, 30, 44]) d.vline(ox + vx, oy + 10, 26, Pixel.mix(wall, [0, 0, 0], 0.2));
        for (let j = 0; j < 8; j++) d.hline(ox + 4 + j * 6, oy + 12 + j, 8, Pixel.mix(glass, [255, 255, 255], 0.12)); // reflexo
        if (r() < 0.4) e.rect(ox + 2, oy + 11, 56, 24, warm);
    },
};
