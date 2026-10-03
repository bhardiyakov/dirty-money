// ============================================================================
// CareerUI — a aba CARREIRAS do menu de pausa (tecla O abre direto). À esquerda as carreiras (patente e XP); à direita a escolhida:
// descrição, escada de patentes, skills (+ com pontos), trabalhos (ACEITAR) e o painel de gestão da carreira. O trabalho em
// andamento aparece no topo com ABANDONAR. Cliques viram Careers.uiAction(ação, carreira, argumento).
// ============================================================================

class CareerUI {
    constructor(mgr) {
        this.mgr = mgr;
        this.sel = 'chop';
        this.view = 'careers';                     // sub-aba: 'careers' | 'skills' | 'achievements'
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
            #pmCareers { flex-direction: column; }
            .cr-sub { display: flex; gap: 8px; flex: none; }
            .cr-sub div { cursor: pointer; padding: 7px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; letter-spacing: 1px; color: #cfd7ea; background: rgba(9,14,32,0.86); border: 2px solid #1f2a4a; }
            .cr-sub div.on { color: #fff; border-color: #ffd23a; box-shadow: 0 0 12px rgba(255,210,58,0.35); }
            .cr-sub .pts { color: #ffd23a; }
            .cr-body { display: flex; gap: 14px; flex: 1; min-height: 0; }
            .sk-head { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
            .sk-head .lv { font-size: 26px; font-weight: 700; color: #fff; } .sk-head .lv small { font-size: 12px; color: #8fb4ff; display: block; }
            .sk-tree { display: grid; grid-template-columns: repeat(6, minmax(170px, 1fr)); gap: 10px; overflow-x: auto; flex: none; padding-bottom: 6px; }
            .cr-scroll > * { flex: none; }
            .sk-col { display: flex; flex-direction: column; gap: 8px; }
            .sk-col > b { text-align: center; color: var(--c); font-size: 13px; letter-spacing: 1px; padding: 4px 0; border-bottom: 2px solid var(--c); }
            .sk-tier { font-size: 10px; color: #6f7a96; text-align: center; margin-top: 2px; }
            .sk-node { position: relative; padding: 8px 9px; border-radius: 10px; background: #0c1328; border: 2px solid #26324f; font-size: 11px; color: #aab3c8; line-height: 1.3; }
            .sk-node b { display: block; color: #e8edf8; font-size: 12px; } .sk-node .pip { color: var(--c); letter-spacing: 2px; }
            .sk-node.own { border-color: color-mix(in srgb, var(--c) 60%, #26324f); } .sk-node.max { border-color: var(--c); box-shadow: 0 0 10px color-mix(in srgb, var(--c) 35%, transparent); }
            .sk-node.lock { opacity: 0.45; }
            .sk-node button { margin-top: 5px; width: 100%; text-align: center !important; font-size: 11px !important; padding: 4px !important; }
            .sk-node .req { display: block; color: #ff8a7a; font-size: 10px; margin-top: 3px; }
            .ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
            .ach { padding: 8px 10px; border-radius: 10px; background: #0c1328; border: 2px solid #26324f; font-size: 11px; color: #aab3c8; }
            .ach b { display: block; color: #e8edf8; font-size: 12px; } .ach.ok { border-color: #ffd23a; } .ach.ok b { color: #ffd23a; }
            .ach i { display: block; height: 5px; margin-top: 5px; border-radius: 3px; background: #0a0f22; overflow: hidden; } .ach i s { display: block; height: 100%; background: linear-gradient(90deg, #35e0ff, #ff3ad0); }
            .ach-group { grid-column: 1 / -1; color: #8fb4ff; font-size: 11px; letter-spacing: 2px; margin-top: 6px; }
            .plat { padding: 12px 14px; border-radius: 12px; border: 2px solid #c8d4ff; background: linear-gradient(135deg, rgba(200,212,255,0.12), rgba(255,58,208,0.08)); color: #fff; }
            @media (max-width: 900px) { .cr-body { flex-direction: column; } .sk-tree { grid-template-columns: repeat(6, 160px); } .cr-list { width: auto; flex-direction: row; overflow-x: auto; } .cr-card { min-width: 150px; } }`;
        document.head.appendChild(st);
    }

    bind(el) {
        if (this.el === el) return;
        this.el = el;
        el.addEventListener('click', (e) => {
            const sub = e.target.closest('[data-view]');
            if (sub) { this.view = sub.dataset.view; this.render(); return; }
            const sk = e.target.closest('button[data-skill]');
            if (sk && !sk.disabled) { const g = this.mgr.g; g._flash(sk.dataset.skill === '#prestige' ? g.skills.buyPrestige() : g.skills.buy(sk.dataset.skill)); this.render(); return; }
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
        const prev = el.querySelector('.cr-main, .cr-scroll'), top = prev ? prev.scrollTop : 0;
        const sk = this.mgr.g.skills, ach = this.mgr.g.achievements;
        const done = ach ? ach.list().filter((a) => ach.done[a[0]]).length : 0, total = ach ? ach.list().length : 0;
        const sub = `<div class="cr-sub"><div data-view="careers" class="${this.view === 'careers' ? 'on' : ''}">CARREIRAS</div>
            <div data-view="skills" class="${this.view === 'skills' ? 'on' : ''}">HABILIDADES · NV ${sk ? sk.level : 1}${sk && sk.points > 0 ? ` <span class="pts">(${sk.points})</span>` : ''}</div>
            <div data-view="achievements" class="${this.view === 'achievements' ? 'on' : ''}">CONQUISTAS ${done}/${total}${ach && ach.platinum ? ' 🏆' : ''}</div></div>`;
        let body;
        if (this.view === 'skills' && sk) body = `<div class="cr-main cr-scroll" style="width:100%">${this._skills(sk)}</div>`;
        else if (this.view === 'achievements' && ach) body = `<div class="cr-main cr-scroll" style="width:100%">${this._achievements(ach)}</div>`;
        else body = this._careers();
        el.innerHTML = sub + `<div class="cr-body">${body}</div>`;
        const now = el.querySelector('.cr-main, .cr-scroll'); if (now) now.scrollTop = top;
    }

    _skills(sk) {
        const L = sk.level, nx = SkillTree.xpFor(L + 1), base = SkillTree.xpFor(L), pct = Math.round(100 * (sk.xp - base) / Math.max(1, nx - base));
        let h = `<div class="cr-box"><div class="sk-head"><div class="lv">NÍVEL ${L}<small>${sk.xp} XP · próximo nível em ${nx - sk.xp} XP</small></div>
            <div style="flex:1;min-width:180px"><div class="cr-bar"><span>PROGRESSO DO NÍVEL</span><i><s style="width:${pct}%;background:linear-gradient(90deg,#ffd23a,#ff3ad0)"></s></i></div></div>
            <div><div class="cr-row"><span>Pontos para gastar</span><b>${sk.points}</b></div><div class="cr-row"><span>Graus comprados</span><b>${sk.ranksOwned}/${sk.ranksTotal}</b></div></div>
            <div><div class="cr-row"><span>Notoriedade</span><b>${sk.notorietyName()}</b></div><div class="cr-row"><span>Polícia</span><b>+${Math.round((sk.policeMul - 1) * 100)}% visão e memória</b></div><div class="cr-row"><span>Pagamentos</span><b>+${Math.round((sk.payMul - 1) * 100)}%</b></div></div></div>
            <p class="cr-dim">1 ponto por nível. Todo XP conta: trabalhos, missões do morro, metas, furtos, carros roubados e fugas da polícia. Quanto mais famoso, mais a polícia te vê e mais demora para esquecer — mas cada trabalho paga mais.</p></div>`;
        h += '<div class="sk-tree">';
        for (const [bid, B] of Object.entries(SkillTree.BRANCHES)) {
            h += `<div class="sk-col" style="--c:${B.color}"><b>${B.icon} ${B.name}</b>`;
            let lastTier = 0;
            for (const n of SkillTree.NODES.filter((x) => x.branch === bid)) {
                if (n.tier !== lastTier) { lastTier = n.tier; h += `<div class="sk-tier">CAMADA ${n.tier} · NÍVEL ${SkillTree.tierLevel(n.tier)}+ · ${SkillTree.tierCost(n.tier)} pt/grau</div>`; }
                const r = sk.rank(n.id), why = sk.canBuy(n.id), lock = L < SkillTree.tierLevel(n.tier) || (n.req && sk.rank(n.req[0]) < n.req[1]);
                h += `<div class="sk-node ${r ? 'own' : ''} ${r >= n.max ? 'max' : ''} ${lock ? 'lock' : ''}"><b>${n.name}</b><span class="pip">${'■'.repeat(r)}${'□'.repeat(n.max - r)}</span><br>${n.desc}${n.max > 1 ? ' (por grau)' : ''}
                    ${n.req ? `<span class="req" style="${sk.rank(n.req[0]) >= n.req[1] ? 'color:#5ac07a' : ''}">requer ${sk.byId[n.req[0]].name} ${n.req[1]}</span>` : ''}
                    ${r < n.max ? `<button data-skill="${n.id}" ${why ? 'disabled' : ''} title="${why || ''}">${why && why !== 'Já no máximo' ? why : `+1 grau (${SkillTree.tierCost(n.tier)} pt)`}</button>` : ''}</div>`;
            }
            h += '</div>';
        }
        h += `</div><div class="cr-box" style="margin-top:12px"><h3>PRESTÍGIO ${sk.prestige}</h3><p class="cr-dim">A partir do nível ${SkillTree.PRESTIGE_LEVEL}: graus infinitos, ${SkillTree.PRESTIGE_COST} pontos cada, +1% de pagamento e de XP por grau. Nunca acaba.</p>
            <div><button data-skill="#prestige" ${L >= SkillTree.PRESTIGE_LEVEL && sk.points >= SkillTree.PRESTIGE_COST ? '' : 'disabled'}>+1 Prestígio (${SkillTree.PRESTIGE_COST} pt)</button></div></div>`;
        return h;
    }

    _achievements(ach) {
        const L = ach.list(), done = L.filter((a) => ach.done[a[0]]).length;
        let h = `<div class="plat">${ach.platinum ? '🏆 <b>PLATINA CONQUISTADA</b> — você fez tudo.' : `🏆 <b>PLATINA</b>: ${done}/${L.length} conquistas. Desbloqueie TODAS (nível 100, maestria 10 em todas as carreiras, árvore completa, Prestígio 10, R$ 10 milhões…).`}
            <div class="cr-bar"><i><s style="width:${Math.round(100 * done / L.length)}%;background:linear-gradient(90deg,#c8d4ff,#ff3ad0)"></s></i></div></div><div class="ach-grid" style="margin-top:10px">`;
        let grp = '';
        for (const [id, group, name, desc, fn] of L) {
            if (group !== grp) { grp = group; h += `<div class="ach-group">${group}</div>`; }
            let v; try { v = fn(); } catch (e) { v = [0, 1]; }
            const ok = !!ach.done[id], pct = Math.round(100 * Math.min(1, v[0] / v[1]));
            const fmt = (x) => (v[1] >= 100000 ? brl(x) : x);
            h += `<div class="ach ${ok ? 'ok' : ''}"><b>${ok ? '🏅 ' : ''}${name}</b>${desc}<br><span style="color:#8d97ad">${fmt(Math.min(v[0], v[1]))} / ${fmt(v[1])}</span><i><s style="width:${ok ? 100 : pct}%"></s></i></div>`;
        }
        return h + '</div>';
    }

    _careers() {
        const M = this.mgr, c = M.by[this.sel] || M.list[0];
        const list = M.list.map((k) => {
            const nx = k.nextRank, base = k.ranks[k.rank].xp, pct = nx ? Math.round(100 * (k.xp - base) / (nx.xp - base)) : 100;
            return `<div class="cr-card ${k === c ? 'on' : ''}" data-career="${k.id}" style="--c:${k.color}"><b>${k.icon} ${k.name}</b><small>${k.rankName}${k.mastery ? ` · ✦ M${k.mastery}` : ''} · ${k.xp} XP${k.points > 0 ? ` · <span style="color:#ffd23a">${k.points} ponto(s)</span>` : ''}</small><i><s style="width:${pct}%;background:${k.color}"></s></i></div>`;
        }).join('');

        let main = '';
        if (M.job) {
            const h = M.hud() || { title: M.job.title, text: M.job.text, extra: '' };
            main += `<div class="cr-box cr-active"><h3>EM ANDAMENTO · ${h.title}</h3><p class="cr-dim">${h.text}${h.extra ? ' — ' + h.extra : ''}</p><div><button data-act="abandon" data-career="${M.job.c.id}">Abandonar o trabalho</button></div></div>`;
        }
        const nx = c.nextRank;
        main += `<div class="cr-box" style="--c:${c.color}"><h3>${c.icon} ${c.name} — ${c.rankName.toUpperCase()} <button data-act="guide" style="float:right;font-size:11px;padding:3px 8px">? Como funciona</button></h3><p class="cr-dim">${c.desc}</p>
            <div class="cr-ranks">${c.ranks.map((r, i) => `<span class="${i < c.rank ? 'done' : (i === c.rank ? 'cur' : '')}" title="${r.desc}">${r.name}${i > c.rank ? ` · ${r.xp} XP` : ''}</span>`).join('')}</div>
            <p class="cr-dim">${c.ranks[c.rank].desc}${nx ? ` Próxima patente: <b style="color:#ffe27a">${nx.name}</b> em ${nx.xp - c.xp} XP.` : (() => { const m = c.masteryNext; return ` Topo da carreira — <b style="color:#ffe27a">MAESTRIA ${c.mastery}</b> (+${c.mastery * 3}% de pagamento). Próxima maestria em ${m.need - m.have} XP. A maestria não tem fim.`; })()}</p></div>`;

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

        return `<div class="cr-list">${list}</div><div class="cr-main" style="--c:${c.color}">${main}</div>`;
    }
}
