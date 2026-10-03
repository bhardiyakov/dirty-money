// ============================================================================
// Achievements — CONQUISTAS e a PLATINA (sub-aba CONQUISTAS da aba CARREIRAS). Cada conquista é lida do estado do jogo (patentes,
// maestria, nível, dinheiro, árvore…) ou de contadores próprios (furtos, carros desmanchados, assaltos, golpes, fugas de 5★…).
// A PLATINA exige TODAS — inclusive nível 100, maestria 10 em todas as carreiras, a árvore inteira e Prestígio 10: é para ser longa.
// Salvo no save (SaveGame): conquistas desbloqueadas + contadores.
// ============================================================================

class Achievements {
    constructor(game) {
        this.g = game;
        this.done = {};
        this.stats = {};
        this._t = 1;
    }

    bump(key, n = 1) { this.stats[key] = (this.stats[key] || 0) + n; this._t = Math.min(this._t, 0.2); }
    stat(key) { return this.stats[key] || 0; }

    // [id, grupo, nome, descrição, () => [atual, alvo]]
    list() {
        const g = this.g, C = g.careers, S = g.skills, inv = g.inventory, st = (k) => this.stat(k);
        const worth = () => inv.cash + inv.clean + (inv.jewelValue || 0);
        const career = (id) => C.by[id];
        const out = [
            ['first', 'COMEÇO', 'Primeiro trampo', 'Conclua 1 trabalho de carreira', () => [C.jobsDone, 1]],
            ['thief', 'COMEÇO', 'Mão leve', 'Furte 25 pedestres', () => [st('thefts'), 25]],
            ['escape10', 'COMEÇO', 'Liso', 'Despiste a polícia 10 vezes', () => [g.goals ? g.goals.escapes : 0, 10]],
            ['escape5', 'COMEÇO', 'Inimigo do Estado', 'Despiste a polícia com 5 estrelas', () => [st('escape5'), 1]],
            ['lv10', 'PERSONAGEM', 'Nome na rua', 'Chegue ao nível 10', () => [S.level, 10]],
            ['lv25', 'PERSONAGEM', 'Procurado na cidade', 'Chegue ao nível 25', () => [S.level, 25]],
            ['lv50', 'PERSONAGEM', 'Inimigo público', 'Chegue ao nível 50', () => [S.level, 50]],
            ['lv100', 'PERSONAGEM', 'Mito', 'Chegue ao nível 100', () => [S.level, 100]],
            ['tree', 'PERSONAGEM', 'Completo', 'Compre todos os graus da árvore de habilidades', () => [S.ranksOwned, S.ranksTotal]],
            ['prestige', 'PERSONAGEM', 'Prestígio 10', 'Chegue a Prestígio 10', () => [S.prestige, 10]],
        ];
        for (const c of C.list) {
            out.push([`top_${c.id}`, c.name, `${c.ranks[c.ranks.length - 1].name}`, `Chegue à última patente de ${c.name}`, () => [c.rank, c.ranks.length - 1]]);
            out.push([`jobs_${c.id}`, c.name, `Veterano · ${c.name}`, `Conclua 50 trabalhos de ${c.name}`, () => [C.jobsBy[c.id] || 0, 50]]);
            out.push([`mast_${c.id}`, c.name, `Mestre · ${c.name}`, `Maestria 10 em ${c.name}`, () => [c.mastery, 10]]);
        }
        out.push(
            ['scrap100', 'DESMANCHE', 'Ferro-velho', 'Desmanche 100 carros no desmanche', () => [st('scrapped'), 100]],
            ['fullmod', 'DESMANCHE', 'Carro de fuga', 'Tenha um carro com motor, blindagem e fundo falso', () => [st('fullmod'), 1]],
            ['lux25', 'DESMANCHE', 'Encomenda especial', 'Entregue 25 encomendas de luxo', () => [C.jobTypes.order || 0, 25]],
            ['heistclean', 'LADRÃO', 'Trabalho limpo', 'Grande assalto com energia cortada e vigia comprado', () => [st('heistClean'), 1]],
            ['heist10', 'LADRÃO', 'Assaltante de banco', 'Conclua 10 grandes assaltos', () => [C.jobTypes.heist || 0, 10]],
            ['guns100', 'ARMEIRO', 'Mercador da morte', 'Venda 100 armas fabricadas', () => [st('gunsSold'), 100]],
            ['bothsides', 'ARMEIRO', 'Dos dois lados', 'Feche contrato com o C.V e com a milícia', () => [Math.min(1, C.jobTypes.cv || 0) + Math.min(1, C.jobTypes.mil || 0), 2]],
            ['scam200', 'ESTELIONATO', 'Golpista profissional', 'Aplique 200 golpes', () => [st('scams'), 200]],
            ['raid', 'ESTELIONATO', 'Queima de provas', 'Destrua os HDs a tempo numa batida', () => [st('raidWon'), 1]],
            ['pts30', 'JOGO DO BICHO', 'Dono da cidade', 'Tenha 30 pontos de bicho', () => [career('bicho').totalPts(), 30]],
            ['parade7', 'JOGO DO BICHO', 'Rei do carnaval', 'Faça 7 desfiles campeões', () => [st('parades'), 7]],
            ['gerente', 'MORRO', 'Gerente de frente', 'Chegue a Gerente de Frente no tráfico', () => [Missions.rank, 2]],
            ['missions50', 'MORRO', 'Cria do morro', 'Conclua 50 missões do tráfico', () => [Standing.missionsDone || 0, 50]],
            ['worth1m', 'IMPÉRIO', 'Milionário', 'Tenha R$ 1 milhão de patrimônio', () => [Math.floor(worth()), 1000000]],
            ['worth10m', 'IMPÉRIO', 'Bilionário do crime', 'Tenha R$ 10 milhões de patrimônio', () => [Math.floor(worth()), 10000000]],
            ['laundry1m', 'IMPÉRIO', 'Lavanderia', 'Lave R$ 1 milhão nas fachadas', () => [Math.floor(Laundry.xp), 1000000]],
            ['estate10', 'IMPÉRIO', 'Imobiliária', 'Tenha 10 imóveis', () => [Object.keys(RealEstate.owned).length, 10]],
            ['district1', 'IMPÉRIO', 'Bandeira fincada', 'Domine um distrito inteiro', () => [g.empire ? g.empire.dominion.count : 0, 1]],
            ['city', 'IMPÉRIO', 'Dono da cidade', 'Domine todos os distritos', () => [g.empire ? g.empire.dominion.count : 0, g.empire ? g.empire.dominion.districts.length : 7]],
            ['crew12', 'IMPÉRIO', 'Exército particular', 'Tenha 12 soldados', () => [g.empire ? g.empire.biz.soldiers.length : 0, 12]],
        );
        return out;
    }

    get platinum() { return !!this.done.platinum; }

    check() {
        const L = this.list();
        let all = true;
        for (const [id, , name, , fn] of L) {
            if (this.done[id]) continue;
            let v; try { v = fn(); } catch (e) { v = [0, 1]; }
            if (v[0] >= v[1]) { this.done[id] = Date.now(); this._unlock(name); } else all = false;
        }
        if (all && !this.done.platinum) {
            this.done.platinum = Date.now();
            this.g._flash('🏆🏆🏆 PLATINA! Você completou TODAS as conquistas — o crime da cidade tem um nome: o seu');
            AudioFX.blip(1400, 0.6, 0.3);
        }
    }

    _unlock(name) {
        this.g._flash(`🏅 CONQUISTA: ${name}`);
        AudioFX.blip(1250, 0.2, 0.22);
        if (this.g.skills) this.g.skills.addXp(150);
    }

    update(dt) { this._t -= dt; if (this._t > 0) return; this._t = 2; this.check(); }

    serialize() { return { done: this.done, stats: this.stats }; }
    load(s) { if (!s) return; this.done = s.done || {}; this.stats = s.stats || {}; }
}
