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
            grenade: { owned: false, reserve: 0 },    // arremessáveis: `reserve` = quantas unidades (Throwables)
            molotov: { owned: false, reserve: 0 },
        };
        // Arma nova cadastrada só em Weapons (combat/Combat.js) já ganha a sua vaga aqui (e aparece na aba ITENS do menu dev).
        for (const [k, W] of Object.entries(Weapons)) {
            if (this.weapons[k] || k === 'fists') continue;
            this.weapons[k] = W.gun ? { owned: false, mag: 0, reserve: 0 } : W.throwable ? { owned: false, reserve: 0 } : { owned: false };
        }
        this.hacks = 0;        // módulos de hackeio: abrem uma fechadura sozinhos (sem mini-game)
        this.keys = 0;         // chaves de carro roubadas: destrancam um carro sem barulho
        this.food = 0;         // comida e água guardadas (comem-se na mochila quando a vida não está cheia)
        this.water = 0;
        this.jewels = 0;       // peças de joalheria: valem dinheiro quando vendidas (cofre → "vender")
        this.jewelValue = 0;   // soma do valor das peças ($)
        this.gear = {};        // itens avulsos (player/Items.js): peças e ferramentas de carro, equipamento de assalto — id → quantidade
        this.bag = 'none';     // bolsa equipada (ver Bags.js): define o tamanho da grade e a carga confortável
        this.spareBags = [];   // bolsas de reserva levadas junto, vazias (trocam-se no menu; guardam-se no baú de casa)
    }

    // Texto/efeitos de comer e beber (vida recuperada).
    static get HEAL() { return { food: 28, water: 12 }; }

    // Peça de joalheria: entra com valor $.
    addJewel(value) { this.jewels++; this.jewelValue += value; }

    owned(key) { const w = this.weapons[key]; return !!(w && (this.isThrow(key) ? w.reserve > 0 : w.owned)); }
    isThrow(key) { return !!(Weapons[key] && Weapons[key].throwable); }

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
    // Dá a arma `key` de qualquer tipo (fogo: com `n` balas de reserva; arremessável: `n` unidades; corpo a corpo: só a arma).
    give(key, n) {
        if (!this.weapons[key]) return false;
        if (this.isThrow(key)) { this.weapons[key].reserve += n || 5; return true; }
        this.addWeapon(key, n == null ? 120 : n);
        return true;
    }
    addCash(n) { this.cash += n; }

    // Texto "12/36" (ou "—" para armas sem munição).
    ammoText(key) {
        return this.isGun(key) ? `${this.mag(key)}/${this.reserve(key)}` : this.isThrow(key) ? `×${this.reserve(key)}` : '∞';
    }

    // ---------------------------------------------------------------- mochila com espaços (estilo Resident Evil)
    // Grade cols×rows (depende da bolsa: bolsos 3×2 … mochila tática 6×5); cada item ocupa w×h células (armas compridas
    // ocupam mais). Dinheiro e vida não ocupam espaço.
    get cols() { return Bags.def(this).cols; }
    get rows() { return Bags.def(this).rows; }
    get capacity() { return this.cols * this.rows; }
    static get SIZES() { return { pistol: 2, pistol_sil: 2, revolver: 2, smg: 2, knife: 1, shotgun: 3, rifle: 3, ak47: 3, bat: 3, rpg: 3, launcher: 3, minigun: 3 }; }
    // Armas de fogo na ordem da mochila (e a munição de cada uma, com o nome dela).
    static get GUN_ORDER() { return ['pistol', 'pistol_sil', 'revolver', 'smg', 'shotgun', 'rifle', 'ak47', 'rpg', 'launcher', 'minigun']; }
    static get AMMO_LABEL() { return { rpg: 'Foguetes do RPG', launcher: 'Foguetes do lança-foguetes', minigun: 'Cinta da minigun' }; }
    static get STACK() { return { medkit: 3, hack: 5, key: 5, food: 4, water: 4, jewel: 4, grenade: 3, molotov: 2 }; }                // unidades por célula

    // ---------------------------------------------------------------- armas NO CORPO
    // Até BODY_SLOTS armas vão no corpo (bandoleira nas costas, cinto, coldre) e NÃO ocupam a mochila — pesam metade (Bags.BODY_KG).
    // São sempre as MAIORES que você tem (empate: a ordem da mochila): a escolha não muda ao trocar de arma, então a grade não
    // embaralha. Assim dá para andar com 3 armas (ex.: pistola, escopeta e AK) mesmo só com os bolsos.
    static get BODY_SLOTS() { return 3; }
    // Onde cada arma do corpo vai, pelo tamanho: arma longa nas costas/bandoleira, pistola e SMG no coldre/cinto, faca no cinto.
    static get BODY_PLACES() { return { 3: ['Bandoleira', 'Costas', 'Ombro'], 2: ['Coldre', 'Cinto', 'Perna'], 1: ['Cinto', 'Bota', 'Bolso'] }; }
    // Nomes dos lugares das armas `keys` (do corpo, na ordem).
    bodyPlaces(keys) {
        const used = new Set(), S = Inventory.SIZES;
        return keys.map((k) => { const L = Inventory.BODY_PLACES[Math.min(3, S[k] || 1)], n = L.find((q) => !used.has(q)) || 'No corpo'; used.add(n); return n; });
    }
    // Armas que você carrega (sem punhos e arremessáveis, que vão em pilhas na mochila).
    carried() { return Object.keys(this.weapons).filter((k) => k !== 'fists' && !this.isThrow(k) && this.weapons[k].owned); }
    bodyOf(keys) {
        const S = Inventory.SIZES, order = [...Inventory.GUN_ORDER, 'bat', 'knife'], ix = (k) => { const i = order.indexOf(k); return i < 0 ? 99 : i; };
        return keys.slice().sort((a, b) => (S[b] || 1) - (S[a] || 1) || ix(a) - ix(b)).slice(0, Inventory.BODY_SLOTS);
    }
    body() { return this.bodyOf(this.carried()); }
    // Células da grade que as armas `keys` ocupariam (as do corpo não contam).
    _gridCells(keys) { const S = Inventory.SIZES, b = this.bodyOf(keys); return keys.reduce((s, k) => s + (b.includes(k) ? 0 : (S[k] || 1)), 0); }

    // Itens da mochila como lista de { id, kind, key, w, h, count, label }, na ordem de exibição (as armas do corpo ficam de fora).
    items() {
        const out = [], S = Inventory.SIZES, guns = Inventory.GUN_ORDER, order = [...guns, 'bat', 'knife'], body = this.body();
        for (const k of order) if (this.weapons[k].owned && !body.includes(k)) out.push({ id: 'w:' + k, kind: 'weapon', key: k, w: S[k], h: 1, count: 1, label: Weapons[k].name });
        for (const k of guns) {
            const r = this.weapons[k].reserve || 0;
            if (r > 0) out.push({ id: 'a:' + k, kind: 'ammo', key: k, w: 1, h: 1, count: r, label: Inventory.AMMO_LABEL[k] || 'Munição: ' + Weapons[k].name });
        }
        const stack = (n, per, kind, key, label) => {
            for (let i = 0; i < Math.ceil(n / per); i++) out.push({ id: `${kind}:${i}`, kind, key, w: 1, h: 1, count: Math.min(per, n - i * per), label });
        };
        stack(this.weapons.grenade.reserve || 0, Inventory.STACK.grenade, 'grenade', 'grenade', 'Granada');
        stack(this.weapons.molotov.reserve || 0, Inventory.STACK.molotov, 'molotov', 'molotov', 'Coquetel molotov');
        stack(this.medkits, Inventory.STACK.medkit, 'medkit', 'medkit', 'Kit médico');
        stack(this.hacks, Inventory.STACK.hack, 'hack', 'hack', 'Módulo de hackeio');
        stack(this.keys, Inventory.STACK.key, 'key', 'carkey', 'Chave de carro roubada');
        stack(this.food, Inventory.STACK.food, 'food', 'food', 'Comida');
        stack(this.water, Inventory.STACK.water, 'water', 'water', 'Água');
        stack(this.jewels, Inventory.STACK.jewel, 'jewel', 'jewels', 'Joias');
        if (typeof Items !== 'undefined') for (const [id, n] of Object.entries(this.gear || {})) {          // itens avulsos (Items.DEFS)
            const D = Items.def(id); if (!D || !(n > 0)) continue;
            for (let i = 0; i < Math.ceil(n / D.stack); i++) out.push({ id: `i:${id}:${i}`, kind: 'item', item: id, key: Items.key(id), w: D.w, h: 1, count: Math.min(D.stack, n - i * D.stack), label: D.name });
        }
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
                const own = this.carried();
                let n = this.weapons[T.weapon].owned ? 0 : this._gridCells(own.concat(T.weapon)) - this._gridCells(own);      // (cabe no corpo: 0)
                if (T.ammo && !(this.weapons[T.weapon].reserve > 0)) n += 1;
                return n;
            }
            case 'ammo': return T.weapons.some((w) => this.weapons[w].reserve > 0) ? 0 : 1;
            case 'throw': return (this.weapons[T.weapon].reserve || 0) % st[T.weapon] === 0 ? 1 : 0;
            case 'medkit': return this.medkits % st.medkit === 0 ? 1 : 0;
            case 'hack': return this.hacks % st.hack === 0 ? 1 : 0;
            case 'key': return this.keys % st.key === 0 ? 1 : 0;
            case 'heal': return this[T.item] % st[T.item] === 0 ? 1 : 0;           // comida/água (só guarda se a vida estiver cheia)
            case 'jewel': return this.jewels % st.jewel === 0 ? 1 : 0;
            case 'item': { const D = typeof Items !== 'undefined' && Items.def(T.id); return !D ? 0 : (((this.gear || {})[T.id] || 0) % D.stack === 0 ? D.w : 0); }
            default: return 0;
        }
    }

    // Posiciona os itens na grade (primeiro encaixe, linha a linha). Retorna os itens com { x, y } — antes deles, as armas do CORPO
    // ({ body: true, slot }, na fileira y = −1, acima da grade: as setas do menu chegam nelas subindo).
    layout() {
        const C = this.cols, R = this.rows, taken = Array.from({ length: R }, () => new Array(C).fill(false));
        const B = this.body(), names = this.bodyPlaces(B);
        const placed = B.map((k, i) => ({ id: 'w:' + k, kind: 'weapon', key: k, w: 2, h: 1, count: 1, label: Weapons[k].name, body: true, slot: names[i], x: i * 2, y: -1 }));
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
        if (typeof Items !== 'undefined') for (const id of Object.keys(this.gear || {})) if ((Items.def(id) || {}).cat === 'crime') delete this.gear[id];      // (furadeira, abraçadeiras; peças de carro ficam)
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
memoStatics(Inventory, 'HEAL', 'SIZES', 'STACK', 'GUN_ORDER', 'AMMO_LABEL', 'BODY_SLOTS', 'BODY_PLACES');
