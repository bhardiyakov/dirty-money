// ============================================================================
// Pool — SINUCA (bola 8) nos bares. Mini-jogo em "outro mundo": enquanto a partida está aberta, o jogo 3D para por completo
// (sem update nem render) e a sinuca roda no próprio canvas em tela cheia, a 60 FPS.
//   • Física própria com EFEITO (a mesa é plana, as bolas giram em 3D): cada bola tem velocidade e rotação (ω em 3 eixos). Enquanto
//     o ponto de contato com o pano escorrega, o atrito de deslizamento freia a bola e acerta a rotação até ela ROLAR (5/7 da
//     velocidade de uma bola sem efeito); rolando, só a resistência ao rolamento. Assim saem sozinhos: a bola parada no choque
//     (tacada no centro, "stun"), o siga (efeito em cima) e o puxe (efeito embaixo) depois de bater numa bola. O efeito lateral
//     (inglês) muda o ângulo na tabela, solta um pouco a bola para o lado na saída do taco (squirt) e "joga" a bola atingida
//     (throw: atrito entre as bolas). Choque entre bolas quase elástico, tabelas com perda e atrito, quinas das caçapas.
//     Passo fixo de 1/300 s — determinística, o que a IA usa para simular jogadas (e a linha de previsão do jogador).
//   • Desenho em HD: cada bola é desenhada pixel a pixel como uma esfera de verdade — a pintura (lisa, listrada, número) gira com
//     a rotação dela, luz e brilho da luminária sobre a mesa, reflexo do pano. Mesa com madeira, tabelas de borracha recortadas nas
//     caçapas, diamantes, sombras suaves, taco com a tacada animada e o pó de giz.
//   • Controles: mirar no pano · força na barra (ou puxar com o mouse / ESPAÇO segura e solta) · EFEITO no círculo da branca
//     (clique/arraste), ↑ ↓ (em cima / embaixo), Q E (esquerda / direita) ou o analógico direito.
//   • Apostas: quanto maior a aposta, melhor o adversário (mira mais precisa, avalia mais jogadas, simula o resultado com efeito e
//     pensa na próxima bola). Mesmo o mais forte ainda erra às vezes.
// Regras (bola 8 simplificada): quem encaçapa primeiro define o grupo (lisas 1–7 / listradas 9–15). Falta = branca na caçapa,
// não tocar em nada ou tocar primeiro bola que não é sua → bola na mão para o adversário. A 8 só depois do grupo; antes = derrota.
// ============================================================================

const Pool = {
    active: false,
    W: 254, H: 127, R: 2.85,                         // mesa em cm (área de jogo), raio da bola
    A: 20, K: 0.16, VMAX: 520, DT: 1 / 300,           // rolando: dv/dt = −(A + K·v)
    MUSG: 196,                                       // deslizando: atrito do pano (μ·g, cm/s²)
    MU_BALL: 0.05, MU_RAIL: 0.2,                     // atrito bola × bola (throw) e bola × tabela (efeito na tabela)
    ZA: 10, ZK: 0.6,                                 // o efeito lateral morre: dω/dt = −(ZA + ZK·ω)
    E_BALL: 0.95, E_RAIL: 0.78, E_JAW: 0.6,
    CORNER: 9, MID: 6.2,
    SPIN_MAX: 0.55,                                  // até onde o taco pode bater fora do centro (fração do raio)
    LAMP: [127, 63.5, -150],                         // luminária sobre o centro da mesa (z negativo = para cima)

    STAKES: [
        { bet: 50, name: 'Chico Bola Sete', emo: '🧔', desc: 'Joga por diversão e erra bastante.' },
        { bet: 300, name: 'Russo do Taco', emo: '👨‍🦲', desc: 'Acerta as fáceis, se perde nas difíceis.' },
        { bet: 1500, name: 'Baiano Tabelinha', emo: '🧑‍🦱', desc: 'Já calcula a jogada e onde a branca vai parar.' },
        { bet: 8000, name: 'Mestre Valdir', emo: '👴', desc: 'Trinta anos de boteco. Puxa e segue a branca. Raramente perdoa.' },
        { bet: 30000, name: 'O Fantasma', emo: '🕶️', desc: 'Ninguém lembra de vê-lo perder. Quase ninguém.' },
    ],
    // sigma: erro de mira (graus) · pw: erro de força · cand: jogadas avaliadas · sim: jogadas simuladas · blunder: chance de vacilo
    // spin: usa efeito (puxe/siga) para posicionar a branca
    SKILL: [
        { sigma: 1.0, pw: 0.14, cand: 3, sim: 0, blunder: 0.2, pos: 0, spin: false },
        { sigma: 0.55, pw: 0.10, cand: 6, sim: 0, blunder: 0.12, pos: 0, spin: false },
        { sigma: 0.3, pw: 0.06, cand: 8, sim: 8, blunder: 0.07, pos: 0.5, spin: false },
        { sigma: 0.16, pw: 0.04, cand: 12, sim: 14, blunder: 0.045, pos: 1, spin: true },
        { sigma: 0.075, pw: 0.025, cand: 18, sim: 22, blunder: 0.04, pos: 1.4, spin: true },
    ],
    COLORS: ['#f7f4ea', '#f2c21b', '#1f4fc4', '#d7262b', '#5a2a8c', '#f07a1a', '#1f8a45', '#8a1f2a', '#121212'],

    // ------------------------------------------------------------------ abrir / fechar
    open(game, shop) {
        if (this.active) return;
        this.g = game; this.shop = shop; this.active = true; this.phase = 'setup';
        this._build();
        this.root.style.display = 'block';
        this._resize();
        this._renderSetup();
        this._last = performance.now();
        const loop = (t) => { if (!this.active) return; this._frame(Math.min(0.05, (t - this._last) / 1000)); this._last = t; this._raf = requestAnimationFrame(loop); };
        this._raf = requestAnimationFrame(loop);
    },

    close() {
        this.active = false;
        cancelAnimationFrame(this._raf);
        if (this.root) this.root.style.display = 'none';
        const g = this.g;
        if (g) { g.input.justPressed = {}; if (g.input.keys) for (const k of Object.keys(g.input.keys)) g.input.keys[k] = false; }
    },

    // ------------------------------------------------------------------ DOM
    _build() {
        if (this.root) return;
        const st = document.createElement('style');
        st.textContent = `
            #pool { position: fixed; inset: 0; z-index: 90; display: none; background: #070504; font-family: var(--font); color: var(--tx); user-select: none; touch-action: none; }
            #pool canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
            #pool .pl-top { position: absolute; left: 0; right: 0; top: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 12px 16px; pointer-events: none; }
            #pool .pl-card { display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 10px; border-radius: 16px; background: var(--glass); border: 1px solid var(--line-2);
                -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); min-width: 0; transition: box-shadow .2s, border-color .2s; }
            #pool .pl-card.turn { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold), 0 0 22px rgba(251,191,36,0.3); }
            #pool .pl-card .av { font-family: var(--emoji); font-size: 26px; line-height: 1; }
            #pool .pl-card b { display: block; font: 700 14px var(--font-d); white-space: nowrap; }
            #pool .pl-card small { display: flex; gap: 3px; align-items: center; min-height: 14px; font-size: 11px; color: var(--tx-2); }
            #pool .pl-card small i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; box-shadow: inset -2px -2px 3px rgba(0,0,0,0.35); }
            #pool .pl-card small i.st { background: radial-gradient(circle, #fff 0 34%, transparent 35%), var(--c) !important; }
            #pool .pl-card small i.out { opacity: 0.18; }
            #pool .pl-pot { text-align: center; padding: 8px 16px; border-radius: 16px; background: var(--glass); border: 1px solid var(--line-2); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
            #pool .pl-pot b { display: block; font: 800 18px var(--font-d); color: #86efac; }
            #pool .pl-pot small { font-size: 11px; color: var(--tx-2); }
            #pool .pl-msg { position: absolute; left: 50%; top: 84px; transform: translateX(-50%); padding: 9px 18px; border-radius: 99px; font: 600 14px var(--font); background: var(--glass-2);
                border: 1px solid var(--line-2); white-space: nowrap; pointer-events: none; transition: opacity .3s; max-width: 92vw; overflow: hidden; text-overflow: ellipsis; }
            #pool .pl-pow { position: absolute; right: 18px; top: 50%; width: 46px; height: min(300px, 52vh); transform: translateY(-50%); border-radius: 23px; background: var(--glass);
                border: 1px solid var(--line-2); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); cursor: ns-resize; touch-action: none; }
            #pool .pl-pow i { position: absolute; left: 7px; right: 7px; top: 7px; height: 0; border-radius: 16px; background: linear-gradient(180deg, #fde047, #fb923c 55%, #f43f5e); box-shadow: 0 0 14px rgba(251,146,60,0.6); }
            #pool .pl-pow span { position: absolute; left: 0; right: 0; bottom: -24px; text-align: center; font: 700 11px var(--font); color: var(--tx-2); letter-spacing: 0.06em; }
            #pool .pl-pow.off, #pool .pl-spin.off { opacity: 0.35; pointer-events: none; }
            #pool .pl-spin { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); width: 92px; padding: 10px 10px 8px; border-radius: 20px; background: var(--glass);
                border: 1px solid var(--line-2); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); text-align: center; touch-action: none; }
            #pool .pl-spin .face { position: relative; width: 72px; height: 72px; border-radius: 50%; cursor: crosshair; margin: 0 auto;
                background: radial-gradient(circle at 36% 30%, #fff 0, #f2efe6 38%, #c9c4b6 78%, #8f8a7e 100%); box-shadow: 0 3px 10px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.25); }
            #pool .pl-spin .face::before, #pool .pl-spin .face::after { content: ''; position: absolute; background: rgba(0,0,0,0.12); }
            #pool .pl-spin .face::before { left: 50%; top: 8%; bottom: 8%; width: 1px; } #pool .pl-spin .face::after { top: 50%; left: 8%; right: 8%; height: 1px; }
            #pool .pl-spin .tip { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #2f6fd6; box-shadow: 0 0 0 2px rgba(255,255,255,0.85), 0 0 10px rgba(47,111,214,0.8); pointer-events: none; }
            #pool .pl-spin b { display: block; margin-top: 6px; font: 700 10px var(--font); color: var(--tx-2); letter-spacing: 0.06em; }
            #pool .pl-spin small { display: block; font-size: 10px; color: var(--tx-3); min-height: 12px; }
            #pool .pl-bot { position: absolute; left: 16px; bottom: 14px; display: flex; gap: 8px; align-items: center; }
            #pool .pl-help { font-size: 12px; color: var(--tx-3); }
            #pool .pl-modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(5,4,3,0.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); padding: 16px; }
            #pool .pl-box { width: min(620px, 96vw); max-height: 94vh; overflow: auto; padding: 22px 24px; border-radius: 22px; background: var(--glass-2); border: 1px solid var(--line-2); box-shadow: var(--shadow); animation: modalIn .2s ease-out; }
            #pool .pl-box h2 { font: 800 26px var(--font-d); text-align: center; margin-bottom: 4px; }
            #pool .pl-box p.sub { text-align: center; font-size: 13px; color: var(--tx-2); margin-bottom: 14px; line-height: 1.5; }
            #pool .pl-opp { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 11px 14px; margin-top: 8px; border-radius: 14px; cursor: pointer;
                background: var(--card); border: 1px solid var(--line-2); color: var(--tx); font: inherit; transition: background .15s, border-color .15s; }
            #pool .pl-opp:hover:not([disabled]) { background: var(--card-h); border-color: var(--gold); }
            #pool .pl-opp[disabled] { opacity: 0.4; cursor: not-allowed; }
            #pool .pl-opp .av { font-family: var(--emoji); font-size: 30px; }
            #pool .pl-opp .t { flex: 1; min-width: 0; } #pool .pl-opp .t b { font: 700 15px var(--font-d); } #pool .pl-opp .t small { display: block; font-size: 12px; color: var(--tx-2); margin-top: 2px; }
            #pool .pl-opp .lv { color: var(--gold); letter-spacing: 1px; font-size: 12px; }
            #pool .pl-opp .bet { text-align: right; font: 800 16px var(--font-d); color: #86efac; white-space: nowrap; } #pool .pl-opp .bet small { display: block; font: 500 11px var(--font); color: var(--tx-3); }
            #pool .pl-rules { margin-top: 14px; font-size: 12px; line-height: 1.6; color: var(--tx-3); }
            #pool .pl-end { text-align: center; } #pool .pl-end .big { font: 800 44px var(--font-d); margin: 4px 0 2px; }
            #pool .pl-end .row { display: flex; gap: 10px; justify-content: center; margin-top: 18px; flex-wrap: wrap; }
            @media (max-height: 520px) { #pool .pl-top { padding: 6px 10px; } #pool .pl-card { padding: 5px 10px 5px 8px; } #pool .pl-card .av { font-size: 20px; } #pool .pl-msg { top: 58px; font-size: 12px; }
                #pool .pl-pow { right: 10px; width: 40px; } #pool .pl-pot b { font-size: 15px; }
                #pool .pl-spin { left: 8px; width: 70px; padding: 7px 6px 5px; } #pool .pl-spin .face { width: 54px; height: 54px; } }`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'pool';
        r.innerHTML = `<canvas></canvas>
            <div class="pl-top"><div class="pl-card" id="plP0"></div><div class="pl-pot" id="plPot"></div><div class="pl-card" id="plP1"></div></div>
            <div class="pl-msg" id="plMsg" style="opacity:0"></div>
            <div class="pl-spin" id="plSpin"><div class="face"><i class="tip"></i></div><b>EFEITO</b><small id="plSpinTx"></small></div>
            <div class="pl-pow" id="plPow"><i></i><span>FORÇA</span></div>
            <div class="pl-bot"><button class="ui-btn" id="plQuit">Desistir</button><button class="ui-btn pri" id="plSkip" style="display:none">⏩ Resultado</button><span class="pl-help" id="plHelp"></span></div>
            <div class="pl-modal" id="plModal"></div>`;
        document.body.appendChild(r);
        this.cv = r.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
        this.$ = (id) => document.getElementById(id);
        this.powEl = this.$('plPow');
        this.spinEl = this.$('plSpin'); this.spinFace = this.spinEl.querySelector('.face'); this.spinTip = this.spinEl.querySelector('.tip');
        this.spin = { a: 0, b: 0 };
        window.addEventListener('resize', () => { if (this.active) this._resize(); });
        // entrada: mira no pano, força na barra (ou arrastando para trás com o mouse), bola na mão arrastando a branca
        this.cv.addEventListener('pointerdown', (e) => this._pDown(e));
        window.addEventListener('pointermove', (e) => this._pMove(e));
        window.addEventListener('pointerup', (e) => this._pUp(e));
        this.cv.addEventListener('wheel', (e) => { if (this._canAim()) { e.preventDefault(); this.aim += (e.deltaY > 0 ? 1 : -1) * 0.0025; } }, { passive: false });
        this.powEl.addEventListener('pointerdown', (e) => { if (!this._canAim()) return; e.preventDefault(); this.powEl.setPointerCapture(e.pointerId); this.pull = { bar: true, y0: e.clientY }; this._barPow(e); });
        this.powEl.addEventListener('pointermove', (e) => { if (this.pull && this.pull.bar) this._barPow(e); });
        this.powEl.addEventListener('pointerup', () => { if (this.pull && this.pull.bar) { this.pull = null; this._release(); } });
        // efeito: onde o taco bate na branca (o círculo é a face da bola vista pelo jogador)
        const spinAt = (e) => {
            const r = this.spinFace.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
            this._setSpin(x * this.SPIN_MAX, -y * this.SPIN_MAX);
        };
        this.spinFace.addEventListener('pointerdown', (e) => { if (!this._canAim()) return; e.preventDefault(); this.spinFace.setPointerCapture(e.pointerId); this._spinDrag = true; spinAt(e); });
        this.spinFace.addEventListener('pointermove', (e) => { if (this._spinDrag) spinAt(e); });
        this.spinFace.addEventListener('pointerup', () => { this._spinDrag = false; });
        this.spinFace.addEventListener('dblclick', () => this._setSpin(0, 0));
        this.$('plQuit').addEventListener('click', () => this._quit());
        this.$('plSkip').addEventListener('click', () => this._skipWatch());
        window.addEventListener('keydown', (e) => this._key(e, true), true);
        window.addEventListener('keyup', (e) => this._key(e, false), true);
    },

    _resize() {
        const dpr = Math.min(2, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight;
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.dpr = dpr; this.vw = w; this.vh = h;
        const F = 17, top = h < 520 ? 52 : 82, side = h < 520 ? 92 : 128, bot = h < 520 ? 40 : 56;
        const s = Math.min((w - side * 2) / (this.W + 2 * F), (h - top - bot) / (this.H + 2 * F));
        this.sc = s; this.F = F;
        this.ox = (w - this.W * s) / 2; this.oy = top + (h - top - bot - this.H * s) / 2;
        this._static = null;
        if (this.balls) for (const b of this.balls) b.key = null;      // (bolas redesenhadas na resolução nova)
    },

    // ------------------------------------------------------------------ partida
    _renderSetup() {
        const cash = this.g.inventory.cash;
        this.$('plModal').style.display = 'flex';
        this.$('plModal').innerHTML = `<div class="pl-box"><h2>🎱 Sinuca · bola 8</h2>
            <p class="sub">${this.shop ? this.shop.name + ' · ' : ''}Escolha o adversário. Quanto maior a aposta, melhor ele joga.<br>Você tem <b style="color:#86efac">${brl(cash)}</b> (dinheiro vivo).</p>
            ${this.STAKES.map((o, i) => `<button class="pl-opp" data-i="${i}" ${cash < o.bet ? 'disabled' : ''}><span class="av">${o.emo}</span>
                <span class="t"><b>${o.name}</b> <span class="lv">${'★'.repeat(i + 1)}${'☆'.repeat(4 - i)}</span><small>${o.desc}${this._recordTxt(o.name)}</small></span>
                <span class="bet">${brl(o.bet)}<small>prêmio ${brl(o.bet * 2)}</small></span></button>`).join('')}
            <div class="pl-rules"><b>Regras:</b> quem encaçapa primeiro fica com o grupo (lisas 1–7 ou listradas 9–15). Encaçape o seu grupo e depois a 8.
            <b>Falta</b> (branca na caçapa, não tocar em nada ou tocar primeiro a bola errada) dá <b>bola na mão</b> ao adversário. Encaçapar a 8 antes da hora = derrota.<br>
            <b>Controles:</b> mire apontando no pano · força na barra da direita (ou segure o botão do mouse e puxe para trás) · ESPAÇO segura e solta · ← → ajuste fino · roda do mouse ajuste fino.<br>
            <b>Efeito:</b> clique no círculo da branca (à esquerda) onde o taco vai bater — <b>em cima</b> a branca segue a bola atingida, <b>embaixo</b> ela volta (puxe),
            <b>dos lados</b> muda o ângulo na tabela. Teclado: ↑ ↓ e Q E · controle: analógico direito.</div>
            <div class="row" style="display:flex;justify-content:center;margin-top:14px"><button class="ui-btn" id="plLeave">Voltar ao bar</button></div></div>`;
        this.$('plLeave').onclick = () => this.close();
        for (const b of this.$('plModal').querySelectorAll('.pl-opp')) b.onclick = () => this._startMatch(+b.dataset.i);
        this.phase = 'setup'; this._setupTable();
        this._hud();
    },

    // Histórico contra este adversário (WorldMemory) e a provocação dele.
    _recordTxt(name) {
        if (typeof WorldMemory === 'undefined') return '';
        const r = WorldMemory.record('pool', name); if (!r.w && !r.l) return '';
        const t = WorldMemory.taunt('pool', name);
        return `<br><b style="color:${r.w >= r.l ? '#86efac' : '#fda4af'}">Você ${r.w} × ${r.l}</b>${t ? ` · <i>“${t}”</i>` : ''}`;
    },
    // Assistir uma partida do bar (BarGames): a IA joga os dois lados. opts: { people: [A, B], lvl: [nível A, nível B], onEnd(vencedor), bet }.
    watch(game, shop, opts) {
        if (this.active) return;
        this.open(game, shop);
        this.watching = opts; this.skBy = [this.SKILL[opts.lvl[0]], this.SKILL[opts.lvl[1]]];
        this.opp = { name: opts.people[1].name, emo: opts.people[1].emo, bet: 0 }; this.lvl = Math.max(opts.lvl[0], opts.lvl[1]);
        this.$('plModal').style.display = 'none';
        this._setupTable();
        this.turn = 0; this.groups = [null, null]; this.broken = false; this.inHand = false; this.phase = 'aim';
        this.aim = 0; this.power = 0; this.pull = null; this.shots = 0; this._setSpin(0, 0);
        this._msg(`${opts.people[0].name} abre o jogo`);
        this._aiStart();
        this._hud();
    },
    // Pular: o resultado sai pelo nível de cada um (como no salão).
    _skipWatch() {
        const W = this.watching; if (!W || this.phase === 'end') return;
        const pA = Math.max(0.18, Math.min(0.82, 0.5 + 0.11 * (W.lvl[0] - W.lvl[1])));
        this._endWatch(Math.random() < pA ? 0 : 1, 'levou a partida');
    },
    _endWatch(winner, why) {
        const W = this.watching; this.watching = null; this.skBy = null;
        this.phase = 'end';
        if (W.onEnd) W.onEnd(winner);
        const b = W.bet, won = b && b.side === winner, P = W.people[winner];
        this.$('plModal').style.display = 'flex';
        this.$('plModal').innerHTML = `<div class="pl-box pl-end"><div style="font-family:var(--emoji);font-size:46px">${P.emo}</div>
            <div class="big" style="color:#fde047">${P.name} venceu</div>
            <p class="sub">${P.name} ${why}.${b ? (won ? ` Sua aposta pagou <b style="color:#86efac">+${brl(Math.round(b.bet * b.odds))}</b>.` : ` Você perdeu a aposta de ${brl(b.bet)}.`) : ''}</p>
            <div class="row"><button class="ui-btn pri" id="plBack">Voltar ao bar</button></div></div>`;
        this.$('plBack').onclick = () => this.close();
        this._hud();
    },
    _startMatch(lvl) {
        const o = this.STAKES[lvl], inv = this.g.inventory;
        if (inv.cash < o.bet) return;
        inv.cash -= o.bet;
        this.lvl = lvl; this.opp = o; this.sk = this.SKILL[lvl];
        this.$('plModal').style.display = 'none';
        this._setupTable();
        this.turn = 0; this.groups = [null, null]; this.broken = false; this.inHand = false; this.phase = 'aim';
        this.aim = 0; this.power = 0; this.pull = null; this.shots = 0; this._setSpin(0, 0);
        this._msg('Sua vez de abrir o jogo — capriche na tacada!');
        AudioFX.blip(520, 0.08, 0.15);
        this._hud();
    },

    _setupTable() {
        const R = this.R, W = this.W, H = this.H, b = [];
        b.push({ n: 0, x: W * 0.25, y: H / 2 });
        // triângulo no pé da mesa, 8 no centro, uma lisa e uma listrada nos cantos de trás
        const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15], ax = W * 0.72, d = 2 * R + 0.05;
        const slots = []; for (let r = 0; r < 5; r++) for (let k = 0; k <= r; k++) slots.push([r, k]);
        const fixed = { '2,1': 8, '4,0': 1, '4,4': 9 };
        const rest = order.filter((n) => n !== 8 && n !== 1 && n !== 9).sort(() => Math.random() - 0.5);
        for (const [r, k] of slots) {
            const n = fixed[r + ',' + k] || rest.pop();
            b.push({ n, x: ax + r * d * 0.866, y: H / 2 + (k - r / 2) * d });
        }
        for (const x of b) { this._still(x); x.in = false; x.drop = null; x.M = this._randRot(); x.key = null; }
        this.balls = b;
        this.fx = [];
        this._pred = null;
    },
    _still(b) { b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0; b.wz = 0; },
    // orientação inicial sorteada (matriz 3×3, local → mundo, por linhas)
    _randRot() {
        let ax = Math.random() - 0.5, ay = Math.random() - 0.5, az = Math.random() - 0.5; const l = hypot(ax, ay, az) || 1;
        return this._rotate([1, 0, 0, 0, 1, 0, 0, 0, 1], ax / l, ay / l, az / l, Math.random() * Math.PI * 2);
    },
    // M ← Rot(eixo, ângulo)·M (Rodrigues), reortonormalizada
    _rotate(M, x, y, z, a) {
        const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
        const r = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
        const o = new Array(9);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = r[i * 3] * M[j] + r[i * 3 + 1] * M[3 + j] + r[i * 3 + 2] * M[6 + j];
        // colunas ortonormais (Gram-Schmidt): o erro do passo não acumula
        let ux = o[0], uy = o[3], uz = o[6], l = hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
        let vx = o[1], vy = o[4], vz = o[7]; const d = vx * ux + vy * uy + vz * uz; vx -= d * ux; vy -= d * uy; vz -= d * uz; l = hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
        return [ux, vx, uy * vz - uz * vy, uy, vy, uz * vx - ux * vz, uz, vz, ux * vy - uy * vx];
    },

    // ------------------------------------------------------------------ física (pura: serve também à simulação da IA e à previsão)
    // Eixos: x para a direita, y para baixo (na tela), z para DENTRO da mesa (o pano fica em +z do centro da bola). ω em rad/s.
    _step(B, ev) {
        const dt = this.DT, R = this.R, W = this.W, H = this.H, C = this.CORNER, M = this.MID, D2 = 4 * R * R;
        const fr = this.MUSG * dt, I = 0.4 * R;                       // (I = momento de inércia ÷ (m·R): esfera maciça)
        let moving = false;
        for (const b of B) {
            if (b.in) continue;
            // ponto de contato com o pano: v + ω × (0, 0, R)
            const ux = b.vx + b.wy * R, uy = b.vy - b.wx * R, us = Math.sqrt(ux * ux + uy * uy);
            if (us > 0.4) {
                if (us <= 3.5 * fr) {                                   // para de escorregar neste passo: passa a rolar
                    b.vx -= ux / 3.5; b.vy -= uy / 3.5; b.wy = -b.vx / R; b.wx = b.vy / R;
                } else {                                                // escorregando: o atrito freia a bola e muda a rotação
                    const fx = -ux / us * fr, fy = -uy / us * fr;
                    b.vx += fx; b.vy += fy; b.wx -= fy / I; b.wy += fx / I;
                }
                moving = true;
            } else {
                const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
                if (s > 0) {
                    const ns = s - (this.A + this.K * s) * dt;
                    if (ns <= 1.2) { b.vx = 0; b.vy = 0; } else { b.vx *= ns / s; b.vy *= ns / s; moving = true; }
                }
                b.wy = -b.vx / R; b.wx = b.vy / R;
            }
            if (b.wz) { const z = Math.abs(b.wz), nz = z - (this.ZA + this.ZK * z) * dt; b.wz = nz <= 0 || (b.vx === 0 && b.vy === 0) ? 0 : Math.sign(b.wz) * nz; }
            b.x += b.vx * dt; b.y += b.vy * dt;
        }
        // bola × bola (até 3 passadas, enquanto houver contato: a energia atravessa o triângulo na saída, como na mesa de verdade)
        const R2 = 2 * R;
        for (let pass = 0, touch = true; pass < 3 && touch; pass++) { touch = false; for (let i = 0; i < B.length; i++) {
            const a = B[i]; if (a.in) continue;
            for (let j = i + 1; j < B.length; j++) {
                const c = B[j]; if (c.in) continue;
                const dx = c.x - a.x; if (dx >= R2 || dx <= -R2) continue;
                const dy = c.y - a.y; if (dy >= R2 || dy <= -R2) continue;
                const d2 = dx * dx + dy * dy;
                if (d2 >= D2 || d2 === 0) continue;
                touch = true;
                const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
                const ov = (2 * R - d) / 2; a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
                if (vn <= 0) continue;
                const jn = (1 + this.E_BALL) / 2 * vn;
                a.vx -= jn * nx; a.vy -= jn * ny; c.vx += jn * nx; c.vy += jn * ny;
                // throw: atrito no ponto de contato (corte e efeito lateral "jogam" a bola atingida um pouco para o lado)
                const rx = (a.vx - c.vx) - (a.wz + c.wz) * R * ny, ry = (a.vy - c.vy) + (a.wz + c.wz) * R * nx;
                const rn = rx * nx + ry * ny, tx = rx - rn * nx, ty = ry - rn * ny, tl = Math.sqrt(tx * tx + ty * ty);
                if (tl > 1e-6) {
                    const jt = Math.min(this.MU_BALL * jn, tl / 7), ex = tx / tl, ey = ty / tl, cr = nx * ey - ny * ex;
                    a.vx -= jt * ex; a.vy -= jt * ey; c.vx += jt * ex; c.vy += jt * ey;
                    a.wz -= jt * cr / I; c.wz -= jt * cr / I;
                }
                if (ev.first == null && (a.n === 0 || c.n === 0)) ev.first = a.n === 0 ? c.n : a.n;
                if (ev.cueHit == null && (a.n === 0 || c.n === 0)) ev.cueHit = { x: a.n === 0 ? a.x : c.x, y: a.n === 0 ? a.y : c.y };
                if (ev.vis && vn > 25 && pass === 0) ev.sounds.push(['ball', vn]);
            }
        } }
        // tabelas (fora das bocas), quinas das bocas e caçapas
        for (const b of B) {
            if (b.in) continue;
            const inCornerY = b.y < C || b.y > H - C, inCornerX = b.x < C || b.x > W - C, inMid = Math.abs(b.x - W / 2) < M;
            if (b.x < R && !inCornerY) { b.x = R; this._cushion(b, -1, 0, this.E_RAIL, ev); }
            if (b.x > W - R && !inCornerY) { b.x = W - R; this._cushion(b, 1, 0, this.E_RAIL, ev); }
            if (b.y < R && !inCornerX && !inMid) { b.y = R; this._cushion(b, 0, -1, this.E_RAIL, ev); }
            if (b.y > H - R && !inCornerX && !inMid) { b.y = H - R; this._cushion(b, 0, 1, this.E_RAIL, ev); }
            if (inCornerX || inCornerY || inMid) {
                for (const [px, py] of this._jaws) {
                    const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
                    if (d2 >= R * R || d2 === 0) continue;
                    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
                    b.x = px + nx * R; b.y = py + ny * R;
                    this._cushion(b, -nx, -ny, this.E_JAW, ev);
                }
                for (const p of this._pockets) {
                    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < p.r * p.r) {
                        b.in = true; ev.pocketed.push(b.n);
                        if (ev.vis) { ev.sounds.push(['pocket', 1]); b.drop = { t: 0, x: b.x, y: b.y, px: p.x, py: p.y, vx: b.vx, vy: b.vy }; }
                        this._still(b);
                        break;
                    }
                }
            }
            if (!b.in && (b.x < -9 || b.x > W + 9 || b.y < -9 || b.y > H + 9)) { b.in = true; this._still(b); ev.pocketed.push(b.n); }
        }
        return moving;
    },
    // Bola batendo numa tabela (ou quina) com a normal (nx, ny) apontando da bola para ela: perde parte da velocidade normal e o
    // atrito no contato puxa a bola pelo efeito lateral (e o gasta) — o ângulo de saída "abre" ou "fecha".
    _cushion(b, nx, ny, e, ev) {
        const vn = b.vx * nx + b.vy * ny;
        if (vn <= 0) return;
        const R = this.R;
        b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
        // (no contato, quem escorrega é o efeito lateral; a bola rolando ao longo da tabela quase não perde o ângulo)
        const tx = -ny, ty = nx, ut = (b.vx * tx + b.vy * ty) * 0.15 + b.wz * R;
        const lim = this.MU_RAIL * (1 + e) * vn, jt = Math.max(-lim, Math.min(lim, ut / 3.5));
        b.vx -= jt * tx; b.vy -= jt * ty; b.wz -= jt / (0.4 * R);
        // o nariz da tabela fica na altura em que a bola rolando volta rolando: o rolamento (siga/puxe) também rebate, com a perda
        let rx = -b.wy * R, ry = b.wx * R; const rn = rx * nx + ry * ny;
        if (rn > 0) { rx -= (1 + e) * rn * nx; ry -= (1 + e) * rn * ny; b.wy = -rx / R; b.wx = ry / R; }
        ev.rail = true;
        if (ev.vis) ev.sounds.push(['rail', vn]);
    },
    get _pockets() {
        if (this.__p) return this.__p;
        const W = this.W, H = this.H, o = 2.2, mo = 4.2;
        return (this.__p = [{ x: -o, y: -o, r: 6.2 }, { x: W + o, y: -o, r: 6.2 }, { x: -o, y: H + o, r: 6.2 }, { x: W + o, y: H + o, r: 6.2 }, { x: W / 2, y: -mo, r: 5.4 }, { x: W / 2, y: H + mo, r: 5.4 }]);
    },
    get _jaws() {
        if (this.__j) return this.__j;
        const W = this.W, H = this.H, C = this.CORNER, M = this.MID;
        return (this.__j = [[C, 0], [0, C], [W - C, 0], [W, C], [0, H - C], [C, H], [W, H - C], [W - C, H], [W / 2 - M, 0], [W / 2 + M, 0], [W / 2 - M, H], [W / 2 + M, H]]);
    },

    _speedOf(p) { return 18 + (this.VMAX - 18) * Math.max(0, Math.min(1, p)); },
    _powOf(v) { return Math.max(0, Math.min(1, (v - 18) / (this.VMAX - 18))); },
    // distância percorrida até parar com velocidade v (rolando), e o inverso
    _dist(v) { const A = this.A, K = this.K; return v / K - A / (K * K) * Math.log(1 + K * v / A); },
    _invDist(s) { let lo = 0, hi = 2000; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (this._dist(m) < s) lo = m; else hi = m; } return lo; },

    // ------------------------------------------------------------------ tacada
    // O taco bate na branca no ponto (a, b) da face dela (fração do raio: a = direita, b = em cima): velocidade na direção da mira e
    // rotação r × J / I. A tacada com efeito lateral solta a branca um pouco para o lado oposto (squirt).
    _strike(cue, ang, v, a, b) {
        const R = this.R, sq = -a * 0.045, dx = Math.cos(ang + sq), dy = Math.sin(ang + sq), k = v / (0.4 * R);
        cue.vx = dx * v; cue.vy = dy * v;
        cue.wx = k * b * dy; cue.wy = -k * b * dx; cue.wz = -k * a;
    },
    _shotSpeed(power) { return this._speedOf(power) * (this.broken ? 1 : 2.0); },        // a saída é bem mais forte que uma tacada normal
    // Começa a tacada: o taco avança até a branca (animação) e só então ela sai.
    _shoot(ang, power, spin = this.spin) {
        this.stroke = { t: 0, ang, power, a: spin.a, b: spin.b, back: this.power };
        this.phase = 'stroke';
    },
    _hit() {
        const S = this.stroke, cue = this.balls[0];
        this._strike(cue, S.ang, this._shotSpeed(S.power), S.a, S.b);
        this.ev = { first: null, pocketed: [], rail: false, vis: true, sounds: [] };
        this.phase = 'roll'; this.inHand = false; this.shots++;
        this._acc = 0; this._rollT = 0; this.stroke = null; this._pred = null;
        // pó de giz no ponto de contato
        for (let i = 0; i < 9; i++) {
            const a = S.ang + Math.PI + (Math.random() - 0.5) * 1.6, sp = 8 + Math.random() * 18;
            this.fx.push({ x: cue.x - Math.cos(S.ang) * this.R, y: cue.y - Math.sin(S.ang) * this.R, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.35 + Math.random() * 0.3, r: 0.35 + Math.random() * 0.5 });
        }
        AudioFX.blip(180 + S.power * 120, 0.05, 0.12 + S.power * 0.18);
        if (this.turn === 0) this._setSpin(0, 0);
    },

    // Fim da tacada (tudo parado): aplica as regras.
    _resolve() {
        const ev = this.ev, me = this.turn, op = 1 - me, B = this.balls, grp = this.groups;
        const isMine = (n, who) => grp[who] === 'solid' ? n >= 1 && n <= 7 : grp[who] === 'stripe' ? n >= 9 && n <= 15 : n !== 8 && n !== 0;
        const left = (who) => B.filter((b) => !b.in && b.n !== 0 && b.n !== 8 && (grp[who] ? isMine(b.n, who) : false)).length;
        const scratch = ev.pocketed.includes(0), eight = ev.pocketed.includes(8);
        const clearedBefore = grp[me] && B.filter((b) => b.n !== 0 && b.n !== 8 && isMine(b.n, me) && !(b.in && !ev.pocketed.includes(b.n))).length === 0;
        let foul = scratch || ev.first == null, why = scratch ? 'a branca caiu' : ev.first == null ? 'não tocou em nenhuma bola' : '';
        if (!foul && grp[me] && ev.first === 8 && !clearedBefore) { foul = true; why = 'tocou a 8 primeiro'; }
        else if (!foul && grp[me] && ev.first !== 8 && !isMine(ev.first, me)) { foul = true; why = 'tocou primeiro a bola do adversário'; }
        else if (!foul && !grp[me] && ev.first === 8 && this.broken) { foul = true; why = 'tocou a 8 primeiro'; }
        if (eight) {
            const win = clearedBefore && !foul;
            return this._end(win ? me : op, win ? 'encaçapou a 8' : (foul ? 'a 8 caiu com falta' : 'a 8 caiu antes da hora'));
        }
        // define os grupos
        if (!foul && !grp[me] && this.broken) {
            const firstIn = ev.pocketed.find((n) => n !== 0 && n !== 8);
            if (firstIn != null) { grp[me] = firstIn < 8 ? 'solid' : 'stripe'; grp[op] = firstIn < 8 ? 'stripe' : 'solid'; this._msg(`${this._nm(me)} fica com as ${grp[me] === 'solid' ? 'lisas' : 'listradas'}`); }
        }
        const wasBreak = !this.broken; this.broken = true;
        if (scratch) { const c = B[0]; c.in = false; c.drop = null; c.x = this.W * 0.25; c.y = this.H / 2; this._still(c); this._freeSpot(c); }
        const scoredMine = ev.pocketed.some((n) => n !== 0 && n !== 8 && (grp[me] ? isMine(n, me) : true));
        if (foul) {
            this.turn = op; this.inHand = true;
            this._msg(`Falta: ${why}. ${op === 0 && !this.watching ? 'Bola na mão para você — arraste a branca.' : 'Bola na mão para ' + this._nm(op) + '.'}`);
            AudioFX.blip(160, 0.2, 0.15);
        } else if (scoredMine || (wasBreak && ev.pocketed.length)) {
            this._msg(me === 0 && !this.watching ? (left(0) === 0 && grp[0] ? 'Agora é a 8! Escolha a caçapa.' : 'Boa! Joga de novo.') : `${this._nm(me)} continua.`);
        } else {
            this.turn = op;
            this._msg(op === 0 && !this.watching ? 'Sua vez.' : `Vez de ${this._nm(op)}.`);
        }
        this.phase = 'aim'; this.power = 0;
        if (this.turn === 1 || this.watching) this._aiStart();
        this._hud();
    },

    _freeSpot(c) {
        const B = this.balls, R = this.R;
        for (let k = 0; k < 60; k++) {
            if (!B.some((b) => b !== c && !b.in && hypot(b.x - c.x, b.y - c.y) < 2 * R + 0.2)) return;
            c.x = this.W * 0.25 - (k % 6) * 6; c.y = this.H / 2 + (Math.floor(k / 6) % 2 ? 1 : -1) * Math.ceil(k / 12) * 6;
        }
    },

    _end(winner, why) {
        if (this.watching) return this._endWatch(winner, why);
        this.phase = 'end';
        const won = winner === 0, o = this.opp, g = this.g;
        if (typeof WorldMemory !== 'undefined') WorldMemory.onGame('pool', this.shop, o.name, won, o.bet);
        if (won) {
            g.inventory.cash += o.bet * 2;
            const A = g.achievements; if (A) { A.bump('poolWins'); if (this.lvl === 4) A.bump('poolBoss'); }
            AudioFX.blip(880, 0.12, 0.2); setTimeout(() => AudioFX.blip(1320, 0.18, 0.2), 140);
        } else AudioFX.blip(140, 0.4, 0.2);
        this.$('plModal').style.display = 'flex';
        this.$('plModal').innerHTML = `<div class="pl-box pl-end"><div style="font-family:var(--emoji);font-size:46px">${won ? '🏆' : o.emo}</div>
            <div class="big" style="color:${won ? '#86efac' : '#fb7185'}">${won ? 'Você venceu!' : 'Você perdeu'}</div>
            <p class="sub">${won ? 'Você' : o.name} ${why}. ${won ? `Prêmio: <b style="color:#86efac">+${brl(o.bet * 2)}</b>` : `A aposta de ${brl(o.bet)} ficou com ${o.name}.`}</p>
            <div class="row"><button class="ui-btn pri" id="plAgain">Jogar de novo</button><button class="ui-btn" id="plBack">Voltar ao bar</button></div></div>`;
        this.$('plAgain').onclick = () => this._renderSetup();
        this.$('plBack').onclick = () => this.close();
        this._hud();
    },

    _quit() {
        if (this.phase === 'setup' || this.phase === 'end') { this.close(); return; }
        if (this.watching) { this.watching = null; this.skBy = null; this.close(); return; }      // (a partida segue no salão)
        if (!this._quitT || performance.now() - this._quitT > 2500) { this._quitT = performance.now(); this._msg('Desistir perde a aposta — clique/ESC de novo para confirmar'); return; }
        this._end(1, 'ganhou por desistência');
    },

    // ------------------------------------------------------------------ IA
    _legal(who) {
        const grp = this.groups[who], B = this.balls;
        if (!grp) return B.filter((b) => !b.in && b.n !== 0 && b.n !== 8);
        const mine = B.filter((b) => !b.in && (grp === 'solid' ? b.n >= 1 && b.n <= 7 : b.n >= 9 && b.n <= 15));
        return mine.length ? mine : B.filter((b) => !b.in && b.n === 8);
    },
    _clear(ax, ay, bx, by, skip, B, rad) {
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        for (const b of B) {
            if (b.in || skip.includes(b)) continue;
            let t = ((b.x - ax) * dx + (b.y - ay) * dy) / L2; if (t < 0 || t > 1) continue;
            const px = ax + dx * t - b.x, py = ay + dy * t - b.y;
            if (px * px + py * py < rad * rad) return false;
        }
        return true;
    },
    // Jogadas diretas: para cada bola legal e caçapa, o ponto de contato ("bola fantasma") e a força estimada.
    _candidates(B, cue, targets) {
        const R = this.R, out = [];
        for (const t of targets) for (const p of this._pockets) {
            const aimX = p.x + (p.x < 0 ? 2.5 : p.x > this.W ? -2.5 : 0), aimY = p.y + (p.y < 0 ? 2.5 : p.y > this.H ? -2.5 : 0);
            let ox = aimX - t.x, oy = aimY - t.y; const d2 = hypot(ox, oy); ox /= d2; oy /= d2;
            if (p.r < 6 && Math.abs(oy) < 0.38) continue;                            // caçapa do meio: ângulo fechado demais
            const gx = t.x - ox * 2 * R, gy = t.y - oy * 2 * R;
            if (gx < R || gx > this.W - R || gy < R || gy > this.H - R) continue;
            let cx = gx - cue.x, cy = gy - cue.y; const d1 = hypot(cx, cy); if (d1 < 0.5) continue; cx /= d1; cy /= d1;
            const cut = Math.acos(Math.max(-1, Math.min(1, cx * ox + cy * oy)));
            if (cut > 1.35) continue;
            if (!this._clear(cue.x, cue.y, gx, gy, [cue, t], B, 2 * R - 0.1)) continue;
            if (!this._clear(t.x, t.y, aimX, aimY, [t, cue], B, 2 * R - 0.1)) continue;
            // (a branca sai escorregando e rola a 5/7: perde ~28% até rolar — a força leva isso em conta)
            const vObj = this._invDist(d2 + 18), vHit = vObj / (Math.cos(cut) * 0.975 + 0.02), v0 = this._invDist(this._dist(vHit) + d1) * 1.12;
            const score = Math.cos(cut) ** 2 / (1 + (d1 + d2) / 220) / (1 + Math.max(0, v0 - this.VMAX) / 100);
            out.push({ ang: Math.atan2(cy, cx), pow: this._powOf(Math.min(this.VMAX, v0 * 1.08)), score, t: t.n });
        }
        return out.sort((a, b) => b.score - a.score);
    },
    _clone(B) { return B.map((b) => ({ n: b.n, x: b.x, y: b.y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, in: b.in })); },
    _simulate(B0, ang, pow, a = 0, b = 0) {
        const B = this._clone(B0), ev = { first: null, pocketed: [], rail: false, vis: false };
        this._strike(B[0], ang, this._shotSpeed(pow), a, b);
        for (let i = 0; i < 3600 && this._step(B, ev); i++);
        return { B, ev };
    },
    _evalSim(r, who) {
        const grp = this.groups[who], ev = r.ev, B = r.B;
        const mine = (n) => grp === 'solid' ? n >= 1 && n <= 7 : grp === 'stripe' ? n >= 9 && n <= 15 : n !== 8 && n !== 0;
        const leftBefore = this.balls.filter((b) => !b.in && b.n !== 0 && b.n !== 8 && grp && mine(b.n)).length;
        if (ev.pocketed.includes(8)) return grp && leftBefore === 0 && !ev.pocketed.includes(0) && ev.first === 8 ? 100 : -200;
        if (ev.pocketed.includes(0) || ev.first == null) return -40;
        if (grp && leftBefore > 0 && !mine(ev.first)) return -30;
        if (grp && leftBefore === 0 && ev.first !== 8) return -30;
        let s = 0;
        const own = ev.pocketed.filter((n) => mine(n)).length; s += own * 12;
        if (own && this.sk.pos) {                                     // posição para a próxima: quantas jogadas boas a branca deixa
            const next = this._candidates(B, B[0], this._legalIn(B, who));
            s += this.sk.pos * Math.min(3, next.filter((c) => c.score > 0.3).length) + (next[0] ? next[0].score * 4 : -2);
        }
        return s;
    },
    _legalIn(B, who) {
        const grp = this.groups[who];
        if (!grp) return B.filter((b) => !b.in && b.n !== 0 && b.n !== 8);
        const mine = B.filter((b) => !b.in && (grp === 'solid' ? b.n >= 1 && b.n <= 7 : b.n >= 9 && b.n <= 15));
        return mine.length ? mine : B.filter((b) => !b.in && b.n === 8);
    },
    _aiStart() {
        if (this.skBy) this.sk = this.skBy[this.turn];                     // (assistindo: cada um com o nível dele)
        this.phase = 'ai'; this.ai = { t: 0, plan: null, gen: this._aiThink(), shown: this.aim };
    },
    // Pensa em fatias (gerador): poucas simulações por quadro, sem travar a animação.
    *_aiThink() {
        const sk = this.sk, B = this.balls, cue = B[0], me = this.turn;
        if (this.inHand) {                                             // bola na mão: testa posições e fica com a de melhor jogada
            let best = null;
            for (let k = 0; k < 40; k++) {
                const x = this.R + Math.random() * (this.W - 2 * this.R), y = this.R + Math.random() * (this.H - 2 * this.R);
                if (B.some((b) => b !== cue && !b.in && hypot(b.x - x, b.y - y) < 2 * this.R + 0.5)) continue;
                const c = this._candidates(B, { x, y }, this._legal(me))[0];
                if (c && (!best || c.score > best.s)) best = { x, y, s: c.score };
                if (k % 10 === 9) yield;
            }
            if (best) { cue.x = best.x; cue.y = best.y; cue.key = null; }
            this.inHand = false;
        }
        const cands = this._candidates(B, cue, this._legal(me)).slice(0, sk.cand);
        let plan = null;
        if (sk.sim && cands.length) {
            let bestS = -1e9;
            const dA = Math.max(0.12, sk.sigma * 1.2) * Math.PI / 180;      // jogada ROBUSTA: média do resultado com a mira um pouco para cada lado
            // os melhores ainda escolhem o efeito: no centro, puxando (embaixo) ou seguindo (em cima) — para deixar a branca bem
            const spins = sk.spin ? [0, -0.35, 0.3] : [0];
            for (const c of cands.slice(0, Math.ceil(sk.sim / 2))) for (const m of [0.92, 1.12]) for (const sb of spins) {
                const pow = Math.min(1, c.pow * m * (sb < 0 ? 1.08 : 1));
                let s = 0; for (const da of [-dA, 0, dA]) s += this._evalSim(this._simulate(B, c.ang + da, pow, 0, sb), me);
                s = s / 3 + c.score * 3;
                if (s > bestS) { bestS = s; plan = { ang: c.ang, pow, a: 0, b: sb }; }
                yield;
            }
        } else if (cands.length) {
            const c = cands[Math.floor(Math.random() * Math.min(cands.length, sk.cand > 4 ? 1 : 2))]; plan = { ang: c.ang, pow: c.pow, a: 0, b: 0 };
        }
        if (!plan) {                                                   // sem jogada direta: defesa — encostar numa bola legal sem cometer falta
            let bestS = -1e9;
            const L = this._legal(me).length ? this._legal(me) : B.filter((b) => !b.in && b.n !== 0);
            for (let k = 0; k < (sk.sim ? 24 : 6) && L.length; k++) {
                const t = L[Math.floor(Math.random() * L.length)], ang = Math.atan2(t.y - cue.y, t.x - cue.x) + (Math.random() - 0.5) * (k < 4 ? 0 : 0.6), pow = 0.22 + Math.random() * 0.3;
                const s = sk.sim ? this._evalSim(this._simulate(B, ang, pow), me) : 0;
                if (s > bestS) { bestS = s; plan = { ang, pow, a: 0, b: 0 }; }
                if (sk.sim) yield;
            }
        }
        if (!plan) { const t = this._legal(me)[0] || B[1]; plan = { ang: Math.atan2(t.y - cue.y, t.x - cue.x), pow: 0.35, a: 0, b: 0 }; }
        // erro humano: mira, força e ponto do taco com ruído (e de vez em quando um vacilo)
        const g = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
        const blunder = Math.random() < sk.blunder ? 3 : 1;
        plan.ang += g() * sk.sigma * blunder * Math.PI / 180;
        plan.pow = Math.max(0.05, Math.min(1, plan.pow * (1 + g() * sk.pw)));
        plan.a += g() * sk.sigma * 0.02; plan.b += g() * sk.sigma * 0.03;
        return plan;
    },
    _aiUpdate(dt) {
        const a = this.ai; a.t += dt;
        if (!a.plan) {
            const t0 = performance.now();
            while (performance.now() - t0 < 7) { const r = a.gen.next(); if (r.done) { a.plan = r.value; a.t0 = a.t; break; } }
            return;
        }
        const k = Math.min(1, (a.t - a.t0) / 0.9);                    // gira o taco até a mira
        let d = a.plan.ang - this.aim; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.aim += d * Math.min(1, dt * 6);
        this.aiSpin = { a: a.plan.a, b: a.plan.b };
        if (k >= 1 && a.t - a.t0 > 1.1) {
            this.power = Math.min(a.plan.pow, (a.t - a.t0 - 1.1) / 0.5 * a.plan.pow);
            if (a.t - a.t0 > 1.75) { this.aim = a.plan.ang; this.power = a.plan.pow; this._shoot(a.plan.ang, a.plan.pow, { a: a.plan.a, b: a.plan.b }); this.ai = null; }
        }
    },

    // ------------------------------------------------------------------ entrada do jogador
    _canAim() { return this.active && this.phase === 'aim' && this.turn === 0 && !this.watching; },
    _nm(i) { return this.watching ? this.watching.people[i].name : i === 0 ? 'Você' : this.opp.name; },
    _toTable(e) { return { x: (e.clientX - this.ox) / this.sc, y: (e.clientY - this.oy) / this.sc }; },
    _pDown(e) {
        if (!this._canAim()) return;
        const p = this._toTable(e), cue = this.balls[0];
        if (this.inHand && hypot(p.x - cue.x, p.y - cue.y) < this.R * 3.2) { this.drag = { id: e.pointerId }; return; }
        if (e.pointerType === 'mouse' && e.button === 0) { this._aimAt(p); this.pull = { mouse: true, x0: e.clientX, y0: e.clientY }; return; }
        this.touchAim = { id: e.pointerId }; this._aimAt(p);
    },
    _pMove(e) {
        if (!this.active) return;
        const p = this._toTable(e);
        if (this.drag) { this._placeCue(p); return; }
        if (!this._canAim()) return;
        if (this.pull && this.pull.mouse) {                            // puxando para trás: distância ao longo do eixo oposto à mira
            const dx = e.clientX - this.pull.x0, dy = e.clientY - this.pull.y0, back = -(dx * Math.cos(this.aim) + dy * Math.sin(this.aim));
            this.power = Math.max(0, Math.min(1, back / (this.sc * 60))); return;
        }
        if (this.touchAim || e.pointerType === 'mouse') this._aimAt(p);
    },
    _pUp() {
        if (this.drag) { this.drag = null; return; }
        if (this.pull && this.pull.mouse) { this.pull = null; this._release(); }
        this.touchAim = null;
    },
    _aimAt(p) { const c = this.balls[0]; if (hypot(p.x - c.x, p.y - c.y) > 1) this.aim = Math.atan2(p.y - c.y, p.x - c.x); },
    _placeCue(p) {
        const R = this.R, c = this.balls[0], x = Math.max(R, Math.min(this.W - R, p.x)), y = Math.max(R, Math.min(this.H - R, p.y));
        if (this.balls.some((b) => b !== c && !b.in && hypot(b.x - x, b.y - y) < 2 * R + 0.2)) return;
        c.x = x; c.y = y; c.key = null;
    },
    _barPow(e) { const r = this.powEl.getBoundingClientRect(); this.power = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); },
    _release() { if (this._canAim() && this.power > 0.03) this._shoot(this.aim, this.power); else this.power = 0; },
    // Efeito escolhido (a = direita, b = em cima; fração do raio), limitado ao círculo onde o taco não escorrega (SPIN_MAX).
    _setSpin(a, b) {
        const l = hypot(a, b), m = this.SPIN_MAX;
        if (l > m) { a *= m / l; b *= m / l; }
        this.spin = { a, b };
        if (!this.spinTip) return;
        this.spinTip.style.left = (50 + a / m * 42) + '%'; this.spinTip.style.top = (50 - b / m * 42) + '%';
        const v = b > 0.08 ? 'siga' : b < -0.08 ? 'puxe' : '', h = a > 0.08 ? 'direita' : a < -0.08 ? 'esquerda' : '';
        this.$('plSpinTx').textContent = [v, h].filter(Boolean).join(' · ') || 'centro';
    },
    // Analógico direito do controle (PadNav): o efeito segue o analógico; solto, fica onde estava.
    padSpin(x, y) {
        if (!this._canAim() || hypot(x, y) < 0.25) return;
        this._setSpin(x * this.SPIN_MAX, -y * this.SPIN_MAX);
    },
    _key(e, down) {
        if (!this.active) return;
        const k = e.key;
        e.stopPropagation();
        if (!down) { if (k === ' ' && this.spaceHold) { this.spaceHold = false; this._release(); } this.keys = this.keys || {}; this.keys[k] = false; e.preventDefault(); return; }
        e.preventDefault();
        if (k === 'Escape') { if (this.phase === 'setup' || this.phase === 'end') this.close(); else this._quit(); return; }
        this.keys = this.keys || {}; this.keys[k] = true;
        if (k === ' ' && this._canAim() && !this.spaceHold) { this.spaceHold = true; this._spT = 0; }
        if (this._canAim()) {
            const st = 0.11;
            if (k === 'ArrowUp' || k === 'w' || k === 'W') this._setSpin(this.spin.a, this.spin.b + st);
            else if (k === 'ArrowDown' || k === 's' || k === 'S') this._setSpin(this.spin.a, this.spin.b - st);
            else if (k === 'e' || k === 'E') this._setSpin(this.spin.a + st, this.spin.b);
            else if (k === 'q' || k === 'Q') this._setSpin(this.spin.a - st, this.spin.b);
            else if (k === 'c' || k === 'C') this._setSpin(0, 0);
        }
    },

    // ------------------------------------------------------------------ quadro
    _frame(dt) {
        if (this.phase === 'roll') {
            this._acc += dt; this._rollT += dt;
            let moving = true, n = 0;
            while (this._acc >= this.DT && n < 40) { moving = this._step(this.balls, this.ev); this._acc -= this.DT; n++; if (!moving) break; }
            this._sounds();
            if (!moving || this._rollT > 30) { for (const b of this.balls) this._still(b); this._resolve(); }
        } else if (this.phase === 'stroke') {
            this.stroke.t += dt;
            if (this.stroke.t >= 0.085 + 0.05 * (1 - this.stroke.power)) this._hit();
        } else if (this.phase === 'ai' && this.ai) this._aiUpdate(dt);
        else if (this._canAim()) {
            const K = this.keys || {}, f = K.Shift ? 0.012 : 0.0025;
            if (K.ArrowLeft || K.a) this.aim -= f; if (K.ArrowRight || K.d) this.aim += f;
            if (this.spaceHold) { this._spT += dt; const t = (this._spT / 1.3) % 2; this.power = t < 1 ? t : 2 - t; }
        }
        // rotação desenhada: cada bola gira pelo ω dela
        for (const b of this.balls) {
            if (b.in) { if (b.drop) b.drop.t += dt; continue; }
            const w = hypot(b.wx, b.wy, b.wz);
            if (w > 0.01) { b.M = this._rotate(b.M, b.wx / w, b.wy / w, b.wz / w, w * dt); b.key = null; }
        }
        for (const p of this.fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
        this.fx = this.fx.filter((p) => p.t < p.life);
        if (this._msgT > 0) { this._msgT -= dt; if (this._msgT <= 0) this.$('plMsg').style.opacity = 0; }
        const can = this._canAim();
        this.powEl.classList.toggle('off', !can);
        this.spinEl.classList.toggle('off', !can);
        this.powEl.firstChild.style.height = `calc(${Math.round(this.power * 100)}% - ${this.power > 0 ? 14 : 0}px)`;
        this._draw();
    },
    _sounds() {
        const s = this.ev.sounds; if (!s.length) return;
        let ball = 0, rail = 0, pocket = false;
        for (const [k, v] of s) { if (k === 'ball') ball = Math.max(ball, v); else if (k === 'rail') rail = Math.max(rail, v); else pocket = true; }
        s.length = 0;
        if (ball) AudioFX.blip(1300 + Math.random() * 300, 0.025, Math.min(0.3, ball / 900));
        if (rail > 30) AudioFX.blip(140, 0.05, Math.min(0.2, rail / 1400));
        if (pocket) { AudioFX.blip(90, 0.18, 0.25); setTimeout(() => AudioFX.blip(70, 0.22, 0.12), 120); }
    },
    _msg(t) { const e = this.$('plMsg'); e.textContent = t; e.style.opacity = 1; this._msgT = 3.2; },
    _hud() {
        const grp = this.groups || [null, null], B = this.balls || [];
        const pips = (who) => {
            if (!grp[who]) return '<span style="opacity:.6">grupo indefinido</span>';
            const ns = grp[who] === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
            return ns.map((n) => { const b = B.find((x) => x.n === n); return `<i class="${n > 8 ? 'st' : ''} ${b && b.in ? 'out' : ''}" style="--c:${this.COLORS[n % 8 || 8]};background:${this.COLORS[n % 8 || 8]}"></i>`; }).join('') + ' <i style="background:#121212"></i>';
        };
        const o = this.opp || this.STAKES[0], playing = this.phase !== 'setup';
        const W = this.watching;
        this.$('plP0').innerHTML = `<span class="av">${W ? W.people[0].emo : '😎'}</span><span><b>${W ? W.people[0].name : 'Você'}</b><small>${playing ? pips(0) : ''}</small></span>`;
        this.$('plP1').innerHTML = `<span><b style="text-align:right">${playing ? o.name : '—'}</b><small style="justify-content:flex-end">${playing ? pips(1) : ''}</small></span><span class="av">${playing ? o.emo : '❔'}</span>`;
        this.$('plP0').classList.toggle('turn', playing && this.phase !== 'end' && this.turn === 0);
        this.$('plP1').classList.toggle('turn', playing && this.phase !== 'end' && this.turn === 1);
        const wb = W && W.bet;
        this.$('plPot').innerHTML = W ? `<b>${wb ? brl(Math.round(wb.bet * wb.odds)) : '👀'}</b><small>${wb ? 'sua aposta paga' : 'assistindo'}</small>` : playing ? `<b>${brl(o.bet * 2)}</b><small>em jogo · aposta ${brl(o.bet)}</small>` : `<b>🎱</b><small>sinuca</small>`;
        if (this.$('plSkip')) this.$('plSkip').style.display = W && playing && this.phase !== 'end' ? '' : 'none';
        this.$('plQuit').textContent = W ? 'Sair (a partida segue)' : 'Desistir';
        this.$('plHelp').textContent = this.vw < 700 ? '' : 'Mire no pano · força na barra ou puxe com o mouse · ESPAÇO segura/solta · ← → ajuste fino · efeito: círculo, ↑ ↓ Q E';
    },

    // ------------------------------------------------------------------ desenho
    _draw() {
        const x = this.ctx, d = this.dpr, s = this.sc, ox = this.ox, oy = this.oy;
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.drawImage(this._staticCanvas(), 0, 0);                      // bar, mesa, tabelas e pano (prontos)
        x.setTransform(d, 0, 0, d, 0, 0);
        x.save(); x.translate(ox, oy); x.scale(s, s);
        const B = this.balls, cue = B[0];
        // bolas caindo na caçapa (por baixo das tabelas: somem na boca)
        for (const b of B) if (b.in && b.drop && b.drop.t < 0.4) this._dropBall(x, b);
        // mira (só na vez do jogador)
        if (this._canAim() && !cue.in) this._guide(x);
        // sombras macias (a luminária fica sobre o centro da mesa: a sombra foge dela)
        for (const b of B) if (!b.in) this._shadow(x, b.x, b.y, 1);
        x.restore();
        // bolas desenhadas pixel a pixel (na resolução do aparelho)
        x.setTransform(1, 0, 0, 1, 0, 0);
        for (const b of B) if (!b.in) { const c = this._ballCanvas(b), cx = (ox + b.x * s) * d, cy = (oy + b.y * s) * d; x.drawImage(c, Math.round(cx - c.width / 2), Math.round(cy - c.height / 2)); }
        x.setTransform(d, 0, 0, d, 0, 0);
        x.save(); x.translate(ox, oy); x.scale(s, s);
        if (this.inHand && this.turn === 0 && this.phase === 'aim') { x.strokeStyle = 'rgba(255,255,255,0.7)'; x.setLineDash([1.2, 1.2]); x.lineWidth = 0.5; x.beginPath(); x.arc(cue.x, cue.y, this.R + 2.2, 0, 7); x.stroke(); x.setLineDash([]); }
        // pó de giz
        for (const p of this.fx) { x.fillStyle = `rgba(110,160,235,${(1 - p.t / p.life) * 0.55})`; x.beginPath(); x.arc(p.x, p.y, p.r * (1 + p.t * 2), 0, 7); x.fill(); }
        // taco
        if ((this.phase === 'aim' && this.turn === 0) || this.phase === 'ai' || this.phase === 'stroke') this._cue(x);
        x.restore();
    },
    _rr(x, a, b, w, h, r) { x.beginPath(); x.roundRect(a, b, w, h, r); },
    _dia(x, a, b) { x.beginPath(); x.moveTo(a, b - 1.3); x.lineTo(a + 0.8, b); x.lineTo(a, b + 1.3); x.lineTo(a - 0.8, b); x.closePath(); x.fill(); },
    // Sombra macia no pano: deslocada para longe da luminária, mais longa nas bordas da mesa.
    _shadow(x, bx, by, k) {
        const L = this.LAMP, R = this.R, ex = (bx - L[0]) * 0.012, ey = (by - L[1]) * 0.012, cx = bx + ex, cy = by + ey + 0.35;
        const g = x.createRadialGradient(cx, cy, R * 0.35, cx, cy, R * 1.25);
        g.addColorStop(0, `rgba(0,0,0,${0.45 * k})`); g.addColorStop(0.55, `rgba(0,0,0,${0.22 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R * 1.25, 0, 7); x.fill();
    },
    // Bola entrando na caçapa: corre até o centro da boca encolhendo e escurecendo.
    _dropBall(x, b) {
        const D = b.drop, k = Math.min(1, D.t / 0.4), e = k * k, px = D.x + (D.px - D.x) * Math.min(1, k * 1.6), py = D.y + (D.py - D.y) * Math.min(1, k * 1.6);
        const c = this._ballCanvas(b), sz = this.R * 2 * (1 - 0.45 * e);
        x.save(); x.globalAlpha = 1 - e; x.drawImage(c, px - sz / 2 * c.width / (c.width - 2), py - sz / 2 * c.width / (c.width - 2), sz * c.width / (c.width - 2), sz * c.width / (c.width - 2));
        x.globalAlpha = e * 0.85; x.fillStyle = '#000'; x.beginPath(); x.arc(px, py, sz / 2, 0, 7); x.fill(); x.restore();
    },

    // ------------------------------------------------------------------ mesa (desenhada uma vez por tamanho de tela)
    _staticCanvas() {
        if (this._static) return this._static;
        const c = document.createElement('canvas'); c.width = this.cv.width; c.height = this.cv.height;
        const x = c.getContext('2d'), d = this.dpr, s = this.sc, W = this.W, H = this.H, F = this.F, ox = this.ox, oy = this.oy;
        x.setTransform(d, 0, 0, d, 0, 0);
        // ambiente: o bar escuro, o piso de tábuas e a luz da luminária sobre a mesa
        x.fillStyle = '#0a0705'; x.fillRect(0, 0, this.vw, this.vh);
        x.globalAlpha = 0.5;
        for (let i = 0, yy = 0; yy < this.vh; i++, yy += 34) { x.fillStyle = i % 2 ? '#1c130c' : '#22170e'; x.fillRect(0, yy, this.vw, 33); x.fillStyle = '#0c0805'; x.fillRect(0, yy + 33, this.vw, 1); }
        x.globalAlpha = 1;
        const bg = x.createRadialGradient(this.vw / 2, oy + H * s / 2, 40, this.vw / 2, oy + H * s / 2, Math.max(this.vw, this.vh) * 0.8);
        bg.addColorStop(0, 'rgba(120,85,45,0.55)'); bg.addColorStop(0.45, 'rgba(40,26,14,0.5)'); bg.addColorStop(1, 'rgba(0,0,0,0.92)');
        x.fillStyle = bg; x.fillRect(0, 0, this.vw, this.vh);
        x.save(); x.translate(ox, oy); x.scale(s, s);
        // sombra da mesa no chão
        x.fillStyle = 'rgba(0,0,0,0.6)'; x.filter = `blur(${Math.round(16 * s * d / 4)}px)`; this._rr(x, -F + 4, -F + 10, W + 2 * F, H + 2 * F, 12); x.fill(); x.filter = 'none';
        // moldura de madeira: base, veios, verniz e o chanfro de dentro e de fora
        const wood = x.createLinearGradient(0, -F, 0, H + F); wood.addColorStop(0, '#93582b'); wood.addColorStop(0.5, '#653818'); wood.addColorStop(1, '#40210d');
        x.fillStyle = wood; this._rr(x, -F, -F, W + 2 * F, H + 2 * F, 10); x.fill();
        x.save(); this._rr(x, -F, -F, W + 2 * F, H + 2 * F, 10); x.clip();
        let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 70; i++) {
            const horiz = i < 46, y0 = -F + rnd() * (H + 2 * F), x0 = -F + rnd() * (W + 2 * F);
            x.strokeStyle = `rgba(${rnd() < 0.5 ? '35,15,4' : '170,110,60'},${0.12 + rnd() * 0.18})`; x.lineWidth = 0.15 + rnd() * 0.45;
            x.beginPath();
            if (horiz) { x.moveTo(-F, y0); x.bezierCurveTo(W * 0.3, y0 + (rnd() - 0.5) * 3, W * 0.7, y0 + (rnd() - 0.5) * 3, W + F, y0 + (rnd() - 0.5) * 2); }
            else { x.moveTo(x0, -F); x.bezierCurveTo(x0 + (rnd() - 0.5) * 3, H * 0.3, x0 + (rnd() - 0.5) * 3, H * 0.7, x0 + (rnd() - 0.5) * 2, H + F); }
            x.stroke();
        }
        const gloss = x.createLinearGradient(0, -F, 0, H + F); gloss.addColorStop(0, 'rgba(255,230,190,0.18)'); gloss.addColorStop(0.08, 'rgba(255,230,190,0.02)'); gloss.addColorStop(0.92, 'rgba(0,0,0,0)'); gloss.addColorStop(1, 'rgba(0,0,0,0.25)');
        x.fillStyle = gloss; x.fillRect(-F, -F, W + 2 * F, H + 2 * F);
        x.restore();
        x.strokeStyle = 'rgba(255,220,170,0.3)'; x.lineWidth = 0.6; this._rr(x, -F + 1.2, -F + 1.2, W + 2 * F - 2.4, H + 2 * F - 2.4, 9); x.stroke();
        x.strokeStyle = 'rgba(20,8,2,0.7)'; x.lineWidth = 0.8; this._rr(x, -F, -F, W + 2 * F, H + 2 * F, 10); x.stroke();
        // diamantes (madrepérola)
        for (let i = 1; i < 8; i++) if (i !== 4) { this._pearl(x, W * i / 8, -F / 2 - 1.5); this._pearl(x, W * i / 8, H + F / 2 + 1.5); }
        for (let i = 1; i < 4; i++) { this._pearl(x, -F / 2 - 1.5, H * i / 4); this._pearl(x, W + F / 2 + 1.5, H * i / 4); }
        // pano (com a luz da luminária e a trama)
        const CW = 4.6;
        x.drawImage(this._feltCanvas(CW), -CW, -CW, W + 2 * CW, H + 2 * CW);
        // caçapas: boca preta com o couro em volta e a capa de metal na madeira
        for (const p of this._pockets) {
            const cap = x.createRadialGradient(p.x - 1, p.y - 1, p.r * 0.6, p.x, p.y, p.r + 3.2);
            cap.addColorStop(0, '#2a2a2c'); cap.addColorStop(0.7, '#5a5a60'); cap.addColorStop(0.86, '#9a9aa2'); cap.addColorStop(1, '#3a3a3e');
            x.fillStyle = cap; x.beginPath(); x.arc(p.x, p.y, p.r + 3.2, 0, 7); x.fill();
            const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r + 1.2); g.addColorStop(0, '#000'); g.addColorStop(0.7, '#030303'); g.addColorStop(0.92, '#1a120c'); g.addColorStop(1, '#3a2616');
            x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r + 1.2, 0, 7); x.fill();
        }
        // tabelas de borracha, recortadas nas bocas (pontas em 45° nos cantos, abertas no meio)
        const C = this.CORNER, M = this.MID;
        const rail = (pts, nx, ny) => {
            x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) x.lineTo(q[0], q[1]); x.closePath();
            const ax = pts[0][0], ay = pts[0][1], g = x.createLinearGradient(ax, ay, ax + nx * CW, ay + ny * CW);
            g.addColorStop(0, '#3fa86a'); g.addColorStop(0.18, '#22874c'); g.addColorStop(1, '#0f4d2a');
            x.fillStyle = g; x.fill();
            x.strokeStyle = 'rgba(190,255,210,0.35)'; x.lineWidth = 0.25; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); x.lineTo(pts[1][0], pts[1][1]); x.stroke();
        };
        const mO = M + CW * 0.25;
        rail([[C, 0], [W / 2 - M, 0], [W / 2 - mO, -CW], [C - CW, -CW]], 0, -1);
        rail([[W / 2 + M, 0], [W - C, 0], [W - C + CW, -CW], [W / 2 + mO, -CW]], 0, -1);
        rail([[C, H], [W / 2 - M, H], [W / 2 - mO, H + CW], [C - CW, H + CW]], 0, 1);
        rail([[W / 2 + M, H], [W - C, H], [W - C + CW, H + CW], [W / 2 + mO, H + CW]], 0, 1);
        rail([[0, C], [0, H - C], [-CW, H - C + CW], [-CW, C - CW]], -1, 0);
        rail([[W, C], [W, H - C], [W + CW, H - C + CW], [W + CW, C - CW]], 1, 0);
        // sombra do nariz da tabela no pano
        x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(C, 0, W - 2 * C, 0.9); x.fillRect(0, C, 0.9, H - 2 * C);
        // marca de saída e ponto do pé
        x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 0.4; x.beginPath(); x.moveTo(W * 0.25, 0); x.lineTo(W * 0.25, H); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.2)'; x.beginPath(); x.arc(W * 0.72, H / 2, 0.7, 0, 7); x.fill(); x.beginPath(); x.arc(W * 0.25, H / 2, 0.5, 0, 7); x.fill();
        x.restore();
        return (this._static = c);
    },
    _pearl(x, a, b) {
        const g = x.createLinearGradient(a - 1, b - 1.4, a + 1, b + 1.4); g.addColorStop(0, '#fffaf0'); g.addColorStop(0.5, '#e6dcc6'); g.addColorStop(1, '#bfb4a0');
        x.fillStyle = g; this._dia(x, a, b);
        x.strokeStyle = 'rgba(40,20,8,0.5)'; x.lineWidth = 0.2; x.stroke();
    },
    _feltCanvas(CW) {
        const k = Math.max(2, Math.round(this.sc * this.dpr)), c = document.createElement('canvas'), Wc = this.W + 2 * CW, Hc = this.H + 2 * CW;
        c.width = Math.round(Wc * k); c.height = Math.round(Hc * k);
        const x = c.getContext('2d', { willReadFrequently: true });
        const g = x.createRadialGradient(c.width / 2, c.height * 0.48, 10, c.width / 2, c.height / 2, c.width * 0.62);
        g.addColorStop(0, '#36b86b'); g.addColorStop(0.5, '#25914f'); g.addColorStop(1, '#14612f');
        x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
        const id = x.getImageData(0, 0, c.width, c.height), D = id.data, w = c.width;
        for (let i = 0, p = 0; i < D.length; i += 4, p++) {
            const px = p % w, py = (p / w) | 0, weave = ((px + py) % 3 === 0 ? 3 : 0) - ((px - py + 999) % 4 === 0 ? 2 : 0);
            const n = (Math.random() - 0.5) * 8 + weave;
            D[i] += n; D[i + 1] += n; D[i + 2] += n;
        }
        x.putImageData(id, 0, 0);
        return c;
    },

    // ------------------------------------------------------------------ bolas: esfera pixel a pixel
    // Glifo do número (alfa), desenhado uma vez: o pixel do círculo do número consulta este mapa nas coordenadas da bola.
    _glyph(n) {
        const G = this._glyphs || (this._glyphs = {});
        if (G[n]) return G[n];
        const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = '#000'; x.font = `800 ${n > 9 ? 34 : 40}px Inter, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(n), S / 2, S / 2 + 2);
        if (n === 6 || n === 9) x.fillRect(S / 2 - 10, S / 2 + 20, 20, 3);          // (sublinhado: 6 e 9 não se confundem)
        const D = x.getImageData(0, 0, S, S).data, a = new Uint8Array(S * S);
        for (let i = 0; i < a.length; i++) a[i] = D[i * 4 + 3];
        return (G[n] = { S, a });
    },
    _rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; },
    // A bola b na tela, como uma esfera: para cada pixel do disco, o ponto da superfície volta para o referencial da bola (M) e
    // escolhe a pintura (lisa, faixa, círculo e número, pintas da branca); a luz vem da luminária (difusa + brilho) e a borda
    // reflete o pano. Refeita só quando a bola gira ou muda de lugar.
    _ballCanvas(b) {
        const rp = this.R * this.sc * this.dpr, N = Math.ceil(rp * 2) + 2;
        let c = b.cv;
        if (!c || c.width !== N) { c = b.cv = document.createElement('canvas'); c.width = c.height = N; b.key = null; b.img = null; }
        if (b.key) return c;
        b.key = 1;
        const x = c.getContext('2d'), img = b.img || (b.img = x.createImageData(N, N)), D = img.data, M = b.M, h = N / 2;
        // luz: da luminária (sobre o centro da mesa) até a bola
        const L = this.LAMP; let lx = L[0] - b.x, ly = L[1] - b.y, lz = L[2]; const ll = hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
        let hx = lx, hy = ly, hz = lz - 1; const hl = hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;    // meio-vetor com a vista (0, 0, −1)
        const n = b.n, col = this._rgb(this.COLORS[n === 0 ? 0 : (n % 8 || 8)]), white = [246, 242, 230], stripe = n > 8;
        const G = n > 0 ? this._glyph(n) : null, NR = Math.cos(0.5), SN = Math.sin(0.5), ew = 1.2 / rp;       // (ew: meio pixel na esfera — bordas suaves)
        const mix = (A, Bc, t) => [A[0] + (Bc[0] - A[0]) * t, A[1] + (Bc[1] - A[1]) * t, A[2] + (Bc[2] - A[2]) * t];
        const sm = (e0, e1, v) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const o = (j * N + i) * 4;
            let px = (i + 0.5 - h) / rp, py = (j + 0.5 - h) / rp;
            const r2 = px * px + py * py;
            if (r2 > 1.06) { D[o + 3] = 0; continue; }
            const r = Math.sqrt(r2), alpha = Math.max(0, Math.min(1, (1 - r) * rp + 0.5));
            if (r > 1) { px /= r; py /= r; }
            const pz = -Math.sqrt(Math.max(0, 1 - px * px - py * py));
            // referencial da bola: q = Mᵀ p
            const qx = M[0] * px + M[3] * py + M[6] * pz, qy = M[1] * px + M[4] * py + M[7] * pz, qz = M[2] * px + M[5] * py + M[8] * pz;
            let cr, cg, cb;
            if (n === 0) {
                [cr, cg, cb] = white;
                if (Math.abs(qx) > 0.975 || Math.abs(qy) > 0.975) { cr = 200; cg = 40; cb = 40; }      // pintas vermelhas (dá para ver o efeito)
            } else {
                let C0 = stripe ? mix(col, white, sm(0.52 - ew, 0.52 + ew, Math.abs(qz))) : col;           // faixa (borda suave)
                const ax = Math.abs(qx);
                if (ax > NR - ew) {                                     // círculo do número (dos dois lados)
                    let W0 = white;
                    const sg = qx > 0 ? 1 : -1, u = (qy * sg) / SN, v = -qz / SN;      // coordenadas no círculo (−1..1)
                    const gx = ((u * 0.5 + 0.5) * G.S) | 0, gy = ((v * 0.5 + 0.5) * G.S) | 0;
                    if (gx >= 0 && gy >= 0 && gx < G.S && gy < G.S) { const a = G.a[gy * G.S + gx] / 255 * 0.92; W0 = [W0[0] * (1 - a), W0[1] * (1 - a), W0[2] * (1 - a)]; }
                    C0 = mix(C0, W0, sm(NR - ew, NR + ew, ax));
                }
                [cr, cg, cb] = C0;
            }
            // luz: ambiente + difusa + brilho da luminária, borda com o reflexo verde do pano
            const nl = Math.max(0, px * lx + py * ly + pz * lz), nh = Math.max(0, px * hx + py * hy + pz * hz);
            const sp = Math.pow(nh, 90) * 1.25 + Math.pow(nh, 12) * 0.12, rim = Math.pow(1 + pz, 3);
            const k = 0.3 + 0.85 * nl;
            D[o] = cr * k * (1 - rim * 0.35) + 20 * rim + 255 * sp;
            D[o + 1] = cg * k * (1 - rim * 0.35) + 75 * rim + 250 * sp;
            D[o + 2] = cb * k * (1 - rim * 0.35) + 38 * rim + 235 * sp;
            D[o + 3] = alpha * 255;
        }
        x.putImageData(img, 0, 0);
        return c;
    },

    // ------------------------------------------------------------------ mira e previsão
    // Linha de mira até a 1ª bola (bola fantasma), direção da bola atingida e o caminho da branca DEPOIS do choque — simulado com o
    // efeito e a força escolhidos (siga, puxe, tabela), só um trecho curto.
    _guide(x) {
        const B = this.balls, c = B[0], R = this.R, dx = Math.cos(this.aim), dy = Math.sin(this.aim);
        let best = 1e9, hit = null;
        for (const b of B) {
            if (b === c || b.in) continue;
            const fx = b.x - c.x, fy = b.y - c.y, t = fx * dx + fy * dy; if (t <= 0) continue;
            const p2 = fx * fx + fy * fy - t * t, r2 = 4 * R * R; if (p2 > r2) continue;
            const tt = t - Math.sqrt(r2 - p2); if (tt < best) { best = tt; hit = b; }
        }
        let L = best;
        if (!hit) { const tx = dx > 0 ? (this.W - R - c.x) / dx : dx < 0 ? (R - c.x) / dx : 1e9, ty = dy > 0 ? (this.H - R - c.y) / dy : dy < 0 ? (R - c.y) / dy : 1e9; L = Math.min(tx, ty); }
        const gx = c.x + dx * L, gy = c.y + dy * L;
        x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 0.35; x.setLineDash([1.6, 1.4]);
        x.beginPath(); x.moveTo(c.x + dx * R, c.y + dy * R); x.lineTo(gx, gy); x.stroke(); x.setLineDash([]);
        x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 0.3; x.beginPath(); x.arc(gx, gy, R, 0, 7); x.stroke();
        if (hit) {
            let nx = hit.x - gx, ny = hit.y - gy; const n = hypot(nx, ny); nx /= n; ny /= n;
            const ok = this._isLegalFirst(hit.n);
            x.strokeStyle = ok ? 'rgba(255,240,180,0.85)' : 'rgba(255,90,90,0.85)'; x.lineWidth = 0.55;
            x.beginPath(); x.moveTo(hit.x, hit.y); x.lineTo(hit.x + nx * 26, hit.y + ny * 26); x.stroke();
        }
        // caminho da branca depois do 1º choque (bola ou tabela)
        const P = this._predict();
        if (P && P.length > 1) {
            x.strokeStyle = 'rgba(150,200,255,0.55)'; x.lineWidth = 0.32; x.setLineDash([0.8, 1.1]);
            x.beginPath(); x.moveTo(P[0][0], P[0][1]); for (const q of P) x.lineTo(q[0], q[1]); x.stroke(); x.setLineDash([]);
            const e = P[P.length - 1]; x.fillStyle = 'rgba(150,200,255,0.5)'; x.beginPath(); x.arc(e[0], e[1], 0.6, 0, 7); x.fill();
        }
    },
    _predict() {
        const c = this.balls[0], pw = this.power > 0.03 ? this.power : 0.45, key = [this.aim.toFixed(4), pw.toFixed(2), this.spin.a.toFixed(2), this.spin.b.toFixed(2), c.x.toFixed(2), c.y.toFixed(2)].join();
        if (this._pred && (this._pred.key === key || performance.now() - this._pred.t < 90)) return this._pred.pts;      // (no máximo ~11×/s)
        const B = this._clone(this.balls), ev = { first: null, pocketed: [], rail: false, vis: false }, cue = B[0];
        this._strike(cue, this.aim, this._shotSpeed(pw), this.spin.a, this.spin.b);
        const pts = []; let after = 0, lx = 0, ly = 0;
        for (let i = 0; i < 1800 && !cue.in; i++) {
            const moving = this._step(B, ev);
            if (ev.cueHit || ev.rail) {
                if (!pts.length) { pts.push([cue.x, cue.y]); lx = cue.x; ly = cue.y; }
                else if (i % 3 === 0) { after += hypot(cue.x - lx, cue.y - ly); lx = cue.x; ly = cue.y; pts.push([cue.x, cue.y]); if (after > 38) break; }
            }
            if (!moving) break;
        }
        this._pred = { key, pts, t: performance.now() };
        return pts;
    },
    _isLegalFirst(n) {
        const grp = this.groups[0];
        if (!grp) return n !== 8 || !this.broken;
        const mine = this.balls.filter((b) => !b.in && (grp === 'solid' ? b.n >= 1 && b.n <= 7 : b.n >= 9 && b.n <= 15));
        return mine.length ? mine.some((b) => b.n === n) : n === 8;
    },
    // Taco: madeira com brilho, anel, cabo enrolado; recua com a força e, na tacada, avança até a branca. A ponta mira o ponto do
    // efeito (um pouco para o lado da bola).
    _cue(x) {
        const c = this.balls[0], S = this.stroke;
        const aim = S ? S.ang : this.aim, pw = S ? S.back : this.power, sp = S ? { a: S.a } : this.phase === 'ai' ? (this.aiSpin || { a: 0 }) : this.spin;
        const dx = Math.cos(aim), dy = Math.sin(aim), px = -dy, py = dx, so = sp.a * this.R;
        let back = this.R + 1.2 + pw * 26;
        if (S) { const k = Math.min(1, S.t / (0.085 + 0.05 * (1 - S.power))); back = this.R + 0.1 + (back - this.R - 0.1) * (1 - k * k); }
        const L = 150, tx = c.x - dx * back + px * so, ty = c.y - dy * back + py * so, ex = tx - dx * L, ey = ty - dy * L;
        // sombra do taco no pano (longe da luminária)
        x.fillStyle = 'rgba(0,0,0,0.28)'; x.beginPath(); x.moveTo(tx + 1.5 + px * 0.5, ty + 2.5 + py * 0.5); x.lineTo(ex + 3 + px * 1.6, ey + 5 + py * 1.6); x.lineTo(ex + 3 - px * 1.6, ey + 5 - py * 1.6); x.lineTo(tx + 1.5 - px * 0.5, ty + 2.5 - py * 0.5); x.fill();
        const seg = (a, b, w0, w1, fill) => { const ax = tx - dx * a, ay = ty - dy * a, bx = tx - dx * b, by = ty - dy * b; x.fillStyle = fill; x.beginPath(); x.moveTo(ax + px * w0, ay + py * w0); x.lineTo(bx + px * w1, by + py * w1); x.lineTo(bx - px * w1, by - py * w1); x.lineTo(ax - px * w0, ay - py * w0); x.closePath(); x.fill(); };
        const gr = (c0, c1, c2) => { const g = x.createLinearGradient(tx + px * 1.6, ty + py * 1.6, tx - px * 1.6, ty - py * 1.6); g.addColorStop(0, c0); g.addColorStop(0.35, c1); g.addColorStop(0.55, c2 || c1); g.addColorStop(1, c0); return g; };
        seg(0, 0.7, 0.55, 0.55, '#3d6fb4');                            // giz
        seg(0.7, 2.2, 0.58, 0.6, '#f4f1e8');                           // ponteira
        seg(2.2, 95, 0.6, 1.05, gr('#b58b5c', '#f6deb0', '#e2c08c'));  // haste de maple
        seg(95, 97, 1.05, 1.1, gr('#9a9488', '#f4f0e6'));              // anel
        seg(97, 112, 1.1, 1.22, gr('#2a120a', '#7a3a1a'));             // antebraço (jacarandá)
        for (let k = 0; k < 4; k++) seg(99 + k * 3.4, 100.4 + k * 3.4, 1.12 + k * 0.03, 1.13 + k * 0.03, 'rgba(240,225,190,0.55)');   // marchetaria
        seg(112, L - 6, 1.22, 1.5, gr('#141414', '#3a3a3a'));          // cabo enrolado
        for (let k = 112; k < L - 7; k += 1.3) seg(k, k + 0.4, 1.23 + (k - 112) * 0.0075, 1.24 + (k - 112) * 0.0075, 'rgba(255,255,255,0.06)');
        seg(L - 6, L - 1, 1.5, 1.55, gr('#2a120a', '#6a2e14'));
        seg(L - 1, L, 1.55, 1.55, '#111');
    },
};
