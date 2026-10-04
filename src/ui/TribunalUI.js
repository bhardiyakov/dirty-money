// ============================================================================
// TribunalUI — o Tribunal do Crime: ao zerar a vida dentro da favela o jogador não morre na hora; o tráfico julga.
// Opções (cada uma chama game._courtVerdict(kind)): 'pay' paga a multa (zera o dinheiro), 'seize' entrega todo o inventário,
// 'labia' tenta convencer (chance = Standing.labiaChance(); falhou → execução). ↑/↓ escolhe, Enter confirma; mouse/toque: clique.
// Enquanto aberta o jogo segue parado atrás (o Game consulta `open`).
// ============================================================================

class TribunalUI {
    constructor(game) {
        this.g = game;
        this.open = false;
        this.sel = 0;
        this.opts = [];
        const st = document.createElement('style');
        st.textContent = `
        #tribunal{background:rgba(20,2,6,.72) !important}
        #tribunal .tp{width:min(660px,94vw);border-color:rgba(244,63,94,0.55) !important;box-shadow:0 0 0 1px rgba(244,63,94,0.3),0 24px 70px rgba(120,0,20,0.5) !important}
        #tribunal h3{color:#fb7185 !important}
        #tribunal .mo{display:flex;gap:10px;margin-bottom:14px;font-size:13px;font-weight:600;color:var(--tx-2)}
        #tribunal .mo div{flex:1;background:var(--card);border:1px solid var(--line);border-radius:var(--r-3);padding:10px}
        #tribunal .mo b{display:block;height:6px;background:rgba(255,255,255,0.08);margin-top:7px;border-radius:99px;overflow:hidden}
        #tribunal .mo b i{display:block;height:100%;border-radius:99px}
        #tribunal .opt.sel{border-color:#fb7185 !important;background:rgba(244,63,94,0.12) !important}`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'tribunal';
        r.innerHTML = '<div class="tp"><h3>⚖️ Tribunal do Crime</h3><div class="sub"></div><div class="mo"></div><div class="opts"></div></div>';
        document.body.appendChild(r);
        this.$sub = r.querySelector('.sub'); this.$mo = r.querySelector('.mo'); this.$opts = r.querySelector('.opts');
        window.addEventListener('keydown', (e) => this._key(e));
    }

    show() {
        const g = this.g, inv = g.inventory, S = Standing;
        const payMin = 500;
        this.opts = [
            { kind: 'pay', ok: inv.cash >= payMin, label: `PAGAR A MULTA — ${brl(inv.cash)}`, note: inv.cash >= payMin ? 'Todo o seu dinheiro. Dívida quitada, o tráfico te deixa viver.' : `Você precisa de pelo menos ${brl(payMin)}.` },
            { kind: 'seize', ok: S.seizeAllowed(), label: 'ENTREGAR TUDO', note: S.seizeAllowed() ? 'Armas, munição, kits e joias ficam com a facção. O dinheiro é seu.' : 'Ninguém te respeita o bastante para aceitar isso.' },
            { kind: 'labia', ok: true, label: `USAR A LÁBIA — ${Math.round(S.labiaChance() * 100)}%`, note: 'Convence pelo respeito que tem (tráfico e comunidade). Se falhar: execução.' },
        ];
        this.sel = this.opts.findIndex((o) => o.ok);
        this.open = true;
        this.root.style.display = 'flex';
        this.$sub.innerHTML = 'Você caiu no território deles.<br>Antes de decidirem seu destino, te deixam falar.';
        const bar = (name, v, col) => `<div>${name} ${Math.round(v)}<b><i style="width:${v}%;background:${col}"></i></b></div>`;
        this.$mo.innerHTML = bar('MORAL TRÁFICO', S.traffic, '#d65a4a') + bar('MORAL COMUNIDADE', S.community, '#5ac07a');
        this.render();
        AudioFX.blip(110, 0.6, 0.25);
    }

    render() {
        this.$opts.replaceChildren(...this.opts.map((o, i) => {
            const b = document.createElement('button');
            b.className = 'opt' + (i === this.sel ? ' sel' : '') + (o.ok ? '' : ' off');
            b.innerHTML = `${o.label}<small>${o.note}</small>`;
            b.addEventListener('click', () => { this.sel = i; this.choose(); });
            return b;
        }));
    }

    hide() { this.open = false; this.root.style.display = 'none'; }

    choose() {
        const o = this.opts[this.sel];
        if (!o || !o.ok) { AudioFX.blip(140, 0.1, 0.15); return; }
        this.hide();
        this.g._courtVerdict(o.kind);
    }

    _key(e) {
        if (!this.open) return;
        const k = e.key;
        if (k === 'ArrowUp' || k === 'w' || k === 'W') this.sel = (this.sel + this.opts.length - 1) % this.opts.length;
        else if (k === 'ArrowDown' || k === 's' || k === 'S') this.sel = (this.sel + 1) % this.opts.length;
        else if (k === 'Enter' || k === ' ') { this.choose(); e.preventDefault(); return; }
        else return;
        e.preventDefault(); e.stopPropagation();
        this.render();
    }
}
