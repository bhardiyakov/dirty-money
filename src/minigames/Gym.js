// ============================================================================
// Gym — os mini-games da ACADEMIA: rosca direta (2–50 kg), supino (10–150 kg) e agachamento (20–200 kg). E numa estação livre
// (Interiors.gymUse) com a diária/mensalidade paga (recepção) e séries sobrando no dia (Physique.SETS_PER_DAY por exercício).
//   1. ESCOLHE O PESO (← → / A D / os botões): a etiqueta mostra a dificuldade — a carga dividida pelo máximo que ele levanta hoje
//      (Physique.maxLift: cresce com a FORÇA; quanto mais forte, mais fácil o mesmo peso).
//   2. A SÉRIE: a cada repetição um cursor corre numa barra e uma faixa verde aparece — aperte (ESPAÇO / clique / RT) com o cursor
//      dentro dela. Quanto mais pesado (e mais cansado, a cada repetição), menor a faixa e mais rápido o cursor. Acertou: o boneco
//      faz a repetição (mais lenta quanto mais pesada); errou: ele empaca no meio e volta (falha). Duas falhas ou 10 repetições: fim.
//   3. GANHO: cada repetição boa soma massa muscular (Physique.repGain: rende mais perto de 70–95% do máximo; leve demais quase não
//      conta; com fome rende pouco; o whey ajuda) e treina a força de carregar. Gradual: poucas séries por dia e o ganho diminui.
// O jogador fica no aparelho (Player.gym) e o mini-game comanda o quadro do clipe (gym_*:w1|w2|w3 — anilhas pela faixa de peso).
// ============================================================================

const Gym = {
    active: false,
    EX: {
        gym_curl: { id: 'curl', name: 'Rosca direta', verb: 'fazer rosca direta', clip: 'gym_curl', min: 2, max: 50, step: (w) => (w < 20 ? 2 : w < 30 ? 2 : 5), stick: [0, 0.2, 0.1, 0.03, 0] },
        gym_bench: { id: 'bench', name: 'Supino', verb: 'fazer supino', clip: 'gym_bench', min: 10, max: 150, step: () => 5, stick: [0, 0.5, 0.63, 0.5, 0] },
        gym_squat: { id: 'squat', name: 'Agachamento', verb: 'fazer agachamento', clip: 'gym_squat', min: 20, max: 200, step: () => 10, stick: [0, 0.55, 0.66, 0.55, 0] },
    },
    MAX_REPS: 10,

    // ------------------------------------------------------------------ abrir / fechar
    open(game, use) {
        if (this.active) return;
        const ex = this.EX[use.kind]; if (!ex) return;
        if (!Physique.hasPass()) { game._flash('🏋️ Treino só com a diária ou a mensalidade — compre na recepção'); return; }
        if (Physique.setsLeft(ex.id) <= 0) { game._flash(`Já fez as ${Physique.SETS_PER_DAY} séries de ${ex.name.toLowerCase()} hoje — o músculo cresce no descanso: volte amanhã`); return; }
        const pl = game.player;
        if (pl.busy || pl.rag) return;
        this.g = game; this.ex = ex; this.use = use; this.active = true;
        // vai para o aparelho (a posição e a direção da estação) e trava
        const o = Interiors.STAGE;
        pl.teleport(new BABYLON.Vector3(o.x + use.px, 0, o.z + use.pz));
        pl.root.rotation.y = use.face; pl.velocity.setAll(0);
        pl.gym = true; pl.action = null;
        this._camZ = 0.5; game.camera.setZoomMul(0.36);
        // peso sugerido: o mais pesado até ~75% do máximo
        const cap = Physique.maxLift(ex.id, pl);
        this.weights = this._weights(ex);
        let w = this.weights[0];
        for (const k of this.weights) if (k <= cap * 0.75) w = k;
        this.wi = this.weights.indexOf(w);
        this._pose(0);
        this._build(); this.root.style.display = 'block';
        this.phase = 'pick'; this._render();
        this._msg('');
    },
    close() {
        const g = this.g;
        this.active = false;
        if (this.root) this.root.style.display = 'none';
        if (g) {
            const pl = g.player; pl.gym = false;
            pl.actor.play('idle', 'none', { restart: true });
            const o = Interiors.STAGE, u = this.use;
            pl.teleport(new BABYLON.Vector3(o.x + u.px, 0, o.z + u.pz - 1.2));                 // (desce do aparelho para a frente)
            g.camera.setZoomMul(this._camZ || 0.5);
            g.input.justPressed = {};
        }
    },

    _weights(ex) { const out = []; for (let w = ex.min; w <= ex.max + 1e-6; w += ex.step(w)) out.push(Math.round(w * 10) / 10); if (out[out.length - 1] !== ex.max) out.push(ex.max); return out; },
    get weight() { return this.weights[this.wi]; },
    tier(w = this.weight) { const f = (w - this.ex.min) / (this.ex.max - this.ex.min); return f < 0.3 ? 'w1' : f < 0.62 ? 'w2' : 'w3'; },
    ratio(w = this.weight) { return w / Physique.maxLift(this.ex.id, this.g.player); },
    diff(r) {
        return r <= 0.45 ? ['Leve', '#7dd3fc'] : r <= 0.75 ? ['Ideal', '#86efac'] : r <= 0.95 ? ['Pesado', '#fbbf24'] : r <= 1.1 ? ['No limite', '#fb923c'] : ['Pesado demais', '#f87171'];
    },

    // Pose do clipe na fração `ph` (0..1) de uma repetição (pela fase: qualquer nº de quadros; com o gráfico suave, o próximo quadro
    // entra em degradê).
    _pose(ph) {
        const a = this.g.player.actor, ex = this.ex, w = this.tier();
        if (a.clipName !== ex.clip || !a.clip || a.clip.weapon !== w) a.play(ex.clip, w, { restart: true });
        if (a.clip) a.setPhase(ph);
        this.g.player._syncSprite();
    },

    // ------------------------------------------------------------------ por quadro
    update(dt) {
        if (!this.active) return;
        const g = this.g, inp = g.input, pl = g.player;
        if (!pl.alive || Interiors.active == null) { this.close(); return; }
        const hit = inp.consumePress(' ') | inp.consumePress('mouse0') | inp.consumePress('enter');
        const esc = inp.consumePress('escape');
        const left = inp.consumePress('arrowleft') | inp.consumePress('a'), right = inp.consumePress('arrowright') | inp.consumePress('d');
        if (this.phase === 'pick') {
            if (left) { this.wi = Math.max(0, this.wi - 1); this._pose(0); this._render(); }
            if (right) { this.wi = Math.min(this.weights.length - 1, this.wi + 1); this._pose(0); this._render(); }
            if (hit) this._startSet();
            if (esc) this.close();
            return;
        }
        if (this.phase === 'done') {
            if (hit && Physique.setsLeft(this.ex.id) > 0) { this.phase = 'pick'; this._render(); }
            else if (esc || hit) this.close();
            return;
        }
        if (esc) { this._endSet(); return; }
        if (this.phase === 'rep') {
            const S = this.set;
            S.cur += dt * S.speed * S.dir;
            if (S.cur > 1) { S.cur = 2 - S.cur; S.dir = -1; } else if (S.cur < 0) { S.cur = -S.cur; S.dir = 1; }
            this._bar();
            if (hit) {
                const ok = Math.abs(S.cur - S.zone) <= S.zw / 2;
                this.phase = 'anim'; S.anim = { ok, t: 0, dur: ok ? this._repDur() : 1.5 };
                if (!ok) { S.fails++; this._msg('Falhou! A barra empacou'); AudioFX._burst(pl.position.x, pl.position.z, { vol: 0.2, dur: 0.25, f0: 300, f1: 120, maxDist: 20 }); }
                this._render();
            }
            return;
        }
        if (this.phase === 'anim') {
            const S = this.set, A = S.anim;
            A.t += dt;
            const u = Math.min(1, A.t / A.dur);
            if (A.ok) this._pose(u);
            else {                                                              // empaca no ponto difícil, treme e volta
                const K = this.ex.stick, n = K.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f));
                let ph = K[i] + (K[i + 1] - K[i]) * (f - i);
                if (u > 0.3 && u < 0.65) ph += 0.015 * Math.sin(A.t * 60);
                this._pose(Math.max(0, ph));
            }
            if (u >= 1) {
                if (A.ok) this._rep();
                this._pose(0);
                if (S.fails >= 2 || S.reps >= this.MAX_REPS) this._endSet();
                else this._nextRep();
            }
        }
    },

    _repDur() { const c = this.g.player.actor.clip, base = c ? c.frames / c.fps : 1.4; return base * (0.75 + 0.75 * Math.min(1.2, this.set.rEff)); },

    _startSet() {
        const r = this.ratio();
        this.set = { r, reps: 0, fails: 0, gain: 0, cur: 0, dir: 1, w: this.weight };
        this._pose(0);
        this._nextRep();
        this._msg(r > 1.1 ? 'Pesado demais para você hoje — mas tente…' : '');
    },
    _nextRep() {
        const S = this.set;
        S.rEff = S.r * (1 + 0.035 * S.reps + 0.08 * S.fails);                 // cansa a cada repetição
        S.zw = S.rEff > 1.1 ? 0.035 : Math.max(0.05, Math.min(0.44, 0.46 - 0.38 * S.rEff));
        S.speed = 0.55 + 0.95 * Math.min(1.3, S.rEff);
        S.zone = 0.25 + Math.random() * 0.5;
        S.cur = Math.random() < 0.5 ? 0 : 1; S.dir = S.cur ? -1 : 1;
        this.phase = 'rep';
        this._render();
    },
    _rep() {
        const S = this.set, pl = this.g.player, g = Physique.repGain(S.r);
        S.reps++; S.gain += g;
        Physique.addMuscle(g);
        if (typeof Bags !== 'undefined') Bags.train(pl, 0.6 + S.r);
        pl.stamina = Math.max(0, (pl.stamina == null ? 100 : pl.stamina) - 3 * Math.min(1.3, S.rEff));
        AudioFX._burst(pl.position.x, pl.position.z, { vol: 0.22, dur: 0.07, f0: 2600, f1: 1400, maxDist: 25, type: 'bandpass', q: 5 });      // "clanc" das anilhas
        this._msg(`Repetição ${S.reps}!`);
    },
    _endSet() {
        const S = this.set, pl = this.g.player;
        if (S && S.reps > 0) Physique.doneSet(this.ex.id);
        this.phase = 'done';
        this._pose(0);
        this._render();
        if (S && S.reps > 0) this.g._flash(`💪 ${this.ex.name} ${S.w} kg: ${S.reps} repetições · +${S.gain.toFixed(2)} de massa muscular · FORÇA ${Math.round(Physique.strength(pl))}`);
    },

    // ------------------------------------------------------------------ tela
    _build() {
        if (this.root) return;
        const r = this.root = document.createElement('div');
        r.id = 'gymUI';
        r.innerHTML = `<style>
            #gymUI { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(560px, calc(100vw - 32px)); z-index: 60; display: none;
              background: rgba(14,16,22,0.92); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 14px 16px; color: #e8edf8;
              font: 500 13px Inter, system-ui, sans-serif; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
            #gymUI h3 { margin: 0 0 6px; font-size: 15px; letter-spacing: 0.3px; } #gymUI h3 small { color: #8fb4ff; font-weight: 600; margin-left: 6px; }
            #gymUI .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0; flex-wrap: wrap; }
            #gymUI .wt { display: flex; align-items: center; gap: 10px; } #gymUI .wt b { font-size: 26px; min-width: 96px; text-align: center; }
            #gymUI button { font: inherit; font-weight: 700; padding: 7px 12px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.08); color: #e8edf8; cursor: pointer; }
            #gymUI button.pri { background: #ff6a1a; border-color: #ff8a4a; color: #1a0d04; } #gymUI button:hover { filter: brightness(1.15); }
            #gymUI .tag { font-weight: 800; padding: 2px 8px; border-radius: 99px; font-size: 12px; }
            #gymUI .meter { position: relative; height: 22px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; margin: 10px 0 4px; }
            #gymUI .meter i { position: absolute; top: 0; bottom: 0; background: linear-gradient(90deg, #22c55e, #86efac); border-radius: 99px; }
            #gymUI .meter s { position: absolute; top: -2px; bottom: -2px; width: 4px; margin-left: -2px; background: #fff; box-shadow: 0 0 8px #fff; border-radius: 2px; }
            #gymUI .dim { color: #9aa4b8; font-size: 12px; } #gymUI .msg { min-height: 18px; color: #fde68a; font-weight: 700; }
            #gymUI .fails { color: #f87171; letter-spacing: 2px; }
        </style><div id="gymBody"></div>`;
        document.body.appendChild(r);
        r.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-g]'); if (!b) return;
            e.stopPropagation();
            const a = b.dataset.g;
            if (a === 'minus') { this.wi = Math.max(0, this.wi - 1); this._pose(0); this._render(); }
            else if (a === 'plus') { this.wi = Math.min(this.weights.length - 1, this.wi + 1); this._pose(0); this._render(); }
            else if (a === 'go') this._startSet();
            else if (a === 'again') { this.phase = 'pick'; this._render(); }
            else if (a === 'out') this.close();
            else if (a === 'stop') this._endSet();
        });
        r.addEventListener('pointerdown', (e) => e.stopPropagation());
    },
    _msg(t) { const e = this.root && this.root.querySelector('.msg'); if (e) e.textContent = t; this._m = t; },
    _render() {
        const B = this.root.querySelector('#gymBody'), ex = this.ex, pl = this.g.player, cap = Physique.maxLift(ex.id, pl);
        const done = Physique.SETS_PER_DAY - Physique.setsLeft(ex.id), head = `<h3>🏋️ ${ex.name.toUpperCase()}<small>séries hoje ${done}/${Physique.SETS_PER_DAY}</small></h3>`;
        const info = `<div class="dim">Força ${Math.round(Physique.strength(pl))}/100 · máximo hoje ~${Math.round(cap)} kg · ${Physique.hungerLabel()}${Physique.fed < 35 ? ' (treinar com fome rende pouco)' : ''}${Physique.protein > 0 ? ' · whey: +25%' : ''}</div>`;
        if (this.phase === 'pick') {
            const r = this.ratio(), [dl, dc] = this.diff(r);
            B.innerHTML = `${head}${info}<div class="row"><div class="wt"><button data-g="minus">◀</button><b>${this.weight} kg</b><button data-g="plus">▶</button></div>
                <span class="tag" style="background:${dc};color:#111">${dl} · ${Math.round(r * 100)}%</span></div>
                <div class="row"><span class="dim">← → escolhe o peso · ESPAÇO / clique / RT começa · ESC sai</span><span><button data-g="out">Sair</button> <button class="pri" data-g="go">Começar série</button></span></div><div class="msg">${this._m || ''}</div>`;
        } else if (this.phase === 'done') {
            const S = this.set || { reps: 0, gain: 0 }, more = Physique.setsLeft(ex.id) > 0;
            B.innerHTML = `${head}<div class="row"><b>${S.reps} repetições</b><span>+${S.gain.toFixed(2)} de massa muscular</span></div>${info}
                <div class="row"><span class="dim">${more ? 'Descanse um pouco e faça outra série' : 'Chega por hoje: o músculo cresce no descanso (e comendo)'}</span><span><button data-g="out">Sair</button>${more ? ' <button class="pri" data-g="again">Outra série</button>' : ''}</span></div>`;
        } else {
            const S = this.set;
            B.innerHTML = `${head}<div class="row"><b>${S.w} kg · repetição ${S.reps + 1}/${this.MAX_REPS}</b><span class="fails">${'✕'.repeat(S.fails)}</span></div>
                <div class="meter"><i></i><s></s></div><div class="row"><span class="dim">Aperte ESPAÇO / clique / RT com o cursor na faixa verde</span><button data-g="stop">Encerrar série</button></div><div class="msg">${this._m || ''}</div>`;
            this._bar();
        }
    },
    _bar() {
        const S = this.set, m = this.root.querySelector('.meter'); if (!m || !S) return;
        const i = m.querySelector('i'), s = m.querySelector('s');
        i.style.left = ((S.zone - S.zw / 2) * 100) + '%'; i.style.width = (S.zw * 100) + '%';
        s.style.left = (S.cur * 100) + '%';
        i.style.opacity = this.phase === 'rep' ? 1 : 0.35;
    },
};
