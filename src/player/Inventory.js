// ============================================================================
// Inventory — o que o jogador carrega: dinheiro, armas (com carregador e munição
// reserva) e kits médicos. Começa com punhos, taco e uma pistola; SMG e escopeta
// precisam ser encontradas (caixas pelo mapa ou drops).
// ============================================================================

class Inventory {
    constructor() {
        this.cash = 0;                // começa sem nada: sem dinheiro, sem armas, sem kits (dinheiro SUJO)
        this.clean = 0;               // dinheiro LIMPO (lavado nas fachadas; ver economy/Laundry.js)
        this.medkits = 0;
        this.weapons = {
            fists:   { owned: true },
            bat:     { owned: false },
            pistol:  { owned: false, mag: 0,  reserve: 0 },
            smg:     { owned: false, mag: 0,  reserve: 0 },
            shotgun: { owned: false, mag: 0,  reserve: 0 },
            revolver: { owned: false, mag: 0, reserve: 0 },
            ak47:    { owned: false, mag: 0,  reserve: 0 },
            rifle:   { owned: false, mag: 0,  reserve: 0 },
            knife:   { owned: false },
        };
        this.hacks = 0;        // módulos de hackeio: abrem uma fechadura sozinhos (sem mini-game)
        this.keys = 0;         // chaves de carro roubadas: destrancam um carro sem barulho
        this.food = 0;         // comida e água guardadas (comem-se na mochila quando a vida não está cheia)
        this.water = 0;
        this.jewels = 0;       // peças de joalheria: valem dinheiro quando vendidas (cofre → "vender")
        this.jewelValue = 0;   // soma do valor das peças ($)
        this.bag = 'none';     // bolsa equipada (ver Bags.js): define o tamanho da grade e a carga confortável
        this.spareBags = [];   // bolsas de reserva levadas junto, vazias (trocam-se no menu; guardam-se no baú de casa)
    }

    // Texto/efeitos de comer e beber (vida recuperada).
    static get HEAL() { return { food: 28, water: 12 }; }

    // Peça de joalheria: entra com valor $.
    addJewel(value) { this.jewels++; this.jewelValue += value; }

    owned(key) { return !!(this.weapons[key] && this.weapons[key].owned); }

    // Armas de fogo (as que usam munição).
    isGun(key) { return !!(Weapons[key] && Weapons[key].gun); }

    mag(key) { return this.weapons[key].mag || 0; }
    // Capacidade do carregador (pente estendido do Armeiro: +50%, ver careers/CareerGunsmith.js → magBonus).
    magOf(key) { return Math.round(Weapons[key].mag * (this.magBonus && this.magBonus[key] ? 1.5 : 1)); }
    reserve(key) { return this.weapons[key].reserve || 0; }
    canFire(key) { return this.isGun(key) && this.mag(key) > 0; }
    canReload(key) {
        return this.isGun(key) && this.mag(key) < this.magOf(key) && this.reserve(key) > 0;
    }

    consume(key) { this.weapons[key].mag--; }

    // Passa munição da reserva para o carregador. Retorna quantas balas entraram.
    reload(key) {
        const w = this.weapons[key], need = this.magOf(key) - w.mag, n = Math.min(need, w.reserve);
        w.mag += n; w.reserve -= n;
        return n;
    }

    // Encontrou uma arma: passa a ser dono e ganha carregador cheio (+ reserva).
    addWeapon(key, reserve) {
        const w = this.weapons[key];
        const had = w.owned;
        w.owned = true;
        if (this.isGun(key)) { w.mag = Math.max(w.mag, this.magOf(key)); w.reserve += reserve; }
        return !had;
    }

    addAmmo(key, n) { this.weapons[key].reserve += n; }
    addCash(n) { this.cash += n; }

    // Texto "12/36" (ou "—" para armas sem munição).
    ammoText(key) {
        return this.isGun(key) ? `${this.mag(key)}/${this.reserve(key)}` : '∞';
    }

    // ---------------------------------------------------------------- mochila com espaços (estilo Resident Evil)
    // Grade cols×rows (depende da bolsa: bolsos 3×2 … mochila tática 6×5); cada item ocupa w×h células (armas compridas
    // ocupam mais). Dinheiro e vida não ocupam espaço.
    get cols() { return Bags.def(this).cols; }
    get rows() { return Bags.def(this).rows; }
    get capacity() { return this.cols * this.rows; }
    static get SIZES() { return { pistol: 2, revolver: 2, smg: 2, knife: 1, shotgun: 3, rifle: 3, ak47: 3, bat: 3 }; }
    static get STACK() { return { medkit: 3, hack: 5, key: 5, food: 4, water: 4, jewel: 4 }; }                // unidades por célula

    // Itens da mochila como lista de { id, kind, key, w, h, count, label }, na ordem de exibição.
    items() {
        const out = [], S = Inventory.SIZES, order = ['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'ak47', 'bat', 'knife'];
        for (const k of order) if (this.weapons[k].owned) out.push({ id: 'w:' + k, kind: 'weapon', key: k, w: S[k], h: 1, count: 1, label: Weapons[k].name });
        for (const k of ['pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'ak47']) {
            const r = this.weapons[k].reserve || 0;
            if (r > 0) out.push({ id: 'a:' + k, kind: 'ammo', key: k, w: 1, h: 1, count: r, label: 'Munição: ' + Weapons[k].name });
        }
        const stack = (n, per, kind, key, label) => {
            for (let i = 0; i < Math.ceil(n / per); i++) out.push({ id: `${kind}:${i}`, kind, key, w: 1, h: 1, count: Math.min(per, n - i * per), label });
        };
        stack(this.medkits, Inventory.STACK.medkit, 'medkit', 'medkit', 'Kit médico');
        stack(this.hacks, Inventory.STACK.hack, 'hack', 'hack', 'Módulo de hackeio');
        stack(this.keys, Inventory.STACK.key, 'key', 'carkey', 'Chave de carro roubada');
        stack(this.food, Inventory.STACK.food, 'food', 'food', 'Comida');
        stack(this.water, Inventory.STACK.water, 'water', 'water', 'Água');
        stack(this.jewels, Inventory.STACK.jewel, 'jewel', 'jewels', 'Joias');
        return out;
    }

    // Células ocupadas / livres.
    slotsUsed() { return this.items().reduce((s, it) => s + it.w * it.h, 0); }
    slotsFree() { return this.capacity - this.slotsUsed(); }

    // Células extras que `Pickups` precisaria para guardar este tipo de item (0 se já cabe numa pilha existente).
    slotsNeeded(T) {
        const S = Inventory.SIZES, st = Inventory.STACK;
        switch (T.kind) {
            case 'weapon': {
                let n = this.weapons[T.weapon].owned ? 0 : S[T.weapon];
                if (T.ammo && !(this.weapons[T.weapon].reserve > 0)) n += 1;
                return n;
            }
            case 'ammo': return T.weapons.some((w) => this.weapons[w].reserve > 0) ? 0 : 1;
            case 'medkit': return this.medkits % st.medkit === 0 ? 1 : 0;
            case 'hack': return this.hacks % st.hack === 0 ? 1 : 0;
            case 'key': return this.keys % st.key === 0 ? 1 : 0;
            case 'heal': return this[T.item] % st[T.item] === 0 ? 1 : 0;           // comida/água (só guarda se a vida estiver cheia)
            case 'jewel': return this.jewels % st.jewel === 0 ? 1 : 0;
            default: return 0;
        }
    }

    // Posiciona os itens na grade (primeiro encaixe, linha a linha). Retorna os itens com { x, y }.
    layout() {
        const C = this.cols, R = this.rows, taken = Array.from({ length: R }, () => new Array(C).fill(false));
        const placed = [];
        for (const it of this.items()) {
            let ok = false;
            for (let y = 0; y < R && !ok; y++) for (let x = 0; x + it.w <= C && !ok; x++) {
                let free = true;
                for (let i = 0; i < it.w; i++) if (taken[y][x + i]) free = false;
                if (!free) continue;
                for (let i = 0; i < it.w; i++) taken[y][x + i] = true;
                placed.push(Object.assign({}, it, { x, y })); ok = true;
            }
        }
        return placed;
    }

    // Tem alguma arma além dos punhos?
    get armed() { return Object.keys(this.weapons).some((k) => k !== 'fists' && this.weapons[k].owned); }

    // Preso: a polícia confisca TODAS as armas (e a munição). Só restam os punhos.
    confiscate() {
        for (const k of Object.keys(this.weapons)) {
            if (k === 'fists') continue;
            const w = this.weapons[k];
            w.owned = false; w.mag = 0; w.reserve = 0;
        }
        this.hacks = 0; this.keys = 0; this.jewels = 0; this.jewelValue = 0;      // a polícia também leva os itens de crime e as joias
    }

    // Morreu: acorda no hospital sem os suprimentos (kits, comida, água, joias) e com metade da munição.
    ravage() {
        this.medkits = 0; this.food = 0; this.water = 0; this.jewels = 0; this.jewelValue = 0;
        for (const w of Object.values(this.weapons)) if (w.reserve) w.reserve = Math.floor(w.reserve / 2);
    }

    // Perde uma fração do dinheiro (prisão / hospital). Retorna quanto perdeu.
    fine(fraction) {
        const lost = Math.floor(this.cash * fraction);
        this.cash -= lost;
        return lost;
    }
}
memoStatics(Inventory, 'HEAL', 'SIZES', 'STACK');
