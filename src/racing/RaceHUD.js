// ============================================================================
// RaceHUD — a tela da corrida (StreetRacing), no canto de cima à esquerda (o meio do alto da tela é a rua à frente, onde aparece o
// próximo checkpoint): a POSIÇÃO grande (1º/4), a volta ou o checkpoint, o tempo, a barra do NITRO e, embaixo, a lista dos
// corredores; na largada, o semáforo (3 · 2 · 1 · VAI!); no meio da corrida, os avisos grandes que aparecem e somem (TAKEDOWN!,
// LARGADA PERFEITA, ÚLTIMA VOLTA…). Só DOM — nada no canvas do jogo.
// ============================================================================

const RaceHUD = {
    el: null,

    _css() {
        if (document.getElementById('raceHudCss')) return;
        const s = document.createElement('style');
        s.id = 'raceHudCss';
        s.textContent = `
            #raceHud { position: fixed; top: 16px; left: 16px; z-index: 30; pointer-events: none; display: none;
                font-family: ${Theme.DISPLAY}; color: #f4f6fa; text-shadow: 0 2px 6px rgba(0,0,0,.6); }
            #raceHud .rh-main { display: flex; align-items: center; gap: 14px; background: rgba(10,12,18,.72); border: 1px solid rgba(255,255,255,.14);
                border-radius: 14px; padding: 8px 16px; backdrop-filter: blur(6px); }
            #raceHud .rh-pos { font-size: 44px; font-weight: 800; line-height: 1; letter-spacing: -1px; }
            #raceHud .rh-pos small { font-size: 18px; opacity: .7; font-weight: 700; }
            #raceHud .rh-col { display: flex; flex-direction: column; gap: 3px; min-width: 128px; }
            #raceHud .rh-lap { font-size: 15px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; }
            #raceHud .rh-time { font-size: 14px; font-weight: 600; opacity: .9; font-variant-numeric: tabular-nums; }
            #raceHud .rh-nos { position: relative; height: 8px; border-radius: 5px; background: rgba(255,255,255,.12); overflow: hidden; }
            #raceHud .rh-nos s { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #2fb6ff, #8ef0ff); border-radius: 5px; }
            #raceHud .rh-nos.on s { background: linear-gradient(90deg, #6a5cff, #e3f6ff); box-shadow: 0 0 10px #8ef0ff; }
            #raceHud .rh-nl { font-size: 10px; font-weight: 700; opacity: .75; letter-spacing: 1px; }
            #raceList { position: fixed; top: 104px; left: 16px; z-index: 30; pointer-events: none; display: none; min-width: 150px; color: #f4f6fa;
                background: rgba(10,12,18,.62); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 6px 12px; font-family: 'Inter', sans-serif;
                font-size: 12px; font-weight: 600; line-height: 1.6; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
            #raceList .me { color: #ffe14d; }
            #raceList .out { opacity: .45; text-decoration: line-through; }
            #raceCount { position: fixed; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 31; pointer-events: none; display: none;
                font-family: ${Theme.DISPLAY}; font-size: 120px; font-weight: 800; color: #fff; text-shadow: 0 6px 22px rgba(0,0,0,.65); }
            #raceCount .lights { display: flex; gap: 14px; justify-content: center; margin-bottom: 8px; }
            #raceCount .lights i { width: 34px; height: 34px; border-radius: 50%; background: #2a1414; box-shadow: inset 0 0 0 3px rgba(0,0,0,.4); }
            #raceCount .lights i.r { background: #ff3b30; box-shadow: 0 0 18px #ff3b30; }
            #raceCount .lights i.g { background: #3cff7a; box-shadow: 0 0 22px #3cff7a; }
            #raceCount .n { text-align: center; line-height: 1; }
            #racePop { position: fixed; left: 50%; top: 26%; transform: translate(-50%, -50%); z-index: 31; pointer-events: none; display: none;
                font-family: ${Theme.DISPLAY}; font-size: 54px; font-weight: 800; letter-spacing: 2px; text-align: center; text-shadow: 0 4px 18px rgba(0,0,0,.7); }
            #racePop small { display: block; font-size: 20px; letter-spacing: .5px; opacity: .9; }
            #racePop.go { animation: racePop .9s ease-out; }
            @keyframes racePop { 0% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; } 20% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 100% { opacity: 1; } }
            @media (max-width: 760px) { #raceHud .rh-pos { font-size: 32px; } #raceCount { font-size: 80px; } #racePop { font-size: 34px; } #raceList { display: none !important; } }
            body.mobile #raceHud { left: 50%; top: 6px; transform: translateX(-50%) scale(0.78); transform-origin: top center; }
            body.mobile #raceList { display: none !important; }
            body.mobile #raceCount { font-size: 72px; } body.mobile #racePop { font-size: 32px; }
        `;
        document.head.appendChild(s);
    },

    show() {
        this._css();
        if (!this.el) {
            this.el = document.createElement('div'); this.el.id = 'raceHud';
            this.el.innerHTML = `<div class="rh-main"><div class="rh-pos"></div><div class="rh-col"><div class="rh-lap"></div><div class="rh-time"></div><div class="rh-nl">NITRO</div><div class="rh-nos"><s></s></div></div></div>`;
            document.body.appendChild(this.el);
            this.$list = document.createElement('div'); this.$list.id = 'raceList';
            document.body.appendChild(this.$list);
            this.cd = document.createElement('div'); this.cd.id = 'raceCount'; this.cd.innerHTML = '<div class="lights"><i></i><i></i><i></i><i></i></div><div class="n"></div>';
            document.body.appendChild(this.cd);
            this.pop = document.createElement('div'); this.pop.id = 'racePop';
            document.body.appendChild(this.pop);
            this.$pos = this.el.querySelector('.rh-pos'); this.$lap = this.el.querySelector('.rh-lap'); this.$time = this.el.querySelector('.rh-time');
            this.$nos = this.el.querySelector('.rh-nos'); this.$nosBar = this.$nos.querySelector('s');
        }
        this.el.style.display = 'block'; this.$list.style.display = 'block';
        this._last = {};
    },
    hide() {
        if (!this.el) return;
        this.el.style.display = 'none'; this.$list.style.display = 'none'; this.cd.style.display = 'none'; this.pop.style.display = 'none';
    },

    // st = { pos, n, lap (texto), time (s), nos (0..1), nosOn, rows: [{ name, me, out, done }] }
    update(st) {
        if (!this.el) return;
        const L = this._last, set = (k, v, fn) => { if (L[k] !== v) { L[k] = v; fn(v); } };
        set('pos', `${st.pos}|${st.n}`, () => { this.$pos.innerHTML = `${st.pos}º<small>/${st.n}</small>`; });
        set('lap', st.lap, (v) => { this.$lap.textContent = v; });
        set('time', RaceHUD.clock(st.time), (v) => { this.$time.textContent = '🕒 ' + v; });
        set('nos', Math.round(st.nos * 100), (v) => { this.$nosBar.style.width = v + '%'; });
        set('nosOn', !!st.nosOn, (v) => this.$nos.classList.toggle('on', v));
        set('rows', st.rows.map((r) => r.name + r.me + r.out + r.done).join(','), () => {
            this.$list.innerHTML = st.rows.map((r, i) => `<div class="${r.me ? 'me' : ''}${r.out ? ' out' : ''}">${i + 1}. ${r.name}${r.done ? ' 🏁' : ''}</div>`).join('');
        });
    },

    // Semáforo da largada: n = 3, 2, 1 (vermelhas acendendo), 0 = VAI! (verde), null = some.
    countdown(n) {
        if (!this.cd) return;
        if (n === null) { this.cd.style.display = 'none'; this._cd = null; return; }
        if (this._cd === n) return;
        this._cd = n;
        this.cd.style.display = 'block';
        const lights = this.cd.querySelectorAll('.lights i');
        lights.forEach((l, i) => { l.className = n === 0 ? 'g' : (i < 4 - n ? 'r' : ''); });
        this.cd.querySelector('.n').textContent = n === 0 ? 'VAI!' : String(n);
        this.cd.querySelector('.n').style.color = n === 0 ? '#3cff7a' : '#fff';
        AudioFX.blip(n === 0 ? 990 : 520, n === 0 ? 0.35 : 0.18, 0.28);
    },

    // Aviso grande no meio da tela por `s` segundos.
    flash(text, sub = '', color = '#ffe14d', s = 1.8) {
        if (!this.pop) return;
        this.pop.innerHTML = `<span style="color:${color}">${text}</span>${sub ? `<small>${sub}</small>` : ''}`;
        this.pop.style.display = 'block';
        this.pop.classList.remove('go'); void this.pop.offsetWidth; this.pop.classList.add('go');
        clearTimeout(this._popT);
        this._popT = setTimeout(() => { this.pop.style.display = 'none'; }, s * 1000);
    },

    clock(t) {
        if (!(t >= 0)) return '--:--.-';
        const m = Math.floor(t / 60), s = t - m * 60;
        return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
    },
};
