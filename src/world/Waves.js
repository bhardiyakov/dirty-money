// ============================================================================
// Waves — as ONDAS do mar. Um único modelo (soma de 4 ondulações que andam em direções diferentes, cada uma com o período de uma
// onda de verdade, c = √(gλ/2π)) serve ao desenho e à física: o que se vê passar é o que empurra.
//   • desenho   o plano do mar (WaterPlugin) clareia a face das cristas virada para o sol e escurece os cavados, tudo andando; com
//               mar agitado, carneirinhos (espuma no alto das cristas). Na praia, a arrebentação: a cada onda que chega à areia,
//               jorros (WaterSpray) quebram na beira, virados para a terra.
//   • balanço   barcos (Boat.syncVisual) e quem nada (Player, NPC) sobem e descem com a onda — o desenho 2,5D sobe na tela, como a
//               altura de tudo no jogo — e o barco gira de leve.
//   • força     a água da superfície vai e volta com cada onda (velocidade orbital): quem nada é levado junto (vai e volta), os
//               barcos são empurrados de leve; perto da praia a ressaca e a onda puxam e empurram, um pouco mais para a areia.
// Intensidade M: mar calmo com tempo bom, agitado com chuva, bravo na tempestade (Weather.k). Lago não tem onda. O tempo é o do
// relógio da orla (Water.tick, o mesmo que o shader lê), então desenho e física andam juntos e param com o jogo pausado.
// ============================================================================

const Waves = {
    // ondulações: comprimento (u = m), direção para onde andam (rad, 0 = +X, π/2 = +Z) e amplitude (m) com mar calmo (M = 1)
    COMP: [{ L: 34, dir: 0.35, A: 0.2 }, { L: 21, dir: 1.75, A: 0.13 }, { L: 13, dir: -0.95, A: 0.08 }, { L: 7.5, dir: 2.6, A: 0.045 }],
    UP: 0.56,                 // 1 m de altura = 0,56 u para o norte da tela (o desenho 2,5D, como WaterFx.UP)
    t: 0,
    M: 1,                     // mar: ~0,6 calmo · ~1,6 chuva forte · ~2,1 tempestade

    _init() {
        if (this._c) return this._c;
        let sA = 0, sAk = 0;
        const c = this._c = this.COMP.map((w) => {
            const k = Math.PI * 2 / w.L, o = Math.sqrt(9.8 * k);              // número de onda e frequência (águas profundas)
            sA += w.A; sAk += w.A * k;
            return { k, w: o, dx: Math.cos(w.dir), dz: Math.sin(w.dir), A: w.A, ph: (w.L * 7.3) % (Math.PI * 2) };
        });
        this.sumA = sA; this.sumAk = sAk;
        return c;
    },

    // Relógio (Water.tick): tempo e o estado do mar, suavizado (o tempo muda devagar).
    setTime(t) {
        const dt = Math.min(0.25, Math.max(0, t - this.t));
        this.t = t;
        const k = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.k : 0, goal = 0.6 + 1.5 * k;
        this.M = this._started ? this.M + (goal - this.M) * Math.min(1, dt * 0.3) : goal;
        this._started = true;
    },

    // Fase de cada ondulação (0..1) agora: o shader a recebe pela textura do relógio (WaterPlugin).
    phase(i) { const c = this._init()[i], p = c.w * this.t / (Math.PI * 2); return p - Math.floor(p); },      // (o shader soma a fase inicial c.ph)

    // Fator de mar em (x, z): 0 em terra; lago quase parado; no mar a ondulação cresce da beira (onde vira a arrebentação) ao fundo.
    open(x, z, depth) {
        const W = WorldMap, i = W.index(x, z);
        if (i < 0) return 1;
        if (!(depth > 0)) return 0;
        const sea = W.isSea ? W.isSea[i] === 1 : true;
        const s = Math.min(1, Math.max(0, (depth - 2) / 12)), e = s * s * (3 - 2 * s);
        return sea ? e : e * 0.15;
    },

    // Ondulação de mar aberto em (x, z), sem o fator de beira: out = { h (m), gx, gz (inclinação), vx, vz (água da superfície, m/s) }.
    sample(x, z, out = {}) {
        const C = this._init(), M = this.M, t = this.t;
        let h = 0, gx = 0, gz = 0, vx = 0, vz = 0;
        for (const c of C) {
            const th = c.k * (c.dx * x + c.dz * z) - c.w * t + c.ph, s = Math.sin(th), co = Math.cos(th), A = c.A * M;
            h += A * s;
            gx += A * c.k * co * c.dx; gz += A * c.k * co * c.dz;
            vx += A * c.w * s * c.dx; vz += A * c.w * s * c.dz;                       // (na crista a água anda junto com a onda; no cavado, contra)
        }
        out.h = h; out.gx = gx; out.gz = gz; out.vx = vx; out.vz = vz;
        return out;
    },

    // Para onde fica a praia mais perto (unitário), pela profundidade (WorldMap.waterDepth = m da margem até aqui).
    toShore(x, z, out = {}) {
        const W = WorldMap, e = 2;
        const gx = W.waterDepth(x + e, z) - W.waterDepth(x - e, z), gz = W.waterDepth(x, z + e) - W.waterDepth(x, z - e), l = Math.hypot(gx, gz);
        out.x = l > 1e-4 ? -gx / l : 0; out.z = l > 1e-4 ? -gz / l : 0;
        return out;
    },

    // Corrente na superfície (u/s) que leva quem boia em (x, z) com `depth` m de água: a ondulação (vai e volta) + perto da praia a
    // onda empurrando para a areia e a ressaca puxando de volta (no saldo, um pouco mais para a areia). out = { x, z }.
    current(x, z, depth, out = {}) {
        out.x = 0; out.z = 0;
        if (!(depth > 0)) return out;
        const f = this.open(x, z, depth), S = this._s || (this._s = {});
        if (f > 0) { this.sample(x, z, S); out.x = S.vx * f; out.z = S.vz * f; }
        if (depth < 14 && (!WorldMap.isSea || WorldMap.isSea[WorldMap.index(x, z)] === 1)) {
            const T = this._sh || (this._sh = {}), lap = Math.cos(this.t / 7.4 * Math.PI * 2);          // (a mesma batida da água subindo na areia: WaterPlugin)
            this.toShore(x, z, T);
            const k = this.M * (1 - depth / 14) * (0.12 + 0.28 * lap);
            out.x += T.x * k; out.z += T.z * k;
        }
        return out;
    },

    // Quanto o desenho de quem boia em (x, z) sobe na tela agora (u): a altura da onda vira deslocamento para o norte da TELA.
    lift(x, z, depth) {
        const f = this.open(x, z, depth);
        return f > 0 ? this.sample(x, z, this._l || (this._l = {})).h * f * this.UP : 0;
    },

    // Por quadro (Game): a arrebentação na praia perto da câmera.
    update(dt, game) {
        const W = game.waterFx && game.waterFx.spray, pts = typeof CityGrid !== 'undefined' && CityGrid.shorePoints;
        if (!W || !pts || !pts.length || !game.camera) return;
        // cada onda chegando à areia (a água começando a subir: mesma batida de 7,4 s do shader) quebra na beira; com mar bravo, também
        // no meio da batida
        const p = (this.t / 7.4) % 1, p0 = this._lp == null ? p : this._lp;
        this._lp = p;
        const crossed = (m) => (p >= p0 ? p0 < m && p >= m : p0 < m || p >= m);
        const Q = this._q || (this._q = []);
        if (crossed(0.08) || (this.M > 1.0 && crossed(0.58))) {
            const f = game.camera.target, R = 44, pr = Math.min(0.85, 0.45 + 0.3 * (this.M - 0.6)) * (crossed(0.08) ? 1 : 0.6);
            for (const s of pts) {
                if (Math.abs(s.x - f.x) > R || Math.abs(s.z - f.z) > R) continue;
                for (let k = -1; k <= 1; k++) {                                            // (os pontos ficam a cada 9 u: três jorros cobrem o vão)
                    if (Math.random() > pr) continue;
                    Q.push({ t: Math.random() * 1.3, s, o: k * 3 + (Math.random() - 0.5) * 2.4 });    // (a onda vai quebrando ao longo da praia, não toda de uma vez)
                }
            }
        }
        for (let i = Q.length - 1; i >= 0; i--) {
            const q = Q[i];
            if ((q.t -= dt) > 0) continue;
            Q.splice(i, 1);
            const s = q.s, ax = -s.nz, az = s.nx, d = 1.2 + Math.random() * 1.0;          // (ao longo da praia; um pouco mar adentro da beira)
            const x = s.x + ax * q.o + s.nx * d, z = s.z + az * q.o + s.nz * d, a = Math.min(1, 0.6 + 0.22 * this.M), M = this.M;
            W.emit(x, z, { kind: M > 1.4 && Math.random() < 0.35 ? 'tail' : M > 0.95 ? 'bowL' : 'bowS', dir: [-s.nx, -s.nz], a, vx: -s.nx * 0.8, vz: -s.nz * 0.8, drag: 1.5 });     // quebrando para a areia
            if (Math.random() < 0.7) W.emit(x - s.nx * 0.7, z - s.nz * 0.7, { kind: 'churn', a: a * 0.85, vx: -s.nx * 0.6, vz: -s.nz * 0.6, drag: 1.2 });       // e a espuma que ela empurra
        }
    },
};
