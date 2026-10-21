// ============================================================================
// Traces — RASTROS e FUGA: o que fica para trás depois de um assalto e como a polícia usa isso.
//
//   DESCRIÇÃO (retrato falado)  testemunhas e câmeras descrevem a ROUPA (parte de cima, calça, cabeça). Por 2 dias, um policial que te
//                               veja de perto (≤ 13 u) com 2 dessas 3 peças iguais te reconhece → ★. Trocar de roupa (fora da vista
//                               da polícia) quebra a descrição. Trocar na frente de um policial: ele vê a roupa nova.
//   ROSTO                       sem máscara, testemunha e câmera veem seu rosto: o INQUÉRITO (Polícia Civil) sobe muito. A balaclava
//                               esconde tudo; a bandana esconde da câmera, mas testemunha de perto ainda ajuda o retrato.
//   CÂMERAS (DVR)               arrancar o HD do gravador na loja apaga a gravação (rosto, roupa e tempo de cena).
//   DIGITAIS                    mexer no caixa, cofre, prateleiras e vitrines sem LUVAS deixa digitais (inquérito).
//   PLACA                       sair dirigindo de perto da loja com testemunha acordada: anotaram a placa. Polícia que vê esse carro
//                               (≤ 26 u) → ★. Some com: pintura nova na oficina, placa fria no desmanche ou largando o carro.
//   INQUÉRITO 0..100            soma os rastros; cai sozinho (7/dia) ou com ADVOGADO (dinheiro limpo — aba CARREIRAS › Assaltante).
//                               Em 100 sai o MANDADO DE PRISÃO: a polícia te reconhece pela cara em qualquer roupa (≤ 16 u) até baixar de 60.
//   ÁREA DE BUSCA               quando ligam para a polícia depois que você saiu, o radar mostra o círculo amarelo do bairro onde as
//                               viaturas procuram: dentro dele, quem bate com a descrição é reconhecido de mais longe.
//   MÁSCARA NA RUA              mascarado em público, a polícia estranha de longe (Outfit fx) e, de perto, te aborda (★). Tecla K
//                               põe/tira a última máscara usada.
// ============================================================================

const Traces = {
    desc: null,           // { top, legs, head, until (h absoluta), where }
    heat: 0,              // inquérito 0..100
    warrant: false,
    plates: [],           // [{ key, label, until }]   key: 'g<uid>' (carro seu) | 'c<id>' (carro de rua)
    search: null,         // { x, z, r, t }
    pend: [],             // ligações pendentes: { t, x, z, r, why }
    lastMask: 'balaclava',
    stats: { scenes: 0, clean: 0 },
    game: null,

    now() { const g = this.game; return Economy.day * 24 + (g ? g.dayNight.hour : 0); },
    masked() { const id = Outfit.worn.face; return id && Outfit.ITEMS[id] && Outfit.ITEMS[id].mask ? id : null; },
    fullMask() { return this.masked() === 'balaclava'; },
    gloved() { return Outfit.worn.hands === 'luvas'; },
    sig() {
        const w = Outfit.worn, t = Outfit.tint;
        return { top: (w.top || '') + '|' + (t.top || ''), legs: (w.legs || '') + '|' + (t.legs || ''), head: (w.head || '-') + '|' + (t.head || '') };
    },
    matches() {
        const d = this.desc; if (!d) return false;
        const s = this.sig();
        return (s.top === d.top) + (s.legs === d.legs) + (s.head === d.head) >= 2;
    },
    plateKey(car) { if (!car) return null; return car.ownedRec ? 'g' + car.ownedRec.uid : 'c' + car.id; },
    plateFlagged(car) { const k = this.plateKey(car); return !!k && this.plates.some((p) => p.key === k); },

    // ---------------------------------------------------------------- cena do crime (assalto terminado)
    // info: { x, z, name, witnesses (acordados que viram), cams (gravação ficou), prints (mexeu sem luva), value, hostagesOut, killed }
    scene(game, info) {
        this.game = game;
        const lines = [], fm = this.fullMask(), mk = this.masked();
        let add = 0;
        if (info.witnesses > 0 || info.cams) {
            const s = this.sig();
            this.desc = Object.assign(s, { until: this.now() + 48, where: info.name });
            lines.push('👕 descrição da roupa');
        }
        if (!fm && info.cams) { add += 25; lines.push('📹 rosto na câmera'); }
        else if (info.cams) add += 6;                                                  // (de máscara: altura, corpo e roupa ajudam o inquérito)
        if (!fm && info.witnesses > 0) { add += mk ? 7 : 16; if (!mk) lines.push('👤 testemunhas viram o rosto'); }
        if (info.prints) { add += 10; lines.push('🖐 digitais'); }
        if (info.killed) add += 30 * info.killed;
        add += Math.min(15, (info.value || 0) / 5000);
        this.addHeat(add);
        this.scenePos = info.witnesses > 0 ? { x: info.x, z: info.z, t: 35 } : null;      // quem fugir de carro daqui nos próximos segundos tem a placa anotada
        this.stats.scenes++;
        if (!lines.length) { this.stats.clean++; if (game.achievements && game.achievements.bump) game.achievements.bump('cleanJob'); }
        return lines;
    },

    addHeat(n) {
        if (!(n > 0)) return;
        const was = this.warrant;
        this.heat = Math.min(100, this.heat + n * (1 - (SkillTree.m.taxHeat || 0) * 0.5));
        if (this.heat >= 100) this.warrant = true;
        if (this.warrant && !was && this.game) { this.game._flash('⚖ MANDADO DE PRISÃO: a Polícia Civil fechou o inquérito — qualquer policial te reconhece pela cara. Advogado (aba CARREIRAS › Assaltante) ou espere esfriar'); AudioFX.blip(150, 0.5, 0.25); }
    },

    // Testemunhas que vão ligar daqui a `delay` s (o assalto acabou e você saiu): a polícia por perto vai até a loja e abre a busca.
    call(x, z, delay, why = 'testemunha ligou') { this.pend.push({ t: delay, x, z, r: 240, why }); },
    startSearch(x, z, T = 150, r = 150) { this.search = { x, z, r, t: T }; },

    flagPlate(car, why = 'anotaram a placa') {
        const k = this.plateKey(car); if (!k || car.isBoat) return;
        if (!this.plates.some((p) => p.key === k)) this.plates.push({ key: k, label: car.spec ? `${car.spec.name} ${car.spec.model}` : 'carro', until: this.now() + 72 });
        if (this.game) this.game._flash(`🚗 ${why}: ${car.spec ? car.spec.name + ' ' + car.spec.model : 'o carro'} está marcado — polícia que vir esse carro vem atrás (pinte na oficina, troque a placa no desmanche ou largue ele)`);
    },
    clearPlate(car) { const k = this.plateKey(car); const n = this.plates.length; this.plates = this.plates.filter((p) => p.key !== k); return this.plates.length < n; },

    // ---------------------------------------------------------------- advogado
    lawyerCost() { return Math.round((1500 + this.heat * 180) / 100) * 100; },
    lawyer(game) {
        if (this.heat < 5 && !this.warrant) return 'Não tem inquérito contra você';
        const c = this.lawyerCost(), inv = game.inventory;
        if (inv.clean < c) return `O advogado só aceita dinheiro LIMPO: faltam ${brl(c - inv.clean)}`;
        inv.clean -= c;
        this.heat = Math.max(0, this.heat - 45);
        if (this.warrant && this.heat < 60) this.warrant = false;
        return `⚖ Advogado pago (${brl(c)}): o inquérito esfriou para ${Math.round(this.heat)}%${this.warrant ? '' : ' — sem mandado'}`;
    },

    // ---------------------------------------------------------------- máscara (tecla K)
    toggleMask(game) {
        const cur = this.masked();
        if (cur) { this.lastMask = cur; const r = Outfit.wear(cur); game._flash('😶 Tirou a máscara'); return r; }
        const pick = [this.lastMask, 'balaclava', 'bandana'].find((id) => Outfit.owned.has(id));
        if (!pick) { game._flash('Você não tem máscara — balaclava e bandana na boutique ou na boca de fumo'); return null; }
        const r = Outfit.wear(pick);
        if (r.ok) game._flash(`🥷 ${Outfit.ITEMS[pick].name}: rosto coberto${Interiors.active ? '' : ' — na rua a polícia estranha (K tira)'}`);
        return r;
    },

    // ---------------------------------------------------------------- por quadro
    update(dt, game) {
        this.game = game;
        for (let i = this.pend.length - 1; i >= 0; i--) {
            const c = this.pend[i];
            c.t -= dt;
            if (c.t > 0) continue;
            this.pend.splice(i, 1);
            if (game.policeManager) game.policeManager.alertNear({ x: c.x, z: c.z }, c.r);
            game.wanted.reportCrime(18);
            this.startSearch(c.x, c.z);
            game._flash(`📞 ${c.why}: viaturas vasculhando o bairro (círculo amarelo no radar)`);
        }
        if (this.search) { this.search.t -= dt; if (this.search.t <= 0) { this.search = null; game._flash('A busca no bairro acabou'); } }
        const sp = this.scenePos;
        if (sp) {
            sp.t -= dt;
            const car = game.mode === 'car' && game.activeCar;
            if (car && !car.isBoat && hypot(car.position.x - sp.x, car.position.z - sp.z) < 38) { this.scenePos = null; this.flagPlate(car, 'Uma testemunha anotou a placa do carro da fuga'); }
            else if (sp.t <= 0) this.scenePos = null;
        }
        this._t = (this._t || 0) - dt;
        if (this._t > 0) return;
        this._t = 0.25;
        this._watchOutfit(game);
        const pm = game.policeManager;
        if (Interiors.active && this._el) this._el.style.display = 'none';
        if (!pm || Interiors.active || game.wanted.level > 0 || game.arrest || game.death || (game.hiding && !game.hiding.seen)) { this._hud(game); return; }
        const pos = game._playerState().pos, inSearch = this.search && hypot(pos.x - this.search.x, pos.z - this.search.z) < this.search.r;
        const desc = this.matches(), plate = game.mode === 'car' && this.plateFlagged(game.activeCar), masked = game.mode === 'player' && this.masked();
        if (!masked) this._maskWarned = false;
        if (desc || plate || masked || this.warrant) {
            let best = Infinity;
            for (const u of pm.units) if (u.mind && u.mind.sees) best = Math.min(best, hypot(u.position.x - pos.x, u.position.z - pos.z));
            const why = plate && best < 26 ? 'A polícia reconheceu a placa do carro do assalto!'
                : this.warrant && best < 16 && !this.fullMask() ? 'MANDADO DE PRISÃO: o policial reconheceu seu rosto!'
                : desc && best < (inSearch ? 22 : 13) ? 'Te reconheceram pela descrição! (troque de roupa)'
                : masked && best < 10 ? 'Mascarado na rua: a polícia veio te abordar!' : null;
            if (why) {
                if (masked && !desc && !plate && !this.warrant && !this._maskWarned) { this._maskWarned = true; game._flash('😷 Um policial está olhando o mascarado… tire a máscara (K)!'); }
                else { this._maskWarned = false; game.wanted.ensureLevel(1); pm.alertNear(pos, 60); game._flash('🚔 ' + why); }
            }
        }
        this._hud(game);
    },

    _watchOutfit(game) {
        if (!this.desc) return;
        const k = JSON.stringify(this.sig());
        if (this._sigK === undefined) this._sigK = k;
        if (k === this._sigK) return;
        this._sigK = k;
        const pm = game.policeManager, pos = game._playerState().pos;
        const watched = pm && pm.units.some((u) => u.mind && u.mind.sees && hypot(u.position.x - pos.x, u.position.z - pos.z) < 30);
        if (watched) { Object.assign(this.desc, this.sig()); game._flash('👀 Um policial te viu trocar de roupa — a descrição agora é a roupa nova'); }
        else if (!this.matches()) game._flash('👕 Roupa trocada: a descrição da polícia não bate mais com você');
    },

    onNewDay() {
        this.heat = Math.max(0, this.heat - 7);
        if (this.warrant && this.heat < 60) { this.warrant = false; if (this.game) this.game._flash('⚖ O inquérito esfriou: o mandado de prisão caiu'); }
        const now = this.now();
        if (this.desc && this.desc.until <= now) this.desc = null;
        this.plates = this.plates.filter((p) => p.until > now);
    },

    // Preso: o inquérito vira processo (sobe) e a descrição já não importa (eles já te pegaram).
    onBusted() { this.desc = null; this.search = null; this.pend = []; this.addHeat(15); },

    // ---------------------------------------------------------------- HUD (chips no canto)
    _hud(game) {
        let el = this._el;
        if (!el) {
            el = this._el = document.createElement('div');
            el.id = 'traceChips';
            el.style.cssText = 'position:fixed;right:16px;top:var(--tr-top,206px);z-index:10;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none;font:600 12px var(--font);color:var(--tx)';
            document.body.appendChild(el);
        }
        const chips = [], chip = (t, c) => `<div style="padding:4px 10px;border-radius:99px;background:rgba(14,17,26,0.82);border:1px solid ${c};white-space:nowrap">${t}</div>`;
        if (this.masked() && !Interiors.active) chips.push(chip(`${this.fullMask() ? '🥷' : '😷'} mascarado — K tira`, 'rgba(251,191,36,0.6)'));
        if (typeof Witnesses !== 'undefined' && Witnesses.pending()) chips.push(chip(Witnesses.hudChip(), 'rgba(251,191,36,0.8)'));
        if (this.search && game.wanted.level === 0) chips.push(chip(`🔎 busca no bairro ${Math.ceil(this.search.t)}s`, 'rgba(251,191,36,0.6)'));
        if (this.desc) chips.push(chip(this.matches() ? '👕 sua roupa está na descrição' : '👕 descrição (roupa trocada ✔)', this.matches() ? 'rgba(244,63,94,0.6)' : 'rgba(52,211,153,0.5)'));
        if (game.mode === 'car' && this.plateFlagged(game.activeCar)) chips.push(chip('🚗 placa marcada', 'rgba(244,63,94,0.6)'));
        if (this.warrant) chips.push(chip('⚖ MANDADO DE PRISÃO', 'rgba(244,63,94,0.9)'));
        else if (this.heat >= 20) chips.push(chip(`📁 inquérito ${Math.round(this.heat)}%`, 'rgba(96,165,250,0.6)'));
        const html = chips.join(''), h2 = document.getElementById('hud2');
        if (h2 && html && !document.body.classList.contains('mobile')) { const b = h2.getBoundingClientRect().bottom; if (b > 0) el.style.top = Math.round(b + 8) + 'px'; }      // (celular: MobileUI põe abaixo dos atalhos)
        if (html !== this._html) { this._html = html; el.innerHTML = html; }
        el.style.display = html && !game.menu.isOpen && !Interiors.active ? 'flex' : 'none';
    },

    serialize() { return { desc: this.desc, heat: this.heat, warrant: this.warrant, plates: this.plates, mask: this.lastMask, stats: this.stats }; },
    load(s) {
        this.desc = null; this.heat = 0; this.warrant = false; this.plates = []; this.search = null; this.pend = []; this.stats = { scenes: 0, clean: 0 };
        if (!s) return;
        this.desc = s.desc || null; this.heat = s.heat || 0; this.warrant = !!s.warrant; this.plates = s.plates || []; this.lastMask = s.mask || 'balaclava';
        this.stats = Object.assign({ scenes: 0, clean: 0 }, s.stats || {});
        this._sigK = undefined;
    },
};
Economy.onDay(() => Traces.onNewDay());
