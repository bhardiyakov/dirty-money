// ============================================================================
// Pickups — itens no chão que o jogador coleta andando por cima (espalhados pelo mapa ou dropados por quem morre).
// Cada item é um ÍCONE em pixel art (ItemSprites) deitado no chão, balançando de leve, com um brilho borrado e
// pulsante na cor do tipo — o mesmo brilho suave das luzes (GlowBatch). Os espalhados reaparecem em outro lugar
// depois de coletados; os drops somem sozinhos.
//   consumíveis: kit médico, água, alimento, loot box | armas: pistola, revólver, SMG, fuzil, AK-47, escopeta, faca,
//   taco + munição | dinheiro e jóias (viram $) | utilitários: celulares, galão, mochila, módulo de hackeio, chave.
// ============================================================================

class Pickups {
    static get TYPES() {
        const W = [0.3, 0.6, 1.0], AM = [0.3, 1.0, 0.4], GOLD = [1.0, 0.85, 0.2], GEM = [0.5, 0.92, 1.0], UT = [0.78, 0.84, 1.0];
        return {
            // ---- consumíveis
            medkit:   { label: 'Kit médico', color: [1.0, 0.28, 0.28], kind: 'medkit' },
            water:    { label: 'Água', color: [0.3, 0.65, 1.0], kind: 'heal', hp: 12, item: 'water' },
            food:     { label: 'Alimento', color: [1.0, 0.6, 0.2], kind: 'heal', hp: 28, item: 'food' },
            lootbox:  { label: 'Loot box', color: [0.78, 0.42, 1.0], kind: 'lootbox' },
            vest:     { label: 'Colete nível 1', color: [0.45, 0.65, 1.0], kind: 'vest', max: 50 },
            vest2:    { label: 'Colete nível 2', color: [0.55, 0.75, 1.0], kind: 'vest', max: 100 },
            // ---- armas
            pistol:   { label: 'Pistola', color: W, kind: 'weapon', weapon: 'pistol', ammo: 24 },
            revolver: { label: 'Revólver', color: W, kind: 'weapon', weapon: 'revolver', ammo: 18 },
            smg:      { label: 'Submetralhadora', color: W, kind: 'weapon', weapon: 'smg', ammo: 60 },
            rifle:    { label: 'Fuzil', color: W, kind: 'weapon', weapon: 'rifle', ammo: 60 },
            ak47:     { label: 'AK-47', color: W, kind: 'weapon', weapon: 'ak47', ammo: 60 },
            shotgun:  { label: 'Escopeta', color: W, kind: 'weapon', weapon: 'shotgun', ammo: 18 },
            knife:    { label: 'Faca', color: W, kind: 'weapon', weapon: 'knife', ammo: 0 },
            bat:      { label: 'Taco de beisebol', color: W, kind: 'weapon', weapon: 'bat', ammo: 0 },
            // ---- munição
            ammo_pistol:  { label: 'Munição de pistola/revólver', color: AM, kind: 'ammo', weapons: ['pistol', 'revolver'], n: 24 },
            ammo_rifle:   { label: 'Munição de fuzil', color: AM, kind: 'ammo', weapons: ['rifle', 'ak47'], n: 60 },
            ammo_smg:     { label: 'Munição de SMG', color: AM, kind: 'ammo', weapons: ['smg'], n: 60, sprite: 'ammo_pistol' },
            ammo_shotgun: { label: 'Cartuchos', color: AM, kind: 'ammo', weapons: ['shotgun'], n: 12, sprite: 'ammo_pistol' },
            // ---- dinheiro e jóias (valem $ na hora)
            cash:      { label: 'Dinheiro', color: GOLD, kind: 'cash', sprite: 'cash_small', min: 40, max: 160 },
            cash_bag:  { label: 'Saco de dinheiro', color: GOLD, kind: 'cash', min: 220, max: 600 },
            cash_case: { label: 'Maleta de dinheiro', color: [1.0, 0.9, 0.3], kind: 'cash', min: 900, max: 2400 },
            coins:     { label: 'Moedas de ouro', color: GOLD, kind: 'cash', min: 15, max: 60 },
            jewels:    { label: 'Pilha de jóias', color: GEM, kind: 'jewel', min: 1200, max: 2800 },
            necklace:  { label: 'Colar de ouro', color: GEM, kind: 'jewel', min: 350, max: 800 },
            rings:     { label: 'Anéis', color: GEM, kind: 'jewel', min: 300, max: 700 },
            watch:     { label: 'Relógio de luxo', color: GEM, kind: 'jewel', min: 700, max: 1500 },
            // ---- utilitários e roubos
            phone_old: { label: 'Celular velho', color: UT, kind: 'cash', min: 30, max: 90 },
            phone_new: { label: 'Celular novo', color: UT, kind: 'cash', min: 220, max: 520 },
            jerry:     { label: 'Galão de gasolina', color: [1.0, 0.4, 0.3], kind: 'cash', min: 40, max: 90 },
            backpack:  { label: 'Mochila', color: UT, kind: 'bundle' },
            hack:      { label: 'Módulo de hackeio', color: [0.3, 1.0, 0.6], kind: 'hack' },
            carkey:    { label: 'Chave de carro roubada', color: [1.0, 0.75, 0.25], kind: 'key' },
        };
    }

    constructor(scene, game) {
        this.scene = scene;
        this.game = game;
        this.items = [];
        this.time = 0;
        const N = 700;
        this.glow = new GlowBatch(scene, N, 'pickupGlow', 'glow');
        for (let i = 0; i < N; i++) this.glow.alloc();
        this._freeGlow = [];
        for (let i = N - 1; i >= 0; i--) this._freeGlow.push(i);
    }

    // Distribui itens iniciais pela cidade. PUNITIVO: quase nada no chão (o jogador começa sem nada e precisa se virar) e o que
    // existe NÃO reaparece depois de coletado.
    spawnInitial() {
        const plan = {
            knife: 1, bat: 1, ammo_pistol: 1, medkit: 1, water: 3, food: 3, lootbox: 2, cash: 4, coins: 2, phone_old: 3, hack: 1, carkey: 1,
        };
        const s = SafeHouse.spawnWorld();                                           // metade perto da safe house (favela), metade espalhada pelo mundo
        for (const [t, n] of Object.entries(plan)) for (let i = 0; i < n; i++) this.add(t, CityGrid.randomWalkablePoint(s && i % 2 ? { x: s.x, z: s.z, r: 230 } : null), { respawn: false });
    }

    // respawn: true = reaparece depois de coletado | ttl: segundos até sumir (drops).
    add(type, pos, { respawn = false, amount = 0, ttl = 0 } = {}) {
        const T = Pickups.TYPES[type];
        const mesh = ItemSprites.quad(this.scene, T.sprite || type, 2.1);
        mesh.position.set(pos.x, 0.55, pos.z);
        const item = { type, mesh, x: pos.x, z: pos.z, respawn, amount, ttl, active: true, respawnAt: 0, glow: this._freeGlow.pop(), phase: Math.random() * 6.28 };
        this.items.push(item);
        return item;
    }

    // Item que cai de um pedestre/policial morto.
    drop(type, pos, amount = 0) {
        if (this._freeGlow.length === 0) return null;
        return this.add(type, pos, { amount, ttl: 70 });
    }

    // Sorteia por pesos: [[tipo, peso], ...].
    static _roll(table) {
        let r = Math.random() * table.reduce((s, e) => s + e[1], 0);
        for (const [t, w] of table) { r -= w; if (r <= 0) return t; }
        return table[0][0];
    }

    // Drops de quem morre. who: 'civilian' | 'cop' | 'swat' | 'army'.
    //   civil: dinheiro e coisas de bolso (celular, relógio, anéis, chave...) | polícia: munição e dinheiro, e às vezes
    //   uma arma ou kit | SWAT/exército: munição de fuzil, mais dinheiro e, às vezes, o fuzil.
    dropLoot(pos, who = 'civilian') {
        const at = (dx, dz) => ({ x: pos.x + dx, z: pos.z + dz });
        if (who === 'civilian') {
            const t = Pickups._roll([['cash', 40], ['coins', 8], ['phone_old', 12], ['water', 8], ['food', 7], ['phone_new', 6],
                ['rings', 4], ['necklace', 4], ['watch', 3], ['knife', 3], ['carkey', 5]]);
            const T = Pickups.TYPES[t];
            this.drop(t, at(0, 0), t === 'cash' ? 3 + Math.floor(Math.random() * 20) : 0);
            if (T.kind === 'cash' && t !== 'cash' && Math.random() < 0.3) this.drop('cash', at(0.9, 0.4), 3 + Math.floor(Math.random() * 12));
            return;
        }
        const rich = who === 'cop' ? 1 : 2.5;
        if (Math.random() < 0.5) this.drop(who === 'cop' ? 'ammo_pistol' : 'ammo_rifle', at(0.8, 0), 0);
        this.drop('cash', at(-0.8, 0), Math.round((20 + Math.floor(Math.random() * 45)) * rich));
        if (Math.random() < (who === 'cop' ? 0.02 : 0.1)) this.drop(who === 'cop' ? 'vest' : 'vest2', at(0.9, 0.9), 0);
        if (Math.random() < 0.06) this.drop(who === 'cop' ? Pickups._roll([['revolver', 2], ['medkit', 2], ['hack', 1], ['carkey', 1]]) : (Math.random() < 0.5 ? 'rifle' : 'medkit'), at(0, 0.9), 0);
    }

    // Aplica o item ao inventário do jogador. Retorna a mensagem do que pegou.
    _apply(item) {
        const T = Pickups.TYPES[item.type], inv = this.game.inventory, pl = this.game.player;
        const eatNow = T.kind === 'heal' && pl.hp < pl.maxHp - 0.5;            // comida/água com a vida baixa: consome na hora; senão vai para a mochila
        if (!eatNow && inv.slotsNeeded(T) > inv.slotsFree()) return null;     // mochila cheia
        const money = () => item.amount || (T.min + Math.floor(Math.random() * (T.max - T.min + 1)));
        switch (T.kind) {
            case 'weapon': {
                const isNew = inv.addWeapon(T.weapon, T.ammo);
                if (!T.ammo) return isNew ? `Pegou: ${Weapons[T.weapon].name}` : `${Weapons[T.weapon].name} (você já tem)`;
                return isNew ? `Pegou: ${Weapons[T.weapon].name} (+${T.ammo} balas)` : `Munição de ${Weapons[T.weapon].name} +${T.ammo}`;
            }
            case 'ammo': {                                                    // vai para as armas da família que você tem (ou a 1ª, se nenhuma)
                const own = T.weapons.filter((w) => inv.owned(w));
                for (const w of (own.length ? own : [T.weapons[0]])) inv.addAmmo(w, T.n);
                return `${T.label} +${T.n}`;
            }
            case 'medkit': inv.medkits++; return 'Kit médico (M para usar)';
            case 'vest': pl.wearVest(T.max); return `${T.label} vestido (${Math.round(pl.armor)} de colete)`;
            case 'heal': {
                if (!eatNow) { inv[T.item]++; return `${T.label} guardado na mochila (vida cheia)`; }
                pl.hp = Math.min(pl.maxHp, pl.hp + T.hp);
                return `${T.label}: +${T.hp} de vida`;
            }
            case 'jewel': {
                const n = money();
                inv.addJewel(n);
                return `${T.label} na mochila (vale ~${brl(n)}; venda no cofre de casa)`;
            }
            case 'cash': {
                const n = money();
                inv.addCash(n);
                return T.label === 'Dinheiro' ? `Dinheiro +${brl(n)}` : `${T.label}: +${brl(n)}`;
            }
            case 'lootbox': return this._openLootBox();
            case 'bundle': {                                                   // mochila: um pouco de tudo
                const n = 80 + Math.floor(Math.random() * 220);
                inv.addCash(n); inv.medkits++;
                const guns = Object.keys(inv.weapons).filter((k) => inv.owned(k) && inv.isGun(k));
                for (const g of guns) inv.addAmmo(g, g === 'shotgun' ? 8 : (g === 'revolver' ? 12 : 30));
                return `Mochila: +${brl(n)}, kit médico${guns.length ? ' e munição' : ''}`;
            }
            case 'hack': inv.hacks++; return `Módulo de hackeio (${inv.hacks}) — abre uma fechadura sozinho (G)`;
            case 'key': inv.keys++; return `Chave de carro roubada (${inv.keys}) — destranca um carro sem alarme (F)`;
        }
        return '';
    }

    // Loot box: sorteia o conteúdo.
    _openLootBox() {
        const inv = this.game.inventory;
        const r = Pickups._roll([['cash', 34], ['ammo', 22], ['medkit', 14], ['gun', 10], ['jewel', 10], ['hack', 6], ['key', 4]]);
        switch (r) {
            case 'cash': { const n = 150 + Math.floor(Math.random() * 450); inv.addCash(n); return `Loot box: +${brl(n)}`; }
            case 'ammo': {
                const guns = Object.keys(inv.weapons).filter((k) => inv.owned(k) && inv.isGun(k));
                const g = guns[Math.floor(Math.random() * guns.length)] || 'pistol';
                inv.addAmmo(g, 24); return `Loot box: munição de ${Weapons[g].name} +24`;
            }
            case 'medkit': inv.medkits++; return 'Loot box: kit médico';
            case 'gun': {
                const g = Pickups._roll([['revolver', 3], ['smg', 3], ['shotgun', 2], ['ak47', 1]]);
                inv.addWeapon(g, 30); return `Loot box: ${Weapons[g].name} (+30 balas)`;
            }
            case 'jewel': { const n = 500 + Math.floor(Math.random() * 1200); inv.addJewel(n); return `Loot box: joias (~${brl(n)})`; }
            case 'hack': inv.hacks++; return 'Loot box: módulo de hackeio';
            default: inv.keys++; return 'Loot box: chave de carro roubada';
        }
    }

    update(dt, playerPos, onFoot) {
        this.time += dt;
        const g = this.glow;
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i];
            const T = Pickups.TYPES[it.type];

            if (!it.active) {                                     // coletado: espera para reaparecer em outro lugar
                if (it.respawn && this.time >= it.respawnAt) {
                    const p = CityGrid.randomWalkablePoint();
                    it.x = p.x; it.z = p.z; it.active = true;
                    it.mesh.setEnabled(true); it.mesh.position.set(p.x, 0.55, p.z);
                }
                continue;
            }

            if (it.ttl > 0) {                                     // drop com validade (pisca nos últimos segundos)
                it.ttl -= dt;
                if (it.ttl <= 0) { this._remove(i); continue; }
            }

            // Longe da câmera (> 110 u): sem malha, sem brilho, sem animação (o mundo tem centenas de itens).
            const fdx = playerPos.x - it.x, fdz = playerPos.z - it.z;
            if (fdx * fdx + fdz * fdz > 12100) {
                if (!it._far) { it._far = true; it.mesh.setEnabled(false); g.off(it.glow); }
                continue;
            }
            if (it._far) { it._far = false; it.mesh.setEnabled(true); }

            // Visual: o ícone balança e "respira"; o brilho borrado pulsa entre a cor do tipo e o branco.
            const s =0.5 + 0.5 * Math.sin(this.time * 3.2 + it.phase);
            it.mesh.rotation.y = Math.sin(this.time * 1.3 + it.phase) * 0.14;
            const k = 1 + 0.05 * s;
            it.mesh.scaling.set(k, 1, k);
            const blink = it.ttl > 0 && it.ttl < 8 && Math.floor(this.time * 6) % 2 === 0;
            it.mesh.setEnabled(!blink);
            const c = T.color, w = s * 0.18;
            g.place(it.glow, it.x, 1.1, it.z, 3.5 + s * 0.9);
            g.color(it.glow, c[0] + (1 - c[0]) * w, c[1] + (1 - c[1]) * w, c[2] + (1 - c[2]) * w, 0.24 + s * 0.16);

            // Coleta.
            if (onFoot && hypot(playerPos.x - it.x, playerPos.z - it.z) < 1.5) {
                const msg = this._apply(it);
                if (msg === null) {                               // mochila cheia: o item fica no chão
                    if (this.time - (this._fullAt || -9) > 2) { this._fullAt = this.time; this.game._flash(`Mochila cheia! (${T.label}) — descarte algo no inventário`); AudioFX.blip(160, 0.12, 0.18); }
                    continue;
                }
                this.game._flash(msg);
                AudioFX.blip(T.kind === 'cash' ? 1100 : 720, 0.14, 0.2);
                if (it.respawn) { it.active = false; it.respawnAt = this.time + 90; it.mesh.setEnabled(false); g.off(it.glow); }
                else this._remove(i);
            }
        }
        g.flush();
    }

    _remove(i) {
        const it = this.items[i];
        this.glow.off(it.glow);
        this._freeGlow.push(it.glow);
        it.mesh.dispose();
        this.items.splice(i, 1);
    }

    // Itens visíveis (para o GPS).
    get active() { return this.items.filter((it) => it.active); }
}
memoStatics(Pickups, 'TYPES');
