// ============================================================================
// Lockpick — mini-game de arrombar um carro "na manha" (roubo furtivo, sem alarme).
// A fechadura tem alguns PINOS. Cada pino mostra um marcador que vai e volta numa barra; aperte ESPAÇO (ou clique)
// quando ele estiver dentro da zona verde para travar o pino. Errar faz BARULHO (o pino recomeça, a zona muda);
// barulho demais dispara o alarme. Pinos de trás são mais rápidos e a zona é mais estreita. Esc desiste.
// Roda em tempo real junto com o jogo (o mundo não pausa): demorar é arriscado.
// ============================================================================

class Lockpick {
    constructor(game) {
        this.g = game;
        this.active = false;
        this.onEnd = null;
        this.pins = [];
        this.noise = 0;
        this._end = 0;                 // contagem para fechar o painel depois do resultado
        this._build();
    }

    _build() {
        const css = document.createElement('style');
        css.textContent = `
            #lockpick { display:none; position:absolute; left:50%; top:9%; transform:translateX(-50%); z-index:14; width:330px;
                padding:12px 14px; color:#00ff00; font-size:12px; background:rgba(0,0,0,0.86); border:2px solid #00ff00;
                border-radius:4px; box-shadow:0 0 22px rgba(0,255,0,0.35); pointer-events:none; }
            #lockpick h3 { font-size:13px; margin-bottom:8px; border-bottom:1px solid #00ff00; padding-bottom:6px; display:flex; justify-content:space-between; }
            #lockpick .lp-pin { position:relative; height:20px; margin:7px 0; background:#07140a; border:1px solid #1d4a1d; }
            #lockpick .lp-zone { position:absolute; top:0; bottom:0; background:rgba(0,255,90,0.38); border-left:1px solid #00ff5a; border-right:1px solid #00ff5a; }
            #lockpick .lp-mark { position:absolute; top:-3px; bottom:-3px; width:4px; margin-left:-2px; background:#ffe14d; box-shadow:0 0 6px #ffe14d; }
            #lockpick .lp-pin.done { border-color:#00ff5a; background:#0b2a14; }
            #lockpick .lp-pin.done .lp-mark { display:none; }
            #lockpick .lp-pin.done .lp-zone { left:0 !important; width:100% !important; background:rgba(0,255,90,0.55); }
            #lockpick .lp-pin.idle { opacity:0.45; }
            #lockpick .lp-pin.idle .lp-mark { display:none; }
            #lockpick .lp-pin.miss { border-color:#ff5a4d; background:#2a0b0b; }
            #lockpick .lp-noise { margin-top:8px; display:flex; justify-content:space-between; }
            #lockpick .lp-hint { margin-top:8px; color:#7d9a7d; font-size:11px; }
            #lockpick.fail { border-color:#ff5a4d; color:#ff5a4d; box-shadow:0 0 22px rgba(255,60,40,0.45); }
            #lockpick.win { border-color:#7dff9a; }`;
        document.head.appendChild(css);

        const el = this.el = document.createElement('div');
        el.id = 'lockpick';
        el.innerHTML = `<h3><span>≡ ARROMBAR FECHADURA</span><span id="lpState">FURTIVO</span></h3>
            <div id="lpPins"></div>
            <div class="lp-noise"><span>Barulho</span><span id="lpNoise"></span></div>
            <div class="lp-hint">ESPAÇO / clique: travar o pino na zona verde · Esc: desistir</div>`;
        document.body.appendChild(el);
        this.pinsEl = el.querySelector('#lpPins');
        this.noiseEl = el.querySelector('#lpNoise');
        this.stateEl = el.querySelector('#lpState');
    }

    // difficulty: ~0,85 (fácil) … 1,35 (difícil). onEnd('ok' | 'alarm' | 'cancel').
    start({ difficulty = 1, onEnd } = {}) {
        const C = Config.theft.lockpick;
        this.onEnd = onEnd;
        this.noise = 0;
        this._end = 0;
        this.result = null;
        this.pins = [];
        this.pinsEl.innerHTML = '';
        for (let i = 0; i < C.pins; i++) {
            const pin = {
                speed: (C.speed + i * C.speedStep) * difficulty,
                zone: Math.max(0.09, (C.zone - i * C.zoneStep) / Math.sqrt(difficulty)),
                m: 0, dir: 1, center: 0, done: false, missT: 0,
            };
            pin.center = this._roll(pin.zone);
            const row = document.createElement('div');
            row.className = 'lp-pin';
            row.innerHTML = '<div class="lp-zone"></div><div class="lp-mark"></div>';
            this.pinsEl.appendChild(row);
            pin.row = row; pin.zoneEl = row.firstChild; pin.markEl = row.lastChild;
            this.pins.push(pin);
        }
        this.cur = 0;
        this.stateEl.textContent = 'FURTIVO';
        this.el.className = '';
        this.el.style.display = 'block';
        this.active = true;
        this.g.input.consumePress(' '); this.g.input.consumePress('enter'); this.g.input.consumePress('mouse0'); this.g.input.consumePress('escape');
        this._render();
    }

    _roll(zone) { return zone / 2 + 0.12 + Math.random() * (0.76 - zone); }

    cancel() { if (this.active) this._finish('cancel'); }

    _finish(result) {
        this.active = false;
        this.el.style.display = 'none';
        this.el.className = '';
        const cb = this.onEnd; this.onEnd = null;
        if (cb) cb(result);
    }

    update(dt) {
        if (!this.active) return;
        const inp = this.g.input;
        if (this.result) {                                         // mostrando o resultado por um instante
            this._end -= dt;
            if (this._end <= 0) this._finish(this.result);
            return;
        }
        if (inp.consumePress('escape')) { this._finish('cancel'); return; }

        const pin = this.pins[this.cur], C = Config.theft.lockpick;
        for (const p of this.pins) if (p.missT > 0) p.missT -= dt;
        pin.m += pin.dir * pin.speed * dt;
        if (pin.m >= 1) { pin.m = 1; pin.dir = -1; } else if (pin.m <= 0) { pin.m = 0; pin.dir = 1; }

        const hit = inp.consumePress(' ') | inp.consumePress('enter') | inp.consumePress('mouse0');
        if (hit) {
            if (Math.abs(pin.m - pin.center) <= pin.zone / 2) {     // travou
                pin.done = true;
                AudioFX.blip(700 + this.cur * 220, 0.07, 0.16);
                this.cur++;
                if (this.cur >= this.pins.length) {
                    this.result = 'ok'; this._end = 0.45;
                    this.el.className = 'win'; this.stateEl.textContent = 'ABRIU!';
                    AudioFX.blip(1200, 0.2, 0.2);
                }
            } else {                                                // errou: barulho
                this.noise++;
                pin.missT = 0.25;
                pin.m = 0; pin.dir = 1; pin.center = this._roll(pin.zone);
                AudioFX.blip(150, 0.16, 0.22);
                if (this.noise >= C.maxNoise) {
                    this.result = 'alarm'; this._end = 0.55;
                    this.el.className = 'fail'; this.stateEl.textContent = 'ALARME!';
                }
            }
        }
        this._render();
    }

    _render() {
        const C = Config.theft.lockpick;
        this.pins.forEach((p, i) => {
            p.row.className = 'lp-pin' + (p.done ? ' done' : (i > this.cur ? ' idle' : '')) + (p.missT > 0 ? ' miss' : '');
            p.zoneEl.style.left = ((p.center - p.zone / 2) * 100).toFixed(1) + '%';
            p.zoneEl.style.width = (p.zone * 100).toFixed(1) + '%';
            p.markEl.style.left = (p.m * 100).toFixed(1) + '%';
        });
        this.noiseEl.textContent = '●'.repeat(this.noise) + '○'.repeat(Math.max(0, C.maxNoise - this.noise));
    }
}
