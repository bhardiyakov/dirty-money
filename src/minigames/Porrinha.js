// ============================================================================
// Porrinha — o jogo dos palitinhos, apostado, no balcão do bar. Mini-jogo em "outro mundo" (como a sinuca e o truco).
//   • Cada um começa com 3 palitos. A cada rodada todo mundo esconde de 0 até os palitos que tem na mão fechada; cada um, na sua vez,
//     CHUTA o total da mesa (não pode repetir o chute de ninguém). As mãos abrem juntas: quem acertou LARGA um palito. Quem largar
//     todos primeiro leva o pote (a aposta de todos).
//   • IA: conta o que sabe (os próprios palitos e quantos cada um ainda tem) e LÊ os chutes de quem falou antes — quem chuta alto
//     costuma ter muita coisa na mão. Os melhores leem melhor e escondem de um jeito menos previsível.
//   • Desenho: a mesma mesa do truco (Truco._background), punhos fechados que balançam, a mão que abre mostrando os palitos,
//     o placar de palitos de cada um e os balões com os chutes.
// ============================================================================

const Porrinha = {
    active: false,
    STAKES: [
        { bet: 50, n: 2, desc: 'Dois fregueses do balcão, só por diversão.' },
        { bet: 300, n: 3, desc: 'A turma da sinuca, valendo a cerveja.' },
        { bet: 1500, n: 3, desc: 'Os velhos de sempre: leem qualquer chute.' },
        { bet: 8000, n: 3, desc: 'Mesa dos bicheiros. Ninguém blefa à toa.' },
    ],
    READ: [0.15, 0.4, 0.7, 0.9],      // quanto a IA usa os chutes dos outros

    open(game, shop) {
        if (this.active) return;
        this.g = game; this.shop = shop; this.active = true; this.phase = 'setup';
        this._borrow();
        this._build();
        this.root.style.display = 'block';
        this._resize();
        this._setup();
        this._last = performance.now();
        const loop = (t) => { if (!this.active) return; this._frame(Math.min(0.05, (t - this._last) / 1000)); this._last = t; this._raf = requestAnimationFrame(loop); };
        this._raf = requestAnimationFrame(loop);
    },
    close() {
        this.active = false; this._gen = (this._gen || 0) + 1;
        cancelAnimationFrame(this._raf);
        if (this.root) this.root.style.display = 'none';
        const g = this.g; if (g) { g.input.justPressed = {}; if (g.input.keys) for (const k of Object.keys(g.input.keys)) g.input.keys[k] = false; }
    },
    // A mesa, as garrafas e os desenhos são os do truco.
    _borrow() {
        for (const k of ['_rr', '_rng', '_shade', '_bottle', '_glass', '_peanuts', '_ashtray', '_background']) this[k] = Truco[k];
    },

    _build() {
        if (this.root) return;
        const st = document.createElement('style');
        st.textContent = `
            #porrinha { position: fixed; inset: 0; z-index: 90; display: none; background: #0b0705; font-family: var(--font); color: var(--tx); user-select: none; }
            #porrinha canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
            #porrinha .po-bar { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; max-width: 94vw;
                padding: 10px 12px; border-radius: 18px; background: var(--glass-2); border: 1px solid var(--line-2); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
            #porrinha .po-bar b { width: 100%; text-align: center; font: 700 13px var(--font-d); margin-bottom: 2px; }
            #porrinha .po-bar button { min-width: 46px; font: 800 18px var(--font-d) !important; }
            #porrinha .po-bar button[disabled] { opacity: 0.3; }
            #porrinha .po-quit { position: absolute; left: 16px; bottom: 16px; }
            #porrinha .po-pot { position: absolute; left: 16px; top: 16px; padding: 8px 16px; border-radius: 16px; background: var(--glass); border: 1px solid var(--line-2); text-align: center; }
            #porrinha .po-pot b { display: block; font: 800 18px var(--font-d); color: #86efac; } #porrinha .po-pot small { font-size: 11px; color: var(--tx-2); }
            #porrinha .po-modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(5,4,3,0.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); padding: 16px; }
            #porrinha .po-box { width: min(560px, 96vw); max-height: 94vh; overflow: auto; padding: 22px 24px; border-radius: 22px; background: var(--glass-2); border: 1px solid var(--line-2); box-shadow: var(--shadow); text-align: center; }
            #porrinha .po-box h2 { font: 800 26px var(--font-d); margin-bottom: 4px; } #porrinha .po-box p { font-size: 13px; color: var(--tx-2); line-height: 1.5; margin-bottom: 10px; }
            #porrinha .po-opt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 11px 14px; margin-top: 8px; border-radius: 14px; cursor: pointer;
                background: var(--card); border: 1px solid var(--line-2); color: var(--tx); font: inherit; }
            #porrinha .po-opt:hover:not([disabled]) { border-color: var(--gold); background: var(--card-h); } #porrinha .po-opt[disabled] { opacity: 0.4; cursor: not-allowed; }
            #porrinha .po-opt .t { flex: 1; } #porrinha .po-opt b { font: 700 15px var(--font-d); } #porrinha .po-opt small { display: block; font-size: 12px; color: var(--tx-2); }
            #porrinha .po-opt .v { font: 800 16px var(--font-d); color: #86efac; text-align: right; } #porrinha .po-opt .v small { color: var(--tx-3); }
            #porrinha .po-big { font: 800 40px var(--font-d); margin: 4px 0; }`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'porrinha';
        r.innerHTML = `<canvas></canvas><div class="po-pot" id="poPot"></div><div class="po-bar" id="poBar" style="display:none"></div>
            <button class="ui-btn po-quit" id="poQuit">Sair</button><div class="po-modal" id="poModal"></div>`;
        document.body.appendChild(r);
        this.cv = r.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
        this.$ = (id) => document.getElementById(id);
        this._emoji = (getComputedStyle(document.documentElement).getPropertyValue('--emoji') || '').trim() || 'sans-serif';
        window.addEventListener('resize', () => { if (this.active) this._resize(); });
        this.$('poQuit').onclick = () => this._quit();
        window.addEventListener('keydown', (e) => {
            if (!this.active) return;
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); this._quit(); return; }
            const n = parseInt(e.key, 10);
            if (!isNaN(n) && this._pick) { e.preventDefault(); const b = this.$('poBar').querySelector(`button[data-v="${n}"]`); if (b && !b.disabled) b.click(); }
        }, true);
    },
    _resize() {
        const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight;
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.dpr = dpr; this.vw = w; this.vh = h;
        this.cw = Math.round(Math.max(58, Math.min(132, Math.min(h * 0.145, w * 0.11)))); this.ch = this.cw * 1.5;
        this.tw = Math.min(w - 24, h * 1.62); this.th = Math.min(h - 110, this.tw * 0.6);
        this.cx = w / 2; this.cy = 40 + (h - 40) / 2 - 20;
        this._bg = null; this._cards = new Map();
    },

    // ------------------------------------------------------------------ mesa
    _setup() {
        this.phase = 'setup'; this.players = []; this._pick = null;
        this.$('poBar').style.display = 'none';
        const cash = this.g.inventory.cash, M = this.$('poModal');
        M.style.display = 'flex';
        M.innerHTML = `<div class="po-box"><h2>✊ Porrinha</h2><p>${this.shop ? this.shop.name + ' · ' : ''}Esconda de 0 a 3 palitos na mão, chute o total da mesa. Acertou, larga um palito. Quem largar todos primeiro leva o pote.<br>Você tem <b style="color:#86efac">${brl(cash)}</b>.</p>
            ${this.STAKES.map((o, i) => `<button class="po-opt" data-i="${i}" ${cash < o.bet ? 'disabled' : ''}><span class="t"><b>${o.n + 1} na roda · ${'★'.repeat(i + 1)}</b><small>${o.desc}</small></span>
                <span class="v">${brl(o.bet)}<small><br>pote ${brl(o.bet * (o.n + 1))}</small></span></button>`).join('')}
            <div style="margin-top:14px"><button class="ui-btn" id="poLeave">Voltar ao bar</button></div></div>`;
        this.$('poLeave').onclick = () => this.close();
        for (const b of M.querySelectorAll('.po-opt')) b.onclick = () => this._start(+b.dataset.i);
        this._pot();
    },
    _start(lvl) {
        const o = this.STAKES[lvl], inv = this.g.inventory;
        if (inv.cash < o.bet) return;
        inv.cash -= o.bet;
        this.lvl = lvl; this.bet = o.bet; this.pot = o.bet * (o.n + 1);
        const names = (typeof BarGames !== 'undefined' ? BarGames.NAMES : [['Zé', '🧔'], ['Tião', '👨‍🦳'], ['Bira', '👨‍🦲']]).slice().sort(() => Math.random() - 0.5);
        this.players = [{ name: 'Você', emo: '🙂', me: true }].concat(names.slice(0, o.n).map(([name, emo]) => ({ name, emo })));
        for (const p of this.players) { p.left = 3; p.hide = 0; p.guess = null; p.shake = 0; p.open = 0; p.out = false; }
        this.$('poModal').style.display = 'none';
        this.phase = 'play'; this.starter = Math.floor(Math.random() * this.players.length); this.bubbles = []; this.log = [];
        const gen = this._gen = (this._gen || 0) + 1;
        this._match(gen).catch((e) => { if (e !== this.CANCEL) console.error('[PORRINHA]', e); });
        this._pot();
        AudioFX.blip(520, 0.08, 0.15);
    },
    CANCEL: { cancel: true },
    _sleep(gen, ms) { return new Promise((ok, no) => setTimeout(() => (gen === this._gen && this.active ? ok() : no(this.CANCEL)), ms)); },

    async _match(gen) {
        while (true) {
            const alive = this.players.filter((p) => !p.out);
            if (alive.length < 2) break;
            await this._round(gen);
            const w = this.players.find((p) => p.left === 0 && !p.out);
            if (w) { w.out = true; return this._end(w); }
        }
    },

    async _round(gen) {
        const P = this.players.filter((p) => !p.out), total = P.reduce((s, p) => s + p.left, 0);
        for (const p of P) { p.guess = null; p.open = 0; p.hide = null; }
        this.bubbles = [];
        // 1) todo mundo esconde (os punhos balançam)
        for (const p of P) p.shake = 1;
        for (const p of P) if (!p.me) p.hide = this._aiHide(p);
        const me = P.find((p) => p.me);
        if (me) { me.hide = await this._ask(gen, 'Quantos palitos você esconde?', [...Array(me.left + 1).keys()], () => true); AudioFX.blip(400, 0.06, 0.1); }
        await this._sleep(gen, 500);
        for (const p of P) p.shake = 0;
        // 2) os chutes, um de cada vez, a partir de quem começa (não pode repetir)
        let i0 = P.indexOf(this.players[this.starter]); if (i0 < 0) i0 = 0;
        const said = [];
        for (let k = 0; k < P.length; k++) {
            const p = P[(i0 + k) % P.length];
            let gss;
            if (p.me) gss = await this._ask(gen, 'Seu chute: quantos palitos na mesa?', [...Array(total + 1).keys()], (v) => !said.includes(v));
            else { await this._sleep(gen, 600 + Math.random() * 700); gss = this._aiGuess(p, P, said, total); }
            p.guess = gss; said.push(gss);
            this._say(p, gss === 0 ? 'Lona!' : this._pick1([`${gss}!`, `Eu digo ${gss}.`, `${gss}, fechou.`]));
            AudioFX.blip(500 + gss * 40, 0.06, 0.1);
        }
        await this._sleep(gen, 700);
        // 3) as mãos abrem juntas
        for (const p of P) p.open = 0.001;
        AudioFX._burst && AudioFX._burst(AudioFX.listener.x, AudioFX.listener.z, { vol: 0.3, dur: 0.1, f0: 600, f1: 90, maxDist: 1e9 });
        const t0 = performance.now(); while (performance.now() - t0 < 350) { for (const p of P) p.open = Math.min(1, (performance.now() - t0) / 300); await this._sleep(gen, 16); }
        const sum = P.reduce((s, p) => s + p.hide, 0);
        const hit = P.find((p) => p.guess === sum);
        this.msg = hit ? `Deu ${sum}! ${hit.me ? 'Você acertou' : hit.name + ' acertou'} e larga um palito.` : `Deu ${sum}. Ninguém acertou.`;
        if (hit) { hit.left--; this._say(hit, hit.me ? 'Acertei!' : this._pick1(['Na mosca!', 'É meu!', 'Hehe, larguei um.']), 1800); AudioFX.blip(hit.me ? 880 : 300, 0.12, 0.15); }
        this.log.push({ sum, guesses: P.map((p) => [p.name, p.guess, p.hide]) });
        await this._sleep(gen, 1800);
        this.starter = (this.starter + 1) % this.players.length;
        while (this.players[this.starter].out) this.starter = (this.starter + 1) % this.players.length;
    },

    // IA: esconde (os bons variam mais; os fracos repetem o "meio")
    _aiHide(p) {
        const R = this.READ[this.lvl], n = p.left;
        if (Math.random() < R) return Math.floor(Math.random() * (n + 1));
        return Math.min(n, Math.max(0, Math.round(n / 2 + (Math.random() - 0.5))));
    },
    // IA: chuta o total = o que tem + o esperado dos outros, lendo quem já chutou (chute alto = mão cheia).
    _aiGuess(p, P, said, total) {
        const R = this.READ[this.lvl];
        let est = p.hide;
        for (const q of P) {
            if (q === p) continue;
            let e = q.left / 2;
            if (q.guess != null && Math.random() < R) {                    // ele chutou X: tirando o que ele espera dos outros, sobra a mão dele
                const restMean = P.filter((z) => z !== q).reduce((s, z) => s + z.left / 2, 0);
                e = Math.max(0, Math.min(q.left, q.guess - restMean));
                e = e * 0.7 + (q.left / 2) * 0.3;
            }
            est += e;
        }
        let g = Math.round(est + (Math.random() - 0.5) * (1.6 - R));
        g = Math.max(0, Math.min(total, g));
        if (said.includes(g)) { for (let d = 1; d <= total; d++) { if (g + d <= total && !said.includes(g + d)) { g += d; break; } if (g - d >= 0 && !said.includes(g - d)) { g -= d; break; } } }
        return g;
    },
    _pick1(a) { return a[Math.floor(Math.random() * a.length)]; },

    _ask(gen, label, values, ok) {
        const bar = this.$('poBar');
        bar.innerHTML = `<b>${label}</b>` + values.map((v) => `<button class="ui-btn ${ok(v) ? 'pri' : ''}" data-v="${v}" ${ok(v) ? '' : 'disabled'}>${v}</button>`).join('');
        bar.style.display = 'flex';
        return new Promise((res, no) => {
            this._pick = true;
            for (const b of bar.querySelectorAll('button')) b.onclick = () => { bar.style.display = 'none'; this._pick = null; if (gen !== this._gen) return no(this.CANCEL); res(+b.dataset.v); };
        });
    },
    _say(p, text, ms = 1600) { this.bubbles = (this.bubbles || []).filter((b) => b.p !== p); this.bubbles.push({ p, text, t: 0, life: ms / 1000 }); },
    _pot() {
        const P = this.$('poPot'); if (!P) return;
        P.style.visibility = this.phase === 'play' ? 'visible' : 'hidden';
        P.innerHTML = `<b>${brl(this.pot || 0)}</b><small>no pote</small>`;
        this.$('poQuit').textContent = this.phase === 'play' ? 'Desistir' : 'Sair';
    },
    _quit() {
        if (this.phase !== 'play') { this.close(); return; }
        if (!this._qT || performance.now() - this._qT > 2500) { this._qT = performance.now(); this.msg = 'Desistir perde a aposta — clique/ESC de novo para confirmar'; return; }
        this._gen++; this.$('poBar').style.display = 'none'; this._pick = null;
        this._end(null);
    },
    _end(w) {
        this.phase = 'end'; this._pot();
        const won = w && w.me;
        if (won) { this.g.inventory.cash += this.pot; AudioFX.blip(880, 0.12, 0.2); setTimeout(() => AudioFX.blip(1320, 0.18, 0.2), 140); }
        else AudioFX.blip(160, 0.35, 0.2);
        if (typeof WorldMemory !== 'undefined' && won && this.pot >= 1500) WorldMemory.log('bigwin', { game: 'porrinha', value: this.pot, place: this.shop && this.shop.name });
        const M = this.$('poModal');
        M.style.display = 'flex';
        M.innerHTML = `<div class="po-box"><div style="font-family:var(--emoji);font-size:44px">${won ? '🏆' : w ? w.emo : '🏳️'}</div>
            <div class="po-big" style="color:${won ? '#86efac' : '#fb7185'}">${won ? 'Você levou o pote!' : w ? w.name + ' levou o pote' : 'Você desistiu'}</div>
            <p>${won ? `+${brl(this.pot)}` : `A aposta de ${brl(this.bet)} ficou na mesa.`}</p>
            <button class="ui-btn pri" id="poAgain">Outra rodada</button> <button class="ui-btn" id="poBack">Voltar ao bar</button></div>`;
        this.$('poAgain').onclick = () => this._setup();
        this.$('poBack').onclick = () => this.close();
    },

    // ------------------------------------------------------------------ desenho
    _seat(i, n) {                                                        // você embaixo; os outros em arco em cima
        if (i === 0) return { x: this.cx, y: this.cy + this.th * 0.28 };
        const a = Math.PI * (0.18 + 0.64 * ((i - 1) / Math.max(1, n - 2)));
        const k = n === 2 ? 0.5 : (i - 1) / (n - 2);
        return { x: this.cx - this.tw * 0.32 + this.tw * 0.64 * k, y: this.cy - this.th * 0.22 - Math.sin(a) * this.th * 0.04 };
    },
    _frame(dt) {
        for (const b of this.bubbles || []) b.t += dt;
        if (this.bubbles) this.bubbles = this.bubbles.filter((b) => b.t < b.life);
        const x = this.ctx, d = this.dpr;
        x.setTransform(d, 0, 0, d, 0, 0);
        x.drawImage(this._background(), 0, 0, this.vw, this.vh);
        if (this.phase === 'setup') return;
        const P = this.players, n = P.length, time = performance.now() / 1000;
        P.forEach((p, i) => this._drawPlayer(x, p, this._seat(i, n), time, i));
        if (this.msg) {
            x.save(); x.font = '600 15px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
            const tw = Math.min(this.vw - 24, x.measureText(this.msg).width + 36);
            x.fillStyle = 'rgba(16,13,10,0.85)'; this._rr(x, this.cx - tw / 2, this.cy - 18, tw, 36, 18); x.fill();
            x.fillStyle = '#f5efe3'; x.fillText(this.msg, this.cx, this.cy + 0.5, tw - 20); x.restore();
        }
    },
    _drawPlayer(x, p, S, time, i) {
        const r = Math.max(22, this.cw * 0.32), fist = this.cw * 0.42;
        // avatar + nome
        const ay = i === 0 ? S.y + this.cw * 0.95 : S.y - this.cw * 0.95;
        x.save();
        x.fillStyle = i === 0 ? '#1f4d3a' : '#4d1f2a'; x.beginPath(); x.arc(S.x, ay, r, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.3)'; x.lineWidth = 1.5; x.stroke();
        x.font = `${Math.round(r * 1.15)}px ${this._emoji}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(p.emo, S.x, ay + r * 0.05);
        x.font = '700 13px system-ui, sans-serif'; x.fillStyle = p.out ? '#86efac' : '#f5efe3';
        x.fillText(p.name + (p.out ? ' ✓' : ''), S.x, i === 0 ? ay + r + 12 : ay - r - 12);
        // palitos que ainda tem (deitados na frente)
        for (let k = 0; k < p.left; k++) this._stick(x, S.x - this.cw * 0.95 + k * 9, S.y + (i === 0 ? -this.cw * 0.1 : this.cw * 0.1), Math.PI / 2 + (k - 1) * 0.08, this.cw * 0.42);
        // o punho (fechado, balançando) ou a mão aberta com o que escondeu
        const shake = p.shake ? Math.abs(Math.sin(time * 9 + i)) * 8 : 0;
        const fx = S.x + this.cw * 0.25, fy = S.y - shake;
        x.save(); x.translate(fx, fy); if (i !== 0) x.rotate(Math.PI);
        if (p.open > 0 && p.hide != null) this._hand(x, fist, p.hide, p.open);
        else this._fist(x, fist);
        x.restore();
        // chute
        if (p.guess != null) {
            x.font = '800 14px system-ui, sans-serif'; x.fillStyle = '#fde68a';
            x.fillText(`chute: ${p.guess}`, S.x + this.cw * 1.15, S.y);
        }
        const b = (this.bubbles || []).find((q) => q.p === p);
        if (b) {
            const k = Math.min(1, b.t / 0.12), tx = b.text; x.font = '800 15px system-ui, sans-serif';
            const tw = x.measureText(tx).width + 22, by = i === 0 ? S.y - this.cw * 0.75 : S.y + this.cw * 0.45;
            x.globalAlpha = Math.min(1, (b.life - b.t) / 0.25); x.save(); x.translate(S.x - this.cw * 0.9, by); x.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
            x.fillStyle = '#fffaf0'; this._rr(x, -tw / 2, -15, tw, 30, 15); x.fill(); x.fillStyle = '#1f1308'; x.fillText(tx, 0, 1); x.restore();
        }
        x.restore();
    },
    _stick(x, X, Y, rot, L) {
        x.save(); x.translate(X, Y); x.rotate(rot);
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(-L / 2 + 1.5, 0.5, L, 3.2);
        const w = x.createLinearGradient(0, -1.6, 0, 1.6); w.addColorStop(0, '#f1d9a6'); w.addColorStop(1, '#c79a5b');
        x.fillStyle = w; x.fillRect(-L / 2, -1.6, L, 3.2);
        x.restore();
    },
    _skin(x, R) { const g = x.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.1, 0, 0, R * 1.2); g.addColorStop(0, '#d9a27a'); g.addColorStop(1, '#8a5a3a'); return g; },
    _fist(x, R) {
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(4, 8, R * 0.95, R * 0.7, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = this._skin(x, R); this._rr(x, -R * 0.8, -R * 0.6, R * 1.6, R * 1.2, R * 0.45); x.fill();
        x.strokeStyle = 'rgba(60,30,15,0.55)'; x.lineWidth = 1.2;
        for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(-R * 0.8 + k * R * 0.4, -R * 0.55); x.lineTo(-R * 0.8 + k * R * 0.4, R * 0.1); x.stroke(); }
        x.fillStyle = this._skin(x, R); this._rr(x, -R * 0.95, -R * 0.1, R * 0.55, R * 0.5, R * 0.2); x.fill(); x.stroke();     // o polegar
    },
    _hand(x, R, k, open) {
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(4, 8, R, R * 0.8, 0, 0, Math.PI * 2); x.fill();
        const s = 0.8 + 0.2 * open;
        x.save(); x.scale(s, s);
        x.fillStyle = this._skin(x, R); this._rr(x, -R * 0.85, -R * 0.75, R * 1.7, R * 1.5, R * 0.5); x.fill();
        x.fillStyle = '#c48a62'; this._rr(x, -R * 0.65, -R * 0.5, R * 1.3, R * 1.0, R * 0.4); x.fill();      // a palma
        for (let j = 0; j < k; j++) this._stick(x, (j - (k - 1) / 2) * R * 0.32, 0, Math.PI / 2 + (j - 1) * 0.15, R * 1.1);
        if (!k) { x.font = `800 ${Math.round(R * 0.45)}px system-ui`; x.fillStyle = 'rgba(60,30,15,0.7)'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('0', 0, 0); }
        x.restore();
    },
};
