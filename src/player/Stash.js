// ============================================================================
// Stash — o que fica guardado em casa: GELADEIRA (comida e água), COFRE (dinheiro e joias) e BAÚ (qualquer coisa).
// Os dados são só contagens por item; a interface é StashUI. Entra no save (SaveGame).
//   ids de item: cash | jewels | food | water | medkit | hack | key | ammo:<arma> | weapon:<arma> | bag:<bolsa> (Bags.DEFS; só no baú)
// Move itens entre a mochila (Inventory, com espaços limitados) e a caixa. Armas guardam o carregador/reserva delas (wstate).
// ============================================================================

class Stash {
    static get BOXES() {
        const food = (id) => id === 'food' || id === 'water', money = (id) => id === 'cash' || id === 'jewels';
        return {
            fridge: { title: 'GELADEIRA', hint: 'comida e água', ok: food },
            safe: { title: 'COFRE', hint: 'dinheiro e joias', ok: money },
            chest: { title: 'BAÚ', hint: 'qualquer coisa', ok: () => true },
            trunk: { title: 'PORTA-MALAS', hint: 'qualquer coisa — o espaço é o do carro', ok: () => true },
        };
    }
    static get GUNS() { return Inventory.GUN_ORDER; }
    static get CASH_STEP() { return 100; }
    static single(id) { return id.startsWith('weapon:') || id.startsWith('bag:'); }      // um só (sem quantidade): armas e bolsas

    constructor() {
        this.boxes = { fridge: { food: 3, water: 2 }, safe: {}, chest: {} };      // jogo novo: um pouco de comida e água na geladeira
        this.jv = 0;                  // valor $ das joias guardadas (no cofre)
        this.wstate = {};             // armas guardadas: { arma: { mag, reserve } }
    }

    // ----------------------------------------------------------- nomes
    static label(id) {
        const [k, a] = id.split(':');
        if (k === 'ammo') return Inventory.AMMO_LABEL[a] || 'Munição: ' + Weapons[a].name;
        if (k === 'weapon') return Weapons[a].name;
        if (k === 'bag') return Bags.DEFS[a].name;
        if (k === 'item') return Items.label(a);
        return { cash: 'Dinheiro', jewels: 'Joias', food: 'Comida', water: 'Água', medkit: 'Kit médico', hack: 'Módulo de hackeio', key: 'Chave de carro' }[id] || id;
    }
    static icon(id) {
        const [k, a] = id.split(':');
        if (k === 'ammo') return Weapons[a] && Weapons[a].rocket ? 'ammo_rocket' : 'ammo_pistol';
        if (k === 'weapon') return a;
        if (k === 'bag') return Bags.DEFS[a].icon;
        if (k === 'item') return Items.key(a);
        return { cash: 'cash_bag', jewels: 'jewels', food: 'food', water: 'water', medkit: 'medkit', hack: 'hack', key: 'carkey' }[id] || id;
    }

    // ----------------------------------------------------------- mochila (lado do jogador)
    invCount(game, id) {
        const inv = game.inventory, [k, a] = id.split(':');
        if (k === 'ammo') return inv.weapons[a].reserve || 0;
        if (k === 'weapon') return inv.weapons[a].owned && a !== 'fists' ? 1 : 0;
        if (k === 'bag') return Bags.has(inv, a) ? 1 : 0;
        if (k === 'item') return Items.count(inv, a);
        return { cash: inv.cash, jewels: inv.jewels, food: inv.food, water: inv.water, medkit: inv.medkits, hack: inv.hacks, key: inv.keys }[id] || 0;
    }

    // Soma n (pode ser negativo) ao item da mochila; weapon usa wstate. Valor das joias é tratado por quem chama.
    _invAdd(game, id, n) {
        const inv = game.inventory, [k, a] = id.split(':');
        if (k === 'ammo') { inv.weapons[a].reserve = Math.max(0, (inv.weapons[a].reserve || 0) + n); return; }
        if (k === 'weapon') {
            const w = inv.weapons[a];
            if (n > 0) { const s = this.wstate[a] || { mag: 0, reserve: 0 }; w.owned = true; if (Weapons[a].gun) { w.mag = s.mag; w.reserve = s.reserve; } delete this.wstate[a]; }
            else { this.wstate[a] = { mag: w.mag || 0, reserve: w.reserve || 0 }; w.owned = false; w.mag = 0; w.reserve = 0; if (game.player.weapon === a) { game.player.weapon = 'none'; game.player.aimTimer = 0; game.reloading = 0; } }
            return;
        }
        if (k === 'item') { const it = inv.gear || (inv.gear = {}); it[a] = Math.max(0, (it[a] || 0) + n); if (!it[a]) delete it[a]; return; }
        if (id === 'cash') inv.cash += n;
        else if (id === 'jewels') inv.jewels += n;
        else if (id === 'food') inv.food += n;
        else if (id === 'water') inv.water += n;
        else if (id === 'medkit') inv.medkits += n;
        else if (id === 'hack') inv.hacks += n;
        else if (id === 'key') inv.keys += n;
    }

    // ----------------------------------------------------------- listas
    // Itens que a mochila tem e a caixa aceita: [{ id, count }]
    inventoryList(game, box) {
        const B = Stash.BOXES[box], out = [], inv = game.inventory;
        const ids = ['cash', 'jewels', 'food', 'water', 'medkit', 'hack', 'key'];
        for (const g of Stash.GUNS) ids.push('weapon:' + g, 'ammo:' + g);
        ids.push('weapon:bat', 'weapon:knife');
        for (const b of Object.keys(Bags.DEFS)) if (b !== 'none') ids.push('bag:' + b);
        for (const id of Object.keys(Items.DEFS)) ids.push('item:' + id);
        for (const id of ids) {
            if (!B.ok(id)) continue;
            const c = this.invCount(game, id);
            if (c > 0) out.push({ id, count: c });
        }
        return out;
    }

    boxList(box) {
        const out = [], d = this.boxes[box];
        for (const id of Object.keys(d)) if (d[id] > 0) out.push({ id, count: d[id] });
        return out;
    }

    // ----------------------------------------------------------- transferência
    // dir 'in': mochila → caixa | 'out': caixa → mochila. n: quantidade (ou 'all'). Retorna mensagem (ou '' se nada mudou).
    move(game, box, id, dir, n) {
        const inv = game.inventory, d = this.boxes[box], cash = id === 'cash';
        const have = dir === 'in' ? this.invCount(game, id) : (d[id] || 0);
        let q = n === 'all' ? have : Math.min(have, n);
        if (q <= 0) return '';
        if (!Stash.BOXES[box].ok(id)) return 'Isso não cabe aqui';
        if (dir === 'in' && this.limit && this.limit[box]) {                   // porta-malas: espaço do carro (células, como a mochila)
            const per = Stash.cells(id, 1), free = this.limit[box] - this.used(box);
            if (per > 0) { q = Math.min(q, Math.floor(free / per + 1e-6)); if (q <= 0) return `Não cabe mais nada (${this.used(box)}/${this.limit[box]} espaços)`; }
        }
        if (id.startsWith('bag:')) {                                    // bolsa: a que está em uso só sai se o que se carrega couber nos bolsos
            const b = id.slice(4);
            if (dir === 'in') { const r = Bags.remove(game, b); if (!r.ok) return r.msg; d[id] = 1; return 'Guardou: ' + Stash.label(id); }
            if (Bags.has(inv, b)) return 'Você já está com essa bolsa';
            delete d[id];
            inv.spareBags.push(b);
            return `Pegou: ${Stash.label(id)} (de reserva — use no Inventário → Equipamento)`;
        }
        // joias levam o valor junto (média)
        let jv = 0;
        if (id === 'jewels') {
            if (dir === 'in') { jv = q === inv.jewels ? inv.jewelValue : inv.jewelValue / inv.jewels * q; }
            else { jv = q === (d.jewels || 0) ? this.jv : this.jv / d.jewels * q; }
        }
        if (dir === 'in') {
            this._invAdd(game, id, -q);
            if (id === 'jewels') { inv.jewelValue = Math.max(0, inv.jewelValue - jv); this.jv += jv; }
            d[id] = (d[id] || 0) + q;
        } else {
            this._invAdd(game, id, q);
            if (id === 'jewels') { inv.jewelValue += jv; this.jv = Math.max(0, this.jv - jv); }
            if (inv.slotsUsed() > inv.capacity) {                       // mochila cheia: desfaz
                this._invAdd(game, id, -q);
                if (id === 'jewels') { inv.jewelValue -= jv; this.jv += jv; }
                return 'Mochila cheia';
            }
            d[id] -= q; if (d[id] <= 0) delete d[id];
        }
        if (id === 'jewels' && !(d.jewels > 0)) this.jv = this.boxes.safe.jewels > 0 ? this.jv : 0;
        return (dir === 'in' ? 'Guardou ' : 'Pegou ') + (cash ? brl(q) : (q > 1 ? q + '× ' : '') + Stash.label(id));
    }

    // Espaço (células da grade) que `n` unidades do item ocupam numa caixa com limite (porta-malas). Dinheiro não ocupa.
    static cells(id, n) {
        const [k, a] = id.split(':');
        if (k === 'weapon') return (Inventory.SIZES[a] || 1) * n;
        if (k === 'ammo') return Math.ceil(n / 60);
        if (k === 'bag') return 3 * n;
        if (k === 'item') { const D = Items.def(a); return D ? D.w * n / D.stack : n; }
        if (id === 'cash') return 0;
        if (id === 'jewels') return n / 4;
        return n / 3;
    }
    used(box) { let u = 0; for (const [id, n] of Object.entries(this.boxes[box] || {})) u += Stash.cells(id, n); return Math.ceil(u - 1e-6); }

    // Vende todas as joias (mochila + cofre) por 70% do valor. Retorna o $ recebido.
    sellJewels(game) {
        const inv = game.inventory;
        const total = inv.jewelValue + this.jv;
        const gain = Math.round(total * 0.7 * (1 + (SkillTree.m.fence || 0)));
        inv.jewels = 0; inv.jewelValue = 0; this.jv = 0; delete this.boxes.safe.jewels;
        for (const b of Object.keys(this.boxes)) delete this.boxes[b].jewels;
        inv.addCash(gain);
        return gain;
    }
    jewelTotal(game) { return Math.round((game.inventory.jewelValue + this.jv) * 0.7); }
    jewelCount(game) { return game.inventory.jewels + (this.boxes.safe.jewels || 0); }

    // ----------------------------------------------------------- save
    serialize() { return { boxes: this.boxes, jv: this.jv, wstate: this.wstate }; }
    load(o) {
        if (!o) return;
        this.boxes = Object.assign({ fridge: {}, safe: {}, chest: {} }, o.boxes || {});
        this.jv = o.jv || 0; this.wstate = o.wstate || {};
    }
}
memoStatics(Stash, 'BOXES', 'GUNS');
