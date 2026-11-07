// ============================================================================
// MeshBatch — acumula quads no espaço de mundo e gera UMA malha mesclada.
// Cidade inteira = poucas malhas (1 por material) => poucos draw calls.
//
// Convenção dos cantos de um quad: A=TL, B=TR, C=BL, D=BR como vistos DE FORA
// da face (mesma ordem de índices do CreateGround do Babylon).
// UVs são calculadas em coordenadas de mundo pelo chamador (texturas contínuas).
// ============================================================================

class MeshBatch {
    constructor() {
        this.pos = [];
        this.nor = [];
        this.uv = [];
        this.col = [];
        this.idx = [];
    }

    get empty() { return this.idx.length === 0; }

    // RELEVO (map/Relief.js): enquanto MeshBatch.anchor = { h } estiver posto, o que os construtores empilham é uma CONSTRUÇÃO — no build,
    // ela sobe `h` INTEIRA, rígida (nenhuma parede estica: a casa tem as proporções de sempre; o pé dela é resolvido por quem a constrói —
    // pilares e viga de borda, WorldBuilder._footing). Sem âncora, cada vértice sobe a altura do chão embaixo dele.
    static anchor = null;
    static _BARY = [[0.5, 0.5], [0, 0.5], [0.5, 0], [1 / 3, 1 / 3], [2 / 3, 1 / 6], [1 / 6, 2 / 3], [1 / 6, 1 / 6], [0.25, 0.75], [0.75, 0], [0, 0.25]];
    _anc(n) {
        const A = MeshBatch.anchor;
        if (!A && !this.anc) return;
        if (!this.anc) this.anc = new Array(this.pos.length / 3 - n).fill(NaN);
        for (let k = 0; k < n; k++) this.anc.push(A ? A.h : NaN);
    }

    // a,b,c,d: [x,y,z] | n: normal | uvs: [[u,v] x4] | color: [r,g,b] opcional (vertex color).
    // color: [r,g,b] para os 4 cantos, ou [[r,g,b] x4] (um por canto A,B,C,D) para degradês (sombreado do relevo).
    quad(a, b, c, d, n, uvs, color = [1, 1, 1]) {
        const base = this.pos.length / 3;
        const per = Array.isArray(color[0]);
        // (sem `for (const p of [a, b, c, d])`: o array e o iterador eram lixo a cada quad — milhares por pedaço de terreno)
        this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
        this._anc(4);
        for (let k = 0; k < 4; k++) {
            this.nor.push(n[0], n[1], n[2]);
            const c4 = per ? color[k] : color;
            this.col.push(c4[0], c4[1], c4[2], c4.length > 3 ? c4[3] : 1);
            this.uv.push(uvs[k][0], uvs[k][1]);
        }
        this.idx.push(base + 3, base + 1, base, base + 2, base + 3, base);
    }

    // Triângulo orientado: a face visível aponta para `n` (troca b/c se preciso). uvs: [[u,v] x3]. color: [r,g,b(,a)] ou uma por vértice.
    tri(a, b, c, n, uvs, color = [1, 1, 1]) {
        const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
        const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const facing = -(cx * n[0] + cy * n[1] + cz * n[2]);          // a face visível tem normal = -cross(b-a, c-a)
        const per = Array.isArray(color[0]);
        if (facing < 0) { [b, c] = [c, b]; uvs = [uvs[0], uvs[2], uvs[1]]; if (per) color = [color[0], color[2], color[1]]; }
        const base = this.pos.length / 3;
        this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        this._anc(3);
        for (let k = 0; k < 3; k++) {
            const ck = per ? color[k] : color;
            this.nor.push(n[0], n[1], n[2]);
            this.col.push(ck[0], ck[1], ck[2], ck.length > 3 ? ck[3] : 1);
            this.uv.push(uvs[k][0], uvs[k][1]);
        }
        this.idx.push(base, base + 1, base + 2);
    }

    // Face de cima. uvFn(x, z) -> [u, v] (em unidades de tile).
    top(x0, z0, x1, z1, y, uvFn, color) {
        this.quad(
            [x0, y, z1], [x1, y, z1], [x0, y, z0], [x1, y, z0], [0, 1, 0],
            [uvFn(x0, z1), uvFn(x1, z1), uvFn(x0, z0), uvFn(x1, z0)], color
        );
    }

    // Quatro paredes de um prisma de y0 a y1. uvFn(s, y, face) -> [u, v],
    // onde s = distância ao longo da parede, crescendo para a direita de quem olha de fora.
    walls(x0, z0, x1, z1, y0, y1, uvFn, color) {
        // Norte (z = z1, normal +z): a direita de quem olha é -x.
        this.quad([x1, y1, z1], [x0, y1, z1], [x1, y0, z1], [x0, y0, z1], [0, 0, 1],
            [uvFn(0, y1, 'n'), uvFn(x1 - x0, y1, 'n'), uvFn(0, y0, 'n'), uvFn(x1 - x0, y0, 'n')], color);
        // Sul (z = z0, normal -z): direita = +x.
        this.quad([x0, y1, z0], [x1, y1, z0], [x0, y0, z0], [x1, y0, z0], [0, 0, -1],
            [uvFn(0, y1, 's'), uvFn(x1 - x0, y1, 's'), uvFn(0, y0, 's'), uvFn(x1 - x0, y0, 's')], color);
        // Leste (x = x1, normal +x): direita = +z.
        this.quad([x1, y1, z0], [x1, y1, z1], [x1, y0, z0], [x1, y0, z1], [1, 0, 0],
            [uvFn(0, y1, 'e'), uvFn(z1 - z0, y1, 'e'), uvFn(0, y0, 'e'), uvFn(z1 - z0, y0, 'e')], color);
        // Oeste (x = x0, normal -x): direita = -z.
        this.quad([x0, y1, z1], [x0, y1, z0], [x0, y0, z1], [x0, y0, z0], [-1, 0, 0],
            [uvFn(0, y1, 'w'), uvFn(z1 - z0, y1, 'w'), uvFn(0, y0, 'w'), uvFn(z1 - z0, y0, 'w')], color);
    }

    // Caixa completa (topo + paredes) com UVs triviais — para peças de cor sólida.
    solid(x0, z0, x1, z1, y0, y1, color) {
        const uv0 = () => [0, 0];
        this.top(x0, z0, x1, z1, y1, uv0, color);
        this.walls(x0, z0, x1, z1, y0, y1, uv0, color);
    }

    // Cilindro em pé (caixa-d'água, tambor): `seg` faces laterais com a normal de cada uma e a tampa em leque. UVs triviais.
    cyl(cx, cz, r, y0, y1, color, seg = 8) {
        const uv = [[0, 0], [0, 0], [0, 0], [0, 0]], uv3 = [[0, 0], [0, 0], [0, 0]], P = [];
        for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; P.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, a]); }
        for (let i = 0; i < seg; i++) {
            const [ax, az] = P[i], [bx, bz] = P[i + 1], m = (P[i][2] + P[i + 1][2]) / 2, n = [Math.cos(m), 0, Math.sin(m)];
            // (de fora: A = P[i], B = P[i + 1] — a ordem do quad que a face de fora mostra)
            this.quad([ax, y1, az], [bx, y1, bz], [ax, y0, az], [bx, y0, bz], n, uv, color);
            this.tri([cx, y1, cz], [ax, y1, az], [bx, y1, bz], [0, 1, 0], uv3, color);
        }
    }

    // Tubo (tronco de cone) de `a` a `b` ([x, y, z]), raio r0 → r1, `seg` faces (sem tampas): poste, braço curvo, haste.
    tube(a, b, r0, r1, color, seg = 6) {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1, d = [dx / L, dy / L, dz / L];
        const h = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let u = [d[1] * h[2] - d[2] * h[1], d[2] * h[0] - d[0] * h[2], d[0] * h[1] - d[1] * h[0]];
        const ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul];
        const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]], uv3 = [[0, 0], [0, 0], [0, 0]];
        const ring = (c, r, t) => [c[0] + (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * r, c[1] + (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * r, c[2] + (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * r];
        for (let i = 0; i < seg; i++) {
            const t0 = i / seg * Math.PI * 2, t1 = (i + 1) / seg * Math.PI * 2, tm = (t0 + t1) / 2;
            const n = [u[0] * Math.cos(tm) + v[0] * Math.sin(tm), u[1] * Math.cos(tm) + v[1] * Math.sin(tm), u[2] * Math.cos(tm) + v[2] * Math.sin(tm)];
            const A = ring(a, r0, t0), B = ring(a, r0, t1), C = ring(b, r1, t1), D = ring(b, r1, t0);
            this.tri(A, B, C, n, uv3, color); this.tri(A, C, D, n, uv3, color);
        }
    }

    // Caixa girada no chão: centro (cx, cz), eixo (ux, uz) unitário, meio-comprimento hl e meia-largura hw na base (y0) e
    // hl1/hw1 no topo (y1) — o topo menor faz o chanfro (cabeçote de luminária, caixa de semáforo). bottom: desenha a face de baixo.
    obox(cx, cz, ux, uz, hl, hw, y0, y1, color, hl1 = hl, hw1 = hw, bottom = false) {
        const px = -uz, pz = ux, uv3 = [[0, 0], [0, 0], [0, 0]];
        const P = (l, w, y) => [cx + ux * l + px * w, y, cz + uz * l + pz * w];
        const b = [P(-hl, -hw, y0), P(hl, -hw, y0), P(hl, hw, y0), P(-hl, hw, y0)], t = [P(-hl1, -hw1, y1), P(hl1, -hw1, y1), P(hl1, hw1, y1), P(-hl1, hw1, y1)];
        const face = (q, n) => { this.tri(q[0], q[1], q[2], n, uv3, color); this.tri(q[0], q[2], q[3], n, uv3, color); };
        face(t, [0, 1, 0]);
        if (bottom) face(b, [0, -1, 0]);
        const N = [[-px, 0, -pz], [ux, 0, uz], [px, 0, pz], [-ux, 0, -uz]];      // lados: -w, +l, +w, -l
        face([b[0], b[1], t[1], t[0]], N[0]); face([b[1], b[2], t[2], t[1]], N[1]); face([b[2], b[3], t[3], t[2]], N[2]); face([b[3], b[0], t[0], t[3]], N[3]);
    }

    // Cria a malha no Babylon (já em coordenadas de mundo; transform congelado).
    // alwaysActive: false para malhas por pedaço (o frustum descarta as que estão fora da tela).
    // Subdivide os triângulos de CHÃO (deitados, sem âncora) maiores que `max` m onde o relevo varia: o piso passa a seguir a encosta.
    // A decisão é POR ARESTA (só dos dois vértices dela): a aresta maior que `max` em que o relevo foge da reta (amostras a 1/4, 1/2 e 3/4)
    // é partida ao meio — e o vizinho que divide a mesma aresta decide igual: sem "T" (o vértice novo de um lado e a aresta reta do
    // outro abriam frestas no chão, por onde aparecia o mar). Relevo que foge só no MIOLO (arestas retas): leque no centro, que não
    // mexe nas arestas. Antes eram 4 amostras por triângulo e a divisão em 4 — triângulo grande liso por cima de estrada cortada no
    // morro, e frestas entre os vizinhos.
    _tessellate(max) {
        const P = this.pos, N = this.nor, U = this.uv, C = this.col, A = this.anc, I = this.idx, out = [], R = Relief;
        const mids = new Map();
        const mid = (a, b) => {
            const key = a < b ? a * 4194304 + b : b * 4194304 + a;
            let v = mids.get(key);
            if (v !== undefined) return v;
            v = P.length / 3;
            for (let k = 0; k < 3; k++) { P.push((P[a * 3 + k] + P[b * 3 + k]) / 2); N.push(N[a * 3 + k]); }
            U.push((U[a * 2] + U[b * 2]) / 2, (U[a * 2 + 1] + U[b * 2 + 1]) / 2);
            for (let k = 0; k < 4; k++) C.push((C[a * 4 + k] + C[b * 4 + k]) / 2);
            if (A) A.push(NaN);
            mids.set(key, v);
            return v;
        };
        const cen = (a, b, c) => {
            const v = P.length / 3;
            for (let k = 0; k < 3; k++) { P.push((P[a * 3 + k] + P[b * 3 + k] + P[c * 3 + k]) / 3); N.push(N[a * 3 + k]); }
            U.push((U[a * 2] + U[b * 2] + U[c * 2]) / 3, (U[a * 2 + 1] + U[b * 2 + 1] + U[c * 2 + 1]) / 3);
            for (let k = 0; k < 4; k++) C.push((C[a * 4 + k] + C[b * 4 + k] + C[c * 4 + k]) / 3);
            if (A) A.push(NaN);
            return v;
        };
        // a aresta (a, b) precisa ser partida? (só depende dela: comprimento e o relevo ao longo)
        const ecache = new Map();
        const split = (a, b) => {
            const key = a < b ? a * 4194304 + b : b * 4194304 + a;
            let r = ecache.get(key);
            if (r !== undefined) return r;
            const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2];
            r = false;
            if (Math.hypot(bx - ax, bz - az) > max) {
                const ha = R.at(ax, az), hb = R.at(bx, bz);
                for (const t of [0.25, 0.5, 0.75]) if (Math.abs(R.at(ax + (bx - ax) * t, az + (bz - az) * t) - (ha + (hb - ha) * t)) > 0.05) { r = true; break; }
            }
            ecache.set(key, r);
            return r;
        };
        const stack = [];
        for (let t = 0; t < I.length; t += 3) stack.push(I[t], I[t + 1], I[t + 2], 0);
        while (stack.length) {
            const d = stack.pop(), c = stack.pop(), b = stack.pop(), a = stack.pop();
            const ay = P[a * 3 + 1], by = P[b * 3 + 1], cy = P[c * 3 + 1];
            const flat = Math.abs(ay - by) < 0.3 && Math.abs(ay - cy) < 0.3 && N[a * 3 + 1] > 0.85 && !(A && (A[a] === A[a] || A[b] === A[b] || A[c] === A[c]));
            if (!flat || d > 10) { out.push(a, b, c); continue; }
            const sab = split(a, b), sbc = split(b, c), sca = split(c, a), n = sab + sbc + sca;
            if (n === 3) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); stack.push(a, ab, ca, d + 1, ab, b, bc, d + 1, ca, bc, c, d + 1, ab, bc, ca, d + 1); continue; }
            if (n === 2) {                                                    // duas arestas: o canto entre elas fica num triângulo; o resto, dois
                const [p, q, r] = !sab ? [c, a, b] : !sbc ? [a, b, c] : [b, c, a];      // (q-r: a aresta que NÃO parte; p: o vértice oposto)
                const m1 = mid(r, p), m2 = mid(p, q);
                stack.push(p, m2, m1, d + 1, m2, q, r, d + 1, m2, r, m1, d + 1);
                continue;
            }
            if (n === 1) {                                                    // uma aresta: dois triângulos a partir do meio dela
                const [p, q, r] = sab ? [a, b, c] : sbc ? [b, c, a] : [c, a, b];       // (p-q parte; r: o oposto)
                const m = mid(p, q);
                stack.push(p, m, r, d + 1, m, q, r, d + 1);
                continue;
            }
            // nenhuma aresta parte: relevo fugindo no miolo de um triângulo grande → leque no centro
            const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2];
            const e = Math.max(Math.hypot(bx - ax, bz - az), Math.hypot(cx - bx, cz - bz), Math.hypot(ax - cx, az - cz));
            if (e > max * 1.5) {
                const ha = R.at(ax, az), hb = R.at(bx, bz), hc = R.at(cx, cz);
                let dev = 0;
                for (const [wa, wb] of MeshBatch._BARY) { const wc = 1 - wa - wb; dev = Math.max(dev, Math.abs(R.at(ax * wa + bx * wb + cx * wc, az * wa + bz * wb + cz * wc) - (ha * wa + hb * wb + hc * wc))); }
                if (dev > 0.05) { const g = cen(a, b, c); stack.push(a, b, g, d + 1, b, c, g, d + 1, c, a, g, d + 1); continue; }
            }
            out.push(a, b, c);
        }
        this.idx = out;
    }
    // Sobe cada vértice a altura do chão (ou, numa construção ancorada, toda ela por igual — ver anchor).
    // clamp(x, z, h) → h: ajusta a altura de cada vértice (o terreno, rente às pistas: TerrainBuilder.roadCut)
    _relief(clamp = null) {
        const R = Relief, P = this.pos, A = this.anc;
        this._tessellate(Config.relief.tess);
        for (let v = 0, n = P.length / 3; v < n; v++) {
            let h = A && A[v] === A[v] ? A[v] : R.at(P[v * 3], P[v * 3 + 2]);
            if (clamp) h = clamp(P[v * 3], P[v * 3 + 2], h);
            P[v * 3 + 1] += h;
        }
    }

    build(name, scene, material, { vertexColors = false, receiveShadows = true, alwaysActive = true, relief = false, clamp = null } = {}) {
        if (this.empty) return null;
        if (relief && typeof Relief !== 'undefined' && Relief.on) this._relief(clamp);
        this.anc = null;
        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        // Arrays tipados (Float32/Uint16|32): metade da memória dos arrays comuns de doubles, e a malha guarda ESTA cópia (o batch
        // passa a apontar para ela — nada duplicado). O que não é usado (cor) é descartado.
        this.pos = new Float32Array(this.pos); this.nor = new Float32Array(this.nor); this.uv = new Float32Array(this.uv);
        this.idx = this.pos.length / 3 > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
        vd.positions = this.pos;
        vd.indices = this.idx;
        vd.normals = this.nor;
        vd.uvs = this.uv;
        if (vertexColors) { this.col = new Float32Array(this.col); vd.colors = this.col; } else this.col = null;
        vd.applyToMesh(mesh);
        mesh.material = material;
        mesh.useVertexColors = vertexColors;
        mesh.receiveShadows = receiveShadows;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = alwaysActive;   // malha gigante: dispensa culling por frame.
        mesh.freezeWorldMatrix();
        return mesh;
    }
}
