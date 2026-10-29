// ============================================================================
// TireTracks — RASTRO DE PNEU na grama e na areia: carro, moto e bicicleta deixam a marca das rodas por onde passam fora do asfalto.
//   • areia: o sulco afundado com o desenho da banda (blocos em V do carro, cravos da moto, pontinhos da bicicleta) e a areia
//     empurrada para os lados, num montinho mais claro; as paredes do sulco e o montinho pegam luz e sombra do sol;
//   • grama: a faixa amassada (mais clara e amarelada, folhas deitadas no sentido do pneu) com terra arrancada pelos blocos da banda —
//     na chuva (ou no brejo) vira lama;
//   • derrapando ou arrancando forte no chão mole o rastro alarga e levanta poeira (e não fica a marca preta de borracha do asfalto).
// O rastro vai sumindo aos poucos (grama ~45 s, areia ~70 s): o montinho assenta, a grama levanta.
//
// Um lote único (uma malha, um desenho), como as derrapagens (SkidMarks) e as pegadas (Footprints): anel de N trechos (quads) — o mais
// antigo é reaproveitado. Os trechos de uma roda são emendados (o começo de um é o fim do anterior): sem fresta nem sobreposição nas
// curvas. Cada vértice guarda a hora em que nasceu, o chão, a força, a umidade e o pneu; o shader desenha e apaga — nada de CPU por trecho.
// A cor é MODULADA (2 × origem × destino): o rastro escurece e clareia o chão que já está lá — combina com qualquer grama ou areia,
// de dia, de noite e na chuva, sem pintar cor nenhuma por cima.
//
// O Vehicle chama `vehicle(car, fx, fz, k)` a cada quadro (k = força da derrapagem); Game.update chama `update(dt)`.
// ============================================================================

const TireTracks = {
    N: 2400,            // trechos no anel (~2400 × 0,3 m = 720 m de rastro)
    LIFE: [45, 70],     // segundos até sumir: grama, areia
    SEG: 0.3,           // comprimento de um trecho (m)
    WR: 1.45,           // meia-largura do quad ÷ meia-largura do pneu (o resto é o montinho de areia empurrada)
    time: 0,
    mesh: null,
    focus: null,
    _surf: new Map(),   // cache do chão por célula de 0,5 m

    init(scene) {
        if (this.mesh && this.scene === scene) return;
        this.scene = scene;
        const N = this.N;
        this.pos = new Float32Array(N * 12);
        this.col = new Float32Array(N * 16);
        this.uv = new Float32Array(N * 8);
        this.uv2 = new Float32Array(N * 8);
        this.uv3 = new Float32Array(N * 8);
        for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) this.col[i * 16 + k * 4] = -1e4;      // nascidos "há muito tempo": invisíveis
        const idx = new Uint32Array(N * 6);
        for (let i = 0; i < N; i++) { const b = i * 4, o = i * 6; idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b + 2; idx[o + 4] = b + 1; idx[o + 5] = b + 3; }
        const mesh = new BABYLON.Mesh('tireTracks', scene), vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.colors = this.col; vd.uvs = this.uv; vd.uvs2 = this.uv2; vd.uvs3 = this.uv3; vd.indices = idx;
        vd.applyToMesh(mesh, true);
        if (!BABYLON.Effect.ShadersStore.tireTrackVertexShader) {
            BABYLON.Effect.ShadersStore.tireTrackVertexShader = `
                precision highp float;
                attribute vec3 position;
                attribute vec4 color;            // r = nascimento (s), g = chão (0 grama, 1 areia), b = força (0..1), a = semente
                attribute vec2 uv;               // x = metros ao longo do rastro, y = -1..1 de través
                attribute vec2 uv2;              // luz: (eixo de través · sol) e (eixo ao longo · sol), divididos pela altura do sol
                attribute vec2 uv3;              // x = umidade (0 seco .. 1 lama), y = pneu (0 carro, 1 moto, 2 bicicleta) + meia-largura (m)
                uniform mat4 worldViewProjection;
                uniform float time;
                uniform vec2 life;
                varying float vA;
                varying float vAge;
                varying float vS;
                varying float vSeed;
                varying vec2 vUV;
                varying vec2 vLit;
                varying vec2 vTire;
                void main(void) {
                    float age = time - color.r, L = mix(life.x, life.y, color.g);
                    vA = color.b * (1.0 - smoothstep(L * 0.5, L, age)) * step(0.0, age);
                    vAge = clamp(age / L, 0.0, 1.0);
                    vS = color.g; vSeed = color.a; vUV = uv; vLit = uv2; vTire = uv3;
                    gl_Position = worldViewProjection * vec4(position, 1.0);
                }`;
            BABYLON.Effect.ShadersStore.tireTrackFragmentShader = `
                precision highp float;
                varying float vA;
                varying float vAge;
                varying float vS;
                varying float vSeed;
                varying vec2 vUV;
                varying vec2 vLit;
                varying vec2 vTire;
                uniform float wr;
                uniform float mode;
                float h1(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
                float vn(vec2 p) {
                    vec2 i = floor(p), f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
                }
                // Banda do pneu em (metros ao longo, -1..1 de través na largura do pneu): 1 = bloco de borracha (afunda), 0 = vão entre blocos.
                float tread(float u, float t, float type) {
                    if (type < 0.5) {
                        float b = smoothstep(0.14, 0.26, abs(fract(u * 11.0 + abs(t) * 1.7) - 0.5));
                        return b * smoothstep(0.06, 0.14, abs(abs(t) - 0.42));
                    }
                    if (type < 1.5) {
                        vec2 f = abs(fract(vec2(u * 13.0 + step(0.0, t) * 0.5, t * 1.5 + 0.5)) - 0.5);
                        return 1.0 - smoothstep(0.2, 0.3, max(f.x, f.y * 0.8));
                    }
                    return 0.55 + 0.45 * smoothstep(0.32, 0.18, abs(fract(u * 26.0) - 0.5));
                }
                // Altura da areia (1 = fundura do sulco): sulco com o desenho da banda e o montinho dos lados.
                float sandH(vec2 p, float type, float k) {
                    float a = abs(p.y) * wr, t = clamp(p.y * wr, -1.0, 1.0);
                    float g = 1.0 - smoothstep(0.8, 1.02, a);
                    float b = smoothstep(0.9, 1.1, a) * (1.0 - smoothstep(1.1, wr, a));
                    return -g * (0.68 + 0.32 * tread(p.x, t, type)) + b * k * (0.3 + 0.35 * vn(vec2(p.x * 5.0, p.y * 4.0 + vSeed)));
                }
                void main(void) {
                    if (vA < 0.01) discard;
                    float type = floor(vTire.y + 0.001), hw = fract(vTire.y + 0.001) * wr, wet = vTire.x;
                    float a = abs(vUV.y) * wr, t = clamp(vUV.y * wr, -1.0, 1.0);
                    vec3 M;
                    if (vS > 0.5) {
                        // AREIA: relevo (diferença finita) iluminado pelo sol; o sulco escurece (areia compactada, úmida por baixo).
                        float amp = 1.0 - 0.55 * vAge, k = 1.0 - 0.5 * vAge;
                        float du = 0.012, dv = 0.012 / hw;
                        float H = sandH(vUV, type, k), Hu = sandH(vUV + vec2(du, 0.0), type, k), Hv = sandH(vUV + vec2(0.0, dv), type, k);
                        float depth = (type < 1.5 ? 0.022 : 0.01) * amp;                                   // fundura em metros
                        float sC = (Hv - H) / 0.012 * depth, sA = (Hu - H) / du * depth;
                        float rel = 1.0 - clamp(sC * vLit.x + sA * vLit.y, -0.6, 0.6) * 1.3;
                        float groove = 1.0 - smoothstep(0.8, 1.02, a);
                        float ao = 1.0 - groove * (0.13 + 0.12 * wet) * amp + 0.05 * max(H, 0.0);
                        M = vec3(rel * ao);
                        M *= mix(vec3(1.0), vec3(0.97, 0.95, 0.92), groove * amp);                     // (a areia de baixo é mais "fria")
                    } else {
                        // GRAMA: faixa amassada (folhas deitadas, mais claras e amarelas) + terra/lama arrancada pelos blocos da banda.
                        float band = 1.0 - smoothstep(0.82, 1.05, a), edge = smoothstep(0.7, 0.95, a) * (1.0 - smoothstep(0.95, 1.25, a));
                        float rec = 1.0 - 0.6 * vAge;                                                     // a grama levanta aos poucos
                        float st = vn(vec2(vUV.x * 2.5 + vSeed, vUV.y * wr * 4.0)) * 0.6 + h1(floor(vec2(vUV.x * 38.0, vUV.y * wr * 8.0 + vSeed * 7.0))) * 0.4;
                        float tr = tread(vUV.x, t, type);
                        vec3 flat_ = mix(vec3(1.3, 1.25, 0.92), vec3(0.86, 0.84, 0.8), wet * 0.6) * (0.88 + 0.2 * st) * (0.84 + 0.18 * tr);
                        float dig = tr * smoothstep(0.42 - 0.3 * wet, 0.64 - 0.3 * wet, vn(vec2(vUV.x * 7.0 + vSeed * 3.0, t * 2.0)));
                        vec3 mud = mix(vec3(0.8, 0.62, 0.5), vec3(0.58, 0.46, 0.4), wet);
                        M = mix(vec3(1.0), flat_, band * rec);
                        M *= mix(vec3(1.0), mud, dig * band * rec * 0.9);
                        M *= 1.0 - 0.28 * edge * rec;
                    }
                    // mode 2: mistura 2 × origem × destino (0,5 = não muda o chão)  |  mode 1: só multiplica (reserva: escurece)
                    vec3 o = mode > 1.5 ? mix(vec3(0.5), 0.5 * M, vA) : mix(vec3(1.0), min(M, vec3(1.0)), vA);
                    gl_FragColor = vec4(o, 1.0);
                }`;
        }
        const m = new BABYLON.ShaderMaterial('tireTrackMat', scene, { vertex: 'tireTrack', fragment: 'tireTrack' }, {
            attributes: ['position', 'color', 'uv', 'uv2', 'uv3'], uniforms: ['worldViewProjection', 'time', 'life', 'wr', 'mode'], needAlphaBlending: true,
        });
        m.setVector2('life', new BABYLON.Vector2(this.LIFE[0], this.LIFE[1]));
        m.setFloat('wr', this.WR);
        m.disableDepthWrite = true;
        m.backFaceCulling = false;
        // Mistura "2 × origem × destino": o Babylon não tem esse modo — o material usa um modo que ninguém mais usa (INTERPOLATE) e,
        // logo antes de desenhar, troca a função de mistura (o próximo material com outro modo a reconfigura sozinho).
        const eng = scene.getEngine(), gl = eng._gl, st = eng._alphaState;
        if (gl && st && st.setAlphaBlendFunctionParameters) {
            m.alphaMode = BABYLON.Constants.ALPHA_INTERPOLATE;
            mesh.onBeforeDrawObservable.add(() => { st.setAlphaBlendFunctionParameters(gl.DST_COLOR, gl.SRC_COLOR, gl.ZERO, gl.ONE); st.alphaBlend = true; });
            m.setFloat('mode', 2);
        } else {
            m.alphaMode = BABYLON.Constants.ALPHA_MULTIPLY;
            m.setFloat('mode', 1);
        }
        mesh.material = m;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.doNotSyncBoundingInfo = true;
        // Como as pegadas: depois do mundo (grupo 1, testando a profundidade) — a água da orla não cobre o rastro; antes das pegadas.
        mesh.renderingGroupId = 1;
        mesh.alphaIndex = -110;
        scene.setRenderingAutoClearDepthStencil(1, false);
        mesh.isVisible = false;                                   // (aparece com o 1º trecho)
        this.mesh = mesh; this.mat = m;
        this._vb = ['position', 'color', 'uv', 'uv2', 'uv3'].map((k) => mesh.getVertexBuffer(k));
        this._ar = [this.pos, this.col, this.uv, this.uv2, this.uv3];
        this.next = 0; this._a = Infinity; this._b = -1; this._wrap = false;
        this.time = 0;
        // Luz: a direção do sol no chão, dividida pela altura dele (a inclinação vezes isso = quanto a face clareia ou escurece).
        const d = Config.light.sunDir, l = Math.hypot(d[0], d[1], d[2]), up = Math.max(0.2, -d[1] / l);
        this._L = [-d[0] / l / up, -d[2] / l / up];
    },

    // Chão em (x, z): 0 nada (asfalto, calçada, terra, água), 1 grama, 2 areia, 3 lama (brejo); +4 = quarteirão da cidade (o chão fica na
    // altura da calçada). Cache por célula de 0,5 m.
    surface(x, z) {
        const k = Math.floor(x * 2) * 100003 + Math.floor(z * 2), c = this._surf.get(k);
        if (c !== undefined) return c;
        let s = 0;
        if (MapGeo.waterDepth(x, z) <= 0 && !RoadPlan.onPavement(x, z)) {
            const blk = CityGrid._blockAtPoint ? CityGrid._blockAtPoint(x, z) : null;
            if (blk) {
                const g = (CityGrid.BIOMES[blk.biome] || {}).ground, b = blk.slab;
                const inside = blk.poly ? RoadPlan.inPoly(blk.poly, x, z) && RoadPlan.polyDist(blk.poly, x, z) > 0.4
                    : x > b[0] + 0.4 && x < b[2] - 0.4 && z > b[1] + 0.4 && z < b[3] - 0.4;
                if (blk.open && !blk.organic && inside) s = g === 'grass' ? 5 : g === 'sand' ? 6 : 0;
            } else if (typeof WorldMap !== 'undefined' && WorldMap.biomeAt) {
                const B = WorldMap.B, v = WorldMap.biomeAt(x, z);
                s = v === B.SAND ? 2 : v === B.SWAMP ? 3 : (v === B.GRASS || v === B.FOREST || v === B.SCRUB || v === B.FARM) ? 1 : 0;
            }
        }
        if (this._surf.size > 60000) this._surf.clear();
        this._surf.set(k, s);
        return s;
    },

    // Rodas do veículo no chão mole: rastro (e poeira). Devolve true se alguma roda está na grama ou na areia (sem marca de borracha).
    vehicle(car, fx, fz, slip = 0) {
        if (!this.mesh) return false;
        const P = car.position, F = this.focus, S = car._tt || (car._tt = []);
        if (!F || Math.abs(P.x - F.x) > 70 || Math.abs(P.z - F.z) > 70 || (car.elev || 0) > 0.05) { for (const s of S) if (s) s.on = false; return false; }
        const rx = fz, rz = -fx, sp = car.speed || 0;
        let soft = false;
        if (car.isBike) {
            const bike = car.spec.bike === 'bike', b = car.halfLen * 0.55;
            soft = this._wheel(S, 0, P.x - fx * b, P.z - fz * b, bike ? 2 : 1, bike ? 0.035 : 0.065, bike ? 0.9 : 0.95, slip);
        } else {
            const m = car.visual && car.visual.tire, tz = m ? m.z : car.halfLen * 0.6, tx = m ? m.x : car.halfW * 0.75;
            const hw = m && m.wid ? Math.min(0.2, Math.max(0.08, m.wid / 2)) : Math.min(0.16, Math.max(0.09, car.halfW * 0.13));
            for (let w = 0; w < 2; w++) {
                const s = w ? 1 : -1;
                if (this._wheel(S, w, P.x - fx * tz + rx * tx * s, P.z - fz * tz + rz * tx * s, 0, hw, 1, slip)) soft = true;
            }
        }
        // poeira: derrapando ou arrancando forte na areia ou na terra
        if (soft && slip > 0.3 && sp > 2 && Math.random() < slip * 0.5) {
            const g = car.game || (typeof SkidMarks !== 'undefined' && SkidMarks.game), P2 = g && g.carLights && g.carLights.puffs, w = S[0];
            if (P2 && w) {
                const v = car.velocity, a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.6, sand = (w.c & 3) === 2;
                P2.emit(w.x, 0.15 + w.y, w.z, v.x * 0.2 + Math.cos(a) * r, 0.25 + Math.random() * 0.3, v.z * 0.2 + Math.sin(a) * r,
                    0.35, 1.4 + slip * 1.6, 1.1 + Math.random() * 0.8, 0.12 + slip * 0.12, sand ? this.DUST_SAND : this.DUST_SOIL);
            }
        }
        return soft;
    },
    DUST_SAND: [0.86, 0.78, 0.62],
    DUST_SOIL: [0.56, 0.47, 0.36],

    // Uma roda em (x, z): a cada SEG metros, um trecho emendado no anterior (se o chão é mole nas duas pontas).
    _wheel(S, w, x, z, type, hw, k, slip) {
        const s = S[w] || (S[w] = { x, z, y: 0, on: false, c: 0, d: Math.random() * 64, lx: 0, lz: 0, rx: 0, rz: 0 });
        const dx = x - s.x, dz = z - s.z, d2 = dx * dx + dz * dz;
        if (d2 < this.SEG * this.SEG) return s.on;
        s.x = x; s.z = z;
        if (d2 > 9) { s.on = false; return false; }                       // salto (teleporte, quadro muito longo): recomeça
        const c = this.surface(x, z), l = Math.sqrt(d2), ax = dx / l, az = dz / l;
        const W = hw * (1 + 0.7 * Math.min(1, slip)) * this.WR, nx = az * W, nz = -ax * W;      // derrapando, o rastro alarga
        if (!c) { s.on = false; return false; }
        const y = c & 4 ? Config.city.curbHeight + 0.025 : 0.035;
        if (!s.on || s.c !== c) {                                        // começo do rastro (ou troca de chão): só marca a borda inicial
            s.on = true; s.c = c; s.y = y;
            s.lx = x + nx; s.lz = z + nz; s.rx = x - nx; s.rz = z - nz;
            return true;
        }
        const W2 = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0, wet = (c & 3) === 3 ? Math.max(0.8, W2) : Math.min(1, W2 * 1.3);
        const u0 = s.d, u1 = u0 + l;
        s.d = u1 >= 512 ? u1 - 512 : u1;                                  // (512 m: múltiplo de todos os desenhos da banda)
        const i = this.next, o = i * 12, q = i * 16, e = i * 8, p = this.pos, C = this.col, t = this.time;
        const L = this._L, litC = (az * L[0] - ax * L[1]), litA = (ax * L[0] + az * L[1]);
        p[o] = s.lx; p[o + 1] = y; p[o + 2] = s.lz;
        p[o + 3] = s.rx; p[o + 4] = y; p[o + 5] = s.rz;
        p[o + 6] = x + nx; p[o + 7] = y; p[o + 8] = z + nz;
        p[o + 9] = x - nx; p[o + 10] = y; p[o + 11] = z - nz;
        this.uv.set([u0, 1, u0, -1, u1, 1, u1, -1], e);
        this.uv2.set([litC, litA, litC, litA, litC, litA, litC, litA], e);
        const tw = type + Math.min(0.49, W / this.WR), sand = (c & 3) === 2 ? 1 : 0, kk = Math.min(1, k * (0.85 + 0.3 * Math.min(1, slip))), seed = (w * 13.7 + (i % 97) * 0.37) % 31;
        for (let v = 0; v < 4; v++) {
            C[q + v * 4] = t; C[q + v * 4 + 1] = sand; C[q + v * 4 + 2] = kk; C[q + v * 4 + 3] = seed;
            this.uv3[e + v * 2] = wet; this.uv3[e + v * 2 + 1] = tw;
        }
        s.lx = x + nx; s.lz = z + nz; s.rx = x - nx; s.rz = z - nz; s.y = y;
        if (i < this._a) this._a = i;
        if (i > this._b) this._b = i;
        this.next = (i + 1) % this.N;
        if (this.next === 0) this._wrap = true;
        this.mesh.isVisible = true;
        return true;
    },

    // Relógio do shader + envio do que foi escrito neste quadro.
    update(dt) {
        if (!this.mesh) return;
        this.time += dt;
        this.mat.setFloat('time', this.time);
        if (this._b < 0) return;
        let a = this._a, b = this._b + 1;
        if (this._wrap) { a = 0; b = this.N; this._wrap = false; }        // deu a volta no anel no meio do quadro: manda tudo
        const per = [12, 16, 8, 8, 8];
        for (let j = 0; j < 5; j++) this._vb[j].updateDirectly(this._ar[j].subarray(a * per[j], b * per[j]), a * per[j]);
        this._a = Infinity; this._b = -1;
    },
};
