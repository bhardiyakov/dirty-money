// ============================================================================
// NpcArt — os personagens 2,5D (o pacote de NPCs: civis, PM, BOPE, Exército, traficantes e o protagonista) no jogo.
//
// Os desenhos vêm de atlas prontos (assets/npcs/<tipo>.js, gerados por tools/npcs a partir de src/art/npcgen): 8 direções por quadro,
// vistos do alto a 56° (não giram: cada direção tem o seu desenho). Cada pixel guarda 2 bytes — formato 2 (sombreado contínuo, "pré-
// renderizado"): o MATERIAL (× 8 + nível de água) e a LUZ (0–204 anda pela rampa de 5 tons do material; acima, o brilho especular);
// cores fixas (sombra, contorno, clarão…) guardam o código e o alfa. (Formato 1, o do pacote: código = material × 8 + tom, e o alfa.)
// A cor vem da PALETA (uma linha por variante): o mesmo desenho vira dezenas de pessoas diferentes (pele, cabelo, roupa) e a roupa
// do jogador muda de cor na hora. A sombra de contato já vem desenhada; debaixo d'água o corpo é tingido de azul.
// Alta definição (Config.art.hd): cada tipo ganha um atlas com o dobro da resolução, gerado no próprio jogo (ver hdWant).
//
//   NpcArt.sheet(tipo)            folha de um tipo (getClip como a CharacterSheet) — o SpriteActor toca os clipes dela
//   NpcArt.row(tipo, variante)    linha da paleta de uma variante (a cor das roupas)
//   NpcArt.pick(grupo, semente)   { tipo, linha } de alguém de um lugar/papel (casual, biz, poor, beach, police, swat, gang1…)
//   NpcArt.remap(folha, var, nome) troca o boneco antigo (civA/civB/police/swat/army + variante de cor) por um tipo novo
//
// Quadro (atributo `fr` do quad): 3 números = (x,y) e (w,h) do retângulo no atlas e o canto superior esquerdo relativo aos pés.
// ============================================================================

const NpcArt = {
    G: null,                       // o gerador (fichas, paletas; o Worker do jogador usa o mesmo código)
    atlases: {},                   // id → { data, px, tex, material }
    sheets: {},                    // id → NpcSheet
    ready: null,                   // Promise: todos os PNGs decodificados
    ROWS: 384,                     // linhas da paleta (variantes); 0 = jogador
    _rows: new Map(),              // chave → linha
    _nextRow: 1,
    sharp: 1,

    // (?npc=0 na URL: volta aos bonecos antigos — comparar/depurar)
    available() { return typeof NPC_ATLAS !== 'undefined' && Object.keys(NPC_ATLAS).length > 0 && typeof NpcGenCore === 'function' && !/[?&]npc=0\b/.test(location.search); },

    gen() {
        if (!this.G) { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); this.G = G; }
        return this.G;
    },

    _bytes(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },

    // Decodifica todos os atlas em segundo plano desde a carga da página (como o dos carros e o dos personagens antigos).
    load() {
        if (this.ready) return this.ready;
        const t0 = performance.now(), jobs = [];
        for (const [id, d] of Object.entries(NPC_ATLAS)) {
            const A = this.atlases[id] = { id, data: d, px: null, tex: null, material: null };
            jobs.push(PNG.decodeAsync(this._bytes(d.png)).then((img) => {
                if (img.w !== d.w || img.h !== d.h || img.ch !== 2) throw new Error(`atlas ${id}: formato inesperado`);
                A.px = img.data;
                d.png = null;                                    // (o texto base64 não é mais necessário)
                if (A.tex) this._upload(A);
            }).catch((e) => console.warn('[NPCS] ' + id + ':', e)));
        }
        this.ready = Promise.all(jobs).then(() => console.log(`[NPCS] ${jobs.length} atlas prontos em ${Math.round(performance.now() - t0)} ms`));
        return this.ready;
    },

    // ------------------------------------------------------------------ GPU
    init(scene) {
        if (this._scene === scene) return;
        this._scene = scene;
        this.gen();
        this._gl2 = scene.getEngine().webGLVersion >= 2;
        this._palette();
        this._register();
        for (const A of Object.values(this.atlases)) { A.tex = null; A.material = null; }
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
    ALPHA: -1.5,                   // entre as portas dos carros (-2) e as copas das árvores (-1)

    // Malha do personagem passa a (ou deixa de) ser 2,5D: grupo de desenho e ordem (ver init).
    sortMesh(mesh, on) {
        if (on) { mesh.renderingGroupId = 1; mesh.alphaIndex = this.ALPHA; mesh._ysort = true; }
        else if (mesh._ysort) { mesh._ysort = false; mesh.renderingGroupId = 0; mesh.alphaIndex = Number.MAX_VALUE; }
    },

    _texture(A) {
        if (A.tex) return A.tex;
        const d = A.data, sc = this._scene;
        A.tex = this._gl2
            ? new BABYLON.RawTexture(null, d.w, d.h, BABYLON.Constants.TEXTUREFORMAT_RG, sc, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE)
            : new BABYLON.RawTexture(null, d.w, d.h, BABYLON.Constants.TEXTUREFORMAT_LUMINANCE_ALPHA, sc, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
        A.tex.wrapU = A.tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        if (A.px) this._upload(A);
        return A.tex;
    },
    _upload(A) { A.tex.update(A.px); A.uploaded = true; if (!A.keepCpu) A.px = null; },

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
            varying vec3 vBl;
            varying vec3 vPx2;
            varying vec4 vFr2;
            vec2 un(float v) { float hi = floor(v / 4096.0 + 0.0001); return vec2(hi, v - hi * 4096.0); }
            void main(void) {
                vec2 xy = un(fr.x), wh = un(fr.y), o = un(fr.z) - 2048.0;
                // camadas de ferimento (SpriteActor.setWounds): fr.w = semente × 25 + baleado × 5 + espancado (níveis 0..4)
                float ws = floor(fr.w / 25.0 + 0.001), wr = fr.w - ws * 25.0, wb = floor(wr / 5.0 + 0.001);
                vBl = vec3(wb / 4.0, (wr - wb * 5.0) / 4.0, ws);
                vPx = vec2(xy.x - o.x + position.x * ppu, xy.y - o.y - position.z * ppu);
                vFr = vec4(xy, xy + wh);
                vec2 xy2 = un(fr2.x), wh2 = un(fr2.y), o2 = un(fr2.z) - 2048.0;
                vPx2 = vec3(xy2.x - o2.x + position.x * ppu, xy2.y - o2.y - position.z * ppu, fr2.w);
                vFr2 = vec4(xy2, xy2 + wh2);
                vC = color.rg;
                vW = vec3(position.x, position.z, color.a);                 // x e "altura" na imagem (m), linha d'água (m, 0 = seco)
                vec4 wp = world * vec4(position, 1.0);
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
            uniform float la;
            uniform float fmt;
            uniform float wt;
            uniform float ppu;
            varying vec3 vW;
            varying vec3 vBl;
            varying vec3 vPx2;
            varying vec4 vFr2;
            float hb(float n) { return fract(sin(n) * 43758.5453); }
            // ---- Camadas de ferimento por cima da skin (SpriteActor.setWounds), em coordenadas do corpo (x, altura na imagem, m)
            // arredondadas ao pixel da arte: ficam no mesmo lugar do corpo quando ele anda. Cada nível acrescenta uma marca.
            // BALEADO (vBl.x): furos de bala com sangue empapando a roupa em volta e escorrendo para baixo — tronco e coxas.
            // Devolve 0 (nada), 1 (sangue) ou 2 (o furo, quase preto).
            float shotMask(vec2 q) {
                float m = 0.0, s = vBl.z;
                for (int i = 0; i < 4; i++) {
                    float fi = float(i);
                    if (fi >= vBl.x * 4.0) break;
                    vec2 c = vec2((hb(s * 3.1 + fi) - 0.5) * 0.22, 0.3 + hb(s * 5.7 + fi * 1.3) * 0.34);
                    vec2 d = q - c;
                    float a = atan(d.y, d.x), r = (0.045 + 0.035 * hb(s * 9.3 + fi)) * (1.0 + 0.25 * sin(a * 3.0 + s + fi) + 0.15 * sin(a * 7.0 + s * 2.0));
                    float drip = step(abs(d.x - 0.012 * sin(d.y * 60.0 + fi)), 0.012) * step(d.y, 0.0) * step(-0.07 - 0.07 * hb(s + fi * 7.0), d.y);   // escorrido
                    if (length(d) < 0.016) return 2.0;
                    m = max(m, max(1.0 - step(r, length(d)), drip));
                }
                return m;
            }
            // ESPANCADO (vBl.y) — pensado para ler de CIMA (a câmera vê mais o cabelo e os ombros que o rosto): 1) sangue do nariz/boca
            // escorrendo até a gola; 2) ferida na cabeça (sangue no cabelo, escorrendo); 3) roupa suja de terra (rolou no chão);
            // 4) mais sujeira e a ferida maior. Hematomas roxos em toda pele que aparece (rosto, pescoço, mãos) desde o 1º nível.
            // Devolve (roxo 0..1, sangue 0..1, sujeira 0..1).
            vec3 beatMask(vec2 q, float mat) {
                float s = vBl.z + 17.0, bruise = 0.0, bl = 0.0, dirt = 0.0, lv = vBl.y * 4.0;
                bool skin = mat == 1.0, face = mat == 12.0 || mat == 14.0 || mat == 18.0, hair = mat == 2.0;
                bool cloth = mat == 3.0 || mat == 4.0 || mat == 20.0 || mat == 22.0 || mat == 29.0 || mat == 30.0;
                if (hair && lv > 1.5) {                                                          // ferida na cabeça
                    vec2 c = vec2(0.03 + 0.04 * (hb(s * 1.7) - 0.5), 1.06), d = q - c;
                    float a = atan(d.y, d.x), r = (lv > 3.5 ? 0.075 : 0.05) * (1.0 + 0.3 * sin(a * 4.0 + s));
                    float run = step(abs(d.x - 0.01 * sin(d.y * 50.0)), 0.014) * step(d.y, 0.0) * step(-0.12, d.y);
                    bl = max(1.0 - step(r, length(d)), run);
                }
                if (cloth && lv > 2.5) {                                                         // sujeira de terra
                    for (int i = 0; i < 4; i++) {
                        float fi = float(i);
                        if (fi >= (lv - 2.0) * 2.0) break;
                        vec2 c = vec2((hb(s * 7.7 + fi) - 0.5) * 0.5, 0.12 + hb(s * 3.3 + fi * 2.1) * 0.62), d = (q - c) * vec2(1.0, 1.4);
                        float a = atan(d.y, d.x), r = (0.06 + 0.04 * hb(s * 5.1 + fi)) * (1.0 + 0.3 * sin(a * 5.0 + fi * 2.0 + s));
                        dirt = max(dirt, 1.0 - smoothstep(r * 0.6, r, length(d)));
                    }
                }
                // (medidas do desenho de pé, de frente: rosto em ~0,95 de altura, mãos em ±0,42 × 0,33, gola em ~0,8)
                if (skin || face) {
                    bruise = 0.35;                                                                  // pele toda arroxeada/vermelha
                    for (int i = 0; i < 4; i++) {
                        float fi = float(i);
                        if (fi >= vBl.y * 4.0) break;
                        // olho roxo, a outra maçã do rosto e as duas mãos (nós dos dedos ralados de se defender)
                        vec2 c = i == 0 ? vec2(0.045, 0.965) : (i == 1 ? vec2(-0.05, 0.92) : (i == 2 ? vec2(0.42, 0.33) : vec2(-0.42, 0.35)));
                        c += (vec2(hb(s * 2.3 + fi), hb(s * 4.1 + fi)) - 0.5) * 0.03;
                        float r = (i < 2 ? 0.045 : 0.06) + 0.015 * hb(s * 6.7 + fi), l = length((q - c) * vec2(1.0, 1.2));
                        bruise = max(bruise, 1.0 - smoothstep(r * 0.45, r, l));
                    }
                }
                // sangue do nariz/boca: do rosto (0,93) escorrendo pelo queixo até a gola (~0,8) — na pele e na roupa logo abaixo
                if (!hair) {
                    float dx = q.x - 0.012 * (hb(s * 8.0) - 0.5);
                    bl = max(bl, step(abs(dx), 0.016 + 0.01 * vBl.y) * step(0.84 - 0.05 * vBl.y, q.y) * step(q.y, 0.93));
                    bl = max(bl, 1.0 - step(0.035 + 0.02 * vBl.y, length((q - vec2(0.0, 0.8)) * vec2(1.0, 1.6))));         // pingou na gola
                }
                return vec3(bruise, bl, dirt);
            }
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
                    // luz 0–204 anda pela rampa de 5 tons do material (sombreado contínuo); acima disso, o brilho (quase branco)
                    float u = min(b1, 204.0) / 204.0 * 4.0, i0 = floor(u), i1 = min(i0 + 1.0, 4.0);
                    vec3 c0 = texture2D(palette, vec2((mat * 8.0 + i0 + 0.5) / 256.0, row)).rgb;
                    vec3 c1 = texture2D(palette, vec2((mat * 8.0 + i1 + 0.5) / 256.0, row)).rgb;
                    c = mix(c0, c1, u - i0);
                    if (b1 > 204.0) c = mix(c, c1 + (1.0 - c1) * 0.65, (b1 - 204.0) / 51.0);
                    a8 = tone < 0.5 ? 255.0 : 200.0 - (tone - 1.0) / 3.0 * 150.0; a = a8 / 255.0;
                    if (tone > 0.5) c = mix(c, vec3(0.1804, 0.4078, 0.5569), 0.45 + 0.45 * clamp((200.0 - a8) / 150.0, 0.0, 1.0));     // debaixo d'água
                }
                if (code > 0.5) c *= tint * vC.y;
                return vec4(c * a, a);
            }
            // bilinear do quadro cujo retângulo no atlas é R (px), no ponto p (px)
            vec4 sampleFrame(vec2 px, vec4 R) {
                vec2 p = px - 0.5, i = floor(p), f = clamp((p - i - 0.5) * sharp + 0.5, 0.0, 1.0);
                return mix(mix(tap(i, R), tap(i + vec2(1.0, 0.0), R), f.x), mix(tap(i + vec2(0.0, 1.0), R), tap(i + vec2(1.0, 1.0), R), f.x), f.y);
            }
            void main(void) {
                vec4 c = sampleFrame(vPx, vFr);
                // mistura com o PRÓXIMO quadro da animação (gráfico suave): a pose muda em degradê, sem o salto seco entre quadros
                if (vPx2.z > 0.004) c = mix(c, sampleFrame(vPx2.xy, vFr2), vPx2.z);
                // Camadas de ferimento (baleado / espancado): só sobre o CORPO — pixel opaco de pele, roupa ou rosto; nunca no contorno,
                // na sombra, em armas e acessórios ou fora do desenho. A cor segue o sombreado do material embaixo.
                if ((vBl.x > 0.01 || vBl.y > 0.01) && c.a > 0.6) {
                    vec2 tp = floor(vPx);
                    vec4 s0 = texture2D(atlas, (tp + 0.5) / atlasSize);
                    float code = floor(s0.r * 255.0 + 0.5), mat = floor(code / 8.0);
                    bool inF = tp.x >= vFr.x && tp.y >= vFr.y && tp.x < vFr.z && tp.y < vFr.w;
                    bool body = mat == 1.0 || mat == 2.0 || mat == 3.0 || mat == 4.0 || mat == 12.0 || mat == 14.0 || mat == 18.0 || mat == 20.0 || mat == 22.0
                        || mat == 26.0 || mat == 27.0 || mat == 29.0 || mat == 30.0;
                    if (inF && code >= 8.0 && body) {
                        vec2 q = floor(vW.xy * ppu) / ppu;
                        vec3 rgb = c.rgb / c.a;
                        float lum = dot(rgb, vec3(0.3, 0.55, 0.15));
                        vec3 red = mix(vec3(0.4, 0.02, 0.04), vec3(0.64, 0.06, 0.07), lum) * tint;
                        if (vBl.y > 0.01) {
                            vec3 b = beatMask(q, mat);
                            rgb = mix(rgb, mix(vec3(0.38, 0.32, 0.24), vec3(0.55, 0.47, 0.36), lum) * tint, b.z * 0.55);    // terra
                            rgb = mix(rgb, mix(vec3(0.3, 0.12, 0.32), vec3(0.62, 0.3, 0.45), lum) * tint, b.x * 0.75);      // roxo
                            rgb = mix(rgb, red, b.y * 0.9);
                        }
                        if (vBl.x > 0.01) {
                            float m = shotMask(q);
                            if (m > 1.5) rgb = vec3(0.12, 0.0, 0.01) * tint;
                            else rgb = mix(rgb, red, m * 0.9);
                        }
                        c.rgb = rgb * c.a;
                    }
                }
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
                if (c.a < 0.02) discard;
                gl_FragColor = c;
            }`;
    },

    _material(A) {
        if (A.material) return A.material;
        const m = new BABYLON.ShaderMaterial('npcArt_' + A.id, this._scene, { vertex: 'npcArt', fragment: 'npcArt' }, {
            attributes: ['position', 'color', 'fr', 'fr2'],
            uniforms: ['world', 'viewProjection', 'ppu', 'lift', 'atlasSize', 'palRows', 'tint', 'sharp', 'la', 'fmt', 'wt'],
            samplers: ['atlas', 'palette'],
            needAlphaBlending: true,
        });
        m.setTexture('atlas', this._texture(A));
        m.setTexture('palette', this._pal.tex);
        m.setFloat('ppu', this.ppuOf(A));
        m.setFloat('fmt', A.data.v || 1);
        m.setFloat('lift', 4.0);
        m.setVector2('atlasSize', new BABYLON.Vector2(A.data.w, A.data.h));
        m.setFloat('palRows', this.ROWS);
        m.setColor3('tint', SpriteMaterial.sharedTint());
        m.setFloat('sharp', this._sharpOf(A));
        m.setFloat('la', this._gl2 ? 0 : 1);
        m.setFloat('wt', this._wt || 0);
        m.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
        m.backFaceCulling = false;
        A.material = m;
        return m;
    },

    // TAMANHO dos personagens no mundo: px por metro na resolução de referência (atlas com k = 0,5). Um atlas em alta definição
    // (k = 1) tem o dobro de px por metro — ppuOf.
    get ppu() { return (Config.art && Config.art.npcPpu) || 26; },
    ppuOf(A) { return this.ppu * ((A.data.k || 0.5) / 0.5); },

    // Nitidez conforme o zoom: px de tela por texel do atlas (> 1 = ampliado: sem borrar). Chamado a cada quadro pelo jogo.
    _spm: 0,
    _sharpOf(A) { return Math.max(1, Math.min(8, (this._spm || this.ppu) / this.ppuOf(A))); },

    // Relógio da linha d'água (ondulação de quem vadeia): um uniform por atlas carregado, ~30 por quadro.
    tick(t) {
        this._wt = t % 1000;
        for (const A of Object.values(this.atlases)) if (A.material) A.material.setFloat('wt', this._wt);
    },

    setZoom(screenPxPerMeter) {
        if (Math.abs(screenPxPerMeter - this._spm) < 0.05) return;
        this._spm = screenPxPerMeter;
        this.sharp = this._sharpOf({ data: {} });
        for (const A of Object.values(this.atlases)) if (A.material) A.material.setFloat('sharp', this._sharpOf(A));
    },

    // ------------------------------------------------------------------ clipes
    // Clipe pronto para o SpriteActor: { npc: true, pk: { fr, box, n, dirs }, material, fps, loop, frames }. null = o atlas não tem.
    clip(id, key) {
        const O = this.atlases[id + '#hd'];                                 // (alta definição, fase 1: parado/andando/correndo já em alta)
        if (O && O.data.clips[key]) return this.clip(id + '#hd', key);
        const A = this.atlases[id];
        if (!A) return null;
        const c = A.data.clips[key];
        if (!c) return null;
        const cache = A.cache || (A.cache = new Map());                 // (fora dos metadados: o atlas do jogador vai inteiro para o IndexedDB)
        if (cache.has(key)) return cache.get(key);
        const ppu = this.ppuOf(A), n = c.n, dirs = c.dirs || 8, fr = new Float32Array(n * dirs * 3);          // (pilotando: 16 direções)
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        c.f.forEach((q, i) => {
            const [x, y, w, h, ox, oy] = q;
            if (w && (x + w > 4096 || y + h > 4096) && !A.warned) { A.warned = true; console.warn(`[NPCS] ${id}: quadro fora do endereçável (x·4096 + y) em ${key}`); }
            fr[i * 3] = x * 4096 + y; fr[i * 3 + 1] = w * 4096 + h; fr[i * 3 + 2] = (ox + 2048) * 4096 + (oy + 2048);
            if (!w) return;
            x0 = Math.min(x0, ox); y0 = Math.min(y0, oy); x1 = Math.max(x1, ox + w); y1 = Math.max(y1, oy + h);
        });
        if (x0 === Infinity) { x0 = y0 = 0; x1 = y1 = 1; }
        // caixa do quad em metros (x leste, z norte), relativa aos pés: a imagem cresce para baixo = sul
        const box = [x0 / ppu, -y1 / ppu, x1 / ppu, -y0 / ppu];
        const [name, weapon] = key.split(':');
        const clip = { name, weapon, npc: true, atlas: id, gen: A.gen || 0, frames: n, dirs, fps: c.fps, loop: c.loop, pk: { fr, box, n }, material: this._material(A), shared: true, frame: 0, W: 0, H: 0 };
        this.hdWant(id);                                                    // (alta definição ligada: gera/carrega o desenho em alta deste tipo)
        cache.set(key, clip);
        return clip;
    },

    // Atlas gerado em tempo de jogo (o visual do jogador: PlayerLook) — mesmo formato dos prontos, já decodificado.
    addAtlas(id, a) {
        if (this.atlases[id]) this.dropAtlas(id);
        this.atlases[id] = { id, data: { w: a.w, h: a.h, clips: a.clips, k: a.k || 0.5, v: a.v || 2 }, px: a.data, tex: null, material: null };      // (gerado agora: formato 2)
    },
    // Geração do desenho de um tipo (o atlas foi trocado: os clipes já tocando são refeitos — SpriteActor.update).
    // (atlas descartado — o visual antigo do jogador — = -1: quem ainda o usa, como o piloto da moto, também refaz o clipe)
    genOf(id) { const A = this.atlases[id]; return A ? A.gen || 0 : -1; },

    // ------------------------------------------------------------------ ALTA DEFINIÇÃO (Config.art.hd — Ajustes → Gráficos)
    // O jogo passa a ser desenhado na resolução da tela (sem o "pixelado") e cada tipo de personagem ganha um atlas com o DOBRO da
    // resolução (k = 1: 52 px por metro), gerado aqui mesmo num Worker quando o tipo aparece pela primeira vez e guardado no aparelho
    // (IndexedDB, comprimido): da segunda vez é só carregar. Enquanto não fica pronto, o tipo aparece com o atlas pronto (resolução
    // padrão). Os atlas em alta não vêm no download (seriam ~90 MB).
    HD_VERSION: 5,                 // mude quando o gerador mudar o desenho (os atlas em alta guardados são refeitos) — 2: atlas até 4096 de lado; 3: passada longa; 4: subida (walk_up, climb); 5: corpo da malha 3D
    hdOn() { return !!(typeof Config !== 'undefined' && Config.art && Config.art.hd) && !!this._scene; },
    _hd: null,
    // Em duas fases, para todos os tipos ficarem nítidos logo: (1) só parado/andando/correndo (poucos segundos por tipo) → atlas
    // "<tipo>#hd" consultado ANTES do pronto (clip); (2) depois de todos os tipos terem a fase 1, o atlas inteiro (guardado no aparelho)
    // substitui o pronto e a camada da fase 1 sai. Guardado de outra vez: vai direto ao inteiro.
    HD_QUICK: ['idle', 'walk', 'run', 'scared'],
    hdWant(id) {
        if (!this.hdOn() || !id || id.startsWith('hero:') || id.endsWith('#hd')) return;
        const A = this.atlases[id];
        if (!A || A.hd || (A.data.k || 0.5) >= 1) return;
        A.hd = 'wait';
        const H = this._hd || (this._hd = { queue: [], later: [], busy: 0, done: 0, t0: performance.now() });
        H.queue.push({ id, full: false });
        this._hdPump();
    },
    _hdPump() {
        const H = this._hd, N = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 2));
        // o visual do jogador sendo gerado tem a CPU primeiro (a fila espera; quem já está gerando termina)
        if (typeof PlayerLook !== 'undefined' && PlayerLook.want) { if (!H.paused) H.paused = setTimeout(() => { H.paused = null; this._hdPump(); }, 1500); return; }
        while (H.busy < N && (H.queue.length || H.later.length)) this._hdOne(H.queue.length ? H.queue.shift() : H.later.shift(), H.busy++ % N);
    },
    _hdBuild(slot, id, keys) {
        const G = this.gen();
        return new Promise((ok, fail) => {
            const wk = PlayerLook._worker('hd' + slot), job = (this._hdJob = (this._hdJob || 0) + 1);
            wk.onmessage = (e) => { wk._busy = false; if (e.data.job !== job) return; if (e.data.error) fail(new Error(e.data.error)); else ok(e.data.atlas); };
            wk.postMessage({ type: 'atlas', job, id, keys, k: G.HD_K });
        });
    },
    async _hdOne({ id, full }, slot) {
        const H = this._hd, A = this.atlases[id], G = this.gen(), key = `v${this.HD_VERSION}.${G.HD_K}|${id}`;
        try {
            let a = await this._hdGet(key);
            if (a) a.data = await this._inflate(a.z);
            else if (!full) {                                                   // fase 1: os clipes de andar por aí
                const keys = G.TYPES[id].clips.filter((k) => this.HD_QUICK.includes(k.split(':')[0]));
                if (keys.length) this._overlay(id, await this._hdBuild(slot, id, keys));
                H.later.push({ id, full: true });
                a = null;
            } else {
                a = await this._hdBuild(slot, id, null);
                const z = await this._deflate(a.data);
                this._hdPut(key, { w: a.w, h: a.h, clips: a.clips, k: a.k, v: a.v, frame: a.frame, z });
            }
            if (a) {
                this._swap(id, a);
                this.dropAtlas(id + '#hd');
                A.hd = 'ok';
                H.done++;
                if (!H.queue.length && !H.later.length && H.busy === 1) console.log(`[NPCS] alta definição: ${H.done} tipos prontos (${Math.round((performance.now() - H.t0) / 1000)} s)`);
            }
        } catch (e) { console.warn('[NPCS] alta definição de ' + id + ' falhou:', e); A.hd = 'fail'; }
        H.busy--;
        this._hdPump();
    },
    // Camada da fase 1: atlas à parte; quem já toca um clipe do tipo troca para ele (gen do pronto muda).
    _overlay(id, a) {
        const A = this.atlases[id];
        if (!A || A.hd === 'ok') return;
        this.addAtlas(id + '#hd', a);
        A.cache = new Map();
        A.gen = (A.gen || 0) + 1;
        for (const s of Object.values(this.sheets)) if (s.atlasName === id || s.fallbackAtlas === id || s.extraAtlas === id) s.clips = {};
    },
    // Troca o desenho do tipo `id` (mesmo id: folhas, materiais e quem já está na tela acompanham).
    _swap(id, a) {
        const A = this.atlases[id];
        if (!A) return;
        A.data = { w: a.w, h: a.h, clips: a.clips, k: a.k, v: a.v || 2, frame: a.frame };
        A.px = a.data instanceof Uint8Array ? a.data : new Uint8Array(a.data);
        A.cache = new Map();
        A.gen = (A.gen || 0) + 1;
        if (A.tex) { A.tex.dispose(); A.tex = null; this._texture(A); }
        if (A.material) {
            const m = A.material;
            m.setTexture('atlas', A.tex);
            m.setVector2('atlasSize', new BABYLON.Vector2(a.w, a.h));
            m.setFloat('ppu', this.ppuOf(A)); m.setFloat('fmt', A.data.v); m.setFloat('sharp', this._sharpOf(A));
        }
        for (const s of Object.values(this.sheets)) if (s.atlasName === id || s.fallbackAtlas === id || s.extraAtlas === id) s.clips = {};
    },
    async _deflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); },
    async _inflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); },
    _hdDb() {
        if (this._hdDbp) return this._hdDbp;
        return (this._hdDbp = new Promise((ok) => {
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
    async _hdGet(k) {
        const db = await this._hdDb();
        if (!db) return null;
        return new Promise((ok) => {
            try { const q = db.transaction('atlas').objectStore('atlas').get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }
            catch (e) { ok(null); }
        });
    },
    async _hdPut(k, v) {
        const db = await this._hdDb();
        if (!db) return;
        try { db.transaction('atlas', 'readwrite').objectStore('atlas').put(v, k); } catch (e) { console.warn('[NPCS] alta definição não guardada:', e && e.message); }
    },

    dropAtlas(id) {
        const A = this.atlases[id];
        if (!A) return;
        if (A.material) A.material.dispose();
        if (A.tex) A.tex.dispose();
        delete this.atlases[id];
        for (const s of Object.values(this.sheets)) if (s.atlasName === id || s.fallbackAtlas === id || s.extraAtlas === id) s.clips = {};      // (nada de clipe guardado apontando para ele)
    },

    // Folha de um tipo. legacy = folha antiga para o que o atlas não tem (a primeira que pedir fica).
    sheet(id, legacy = null, legacyVariant = 2) {
        const s = this.sheets[id] || (this.sheets[id] = new NpcSheet(id));
        if (legacy && !s.legacy) { s.legacy = legacy; s.legacyVariant = legacyVariant; }
        return s;
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
    }
    _key(name, weapon) { return name + ':' + (weapon || 'none'); }
    getClip(name, weapon = 'none') {
        const w = weapon || 'none', key = this._key(name, w);
        if (key in this.clips) return this.clips[key];
        let c = NpcArt.clip(this.atlasName, key) || (this.fallbackAtlas && NpcArt.clip(this.fallbackAtlas, key)) || (this.extraAtlas && NpcArt.clip(this.extraAtlas, key));
        if (!c && w !== 'none') {
            const def = CharacterRig.CLIPS[name];
            if (def && !def.weapons) c = NpcArt.clip(this.atlasName, this._key(name, 'none')) || (this.fallbackAtlas && NpcArt.clip(this.fallbackAtlas, this._key(name, 'none')));
        }
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

if (NpcArt.available()) NpcArt.load();          // decodifica já durante a carga da página / menu
