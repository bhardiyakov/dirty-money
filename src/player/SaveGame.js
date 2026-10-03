// ============================================================================
// SaveGame — grava e carrega o progresso (localStorage, chave 'dm_save'; o menu principal lê a mesma chave).
// Salva ao DORMIR na cama da safe house (Game.sleep). Guarda: hora e clima, vida/colete/arma, posição, mochila e o
// que está guardado em casa (Stash). Não guarda veículos, pedestres nem a polícia (o mundo recomeça "fresco" ao carregar).
// ============================================================================

const SaveGame = {
    KEY: 'dm_save',
    VERSION: 1,

    snapshot(g) {
        const p = g.player, inv = g.inventory;
        const weapons = {};
        for (const k of Object.keys(inv.weapons)) weapons[k] = Object.assign({}, inv.weapons[k]);
        return {
            v: this.VERSION, savedAt: Date.now(),
            hour: g.dayNight.hour, weather: g.weather.state,
            player: { x: p.position.x, z: p.position.z, rot: p.root.rotation.y, hp: p.hp, armor: p.armor, armorMax: p.armorMax, weapon: p.weapon },
            inventory: { cash: inv.cash, clean: inv.clean, medkits: inv.medkits, hacks: inv.hacks, keys: inv.keys, food: inv.food, water: inv.water, jewels: inv.jewels, jewelValue: inv.jewelValue, weapons },
            stash: g.stash.serialize(), day: Economy.day, standing: Standing.serialize(), laundry: Laundry.serialize(), realestate: RealEstate.serialize(), goals: g.goals ? g.goals.serialize() : null, careers: g.careers ? g.careers.serialize() : null, skills: g.skills ? g.skills.serialize() : null, achievements: g.achievements ? g.achievements.serialize() : null, empire: g.empire ? g.empire.serialize() : null, banks: Banks.serialize(),
        };
    },

    write(g) {
        try { localStorage.setItem(this.KEY, JSON.stringify(this.snapshot(g))); return true; }
        catch (e) { console.error('[SAVE] falha ao gravar:', e); return false; }
    },

    read() {
        try { const raw = localStorage.getItem(this.KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },

    // Aplica um save no jogo recém-carregado (chamado no fim do boot).
    apply(g, s) {
        if (!s || s.v !== this.VERSION) return false;
        const p = g.player, inv = g.inventory, I = s.inventory || {};
        for (const k of ['cash', 'clean', 'medkits', 'hacks', 'keys', 'food', 'water', 'jewels', 'jewelValue']) if (typeof I[k] === 'number') inv[k] = I[k];
        for (const k of Object.keys(I.weapons || {})) if (inv.weapons[k]) Object.assign(inv.weapons[k], I.weapons[k]);
        g.stash.load(s.stash); Standing.load(s.standing); Laundry.load(s.laundry); RealEstate.load(s.realestate); if (g.goals) g.goals.load(s.goals); if (g.careers) g.careers.load(s.careers); if (g.skills) g.skills.load(s.skills); if (g.achievements) g.achievements.load(s.achievements); if (g.empire) g.empire.load(s.empire); Banks.load(s.banks); Economy.day = s.day || 0; Economy.shops = {};
        const pl = s.player || {};
        p.teleport(new BABYLON.Vector3(pl.x, 0, pl.z));
        p.root.rotation.y = pl.rot || 0;
        p.hp = Math.max(1, pl.hp || p.maxHp); p.armor = pl.armor || 0; p.armorMax = pl.armorMax || 0;
        p.weapon = inv.owned(pl.weapon) ? pl.weapon : 'none';
        g.camera.snapTo(p.position);
        if (typeof s.hour === 'number') { g.dayNight.hour = s.hour; g.dayNight.apply(); }
        if (s.weather && g.weather) g.weather.set(s.weather, true);
        return true;
    },

    // "dd/mm hh:mm" do último save (para o menu principal).
    label(s) {
        if (!s || !s.savedAt) return '';
        const d = new Date(s.savedAt), z = (n) => String(n).padStart(2, '0');
        return `${z(d.getDate())}/${z(d.getMonth() + 1)} ${z(d.getHours())}:${z(d.getMinutes())}`;
    },
};
