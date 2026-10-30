// ============================================================================
// Stands — BARRACAS FIXAS onde se compra na rua, com o cardápio e os efeitos do carrinho do ambulante (StreetLife): os QUIOSQUES do
// calçadão (Landmarks), o CAFÉ do terraço do Corcovado, a BARRACA DE CHURRASQUINHO da esplanada do Maracanã e os quiosques e ambulantes da
// orla da Lagoa (Lagoa). Comer mata a fome (Physique.eat), as
// bebidas matam a sede (Needs.drink), tudo cura um pouco; o dinheiro sai da carteira.
//   add({ id, name, emo, x, z, r, h, hours, items })   registra (quem monta o lugar); h: a altura do piso (Walkways), 0 no chão
//   near(game)                                          a barraca aberta ao alcance do jogador a pé
//   prompt(game) / interact(game)                       E perto dela: o painel de compra
//   update(game, dt)                                    (Game) o VENDEDOR (e o carrinho, se a barraca for um) aparece com a câmera perto
//   s.vendor = { x, z, h: rumo, type }, s.cart = true    quem atende (tipo do gerador, StreetLife._actor) e o carrinho com guarda-sol
// items: [id, rótulo, preço, kcal, cura, bebida?] (como StreetLife.ITEMS).
// ============================================================================

const Stands = {
    list: [],
    MENUS: {
        kiosk: [['coco', '🥥 Água de coco', 7, 0, 8, true], ['mate', '🧉 Mate com limão', 6, 60, 4, true], ['globo', '🥨 Biscoito de polvilho', 5, 180, 3],
            ['milho', '🌽 Milho cozido', 8, 280, 6], ['acai', '🍧 Açaí na tigela', 16, 420, 12], ['agua', '💧 Água mineral', 4, 0, 5, true]],
        estadio: [['espetinho', '🍢 Churrasquinho', 10, 420, 8], ['cachorro', '🌭 Cachorro-quente', 12, 450, 9], ['pipoca', '🍿 Pipoca', 6, 220, 3],
            ['refri', '🥤 Refrigerante', 6, 140, 3, true], ['agua', '💧 Água mineral', 4, 0, 5, true]],
        lagoa: [['coco', '🥥 Água de coco', 8, 0, 8, true], ['acai', '🍧 Açaí na tigela', 18, 420, 12], ['chope', '🍺 Chope', 12, 150, 2, true],
            ['sanduba', '🥪 Sanduíche natural', 16, 380, 10], ['suco', '🍹 Suco de laranja', 10, 110, 6, true], ['agua', '💧 Água mineral', 5, 0, 5, true]],
        ambulante: [['mate', '🧉 Mate com limão', 6, 60, 4, true], ['globo', '🥨 Biscoito de polvilho', 5, 180, 3], ['picole', '🍦 Picolé', 5, 120, 3],
            ['milho', '🌽 Milho cozido', 8, 280, 6], ['agua', '💧 Água mineral', 4, 0, 5, true]],
        cafe: [['cafe', '☕ Cafezinho', 5, 20, 4, true], ['paoq', '🧀 Pão de queijo', 7, 260, 6], ['sanduba', '🥪 Sanduíche natural', 14, 380, 10],
            ['suco', '🍹 Suco de laranja', 9, 110, 6, true], ['sorvete', '🍦 Sorvete', 8, 200, 4], ['agua', '💧 Água mineral', 5, 0, 5, true]],
    },
    reset() { this.list = []; },
    // Vendedores e carrinhos só existem perto da câmera (70 u); de dia ou de noite, enquanto a barraca está aberta.
    update(game, dt) {
        for (const s of this.list) if (s._on && s._on.actor) { s._on.actor.update(dt, 1); s._on.actor.mesh.position.y = s.h + 0.5; }
        this._t = (this._t || 0) - dt;
        if (this._t > 0) return;
        this._t = 0.5;
        const f = game.camera.target, hour = game.dayNight.hour;
        for (const s of this.list) {
            if (!s.vendor && !s.cart) continue;
            const want = !Interiors.active && hypot(s.x - f.x, s.z - f.z) < 70 && this.open(s, hour);
            if (want && !s._on) {
                s._on = { meshes: s.cart && typeof StreetLife !== 'undefined' ? StreetLife._cart(game, s.x, s.z) : [] };
                const v = s.vendor;
                if (v && typeof StreetLife !== 'undefined') { const a = s._on.actor = StreetLife._actor(game, v.type || 'civil_ambulante', v.x, v.z, v.h || 0); a.mesh.position.y = s.h + 0.5; }
            } else if (!want && s._on) {
                for (const m of s._on.meshes) m.dispose();
                if (s._on.actor) s._on.actor.dispose();
                s._on = null;
            }
        }
    },
    add(s) { this.list.push(Object.assign({ r: 3, h: 0, hours: [8, 22], emo: '🛒' }, s)); return s; },
    open(s, hour) { const [a, b] = s.hours; return a < b ? hour >= a && hour < b : hour >= a || hour < b; },

    near(game) {
        if (game.mode !== 'player' || Interiors.active) return null;
        const p = game.player.position, lv = game.player.onDeck ? game.player.deckH || 0 : 0;
        let best = null, bd = 1e9;
        for (const s of this.list) {
            const d = hypot(s.x - p.x, s.z - p.z);
            if (d < s.r && d < bd && Math.abs(lv - s.h) < 1.5) { bd = d; best = s; }
        }
        return best;
    },
    prompt(game) {
        const s = this.near(game);
        if (!s) return '';
        if (!this.open(s, game.dayNight.hour)) return `<b>FECHADO</b><small>${s.name} — abre às ${s.hours[0]}h</small>`;
        return `<b>E</b> ${s.emo} ${s.name}<small>${s.items.slice(0, 4).map((i) => i[1].replace(/^\S+\s/, '').toLowerCase()).join(', ')}…</small>`;
    },
    interact(game) {
        const s = this.near(game);
        if (!s) return false;
        if (!this.open(s, game.dayNight.hour)) { game._flash(`${s.name}: fechado — abre às ${s.hours[0]}h`); return true; }
        this._cur = s;
        if (!this._p) this._p = new Panel('standMenu', { width: 460, onAct: (a, arg) => this.buy(game, arg) });
        this._p.show(`${s.emo} ${s.name}`, s.sub || 'O que vai ser, freguês?', s.items.map(([id, label, price]) => Panel.btn('buy', `${label} — ${brl(price)}`, { arg: id, on: game.inventory.cash >= price })).join(' '));
        return true;
    },
    buy(game, id) {
        const s = this._cur, it = s && s.items.find((q) => q[0] === id);
        if (!it) return false;
        const [, label, price, kcal, heal, drink] = it, inv = game.inventory, pl = game.player;
        if (inv.cash < price) { if (this._p) this._p.msg('Dinheiro insuficiente', false); return false; }
        inv.cash -= price;
        if (kcal && typeof Physique !== 'undefined') Physique.eat(kcal);
        if (drink && typeof Needs !== 'undefined') Needs.drink(25);
        pl.hp = Math.min(pl.maxHp, pl.hp + heal);
        if (this._p) this._p.msg(`${label}: bom demais! (−${brl(price)})`);
        if (typeof AudioFX !== 'undefined') AudioFX.blip(880, 0.06, 0.08);
        return true;
    },
};
