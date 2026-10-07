// ============================================================================
// BridgeShadows — a sombra das PONTES (cidade ↔ ilha) sobre a água, como se o tabuleiro estivesse no alto.
//
// As pontes ficam rentes à água (física plana: ver WorldBuilder._bridges), então não projetam sombra de verdade e pareciam
// "pintadas" no mar. Aqui uma malha escura e translúcida logo acima da água desenha a sombra que um tabuleiro a H u de altura
// faria:
//   • deslocada na direção do SOL — a mesma luz e a mesma força das outras sombras (DayNight: some à noite, fica mais fraca
//     com chuva), então gira e se alonga com a hora do dia;
//   • "descendo" até zero nas cabeceiras (rampa de RAMP u), onde a ponte encontra a terra;
//   • com a faixa de cada pilar, do pé na água até a sombra do tabuleiro.
// O pedaço que cai debaixo do próprio tabuleiro fica escondido por ele (o tabuleiro está mais alto): só aparece o que cai na água.
// Uma malha para as três pontes (1 draw call, ~500 vértices); as posições só são refeitas quando o sol muda de verdade.
// ============================================================================

class BridgeShadows {
    static get H() { return 10; }             // altura "fingida" do tabuleiro no meio da ponte (u): vão livre de uma ponte sobre canal
    static get RAMP() { return 40; }          // comprimento da subida em cada cabeceira (u)
    static get STEP() { return 8; }           // resolução da sombra ao longo da ponte (u)
    static get Y() { return 0.05; }           // logo acima da água e do chão; abaixo das calçadas e do tabuleiro (0,22)

    constructor(scene, shadowGenerator) {
        this.scene = scene;
        this.sg = shadowGenerator;
        this.mesh = null;
        this._k = { x: NaN, z: NaN };
        this._alpha = -1;
    }

    // Lê as pontes do plano viário (mesma geometria de WorldBuilder._bridges) e monta a malha.
    build() {
        const H = BridgeShadows.H, R = BridgeShadows.RAMP, S = BridgeShadows.STEP;
        this.strips = [];       // { xs: [x...], hs: [h...], z0, z1 } — fatias do tabuleiro (calçadas e muretas incluídas)
        this.pillars = [];      // { x, z, h }
        for (const e of RoadPlan.edges) {
            if (e.cls !== 'bridge' || e.v) continue;                                     // (as pontes do plano são todas L-O)
            const x0 = e.a.x + e.a.hwNS, x1 = e.b.x - e.b.hwNS, zm = e.a.z, half = e.w / 2 + 3 + 0.4;
            const hAt = (x) => H * Math.max(0, Math.min(1, (x - x0) / R, (x1 - x) / R));
            const n = Math.max(1, Math.ceil((x1 - x0) / S)), xs = [], hs = [];
            for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; xs.push(x); hs.push(hAt(x)); }
            this.strips.push({ xs, hs, z0: zm - half, z1: zm + half });
            for (let x = x0 + 20; x < x1 - 10; x += 40) for (const s of [-1, 1]) this.pillars.push({ x, z: zm + s * (e.w / 2 + 3 - 1), h: hAt(x) });
        }
        let quads = this.pillars.length;
        for (const st of this.strips) quads += st.xs.length - 1;
        if (!quads) return;

        this.pos = new Float32Array(quads * 4 * 3);
        const idx = new Uint32Array(quads * 6);
        for (let q = 0; q < quads; q++) { const b = q * 4, o = q * 6; idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b + 2; idx[o + 4] = b + 1; idx[o + 5] = b + 3; }
        const mesh = this.mesh = new BABYLON.Mesh('bridgeShadows', this.scene);
        const vd = new BABYLON.VertexData();
        vd.positions = this.pos; vd.indices = idx;
        vd.applyToMesh(mesh, true);                                                       // atualizável: o sol muda ao longo do dia
        const m = new BABYLON.StandardMaterial('bridgeShadowMat', this.scene);
        m.diffuseColor = BABYLON.Color3.Black(); m.specularColor = BABYLON.Color3.Black(); m.emissiveColor = BABYLON.Color3.Black();
        m.disableLighting = true;
        m.backFaceCulling = false;
        m.disableDepthWrite = true;                                                       // decalque: testa profundidade, não grava
        m.alpha = 0;
        mesh.material = m;
        mesh.isPickable = false;
        mesh.receiveShadows = false;
        mesh.alwaysSelectAsActiveMesh = true;                                             // (malha comprida e móvel: o culling não ajuda)
        mesh.setEnabled(false);
    }

    // Todo quadro (WorldBuilder.update): só refaz as posições quando o sol mudou, e a opacidade quando a força da sombra mudou.
    update() {
        if (!this.mesh) return;
        const L = this.sg.getLight(), d = L.direction;
        const alpha = Math.max(0, 1 - this.sg.getDarkness());                             // darkness 0,4 (sombra forte) … 1 (sem sombra)
        if (alpha < 0.02 || d.y > -0.05) { if (this.mesh.isEnabled()) this.mesh.setEnabled(false); this._alpha = 0; return; }
        if (!this.mesh.isEnabled()) this.mesh.setEnabled(true);
        if (Math.abs(alpha - this._alpha) > 0.005) { this._alpha = alpha; this.mesh.material.alpha = alpha; }
        // Deslocamento da sombra por unidade de altura (até onde o raio de sol que passa por um ponto a 1 u de altura toca a água).
        let kx = d.x / -d.y, kz = d.z / -d.y;
        const kl = Math.hypot(kx, kz), KMAX = 2;                                          // sol muito baixo: sombra no máx. 2× a altura
        if (kl > KMAX) { kx *= KMAX / kl; kz *= KMAX / kl; }
        if (Math.abs(kx - this._k.x) < 0.004 && Math.abs(kz - this._k.z) < 0.004) return;
        this._k.x = kx; this._k.z = kz;
        this._rebuild(kx, kz);
    }

    _rebuild(kx, kz) {
        const P = this.pos, Y = BridgeShadows.Y;
        let v = 0;
        const put = (x, z) => { P[v++] = x; P[v++] = Y; P[v++] = z; };
        // Tabuleiro: cada fatia vira um quadrilátero cujos cantos andam conforme a altura LOCAL (nas rampas a sombra encolhe).
        for (const st of this.strips) {
            for (let i = 0; i < st.xs.length - 1; i++) {
                const xa = st.xs[i], xb = st.xs[i + 1], ha = st.hs[i], hb = st.hs[i + 1];
                put(xa + kx * ha, st.z0 + kz * ha); put(xb + kx * hb, st.z0 + kz * hb);
                put(xa + kx * ha, st.z1 + kz * ha); put(xb + kx * hb, st.z1 + kz * hb);
            }
        }
        // Pilares (2,4 u de largura): faixa do pé (na água) até o topo (na sombra do tabuleiro).
        const kl = Math.hypot(kx, kz) || 1, px = -kz / kl * 1.2, pz = kx / kl * 1.2;
        for (const p of this.pillars) {
            const tx = p.x + kx * p.h, tz = p.z + kz * p.h;
            put(p.x - px, p.z - pz); put(p.x + px, p.z + pz);
            put(tx - px, tz - pz); put(tx + px, tz + pz);
        }
        this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, P, false, false);
        this.mesh.refreshBoundingInfo();
    }
}
