// ============================================================================
// Aid — AJUDAR MORADORES da favela (sobe a moral da Comunidade). Desarmado, perto de um morador: E dá um item da mochila
// (kit médico > comida > água). Cada morador só é ajudado uma vez; os ganhos caem depois de 6 ajudas no mesmo dia.
// Ajudar é o oposto de assaltar: os dois usam o E, então o prompt de ajuda tem prioridade quando você está sem arma na mão.
// ============================================================================

const Aid = {
    day: -1, count: 0,
    GAIN: { medkit: 4, food: 3, water: 2 },

    _reset() { if (this.day !== Economy.day) { this.day = Economy.day; this.count = 0; } },

    // Morador ao alcance que ainda não foi ajudado (só na favela, só desarmado).
    target(g) {
        if (g.mode !== 'player' || g.player.weapon !== 'none' || g.player.busy || g.holdup || !g.npcManager) return null;
        const p = g.player.position;
        if (!Standing.inFavela(p.x, p.z)) return null;
        const n = g.npcManager.nearestTarget(p, 2.4, (q) => !q.aided && !q.surrendered && !q.fleeing && q.state !== 'HURT');
        return n || null;
    },

    // O item que dá para entregar agora, ou null.
    item(g) {
        const inv = g.inventory;
        if (inv.medkits > 0) return 'medkit';
        if (inv.food > 0) return 'food';
        if (inv.water > 0) return 'water';
        return null;
    },

    prompt(g) {
        if (!this.target(g)) return '';
        const it = this.item(g);
        if (!it) return '<b>E</b> ajudar o morador<small>você não tem comida, água ou kit médico para dar</small>';
        return `<b>E</b> dar ${{ medkit: 'um kit médico', food: 'comida', water: 'água' }[it]} ao morador<small>sobe a moral com a comunidade</small>`;
    },

    interact(g) {
        const n = this.target(g);
        if (!n) return false;
        const it = this.item(g), inv = g.inventory;
        if (!it) { g._flash('Você não tem nada para dar'); return true; }
        this._reset();
        if (it === 'medkit') inv.medkits--; else if (it === 'food') inv.food--; else inv.water--;
        n.aided = true;
        this.count++;
        const gain = this.GAIN[it] * (this.count > 6 ? 0.4 : 1);
        Standing.add('community', gain);
        g._flash(`O morador agradece (+${gain.toFixed(1).replace('.0', '')} moral com a comunidade)`);
        AudioFX.blip(880, 0.12, 0.16);
        return true;
    },
};
