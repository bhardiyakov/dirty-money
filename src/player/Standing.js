// ============================================================================
// Standing — reputação bifurcada na favela (0..100 cada):
//   • traffic    Moral com o Tráfico: sobe comprando/vendendo na boca e pagando o tribunal; cai com lábia fracassada e confisco.
//   • community  Moral com a Comunidade: sobe gastando no comércio local; cai ao agredir, matar, assaltar ou furtar moradores.
// Oprimir moradores (community baixa) atrai a mídia e a polícia e irrita o tráfico: abaixo de `angry` cada agressão também
// derruba a moral do tráfico. Morrer (HP 0) dentro do território vai ao Tribunal do Crime (ui/TribunalUI.js, Game._startDeath).
// Só vale na favela (WorldMap.B.FAVELA). Persistido no save (SaveGame).
// ============================================================================

const Standing = {
    traffic: 50, community: 50,
    angry: 30,                          // community abaixo disso irrita o tráfico
    _toastCd: 0,

    // ---- território: a MANCHA da favela (FavelaPlan.inTerritory — contorno irregular, não um retângulo); _bounds() é a caixa dela.
    // A cidade fica a LESTE (as ruas 'fav' ligam à cidade em x≈-294): profundidade 0 na borda leste, 1 no fundo oeste.
    entranceDepth: 0.12,                // até aqui (borda leste) é a "entrada": a polícia ainda pode ficar
    _bounds() {
        if (this._b) return this._b;
        if (typeof FavelaPlan !== 'undefined' && FavelaPlan.built) return (this._b = Object.assign({}, FavelaPlan.bounds));      // (caixa da mancha)
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const b of CityGrid.blocks) if (b.district === 'favela') { x0 = Math.min(x0, b.slab[0]); z0 = Math.min(z0, b.slab[1]); x1 = Math.max(x1, b.slab[2]); z1 = Math.max(z1, b.slab[3]); }
        return (this._b = x0 < Infinity ? { x0: x0 - 8, z0: z0 - 8, x1: x1 + 8, z1: z1 + 8 } : { x0: 0, z0: 0, x1: -1, z1: -1 });      // (+8 u: as vielas de contorno fazem parte)
    },
    inFavela(x, z) {
        const b = this._bounds();
        if (!(x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1)) return false;
        return typeof FavelaPlan === 'undefined' || !FavelaPlan.built || FavelaPlan.inTerritory(x, z);
    },
    // Distância (u) até o território (0 dentro).
    favelaDist(x, z) {
        if (typeof FavelaPlan !== 'undefined' && FavelaPlan.built) return FavelaPlan.distTo(x, z);
        const b = this._bounds(); return hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
    },
    nearFavela(x, z, m = 80) { const b = this._bounds(); return x >= b.x0 - m && x <= b.x1 + m && z >= b.z0 - m && z <= b.z1 + m; },
    // 0 na entrada (leste) → 1 no fundo da favela (oeste). Fora da favela: 0.
    depth(x, z) {
        if (!this.inFavela(x, z)) return 0;
        const b = this._bounds();
        return Math.max(0, Math.min(1, (b.x1 - x) / (b.x1 - b.x0)));
    },
    // Dentro da favela, além da entrada: sem polícia (só em operação, no futuro).
    policeBanned(x, z) { return !this.policeOp && this.inFavela(x, z) && this.depth(x, z) >= this.entranceDepth; },
    // Alvo de perseguição da polícia limitado à entrada (eles não passam dali).
    clampToEntrance(x, z) {
        const b = this._bounds(), xe = b.x1 - (b.x1 - b.x0) * (this.entranceDepth * 0.5);
        return { x: Math.max(x, xe), z };
    },
    // ---- facções por território. `resident`: o jogador mora lá (neutro). Em território de fora (futuro: N.C.P) ele é um estranho
    // e os traficantes são sempre hostis. Em território de morador, só viram hostis se a moral cair (hostile()).
    // rect(): caixa | poly(): contorno (laço [[x, z], ...]) para o mapa | inside(x, z): dentro da mancha
    territories: [{ id: 'cv', sigla: 'C.V', name: 'COMANDO VERDE', color: '#2ecc5a', rect: () => Standing._bounds(),
        poly: () => (typeof FavelaPlan !== 'undefined' && FavelaPlan.outline) || null, inside: (x, z) => Standing.inFavela(x, z) }],
    territoryAt(x, z) {
        for (const t of this.territories) if (t.inside(x, z)) return t;
        return null;
    },
    lowTraffic: 30, lowCommunity: 20,   // abaixo disso (um OU outro) o morador deixa de ser neutro
    // Quem é "morador" vem da SAFE HOUSE atual: `homeId` = id do território onde ela fica ('cv' = a casa inicial na favela; null =
    // casa no asfalto/outra região). Mudou de casa (subiu de vida, saiu da favela, foi morar em outra) → vira estranho para a
    // favela onde começou. Chame `Standing.setHome(id)` quando houver mais de uma safe house.
    homeId: 'cv',
    isResident(t) { return !!t && t.id === this.homeId; },
    setHome(id) { this.homeId = id || null; },
    hostile(t) { return !t || !this.isResident(t) || this.traffic < this.lowTraffic || this.community < this.lowCommunity; },
    alarm: 0,                           // s de alarme ligado pelos olheiros (invasão policial): fogueteiros soltam fogos, grupos marcham
    // Os moradores acobertam (comunidade ≥ 60) ou delatam (< 25) quem foge da polícia dentro da favela: muda o que ela enxerga/lembra.
    cover(x, z) {
        if (!this.inFavela(x, z)) return { sight: 1, mem: 1, state: '' };
        if (this.community >= 60) return { sight: 0.55, mem: 0.5, state: 'hide' };
        if (this.community < 25) return { sight: 1.25, mem: 1.5, state: 'snitch' };
        return { sight: 1, mem: 1, state: '' };
    },
    policeOp: false,                   // futuro: operação policial dentro da favela libera a polícia
    playerInFavela(g) { const p = g.player.position; return this.inFavela(p.x, p.z); },

    _clamp(v) { return Math.max(0, Math.min(100, v)); },
    add(which, n) { if (n > 0 && (which === 'traffic' || which === 'community') && typeof SkillTree !== 'undefined') n *= 1 + (SkillTree.m.moral || 0); this[which] = this._clamp(this[which] + n); },

    // O jogador machucou/roubou/matou um morador (weight ~ gravidade). Só conta dentro da favela.
    harm(g, weight) {
        if (!this.playerInFavela(g)) return;
        this.add('community', -weight);
        this.addHeat(weight * 3, 'violência contra moradores');
        if (this.community < this.angry) this.add('traffic', -weight * 0.5);
        if (g._flash && performance.now() - this._toastCd > 6000) { this._toastCd = performance.now(); g._flash('A comunidade não gostou disso… (moral −' + weight + ')'); }
    },

    // Pressão policial sobre a favela (0..100): ao chegar a 100 a polícia faz uma OPERAÇÃO (PoliceOperation). Sobe com crimes, polícia
    // morta, tiroteios, procurado alto dentro da favela e comunidade revoltada; cai sozinha devagar.
    heat: 0, heatWhy: '',
    missionsDone: 0,                    // missões do tráfico cumpridas (define a patente: ver player/Missions.js)
    addHeat(n, why) { if (n >= 8 || this.heat < 10 || !this.heatWhy) this.heatWhy = why; this.heat = Math.max(0, Math.min(100, this.heat + n)); },

    // Compra numa loja da favela: movimenta o comércio local (e a boca, para o tráfico).
    shopped(shop, spent) {
        if (shop.district !== 'favela') return;
        this.add('community', Math.min(3, spent / 40));
        if (shop.style === 'drugs') this.add('traffic', Math.min(4, spent / 60));
    },

    // Chance de convencer o tribunal (a "lábia" vem do respeito que você acumulou).
    labiaChance() { return Math.max(0.05, Math.min(0.85, 0.1 + 0.004 * this.traffic + 0.003 * this.community + (typeof SkillTree !== 'undefined' ? (SkillTree.m.labia || 0) : 0))); },
    // O tráfico aceita tomar tudo e liberar você?
    seizeAllowed() { return this.traffic >= 20 || this.community >= 35; },

    serialize() { return { traffic: this.traffic, community: this.community, home: this.homeId, missions: this.missionsDone }; },
    load(s) { if (!s) return; if ('home' in s) this.homeId = s.home; if (typeof s.missions === 'number') this.missionsDone = s.missions; if (typeof s.traffic === 'number') this.traffic = this._clamp(s.traffic); if (typeof s.community === 'number') this.community = this._clamp(s.community); },
};
