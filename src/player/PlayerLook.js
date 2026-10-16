// ============================================================================
// PlayerLook — o VISUAL do jogador 2,5D: a ficha (aparência + roupa do Outfit + bolsa do Bags) → que atlas a folha "hero" desenha.
//
//   • COR (camiseta azul em vez de laranja, tênis vermelho, boné preto…): só a linha 0 da paleta muda — na hora, em todas as animações.
//   • FORMA (boné, regata, bermuda, chinelo, mochila, cabelo, porte…): é outro desenho. Durante o JOGO nada é desenhado: o visual vem
//       - dos atlas PRONTOS (assets/baked, gerados no build): protagonista + protagonista_tatico + protagonista_armas = a roupa inicial;
//       - ou do aparelho (IndexedDB 'dirty-money-visual'), onde o GUARDA-ROUPA (a tela de equipamento — Wardrobe) gravou o visual
//         montado para aquela forma. Recarregou o jogo com a mesma roupa: lido de lá, sem desenhar nada de novo.
//     Forma que ainda não está no aparelho (trocou de roupa na boutique, o porte mudou com a academia…): o jogador segue com o último
//     visual que tem e um aviso pede para abrir Inventário → Equipamento, onde o Wardrobe monta o que falta.
//   • DANO (1 sujo, 2 machucado, 3 muito machucado — Blood.cond): a folha procura primeiro nos atlas de dano do nível (prontos:
//     protagonista#dN…, camadas do build; de um visual do guarda-roupa: <ck>|dN) e, para o que eles não têm, nos limpos.
//   • A folha do jogador é uma LISTA de atlas (NpcSheet.setChain): dano → principal → tático → armas → os prontos (o que um visual do
//     guarda-roupa ainda não tem, como as armas novas compradas depois, sai do desenho de sempre).
// ============================================================================

const PlayerLook = {
    game: null,
    shown: null,            // chave de forma do visual em uso
    want: null,             // chave pedida que ainda não está no aparelho (o guarda-roupa monta)
    looks: new Map(),       // chave → { main, tac, arms } (ids registrados no NpcArt) — os lidos do aparelho
    dmgIds: new Map(),      // "<chave>|d<n>" → id do atlas de dano de um visual do guarda-roupa
    LOOKS_MEM: 2,           // visuais do aparelho guardados na memória de vídeo (16 direções: ~60–80 MB cada)
    _job: 0,
    _warned: new Set(),
    HERO: ['protagonista', 'protagonista_tatico', 'protagonista_armas'],

    attach(game) {
        this.game = game; this.shown = null;
        const a = game.player && game.player.actor;
        if (a) a.onCond = () => this.sync();                                // estado de dano mudou: os atlas de dano do nível
        this.sync();
    },

    get ok() { return typeof NpcArt !== 'undefined' && NpcArt.available() && !!(this.game && this.game.sprites && this.game.sprites.npc); },
    get P() { return NpcData.player; },

    // Bolsa nas costas (Bags.look → peça do gerador) e bolsa da mão.
    BAG: { cross: 'cross', pack: 'backpack', tactical: 'tactical' },
    BAG_COLOR: { cross: 'roupa_preta', pack: 'mochila', tactical: 'oliva' },

    // Ficha completa do jogador (aparência + roupa + bolsa), sem o dano. over = { worn, bag, appearance, tint } para a prévia do "e se eu trocar?".
    spec(over = {}) {
        const s = Object.assign({}, this.P.DEFAULT, Outfit.lookSpec(over.worn, over.appearance, over.tint));
        const inv = this.game && this.game.inventory, bagId = over.bag !== undefined ? over.bag : (inv && inv.bag) || 'none';
        const D = (typeof Bags !== 'undefined' && Bags.DEFS[bagId]) || {};
        s.bag = D.look ? this.BAG[D.look] || null : null;
        if (D.look) { s.bag_color = (Outfit.tint && Outfit.tint.bag) || this.BAG_COLOR[D.look]; s.cargo_color = D.look === 'tactical' ? 'tatico' : 'alca'; }
        s.hand = D.hand || null;
        if (s.hand) s.cargo_color = s.hand === 'briefcase' ? 'cromo' : s.hand === 'suitcase' ? 'roupa_preta' : 'verde';
        return s;
    },
    // Estado de dano do jogador (Blood.cond: 0 limpo … 3 muito machucado).
    dmg() { const a = this.game && this.game.player && this.game.player.actor; return a && a.wounds ? a.wounds.cond | 0 : 0; },

    // Clipes do jogador para uma ficha (os de carregar só com bolsa na mão) e os conjuntos de um visual (atlas principal, tático e armas).
    clipsFor(s) {
        const P = this.P, out = P.CLIPS.concat(P.HEAVY);
        if (s.hand) out.push(...P.HAND);
        if (s.hand === 'suitcase') out.push(...P.PULL);
        return out;
    },
    ownsArms() { const inv = this.game && this.game.inventory; return !!inv && this.P.ARMS_LOOKS.some((w) => inv.owned(w)); },
    sets(s) { return { main: this.clipsFor(s), tac: this.P.TAC, arms: this.ownsArms() ? this.P.ARMS : null }; },

    get defaultKey() { return this._dk || (this._dk = NpcData.shapeKey(this.P.DEFAULT)); },
    isDefault(key) { return key === this.defaultKey; },
    // Resolução e direções dos visuais do guarda-roupa: as dos atlas prontos (16; perfil leve, 8) — e a chave deles no aparelho, com o
    // hash do gerador (bake.cjs): mudou o desenho no build, os visuais guardados são montados de novo.
    k() { const A = NpcArt.atlases.protagonista; return (A && A.data.k) || NpcData.HD_K; },
    dirs() { return NpcArt.lite ? 8 : 0; },
    ck(key) { return `g${NpcData.genHash}.${this.k()}.${this.dirs() || 'n'}|${key}`; },

    // Aplica o visual: cores já; forma e dano → atlas prontos ou lidos do aparelho (nada é desenhado aqui).
    sync() {
        if (!this.ok) return;
        const s = this.spec(), key = NpcData.shapeKey(s), lvl = this.dmg(), job = ++this._job;
        NpcArt.setPlayerColors(s);
        this._resolve(s, key, lvl, job).catch((e) => console.warn('[VISUAL]', e));
    },
    async _resolve(s, key, lvl, job) {
        let look = this.isDefault(key) ? 'default' : this.looks.get(key) || (await this._load(key));
        if (job !== this._job) return;
        if (look) { this.want = null; this._warned.delete(key); }
        else {                                                               // não está no aparelho: segue com o que tem; o guarda-roupa monta
            this.want = key;
            if (typeof Wardrobe !== 'undefined' && Wardrobe.active) Wardrobe.ensure(key, s);
            else this._warn(key);
            const cur = this.shown && !this.isDefault(this.shown) && this.looks.get(this.shown);
            look = cur || 'default';
            key = cur ? this.shown : this.defaultKey;
        }
        if (look !== 'default' && typeof Wardrobe !== 'undefined' && Wardrobe.active && !this.want) Wardrobe.ensure(key, s);     // (faltando só armas ou machucados)
        const dmg = lvl ? await this._dmgAtlases(key, lvl, look) : [];
        if (job !== this._job) return;
        this._apply(key, look, dmg);
    },
    // Aviso (uma vez por forma): o visual novo se monta na tela de equipamento.
    _warn(key) {
        if (this._warned.has(key)) return;
        this._warned.add(key);
        const ui = this.game && this.game.ui;
        if (ui && ui.toast) ui.toast('Visual novo: abra Inventário → Equipamento para montar o personagem');
    },

    // Folha do jogador: dano → principal → tático → armas → os prontos.
    _apply(key, look, dmg) {
        const hero = this.game.sprites.sheets.hero, a = this.game.player && this.game.player.actor;
        const own = look === 'default' ? this.HERO : [look.main, look.tac, look.arms || 'protagonista_armas'];
        const chain = [...new Set([...dmg, ...own, ...this.HERO])].filter((id) => NpcArt.atlases[id]);
        const same = hero.chain && chain.length === hero.chain.length && chain.every((id, i) => id === hero.chain[i]);
        hero.pinned = [...dmg, ...own];                                      // (presos na GPU: os que ele usa; os prontos de reserva podem sair)
        this.shown = key;
        if (!same) {
            hero.setChain(chain);
            if (a && a.sheet === hero && a.clip) a.replay();               // (o mesmo clipe no atlas novo, na mesma fase: o número de quadros pode mudar)
        }
        this._sweep();
    },
    // Atlas de dano do nível: os prontos (camadas do build) para a roupa inicial e para o que cai nos prontos (armas novas); os do
    // guarda-roupa para um visual dele.
    async _dmgAtlases(key, lvl, look) {
        const out = [];
        if (look !== 'default') {
            const dk = key + '|d' + lvl;
            let id = this.dmgIds.get(dk);
            if (!id) {
                const a = await this._idbGet(this.ck(key) + '|d' + lvl);
                if (a && !this.dmgIds.get(dk)) { id = 'hero:' + (this._seq = (this._seq || 0) + 1) + ':d' + lvl; NpcArt.addAtlas(id, a); this.dmgIds.set(dk, id); }
                else id = this.dmgIds.get(dk);
            }
            if (id) out.push(id);
            if (!look.arms) out.push(NpcArt.dmgAtlas('protagonista_armas', lvl));
        } else for (const id of this.HERO) out.push(NpcArt.dmgAtlas(id, lvl));
        return out.filter(Boolean);
    },
    // Memória: no máximo LOOKS_MEM visuais do aparelho e um atlas de dano de visual do guarda-roupa fora de uso; os substituídos (saved)
    // saem assim que a folha deixa de usá-los.
    _orphans: [],
    _sweep() {
        const used = new Set(this.game.sprites.sheets.hero.atlasList());
        this._orphans = this._orphans.filter((id) => { if (used.has(id)) return true; NpcArt.dropAtlas(id); return false; });
        for (const [k, L] of this.looks) {
            if (this.looks.size <= this.LOOKS_MEM) break;
            if (k === this.shown) continue;
            this.looks.delete(k);
            for (const id of [L.main, L.tac, L.arms]) if (id && !used.has(id)) NpcArt.dropAtlas(id);
        }
        const idle = [...this.dmgIds].filter(([, id]) => !used.has(id));
        while (idle.length > 1) { const [k, id] = idle.shift(); this.dmgIds.delete(k); NpcArt.dropAtlas(id); }
    },

    // Visual `key` do aparelho (principal + tático obrigatórios; armas se houver) → registrado no NpcArt. null = não está lá.
    _load(key) {
        if (!this._loading) this._loading = new Map();
        if (this._loading.has(key)) return this._loading.get(key);
        const ck = this.ck(key), p = (async () => {
            const [main, tac, arms] = await Promise.all([this._idbGet(ck), this._idbGet(ck + '|t'), this._idbGet(ck + '|w')]);
            if (!main || !tac) return null;
            const id = 'hero:' + (this._seq = (this._seq || 0) + 1), L = { main: id, tac: id + ':t', arms: arms ? id + ':w' : null };
            NpcArt.addAtlas(L.main, main); NpcArt.addAtlas(L.tac, tac);
            if (arms) NpcArt.addAtlas(L.arms, arms);
            this.looks.set(key, L);
            return L;
        })().finally(() => this._loading.delete(key));
        this._loading.set(key, p);
        return p;
    },
    // O guarda-roupa gravou parte do visual `key` (keys = os registros gravados: <ck> e <ck>|t = o visual limpo, |w as armas, |dN um nível
    // de dano): o que estava na memória daquilo sai (o em uso, quando a folha trocar — _sweep) e é lido de novo.
    saved(key, keys = []) {
        const ck = this.ck(key), L = this.looks.get(key);
        if (L && keys.some((k) => k === ck || k === ck + '|t' || k === ck + '|w')) { this.looks.delete(key); this._orphans.push(...[L.main, L.tac, L.arms].filter(Boolean)); }
        for (const k of keys) {
            const m = /\|d(\d)$/.exec(k), dk = m && key + '|d' + m[1], id = dk && this.dmgIds.get(dk);
            if (id) { this.dmgIds.delete(dk); this._orphans.push(id); }
        }
        this.sync();
    },
    // Arma nova (game.equip): se o visual do guarda-roupa ainda não tem as armas novas, o desenho delas sai do visual de sempre até a
    // próxima visita à tela de equipamento.
    wantArms() { if (typeof Wardrobe !== 'undefined' && Wardrobe.active) this.sync(); },

    // Direções da prévia da tela de equipamento (as do atlas do jogador: 16; perfil leve, 8).
    previewDirs() {
        const A = typeof NpcArt !== 'undefined' && NpcArt.atlases.protagonista, c = A && A.data.clips['idle:none'];
        return Math.min(typeof NpcArt !== 'undefined' ? NpcArt.dirs : 16, (c && c.dirs) || 8);
    },

    // ------------------------------------------------------------------ IndexedDB (só leitura aqui: quem grava é o Worker do guarda-roupa)
    DB: 'dirty-money-visual', DB_VER: 2,
    _db() {
        if (this._dbp) return this._dbp;
        return (this._dbp = new Promise((ok) => {
            try {
                const r = indexedDB.open(this.DB, this.DB_VER);
                r.onupgradeneeded = () => { const d = r.result; if (d.objectStoreNames.contains('atlas')) r.transaction.objectStore('atlas').clear(); else d.createObjectStore('atlas'); };     // (v1: os visuais gerados no jogo, de antes)
                r.onsuccess = () => ok(r.result);
                r.onerror = () => ok(null);
                r.onblocked = () => ok(null);
            } catch (e) { ok(null); }
        }));
    },
    async _idbRaw(k, count = false) {
        const db = await this._db();
        if (!db) return null;
        return new Promise((ok) => {
            try { const st = db.transaction('atlas').objectStore('atlas'), q = count ? st.count(k) : st.get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }
            catch (e) { ok(null); }
        });
    },
    async _idbGet(k) {
        const v = await this._idbRaw(k);
        try { return v ? await NpcArt.unzip(v) : null; } catch (e) { return null; }
    },
    async idbHas(keys) { const out = {}; for (const k of keys) out[k] = !!(await this._idbRaw(k, true)); return out; },
};
