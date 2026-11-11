// ============================================================================
// NearMiss — DIREÇÃO ARRISCADA (como o "near miss" do Burnout): passar RASPANDO por um veículo em movimento, acima de ~70 km/h, sem
// encostar. Dirigir rápido pela cidade vira um jogo dentro do jogo, em vez de só o caminho entre dois lugares.
//   • Vale o trânsito andando (ultrapassagem colada ou o carro que vem de frente): o vão entre as laterais tem de ficar abaixo de
//     ~0,9 m com os dois lado a lado e mais de 6 m/s de diferença de velocidade. Carro estacionado não conta (seria só andar na faixa).
//   • Cada raspada dá XP (2 por ponto da sequência, até ×5) e mantém a SEQUÊNCIA por 5 s; bater zera. Em corrida, cada uma devolve
//     8% do nitro (o takedown devolve 35%).
//   • A raspada só é paga 0,25 s depois, se não houve batida no meio (quem "raspou" e bateu não ganha).
// Conta para o desafio do dia e para a SUA HISTÓRIA (Daily.life.nearMiss / nearBest). Sem custo que apareça: só olha os veículos a
// menos de 8 m, e só com o jogador dirigindo rápido.
// ============================================================================

const NearMiss = {
    MIN_V: 19.5,              // m/s do jogador (≈ 70 km/h)
    GAP: 0.9,                 // m entre as laterais
    REL: 6,                   // m/s de diferença entre os dois
    combo: 0, _comboT: 0, _clock: 0, _hitT: 0, _pend: null,
    _seen: typeof WeakMap !== 'undefined' ? new WeakMap() : null,
    _f: null,

    // Batida do carro do jogador (Game._onCarImpact): zera a sequência e cancela a raspada que ia ser paga.
    onImpact() { this._hitT = 1.2; this._pend = null; if (this.combo) { this.combo = 0; this._comboT = 0; } },

    update(g, dt) {
        this._clock += dt;
        if (this._comboT > 0 && (this._comboT -= dt) <= 0) this.combo = 0;
        if (this._hitT > 0) { this._hitT -= dt; return; }
        if (this._pend && (this._pend.t -= dt) <= 0) { this._pend = null; this._award(g); }
        const car = g.mode === 'car' ? g.activeCar : null;
        if (!car || car.isBoat || car.isChopper || !this._seen || !g.carDamage) return;
        const v = car.velocity, sp = Math.hypot(v.x, v.z);
        if (sp < this.MIN_V) return;
        const P = car.position, fx = v.x / sp, fz = v.z / sp, f = this._f || (this._f = new BABYLON.Vector3());
        for (const o of g.carDamage.allCars()) {
            if (o === car || o.isBoat || o.isChopper || !o.halfW || !o.body) continue;
            const Q = o.position, dx = Q.x - P.x, dz = Q.z - P.z;
            if (dx * dx + dz * dz > 64 || Math.abs((Q.y || 0) - (P.y || 0)) > 1.5) continue;      // longe, ou em outro nível (viaduto)
            const ov = o.velocity;
            if (!ov || Math.hypot(ov.x, ov.z) < 2 || Math.hypot(v.x - ov.x, v.z - ov.z) < this.REL) continue;
            const last = this._seen.get(o);
            if (last !== undefined && this._clock - last < 4) continue;
            const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
            if (Math.abs(along) > (car.halfLen + o.halfLen) * 0.55) continue;                     // ainda não está lado a lado
            o.fwdToRef(f);
            const ext = o.halfW + (o.halfLen - o.halfW) * Math.min(1, Math.abs(f.x * fz - f.z * fx));      // meia largura dele vista de lado (atravessado = o comprimento)
            const gap = side - car.halfW - ext;
            if (gap < 0.05 || gap > this.GAP) continue;
            this._seen.set(o, this._clock);
            if (!this._pend) this._pend = { t: 0.25 };
        }
    },

    _award(g) {
        if (g.mode !== 'car' || !g.activeCar) return;
        this.combo = Math.min(99, this.combo + 1); this._comboT = 5;
        const xp = Math.min(5, this.combo) * 2;
        if (g.skills) g.skills.addXp(xp);
        if (typeof Daily !== 'undefined') { Daily.bump('nearMiss'); if (this.combo > Daily.L('nearBest')) Daily.life.nearBest = this.combo; }
        const C = typeof StreetRacing !== 'undefined' ? StreetRacing.cur : null;
        if (C && C.phase !== 'count' && typeof C.nos === 'number') C.nos = Math.min(1, C.nos + 0.08);
        if (typeof Juice !== 'undefined') { Juice.float(this.combo > 1 ? `RASPANDO ×${this.combo}` : 'RASPANDO!', this.combo >= 5 ? 'risk big' : 'risk'); Juice.whoosh(); }
        if (g.input && g.input.rumble) g.input.rumble(0.25, 0.5, 90);
    },
};
