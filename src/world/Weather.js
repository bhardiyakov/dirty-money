// ============================================================================
// Weather — o clima da cidade. Quatro estados que se alternam sozinhos (e se misturam suavemente):
//   clear    céu limpo
//   drizzle  chuva fraca   — garoa fina, céu fechando, pouco vento
//   rain     chuva forte   — pancadas, vento, pista molhada, visibilidade menor
//   storm    tempestade    — chuva torrencial, vento forte, RELÂMPAGOS (clarão que ilumina tudo) e TROVÕES (som atrasado pela distância)
//
// `k` (0..1) é a intensidade atual, suavizada (a chuva engrossa e some devagar). O que ela muda:
//   • visual: chuva pixelada em tela (canvas na resolução interna, como o resto do jogo), respingos, clarão dos raios;
//   • luz: DayNight escurece o sol, esfria a cor e, com tempo fechado, acende postes, janelas e faróis mais cedo;
//   • som: chuva contínua e trovões (AudioFX.rain / AudioFX.thunder);
//   • jogo: pista molhada (carros derrapam mais), trânsito mais cauteloso, a polícia enxerga menos longe, barcos balançam mais.
// Tecla Y troca de clima na mão; `dbg.weather('storm')` nos testes.
// ============================================================================

class Weather {
    static get STATES() {
        return {
            clear:   { k: 0,    label: 'Céu limpo',     msg: 'O céu abriu' },
            drizzle: { k: 0.34, label: 'Chuva fraca',   msg: 'Começou a garoar' },
            rain:    { k: 0.7,  label: 'Chuva forte',   msg: 'Chuva forte! A pista está escorregadia' },
            storm:   { k: 1,    label: 'Tempestade',    msg: '⚡ Tempestade! Raios e trovões, visibilidade ruim' },
        };
    }

    constructor(game) {
        this.g = game;
        Weather.cur = this;
        const C = Config.weather;
        this.state = C.start;
        this.k = Weather.STATES[this.state].k;          // intensidade suavizada
        this.target = this.k;
        this.override = 0; this.plan = null; this.rainyDay = false; this._lastHour = 0;
        this.flash = 0;                                 // clarão de relâmpago (0..1)
        this._boltT = 6; this._pulses = []; this._rumble = [];
        this.wind = 0.2; this._windT = 0;               // inclinação da chuva (positivo = vem da esquerda)
        this.gripMul = 1; this.brakeMul = 1; this.sightMul = 1; this.trafficMul = 1;
        this.drops = []; this.splashes = []; this._splashAcc = 0;
        this._makeOverlay();
    }

    // Abrigo mais perto de (x, z) até `maxD`: debaixo de um toldo de loja ou de uma cobertura de posto. { x, z } ou null.
    static shelterNear(x, z, maxD = 80) {
        if (!Weather._shelters) {
            const S = Weather._shelters = [];
            for (const b of CityGrid.blocks) for (const l of b.lots) for (const s of l.shops || []) {
                const m = s.a + 3, o = 0.9;
                S.push({ x: s.side === 'W' ? l.x0 - o : (s.side === 'E' ? l.x1 + o : m), z: s.side === 'S' ? l.z0 - o : (s.side === 'N' ? l.z1 + o : m) });
            }
            for (const b of CityGrid.blocks.concat(CityGrid.extraBlocks || [])) for (const c of b.canopies || []) S.push({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2 });
        }
        let best = null, bd = maxD * maxD;
        for (const s of Weather._shelters) {
            const dx = s.x - x, dz = s.z - z, d = dx * dx + dz * dz;
            if (d < bd) { bd = d; best = s; }
        }
        return best ? { x: best.x + (Math.random() - 0.5) * 3, z: best.z + (Math.random() - 0.5) * 3 } : null;
    }

    _rand([a, b]) { return a + Math.random() * (b - a); }
    get label() { return Weather.STATES[this.state].label; }
    get raining() { return this.k > 0.03; }

    // Efeitos de jogo derivados de k (lidos por Vehicle, TrafficCar, PoliceManager, Helicopter, Boat).
    _derive() {
        const k = this.k;
        this.gripMul = 1 - 0.55 * k;         // pista molhada: derrapa bem mais (tempestade = metade da aderência)
        this.brakeMul = 1 - 0.4 * k;         // freia pior: a distância de parada cresce
        this.sightMul = 1 - 0.3 * k;         // chuva e névoa: a polícia enxerga menos longe
        this.trafficMul = 1 - 0.2 * k;       // motoristas mais cautelosos
    }

    // Troca de estado (instant: sem suavizar). manual: troca pedida à mão (tecla Y / debug) — o calendário só volta a mandar 60 s depois.
    set(state, instant = false, manual = false) {
        if (!Weather.STATES[state]) return this.state;
        const changed = state !== this.state;
        this.state = state;
        this.target = Weather.STATES[state].k;
        if (manual) this.override = 60;
        if (instant) { this.k = this.target; this._derive(); }
        if (state === 'storm') this._boltT = 2 + Math.random() * 3;
        if (changed && this.g.ui && this.g._flash) this.g._flash(Weather.STATES[state].msg);
        return state;
    }

    // Y: próximo clima da lista (para demonstrar).
    cycle() {
        const order = ['clear', 'drizzle', 'rain', 'storm'];
        return this.set(order[(order.indexOf(this.state) + 1) % order.length], false, true);
    }

    // ----------------------------------------------------------- calendário
    // Chuva NÃO é diária: a cada dia do jogo sorteia-se se é um dia de chuva (Config.weather.rainDayChance, ~30%). Dia seco = céu
    // limpo o dia todo. Dia chuvoso tem 1–2 EPISÓDIOS em horas aleatórias do relógio do jogo: começa em garoa, sobe até o pico
    // sorteado (garoa, chuva forte ou tempestade) e volta a garoar antes de abrir. `plan` = [{ s, e, peak }] em horas do jogo.
    _planDay(first) {
        const C = Config.weather, hour = this.g.dayNight ? this.g.dayNight.hour : 0;
        this.plan = [];
        this.rainyDay = Math.random() < (first ? C.firstDayChance : C.rainDayChance);
        if (!this.rainyDay) return;
        const n = Math.random() < 0.4 ? C.episodesPerRainyDay[1] : C.episodesPerRainyDay[0];
        const W = C.peakWeights, total = Object.values(W).reduce((s, v) => s + v, 0);
        for (let i = 0; i < n; i++) {
            const len = this._rand(C.episodeHours);
            // 1º dia: o primeiro episódio começa logo (1–4 h de jogo = 30–120 s reais) para o jogador ver; nos outros, qualquer hora do dia.
            const s = first && i === 0 ? hour + 1 + Math.random() * 3 : Math.random() * (24 - len);
            const e = Math.min(24, s + len);
            if (this.plan.some((p) => s < p.e + 1.5 && e > p.s - 1.5)) continue;          // episódios nunca colam um no outro
            let r = Math.random() * total, peak = 'rain';
            for (const [k, w] of Object.entries(W)) { r -= w; if (r <= 0) { peak = k; break; } }
            this.plan.push({ s, e, peak });
        }
    }

    // Que clima o calendário manda agora (hora do jogo)?
    _planned() {
        const h = this.g.dayNight.hour;
        for (const p of this.plan) {
            if (h < p.s || h >= p.e) continue;
            const u = (h - p.s) / (p.e - p.s);
            return u < 0.22 || u > 0.78 ? 'drizzle' : p.peak;
        }
        return 'clear';
    }

    // ------------------------------------------------------------------ frame
    update(dt) {
        if (this.override > 0) this.override -= dt;
        else if (this.g.dayNight) {
            const h = this.g.dayNight.hour;
            if (!this.plan || h < this._lastHour - 1) this._planDay(!this.plan);            // virou o dia (ou 1ª vez): sorteia o dia
            this._lastHour = h;
            const want = this._planned();
            if (want !== this.state) this.set(want);
        }
        this.k += (this.target - this.k) * Math.min(1, dt * 0.45);
        if (Math.abs(this.target - this.k) < 0.002) this.k = this.target;
        this._derive();
        // Vento: vai e volta devagar; mais forte com a intensidade.
        this._windT += dt;
        this.wind = (0.12 + 0.34 * this.k) * (0.75 + 0.25 * Math.sin(this._windT * 0.23)) + 0.05 * Math.sin(this._windT * 1.7) * this.k;

        this._lightning(dt);
        this._draw(dt);
        AudioFX.rain(this.k);
    }

    // ------------------------------------------------------------ relâmpagos
    // Só com tempestade (e bem de longe, raros, na chuva forte): clarão em 2 pulsos + trovão atrasado (som viaja devagar).
    _lightning(dt) {
        const k = this.k, C = Config.weather;
        if (k > 0.6) {
            this._boltT -= dt;
            if (this._boltT <= 0) {
                const storm = k > 0.88;
                this._boltT = storm ? this._rand(C.boltEvery) : this._rand([16, 34]);
                this._bolt(storm ? 0.75 + Math.random() * 0.25 : 0.3 + Math.random() * 0.25, storm);
            }
        }
        // pulsos agendados -> flash
        let f = 0;
        for (let i = this._pulses.length - 1; i >= 0; i--) {
            const p = this._pulses[i];
            p.t += dt;
            const u = (p.t - p.at) / p.len;
            if (u < 0) continue;
            if (u >= 1) { this._pulses.splice(i, 1); continue; }
            f = Math.max(f, p.a * (u < 0.15 ? u / 0.15 : Math.pow(1 - (u - 0.15) / 0.85, 2)));
        }
        this.flash = f;
        for (let i = this._rumble.length - 1; i >= 0; i--) {
            const r = this._rumble[i];
            r.t -= dt;
            if (r.t <= 0) { AudioFX.thunder(r.power); this._rumble.splice(i, 1); }
        }
    }

    // Um raio: 2 a 3 piscadas; o trovão chega 0,3–2,6 s depois (quanto mais fraco o clarão, mais longe e mais tarde).
    _bolt(power, close) {
        const n = 2 + (Math.random() < 0.4 ? 1 : 0);
        let at = 0;
        for (let i = 0; i < n; i++) { this._pulses.push({ t: 0, at, len: 0.12 + Math.random() * 0.22, a: power * (i === 0 ? 1 : 0.55 + Math.random() * 0.4) }); at += 0.09 + Math.random() * 0.16; }
        const delay = close ? 0.25 + Math.random() * 1.1 : 1.4 + Math.random() * 2.2;
        this._rumble.push({ t: delay, power: power * (close ? 1 : 0.55) });
    }

    // ------------------------------------------------------------- chuva na tela
    // Canvas 2D sobre o jogo, na MESMA resolução interna do render (pixels grandes, como a arte). Fica abaixo do HUD.
    _makeOverlay() {
        const c = this.canvas = document.createElement('canvas');
        c.id = 'weatherFx';
        c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;image-rendering:pixelated;display:none;';
        document.body.appendChild(c);
        this.ctx = c.getContext('2d');
    }

    // Risca de chuva pronta: camada `a` (cor), `n` px de altura, inclinação `slant` (px de x por px de y). Cache por (a, n); refeito
    // quando o vento muda de verdade. _ox = deslocamento x do canto esquerdo em relação à cabeça da gota.
    _dropSprite(a, n, slant) {
        const q = Math.round(slant * 50);
        if (q !== this._dropQ) { this._dropQ = q; this._drops = new Map(); }
        const key = a * 1000 + n;
        let c = this._drops.get(key);
        if (c) return c;
        const xs = [];
        for (let i = 0; i < n; i++) xs.push(Math.round(-i * slant));
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        c = document.createElement('canvas');
        c.width = x1 - x0 + 1; c.height = n;
        const g = c.getContext('2d');
        g.fillStyle = ['rgb(190,215,245)', 'rgb(205,225,250)', 'rgb(225,238,255)'][a];
        for (let i = 0; i < n; i++) g.fillRect(xs[i] - x0, n - 1 - i, 1, 1);
        c._ox = x0;
        this._drops.set(key, c);
        return c;
    }

    _fit() {
        const e = this.g.gameEngine.engine, w = e.getRenderWidth(), h = e.getRenderHeight();
        if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.drops.length = 0; }
    }

    _draw(dt) {
        const k = this.k, cv = this.canvas, ctx = this.ctx;
        const on = (k > 0.02 || this.flash > 0.01) && !Interiors.active;
        if (!on) { if (cv.style.display !== 'none') { cv.style.display = 'none'; ctx.clearRect(0, 0, cv.width, cv.height); } return; }
        if (cv.style.display === 'none') cv.style.display = 'block';
        this._fit();
        const W = cv.width, H = cv.height, s = H / 560;                 // 1 = a altura interna de referência
        ctx.clearRect(0, 0, W, H);

        // Escurecimento fechado do céu (além da luz do mundo): vinheta azul-acinzentada nas bordas.
        if (k > 0.2) {
            const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
            g.addColorStop(0, 'rgba(10,18,34,0)'); g.addColorStop(1, `rgba(10,18,34,${0.42 * (k - 0.2)})`);
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }

        // Gotas: 3 camadas de alfa; cada gota é uma risca diagonal de 1 px (passos inteiros = pixel art).
        const want = Math.min(700, Math.floor(k * 820 * (W / 1000)));
        const drops = this.drops;
        while (drops.length < want) drops.push({ x: Math.random() * W, y: Math.random() * H, v: 0.8 + Math.random() * 0.6, l: 0.6 + Math.random() * 0.8, a: Math.floor(Math.random() * 3) });
        if (drops.length > want) drops.length = want;
        const slant = this.wind, speed = (560 + 480 * k) * s, len0 = (5 + 8 * k) * s;
        // Cada gota é um desenho pronto (risca diagonal de 1 px, por comprimento e camada — ver _dropSprite): um drawImage por gota em
        // vez de um fillRect por PIXEL (eram 5–9 mil chamadas de canvas por quadro na chuva forte). A intensidade de cada camada entra
        // pelo globalAlpha (as riscas são desenhadas opacas).
        const alphas = [0.3 + 0.22 * k, 0.42 + 0.25 * k, 0.58 + 0.27 * k];
        for (let a = 0; a < 3; a++) {
            ctx.globalAlpha = Math.min(1, alphas[a]);
            for (const d of drops) {
                if (d.a !== a) continue;
                d.y += speed * d.v * dt; d.x += speed * d.v * dt * slant;
                if (d.y > H + 12) { d.y = -Math.random() * 30; d.x = Math.random() * (W + 120) - 60 - H * slant * 0.5; }
                const n = Math.max(2, Math.round(len0 * d.l)), sp = this._dropSprite(a, n, slant);
                ctx.drawImage(sp, Math.round(d.x) + sp._ox, Math.round(d.y) - n + 1);
            }
        }
        ctx.globalAlpha = 1;

        // Respingos no chão (e marolas na água): anelzinhos que abrem e somem.
        this._splashAcc += dt * k * 110 * (W / 1000);
        while (this._splashAcc >= 1 && this.splashes.length < 160) { this._splashAcc -= 1; this.splashes.push({ x: Math.random() * W, y: Math.random() * H, t: 0, life: 0.22 + Math.random() * 0.18 }); }
        this._splashAcc = Math.min(this._splashAcc, 2);
        ctx.fillStyle = 'rgb(215,232,255)';
        for (let i = this.splashes.length - 1; i >= 0; i--) {
            const p = this.splashes[i];
            p.t += dt;
            if (p.t >= p.life) { this.splashes.splice(i, 1); continue; }
            const u = p.t / p.life, r = 1 + Math.floor(u * 3);
            ctx.globalAlpha = (1 - u) * (0.35 + 0.3 * k);
            const x = Math.round(p.x), y = Math.round(p.y);
            ctx.fillRect(x - r, y, 1, 1); ctx.fillRect(x + r, y, 1, 1); ctx.fillRect(x, y - Math.max(1, r - 1), 1, 1); ctx.fillRect(x, y + Math.max(1, r - 1), 1, 1);
        }
        ctx.globalAlpha = 1;

        // Clarão do relâmpago.
        if (this.flash > 0.01) { ctx.fillStyle = `rgba(225,232,255,${Math.min(0.62, this.flash * 0.55)})`; ctx.fillRect(0, 0, W, H); }

        // Dentro de casa: nada de chuva (nem vinheta e clarão) por cima do cômodo — um "filtro" recorta o retângulo da casa e a
        // chuva só aparece nas laterais, do lado de fora. O recorte aparece junto com o fade do interior (HouseView.t).
        if (typeof HouseView !== 'undefined' && HouseView.ready && HouseView.t > 0.01) {
            const r = HouseView.screenRect(this.g.scene, W, H);
            if (r) {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-out';
                ctx.globalAlpha = Math.min(1, HouseView.t);
                ctx.fillStyle = '#000';
                ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
                ctx.restore();
            }
        }
    }
}
Weather.cur = null;
memoStatics(Weather, 'STATES');
