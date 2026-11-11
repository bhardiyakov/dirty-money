// ============================================================================
// Juice — o "SUCO" do jogo: o retorno que faz cada conquista PARECER uma conquista. Antes, ganhar dinheiro, subir de nível, cumprir
// missão e despistar a polícia eram todos a mesma linha de texto no topo da tela (Game._flash), que a mensagem seguinte apagava.
//   • FAIXA      o momento grande no meio da tela, como o "MISSÃO CUMPRIDA" do GTA: nível novo, missão/trabalho concluído, fuga,
//                conquista, meta, promoção, desafio do dia. Uma por vez, em fila, com fanfarra (acorde arpejado, sem arquivos). Nas
//                maiores (nível, conquista, promoção, dia completo), papel picado.
//   • FLUTUANTE  o número que sobe de cima do personagem: +R$ / −R$ (lido da carteira, sem gancho em quem paga), XP de risco…
//   • BARRA DE XP uma pílula no topo que aparece uns segundos quando entra XP: nível, quanto falta e o que acabou de entrar.
//   • LUZES      procurado e À VISTA da polícia: vermelho de um lado e azul do outro nas bordas da tela, alternando (devagar: ~1 Hz).
//   • CORAÇÃO    vida baixa: batimento (tum-tum) cada vez mais rápido — o shader da gradação tira a cor da tela junto (ScreenFx).
//   • SAVE       o jogo não salva sozinho (só no menu e dormindo): depois de 8 min sem salvar, num momento calmo, um lembrete; e o
//                navegador pergunta antes de fechar a aba com mais de 2 min de jogo sem salvar (não no aplicativo de PC).
// Tudo é DOM/CSS por cima do canvas e Web Audio: nada entra na cena 3D. Nada aqui muda regra de jogo.
// As luzes da polícia e o batimento obedecem a Ajustes › Efeitos de tela (settings.screenFx).
// ============================================================================

const Juice = {
    KINDS: {
        level: ['SUBIU DE NÍVEL', '#fbbf24'], mission: ['MISSÃO CUMPRIDA', '#fbbf24'], job: ['TRABALHO CONCLUÍDO', '#fbbf24'], rank: ['PROMOVIDO', '#fbbf24'],
        escape: ['VOCÊ ESCAPOU', '#34d399'], achievement: ['CONQUISTA', '#a78bfa'], goal: ['META BATIDA', '#22d3ee'], daily: ['DESAFIO DO DIA', '#fb923c'],
        streak: ['SEQUÊNCIA', '#fb923c'],
    },
    HOLD: 2.6,                // s de cada faixa na tela
    NAG: 480,                 // s de jogo sem salvar até o lembrete (e entre um lembrete e outro)
    _q: [], _cur: null, _bt: 0, _cash: null, _cashT: 0, _heartT: 0, _xpT: 0, _xpGain: 0, _copT: 0, _floats: 0, _built: false,
    _unsaved: 0, _nagAt: 0, _writes: 0,

    fxOn() { const g = window.game, s = g && g.menu && g.menu.settings; return !s || s.screenFx !== false; },
    _ready(g) { return !!(g && g._loadingHidden && g.player); },

    // ------------------------------------------------------------------ montagem (uma vez)
    _build() {
        if (this._built) return;
        this._built = true;
        const st = document.createElement('style');
        st.textContent = `
            #jBanner { position: fixed; left: 50%; top: 19%; transform: translateX(-50%); z-index: 13; pointer-events: none; text-align: center; white-space: nowrap;
                font-family: var(--font-d); color: var(--jc, #fbbf24); opacity: 0; }
            #jBanner::before { content: ''; position: absolute; left: -22%; right: -22%; top: -34%; bottom: -34%; z-index: -1;
                background: radial-gradient(ellipse at center, rgba(4,6,12,0.62) 0%, rgba(4,6,12,0.34) 42%, rgba(4,6,12,0) 72%); }
            #jBanner .k { font: 800 13px var(--font-d); letter-spacing: 0.42em; text-indent: 0.42em; text-transform: uppercase; color: #fff; opacity: 0.92; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
            #jBanner .t { font: 800 clamp(30px, 5.2vw, 62px)/1.05 var(--font-d); letter-spacing: 0.03em; text-transform: uppercase; padding: 4px 34px 6px; position: relative;
                text-shadow: 0 3px 0 rgba(0,0,0,0.55), 0 8px 26px rgba(0,0,0,0.7);
                text-shadow: 0 3px 0 rgba(0,0,0,0.55), 0 8px 26px rgba(0,0,0,0.7), 0 0 34px color-mix(in srgb, var(--jc, #fbbf24) 55%, transparent); }
            #jBanner .t::before, #jBanner .t::after { content: ''; position: absolute; left: 50%; height: 2px; width: 0; transform: translateX(-50%); border-radius: 2px;
                background: linear-gradient(90deg, transparent, var(--jc, #fbbf24), transparent); transition: width .45s ease .1s; }
            #jBanner .t::before { top: 0; } #jBanner .t::after { bottom: 0; }
            #jBanner .s { font: 600 15px var(--font); color: #f2f4f8; margin-top: 7px; text-shadow: 0 2px 8px rgba(0,0,0,0.85); white-space: normal; max-width: 80vw; }
            #jBanner.in { animation: jBanIn .32s cubic-bezier(.2,1.35,.4,1) forwards; }
            #jBanner.in .t::before, #jBanner.in .t::after { width: 100%; }
            #jBanner.out { animation: jBanOut .42s ease-in forwards; }
            @keyframes jBanIn { from { opacity: 0; transform: translateX(-50%) scale(1.28); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
            @keyframes jBanOut { from { opacity: 1; transform: translateX(-50%) scale(1); } to { opacity: 0; transform: translateX(-50%) translateY(-14px) scale(0.98); } }
            #jGlow { position: fixed; inset: 0; z-index: 9; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at 50% 30%, var(--jc, #fbbf24) 0%, transparent 62%); }
            #jGlow.go { animation: jGlow .9s ease-out forwards; }
            @keyframes jGlow { 0% { opacity: 0.34; } 100% { opacity: 0; } }

            #jConf { position: fixed; left: 50%; top: 24%; width: 0; height: 0; z-index: 12; pointer-events: none; }
            #jConf i { position: absolute; left: 0; top: 0; width: 9px; height: 5px; border-radius: 1px; opacity: 0; animation: jConf 1.25s cubic-bezier(.12,.7,.3,1) forwards; }
            @keyframes jConf { 0% { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(0.6); } 70% { opacity: 1; }
                100% { opacity: 0; transform: translate(var(--x), var(--y)) rotate(var(--r)) scale(1); } }
            #jFloat { position: fixed; inset: 0; z-index: 12; pointer-events: none; overflow: hidden; }
            #jFloat span { position: absolute; transform: translate(-50%, -50%); font: 800 22px var(--font-d); font-variant-numeric: tabular-nums; white-space: nowrap;
                text-shadow: 0 2px 0 rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.8); animation: jRise 1.35s cubic-bezier(.15,.75,.3,1) forwards; }
            #jFloat .cash { color: #86efac; } #jFloat .loss { color: #fb7185; font-size: 18px; } #jFloat .xp { color: #7dd3fc; font-size: 17px; }
            #jFloat .risk { color: #fde047; font-size: 20px; letter-spacing: 0.04em; } #jFloat .big { font-size: 30px; }
            @keyframes jRise { 0% { opacity: 0; transform: translate(-50%, -30%) scale(0.6); } 14% { opacity: 1; transform: translate(-50%, -70%) scale(1.18); }
                28% { transform: translate(-50%, -95%) scale(1); } 72% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -260%) scale(0.96); } }

            #jXp { position: fixed; left: 50%; top: 66px; transform: translateX(-50%) translateY(-8px); z-index: 11; pointer-events: none; display: flex; align-items: center; gap: 10px;
                padding: 6px 14px; border-radius: 999px; background: var(--glass); border: 1px solid var(--line-2); box-shadow: var(--shadow-s); color: var(--tx);
                font: 700 12px var(--font-d); letter-spacing: 0.06em; opacity: 0; transition: opacity .3s ease, transform .3s ease; }
            #jXp.show { opacity: 1; transform: translateX(-50%); }
            #jXp i { width: 150px; height: 6px; border-radius: 99px; background: rgba(255,255,255,0.1); overflow: hidden; position: relative; }
            #jXp i s { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #38bdf8, #a78bfa); transition: width .5s ease; box-shadow: 0 0 10px rgba(125,211,252,0.7); }
            #jXp em { font-style: normal; color: #7dd3fc; } #jXp.up { border-color: #fbbf24; } #jXp.up b { color: #fbbf24; }

            #jCops { position: fixed; inset: 0; z-index: 8; pointer-events: none; opacity: 0; transition: opacity .6s ease; }
            #jCops.on { opacity: var(--k, 0.5); }
            #jCops i { position: absolute; top: 0; bottom: 0; width: 17vw; opacity: 0.15; }
            #jCops .l { left: 0; background: linear-gradient(90deg, rgba(255,45,70,0.6), transparent); }
            #jCops .r { right: 0; background: linear-gradient(270deg, rgba(55,120,255,0.6), transparent); }
            #jCops.on .l { animation: jCopA 0.96s step-end infinite; } #jCops.on .r { animation: jCopB 0.96s step-end infinite; }
            @keyframes jCopA { 0% { opacity: 1; } 50% { opacity: 0.15; } 100% { opacity: 0.15; } }
            @keyframes jCopB { 0% { opacity: 0.15; } 50% { opacity: 1; } 100% { opacity: 1; } }

            body.mobile #jBanner { top: 15%; } body.mobile #jBanner .k { font-size: 10px; } body.mobile #jBanner .s { font-size: 12px; margin-top: 4px; }
            body.mobile #jFloat span { font-size: 17px; } body.mobile #jFloat .big { font-size: 22px; }
            body.mobile #jXp { top: 92px; padding: 4px 10px; font-size: 10px; gap: 7px; } body.mobile #jXp i { width: 90px; height: 5px; }
            @media (prefers-reduced-motion: reduce) { #jCops.on .l, #jCops.on .r { animation: none; opacity: 0.5; } #jGlow.go { animation: none; } }`;
        document.head.appendChild(st);
        const mk = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
        this.elGlow = mk('jGlow');
        this.elCops = mk('jCops', '<i class="l"></i><i class="r"></i>');
        this.elFloat = mk('jFloat');
        this.elXp = mk('jXp', '<b></b><i><s></s></i><em></em>');
        this.elConf = mk('jConf');
        // fechar a aba com progresso sem salvar: o navegador pergunta (o aplicativo de PC fecha direto)
        window.addEventListener('beforeunload', (e) => {
            const g = window.game;
            if (!g || !g._loadingHidden || this._unsaved < 120 || window.__TAURI__ || window.__TAURI_INTERNALS__) return;
            e.preventDefault(); e.returnValue = '';
        });
        this.elBan = mk('jBanner', '<div class="k"></div><div class="t"></div><div class="s"></div>');
    },

    // Papel picado saindo da faixa (só nas grandes: nível, conquista, promoção, dia completo).
    _confetti(color) {
        if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const box = this.elConf, cols = [color, '#ffffff', '#fbbf24', '#34d399', '#60a5fa', '#f472b6'], W = Math.min(520, window.innerWidth * 0.42);
        box.replaceChildren();
        for (let i = 0; i < 26; i++) {
            const e = document.createElement('i'), a = Math.random() * Math.PI * 2, d = 0.35 + Math.random() * 0.65;
            e.style.background = cols[i % cols.length];
            e.style.setProperty('--x', (Math.cos(a) * W * d).toFixed(0) + 'px');
            e.style.setProperty('--y', (Math.sin(a) * 150 * d + 110 + Math.random() * 90).toFixed(0) + 'px');
            e.style.setProperty('--r', ((Math.random() - 0.5) * 900).toFixed(0) + 'deg');
            e.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
            box.appendChild(e);
        }
        clearTimeout(this._confT);
        this._confT = setTimeout(() => box.replaceChildren(), 1600);
    },

    // ------------------------------------------------------------------ som (sintetizado, agendado no relógio do áudio)
    // Uma nota: freq (Hz), começa daqui a `at` s, dura `dur` s. Usa o mestre do AudioFX (volume e mudo dos Ajustes valem).
    _tone(freq, at = 0, dur = 0.18, vol = 0.12, type = 'triangle') {
        if (typeof AudioFX === 'undefined' || !AudioFX._ok()) return;
        const ctx = AudioFX.ctx, t0 = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0008, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
        o.connect(g); g.connect(AudioFX.master);
        o.start(t0); o.stop(t0 + dur + 0.03);
    },
    // Fanfarra de cada faixa: arpejo que sobe (maior = vitória) — a de nível e a de conquista fecham com o acorde junto.
    _fanfare(kind) {
        const N = { C5: 523.25, E5: 659.25, G5: 783.99, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A5: 880, F5: 698.46 };
        const seq = kind === 'level' || kind === 'achievement' || kind === 'rank' ? [N.C5, N.E5, N.G5, N.C6, N.E6]
            : kind === 'escape' ? [N.G5, N.B5, N.D6, N.G6]
            : kind === 'daily' || kind === 'streak' ? [N.F5, N.A5, N.C6, N.E6]
            : [N.E5, N.G5, N.C6];
        seq.forEach((f, i) => this._tone(f, i * 0.075, 0.22, 0.11));
        const last = seq.length * 0.075;
        if (seq.length >= 4) { this._tone(seq[0], last, 0.5, 0.07, 'sine'); this._tone(seq[2], last, 0.5, 0.07, 'sine'); this._tone(seq[seq.length - 1], last, 0.55, 0.09); }
    },
    coin() { this._tone(1567.98, 0, 0.07, 0.05); this._tone(2093, 0.06, 0.12, 0.05); },
    whoosh() { if (typeof AudioFX !== 'undefined' && AudioFX._ok()) AudioFX._burst(AudioFX.listener.x, AudioFX.listener.z, { vol: 0.2, dur: 0.22, f0: 900, f1: 3800, type: 'bandpass', q: 1.2, att: 0.05 }); },

    // ------------------------------------------------------------------ API
    // Faixa grande no meio da tela. kind: ver KINDS. As repetidas em fila viram uma só; no máximo 4 esperando.
    banner(kind, title, sub = '') {
        const g = window.game;
        if (!this._ready(g) || !title) return;
        const last = this._q[this._q.length - 1] || this._cur;
        if (last && last.kind === kind && last.title === title) return;
        if (this._q.length >= 4) this._q.shift();
        this._q.push({ kind, title: String(title), sub: String(sub || '') });
    },

    // Número/palavra que sobe de cima do personagem (ou do veículo). cls: cash | loss | xp | risk (+ ' big').
    float(text, cls = 'cash') {
        const g = window.game;
        if (!this._ready(g) || this._floats >= 7) return;
        this._build();
        const p = this._screen(g), el = document.createElement('span');
        el.className = cls; el.textContent = text;
        el.style.left = (p.x + (Math.random() - 0.5) * 46).toFixed(0) + 'px';
        el.style.top = (p.y - this._floats * 22).toFixed(0) + 'px';
        this._floats++;
        const done = () => { if (el.parentNode) { el.remove(); this._floats = Math.max(0, this._floats - 1); } };
        el.addEventListener('animationend', done);
        setTimeout(done, 1700);                                        // (aba em segundo plano: a animação não termina)
        this.elFloat.appendChild(el);
    },

    // Onde o jogador (ou o veículo dele) está na TELA, em px de CSS — um pouco acima da cabeça. Sem cena pronta: o meio da tela.
    _screen(g) {
        const W = window.innerWidth, H = window.innerHeight, mid = { x: W / 2, y: H * 0.42 };
        try {
            const cam = g.camera.camera, eng = g.gameEngine.engine, sc = g.scene;
            const src = g.mode === 'car' && g.activeCar ? g.activeCar.position : g.mode === 'heli' && g.chopper ? g.chopper.position : g.player.position;
            const rw = eng.getRenderWidth(), rh = eng.getRenderHeight();
            const v = BABYLON.Vector3.Project(this._v.set(src.x, (src.y || 0) + 2.3, src.z), BABYLON.Matrix.IdentityReadOnly, sc.getTransformMatrix(), cam.viewport.toGlobal(rw, rh));
            const x = v.x / rw * W, y = v.y / rh * H;
            if (!(x > 40 && x < W - 40 && y > 60 && y < H - 60)) return mid;
            return { x, y };
        } catch (e) { return mid; }
    },
    _v: typeof BABYLON !== 'undefined' ? new BABYLON.Vector3() : null,

    // Entrou XP (SkillTree.addXp): a pílula mostra o nível, a barra e o que entrou; nível novo = faixa.
    xp(st, gained, levelBefore) {
        const g = window.game;
        if (!this._ready(g) || !(gained > 0)) return;
        this._build();
        const L = st.level, a = SkillTree.xpFor(L), b = SkillTree.xpFor(L + 1), pct = Math.max(0, Math.min(100, (st.xp - a) / Math.max(1, b - a) * 100));
        this._xpGain = (this._xpT > 0 ? this._xpGain : 0) + gained;
        const el = this.elXp;
        el.children[0].textContent = 'NV ' + L;
        el.children[1].firstChild.style.width = pct.toFixed(1) + '%';
        el.children[2].textContent = '+' + this._xpGain + ' XP';
        el.classList.toggle('up', L > levelBefore);
        el.classList.add('show');
        this._xpT = 3.4;
        if (L > levelBefore) this.banner('level', 'Nível ' + L, `+${L - levelBefore} ponto${L - levelBefore > 1 ? 's' : ''} de habilidade · tecla O › Habilidades`);
    },

    // ------------------------------------------------------------------ quadro
    update(g, dt) {
        if (!this._ready(g)) return;
        this._build();
        dt = Math.min(0.1, dt || 0);
        const busy = g.menu.isOpen || (g.endScreen && g.endScreen.visible) || !!g.sleeping;

        // ---- carteira: +R$ / −R$ em cima do personagem (o total e a diferença continuam no canto: Hud.cashPop)
        this._cashT -= dt;
        if (this._cashT <= 0) {
            this._cashT = 0.2;
            const inv = g.inventory, tot = (inv.cash || 0) + (inv.clean || 0), prev = this._cash;
            this._cash = tot;
            if (prev != null && !busy && !g.death && !g.arrest) {
                const d = Math.round(tot - prev);
                if (d >= 1) { this.float('+' + brl(d), d >= 1000 ? 'cash big' : 'cash'); this.coin(); }
                else if (d <= -1) this.float('−' + brl(-d), 'loss');
            }
        }

        // ---- lembrete de save (o jogo só salva no menu e dormindo)
        const W = typeof SaveGame !== 'undefined' ? SaveGame.writes || 0 : 0;
        if (W !== this._writes) { this._writes = W; this._unsaved = 0; this._nagAt = 0; }
        else if (!busy) this._unsaved += dt;
        if (this._unsaved - this._nagAt > this.NAG && !busy && !Interiors.active && !g._modalUiOpen() && !(g.missions && g.missions.cur) && !(g.careers && g.careers.job) && !SaveGame.blocked(g)) {
            this._nagAt = this._unsaved;
            g._flash(`💾 Faz ${Math.round(this._unsaved / 60)} min que você não salva — ESC › Salvar, ou durma na sua cama`);
        }

        // ---- pílula de XP
        if (this._xpT > 0 && (this._xpT -= dt) <= 0) this.elXp.classList.remove('show');

        // ---- faixas (a fila espera o menu, a tela de detido/morte e o sono)
        if (this._cur) {
            if (busy) { this.elBan.className = ''; this._cur = null; }                        // (abriu o menu no meio: a faixa sai; a fila continua depois)
            else {
                this._bt -= dt;
                if (this._bt <= 0.42 && !this._cur.out) { this._cur.out = true; this.elBan.className = 'out'; }
                if (this._bt <= 0) { this._cur = null; this.elBan.className = ''; }
            }
        } else if (this._q.length && !busy) {
            const b = this._cur = this._q.shift(), K = this.KINDS[b.kind] || this.KINDS.mission, el = this.elBan;
            el.style.setProperty('--jc', K[1]); this.elGlow.style.setProperty('--jc', K[1]);
            el.children[0].textContent = K[0]; el.children[1].textContent = b.title; el.children[2].textContent = b.sub;
            el.className = ''; void el.offsetWidth; el.className = 'in';                    // (reinicia a animação)
            this.elGlow.className = ''; void this.elGlow.offsetWidth; this.elGlow.className = 'go';
            this._bt = this.HOLD + (b.sub.length > 60 ? 0.9 : 0);
            this._fanfare(b.kind);
            if (b.kind === 'level' || b.kind === 'achievement' || b.kind === 'rank' || b.kind === 'streak') this._confetti(K[1]);
        }

        // ---- luzes da polícia nas bordas: procurado E à vista dela (não dentro de loja, nem com janela aberta)
        this._copT -= dt;
        if (this._copT <= 0) {
            this._copT = 0.25;
            const lvl = g.wanted ? g.wanted.level : 0;
            const on = this.fxOn() && lvl > 0 && !busy && !g.arrest && !g.death && !Interiors.active && !!g.policeManager && !!g.policeManager.playerSeen;
            if (on !== this._copOn) { this._copOn = on; this.elCops.classList.toggle('on', on); }
            if (on && lvl !== this._copLvl) { this._copLvl = lvl; this.elCops.style.setProperty('--k', String(Math.min(0.85, 0.3 + lvl * 0.11))); }
        }

        // ---- coração: vida abaixo de 30% (mais rápido quanto menos vida)
        const pl = g.player, f = pl.maxHp > 0 ? pl.hp / pl.maxHp : 1;
        if (f < 0.3 && f > 0 && !busy && !g.death && !g.arrest && this.fxOn()) {
            this._heartT -= dt;
            if (this._heartT <= 0) {
                this._heartT = 0.55 + f * 1.6;
                this._beat(0); this._beat(0.16);
            }
        } else this._heartT = 0;
    },
    _beat(delay) { if (typeof AudioFX !== 'undefined' && AudioFX._ok()) AudioFX._burst(AudioFX.listener.x, AudioFX.listener.z, { vol: delay ? 0.2 : 0.28, dur: 0.1, f0: 150, f1: 42, maxDist: 60, delay }); },
};
