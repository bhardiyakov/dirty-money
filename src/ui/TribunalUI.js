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
        #tribunal{position:fixed;inset:0;z-index:41;display:none;align-items:center;justify-content:center;background:rgba(6,2,2,.78);font-family:'Press Start 2P',monospace;color:#e8ecf2;image-rendering:pixelated}
        #tribunal .tp{width:min(640px,94vw);background:#1a1214;border:3px solid #a33;box-shadow:0 0 0 3px #0b0607,0 10px 40px #000a;padding:16px 18px}
        #tribunal h3{margin:0 0 6px;font-size:16px;letter-spacing:2px;color:#ff6a66;text-align:center}
        #tribunal .sub{font-size:8px;line-height:1.7;color:#c9a9a9;text-align:center;margin-bottom:10px}
        #tribunal .mo{display:flex;gap:10px;margin-bottom:12px;font-size:8px}
        #tribunal .mo div{flex:1;background:#0f0a0b;border:2px solid #3a2326;padding:6px}
        #tribunal .mo b{display:block;height:6px;background:#2a1c1e;margin-top:5px}
        #tribunal .mo b i{display:block;height:100%}
        #tribunal .opt{display:block;width:100%;text-align:left;font:inherit;font-size:9px;line-height:1.6;background:#241a1c;color:#e8ecf2;border:2px solid #5c3a3e;padding:9px 10px;margin-top:7px;cursor:pointer}
        #tribunal .opt.sel{border-color:#ffd23a;background:#33242a}
        #tribunal .opt.off{opacity:.38;cursor:not-allowed}
        #tribunal .opt small{display:block;font-size:7px;color:#a98f92}`;
        document.head.appendChild(st);
        const r = this.root = document.createElement('div');
        r.id = 'tribunal';
        r.innerHTML = '<div class="tp"><h3>TRIBUNAL DO CRIME</h3><div class="sub"></div><div class="mo"></div><div class="opts"></div></div>';
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
