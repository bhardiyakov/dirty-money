// ============================================================================
// EquipUI — Inventário → EQUIPAMENTO: personalizar o personagem (roupas, acessórios, bolsa e arma na mão).
//   ATRIBUTOS (esquerda)    vida, colete, fôlego e o que as peças mudam (velocidade, proteção, carga, discrição, preços…).
//                           Passando o mouse (ou selecionando) um item, mostra a PRÉVIA: valor atual → valor com o item.
//   EQUIPADO (centro)       o boneco de frente, pintado com as cores reais da roupa (as mesmas do sprite: Outfit.col), com os
//                           encaixes em volta (óculos, pescoço, cima, calça, calçado | arma, colete, bolsa, luvas, pulso).
//                           Clicar num encaixe filtra os itens daquele tipo.
//   ITENS DISPONÍVEIS       o que é seu: guarda-roupa (Outfit.owned), bolsas (em uso + reservas, Bags) e armas. Cartão com
//   (direita)               borda de raridade; o selecionado abre o detalhe com EQUIPAR / TIRAR / DESCARTAR.
// Bolsas de reserva vão junto, vazias (pesam o próprio peso) — guarde no BAÚ de casa ou descarte. Roupas ficam no guarda-roupa.
// Teclado: setas escolhem · ENTER equipa/tira · DEL descarta · [ ] categoria · C troca Equipamento ↔ Mochila.
// ============================================================================

class EquipUI {
    static get LEFT() { return ['head', 'eyes', 'neck', 'top', 'legs', 'shoes']; }
    static get RIGHT() { return ['weapon', 'vest', 'bag', 'hands', 'wrist']; }
    static get SLOT() {
        return {
            head: { label: 'Cabeça', empty: 'of_bone', cat: 'head', at: [100, 40], at2: [100, 213] },
            eyes: { label: 'Óculos', empty: 'of_oculos_escuros', cat: 'acc', at: [86, 74], at2: [100, 240] },
            neck: { label: 'Pescoço', empty: 'of_corrente_ouro', cat: 'acc', at: [94, 128], at2: [100, 252] },
            top: { label: 'Parte de cima', empty: 'of_camiseta_branca', cat: 'top', at: [66, 165], at2: [96, 276] },
            legs: { label: 'Calça', empty: 'of_calca_jeans', cat: 'legs', at: [86, 290], at2: [90, 314] },
            shoes: { label: 'Calçado', empty: 'of_tenis_branco', cat: 'shoes', at: [80, 372], at2: [76, 343] },
            weapon: { label: 'Arma na mão', empty: 'fists', cat: 'weapon', at: [160, 262], at2: [150, 309] },
            vest: { label: 'Colete', empty: 'vest', cat: null, at: [124, 170], at2: [115, 282] },
            bag: { label: 'Bolsa', empty: 'pockets', cat: 'bag', at: [142, 128], at2: [126, 250] },
            hands: { label: 'Luvas', empty: 'of_luvas', cat: 'acc', at: [150, 252], at2: [152, 313] },
            wrist: { label: 'Pulso', empty: 'of_relogio_ouro', cat: 'acc', at: [146, 236], at2: [149, 304] },
        };
    }
    static get CATS() {
        return [['all', '✨', 'Tudo'], ['top', '👕', 'Parte de cima'], ['legs', '👖', 'Calças'], ['shoes', '👟', 'Calçados'], ['head', '🧢', 'Bonés e chapéus'], ['acc', '🕶️', 'Acessórios'], ['bag', '🎒', 'Bolsas'], ['weapon', '🔫', 'Armas'],
            ['look', '✂️', 'Visual: aparência e cores (de graça)']];
    }
    static get RARITY() {
        return { common: ['#9ca3af', 'Comum'], uncommon: ['#34d399', 'Incomum'], rare: ['#60a5fa', 'Rara'], epic: ['#a78bfa', 'Épica'], legend: ['#fbbf24', 'Lendária'] };
    }
    static get WEAPON_RARITY() { return { knife: 'common', bat: 'common', pistol: 'uncommon', revolver: 'uncommon', shotgun: 'rare', smg: 'rare', rifle: 'epic', ak47: 'epic' }; }

    constructor(game, menu) {
        this.g = game;
        this.menu = menu;
        this.cat = 'all';
        this.sel = 0;
        this.hover = null;          // entrada sob o mouse (prévia)
        this._css();
    }

    _css() {
        const css = document.createElement('style');
        css.textContent = `
            .eq-wrap { flex: 1; min-height: 0; display: grid; grid-template-columns: 250px minmax(420px, 1fr) minmax(330px, 400px); gap: 16px; overflow: auto; }
            .eq-col { display: flex; flex-direction: column; min-height: 0; }
            .eq-attr .body { padding: 2px 16px 14px; display: flex; flex-direction: column; gap: 7px; overflow: auto; }
            .eq-bar { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--tx-2); }
            .eq-bar span { display: flex; justify-content: space-between; } .eq-bar span b { color: var(--tx); font-weight: 700; }
            .eq-bar i { display: block; height: 9px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
            .eq-bar i s { display: block; height: 100%; border-radius: 99px; }
            .eq-st { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 8px; padding: 5px 0; border-top: 1px solid var(--line); font-size: 13px; color: var(--tx-2); }
            .eq-st .ic { font-size: 16px; text-align: center; } .eq-st b { color: var(--tx); font: 700 13px var(--font-d); white-space: nowrap; }
            .eq-st b.up { color: #4ade80; } .eq-st b.dn { color: #f87171; } .eq-st b.on { color: #f0a0c8; }
            .eq-st em { font-style: normal; color: var(--tx-3); font-weight: 600; margin-right: 4px; }
            .eq-center { position: relative; min-height: 470px; }
            .eq-center .px-title { text-align: center; }
            .eq-lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
            .eq-stage { position: relative; flex: 1; display: grid; grid-template-columns: 112px 1fr 112px; grid-template-rows: minmax(0, 1fr); align-items: stretch; padding: 0 14px 14px; min-height: 0; }
            .eq-slots { display: flex; flex-direction: column; justify-content: space-between; gap: 6px; z-index: 1; }
            .eq-slot { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; cursor: pointer; }
            .eq-slot .lb { font: 700 10px var(--font); letter-spacing: 0.1em; text-transform: uppercase; color: var(--tx-3); }
            .eq-slot .bx { width: 66px; height: 66px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 32px;
                background: radial-gradient(circle at 50% 35%, rgba(96,165,250,0.22), rgba(12,15,24,0.85) 70%); border: 2px solid var(--rc, var(--line-2));
                box-shadow: inset 0 0 0 1px rgba(0,0,0,0.5), 0 4px 14px rgba(0,0,0,0.35); transition: transform .12s, border-color .12s; }
            .eq-slot .bx img { width: 54px; height: auto; }
            .eq-slot:hover .bx { transform: translateY(-2px); border-color: rgba(255,255,255,0.45); }
            .eq-slot.empty .bx { opacity: 0.35; filter: grayscale(1); border-style: dashed; }
            .eq-slot.on .bx { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(251,191,36,0.35), 0 6px 18px rgba(251,191,36,0.25); }
            .eq-slot .nm { font-size: 11px; color: var(--tx-2); text-align: center; max-width: 112px; line-height: 1.2; min-height: 26px; }
            .eq-doll { position: relative; min-height: 0; overflow: hidden; }          /* (o canvas não dita a altura: senão o boneco vaza do palco e os pés somem) */
            .eq-doll canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
            .eq-cats { display: flex; gap: 4px; padding: 0 12px 8px; flex-wrap: wrap; }
            .eq-cat { width: 42px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 19px; cursor: pointer;
                background: var(--card); border: 1px solid var(--line); transition: background .12s; }
            .eq-cat:hover { background: var(--card-h); } .eq-cat.on { background: rgba(251,191,36,0.16); border-color: var(--gold); }
            .eq-catname { padding: 0 16px 6px; font-size: 12px; color: var(--tx-3); }
            .eq-grid { flex: 1; min-height: 120px; overflow: auto; padding: 4px 12px 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; align-content: start; }
            .eq-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px 7px; border-radius: 12px; cursor: pointer;
                background: linear-gradient(170deg, color-mix(in srgb, var(--rc) 22%, transparent), rgba(12,15,24,0.6)); border: 2px solid color-mix(in srgb, var(--rc) 70%, transparent); transition: transform .12s; }
            .eq-card:hover { transform: translateY(-2px); }
            .eq-card.on { box-shadow: 0 0 0 2px var(--gold), 0 6px 18px rgba(251,191,36,0.25); }
            .eq-card .em { font-size: 34px; height: 42px; display: flex; align-items: center; } .eq-card .em img { width: 62px; height: auto; }
            .eq-card .t { font-size: 11px; line-height: 1.2; text-align: center; color: color-mix(in srgb, var(--rc) 55%, #fff); min-height: 27px; }
            .eq-card .use { position: absolute; top: 4px; right: 4px; font: 800 9px var(--font); padding: 2px 5px; border-radius: 99px; background: var(--acc); color: #04130c; }
            .eq-empty { grid-column: 1 / -1; padding: 24px 8px; text-align: center; font-size: 13px; color: var(--tx-3); }
            .eq-det { margin: 0 12px 12px; padding: 12px 14px; border-radius: 12px; background: rgba(0,0,0,0.28); border: 1px solid var(--line-2); font-size: 13px; color: var(--tx-2); line-height: 1.45; }
            .eq-det h4 { font: 700 17px var(--font-d); color: var(--tx); margin: 0 0 2px; }
            .eq-det .tg { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
            .eq-det .ln { display: block; } .eq-det .ln.g { color: #4ade80; } .eq-det .ln.r { color: #f87171; } .eq-det .ln.n { color: var(--tx-2); }
            .eq-det .pm-btns { margin-top: 10px; }
            .eq-det .pm-btn.dim { opacity: 0.5; pointer-events: none; }
            .eq-msg { min-height: 18px; padding: 0 16px 8px; font-size: 12px; color: var(--gold); }
            .eq-lookgrid { display: block; }
            .eq-look { display: flex; flex-direction: column; gap: 10px; }
            .eq-lk { display: flex; flex-direction: column; gap: 5px; }
            .eq-lkh { font: 700 11px var(--font); letter-spacing: 0.08em; text-transform: uppercase; color: var(--tx-3); }
            .eq-lkh2 { font: 700 13px var(--font-d); color: var(--gold); margin-top: 4px; border-top: 1px solid var(--line); padding-top: 8px; }
            .eq-lknote { font-size: 12px; color: var(--gold); }
            .eq-chips { display: flex; flex-wrap: wrap; gap: 5px; }
            .eq-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 99px; font-size: 12px; cursor: pointer; background: var(--card); border: 1px solid var(--line); color: var(--tx-2); }
            .eq-chip:hover { background: var(--card-h); } .eq-chip.on { border-color: var(--gold); color: var(--tx); background: rgba(251,191,36,0.14); }
            .eq-chip i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.5); }
            .eq-tints { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
            .eq-sw, .eq-sw0 { width: 20px; height: 20px; border-radius: 6px; cursor: pointer; border: 2px solid rgba(0,0,0,0.45); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.15); }
            .eq-sw0 { display: inline-flex; align-items: center; justify-content: center; font-size: 13px; color: var(--tx-2); background: var(--card); }
            .eq-sw:hover, .eq-sw0:hover { transform: translateY(-1px); } .eq-sw.on, .eq-sw0.on { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(251,191,36,0.4); }
            .eq-doll canvas { image-rendering: pixelated; cursor: pointer; }
            @media (max-width: 1180px) { .eq-wrap { grid-template-columns: minmax(400px, 1fr) minmax(300px, 380px); } .eq-attr { grid-column: 1 / -1; order: 3; } .eq-attr .body { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); column-gap: 18px; } }
            @media (max-width: 860px) { .eq-wrap { grid-template-columns: 1fr; } .eq-center { min-height: 430px; } .eq-stage { grid-template-columns: 92px 1fr 92px; } .eq-slot .bx { width: 54px; height: 54px; font-size: 26px; } }`;
        document.head.appendChild(css);
    }

    // ------------------------------------------------------------------ dados
    // O que está em cada encaixe agora (id de peça/bolsa/arma, ou null).
    _worn(slot) {
        const g = this.g, inv = g.inventory, pl = g.player;
        if (slot === 'weapon') return pl.weapon && pl.weapon !== 'none' && pl.weapon !== 'fists' ? pl.weapon : null;
        if (slot === 'vest') return pl.armorMax > 0 ? (pl.armorMax >= 100 ? 'vest2' : 'vest') : null;
        if (slot === 'bag') return inv.bag && inv.bag !== 'none' ? inv.bag : null;
        return Outfit.worn[slot] || null;
    }

    // Itens disponíveis (tudo o que é seu), cada um { key, type, id, slot, cat, name, icon, rar, worn }.
    entries() {
        const g = this.g, inv = g.inventory, out = [];
        for (const id of Object.keys(Outfit.ITEMS)) {
            if (!Outfit.owned.has(id)) continue;
            const it = Outfit.ITEMS[id], cat = EquipUI.SLOT[it.slot].cat;
            out.push({ key: 'o:' + id, type: 'outfit', id, slot: it.slot, cat, name: it.name, icon: 'of_' + id, rar: Outfit.rarity(id), worn: Outfit.isWorn(id) });
        }
        const bags = (inv.bag && inv.bag !== 'none' ? [inv.bag] : []).concat(inv.spareBags || []);
        for (const id of Object.keys(Bags.DEFS)) {
            if (!bags.includes(id)) continue;
            const D = Bags.DEFS[id];
            out.push({ key: 'b:' + id, type: 'bag', id, slot: 'bag', cat: 'bag', name: D.name, icon: D.icon, rar: this._rarBase(D.base), worn: inv.bag === id });
        }
        for (const k of ['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'ak47', 'bat', 'knife']) {
            if (!inv.owned(k)) continue;
            out.push({ key: 'w:' + k, type: 'weapon', id: k, slot: 'weapon', cat: 'weapon', name: Weapons[k].name, icon: k, rar: EquipUI.WEAPON_RARITY[k] || 'common', worn: g.player.weapon === k });
        }
        const order = { top: 0, legs: 1, shoes: 2, head: 3, eyes: 4, neck: 5, hands: 6, wrist: 7, bag: 8, weapon: 9 };
        return out.sort((a, b) => (order[a.slot] - order[b.slot]) || (b.worn - a.worn));
    }
    _rarBase(b) { return b <= 0 ? 'common' : b < 300 ? 'uncommon' : b < 1500 ? 'rare' : b < 4000 ? 'epic' : 'legend'; }
    list() { const L = this.entries(); return this.cat === 'all' ? L : L.filter((e) => e.cat === this.cat); }

    // Estado de equipamento (roupas + bolsa) atual, ou com a entrada `e` trocada (prévia).
    _state(e) {
        const s = { worn: Object.assign({}, Outfit.worn), bag: this.g.inventory.bag || 'none', weapon: this.g.player.weapon };
        if (!e) return s;
        if (e.type === 'outfit') { if (e.worn) { if (Outfit.DEFAULT[e.slot]) s.worn[e.slot] = Outfit.DEFAULT[e.slot]; else delete s.worn[e.slot]; } else s.worn[e.slot] = e.id; }
        else if (e.type === 'bag') s.bag = e.worn ? 'none' : e.id;
        else if (e.type === 'weapon') s.weapon = e.worn ? 'none' : e.id;
        return s;
    }

    // Atributos de um estado: [{ ic, label, v (maior = melhor), txt }]
    stats(s) {
        const m = Outfit.fxOf(s.worn), D = Bags.DEFS[s.bag] || Bags.DEFS.none, pl = this.g.player;
        const pc = (v) => v ? `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%` : '—';
        const lvl = Bags.fitLevel(pl.fit), kg = D.kg * Bags.carryMul(pl, m);
        return [
            { ic: '🏃', label: 'Velocidade correndo', v: m.sprint, txt: pc(m.sprint) },
            { ic: '🚶', label: 'Passo (andando)', v: m.walk, txt: pc(m.walk) },
            { ic: '🫁', label: 'Fôlego máximo', v: Bags.staminaMax(lvl, m), txt: String(Bags.staminaMax(lvl, m)) },
            { ic: '💨', label: 'Cansaço ao correr', v: m.stamina, txt: pc(-m.stamina) },
            { ic: '♻️', label: 'Recuperação do fôlego', v: m.regen, txt: pc(m.regen) },
            { ic: '🛡️', label: 'Dano recebido', v: m.dmgTaken, txt: pc(-m.dmgTaken) },
            { ic: '👊', label: 'Corpo a corpo', v: m.melee, txt: pc(m.melee) },
            { ic: '🕶️', label: 'Polícia te reconhece', v: m.sight, txt: m.sight ? `${Math.round(m.sight * 100)}% mais perto` : '—' },
            { ic: '🏴', label: 'Despistar a polícia', v: m.lose, txt: pc(m.lose) },
            { ic: '🎒', label: 'Espaços na bolsa', v: D.cols * D.rows, txt: `${D.cols}×${D.rows} (${D.cols * D.rows})` },
            { ic: '⚖️', label: 'Carga sem pesar', v: kg, txt: `${kg.toFixed(kg % 1 ? 1 : 0)} kg` },
            { ic: '🏷️', label: 'Preços no comércio', v: m.price, txt: pc(-m.price) },
            { ic: '🏘️', label: 'Preços na favela', v: m.favela, txt: pc(-m.favela) },
            { ic: '💎', label: 'Receptador paga', v: m.fence, txt: pc(m.fence) },
        ];
    }

    // Linhas do detalhe de um item: [{ t, c: 'g'|'r'|'n' }]
    lines(e) {
        if (e.type === 'outfit') {
            const fx = Outfit.ITEMS[e.id].fx, L = [], p = (v) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
            const add = (v, good, t) => L.push({ t, c: good ? 'g' : 'r' });
            if (fx.sprint) add(fx.sprint, fx.sprint > 0, `${p(fx.sprint)} velocidade correndo`);
            if (fx.walk) add(fx.walk, fx.walk > 0, `${p(fx.walk)} velocidade andando`);
            if (fx.stamina) add(fx.stamina, fx.stamina > 0, `${p(-fx.stamina)} cansaço ao correr`);
            if (fx.staminaMax) add(fx.staminaMax, true, `+${fx.staminaMax} fôlego máximo`);
            if (fx.regen) add(fx.regen, true, `${p(fx.regen)} recuperação do fôlego`);
            if (fx.dmgTaken) add(fx.dmgTaken, true, `${p(-fx.dmgTaken)} dano recebido`);
            if (fx.melee) add(fx.melee, true, `${p(fx.melee)} dano corpo a corpo`);
            if (fx.carry) add(fx.carry, true, `${p(fx.carry)} carga sem pesar`);
            if (fx.sight) add(fx.sight, true, `polícia te reconhece ${Math.round(fx.sight * 100)}% mais perto`);
            if (fx.lose) add(fx.lose, true, `${p(fx.lose)} para despistar a polícia`);
            if (fx.price) add(fx.price, true, `${p(-fx.price)} nos preços do comércio`);
            if (fx.favela) add(fx.favela, true, `${p(-fx.favela)} nos preços da favela`);
            if (fx.fence) add(fx.fence, true, `${p(fx.fence)} no que o receptador paga`);
            if (!L.length) L.push({ t: 'Sem bônus — só o visual', c: 'n' });
            return L;
        }
        if (e.type === 'bag') {
            const D = Bags.DEFS[e.id];
            const L = [{ t: `Grade ${D.cols}×${D.rows} — ${D.cols * D.rows} espaços`, c: 'g' }, { t: `Carrega ${D.kg} kg sem pesar`, c: 'g' }];
            if (D.hand) L.push({ t: 'Levada na mão: com ela, só dá para usar a pistola', c: 'r' });
            if (D.wheels) L.push({ t: 'Andando, as rodinhas levam boa parte do peso', c: 'g' });
            L.push({ t: `Pesa ${D.self} kg de reserva (sem usar)`, c: 'n' });
            return L;
        }
        const W = Weapons[e.id], inv = this.g.inventory;
        return W.gun
            ? [{ t: `Dano ${W.dmg}${W.pellets > 1 ? ' ×' + W.pellets : ''} · ${W.auto ? 'automática' : 'tiro a tiro'}`, c: 'g' }, { t: `Alcance ${W.range} m`, c: 'n' }, { t: `Carregador ${inv.mag(e.id)}/${inv.magOf(e.id)} · reserva ${inv.reserve(e.id)}`, c: 'n' }]
            : [{ t: `Dano ${W.dmg} · corpo a corpo`, c: 'g' }];
    }

    // ------------------------------------------------------------------ desenho
    // Painel de atributos (com a prévia de `prev`, se houver).
    _attrHtml(prev) {
        const base = this.stats(this._state(null)), pv = prev && prev.type !== 'weapon' ? this.stats(this._state(prev)) : null, pl = this.g.player;
        const bar = (label, v, max, col, note) => `<div class="eq-bar"><span>${label}<b>${note}</b></span><i><s style="width:${max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0}%;background:${col}"></s></i></div>`;
        const stamMax = base[2].v;
        let attr = bar('❤️ Vida', pl.hp, pl.maxHp, 'linear-gradient(90deg,#ff3a5a,#ff7a8a)', `${Math.round(pl.hp)}/${pl.maxHp}`)
            + bar('🦺 Colete', pl.armor, pl.armorMax || 1, 'linear-gradient(90deg,#2a7cff,#35c8ff)', pl.armorMax > 0 ? `${Math.round(pl.armor)}/${pl.armorMax}` : 'sem colete')
            + bar('🫁 Fôlego', pl.stamina == null ? stamMax : pl.stamina, stamMax, 'linear-gradient(90deg,#10b981,#a3e635)', `${Math.round(pl.stamina == null ? stamMax : pl.stamina)}/${stamMax}`)
            + bar('⚖️ Carga', Bags.kg || 0, (Bags.cap || 1) * Bags.HARD, (Bags.ratio || 0) > 1 ? '#f87171' : 'linear-gradient(90deg,#fbbf24,#fb923c)', `${(Bags.kg || 0).toFixed(1)}/${Math.round(Bags.cap || 0)} kg`);
        base.forEach((st, i) => {
            const p = pv && pv[i], diff = p && Math.abs(p.v - st.v) > 1e-6;
            const cls = diff ? (p.v > st.v ? 'up' : 'dn') : (st.v && st.txt !== '—' && i !== 2 && i !== 9 && i !== 10 ? 'on' : '');
            attr += `<div class="eq-st"><span class="ic">${st.ic}</span><span>${st.label}</span><b class="${cls}">${diff ? `<em>${st.txt} →</em>${p.txt}` : st.txt}</b></div>`;
        });
        return attr;
    }

    render(el) {
        this.el = el;
        const L = this.list();
        this.sel = Math.max(0, Math.min(this.sel, L.length - 1));
        const cur = L[this.sel] || null, prev = this._prev(cur);
        const pl = this.g.player, S = EquipUI.SLOT, R = EquipUI.RARITY;
        const attr = this._attrHtml(prev);

        const slotHtml = (slot) => {
            const id = this._worn(slot), D = S[slot];
            let icon = D.empty, name = 'vazio', rar = null;
            if (id) {
                if (slot === 'weapon') { icon = id; name = Weapons[id].name; rar = EquipUI.WEAPON_RARITY[id]; }
                else if (slot === 'vest') { icon = id; name = `${Economy.ITEMS[id].name} · ${Math.round(pl.armor)}/${pl.armorMax}`; rar = id === 'vest2' ? 'epic' : 'rare'; }
                else if (slot === 'bag') { icon = Bags.DEFS[id].icon; name = Bags.DEFS[id].name; rar = this._rarBase(Bags.DEFS[id].base); }
                else { icon = 'of_' + id; name = Outfit.ITEMS[id].name; rar = Outfit.rarity(id); }
            } else if (slot === 'weapon') name = 'Punhos';
            else if (slot === 'bag') name = 'Só os bolsos';
            const on = this.cat !== 'all' && D.cat === this.cat && cur && cur.slot === slot;
            return `<div class="eq-slot ${id ? '' : 'empty'} ${on ? 'on' : ''}" data-slot="${slot}" style="${rar ? `--rc:${R[rar][0]}` : ''}"><div class="lb">${D.label}</div><div class="bx">${Emoji.html(icon, 32)}</div><div class="nm">${name}</div></div>`;
        };

        const cats = EquipUI.CATS.map(([id, ic, nm]) => `<div class="eq-cat ${this.cat === id ? 'on' : ''}" data-cat="${id}" title="${nm}">${ic}</div>`).join('');
        const cards = this.cat === 'look' ? this._lookHtml() : L.length ? L.map((e, i) => `<div class="eq-card ${i === this.sel ? 'on' : ''}" data-i="${i}" style="--rc:${R[e.rar][0]}">${e.worn ? '<span class="use">EM USO</span>' : ''}<div class="em">${Emoji.html(e.icon, 34)}</div><div class="t">${e.name}</div></div>`).join('')
            : `<div class="eq-empty">${this.cat === 'weapon' ? 'Nenhuma arma. Compre na loja de armas ou na boca.' : this.cat === 'bag' ? 'Nenhuma bolsa. Compre na boutique, na conveniência ou na loja de armas — ou pegue no baú de casa.' : 'Nada aqui ainda. Roupas, bonés e acessórios se compram na BOUTIQUE (👕 no mapa).'}</div>`;

        el.innerHTML = `<div class="eq-wrap">
            <div class="px eq-col eq-attr"><div class="px-title">Atributos</div><div class="body">${attr}</div></div>
            <div class="px eq-col eq-center"><canvas class="eq-lines"></canvas><div class="px-title">Equipado</div>
              <div class="eq-stage"><div class="eq-slots">${EquipUI.LEFT.map(slotHtml).join('')}</div><div class="eq-doll"><canvas width="400" height="800"></canvas></div><div class="eq-slots">${EquipUI.RIGHT.map(slotHtml).join('')}</div></div></div>
            <div class="px eq-col"><div class="px-title">Itens disponíveis <span style="text-transform:none;letter-spacing:0;color:var(--tx-3)">· para trocar de roupa e de bolsa</span></div>
              <div class="eq-cats">${cats}</div><div class="eq-catname">${EquipUI.CATS.find((c) => c[0] === this.cat)[2]}${this.cat === 'look' ? '' : ` · ${L.length} ${L.length === 1 ? 'item' : 'itens'}`}</div>
              <div class="eq-grid${this.cat === 'look' ? ' eq-lookgrid' : ''}">${cards}</div>${cur && this.cat !== 'look' ? this._detail(cur) : ''}<div class="eq-msg">${this._msg || ''}</div></div>
          </div>`;

        // eventos
        el.querySelectorAll('.eq-cat').forEach((b) => b.addEventListener('click', () => this.setCat(b.dataset.cat)));
        el.querySelectorAll('.eq-slot').forEach((b) => b.addEventListener('click', () => this._slotClick(b.dataset.slot)));
        el.querySelectorAll('.eq-card').forEach((b) => {
            const e = L[+b.dataset.i];
            b.addEventListener('click', () => { this.sel = +b.dataset.i; this.hover = null; this.render(el); });
            b.addEventListener('dblclick', () => { this.sel = +b.dataset.i; this.act('primary'); });
            b.addEventListener('mouseenter', () => { this.hover = e; this._refreshPreview(); });
            b.addEventListener('mouseleave', () => { this.hover = null; this._refreshPreview(); });
        });
        el.querySelectorAll('.eq-det [data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
        // visual: aparência (pele, cabelo, barba, corpo) e tingir as peças vestidas — de graça
        el.querySelectorAll('[data-app]').forEach((b) => b.addEventListener('click', () => { const [f, v] = b.dataset.app.split(':'); this._msg = Outfit.setAppearance(f, v).msg; AudioFX.blip(640, 0.06, 0.1); this.render(el); }));
        el.querySelectorAll('[data-tint]').forEach((b) => b.addEventListener('click', () => { const [s, v] = b.dataset.tint.split(':'); this._msg = Outfit.setTint(s, v || null).msg; AudioFX.blip(700, 0.06, 0.1); this.render(el); }));
        const dc = el.querySelector('.eq-doll canvas');
        if (dc) dc.addEventListener('click', () => { this._dollDir = ((this._dollDir == null ? 4 : this._dollDir) + 1) % 8; this._dollSpin = false; this._paintDoll(); });
        this._drawDoll(this._state(prev));
        requestAnimationFrame(() => this._drawLines());
    }

    // Item da prévia: o que está sob o mouse, senão o selecionado — só se ainda não estiver em uso (prévia = "e se eu vestir?").
    _prev(cur) { const e = this.hover || cur; return e && !e.worn ? e : null; }

    // Prévia leve (passar o mouse): só refaz os atributos e o boneco (os cartões ficam: sem piscar, sem perder o scroll).
    _refreshPreview() {
        if (!this.el) return;
        const L = this.list(), prev = this._prev(L[this.sel] || null), body = this.el.querySelector('.eq-attr .body');
        if (body) body.innerHTML = this._attrHtml(prev);
        this._drawDoll(this._state(prev));
    }

    _detail(e) {
        const R = EquipUI.RARITY[e.rar], inv = this.g.inventory;
        const slotName = e.type === 'outfit' ? Outfit.SLOT_NAME[e.slot] : e.type === 'bag' ? 'Bolsa' : 'Arma';
        const desc = e.type === 'outfit' ? Outfit.ITEMS[e.id].desc : '';
        const btns = [];
        if (e.type === 'outfit') {
            const def = Outfit.DEFAULT[e.slot] === e.id;
            btns.push(e.worn ? [def ? 'EM USO' : 'TIRAR', 'primary', def] : ['EQUIPAR', 'primary', false]);
            btns.push(['DESCARTAR', 'discard', def]);
        } else if (e.type === 'bag') {
            btns.push(e.worn ? ['TIRAR (SÓ BOLSOS)', 'primary', false] : ['USAR ESTA', 'primary', false]);
            btns.push(['DESCARTAR', 'discard', false]);
        } else {
            btns.push(e.worn ? ['GUARDAR (PUNHOS)', 'primary', false] : ['EMPUNHAR', 'primary', false]);
            btns.push(['DESCARTAR', 'discard', false]);
        }
        const note = e.type === 'bag' ? '<span class="ln n" style="margin-top:6px;font-size:12px;color:var(--tx-3)">Bolsa sem uso vai junto (vazia). Para não carregar o peso, guarde no BAÚ de casa ou descarte.</span>'
            : e.type === 'outfit' && Outfit.DEFAULT[e.slot] === e.id ? '<span class="ln n" style="margin-top:6px;font-size:12px;color:var(--tx-3)">Roupa de sempre: não dá para jogar fora.</span>' : '';
        return `<div class="eq-det"><h4>${e.name}</h4><div class="tg" style="color:${R[0]}">${R[1]} · ${slotName}${e.worn ? ' · em uso' : ''}</div>
            ${desc ? `<span class="ln n">${desc}</span>` : ''}${this.lines(e).map((l) => `<span class="ln ${l.c}">${l.c === 'g' ? '▲ ' : l.c === 'r' ? '▼ ' : '• '}${l.t}</span>`).join('')}${note}${this._tintFor(e)}
            <div class="pm-btns">${btns.map(([t, a, dim]) => `<div class="pm-btn ${dim ? 'dim' : ''}" data-act="${a}">${t}</div>`).join('')}</div></div>`;
    }

    // ------------------------------------------------------------------ ações
    setCat(c) { this.cat = c; this.sel = 0; this.hover = null; this._msg = ''; this.render(this.el); }

    _slotClick(slot) {
        const D = EquipUI.SLOT[slot];
        if (!D.cat) { this._msg = this.g.player.armorMax > 0 ? 'O colete gasta com os tiros — compre outro na loja de armas para renovar.' : 'Sem colete: compre na loja de armas (absorve 75% do dano).'; this.render(this.el); return; }
        this.cat = D.cat; this.hover = null; this._msg = '';
        const L = this.list(), w = this._worn(slot), i = L.findIndex((e) => e.slot === slot && (w ? e.id === w : true));
        this.sel = Math.max(0, i);
        this.render(this.el);
    }

    act(a) {
        const L = this.list(), e = L[this.sel];
        if (!e) return;
        const g = this.g, pl = g.player, inv = g.inventory;
        let r = { ok: false, msg: '' };
        if (a === 'primary') {
            if (e.type === 'outfit') r = Outfit.wear(e.id);
            else if (e.type === 'bag') r = Bags.equip(g, e.worn ? 'none' : e.id);
            else {
                const k = e.worn ? 'none' : e.id;
                if (!pl.equip(k)) { pl.weapon = k; pl.aimTimer = 0; }
                g.reloading = 0;
                r = { ok: true, msg: k === 'none' ? 'Guardou a arma' : `Arma: ${Weapons[k].name}` };
            }
        } else if (a === 'discard') {
            if (e.type === 'outfit') r = Outfit.discard(e.id);
            else if (e.type === 'bag') { r = Bags.remove(g, e.id); if (r.ok) r.msg = `Descartou: ${Bags.DEFS[e.id].name}`; }
            else { const w = inv.weapons[e.id]; w.owned = false; w.mag = 0; w.reserve = 0; if (pl.weapon === e.id) pl.weapon = 'none'; r = { ok: true, msg: `Descartou: ${Weapons[e.id].name}` }; }
        }
        this._msg = r.msg || '';
        if (r.ok) AudioFX.blip(a === 'discard' ? 380 : 640, 0.08, 0.12); else AudioFX.blip(220, 0.1, 0.1);
        // mantém a seleção no mesmo item (a ordem muda: o "em uso" sobe)
        const L2 = this.list(), j = L2.findIndex((x) => x.key === e.key);
        this.sel = j >= 0 ? j : Math.min(this.sel, L2.length - 1);
        this.hover = null;
        this.render(this.el);
    }

    // Teclado (PauseMenu repassa): true se usou a tecla.
    key(k) {
        const L = this.list();
        if (k === '[' || k === ',' || k === 'pageup') { const C = EquipUI.CATS, i = C.findIndex((c) => c[0] === this.cat); this.setCat(C[(i + C.length - 1) % C.length][0]); return true; }
        if (k === ']' || k === '.' || k === 'pagedown') { const C = EquipUI.CATS, i = C.findIndex((c) => c[0] === this.cat); this.setCat(C[(i + 1) % C.length][0]); return true; }
        if (!L.length) return false;
        const cols = this._cols();
        const d = { arrowleft: -1, arrowright: 1, arrowup: -cols, arrowdown: cols }[k];
        if (d) { this.sel = Math.max(0, Math.min(L.length - 1, this.sel + d)); this.hover = null; this.render(this.el); this._scrollSel(); return true; }
        if (k === 'enter' || k === ' ') { this.act('primary'); return true; }
        if (k === 'delete' || k === 'backspace') { this.act('discard'); return true; }
        return false;
    }
    _cols() { const g = this.el && this.el.querySelector('.eq-grid'); if (!g) return 3; const n = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length; return Math.max(1, n); }
    _scrollSel() { const c = this.el && this.el.querySelector('.eq-card.on'); if (c) c.scrollIntoView({ block: 'nearest' }); }

    // ------------------------------------------------------------------ linhas douradas: encaixe → ponto do corpo
    _drawLines() {
        const el = this.el; if (!el) return;
        const panel = el.querySelector('.eq-center'), cv = el.querySelector('.eq-lines'), doll = el.querySelector('.eq-doll canvas');
        if (!panel || !cv || !doll || !panel.offsetWidth) return;
        const pr = panel.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        cv.width = Math.round(pr.width * dpr); cv.height = Math.round(pr.height * dpr);
        const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
        // o canvas do boneco usa object-fit: contain (400×800 lógicos → caixa real)
        const dr = doll.getBoundingClientRect(), k = Math.min(dr.width / 200, dr.height / 400), ox = dr.left - pr.left + (dr.width - 200 * k) / 2, oy = dr.top - pr.top + (dr.height - 400 * k) / 2;
        for (const s of el.querySelectorAll('.eq-slot')) {
            const D = EquipUI.SLOT[s.dataset.slot], bx = s.querySelector('.bx').getBoundingClientRect(), left = EquipUI.LEFT.includes(s.dataset.slot);
            const x0 = (left ? bx.right : bx.left) - pr.left, y0 = bx.top + bx.height / 2 - pr.top, at = typeof PlayerLook !== 'undefined' && PlayerLook.ok && D.at2 ? D.at2 : D.at, x1 = ox + at[0] * k, y1 = oy + at[1] * k;
            const filled = !s.classList.contains('empty'), gr = ctx.createLinearGradient(x0, y0, x1, y1);
            gr.addColorStop(0, filled ? 'rgba(251,191,36,0.85)' : 'rgba(255,255,255,0.12)'); gr.addColorStop(1, filled ? 'rgba(251,191,36,0.05)' : 'rgba(255,255,255,0)');
            ctx.strokeStyle = gr; ctx.lineWidth = filled ? 2.2 : 1.2;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            if (filled) { ctx.fillStyle = 'rgba(251,191,36,0.9)'; ctx.beginPath(); ctx.arc(x1, y1, 2.6, 0, Math.PI * 2); ctx.fill(); }
        }
    }

    // ------------------------------------------------------------------ visual (aparência + cores), de graça
    // Cor de amostra (tom base) de um nome da paleta do gerador.
    _sw(name) {
        const P = typeof NpcArt !== 'undefined' ? NpcArt.gen().PAL : null, r = P && P[name];
        return r ? r[3] : '#888';
    }
    // Linha de amostras para tingir a peça do encaixe `slot` (a cor atual marcada; ↺ = a cor original da peça).
    _tintRow(slot) {
        const cur = Outfit.tint[slot] || null;
        const chips = Outfit.tintList(slot).map(([n, label]) => `<span class="eq-sw ${cur === n ? 'on' : ''}" data-tint="${slot}:${n}" title="${label}" style="background:${this._sw(n)}"></span>`).join('');
        return `<div class="eq-tints"><span class="eq-sw0 ${cur ? '' : 'on'}" data-tint="${slot}:" title="Cor original">↺</span>${chips}</div>`;
    }
    // Tingir no detalhe da peça vestida (roupa com cor própria ou bolsa nas costas).
    _tintFor(e) {
        if (typeof PlayerLook === 'undefined' || !PlayerLook.ok || !e.worn) return '';
        const slot = e.type === 'outfit' ? e.slot : e.type === 'bag' && Bags.DEFS[e.id].look ? 'bag' : null;
        if (!slot || !Outfit.TINT_FIELD[slot]) return '';
        return `<div class="eq-lkh" style="margin-top:8px">Tingir · de graça</div>${this._tintRow(slot)}`;
    }
    _lookHtml() {
        if (typeof PlayerLook === 'undefined' || !PlayerLook.ok) return '<div class="eq-empty">Visual indisponível.</div>';
        const A = Outfit.APPEARANCE, cur = Object.assign({}, Outfit.APPEARANCE_DEFAULT, Outfit.appearance);
        const group = (f) => `<div class="eq-lk"><div class="eq-lkh">${Outfit.APPEARANCE_NAME[f]}</div><div class="eq-chips">${A[f].map(([v, label]) => {
            const sw = f === 'skin' || f === 'hair_color' ? `<i style="background:${this._sw(v)}"></i>` : '';
            return `<span class="eq-chip ${String(cur[f] || '') === v ? 'on' : ''}" data-app="${f}:${v}">${sw}${label}</span>`;
        }).join('')}</div></div>`;
        const inv = this.g.inventory, bag = inv.bag && inv.bag !== 'none' && Bags.DEFS[inv.bag] && Bags.DEFS[inv.bag].look;
        const tints = [['top', 'Parte de cima'], ['legs', 'Calça'], ['shoes', 'Calçado'], ['head', 'Cabeça'], ...(bag ? [['bag', 'Bolsa']] : [])]
            .filter(([s]) => s === 'bag' || Outfit.worn[s] || Outfit.DEFAULT[s])
            .map(([s, label]) => `<div class="eq-lk"><div class="eq-lkh">${label} · ${s === 'bag' ? Bags.DEFS[inv.bag].name : Outfit.ITEMS[Outfit.worn[s] || Outfit.DEFAULT[s]].name}</div>${this._tintRow(s)}</div>`).join('');
        const busy = PlayerLook.want ? '<div class="eq-lknote">⏳ Ajustando o visual no personagem…</div>' : '';
        const porte = `<div class="eq-lk"><div class="eq-lkh">Porte · ${Physique.label()}</div><div class="eq-lknote">O corpo muda com o que você faz: comer demais engorda, passar fome emagrece, academia e comida em dia deixam forte (ver STATUS).</div></div>`;
        return `<div class="eq-look">${busy}${['skin', 'hair', 'hair_color', 'beard', 'gender'].map(group).join('')}${porte}<div class="eq-lkh2">Tingir as peças vestidas</div>${tints}</div>`;
    }

    // ------------------------------------------------------------------ boneco (de frente), com as cores da roupa
    _colors(worn) {
        const V = (CharacterRig.VARIANTS || (CharacterRig.VARIANTS = CharacterRig._buildVariants()))[0], c = { skin: V.skin, hair: V.hair };
        for (const slot of ['shoes', 'top', 'legs']) {
            const it = Outfit.ITEMS[worn[slot] || Outfit.DEFAULT[slot]];
            if (it && it.col) for (const [k, v] of Object.entries(it.col)) c[k] = v === 'skin' ? V.skin : v;
        }
        return c;
    }

    // Boneco: o PERSONAGEM DE VERDADE (o mesmo gerador do sprite do jogo, PlayerLook.preview), girando nas 8 direções. Sem ele, o desenho antigo.
    _drawDoll(s) {
        if (typeof PlayerLook !== 'undefined' && PlayerLook.ok) {
            const spec = PlayerLook.spec({ worn: s.worn, bag: s.bag });
            spec.weaponLook = s.weapon && s.weapon !== 'none' ? ((Weapons[s.weapon] && Weapons[s.weapon].look) || s.weapon) : 'none';
            const key = JSON.stringify(spec);
            if (key !== this._dollKey) { this._dollKey = key; PlayerLook.preview(spec, (frames, W, H, k) => { this._doll = { frames, W, H, k: k || 0.5, armor: this.g.player.armorMax }; this._paintDoll(); }); }
            this._paintDoll();
            if (!this._dollTimer) this._dollTimer = setInterval(() => {
                if (!this.el || !this.el.isConnected || !this.el.querySelector('.eq-doll canvas')) { clearInterval(this._dollTimer); this._dollTimer = null; return; }
                if (this._dollSpin === false) return;
                this._dollDir = ((this._dollDir == null ? 4 : this._dollDir) + 7) % 8;
                this._paintDoll();
            }, 650);
            return;
        }
        this._drawDollOld(s);
    }
    _paintDoll() {
        const cv = this.el && this.el.querySelector('.eq-doll canvas'); if (!cv) return;
        const ctx = cv.getContext('2d'), K = cv.width / 200;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(K, 0, 0, K, 0, 0);
        const glow = ctx.createRadialGradient(100, 230, 10, 100, 230, 150); glow.addColorStop(0, 'rgba(96,165,250,0.28)'); glow.addColorStop(1, 'rgba(96,165,250,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, 200, 400);
        ctx.fillStyle = '#1a1f2c'; ctx.beginPath(); ctx.ellipse(100, 352, 84, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(251,191,36,0.75)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(251,191,36,0.3)'; ctx.beginPath(); ctx.ellipse(100, 352, 66, 10, 0, 0, Math.PI * 2); ctx.stroke();
        const D = this._doll;
        if (!D) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '600 11px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('montando o personagem…', 100, 220); return; }
        const d = this._dollDir == null ? 4 : this._dollDir, img = D.frames[d];
        const t = this._dollCv || (this._dollCv = document.createElement('canvas'));
        t.width = D.W; t.height = D.H; t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img), D.W, D.H), 0, 0);
        const S = 4.3 * 0.5 / D.k, P = NpcArt.gen().pivFor(D.k);          // (adulto: ~36 px de altura no quadro em k 0,5 — at2 dos SLOTS casam com esta escala)
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(t, 100 - P[0] * S, 348 - P[1] * S, D.W * S, D.H * S);
        if (D.armor > 0) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '800 11px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`🦺 colete ${D.armor >= 100 ? 'NV II' : 'NV I'}`, 100, 385); }
    }

    _drawDollOld(s) {
        const cv = this.el.querySelector('.eq-doll canvas'); if (!cv) return;
        const ctx = cv.getContext('2d'), K = cv.width / 200;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(K, 0, 0, K, 0, 0);
        const C = this._colors(s.worn), W = s.worn, pl = this.g.player, bag = Bags.DEFS[s.bag] || Bags.DEFS.none, weapon = s.weapon;
        const sh = (hex, a) => { const c = Pixel.hex(hex); return `rgb(${c.map((v) => Math.round(a > 0 ? v + (255 - v) * a : v * (1 + a))).join(',')})`; };
        const OUT = '#0b0d13';
        const part = (col, path, lw = 2) => {
            const b = path(); ctx.save();
            const gr = ctx.createLinearGradient(b[0], 0, b[1], 0); gr.addColorStop(0, sh(col, 0.16)); gr.addColorStop(0.55, col); gr.addColorStop(1, sh(col, -0.28));
            ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
        };
        const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); return [x, x + w]; };
        const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); const xs = pts.map((p) => p[0]); return [Math.min(...xs), Math.max(...xs)]; };

        // pedestal com brilho
        const glow = ctx.createRadialGradient(100, 200, 10, 100, 200, 150); glow.addColorStop(0, 'rgba(96,165,250,0.28)'); glow.addColorStop(1, 'rgba(96,165,250,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, 200, 400);
        ctx.fillStyle = '#1a1f2c'; ctx.beginPath(); ctx.ellipse(100, 384, 84, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(251,191,36,0.75)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(251,191,36,0.3)'; ctx.beginPath(); ctx.ellipse(100, 384, 66, 10, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(100, 380, 50, 7, 0, 0, Math.PI * 2); ctx.fill();

        // mochila (atrás do corpo)
        if (bag.look === 'pack' || bag.look === 'tactical') {
            const bc = bag.look === 'tactical' ? '#4a5034' : '#2f4a7a', wd = bag.look === 'tactical' ? 112 : 104;
            part(bc, () => rr(100 - wd / 2, 118, wd, 96, 16));
        }
        // capuz do moletom (atrás da cabeça)
        if (W.top === 'moletom_capuz') part(C.shirt, () => { ctx.beginPath(); ctx.ellipse(100, 104, 34, 20, 0, 0, Math.PI * 2); return [66, 134]; });

        // pernas e calçados
        const shorts = W.legs === 'bermuda';
        for (const x of [72, 102]) {
            part(C.pants, () => rr(x, 210, 26, shorts ? 86 : 156, 7));
            if (shorts) part(C.skin, () => rr(x + 3, 294, 20, 70, 6));
        }
        const flip = W.shoes === 'chinelo';
        for (const x of [70, 100]) {
            if (flip) { part(C.skin, () => rr(x + 3, 360, 26, 14, 6)); part(C.shoes, () => rr(x - 1, 372, 34, 6, 3), 1.5); }
            else part(C.shoes, () => rr(x - 2, 358, 34, 20, 9));
            if (W.shoes === 'coturno') part(C.shoes, () => rr(x + 1, 340, 28, 24, 4));
        }

        // braços (atrás do tronco nas laterais)
        const arm = (x, dir) => {
            part(C.sleeve, () => poly([[x, 120], [x + 22 * dir, 120], [x + 20 * dir, 190], [x + 2 * dir, 190]].map(([a, b]) => [a, b])));
            part(C.forearm, () => poly([[x + 2 * dir, 188], [x + 20 * dir, 188], [x + 19 * dir, 244], [x + 4 * dir, 244]]));
            const gl = W.hands === 'luvas';
            part(gl ? '#3a2a1e' : C.skin, () => { ctx.beginPath(); ctx.ellipse(x + 11.5 * dir, 254, 11, 12, 0, 0, Math.PI * 2); return [x + 11.5 * dir - 11, x + 11.5 * dir + 11]; });
            return [x + 11.5 * dir, 254];
        };
        const hl = arm(54, -1), hr = arm(146, 1);         // hl = mão à esquerda da tela, hr = à direita

        // tronco
        part(C.shirt, () => poly([[56, 118], [144, 118], [134, 222], [66, 222]]));
        ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        if (W.top === 'terno') {            // camisa branca, gravata e lapelas
            part('#f2f2f2', () => poly([[88, 118], [112, 118], [100, 170]]), 1.5);
            part('#b3262d', () => poly([[97, 124], [103, 124], [106, 166], [100, 176], [94, 166]]), 1.2);
            ctx.beginPath(); ctx.moveTo(84, 118); ctx.lineTo(100, 182); ctx.lineTo(116, 118); ctx.stroke();
        } else if (W.top === 'jaqueta_laranja' || W.top === 'jaqueta_couro') {
            ctx.beginPath(); ctx.moveTo(100, 124); ctx.lineTo(100, 220); ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(86, 120); ctx.lineTo(96, 150); ctx.moveTo(114, 120); ctx.lineTo(104, 150); ctx.stroke();
        } else if (W.top === 'moletom_capuz') {
            part(sh(C.shirt, -0.12), () => rr(76, 176, 48, 30, 8), 1.5);
            ctx.strokeStyle = '#dcdcdc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(94, 122); ctx.lineTo(93, 150); ctx.moveTo(106, 122); ctx.lineTo(107, 150); ctx.stroke();
        } else if (W.top === 'camisa_time') {
            ctx.fillStyle = C.sleeve; ctx.font = '800 30px Outfit, Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('10', 100, 168);
        } else if (W.top === 'colete_carga') {
            for (const [x, y] of [[68, 150], [108, 150], [68, 186], [108, 186]]) part(sh(C.shirt, -0.15), () => rr(x, y, 24, 22, 4), 1.4);
        }
        // cinto
        if (W.top !== 'moletom_capuz') { ctx.fillStyle = '#2a1d14'; ctx.fillRect(66, 212, 68, 9); ctx.strokeRect(66, 212, 68, 9); ctx.fillStyle = '#d4b04a'; ctx.fillRect(95, 213, 10, 7); }

        // colete à prova de balas (por cima da roupa)
        if (pl.armorMax > 0) {
            const vc = pl.armorMax >= 100 ? '#2c3442' : '#38404c';
            part(vc, () => poly([[64, 124], [86, 120], [100, 132], [114, 120], [136, 124], [132, 212], [68, 212]]));
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '800 11px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(pl.armorMax >= 100 ? 'NV II' : 'NV I', 100, 186);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(74, 150, 52, 20);
        }

        // alças da mochila / mala transversal
        ctx.lineCap = 'round';
        if (bag.look === 'pack' || bag.look === 'tactical') {
            ctx.strokeStyle = bag.look === 'tactical' ? '#2f331f' : '#1d2f52'; ctx.lineWidth = 8;
            ctx.beginPath(); ctx.moveTo(76, 120); ctx.lineTo(78, 206); ctx.moveTo(124, 120); ctx.lineTo(122, 206); ctx.stroke();
            if (bag.look === 'tactical') { ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(78, 168); ctx.lineTo(122, 168); ctx.stroke(); }
        } else if (bag.look === 'cross') {
            ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(70, 120); ctx.lineTo(132, 206); ctx.stroke();
            part('#7a4f2e', () => rr(118, 196, 32, 26, 6));
        }

        // pescoço e cabeça
        part(C.skin, () => rr(90, 96, 20, 26, 6));
        if (W.neck === 'corrente_ouro') { ctx.strokeStyle = '#f3c845'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(100, 116, 16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); ctx.fillStyle = '#f3c845'; ctx.beginPath(); ctx.arc(100, 132, 4, 0, Math.PI * 2); ctx.fill(); }
        part(C.skin, () => { ctx.beginPath(); ctx.ellipse(73, 74, 6, 9, 0, 0, Math.PI * 2); return [67, 79]; }, 1.5);
        part(C.skin, () => { ctx.beginPath(); ctx.ellipse(127, 74, 6, 9, 0, 0, Math.PI * 2); return [121, 133]; }, 1.5);
        part(C.skin, () => { ctx.beginPath(); ctx.ellipse(100, 70, 27, 32, 0, 0, Math.PI * 2); return [73, 127]; });
        part(C.hair, () => { ctx.beginPath(); ctx.moveTo(72, 70); ctx.bezierCurveTo(68, 30, 132, 30, 128, 70); ctx.bezierCurveTo(122, 52, 106, 46, 100, 48); ctx.bezierCurveTo(90, 46, 78, 52, 72, 70); return [70, 130]; });
        // rosto
        if (W.eyes === 'oculos_escuros') {
            ctx.fillStyle = '#111318'; rr(78, 66, 19, 12, 5); ctx.fill(); rr(103, 66, 19, 12, 5); ctx.fill();
            ctx.strokeStyle = '#111318'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(96, 70); ctx.lineTo(104, 70); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(81, 68, 6, 2); ctx.fillRect(106, 68, 6, 2);
        } else {
            ctx.fillStyle = '#1a1410'; for (const x of [88, 112]) { ctx.beginPath(); ctx.ellipse(x, 72, 3, 3.6, 0, 0, Math.PI * 2); ctx.fill(); }
            ctx.strokeStyle = C.hair; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(82, 63); ctx.lineTo(93, 62); ctx.moveTo(107, 62); ctx.lineTo(118, 63); ctx.stroke();
        }
        ctx.strokeStyle = sh(C.skin, -0.35); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(100, 76); ctx.lineTo(98, 86); ctx.lineTo(102, 87); ctx.stroke();
        ctx.strokeStyle = '#7a3a2c'; ctx.beginPath(); ctx.moveTo(92, 93); ctx.quadraticCurveTo(100, 97, 108, 93); ctx.stroke();

        // relógio
        if (W.wrist === 'relogio_ouro') { part('#f3c845', () => rr(hr[0] - 10, 232, 20, 8, 3), 1.4); ctx.fillStyle = '#fff8d8'; ctx.beginPath(); ctx.arc(hr[0], 236, 3, 0, Math.PI * 2); ctx.fill(); }

        // bolsa na mão (à esquerda da tela) e arma (à direita)
        if (bag.hand === 'briefcase') { part('#c9ced6', () => rr(hl[0] - 22, 262, 44, 32, 4)); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hl[0] - 6, 262); ctx.lineTo(hl[0] - 6, 256); ctx.lineTo(hl[0] + 6, 256); ctx.lineTo(hl[0] + 6, 262); ctx.stroke(); }
        else if (bag.hand === 'duffel') { part('#55603e', () => { ctx.beginPath(); ctx.ellipse(hl[0], 286, 30, 20, 0, 0, Math.PI * 2); return [hl[0] - 30, hl[0] + 30]; }); ctx.strokeStyle = '#2f331f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hl[0] - 10, 268); ctx.lineTo(hl[0], 256); ctx.lineTo(hl[0] + 10, 268); ctx.stroke(); }
        else if (bag.hand === 'suitcase') { ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hl[0], 256); ctx.lineTo(hl[0] - 10, 300); ctx.stroke(); part('#3a5f9a', () => rr(hl[0] - 34, 298, 40, 56, 6)); ctx.fillStyle = '#111'; for (const x of [hl[0] - 28, hl[0]]) { ctx.beginPath(); ctx.arc(x, 357, 4, 0, Math.PI * 2); ctx.fill(); } }
        if (weapon && weapon !== 'none' && weapon !== 'fists') {
            if (weapon === 'bat') { ctx.strokeStyle = '#8a5a2e'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(hr[0], 254); ctx.lineTo(hr[0] + 18, 190); ctx.stroke(); }
            else if (weapon === 'knife') { part('#cfd6df', () => poly([[hr[0] + 2, 250], [hr[0] + 26, 238], [hr[0] + 6, 258]]), 1.2); }
            else {
                const ic = this.menu.itemIcon(weapon).canvas, w = ['rifle', 'ak47', 'shotgun', 'smg'].includes(weapon) ? 70 : 46, h = w * ic.height / ic.width;
                ctx.save(); ctx.translate(hr[0] + 4, 258); ctx.rotate(-0.15); ctx.drawImage(ic, -10, -h / 2, w, h); ctx.restore();
            }
        }
    }
}
memoStatics(EquipUI, 'LEFT', 'RIGHT', 'SLOT', 'CATS', 'RARITY', 'WEAPON_RARITY');
