// ============================================================================
// Pool — SINUCA (bola 8) nos bares. Mini-jogo em "outro mundo": enquanto a partida está aberta, o jogo 3D para por completo
// (sem update nem render) e a sinuca roda no próprio canvas em tela cheia, a 60 FPS.
//   • Física 2D própria (a sinuca é plana): bolas = círculos, colisão elástica entre bolas, tabelas com perda, bocas das
//     caçapas com "quinas" (jaws), atrito de rolamento. Passo fixo de 1/300 s — determinística, o que a IA usa para simular jogadas.
//   • Desenho em HD com profundidade falsa: esferas com degradê e brilho, sombras, número "rolando", taco, linha de mira.
//   • Apostas: quanto maior a aposta, melhor o adversário (mira mais precisa, avalia mais jogadas, simula o resultado e pensa
//     na próxima bola). Mesmo o mais forte ainda erra às vezes.
// Regras (bola 8 simplificada): quem encaçapa primeiro define o grupo (lisas 1–7 / listradas 9–15). Falta = branca na caçapa,
// não tocar em nada ou tocar primeiro bola que não é sua → bola na mão para o adversário. A 8 só depois do grupo; antes = derrota.
// ============================================================================

const Pool = {
    active: false,
    W: 254, H: 127, R: 2.85,                         // mesa em cm (área de jogo), raio da bola
    A: 34, K: 0.32, VMAX: 520, DT: 1 / 300,           // atrito: dv/dt = −(A + K·v)
    E_BALL: 0.95, E_RAIL: 0.78, E_JAW: 0.6,
    CORNER: 9, MID: 6.2,

    STAKES: [
        { bet: 50, name: 'Chico Bola Sete', emo: '🧔', desc: 'Joga por diversão e erra bastante.' },
        { bet: 300, name: 'Russo do Taco', emo: '👨‍🦲', desc: 'Acerta as fáceis, se perde nas difíceis.' },
        { bet: 1500, name: 'Baiano Tabelinha', emo: '🧑‍🦱', desc: 'Já calcula a jogada e onde a branca vai parar.' },
        { bet: 8000, name: 'Mestre Valdir', emo: '👴', desc: 'Trinta anos de boteco. Raramente perdoa.' },
        { bet: 30000, name: 'O Fantasma', emo: '🕶️', desc: 'Ninguém lembra de vê-lo perder. Quase ninguém.' },
    ],
    // sigma: erro de mira (graus) · pw: erro de força · cand: jogadas avaliadas · sim: jogadas simuladas · blunder: chance de vacilo
    SKILL: [
        { sigma: 1.0, pw: 0.14, cand: 3, sim: 0, blunder: 0.2, pos: 0 },
        { sigma: 0.55, pw: 0.10, cand: 6, sim: 0, blunder: 0.12, pos: 0 },
        { sigma: 0.3, pw: 0.06, cand: 8, sim: 8, blunder: 0.07, pos: 0.5 },
        { sigma: 0.16, pw: 0.04, cand: 12, sim: 14, blunder: 0.045, pos: 1 },
        { sigma: 0.075, pw: 0.025, cand: 18, sim: 22, blunder: 0.04, pos: 1.4 },
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
            #pool .pl-pow.off { opacity: 0.35; pointer-events: none; }
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
                #pool .pl-pow { right: 10px; width: 40px; } #pool .pl-pot b { font-size: 15px; } }`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'pool';
        r.innerHTML = `<canvas></canvas>
            <div class="pl-top"><div class="pl-card" id="plP0"></div><div class="pl-pot" id="plPot"></div><div class="pl-card" id="plP1"></div></div>
            <div class="pl-msg" id="plMsg" style="opacity:0"></div>
            <div class="pl-pow" id="plPow"><i></i><span>FORÇA</span></div>
            <div class="pl-bot"><button class="ui-btn" id="plQuit">Desistir</button><span class="pl-help" id="plHelp"></span></div>
            <div class="pl-modal" id="plModal"></div>`;
        document.body.appendChild(r);
        this.cv = r.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
        this.$ = (id) => document.getElementById(id);
        this.powEl = this.$('plPow');
        window.addEventListener('resize', () => { if (this.active) this._resize(); });
        // entrada: mira no pano, força na barra (ou arrastando para trás com o mouse), bola na mão arrastando a branca
        this.cv.addEventListener('pointerdown', (e) => this._pDown(e));
        window.addEventListener('pointermove', (e) => this._pMove(e));
        window.addEventListener('pointerup', (e) => this._pUp(e));
        this.cv.addEventListener('wheel', (e) => { if (this._canAim()) { e.preventDefault(); this.aim += (e.deltaY > 0 ? 1 : -1) * 0.0025; } }, { passive: false });
        this.powEl.addEventListener('pointerdown', (e) => { if (!this._canAim()) return; e.preventDefault(); this.powEl.setPointerCapture(e.pointerId); this.pull = { bar: true, y0: e.clientY }; this._barPow(e); });
        this.powEl.addEventListener('pointermove', (e) => { if (this.pull && this.pull.bar) this._barPow(e); });
        this.powEl.addEventListener('pointerup', () => { if (this.pull && this.pull.bar) { this.pull = null; this._release(); } });
        this.$('plQuit').addEventListener('click', () => this._quit());
        window.addEventListener('keydown', (e) => this._key(e, true), true);
        window.addEventListener('keyup', (e) => this._key(e, false), true);
    },

    _resize() {
        const dpr = Math.min(2, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight;
        this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.dpr = dpr; this.vw = w; this.vh = h;
        const F = 17, top = h < 520 ? 52 : 82, side = h < 520 ? 64 : 84, bot = h < 520 ? 40 : 56;
        const s = Math.min((w - side * 2) / (this.W + 2 * F), (h - top - bot) / (this.H + 2 * F));
        this.sc = s; this.F = F;
        this.ox = (w - this.W * s) / 2; this.oy = top + (h - top - bot - this.H * s) / 2;
        this._felt = null;
    },

    // ------------------------------------------------------------------ partida
    _renderSetup() {
        const cash = this.g.inventory.cash;
        this.$('plModal').style.display = 'flex';
        this.$('plModal').innerHTML = `<div class="pl-box"><h2>🎱 Sinuca · bola 8</h2>
            <p class="sub">${this.shop ? this.shop.name + ' · ' : ''}Escolha o adversário. Quanto maior a aposta, melhor ele joga.<br>Você tem <b style="color:#86efac">${brl(cash)}</b> (dinheiro vivo).</p>
            ${this.STAKES.map((o, i) => `<button class="pl-opp" data-i="${i}" ${cash < o.bet ? 'disabled' : ''}><span class="av">${o.emo}</span>
                <span class="t"><b>${o.name}</b> <span class="lv">${'★'.repeat(i + 1)}${'☆'.repeat(4 - i)}</span><small>${o.desc}</small></span>
                <span class="bet">${brl(o.bet)}<small>prêmio ${brl(o.bet * 2)}</small></span></button>`).join('')}
            <div class="pl-rules"><b>Regras:</b> quem encaçapa primeiro fica com o grupo (lisas 1–7 ou listradas 9–15). Encaçape o seu grupo e depois a 8.
            <b>Falta</b> (branca na caçapa, não tocar em nada ou tocar primeiro a bola errada) dá <b>bola na mão</b> ao adversário. Encaçapar a 8 antes da hora = derrota.<br>
            <b>Controles:</b> mire apontando no pano · força na barra da direita (ou segure o botão do mouse e puxe para trás) · ESPAÇO segura e solta · ← → ajuste fino · roda do mouse ajuste fino.</div>
            <div class="row" style="display:flex;justify-content:center;margin-top:14px"><button class="ui-btn" id="plLeave">Voltar ao bar</button></div></div>`;
        this.$('plLeave').onclick = () => this.close();
        for (const b of this.$('plModal').querySelectorAll('.pl-opp')) b.onclick = () => this._startMatch(+b.dataset.i);
        this.phase = 'setup'; this._setupTable();
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
        this.aim = 0; this.power = 0; this.pull = null; this.shots = 0;
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
        for (const x of b) { x.vx = 0; x.vy = 0; x.in = false; x.ph = Math.random() * 6; x.ang = Math.random() * 6; }
        this.balls = b;
    },

    // ------------------------------------------------------------------ física (pura: serve também à simulação da IA)
    _step(B, ev) {
        const dt = this.DT, R = this.R, W = this.W, H = this.H, C = this.CORNER, M = this.MID, D2 = 4 * R * R;
        let moving = false;
        for (const b of B) {
            if (b.in) continue;
            const s = hypot(b.vx, b.vy);
            if (s <= 0) continue;
            const ns = s - (this.A + this.K * s) * dt;
            if (ns <= 1.2) { b.vx = 0; b.vy = 0; continue; }
            b.vx *= ns / s; b.vy *= ns / s;
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (ev.vis) { b.ph += ns * dt / R; b.ang = Math.atan2(b.vy, b.vx); }
            moving = true;
        }
        // bola × bola (várias passadas: a energia atravessa o triângulo na saída, como na mesa de verdade)
        for (let pass = 0; pass < 3; pass++) for (let i = 0; i < B.length; i++) {
            const a = B[i]; if (a.in) continue;
            for (let j = i + 1; j < B.length; j++) {
                const c = B[j]; if (c.in) continue;
                const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
                if (d2 >= D2 || d2 === 0) continue;
                const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
                const ov = (2 * R - d) / 2; a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
                if (vn <= 0) continue;
                const j2 = (1 + this.E_BALL) / 2 * vn;
                a.vx -= j2 * nx; a.vy -= j2 * ny; c.vx += j2 * nx; c.vy += j2 * ny;
                if (ev.first == null && (a.n === 0 || c.n === 0)) ev.first = a.n === 0 ? c.n : a.n;
                if (ev.vis && vn > 25 && pass === 0) ev.sounds.push(['ball', vn]);
            }
        }
        // tabelas (fora das bocas), quinas das bocas e caçapas
        for (const b of B) {
            if (b.in) continue;
            const inCornerY = b.y < C || b.y > H - C, inCornerX = b.x < C || b.x > W - C, inMid = Math.abs(b.x - W / 2) < M;
            if (b.x < R && !inCornerY) { b.x = R; if (b.vx < 0) { b.vx = -b.vx * this.E_RAIL; b.vy *= 0.94; ev.rail = true; if (ev.vis) ev.sounds.push(['rail', -b.vx]); } }
            if (b.x > W - R && !inCornerY) { b.x = W - R; if (b.vx > 0) { b.vx = -b.vx * this.E_RAIL; b.vy *= 0.94; ev.rail = true; if (ev.vis) ev.sounds.push(['rail', b.vx]); } }
            if (b.y < R && !inCornerX && !inMid) { b.y = R; if (b.vy < 0) { b.vy = -b.vy * this.E_RAIL; b.vx *= 0.94; ev.rail = true; if (ev.vis) ev.sounds.push(['rail', -b.vy]); } }
            if (b.y > H - R && !inCornerX && !inMid) { b.y = H - R; if (b.vy > 0) { b.vy = -b.vy * this.E_RAIL; b.vx *= 0.94; ev.rail = true; if (ev.vis) ev.sounds.push(['rail', b.vy]); } }
            if (inCornerX || inCornerY || inMid) {
                for (const [px, py] of this._jaws) {
                    const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
                    if (d2 >= R * R || d2 === 0) continue;
                    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
                    b.x = px + nx * R; b.y = py + ny * R;
                    if (vn < 0) { b.vx -= (1 + this.E_JAW) * vn * nx; b.vy -= (1 + this.E_JAW) * vn * ny; }
                }
                for (const p of this._pockets) {
                    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < p.r * p.r) { b.in = true; b.vx = b.vy = 0; ev.pocketed.push(b.n); if (ev.vis) ev.sounds.push(['pocket', 1]); break; }
                }
            }
            if (!b.in && (b.x < -9 || b.x > W + 9 || b.y < -9 || b.y > H + 9)) { b.in = true; b.vx = b.vy = 0; ev.pocketed.push(b.n); }
        }
        return moving;
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
    // distância percorrida até parar com velocidade v, e o inverso
    _dist(v) { const A = this.A, K = this.K; return v / K - A / (K * K) * Math.log(1 + K * v / A); },
    _invDist(s) { let lo = 0, hi = 2000; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (this._dist(m) < s) lo = m; else hi = m; } return lo; },

    // ------------------------------------------------------------------ tacada
    _shoot(ang, power) {
        const cue = this.balls[0], v = this._speedOf(power) * (this.broken ? 1 : 1.75);      // a saída é bem mais forte que uma tacada normal
        cue.vx = Math.cos(ang) * v; cue.vy = Math.sin(ang) * v;
        this.ev = { first: null, pocketed: [], rail: false, vis: true, sounds: [] };
        this.phase = 'roll'; this.inHand = false; this.shots++;
        this._acc = 0; this._rollT = 0;
        AudioFX.blip(180 + power * 120, 0.05, 0.12 + power * 0.18);
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
            if (firstIn != null) { grp[me] = firstIn < 8 ? 'solid' : 'stripe'; grp[op] = firstIn < 8 ? 'stripe' : 'solid'; this._msg(`${me === 0 ? 'Você fica' : this.opp.name + ' fica'} com as ${grp[me] === 'solid' ? 'lisas' : 'listradas'}`); }
        }
        const wasBreak = !this.broken; this.broken = true;
        if (scratch) { const c = B[0]; c.in = false; c.x = this.W * 0.25; c.y = this.H / 2; c.vx = c.vy = 0; this._freeSpot(c); }
        const scoredMine = ev.pocketed.some((n) => n !== 0 && n !== 8 && (grp[me] ? isMine(n, me) : true));
        if (foul) {
            this.turn = op; this.inHand = true;
            this._msg(`Falta: ${why}. ${op === 0 ? 'Bola na mão para você — arraste a branca.' : 'Bola na mão para ' + this.opp.name + '.'}`);
            AudioFX.blip(160, 0.2, 0.15);
        } else if (scoredMine || (wasBreak && ev.pocketed.length)) {
            this._msg(me === 0 ? (left(0) === 0 && grp[0] ? 'Agora é a 8! Escolha a caçapa.' : 'Boa! Joga de novo.') : `${this.opp.name} continua.`);
        } else {
            this.turn = op;
            this._msg(op === 0 ? 'Sua vez.' : `Vez de ${this.opp.name}.`);
        }
        this.phase = 'aim'; this.power = 0;
        if (this.turn === 1) this._aiStart();
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
        this.phase = 'end';
        const won = winner === 0, o = this.opp, g = this.g;
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
            const vObj = this._invDist(d2 + 18), vHit = vObj / (Math.cos(cut) * 0.975 + 0.02), v0 = this._invDist(this._dist(vHit) + d1);
            const score = Math.cos(cut) ** 2 / (1 + (d1 + d2) / 220) / (1 + Math.max(0, v0 - this.VMAX) / 100);
            out.push({ ang: Math.atan2(cy, cx), pow: this._powOf(Math.min(this.VMAX, v0 * 1.08)), score, t: t.n });
        }
        return out.sort((a, b) => b.score - a.score);
    },
    _clone(B) { return B.map((b) => ({ n: b.n, x: b.x, y: b.y, vx: 0, vy: 0, in: b.in })); },
    _simulate(B0, ang, pow) {
        const B = this._clone(B0), v = this._speedOf(pow), ev = { first: null, pocketed: [], rail: false, vis: false };
        B[0].vx = Math.cos(ang) * v; B[0].vy = Math.sin(ang) * v;
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
            const saveG = this.groups; const next = this._candidates(B, B[0], this._legalIn(B, who));
            s += this.sk.pos * Math.min(3, next.filter((c) => c.score > 0.3).length) + (next[0] ? next[0].score * 4 : -2);
            this.groups = saveG;
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
        this.phase = 'ai'; this.ai = { t: 0, plan: null, gen: this._aiThink(), shown: this.aim };
    },
    // Pensa em fatias (gerador): poucas simulações por quadro, sem travar a animação.
    *_aiThink() {
        const sk = this.sk, B = this.balls, cue = B[0];
        if (this.inHand) {                                             // bola na mão: testa posições e fica com a de melhor jogada
            let best = null;
            for (let k = 0; k < 40; k++) {
                const x = this.R + Math.random() * (this.W - 2 * this.R), y = this.R + Math.random() * (this.H - 2 * this.R);
                if (B.some((b) => b !== cue && !b.in && hypot(b.x - x, b.y - y) < 2 * this.R + 0.5)) continue;
                const c = this._candidates(B, { x, y }, this._legal(1))[0];
                if (c && (!best || c.score > best.s)) best = { x, y, s: c.score };
                if (k % 10 === 9) yield;
            }
            if (best) { cue.x = best.x; cue.y = best.y; }
            this.inHand = false;
        }
        const cands = this._candidates(B, cue, this._legal(1)).slice(0, sk.cand);
        let plan = null;
        if (sk.sim && cands.length) {
            let bestS = -1e9;
            const dA = Math.max(0.12, sk.sigma * 1.2) * Math.PI / 180;      // jogada ROBUSTA: média do resultado com a mira um pouco para cada lado
            for (const c of cands.slice(0, Math.ceil(sk.sim / 2))) for (const m of [0.92, 1.12]) {
                const pow = Math.min(1, c.pow * m);
                let s = 0; for (const da of [-dA, 0, dA]) s += this._evalSim(this._simulate(B, c.ang + da, pow), 1);
                s = s / 3 + c.score * 3;
                if (s > bestS) { bestS = s; plan = { ang: c.ang, pow }; }
                yield;
            }
        } else if (cands.length) {
            const c = cands[Math.floor(Math.random() * Math.min(cands.length, sk.cand > 4 ? 1 : 2))]; plan = { ang: c.ang, pow: c.pow };
        }
        if (!plan) {                                                   // sem jogada direta: defesa — encostar numa bola legal sem cometer falta
            let bestS = -1e9;
            const L = this._legal(1).length ? this._legal(1) : B.filter((b) => !b.in && b.n !== 0);
            for (let k = 0; k < (sk.sim ? 24 : 6) && L.length; k++) {
                const t = L[Math.floor(Math.random() * L.length)], ang = Math.atan2(t.y - cue.y, t.x - cue.x) + (Math.random() - 0.5) * (k < 4 ? 0 : 0.6), pow = 0.22 + Math.random() * 0.3;
                const s = sk.sim ? this._evalSim(this._simulate(B, ang, pow), 1) : 0;
                if (s > bestS) { bestS = s; plan = { ang, pow }; }
                if (sk.sim) yield;
            }
        }
        if (!plan) { const t = this._legal(1)[0] || B[1]; plan = { ang: Math.atan2(t.y - cue.y, t.x - cue.x), pow: 0.35 }; }
        // erro humano: mira e força com ruído (e de vez em quando um vacilo)
        const g = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
        const blunder = Math.random() < sk.blunder ? 3 : 1;
        plan.ang += g() * sk.sigma * blunder * Math.PI / 180;
        plan.pow = Math.max(0.05, Math.min(1, plan.pow * (1 + g() * sk.pw)));
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
        if (k >= 1 && a.t - a.t0 > 1.1) {
            this.power = Math.min(a.plan.pow, (a.t - a.t0 - 1.1) / 0.5 * a.plan.pow);
            if (a.t - a.t0 > 1.75) { this.aim = a.plan.ang; this._shoot(a.plan.ang, a.plan.pow); this.ai = null; }
        }
    },

    // ------------------------------------------------------------------ entrada do jogador
    _canAim() { return this.active && this.phase === 'aim' && this.turn === 0; },
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
        c.x = x; c.y = y;
    },
    _barPow(e) { const r = this.powEl.getBoundingClientRect(); this.power = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); },
    _release() { if (this._canAim() && this.power > 0.03) this._shoot(this.aim, this.power); else this.power = 0; },
    _key(e, down) {
        if (!this.active) return;
        const k = e.key;
        e.stopPropagation();
        if (!down) { if (k === ' ' && this.spaceHold) { this.spaceHold = false; this._release(); } this.keys = this.keys || {}; this.keys[k] = false; e.preventDefault(); return; }
        e.preventDefault();
        if (k === 'Escape') { if (this.phase === 'setup' || this.phase === 'end') this.close(); else this._quit(); return; }
        this.keys = this.keys || {}; this.keys[k] = true;
        if (k === ' ' && this._canAim() && !this.spaceHold) { this.spaceHold = true; this._spT = 0; }
    },

    // ------------------------------------------------------------------ quadro
    _frame(dt) {
        if (this.phase === 'roll') {
            this._acc += dt; this._rollT += dt;
            let moving = true, n = 0;
            while (this._acc >= this.DT && n < 40) { moving = this._step(this.balls, this.ev); this._acc -= this.DT; n++; if (!moving) break; }
            this._sounds();
            if (!moving || this._rollT > 30) { for (const b of this.balls) { b.vx = b.vy = 0; } this._resolve(); }
        } else if (this.phase === 'ai' && this.ai) this._aiUpdate(dt);
        else if (this._canAim()) {
            const K = this.keys || {}, f = K.Shift ? 0.012 : 0.0025;
            if (K.ArrowLeft || K.a) this.aim -= f; if (K.ArrowRight || K.d) this.aim += f;
            if (this.spaceHold) { this._spT += dt; const t = (this._spT / 1.3) % 2; this.power = t < 1 ? t : 2 - t; }
        }
        if (this._msgT > 0) { this._msgT -= dt; if (this._msgT <= 0) this.$('plMsg').style.opacity = 0; }
        this.powEl.classList.toggle('off', !this._canAim());
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
        if (pocket) AudioFX.blip(90, 0.18, 0.25);
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
        this.$('plP0').innerHTML = `<span class="av">😎</span><span><b>Você</b><small>${playing ? pips(0) : ''}</small></span>`;
        this.$('plP1').innerHTML = `<span><b style="text-align:right">${playing ? o.name : '—'}</b><small style="justify-content:flex-end">${playing ? pips(1) : ''}</small></span><span class="av">${playing ? o.emo : '❔'}</span>`;
        this.$('plP0').classList.toggle('turn', playing && this.phase !== 'end' && this.turn === 0);
        this.$('plP1').classList.toggle('turn', playing && this.phase !== 'end' && this.turn === 1);
        this.$('plPot').innerHTML = playing ? `<b>${brl(o.bet * 2)}</b><small>em jogo · aposta ${brl(o.bet)}</small>` : `<b>🎱</b><small>sinuca</small>`;
        this.$('plHelp').textContent = this.vw < 700 ? '' : 'Mire no pano · força na barra ou puxe com o mouse · ESPAÇO segura/solta · ← → ajuste fino';
    },

    // ------------------------------------------------------------------ desenho
    _draw() {
        const x = this.ctx, d = this.dpr, s = this.sc, W = this.W, H = this.H, F = this.F, ox = this.ox, oy = this.oy;
        x.setTransform(d, 0, 0, d, 0, 0);
        // ambiente: bar escuro e a luz da luminária sobre a mesa
        const bg = x.createRadialGradient(this.vw / 2, oy + H * s / 2, 40, this.vw / 2, oy + H * s / 2, Math.max(this.vw, this.vh) * 0.75);
        bg.addColorStop(0, '#3a2a1a'); bg.addColorStop(0.45, '#1a120b'); bg.addColorStop(1, '#060403');
        x.fillStyle = bg; x.fillRect(0, 0, this.vw, this.vh);
        x.save(); x.translate(ox, oy); x.scale(s, s);
        // sombra da mesa
        x.fillStyle = 'rgba(0,0,0,0.55)'; x.filter = 'blur(18px)'; x.fillRect(-F + 6, -F + 14, W + 2 * F, H + 2 * F); x.filter = 'none';
        // moldura de madeira
        const wood = x.createLinearGradient(0, -F, 0, H + F); wood.addColorStop(0, '#8a5228'); wood.addColorStop(0.5, '#5e3416'); wood.addColorStop(1, '#3e200c');
        x.fillStyle = wood; this._rr(x, -F, -F, W + 2 * F, H + 2 * F, 9); x.fill();
        x.strokeStyle = 'rgba(255,220,170,0.25)'; x.lineWidth = 0.8; this._rr(x, -F + 1.5, -F + 1.5, W + 2 * F - 3, H + 2 * F - 3, 8); x.stroke();
        x.strokeStyle = 'rgba(40,18,6,0.35)'; x.lineWidth = 0.5;
        for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(-F + 4, -F + 3 + i * 1.6); x.bezierCurveTo(W * 0.3, -F + 2 + i * 1.7, W * 0.7, -F + 4 + i * 1.5, W + F - 4, -F + 3 + i * 1.6); x.stroke(); }
        // diamantes
        x.fillStyle = '#f3e7cf';
        for (let i = 1; i < 8; i++) if (i !== 4) { this._dia(x, W * i / 8, -F / 2 - 1); this._dia(x, W * i / 8, H + F / 2 + 1); }
        for (let i = 1; i < 4; i++) { this._dia(x, -F / 2 - 1, H * i / 4); this._dia(x, W + F / 2 + 1, H * i / 4); }
        // tabelas (borracha verde) e pano
        const rail = 5.2;
        x.fillStyle = '#145c31'; x.fillRect(-rail, -rail, W + 2 * rail, H + 2 * rail);
        x.drawImage(this._feltCanvas(), 0, 0, W, H);
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, W, 1.2); x.fillRect(0, 0, 1.2, H);
        // caçapas
        for (const p of this._pockets) {
            const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r + 1.4); g.addColorStop(0, '#000'); g.addColorStop(0.75, '#050505'); g.addColorStop(1, '#2a1a0e');
            x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r + 1.2, 0, Math.PI * 2); x.fill();
        }
        // marca de saída
        x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 0.4; x.beginPath(); x.moveTo(W * 0.25, 0); x.lineTo(W * 0.25, H); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.arc(W * 0.72, H / 2, 0.7, 0, 7); x.fill();
        // mira (só na vez do jogador)
        const B = this.balls, cue = B[0];
        if (this._canAim() && !cue.in) this._guide(x);
        // bolas: sombras, depois as bolas
        for (const b of B) if (!b.in) { x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(b.x + 0.9, b.y + 1.3, this.R * 1.02, this.R * 0.9, 0, 0, 7); x.fill(); }
        for (const b of B) if (!b.in) this._ball(x, b);
        if (this.inHand && this.turn === 0 && this.phase === 'aim') { x.strokeStyle = 'rgba(255,255,255,0.7)'; x.setLineDash([1.2, 1.2]); x.lineWidth = 0.5; x.beginPath(); x.arc(cue.x, cue.y, this.R + 2.2, 0, 7); x.stroke(); x.setLineDash([]); }
        // taco
        if ((this.phase === 'aim' && this.turn === 0) || this.phase === 'ai') this._cue(x);
        x.restore();
        // luz da luminária por cima
        const lg = x.createRadialGradient(this.vw / 2, oy + H * s * 0.45, 10, this.vw / 2, oy + H * s * 0.45, W * s * 0.7);
        lg.addColorStop(0, 'rgba(255,230,170,0.10)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = lg; x.fillRect(0, 0, this.vw, this.vh);
    },
    _rr(x, a, b, w, h, r) { x.beginPath(); x.roundRect(a, b, w, h, r); },
    _dia(x, a, b) { x.beginPath(); x.moveTo(a, b - 1.3); x.lineTo(a + 0.8, b); x.lineTo(a, b + 1.3); x.lineTo(a - 0.8, b); x.closePath(); x.fill(); },
    _feltCanvas() {
        if (this._felt) return this._felt;
        const k = Math.max(2, Math.round(this.sc * this.dpr)), c = document.createElement('canvas'); c.width = this.W * k; c.height = this.H * k;
        const x = c.getContext('2d', { willReadFrequently: true }), g = x.createRadialGradient(c.width / 2, c.height * 0.45, 10, c.width / 2, c.height / 2, c.width * 0.62);
        g.addColorStop(0, '#2fae62'); g.addColorStop(0.6, '#20884a'); g.addColorStop(1, '#156836');
        x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
        const id = x.getImageData(0, 0, c.width, c.height), D = id.data;
        for (let i = 0; i < D.length; i += 4) { const n = (Math.random() - 0.5) * 9; D[i] += n; D[i + 1] += n; D[i + 2] += n; }
        x.putImageData(id, 0, 0);
        return (this._felt = c);
    },
    _ball(x, b) {
        const R = this.R, col = this.COLORS[b.n === 0 ? 0 : (b.n % 8 || 8)], stripe = b.n > 8;
        x.save(); x.beginPath(); x.arc(b.x, b.y, R, 0, 7); x.clip();
        x.fillStyle = stripe ? '#f4f0e4' : col; x.fillRect(b.x - R, b.y - R, 2 * R, 2 * R);
        const off = Math.sin(b.ph) * R * 0.75, vis = Math.cos(b.ph), ca = Math.cos(b.ang), sa = Math.sin(b.ang);
        if (stripe) {                                                 // faixa: desloca com o "rolar" na direção do movimento
            x.save(); x.translate(b.x + ca * off * 0.6, b.y + sa * off * 0.6); x.rotate(b.ang + Math.PI / 2);
            x.fillStyle = col; x.fillRect(-R * 1.4, -R * 0.55 * (0.55 + 0.45 * Math.abs(vis)), R * 2.8, R * 1.1 * (0.55 + 0.45 * Math.abs(vis))); x.restore();
        }
        if (b.n > 0 && vis > -0.15) {                                 // círculo do número
            const nx = b.x + ca * off, ny = b.y + sa * off, rr = R * 0.47 * (0.45 + 0.55 * Math.max(0, vis));
            x.fillStyle = '#fbf8f0'; x.beginPath(); x.ellipse(nx, ny, rr, rr, 0, 0, 7); x.fill();
            if (rr > R * 0.3) { x.fillStyle = '#111'; x.font = `800 ${(rr * 1.25).toFixed(2)}px Inter, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(b.n), nx, ny + rr * 0.06); }
        }
        if (b.n === 0) { x.fillStyle = 'rgba(200,40,40,0.55)'; x.beginPath(); x.arc(b.x + ca * off, b.y + sa * off, R * 0.16, 0, 7); x.fill(); }
        // volume: sombra embaixo-direita e brilho em cima-esquerda
        const sh = x.createRadialGradient(b.x - R * 0.4, b.y - R * 0.45, R * 0.15, b.x, b.y, R * 1.05);
        sh.addColorStop(0, 'rgba(255,255,255,0.28)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.5)');
        x.fillStyle = sh; x.fillRect(b.x - R, b.y - R, 2 * R, 2 * R);
        x.restore();
        x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.ellipse(b.x - R * 0.38, b.y - R * 0.42, R * 0.22, R * 0.15, -0.6, 0, 7); x.fill();
    },
    // Linha de mira: até a 1ª bola (bola fantasma), direção da bola atingida e desvio da branca.
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
            const tx = dx - nx * (dx * nx + dy * ny), ty = dy - ny * (dx * nx + dy * ny), tl = hypot(tx, ty);
            if (tl > 0.05) { x.strokeStyle = 'rgba(255,255,255,0.3)'; x.lineWidth = 0.3; x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + tx / tl * 16 * tl, gy + ty / tl * 16 * tl); x.stroke(); }
        }
    },
    _isLegalFirst(n) {
        const grp = this.groups[0];
        if (!grp) return n !== 8 || !this.broken;
        const mine = this.balls.filter((b) => !b.in && (grp === 'solid' ? b.n >= 1 && b.n <= 7 : b.n >= 9 && b.n <= 15));
        return mine.length ? mine.some((b) => b.n === n) : n === 8;
    },
    _cue(x) {
        const c = this.balls[0], dx = Math.cos(this.aim), dy = Math.sin(this.aim), back = this.R + 1.2 + this.power * 26, L = 150;
        const tx = c.x - dx * back, ty = c.y - dy * back, ex = tx - dx * L, ey = ty - dy * L, px = -dy, py = dx;
        x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.moveTo(tx + 1.5 + px * 0.5, ty + 2.5 + py * 0.5); x.lineTo(ex + 3 + px * 1.6, ey + 5 + py * 1.6); x.lineTo(ex + 3 - px * 1.6, ey + 5 - py * 1.6); x.lineTo(tx + 1.5 - px * 0.5, ty + 2.5 - py * 0.5); x.fill();
        const seg = (a, b, w0, w1, fill) => { const ax = tx - dx * a, ay = ty - dy * a, bx = tx - dx * b, by = ty - dy * b; x.fillStyle = fill; x.beginPath(); x.moveTo(ax + px * w0, ay + py * w0); x.lineTo(bx + px * w1, by + py * w1); x.lineTo(bx - px * w1, by - py * w1); x.lineTo(ax - px * w0, ay - py * w0); x.closePath(); x.fill(); };
        const gr = (c0, c1) => { const g = x.createLinearGradient(tx + px * 1.6, ty + py * 1.6, tx - px * 1.6, ty - py * 1.6); g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c0); return g; };
        seg(0, 0.7, 0.55, 0.55, '#4a7ab8');                            // giz
        seg(0.7, 2.2, 0.58, 0.6, '#f4f1e8');                           // ponteira
        seg(2.2, 95, 0.6, 1.05, gr('#c8a070', '#f2d8a8'));             // haste de maple
        seg(95, 97, 1.05, 1.1, '#e8e2d0');                             // anel
        seg(97, L, 1.1, 1.55, gr('#2a120a', '#6a2e14'));               // cabo
        seg(L - 3, L, 1.55, 1.55, '#111');
    },
};
