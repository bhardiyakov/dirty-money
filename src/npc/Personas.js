// ============================================================================
// Personas — os PERSONAGENS FIXOS da cidade: gente com nome, rosto e rotina, que você encontra sempre nos mesmos lugares
// e nos mesmos horários, que lembra de você e muda o jeito de falar conforme a sua fama no bairro.
//   🍺 Seu Zé         dono do bar perto da sua casa: abre o bar de manhã e toma a fresca na porta no fim da tarde.
//                     Pedido: cobrar um caloteiro (com jeito ou na marra).
//   🌽 Tia Nena       ambulante da orla (9h–17h): vende milho e água de coco. Pedido: o fiscal da prefeitura que quer o carrinho dela.
//   📖 Pastor Valdir  na praça de manhã e no fim da tarde. Aceita doações (o bairro passa a te respeitar). Pedido: a reforma da igreja.
//   🧽 Jorginho       flanelinha do comércio (8h–20h). "Conhece um cara pra tudo".
//   🌸 Dona Rosa      na porta de casa, na entrada do morro (7h–19h). Com confiança, te dá remédio. Pedido: o neto que sumiu no baile.
//   • RELAÇÃO: conversar (E) uma vez por dia aproxima; com medo de você, falam pouco. Com confiança, te dão o número (viram contato no
//     celular) e passam a mandar mensagem — e aí aparece o PEDIDO de cada um (uma vez; recompensa e confiança).
//   • Eles são atores fixos (SpriteActor), não pedestres: só existem perto de você, no lugar e na hora da rotina.
// ============================================================================

const Personas = {
    DEFS: {
        ze: { name: 'Seu Zé', emo: '🍺', type: 'civil_senhor', art: 'o', role: 'Dono do bar', about: 'Toca o bar há 30 anos. Fiado, só pra quem ele conhece.' },
        nena: { name: 'Tia Nena', emo: '🌽', type: 'civil_ambulante', art: 'a', role: 'Ambulante da orla', about: 'Vende milho e água de coco na orla desde sempre.' },
        valdir: { name: 'Pastor Valdir', emo: '📖', type: 'civil_executiva', art: 'o', role: 'Pastor da praça', about: 'Prega na praça e conhece todo mundo do bairro.' },
        jorginho: { name: 'Jorginho', emo: '🧽', type: 'civil_mano', art: 'o', role: 'Flanelinha', about: 'Vigia os carros do comércio. Conhece um cara pra tudo.' },
        rosa: { name: 'Dona Rosa', emo: '🌸', type: 'civil_vovo', art: 'a', role: 'Moradora do morro', about: 'Mora na entrada do morro. Avó de meio mundo.' },
    },
    rel: {}, anchors: null, actors: {}, quest: null, _t: 0,

    // ---------------------------------------------------------------- onde cada um fica (achado uma vez, a partir do mapa)
    _anchors(g) {
        if (this.anchors) return this.anchors;
        if (!g.nav || !g.nav.map || !CityGrid.blocks) return null;
        Interiors.index();
        const M = g.nav.map, home = SafeHouse.spawnWorld() || g.player.position, A = {};
        const side = (d, k = 2.2) => { for (const s of [k, -k, k * 2, -k * 2]) { const ax = Math.abs(Math.sin(d.face || 0)) > 0.5, x = d.x + (ax ? 0 : s), z = d.z + (ax ? s : 0); if (M.walk(x, z)) return { x, z }; } return M.walk(d.x, d.z) ? { x: d.x, z: d.z } : null; };
        const near = (L, p) => L.slice().sort((a, b) => hypot(a.x - p.x, a.z - p.z) - hypot(b.x - p.x, b.z - p.z));
        const bars = near(Interiors._doors.filter((d) => d.style === 'bar'), home);
        for (const d of bars) { const s = side(d); if (s) { A.ze = Object.assign(s, { shop: d.name }); break; } }
        const ctr = (b) => ({ x: (b.slab[0] + b.slab[2]) / 2, z: (b.slab[1] + b.slab[3]) / 2 });
        const beach = near(CityGrid.blocks.filter((b) => b.biome === 'beach').map(ctr), home);
        for (const c of beach) { const q = M.closestPoint(c.x, c.z, 16); if (q && M.walk(q.x, q.z)) { A.nena = { x: q.x, z: q.z }; break; } }
        const plaza = near(CityGrid.blocks.filter((b) => b.biome === 'plaza' || b.biome === 'park').map(ctr), home);
        for (const c of plaza) { const q = M.closestPoint(c.x, c.z, 16); if (q && M.walk(q.x, q.z) && !Standing.inFavela(q.x, q.z)) { A.valdir = { x: q.x, z: q.z }; break; } }
        const E = g.empire, com = near(Interiors._doors.filter((d) => ['mart', 'burger', 'clothes', 'pharmacy'].includes(d.style) && (!E || E.districtAt(d.x, d.z) === 'comercio')), home);
        for (const d of com) { const s = side(d, 3); if (s) { A.jorginho = s; break; } }
        if (typeof Standing !== 'undefined' && Standing._bounds) {
            const b = Standing._bounds();
            for (let k = 0; k < 40 && !A.rosa; k++) { const x = b.x1 - (0.04 + Math.random() * 0.08) * (b.x1 - b.x0), z = home.z + (Math.random() - 0.5) * 80, q = M.closestPoint(x, z, 6); if (q && M.walk(q.x, q.z) && Standing.inFavela(q.x, q.z)) A.rosa = { x: q.x, z: q.z }; }
        }
        return (this.anchors = A);
    },
    // Onde a pessoa está agora (null: fora da rotina — em casa, dormindo…).
    where(id, h) {
        const A = this.anchors && this.anchors[id]; if (!A) return null;
        if (typeof Tutorial !== 'undefined' && Tutorial.forces(id)) return A;      // (primeiros passos: a pessoa está lá a qualquer hora)
        const wd = Economy.day % 7;
        switch (id) {
            case 'ze': return (h >= 8 && h < 10) || (h >= 16 && h < 23) ? A : null;
            case 'nena': return h >= 9 && h < 17 && !(typeof Weather !== 'undefined' && Weather.cur && Weather.cur.k > 0.3) ? A : null;
            case 'valdir': return (h >= 7 && h < 11) || (h >= 17 && h < 19 && wd !== 5) ? A : null;
            case 'jorginho': return h >= 8 && h < 20 && wd !== 6 ? A : null;
            case 'rosa': return h >= 7 && h < 19 ? A : null;
        }
        return null;
    },
    R(id) { return this.rel[id] || (this.rel[id] = { talks: 0, trust: 0, last: -1, contact: false, quest: 0 }); },

    // ---------------------------------------------------------------- por quadro
    update(g, dt) {
        if (!g.player || !g.dayNight || Interiors.active || !g.aiReady) { if (Interiors.active) this._clearAll(); return; }
        this._t -= dt;
        if (this._t <= 0) {
            this._t = 1;
            if (!this._anchors(g)) return;
            this._restorePois();
            const P = g.player.position, h = g.dayNight.hour;
            for (const id of Object.keys(this.DEFS)) {
                const w = this.where(id, h), a = this.actors[id];
                const want = w && hypot(w.x - P.x, w.z - P.z) < 140;
                if (want && !a) this._spawn(g, id, w);
                else if (!want && a) this._despawn(id);
            }
            this._questTick(g);
        }
        for (const id of Object.keys(this.actors)) { const a = this.actors[id]; a.actor.update(dt, 0.6); this._idle(g, id, a, dt); }
        if (this.quest && this.quest.actor) this.quest.actor.update(dt, 0.6);
    },
    _spawn(g, id, w) {
        const D = this.DEFS[id], heading = Math.random() * 6.28;
        const actor = StreetLife._actor(g, D.type, w.x, w.z, heading, id === 'jorginho' ? 'walk' : 'idle');
        const out = { actor, meshes: [], x: w.x, z: w.z, sayT: 3 + Math.random() * 6, ph: Math.random() * 6 };
        if (id === 'nena') out.meshes = StreetLife._cart(g, w.x + 0.9, w.z);
        if (id === 'ze') { const sc = g.scene, m = FlatMat.get(sc, '#e6e6e6'); const c = BABYLON.MeshBuilder.CreateBox('pzChair', { width: 0.45, height: 0.45, depth: 0.45 }, sc); c.position.set(w.x + 0.7, 0.23, w.z); c.material = m; c.isPickable = false; out.meshes.push(c); }
        this.actors[id] = out;
    },
    _despawn(id) { const a = this.actors[id]; if (!a) return; try { a.actor.dispose(); } catch (e) { /* ok */ } for (const m of a.meshes) { try { m.dispose(); } catch (e) { /* ok */ } } delete this.actors[id]; },
    _clearAll() { for (const id of Object.keys(this.actors)) this._despawn(id); if (this.quest && this.quest.actor) { this.quest.actor.dispose(); this.quest.actor = null; } },
    _idle(g, id, a, dt) {
        a.ph += dt;
        if (id === 'jorginho') { a.actor.setPosition(a.x + Math.sin(a.ph * 0.4) * 2.5, a.z); a.actor.setHeading(Math.cos(a.ph * 0.4) > 0 ? Math.PI / 2 : -Math.PI / 2); }
        a.sayT -= dt;
        const P = g.player.position, d = hypot(a.x - P.x, a.z - P.z);
        if (a.sayT <= 0 && d < 22 && typeof Bubbles !== 'undefined') { a.sayT = 9 + Math.random() * 9; Bubbles.say(a.actor, this._pick(this.AMBIENT[id]), { ms: 2600 }); }
    },
    AMBIENT: {
        ze: ['Cerveja gelada, só aqui!', 'Ô, fiado só amanhã!', 'Esse calor tá de matar…', 'Na minha época o bairro era outro.'],
        nena: ['Olha o milho verde!', 'Água de coco geladinha!', 'Três por dez, freguesia!', 'Milho com manteiga, quentinho!'],
        valdir: ['Deus é fiel, irmão!', 'Aleluia!', 'Ainda dá tempo de mudar de vida.', 'A porta da igreja tá sempre aberta.'],
        jorginho: ['Pode deixar que eu olho, chefe!', 'Vaga aqui, ó! Vaga!', 'Vai, vai, vai… pode vir!', 'Tá tranquilo, tá favorável.'],
        rosa: ['Ai, minhas plantinhas…', 'Esse menino não me ouve…', 'Boa tarde, meu filho.', 'Hoje vai chover, tô sentindo no joelho.'],
    },
    _pick(a) { return a[Math.floor(Math.random() * a.length)]; },

    // ---------------------------------------------------------------- conversar
    near(g) {
        if (g.mode !== 'player' || Interiors.active) return null;
        const P = g.player.position;
        for (const id of Object.keys(this.actors)) { const a = this.actors[id], p = a.actor.mesh.position; if (hypot(p.x - P.x, p.z - P.z) < 2.4) return id; }
        return null;
    },
    prompt(g) {
        const Q = this.quest;
        if (Q && Q.actor && g.mode === 'player' && !Interiors.active) { const p = Q.actor.mesh.position, P = g.player.position; if (hypot(p.x - P.x, p.z - P.z) < 2.4) return `<b>E</b> ${Q.label}<small>${Q.sub || ''}</small>`; }
        const id = this.near(g); if (!id) return '';
        const D = this.DEFS[id], r = this.R(id);
        return `<b>E</b> falar com ${r.talks ? D.name : D.art + ' ' + D.role.toLowerCase()}<small>${r.talks ? D.role : 'você ainda não conhece'}</small>`;
    },
    interact(g) {
        const Q = this.quest;
        if (Q && Q.actor && g.mode === 'player' && !Interiors.active) { const p = Q.actor.mesh.position, P = g.player.position; if (hypot(p.x - P.x, p.z - P.z) < 2.4) { this._questAct(g); return true; } }
        const id = this.near(g); if (!id) return false;
        this._talk(g, id);
        return true;
    },
    mood(g) {
        if (typeof WorldMemory === 'undefined') return 'neutral';
        const P = g.player.position, F = WorldMemory.fameAt(P.x, P.z);
        return F.fear >= 45 && F.fear > F.respect ? 'fear' : F.respect >= 30 ? 'respect' : 'neutral';
    },
    LINES: {
        ze: { first: 'Opa, cara nova! Sou o Zé, o dono do bar ali. Aparece pra uma gelada.', neutral: ['E aí, tudo certo? A cerveja tá trincando hoje.', 'Senta aí, toma uma. Por conta da casa? Não, né…', 'Viu o jogo? O Portuários tá jogando muito.'], fear: ['O-oi… tudo bem? Quer alguma coisa? É por minha conta.', 'Não quero confusão no meu bar, viu… mas o senhor é bem-vindo.'], respect: ['Olha ele! O bairro só fala bem de você.', 'Meu freguês favorito! Tá precisando de algo?'] },
        nena: { first: 'Oi, querido! Quer um milho? Sou a Nena, tô aqui todo dia.', neutral: ['Hoje o movimento tá fraco…', 'Leva uma água de coco, tá calor!', 'Cuidado com o sol, menino.'], fear: ['Leva o que quiser… não precisa pagar…', 'N-nada de mal, né? Só vendo meu milho.'], respect: ['Meu anjo! Pra você é sempre de graça.', 'Você é gente boa, todo mundo sabe.'] },
        valdir: { first: 'A paz do Senhor, irmão. Sou o pastor Valdir. A igreja é ali na esquina.', neutral: ['Deus tem um plano pra você, irmão.', 'Ainda dá tempo de seguir o caminho certo.', 'Domingo tem culto, aparece.'], fear: ['Eu oro por você, irmão. Muito.', 'Que Deus tenha misericórdia… de todos nós.'], respect: ['O bairro te agradece, irmão. Deus vê o que você faz.', 'Você é uma bênção pra esse bairro.'] },
        jorginho: { first: 'Fala, chefe! Jorginho, o rei da vaga. Precisando de qualquer coisa, eu conheço um cara.', neutral: ['Pode deixar o carro que eu tomo conta!', 'Tá tranquilo, tá favorável.', 'Polícia passou aqui agora há pouco, ó.'], fear: ['Chefe! Tá tudo certo, tá tudo certo…', 'Não vi nada, não sei de nada, chefe.'], respect: ['Meu patrão! O que manda hoje?', 'Pra você é tudo na faixa, chefe.'] },
        rosa: { first: 'Boa tarde, meu filho. Sou a Rosa. Você é o novo morador, né?', neutral: ['Toma juízo, viu?', 'Quer um cafezinho? Acabei de passar.', 'Esse morro já foi tranquilo, sabia?'], fear: ['Deus me livre… pode passar, meu filho.', 'Não quero confusão na minha porta…'], respect: ['Meu filho! Você é um anjo pra esse morro.', 'Toma um bolo que eu fiz, leva!'] },
    },
    _talk(g, id) {
        const D = this.DEFS[id], r = this.R(id), mood = this.mood(g), a = this.actors[id], L = this.LINES[id];
        const first = !r.talks;
        r.talks++;
        if (r.last !== Economy.day) { r.last = Economy.day; r.trust = Math.min(100, r.trust + (mood === 'fear' ? 1 : mood === 'respect' ? 7 : 4)); }
        if (typeof Phone !== 'undefined' && Phone.CONTACTS[id]) Phone.trust[id] = r.trust;
        const text = first ? L.first : this._pick(L[mood]);
        if (typeof Bubbles !== 'undefined') Bubbles.say(a.actor, text, { ms: 3800, tone: mood === 'fear' ? 'whisper' : 'talk' });
        if (first) this._poi(id, true);
        // serviço / pedido / número
        if (!r.contact && r.trust >= 15 && mood !== 'fear') { r.contact = true; this._contact(id); setTimeout(() => g._flash(`📱 ${D.name} te passou o número — agora está nos seus contatos`), 1800); }
        else this._menu(g, id);
    },
    _contact(id) {
        if (typeof Phone === 'undefined') return;
        const D = this.DEFS[id];
        Phone.CONTACTS[id] = { name: D.name, emo: D.emo, role: D.role, about: D.about };
        if (Phone.trust[id] == null) Phone.trust[id] = this.R(id).trust;
        Phone._msg(id, { ze: 'Salvou aí? Quando quiser uma gelada, é só falar com o Zé.', nena: 'Oi querido, é a Nena! Salva meu número 🌽', valdir: 'A paz, irmão. Esse é o número da igreja também. Deus abençoe.', jorginho: 'Chefe, Jorginho aqui. Precisou, chama!', rosa: 'Meu filho, é a Rosa. Minha neta que me ensinou a mandar mensagem 😊' }[id], null, true);
    },
    _menu(g, id) {
        const D = this.DEFS[id], r = this.R(id), opts = [];
        if (id === 'valdir') opts.push(['donate', `🙏 Doar ${brl(500)} para a igreja`, 'o bairro passa a te respeitar']);
        if (id === 'nena') opts.push(['milho', r.quest === 2 ? '🌽 Pegar um milho (de graça pra você)' : `🌽 Comprar milho — ${brl(8)}`, 'mata a fome']);
        if (id === 'ze') opts.push(['gelada', r.quest === 2 ? '🍺 Uma gelada (por conta da casa)' : `🍺 Uma gelada — ${brl(12)}`, 'refresca (e dá um gás)']);
        if (id === 'rosa' && r.trust >= 30 && r.gift !== Economy.day) opts.push(['gift', '💊 Aceitar o remedinho da Dona Rosa', '+1 kit médico']);
        const q = this.QUESTS[id];
        if (q && r.contact && r.quest === 0 && !this.quest) opts.push(['quest', `❗ ${q.ask}`, q.hint]);
        if (!opts.length) return;
        if (!this._mp) this._mp = new Panel('personaMenu', { width: 480, onAct: (a) => { this._mp.close(); this._do(g, this._mid, a); } });
        this._mid = id;
        this._mp.show(`${D.emo} ${D.name}`, `${D.role} · confiança ${r.trust}`, opts.map(([k, l, s]) => `<button class="btn" data-act="${k}" style="display:block;width:100%;text-align:left;margin-top:6px;padding:10px 12px"><b>${l}</b><br><small style="color:var(--tx-2)">${s}</small></button>`).join(''));
    },
    _do(g, id, act) {
        const inv = g.inventory, r = this.R(id), pay = (v) => { if (inv.cash < v) { g._flash(`Dinheiro vivo insuficiente (${brl(v)})`); return false; } inv.cash -= v; return true; };
        if (act === 'donate' && pay(500)) { const P = g.player.position; if (typeof WorldMemory !== 'undefined') WorldMemory.good(P.x, P.z, 5, 'doou para a igreja'); r.trust = Math.min(100, r.trust + 6); g._flash('🙏 "Deus te pague, irmão." O bairro ficou sabendo da doação.'); }
        if (act === 'milho') { if (r.quest === 2 || pay(8)) { if (typeof Physique !== 'undefined') Physique.eat(280); g.player.hp = Math.min(g.player.maxHp, g.player.hp + 6); g._flash('🌽 Milho quentinho com manteiga!'); } }
        if (act === 'gelada' && (r.quest === 2 || pay(12))) { if (typeof Needs !== 'undefined') Needs.drink(30); g._flash('🍺 Desceu redonda.'); }
        if (act === 'gift') { r.gift = Economy.day; inv.medkits = (inv.medkits || 0) + 1; g._flash('💊 "Toma, meu filho, pra qualquer coisa." +1 kit médico'); }
        if (act === 'quest') this._questStart(g, id);
    },
    _poi(id, on) {
        const A = this.anchors && this.anchors[id]; if (!A || !CityGrid.pois) return;
        const i = CityGrid.pois.findIndex((p) => p.persona === id);
        if (on && i < 0) CityGrid.pois.push({ type: 'persona', x: A.x, z: A.z, name: `${this.DEFS[id].name} (${this.DEFS[id].role})`, persona: id });
    },

    // ---------------------------------------------------------------- pedidos
    QUESTS: {
        ze: { ask: 'Cobrar o caloteiro do Seu Zé', hint: 'um freguês deve R$ 600 e sumiu — o Zé sabe onde ele anda' },
        nena: { ask: 'Dar um jeito no fiscal da prefeitura', hint: 'o fiscal quer levar o carrinho da Nena' },
        valdir: { ask: 'Ajudar na reforma da igreja (R$ 2.000)', hint: 'o bairro inteiro vai saber quem ajudou' },
        rosa: { ask: 'Achar o neto da Dona Rosa', hint: 'ele sumiu no baile e não voltou pra casa' },
    },
    _questStart(g, id) {
        const r = this.R(id), M = g.nav.map, P = g.player.position, D = this.DEFS[id];
        if (id === 'valdir') {
            if (g.inventory.cash < 2000) { g._flash('Você precisa de R$ 2.000 em dinheiro vivo'); return; }
            g.inventory.cash -= 2000; r.quest = 2; r.trust = Math.min(100, r.trust + 25);
            if (typeof WorldMemory !== 'undefined') WorldMemory.good(P.x, P.z, 14, 'reformou a igreja');
            if (typeof News !== 'undefined') News.onEvent({ kind: 'agenda', day: Economy.day, text: 'Igreja da praça reabre reformada graças a doação de morador' });
            g._flash('⛪ A igreja vai ser reformada. O bairro todo vai saber quem ajudou.');
            return;
        }
        let pt = null;
        const base = id === 'rosa' && typeof Baile !== 'undefined' && Baile.c ? Baile.c : id === 'nena' ? this.anchors.nena : P;
        const rr = id === 'nena' ? [6, 12] : id === 'rosa' ? [8, 30] : [150, 300];
        for (let k = 0; k < 40 && !pt; k++) { const a = Math.random() * 6.28, d = rr[0] + Math.random() * (rr[1] - rr[0]), q = M.closestPoint(base.x + Math.cos(a) * d, base.z + Math.sin(a) * d, 8); if (q && M.walk(q.x, q.z)) pt = q; }
        if (!pt) { g._flash('Agora não dá — tenta mais tarde'); return; }
        r.quest = 1;
        const Q = this.quest = { id, x: pt.x, z: pt.z, actor: null };
        if (id === 'ze') { Q.label = 'cobrar o caloteiro'; Q.sub = 'com a arma na mão: na marra (você fica com tudo) · sem arma: na conversa'; Q.type = 'civil_trabalhador'; }
        if (id === 'nena') { Q.label = 'resolver com o fiscal'; Q.sub = `com a arma na mão: assustar · sem arma: "molhar a mão" (${brl(300)})`; Q.type = 'civil_executiva'; }
        if (id === 'rosa') { Q.label = 'falar com o neto da Dona Rosa'; Q.sub = 'convencer ele a voltar pra casa'; Q.type = 'civil_estudante'; Q.night = true; }
        g.setGps(pt.x, pt.z, `${D.emo} ${this.QUESTS[id].ask}`);
        g._flash(`${D.emo} ${D.name}: "${id === 'ze' ? 'O nome dele é Carlão. Tá sempre lá pros lados que eu marquei.' : id === 'nena' ? 'Olha ele ali, o fiscal! Me ajuda, pelo amor de Deus!' : 'Ele foi pro baile ontem e não voltou… marquei onde disseram que viram ele.'}"`);
    },
    _questTick(g) {
        const Q = this.quest; if (!Q) return;
        const P = g.player.position, d = hypot(Q.x - P.x, Q.z - P.z);
        if (!Q.actor && d < 120 && !Interiors.active) { Q.actor = StreetLife._actor(g, Q.type, Q.x, Q.z, Math.random() * 6.28, 'idle'); }
        else if (Q.actor && d > 160) { Q.actor.dispose(); Q.actor = null; }
    },
    _questAct(g) {
        const Q = this.quest, id = Q.id, r = this.R(id), D = this.DEFS[id], armed = g.player.weapon !== 'none', P = g.player.position;
        const say = (t, tone = 'talk') => { if (typeof Bubbles !== 'undefined' && Q.actor) Bubbles.say(Q.actor, t, { ms: 3000, tone }); };
        if (id === 'ze') {
            if (armed) { say('Tá bom! Tá bom! Toma tudo!', 'shout'); g.inventory.cash += 600; if (typeof WorldMemory !== 'undefined') WorldMemory.crime('threat', P.x, P.z); r.trust = Math.min(100, r.trust + 5); this._msg(id, 'Soube que você cobrou o Carlão na marra… o dinheiro ficou contigo, né? Tudo bem, ele mereceu. Mas fica me devendo uma 😅'); }
            else { say('Tá certo, tá certo… toma, entrega pro Zé.'); g.inventory.cash += 200; r.trust = Math.min(100, r.trust + 15); this._msg(id, 'O Carlão pagou! Separei R$ 200 pra você e a gelada é por minha conta pra sempre 🍺'); }
        } else if (id === 'nena') {
            if (armed) { say('Calma, calma! Eu já tava indo embora!', 'shout'); if (typeof WorldMemory !== 'undefined') WorldMemory.crime('threat', P.x, P.z); }
            else { if (g.inventory.cash < 300) { g._flash(`Você precisa de ${brl(300)} para "molhar a mão" do fiscal`); return; } g.inventory.cash -= 300; say('Hum… tá bom. Dessa vez passa.'); }
            r.trust = Math.min(100, r.trust + 12); this._msg(id, 'Você salvou meu carrinho, meu anjo! Milho pra você agora é de graça, pra sempre 🌽');
        } else if (id === 'rosa') {
            say('Tá bom, tá bom, eu volto pra casa… não conta pra minha vó que eu bebi.');
            g.inventory.medkits = (g.inventory.medkits || 0) + 2; r.trust = Math.min(100, r.trust + 20);
            if (typeof Standing !== 'undefined') Standing.add('community', 5);
            this._msg(id, 'Meu neto chegou! Deus te abençoe, meu filho. Deixei dois remédios separados pra você. ❤️');
        }
        r.quest = 2; Q.actor.dispose(); this.quest = null; g.clearGps && g.clearGps();
        g._flash(`${D.emo} Pedido de ${D.name} resolvido`);
        if (g.achievements && g.achievements.bump) g.achievements.bump('personaQuests');
    },
    _msg(id, text) { if (typeof Phone !== 'undefined' && Phone.CONTACTS[id]) setTimeout(() => Phone._msg(id, text), 2500); },

    // Mensagens que eles mandam de vez em quando (Phone._spontaneous).
    phoneGen() {
        const ids = Object.keys(this.rel).filter((id) => this.rel[id].contact && typeof Phone !== 'undefined' && Phone.CONTACTS[id]);
        if (!ids.length) return null;
        const id = this._pick(ids), r = this.R(id);
        const T = {
            ze: ['Hoje tem jogo! A TV do bar tá ligada, aparece 📺', 'Chegou cerveja nova, vem provar!', 'O Dentinho passou aqui falando de você… cuidado.'],
            nena: ['O sol tá bom hoje, a orla tá cheia!', 'Guardei um milho pra você, passa aqui 🌽'],
            valdir: ['Domingo tem culto, irmão. Te espero.', 'Orei por você hoje, irmão 🙏'],
            jorginho: ['Chefe, a polícia tá parando carro na avenida hoje. Fica esperto.', 'Precisando esquentar placa, é comigo, chefe.'],
            rosa: ['Fiz bolo de fubá, passa aqui pra pegar um pedaço ❤️', 'Meu filho, tá se alimentando direito?'],
        }[id];
        if (r.quest === 0 && this.QUESTS[id] && !this.quest) return [id, 'Preciso de um favor seu… passa aqui quando puder. 🙏'];
        return [id, this._pick(T)];
    },

    serialize() { return { rel: this.rel, quest: this.quest ? { id: this.quest.id, x: this.quest.x, z: this.quest.z, label: this.quest.label, sub: this.quest.sub, type: this.quest.type } : null }; },
    load(s) {
        this._clearAll();
        if (typeof Phone !== 'undefined') for (const id of Object.keys(this.DEFS)) delete Phone.CONTACTS[id];
        this.rel = (s && s.rel) || {}; this.quest = s && s.quest ? Object.assign({ actor: null }, s.quest) : null;
        if (typeof Phone !== 'undefined') for (const id of Object.keys(this.rel)) if (this.rel[id].contact) { const D = this.DEFS[id]; Phone.CONTACTS[id] = { name: D.name, emo: D.emo, role: D.role, about: D.about }; Phone.trust[id] = this.rel[id].trust; }
        this._pois = false;
    },
    // Marcadores dos já conhecidos (depois de achar os lugares).
    _restorePois() { if (this._pois || !this.anchors) return; this._pois = true; for (const id of Object.keys(this.rel)) if (this.rel[id].talks) this._poi(id, true); },
};
