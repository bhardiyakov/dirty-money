// ============================================================================
// TuneHUD — a tela da loja de tunagem DENTRO da garagem (TuneGarage), no jeito do Need for Speed Underground: o carro no meio da tela,
// em destaque, e as escolhas EMBAIXO, num carrossel de cartas — a carta escolhida fica no centro, maior, e o carro já aparece com ela.
//   em cima, à esquerda   a loja, o carro e o dinheiro (sujo / limpo)
//   em cima, à direita    a ficha em barras (máxima, arrancada, freios, aderência): a parte nova acende em verde
//   embaixo               as categorias (abas) e o carrossel; no rodapé, a conta e PAGAR / SAIR
// ← → escolhe a peça (prévia na hora) · ↑ ↓ / Tab troca a categoria · Enter paga · Esc sai (a janela da loja, Tuning._p, segue aberta
// por trás e invisível: é ela que segura o jogo parado e fecha tudo no Esc). Clique/toque nas cartas e abas também.
// ============================================================================

const TuneHUD = {
    CATS: [['paint', 'Pintura', '🎨'], ['kit', 'Bodykit', '🧩'], ['wing', 'Aerofólio', '🪽'], ['neon', 'Neon', '💡'], ['tEng', 'Motor', '⚙️'], ['turbo', 'Turbo', '🌀'], ['tBrk', 'Freios', '🛑'], ['tSus', 'Suspensão', '🔩']],
    el: null,

    _build() {
        if (this.el) return;
        const st = document.createElement('style');
        st.textContent = `
        #tuneNFS{position:fixed;inset:0;z-index:43;pointer-events:none;display:none;font-family:var(--font-d,var(--font));color:#f5f3ff;text-transform:uppercase}
        #tuneNFS *{box-sizing:border-box}
        #tuneNFS .tn-hd{position:absolute;left:28px;top:22px;pointer-events:none}
        #tuneNFS .tn-hd h2{margin:0;font:italic 900 34px/1 var(--font-d,var(--font));letter-spacing:.04em;color:#fde7ff;text-shadow:0 0 18px rgba(232,121,249,.85),0 2px 0 #000}
        #tuneNFS .tn-hd .car{margin-top:6px;font:italic 800 17px var(--font-d,var(--font));color:#7dd3fc;letter-spacing:.06em;text-shadow:0 1px 0 #000}
        #tuneNFS .tn-hd .cash{margin-top:4px;font:700 13px var(--font);color:#cbd5e1;text-transform:none}
        #tuneNFS .tn-hd .cash b{color:#86efac}
        #tuneNFS .tn-st{position:absolute;right:28px;top:24px;width:min(300px,40vw);background:linear-gradient(120deg,rgba(10,8,22,.82),rgba(10,14,26,.6));border-left:3px solid #e879f9;padding:10px 14px 12px;transform:skewX(-8deg)}
        #tuneNFS .tn-st>div{transform:skewX(8deg)}
        #tuneNFS .tn-st .row{display:flex;justify-content:space-between;font:italic 800 12px var(--font-d,var(--font));letter-spacing:.08em;margin-top:7px;color:#e2e8f0}
        #tuneNFS .tn-st .row b{color:#fff}
        #tuneNFS .tn-st .bar{position:relative;height:7px;background:rgba(255,255,255,.1);margin-top:3px;overflow:hidden}
        #tuneNFS .tn-st .bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#38bdf8,#e879f9)}
        #tuneNFS .tn-st .bar s{position:absolute;top:0;bottom:0;background:#4ade80;box-shadow:0 0 8px #4ade80}
        #tuneNFS .tn-bt{position:absolute;left:0;right:0;bottom:0;padding:0 0 14px;background:linear-gradient(0deg,rgba(4,3,10,.92) 0%,rgba(4,3,10,.75) 62%,rgba(4,3,10,0) 100%);pointer-events:auto}
        #tuneNFS .tn-cats{display:flex;justify-content:center;gap:6px;padding:26px 12px 8px;overflow-x:auto;scrollbar-width:none}
        #tuneNFS .tn-cats::-webkit-scrollbar{display:none}
        #tuneNFS .tn-cat{flex:none;cursor:pointer;transform:skewX(-14deg);padding:7px 16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);font:italic 800 13px var(--font-d,var(--font));letter-spacing:.08em;color:#cbd5e1}
        #tuneNFS .tn-cat>span{display:inline-block;transform:skewX(14deg)}
        #tuneNFS .tn-cat.on{background:linear-gradient(90deg,#c026d3,#7c3aed);border-color:#f0abfc;color:#fff;box-shadow:0 0 16px rgba(217,70,239,.7)}
        #tuneNFS .tn-strip{position:relative;height:150px;overflow:hidden}
        #tuneNFS .tn-track{position:absolute;top:10px;left:0;display:flex;gap:14px;transition:transform .28s cubic-bezier(.2,.8,.2,1)}
        #tuneNFS .tn-card{flex:none;width:176px;height:122px;cursor:pointer;transform:skewX(-10deg) scale(.88);transform-origin:50% 60%;opacity:.55;transition:transform .25s,opacity .25s,box-shadow .25s;
            background:linear-gradient(160deg,rgba(30,24,52,.95),rgba(12,14,28,.95));border:1px solid rgba(255,255,255,.16);padding:10px 14px;display:flex;flex-direction:column;justify-content:space-between}
        #tuneNFS .tn-card>div{transform:skewX(10deg)}
        #tuneNFS .tn-card.on{transform:skewX(-10deg) scale(1.06);opacity:1;border:2px solid #f0abfc;box-shadow:0 0 22px rgba(217,70,239,.75),inset 0 0 18px rgba(217,70,239,.18)}
        #tuneNFS .tn-card .t{font:italic 900 15px/1.1 var(--font-d,var(--font));letter-spacing:.03em}
        #tuneNFS .tn-card .d{font:600 10.5px/1.25 var(--font);color:#a5b4fc;text-transform:none;margin-top:4px;max-height:2.6em;overflow:hidden}
        #tuneNFS .tn-card .p{font:italic 900 15px var(--font-d,var(--font));color:#86efac}
        #tuneNFS .tn-card .p.cur{color:#7dd3fc}
        #tuneNFS .tn-card .sw{display:inline-block;width:44px;height:22px;border:1px solid rgba(255,255,255,.5);vertical-align:middle;margin-bottom:4px}
        #tuneNFS .tn-ft{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 28px 0}
        #tuneNFS .tn-keys{font:700 11.5px var(--font);color:#94a3b8;letter-spacing:.04em}
        #tuneNFS .tn-keys kbd{display:inline-block;min-width:20px;padding:1px 5px;margin:0 2px;border:1px solid rgba(255,255,255,.3);border-bottom-width:2px;font:700 11px var(--font);color:#e2e8f0;text-align:center}
        #tuneNFS .tn-bill{display:flex;align-items:center;gap:10px}
        #tuneNFS .tn-bill .tot{font:italic 900 18px var(--font-d,var(--font));color:#fde68a}
        #tuneNFS .tn-btn{cursor:pointer;transform:skewX(-14deg);padding:9px 20px;border:none;font:italic 900 14px var(--font-d,var(--font));letter-spacing:.06em;color:#fff;background:rgba(255,255,255,.12)}
        #tuneNFS .tn-btn>span{display:inline-block;transform:skewX(14deg)}
        #tuneNFS .tn-btn.pay{background:linear-gradient(90deg,#16a34a,#22c55e);color:#04130c;box-shadow:0 0 14px rgba(34,197,94,.6)}
        #tuneNFS .tn-btn.pay.off{opacity:.35;box-shadow:none;cursor:default}
        #tuneNFS .tn-msg{position:absolute;left:0;right:0;bottom:228px;text-align:center;font:italic 800 15px var(--font-d,var(--font));text-transform:none;text-shadow:0 1px 3px #000;pointer-events:none}
        @media (max-width:700px){#tuneNFS .tn-hd{left:14px;top:12px}#tuneNFS .tn-hd h2{font-size:22px}#tuneNFS .tn-st{display:none}
            #tuneNFS .tn-card{width:132px;height:110px;padding:8px 10px}#tuneNFS .tn-strip{height:136px}#tuneNFS .tn-cats{justify-content:flex-start;padding-top:18px}
            #tuneNFS .tn-keys{display:none}#tuneNFS .tn-ft{padding:4px 14px 0}#tuneNFS .tn-msg{bottom:206px}}`;
        document.head.appendChild(st);
        const r = this.el = document.createElement('div');
        r.id = 'tuneNFS';
        r.innerHTML = `<div class="tn-hd"><h2></h2><div class="car"></div><div class="cash"></div></div><div class="tn-st"><div></div></div><div class="tn-msg"></div>
            <div class="tn-bt"><div class="tn-cats"></div><div class="tn-strip"><div class="tn-track"></div></div>
            <div class="tn-ft"><div class="tn-keys"><kbd>◀</kbd><kbd>▶</kbd> peça &nbsp; <kbd>▲</kbd><kbd>▼</kbd> categoria &nbsp; <kbd>Enter</kbd> pagar &nbsp; <kbd>Esc</kbd> sair</div>
            <div class="tn-bill"><span class="tot"></span><button class="tn-btn" data-act="close"><span>Sair</span></button><button class="tn-btn pay" data-act="pay"><span>Pagar</span></button></div></div></div>`;
        document.body.appendChild(r);
        this.$ = { h: r.querySelector('h2'), car: r.querySelector('.car'), cash: r.querySelector('.cash'), st: r.querySelector('.tn-st>div'), msg: r.querySelector('.tn-msg'),
            cats: r.querySelector('.tn-cats'), strip: r.querySelector('.tn-strip'), track: r.querySelector('.tn-track'), tot: r.querySelector('.tot'), pay: r.querySelector('.pay') };
        r.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]');
            if (!b || !this.game) return;
            if (b.dataset.act === 'pay' && b.classList.contains('off')) return;
            AudioFX.blip(620, 0.06, 0.1);
            Tuning._act(this.game, b.dataset.act, b.dataset.arg);
        });
        window.addEventListener('keydown', (e) => this._key(e));
    },

    get open() { return !!(this.el && this.el.style.display === 'block'); },
    show(on) { this._build(); this.el.style.display = on ? 'block' : 'none'; if (!on) this.msg(''); },
    msg(t, ok = true) { if (!this.el) return; this.$.msg.textContent = t || ''; this.$.msg.style.color = ok ? '#86efac' : '#fda4af'; },

    // As cartas da categoria: { act, arg, t (título), d (detalhe), p (preço ou "atual"), cur, on, sw (amostra de cor, css) }
    options(T, car) {
        const s = T._sel, o = T._orig, cat = T._cat, out = [];
        if (cat === 'paint') {
            const L = T.paints();
            for (const r of L.normal.concat(L.special)) {
                const P = CarSheet.PAINTS[r];
                out.push({ act: 'paint', arg: r, t: P.name, d: P.fx === 1 ? 'fosco' : P.fx === 2 ? 'cromado' : P.fx === 3 ? 'perolizado' : 'cor de fábrica', p: brl(T.paintPrice(car, r)), cur: o.paint === r, on: s.paint === r,
                    sw: `linear-gradient(135deg,${P.paint} 55%,${P.paint2 || P.paint})` });
            }
        } else if (cat === 'neon') {
            const was = o.mods.neon | 0, price = brl(Math.round(T.NEON_PRICE * T.mul(car) / 50) * 50);
            out.push({ act: 'neon', arg: 0, t: 'Sem neon', d: 'chão escuro', p: was ? brl(T.REMOVE) : '', cur: !was, on: !s.neon });
            for (const i of Object.keys(T.NEON)) {
                const c = T.NEON[i].map((v) => Math.round(v * 255)).join(',');
                out.push({ act: 'neon', arg: +i, t: `Neon ${T.NEON_NAMES[i]}`, d: 'luz no chão, sob o carro', p: price, cur: was === +i, on: s.neon === +i, sw: `rgb(${c});box-shadow:0 0 10px rgb(${c})` });
            }
        } else {
            const C = T.PARTS[cat], was = o.mods[cat] | 0;
            C.lv.forEach(([n], i) => {
                const [t, d] = n.split(' — ');
                out.push({ act: 'lv', arg: i, t, d: d || (i ? '' : 'como saiu da fábrica'), p: i ? brl(T.priceOf(car, cat, i)) : (was ? brl(T.REMOVE) : ''), cur: i === was, on: s[cat] === i });
            });
        }
        return out;
    },

    render(game, T) {
        this._build();
        this.game = game;
        const car = T._car, s = T._sel, inv = game.inventory, $ = this.$;
        $.h.textContent = T._shop.name;
        $.car.textContent = `${car.spec.name} ${car.spec.model}`;
        $.cash.innerHTML = `Sujo <b>${brl(inv.cash)}</b> · Limpo <b>${brl(inv.clean)}</b> · acima de R$ 800, só limpo`;
        // ficha: barra da peça instalada e o ganho da prévia em verde
        const sp = car.spec, oSp = T._origSpec || sp;
        const bar = (name, val, v0, v1) => {
            const a = Math.max(0, Math.min(1, v0)), b = Math.max(0, Math.min(1, v1));
            return `<div class="row"><span>${name}</span><b>${val}</b></div><div class="bar"><i style="width:${Math.min(a, b) * 100}%"></i>${b > a ? `<s style="left:${a * 100}%;width:${(b - a) * 100}%"></s>` : ''}</div>`;
        };
        const top = (x) => x.maxSpeed * 3.6 / 380, acc = (x) => x.t100 ? (14 - x.t100) / 12 : 0.3;
        const oB = T.BRK[T._orig.mods.tBrk | 0], oG = T.SUS_GRIP[T._orig.mods.tSus | 0], nB = T.BRK[s.tBrk], nG = T.SUS_GRIP[s.tSus];
        $.st.innerHTML = bar('Máxima', `${Math.round(sp.maxSpeed * 3.6)} km/h`, top(oSp), top(sp))
            + bar('0–100', sp.t100 ? `${sp.t100.toFixed(1).replace('.', ',')} s` : '—', acc(oSp), acc(sp))
            + bar('Freios', `×${nB.toFixed(2).replace('.', ',')}`, (oB - 0.7) / 0.9, (nB - 0.7) / 0.9)
            + bar('Aderência', `×${nG.toFixed(2).replace('.', ',')}`, (oG - 0.85) / 0.4, (nG - 0.85) / 0.4);
        // categorias e carrossel
        $.cats.innerHTML = this.CATS.map(([k, n, ic]) => `<div class="tn-cat${T._cat === k ? ' on' : ''}" data-act="cat" data-arg="${k}"><span>${ic} ${n}</span></div>`).join('');
        const L = this._opts = this.options(T, car), sel = Math.max(0, L.findIndex((x) => x.on));
        this._sel = sel;
        $.track.innerHTML = L.map((x) => `<div class="tn-card${x.on ? ' on' : ''}" data-act="${x.act}" data-arg="${x.arg}"><div>${x.sw ? `<i class="sw" style="background:${x.sw}"></i>` : ''}<div class="t">${x.t}</div><div class="d">${x.d || ''}</div></div>`
            + `<div><span class="p${x.cur ? ' cur' : ''}">${x.cur ? 'Instalado' : x.p}</span></div></div>`).join('');
        const card = $.track.firstElementChild, w = card ? card.offsetWidth + 14 : 190, W = $.strip.clientWidth || window.innerWidth;
        $.track.style.transform = `translateX(${Math.round(W / 2 - (sel + 0.5) * w + 7)}px)`;
        const tab = $.cats.querySelector('.on'); if (tab && tab.scrollIntoView) tab.scrollIntoView({ block: 'nearest', inline: 'center' });
        const bill = T._bill(), total = bill.reduce((t, b) => t + b.price, 0);
        $.tot.textContent = bill.length ? `${bill.length} peça${bill.length > 1 ? 's' : ''} · ${brl(total)}` : '';
        $.pay.classList.toggle('off', !bill.length);
        $.pay.firstElementChild.textContent = bill.length ? `Pagar ${brl(total)}` : 'Pagar';
    },

    _key(e) {
        if (!this.open || !this.game || !Tuning._p || !Tuning._p.open) return;
        const k = e.key, L = this._opts || [], T = Tuning;
        const cat = (d) => { const i = this.CATS.findIndex((c) => c[0] === T._cat); T._act(this.game, 'cat', this.CATS[(i + d + this.CATS.length) % this.CATS.length][0]); };
        if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D') {
            const d = k === 'ArrowLeft' || k === 'a' || k === 'A' ? -1 : 1, x = L[Math.max(0, Math.min(L.length - 1, this._sel + d))];
            if (x) { AudioFX.blip(520, 0.04, 0.08); T._act(this.game, x.act, String(x.arg)); }
        } else if (k === 'ArrowUp' || k === 'w' || k === 'W') cat(-1);
        else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === 'Tab') cat(1);
        else if (k === 'Enter' || k === ' ') { if (T._bill().length) T._act(this.game, 'pay'); }
        else return;
        e.preventDefault(); e.stopPropagation();
    },
};
