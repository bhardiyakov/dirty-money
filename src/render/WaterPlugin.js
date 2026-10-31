// ============================================================================
// WaterPlugin — a orla: a passagem do mar para a areia em DEGRADÊ, com a quebra da onda subindo e descendo na areia.
//
// O mar continua em pixel art (TileFactory.water, 4 quadros). Antes a orla era uma faixa de espuma por célula costeira, com alfa
// pontilhado, e a beira da areia era a RETA das células de 4 u. Agora:
//   • Water.field: distância COM SINAL até a linha d'água em todo o mapa (+ mar, − terra; 1 texel = 2 u, lida com filtro bilinear,
//     então a costa em escada de células vira uma curva suave);
//   • o mesmo cálculo roda em dois plugins de material (StandardMaterial: luz, sombra e noite continuam do Babylon):
//       sea  (o plano d'água)   raso turquesa em faixas que somem mar adentro e a ARREBENTAÇÃO: vagas de água branca chegando;
//       land (areia, grama e chão do terreno)   a lâmina d'água TRANSLÚCIDA que sobe e desce por cima do chão, com a espuma na ponta
//            e a areia molhada (mais escura) atrás;
//     dos dois lados a cor é a mesma função da distância, então onde as malhas se encontram (a escada) não aparece emenda;
//   • a beira ondula suave ao longo da praia (shoreWobble) e todas as linhas da orla acompanham, paralelas;
//   • a espuma fica na grade de pixels do mundo (20 px/u), em pixel art, e é RENDADA (bolhas: células de Voronoi que fervem): cheia na
//     frente de cada vaga e na ponta da água que sobe, esgarçada atrás; o degradê do raso (turquesa até o azul, e a lâmina d'água na
//     areia) é suave e sem faixas, calculado fora da grade.
//   • uma onda a cada 7,4 s: as vagas chegam, a da frente sobe na areia rápido e desce devagar, deixando um fio de espuma no ponto mais
//     alto que vai sumindo; cada onda tem o seu alcance (o mesmo em toda a praia: as linhas continuam alinhadas).
// O tempo vem de uma textura de 5 px (Water.clock, Water.tick a cada quadro): os materiais do mundo são congelados
// (Game._freezeStaticMaterials) e um uniforme poderia não ser reenviado; o conteúdo de uma textura sempre vale.
//   px 0: a fase da onda na orla (R) e qual onda é esta (B) · px 1–4: a fase de cada ondulação do mar aberto (16 bits)
//   e, no px 1, a força do mar (Waves).
// Mar aberto (o plano d'água longe da beira): as ondulações de Waves — a mesma conta da física — clareiam a face das cristas virada
// para o sol e escurecem os cavados, andando; com mar agitado, carneirinhos (espuma no alto das cristas).
// ============================================================================

const Water = {
    field: null,
    clock: null,
    _fieldK: null,                       // [minX, minZ, 1/largura, 1/altura]: u → coordenada da textura do campo
    RANGE: 8,                            // o campo guarda −8…+8 u

    init(scene) {
        this._makeField(scene);
        this.clock = BABYLON.RawTexture.CreateRGBATexture(new Uint8Array(20), 5, 1, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        this._clk = new Uint8Array(20);
    },
    sea(material) { return this._apply(material, 'sea'); },
    land(material) { return this._apply(material, 'land'); },
    _apply(material, mode) {
        if (!this.field) return material;
        if (!Water._cls) Water._cls = Water._makeClass();
        new Water._cls(material, mode);
        return material;
    },

    // px 0: R = a fase da onda na orla (0–1 em 7,4 s: as vagas chegando, a água subindo e descendo na areia), B = qual onda é esta
    // (cada uma do seu tamanho); px 1–4: as ondulações do mar aberto (Waves: fase em 16 bits, R alto, G baixo) e, no px 1, B = a força
    // do mar (M / 2,5).
    tick(t) {
        if (!this.clock) return;
        const c = this._clk;
        c[0] = Math.floor((t / 7.4 % 1) * 256) & 255; c[2] = Math.floor(t / 7.4) & 255;
        if (typeof Waves !== 'undefined') {
            Waves.setTime(t);
            for (let i = 0; i < 4; i++) { const v = Math.floor(Waves.phase(i) * 65536) & 65535, o = (i + 1) * 4; c[o] = v >> 8; c[o + 1] = v & 255; }
            c[6] = Math.max(0, Math.min(255, Math.round(Waves.M / 2.5 * 255)));
        }
        this.clock.update(c);
    },

    // Distância com sinal até a linha d'água, por texel de 2 u, a partir das células do WorldMap (tudo que não é mar é terra:
    // continente, ilhas, cidade). Chanfro 1/√2 em 2 passadas, para o mar e para a terra.
    _makeField(scene) {
        const M = WorldMap, W = Config.world, B = M.B, S = 2, c = W.cell / S, nx = M.nx * S, nz = M.nz * S, N = nx * nz, R2 = Math.SQRT2, BIG = 1e6;
        const isSea = new Uint8Array(N);
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) isSea[j * nx + i] = M.biome[(j / S | 0) * M.nx + (i / S | 0)] === B.SEA ? 1 : 0;
        const dist = (target) => {                  // distância (texels) até o texel mais perto que NÃO é `target`
            const D = new Float32Array(N);
            for (let k = 0; k < N; k++) D[k] = isSea[k] === target ? BIG : 0;
            for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
                const k = j * nx + i; let d = D[k];
                if (!d) continue;
                if (i > 0) d = Math.min(d, D[k - 1] + 1);
                if (j > 0) { d = Math.min(d, D[k - nx] + 1); if (i > 0) d = Math.min(d, D[k - nx - 1] + R2); if (i < nx - 1) d = Math.min(d, D[k - nx + 1] + R2); }
                D[k] = d;
            }
            for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
                const k = j * nx + i; let d = D[k];
                if (!d) continue;
                if (i < nx - 1) d = Math.min(d, D[k + 1] + 1);
                if (j < nz - 1) { d = Math.min(d, D[k + nx] + 1); if (i < nx - 1) d = Math.min(d, D[k + nx + 1] + R2); if (i > 0) d = Math.min(d, D[k + nx - 1] + R2); }
                D[k] = d;
            }
            return D;
        };
        const DS = dist(1), DL = dist(0), data = new Uint8Array(N * 4), R = this.RANGE, F = new Float32Array(N);
        for (let k = 0; k < N; k++) F[k] = isSea[k] ? (DS[k] - 0.5) * c : -(DL[k] - 0.5) * c;          // do centro do texel até a borda (a linha d'água)
        // ÁGUA DOCE: o lago (água fechada, WorldMap.isSea = 0) e a terra que dá para ele (o lago mais perto que o mar) — sem arrebentação,
        // espuma nem areia molhada; e o ATERRO (a Lagoa: a beira é a mureta, map/Lagoa.js). Desfocados para a transição não ter degrau.
        const LK = new Float32Array(N), AT = new Float32Array(N), ocean = M.isSea, dSea = M._dSea, dLake = M._dLake;
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const k = j * nx + i, kc = (j / S | 0) * M.nx + (i / S | 0);
            LK[k] = isSea[k] ? (ocean && ocean[kc] ? 0 : 1) : (dLake && dSea && dLake[kc] < dSea[kc] ? 1 : 0);
            if (typeof Lagoa !== 'undefined') { const x = W.minX + (i + 0.5) * c, z = W.minZ + (j + 0.5) * c; AT[k] = Lagoa.zone(x, z, 2) ? 1 : 0; }
        }
        this._blur(LK, nx, nz, 2, 2); this._blur(AT, nx, nz, 2, 2);
        // A costa do mapa é uma ESCADA de células de 4 u: perto da beira as curvas do campo seguiam os degraus (a espuma na areia e a
        // linha d'água faziam quinas). Desfoque do campo (caixa de 3 texels, 3 passadas ≈ gaussiana de 2,8 u): numa costa reta nada
        // muda (a distância é linear); nos degraus a quina vira curva.
        this._blur(F, nx, nz, 1, 3);
        for (let k = 0; k < N; k++) {
            data[k * 4] = Math.round((Math.max(-R, Math.min(R, F[k])) / R * 0.5 + 0.5) * 255);
            data[k * 4 + 1] = Math.round(Math.max(0, Math.min(1, LK[k])) * 255); data[k * 4 + 2] = Math.round(Math.max(0, Math.min(1, AT[k])) * 255); data[k * 4 + 3] = 255;
        }
        const tex = BABYLON.RawTexture.CreateRGBATexture(data, nx, nz, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        this._fieldK = [W.minX, W.minZ, 1 / (nx * c), 1 / (nz * c)];
        return (this.field = tex);
    },

    // Desfoque de caixa separável (raio r texels, `passes` vezes) num campo nx × nz, com a borda repetida. Laços diretos (soma
    // corrida): ~1,5 M texels em dezenas de ms.
    _blur(F, nx, nz, r, passes) {
        const tmp = new Float32Array(Math.max(nx, nz)), w = 2 * r + 1;
        const line = (o, st, len) => {                                     // uma linha (st = 1) ou coluna (st = nx) a partir de o
            let acc = 0;
            for (let i = -r; i <= r; i++) acc += F[o + (i < 0 ? 0 : i >= len ? len - 1 : i) * st];
            for (let i = 0; i < len; i++) {
                tmp[i] = acc / w;
                const ia = i + r + 1, ib = i - r;
                acc += F[o + (ia < len ? ia : len - 1) * st] - F[o + (ib > 0 ? ib : 0) * st];
            }
            for (let i = 0, k = o; i < len; i++, k += st) F[k] = tmp[i];
        };
        for (let p = 0; p < passes; p++) {
            for (let j = 0; j < nz; j++) line(j * nx, 1, nx);
            for (let i = 0; i < nx; i++) line(i, nx, nz);
        }
    },

    // ------------------------------------------------------------------ shader
    _makeClass() {
        const K = this._fieldK.map((v) => v.toFixed(9)), R = this.RANGE.toFixed(1);
        // ondulações de Waves (constantes no shader; a fase de cada uma vem do relógio): h normalizado (soma das amplitudes = 1) e a
        // inclinação normalizada (soma de A·k = 1)
        const WC = Waves._init(), f = (v) => v.toFixed(6);
        const swellTerms = WC.map((c, i) => `
                {   vec4 t = texture2D(shoreClock, vec2(${f((i + 1.5) / 5)}, 0.5));
                    float th = dot(p, vec2(${f(c.k * c.dx)}, ${f(c.k * c.dz)})) - (t.r * 65280.0 + t.g * 255.0) / 65536.0 * 6.2831853 + ${f(c.ph)};
                    float co = cos(th);
                    r.x += ${f(c.A / Waves.sumA)} * sin(th); r.y += ${f(c.A * c.k * c.dx / Waves.sumAk)} * co; r.z += ${f(c.A * c.k * c.dz / Waves.sumAk)} * co; }`).join('');
        // Cor da orla. q = ponto na grade de pixels; s = distância com sinal (+ mar); sea/ground = cor do mar e do chão nesse ponto.
        const GLSL = `
            uniform sampler2D shoreField;
            uniform sampler2D shoreClock;
            float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float wNoise(vec2 p) {
                vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            // limiar: degrau duro (pixel art) ou, no gráfico suave (wSmooth), uma transição de largura w (~1–2 px da tela)
            float wStep(float e, float x, float w) { return wSmooth > 0.5 ? smoothstep(e - w, e + w, x) : step(e, x); }
            // mar aberto: (altura, inclinação x, inclinação z), normalizados, no ponto p — a mesma soma de Waves.sample
            vec3 swell(vec2 p) {
                vec3 r = vec3(0.0);${swellTerms}
                return r;
            }
            // cristas e cavados passando (luz do sol na face virada para ele) e, com mar agitado, carneirinhos: riscos de espuma no alto
            // das cristas, compridos ao longo delas, que andam junto com a ondulação maior (miolo cheio, franja salpicada)
            vec3 swellColor(vec3 col, vec2 q, float sw) {
                vec4 c1 = texture2D(shoreClock, vec2(0.3, 0.5));
                float M = c1.b * 2.5;
                vec3 r = swell(q);
                float lit = dot(r.yz, vec2(0.8, -0.6));                                          // (o sol vem do noroeste: Config.light.sunDir)
                float sh = (lit * 0.24 + r.x * 0.09) * sw * min(1.3, 0.6 + M * 0.35);
                if (wSmooth < 0.5) sh = floor(sh * 16.0 + 0.5) / 16.0;                            // pixel art: em degraus
                col *= 1.0 + sh;
                float cap = smoothstep(0.64, 0.9, r.x) * smoothstep(1.0, 1.9, M) * sw;
                if (cap <= 0.0) return col;
                vec2 adv = vec2(${f(WC[0].dx)}, ${f(WC[0].dz)}) * ((c1.r * 65280.0 + c1.g * 255.0) / 65536.0 * ${f(Waves.COMP[0].L)});   // (andam com a ondulação 1)
                vec2 d0 = vec2(${f(WC[0].dx)}, ${f(WC[0].dz)}), q2 = q - adv;
                float patchN = wNoise(vec2(dot(q2, d0) * 1.5, dot(q2, vec2(-d0.y, d0.x)) * 0.3));   // (fino na direção da onda, comprido ao longo da crista)
                float speck = wSmooth > 0.5 ? wNoise(q * 6.0) : wHash(floor(q * 20.0));
                float on = wStep(0.8 - cap * 0.32, patchN, 0.03) * (0.6 + 0.4 * wStep(0.3, speck, 0.05));
                return mix(col, vec3(0.92, 0.97, 0.98), cap * on * 0.9);
            }
            float shoreDist(vec2 q) { return (texture2D(shoreField, (q - vec2(${K[0]}, ${K[1]})) * vec2(${K[2]}, ${K[3]})).r - 0.5) * 2.0 * ${R}; }
            // água doce (lago) e aterro (a Lagoa), 0..1
            vec2 shoreLake(vec2 q) { return texture2D(shoreField, (q - vec2(${K[0]}, ${K[1]})) * vec2(${K[2]}, ${K[3]})).gb; }
            // A água do LAGO: verde-azulada, parada (sem ondulação nem espuma), mais clara e esverdeada no raso. No lago natural a beira
            // é de lama (barrenta), na Lagoa a beira é a mureta do aterro (a água chega funda até ela). Uns reflexos de sol bem leves.
            vec3 lakeColor(vec3 base, vec2 q, float sb, float at) {
                vec4 clk = texture2D(shoreClock, vec2(0.1, 0.5));
                vec3 deep = vec3(0.15, 0.35, 0.37), mid = vec3(0.22, 0.46, 0.45), near = vec3(0.32, 0.56, 0.48);
                float t = smoothstep(0.5, 10.0, sb);
                vec3 col = mix(mix(near, mid, smoothstep(0.0, 0.4, t)), deep, smoothstep(0.35, 1.0, t));
                col = mix(near * 0.9, col, max(at, smoothstep(0.0, 3.0, sb)));
                float pat = dot(base, vec3(0.299, 0.587, 0.114)) / 0.36;                          // (a textura de pixel da água: o desenho fica, a cor é outra)
                col *= mix(1.0, clamp(pat, 0.82, 1.18), 0.55);
                col = mix(col, vec3(0.42, 0.46, 0.32), (1.0 - at) * (1.0 - smoothstep(0.0, 1.6, sb)) * 0.45);      // (lago natural: a beira barrenta)
                float ph = (clk.r + clk.b * 255.0) * 0.8;
                float gl = wNoise(q * 0.9 + vec2(ph * 0.6, ph * 0.25)) * wNoise(q * 2.3 - vec2(ph * 0.3, -ph * 0.5));
                col += vec3(0.85, 0.9, 0.85) * smoothstep(0.42, 0.62, gl) * 0.09;
                return col;
            }
            // Ondulação suave da praia: a beira — e com ela todas as linhas da orla (espuma na areia, lâmina d'água, linha de onda, raso) —
            // entra e sai devagar ao longo da praia (ondas de ~8 e ~12 u, até ~0,45 u). O deslocamento é o do ponto da BEIRA mais perto
            // (q − n·s, n = para onde o mar fica), então tudo que está na mesma perpendicular à beira anda junto: as linhas continuam
            // paralelas entre si, só a praia deixa de ser régua.
            float shoreWobble(vec2 q, float s) {
                vec2 g = vec2(shoreDist(q + vec2(1.0, 0.0)) - shoreDist(q - vec2(1.0, 0.0)), shoreDist(q + vec2(0.0, 1.0)) - shoreDist(q - vec2(0.0, 1.0)));
                float l = length(g);
                if (l < 0.05) return 0.0;
                vec2 p = q - g / l * s;
                return 0.3 * sin(dot(p, vec2(0.43, 0.31)) + 1.3) + 0.16 * sin(dot(p, vec2(-0.52, 0.61)) + 4.1);
            }
            // RENDA da espuma: a rede de bordas entre bolhas (células de Voronoi, F2 − F1) que ferve devagar com a onda; 1 no fio, 0 no
            // miolo da bolha.
            vec2 wHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
            float wLace(vec2 p, float ph) {
                vec2 i = floor(p), f = fract(p);
                float d1 = 8.0, d2 = 8.0;
                for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
                    vec2 g = vec2(float(x), float(y)), h = wHash2(i + g);
                    vec2 r = g + 0.5 + 0.38 * sin(6.2832 * (ph + h)) - f;
                    float d = dot(r, r);
                    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
                }
                return 1.0 - smoothstep(0.0, 0.42, sqrt(d2) - sqrt(d1));
            }
            // s = distância na grade de pixels (espuma, pixel art) | sb = distância sem grade (degradê suave, "borrado")
            // A onda (7,4 s): três vagas de água branca chegam pela arrebentação (frente nítida para a praia, rabo esgarçado para o mar),
            // a da frente sobe na areia (rápido) e desce (devagar) — a espuma da ponta vai se desfazendo e o ponto mais alto fica marcado
            // por um fio que some enquanto a água volta. Cada onda tem o seu alcance (o mesmo em toda a praia: as linhas continuam
            // paralelas e juntas); a renda e a força (mais cheia aqui, mais rala ali) é que variam de lugar para lugar.
            vec3 shoreColor(vec3 sea, vec3 ground, vec2 q, float s, float sb) {
                vec4 clk = texture2D(shoreClock, vec2(0.1, 0.5)), c1 = texture2D(shoreClock, vec2(0.3, 0.5));
                vec3 shallow = vec3(0.373, 0.769, 0.753), mid = vec3(0.243, 0.624, 0.706), foamC = vec3(0.98, 0.995, 1.0);
                float M = c1.b * 2.5, ph = clk.r;
                float big = 0.78 + 0.42 * wHash(vec2(floor(clk.b * 255.0 + 0.5), 3.1));
                float Rm = (1.5 + 0.8 * min(M, 2.0)) * big;                                          // até onde esta onda sobe (u)
                float up = 0.3, upk = 1.0 - smoothstep(up, up + 0.28, ph);
                float reach = ph < up ? Rm * (1.0 - (1.0 - ph / up) * (1.0 - ph / up)) : Rm * (1.0 - smoothstep(0.0, 1.0, (ph - up) / (1.0 - up)));
                float tex = 0.55 * wLace(q * 0.85, ph) + 0.3 * wLace(q * 2.4 + 7.3, ph + 0.37) + 0.15 * wNoise(q * 6.0);
                float brk = 0.68 + 0.32 * wNoise(q * 0.09 + 3.0);
                float pw = 0.07;
                float rho = 0.0;
                vec3 col;
                if (sb <= 0.0) {
                    float L = -s, Lb = -sb;
                    float wet = 1.0 - smoothstep(0.0, Rm + 1.0, Lb);                                  // areia molhada até onde a onda vai
                    vec3 g = ground * (1.0 - 0.25 * wet * wet);
                    float a = 1.0 - smoothstep(reach - 0.6, reach + 0.04, Lb);                        // lâmina d'água: some (transparente) na ponta
                    col = mix(g, shallow, min(1.0, a * (1.0 - 0.38 * smoothstep(0.0, Rm, Lb)) + 0.15 * (1.0 - smoothstep(0.0, 0.8, Lb))));    // (= o lado do mar em s = 0)
                    float x = reach - L;                                                              // > 0: atrás da ponta, dentro d'água
                    rho = smoothstep(-0.06, 0.04, x) * exp(-max(x, 0.0) / 0.55) * (0.3 + 0.95 * upk);
                    rho += 1.6 * upk * smoothstep(-0.06, 0.0, x) * (1.0 - smoothstep(0.08, 0.2, x)) * smoothstep(0.7, 0.84, brk);      // a borda da ponta, cheia (com falhas)
                    float pk = 1.0 - smoothstep(0.0, 0.17, abs(L - Rm * 0.97));                       // o fio do ponto mais alto
                    rho = max(rho, pk * smoothstep(up - 0.02, up + 0.06, ph) * (1.0 - smoothstep(up + 0.04, 0.95, ph)) * 0.8);
                    rho = max(rho, a * 0.3 * smoothstep(up, up + 0.2, ph));                           // espuma solta na água que desce
                    rho *= brk;
                } else {
                    float k = 1.0 - smoothstep(-0.5, 8.0, sb); k = k * k * (3.0 - 2.0 * k);           // raso: some mar adentro em degradê suave
                    vec3 sh = mix(shallow, mid, smoothstep(0.5, 4.5, sb));
                    col = mix(sea, sh, min(1.0, k * 0.85 + 0.15 * (1.0 - smoothstep(0.0, 0.8, sb))));
                    for (int n = 0; n < 3; n++) {                                                     // as vagas da arrebentação
                        float fn = float(n), pos = (fn + 1.0 - ph) * 2.4, xk = s - pos;
                        float b = smoothstep(-0.07, 0.03, xk) * exp(-max(xk, 0.0) / (0.45 + 0.3 * fn));
                        float edge = smoothstep(-0.08, 0.0, xk) * (1.0 - smoothstep(0.1, 0.24, xk)) * smoothstep(0.7, 0.84, brk);      // frente da vaga: branca e cheia
                        rho = max(rho, (b * (1.15 - 0.2 * fn) + 1.6 * edge) * (1.0 - smoothstep(4.4, 7.3, pos)));
                    }
                    rho = max(rho, exp(-(s + reach) / 0.55) * (0.3 + 0.95 * upk));                   // o rabo da subida (a ponta já está na areia)
                    rho = max(rho, 0.2 * (1.0 - smoothstep(0.8, 6.5, s)));                            // espuma boiando entre as vagas
                    rho *= brk * min(1.0, 0.75 + M * 0.3);
                }
                float foam = wStep(1.0 - rho, tex, pw) * (0.8 + 0.2 * min(1.0, rho * 1.5));         // rala = só os fios mais fortes da renda
                return mix(col, foamC, clamp(foam, 0.0, 1.0) * 0.97);
            }`;
        return class WaterPlugin extends BABYLON.MaterialPluginBase {
            constructor(material, mode) {
                super(material, 'Water', 310, { SHORE_SEA: false, SHORE_LAND: false, SHORE_GROUND: false });
                this._mode = mode;
                this._enable(true);
            }
            getClassName() { return 'WaterPlugin'; }
            // SHORE_GROUND (só o mar): onde a beira suavizada entra numa célula de mar, o chão é o mesmo do terreno (TerrainSplat), não
            // uma cor lisa de areia
            _ground() { return this._mode === 'sea' && typeof TerrainSplat !== 'undefined' && !!TerrainSplat.glsl; }
            prepareDefines(defines) { defines.SHORE_SEA = this._mode === 'sea'; defines.SHORE_LAND = this._mode === 'land'; defines.SHORE_GROUND = this._ground(); }
            getSamplers(samplers) { samplers.push('shoreField', 'shoreClock'); if (this._ground()) samplers.push('splatMap', 'splatAtlas', 'splatAtlas2'); }
            getUniforms() { return { ubo: [{ name: 'wSmooth', size: 1, type: 'float' }], fragment: 'uniform float wSmooth;' }; }
            bindForSubMesh(ub) {
                ub.setTexture('shoreField', Water.field); ub.setTexture('shoreClock', Water.clock); ub.updateFloat('wSmooth', typeof Smooth !== 'undefined' && Smooth.on ? 1 : 0);
                if (this._ground()) { ub.setTexture('splatMap', TerrainSplat.tex.map); ub.setTexture('splatAtlas', TerrainSplat.tex.atlas); ub.setTexture('splatAtlas2', TerrainSplat.tex.atlas2 || TerrainSplat.tex.atlas); }
            }
            getCustomCode(shaderType) {
                if (shaderType !== 'fragment') return null;
                return {
                    CUSTOM_FRAGMENT_DEFINITIONS: `
                        #if defined(SHORE_SEA) || defined(SHORE_LAND)
                        ${GLSL}
                        #endif
                        #ifdef SHORE_GROUND
                        #define tSmooth wSmooth
                        ${this._ground() ? TerrainSplat.glsl : ''}
                        #endif`,
                    CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
                        #if defined(SHORE_SEA) || defined(SHORE_LAND)
                        {
                            vec2 q = wSmooth > 0.5 ? vPositionW.xz : (floor(vPositionW.xz * 20.0) + 0.5) / 20.0;     // grade de pixels do mundo (pixel art)
                            float s = shoreDist(q), sb = shoreDist(vPositionW.xz);
                            vec2 lk = shoreLake(vPositionW.xz);
                            #ifdef SHORE_SEA
                            vec3 water0 = baseColor.rgb;
                            float sw = smoothstep(0.8, 7.0, sb) * (1.0 - lk.x);                    // (na beira a ondulação vira a orla, e o lago é parado)
                            if (sw > 0.0) baseColor.rgb = swellColor(baseColor.rgb, q, sw);
                            if (s < ${R} - 0.5 && lk.x < 0.999) {
                                float wob = shoreWobble(q, s);
                                vec3 gr = vec3(0.80, 0.70, 0.49);
                                #ifdef SHORE_GROUND
                                if (sb + wob <= 0.0) gr = terrainColor(q);                         // (o chão de verdade, como no terreno ao lado)
                                #endif
                                baseColor.rgb = shoreColor(baseColor.rgb, gr, q, s + wob, sb + wob);
                            }
                            if (lk.x > 0.001) baseColor.rgb = mix(baseColor.rgb, lakeColor(water0, q, sb, lk.y), lk.x);
                            #else
                            vec3 ground0 = baseColor.rgb;
                            if (s > -5.0 && vPositionW.y < 0.4 && lk.x < 0.999) { float wob = shoreWobble(q, s); if (s + wob > -4.5) baseColor.rgb = shoreColor(vec3(0.17, 0.41, 0.54), baseColor.rgb, q, s + wob, sb + wob); }
                            if (lk.x > 0.001 && s > -4.0 && vPositionW.y < 0.4) {                 // a beira do lago: terra molhada e, depois da linha d'água, a água doce
                                float wet = 1.0 - smoothstep(0.0, 2.2, -sb);
                                vec3 g = ground0 * (1.0 - 0.22 * wet * (1.0 - lk.y));
                                g = mix(g, lakeColor(vec3(0.17, 0.41, 0.54), q, max(sb, 0.0), lk.y), smoothstep(-0.15, 0.35, sb));
                                baseColor.rgb = mix(baseColor.rgb, g, lk.x);
                            }
                            #endif
                        }
                        #endif`,
                };
            }
        };
    },
};
