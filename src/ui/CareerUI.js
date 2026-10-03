// ============================================================================
// CareerUI — a aba CARREIRAS do menu de pausa (tecla O abre direto). À esquerda as carreiras (patente e XP); à direita a escolhida:
// descrição, escada de patentes, skills (+ com pontos), trabalhos (ACEITAR) e o painel de gestão da carreira. O trabalho em
// andamento aparece no topo com ABANDONAR. Cliques viram Careers.uiAction(ação, carreira, argumento).
// ============================================================================

class CareerUI {
    constructor(mgr) {
        this.mgr = mgr;
        this.sel = 'chop';
        this.el = null;
        const st = document.createElement('style');
        st.textContent = `
            #pmCareers { display: flex; gap: 14px; width: 100%; min-height: 0; }
            .cr-list { width: 250px; flex: none; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
            .cr-card { cursor: pointer; padding: 10px 12px; background: rgba(9,14,32,0.86); border-radius: 12px; border: 2px solid #1f2a4a; color: #dfe6f5; font-size: 13px; }
            .cr-card:hover { border-color: #3a4a7a; }
            .cr-card.on { border-color: var(--c); box-shadow: 0 0 14px color-mix(in srgb, var(--c) 45%, transparent); }
            .cr-card b { display: block; font-size: 15px; color: var(--c); letter-spacing: 1px; }
            .cr-card small { display: block; color: #aab3c8; margin-top: 2px; }
            .cr-card i, .cr-bar i { display: block; height: 7px; margin-top: 6px; border-radius: 4px; background: #0a0f22; overflow: hidden; }
            .cr-card i s, .cr-bar i s { display: block; height: 100%; }
            .cr-main { flex: 1; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-right: 4px; }
            .cr-box { background: rgba(9,14,32,0.86); border-radius: 12px; border: 2px solid #1f2a4a; padding: 12px 14px; color: #dfe6f5; font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
            .cr-box h3 { margin: 0; font-size: 15px; letter-spacing: 1px; color: #f4f7ff; }
            .cr-active { border-color: #ffd23a; }
            .cr-ranks { display: flex; gap: 6px; flex-wrap: wrap; }
            .cr-ranks span { padding: 4px 8px; border-radius: 8px; border: 1px solid #2a3558; color: #7c87a3; font-size: 11px; }
            .cr-ranks span.done { color: #dfe6f5; border-color: #3f5a8a; } .cr-ranks span.cur { color: #0b1020; background: var(--c); border-color: var(--c); font-weight: 700; }
            .cr-row { display: flex; justify-content: space-between; gap: 10px; } .cr-row b { color: #ffe27a; text-align: right; }
            .cr-bar { display: flex; flex-direction: column; font-size: 11px; color: #aab3c8; }
            .cr-dim { margin: 0; color: #8d97ad; font-size: 12px; line-height: 1.4; }
            .cr-skill { display: flex; align-items: center; gap: 10px; } .cr-skill .t { flex: 1; } .cr-skill .t small { display: block; color: #8d97ad; font-size: 11px; }
            .cr-pips { letter-spacing: 2px; color: var(--c); }
            .cr-job { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-top: 1px solid #1f2a4a; } .cr-job:first-of-type { border-top: none; }
            .cr-job .t { flex: 1; } .cr-job .t b { color: #f4f7ff; } .cr-job .t em { font-style: normal; color: #ffd23a; margin-left: 6px; font-size: 12px; }
            .cr-job .t small { display: block; color: #9aa4bc; font-size: 12px; line-height: 1.35; margin-top: 2px; }
            .cr-btns { display: flex; flex-direction: column; gap: 6px; }
            #pmCareers button { font: inherit; font-size: 12px; padding: 7px 10px; border-radius: 8px; border: 2px solid #3f5a8a; background: #141d36; color: #eef2ff; cursor: pointer; text-align: left; }
            #pmCareers button:hover:not([disabled]) { background: #1d2a4d; border-color: var(--c, #35e0ff); }
            #pmCareers button[disabled] { opacity: 0.4; cursor: not-allowed; }
            #pmCareers .cr-go { flex: none; text-align: center; min-width: 96px; border-color: var(--c); }
            .cr-tab { border-collapse: collapse; width: 100%; } .cr-tab td, .cr-tab th { padding: 3px 4px; text-align: left; font-size: 12px; } .cr-tab th { color: #8d97ad; }
            @media (max-width: 900px) { #pmCareers { flex-direction: column; } .cr-list { width: auto; flex-direction: row; overflow-x: auto; } .cr-card { min-width: 150px; } }`;
        document.head.appendChild(st);
    }

    bind(el) {
        if (this.el === el) return;
        this.el = el;
        el.addEventListener('click', (e) => {
            const card = e.target.closest('[data-career]');
            if (card && !e.target.closest('button')) { this.sel = card.dataset.career; this.render(); return; }
            const b = e.target.closest('button[data-act]');
            if (!b || b.disabled) return;
            this.mgr.uiAction(b.dataset.act, b.dataset.career || this.sel, b.dataset.arg);
            this.render();
        });
    }

    render(el = this.el) {
        if (!el) return;
        this.bind(el);
        const M = this.mgr, c = M.by[this.sel] || M.list[0];
        const list = M.list.map((k) => {
            const nx = k.nextRank, base = k.ranks[k.rank].xp, pct = nx ? Math.round(100 * (k.xp - base) / (nx.xp - base)) : 100;
            return `<div class="cr-card ${k === c ? 'on' : ''}" data-career="${k.id}" style="--c:${k.color}"><b>${k.icon} ${k.name}</b><small>${k.rankName} · ${k.xp} XP${k.points > 0 ? ` · <span style="color:#ffd23a">${k.points} ponto(s)</span>` : ''}</small><i><s style="width:${pct}%;background:${k.color}"></s></i></div>`;
        }).join('');

        let main = '';
        if (M.job) {
            const h = M.hud() || { title: M.job.title, text: M.job.text, extra: '' };
            main += `<div class="cr-box cr-active"><h3>EM ANDAMENTO · ${h.title}</h3><p class="cr-dim">${h.text}${h.extra ? ' — ' + h.extra : ''}</p><div><button data-act="abandon" data-career="${M.job.c.id}">Abandonar o trabalho</button></div></div>`;
        }
        const nx = c.nextRank;
        main += `<div class="cr-box" style="--c:${c.color}"><h3>${c.icon} ${c.name} — ${c.rankName.toUpperCase()}</h3><p class="cr-dim">${c.desc}</p>
            <div class="cr-ranks">${c.ranks.map((r, i) => `<span class="${i < c.rank ? 'done' : (i === c.rank ? 'cur' : '')}" title="${r.desc}">${r.name}${i > c.rank ? ` · ${r.xp} XP` : ''}</span>`).join('')}</div>
            <p class="cr-dim">${c.ranks[c.rank].desc}${nx ? ` Próxima patente: <b style="color:#ffe27a">${nx.name}</b> em ${nx.xp - c.xp} XP.` : ' Topo da carreira.'}</p></div>`;

        main += `<div class="cr-box" style="--c:${c.color}"><h3>HABILIDADES <span style="color:#ffd23a;font-size:12px">${c.points > 0 ? c.points + ' ponto(s) para gastar' : `1 ponto a cada ${Careers.XP_PER_POINT} XP`}</span></h3>`;
        for (const [k, S] of Object.entries(c.skillDefs)) {
            const lv = c.skill(k);
            main += `<div class="cr-skill"><div class="t"><b>${S.name}</b> <span class="cr-pips">${'■'.repeat(lv)}${'□'.repeat(5 - lv)}</span><small>${S.desc}</small></div><button data-act="skill" data-arg="${k}" ${c.points > 0 && lv < 5 ? '' : 'disabled'}>+1</button></div>`;
        }
        main += '</div>';

        main += `<div class="cr-box" style="--c:${c.color}"><h3>TRABALHOS</h3>`;
        const block = M.canStart();
        for (const j of c.jobs()) {
            const locked = c.rank < j.rank, extra = j.check && !locked && !j.soon ? j.check() : null;
            const label = j.soon ? 'EM BREVE' : (locked ? c.ranks[j.rank].name.toUpperCase() : 'ACEITAR');
            const dis = j.soon || locked || !!block || !!extra;
            main += `<div class="cr-job"><div class="t"><b>${j.name}</b><em>${j.pay}</em><small>${j.desc}${extra ? ` <span style="color:#ff8a7a">(${extra})</span>` : ''}</small></div><button class="cr-go" data-act="job" data-arg="${j.id}" ${dis ? 'disabled' : ''}>${label}</button></div>`;
        }
        if (block) main += `<p class="cr-dim" style="color:#ff8a7a">${block}</p>`;
        main += '</div>';

        const panel = c.panel();
        if (panel) main += `<div class="cr-box" style="--c:${c.color}"><h3>GESTÃO</h3>${panel}</div>`;

        const prev = el.querySelector('.cr-main'), top = prev ? prev.scrollTop : 0;
        el.innerHTML = `<div class="cr-list">${list}</div><div class="cr-main" style="--c:${c.color}">${main}</div>`;
        el.querySelector('.cr-main').scrollTop = top;
    }
}
