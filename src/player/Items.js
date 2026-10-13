// ============================================================================
// Items — itens AVULSOS da mochila (peças e ferramentas de carro, equipamento de assalto). Cada um tem tamanho na grade (w células),
// pilha por célula, peso (kg) e preço de referência. Ficam em `inventory.gear` (id → quantidade) e entram em tudo o que a mochila já
// faz: grade (Inventory.items), peso (Bags.weight), baú/porta-malas (Stash, ids 'item:<id>'), save e o painel do item (PauseMenu).
//   cat 'part'  peças: trocadas no CAPÔ pelo próprio jogador (vehicle/CarCare.js) — algumas pedem ferramenta (`needs`).
//   cat 'tool'  ferramentas: não se gastam.
//   cat 'use'   consumíveis usados perto de um carro (galão, auxiliar de partida).
//   cat 'crime' equipamento de assalto (economy/Economy.js vende na boca; crime/Robbery.js usa).
// ============================================================================

const Items = {
    DEFS: {
        bateria:     { name: 'Bateria 60 Ah', emo: '🔋', w: 1, stack: 1, kg: 14, price: 480, cat: 'part', desc: 'Troca a bateria fraca ou morta (o carro volta a pegar de primeira)' },
        pneu:        { name: 'Pneu (estepe)', emo: '🛞', w: 2, stack: 1, kg: 9, price: 380, cat: 'part', needs: 'macaco', desc: 'Troca um pneu furado ou careca — precisa do macaco' },
        pastilha:    { name: 'Pastilhas de freio', emo: '🛑', w: 1, stack: 2, kg: 1.2, price: 190, cat: 'part', needs: 'ferramentas', desc: 'Freio novo: para em metade da distância de um freio gasto' },
        oleo:        { name: 'Óleo do motor (4 L)', emo: '🛢️', w: 1, stack: 2, kg: 3.6, price: 120, cat: 'part', desc: 'Completa o óleo (não conserta vazamento: isso é na oficina)' },
        radiador:    { name: 'Radiador e mangueiras', emo: '♨️', w: 2, stack: 1, kg: 6, price: 650, cat: 'part', needs: 'ferramentas', desc: 'Arrefecimento novo: o motor para de esquentar' },
        velas:       { name: 'Kit de ignição', emo: '⚡', w: 1, stack: 3, kg: 0.8, price: 260, cat: 'part', needs: 'ferramentas', desc: 'Velas, cabos e bobina: o motor para de falhar (recupera até 85%)' },
        amortecedor: { name: 'Kit de suspensão', emo: '🔩', w: 2, stack: 1, kg: 8, price: 900, cat: 'part', needs: 'macaco', desc: 'Amortecedores e alinhamento: o carro para de puxar para o lado' },
        macaco:      { name: 'Macaco e chave de roda', emo: '🛠️', w: 2, stack: 1, kg: 4, price: 150, cat: 'tool', desc: 'Ferramenta (não se gasta): troca de pneu e de suspensão' },
        ferramentas: { name: 'Caixa de ferramentas', emo: '🧰', w: 2, stack: 1, kg: 5, price: 280, cat: 'tool', desc: 'Ferramenta (não se gasta): freio, radiador, ignição' },
        booster:     { name: 'Auxiliar de partida', emo: '🔌', w: 1, stack: 1, kg: 2, price: 320, cat: 'use', uses: 3, desc: 'Dá a partida com a bateria arriada (3 cargas) — use perto do carro' },
        galao:       { name: 'Galão de gasolina (5 L)', emo: '⛽', w: 1, stack: 2, kg: 4.2, price: 60, cat: 'use', desc: 'Põe 5 L no tanque de um carro parado — use perto dele' },
        furadeira:   { name: 'Furadeira de cofre', emo: '🪛', w: 2, stack: 1, kg: 6, price: 2600, cat: 'crime', desc: 'Abre cofre de loja em metade do tempo (sem o código do gerente)' },
        abracadeira: { name: 'Abraçadeiras plásticas', emo: '➰', w: 1, stack: 6, kg: 0.1, price: 40, cat: 'crime', desc: 'Amarra um refém (ele não foge mais) — gasta 1 por refém' },
    },

    def(id) { return this.DEFS[id] || null; },
    key(id) { return 'item_' + id; },
    label(id) { const d = this.DEFS[id]; return d ? d.name : id; },
    weight(inv) { let w = 0; for (const [id, n] of Object.entries(inv.gear || {})) w += (n || 0) * ((this.DEFS[id] && this.DEFS[id].kg) || 0); return w; },
    has(inv, id, n = 1) { return ((inv.gear && inv.gear[id]) || 0) >= n; },
    count(inv, id) { return (inv.gear && inv.gear[id]) || 0; },

    // Cabe mais 1 na mochila? (grade)
    fits(inv, id) { return inv.slotsNeeded({ kind: 'item', id }) <= inv.slotsFree(); },
    // Dá n unidades (true se coube tudo; o que não cabe não entra).
    add(inv, id, n = 1) {
        const it = inv.gear || (inv.gear = {});
        for (let i = 0; i < n; i++) { if (!this.fits(inv, id)) return false; it[id] = (it[id] || 0) + 1; }
        return true;
    },
    take(inv, id, n = 1) {
        const it = inv.gear || (inv.gear = {});
        if ((it[id] || 0) < n) return false;
        it[id] -= n; if (it[id] <= 0) delete it[id];
        return true;
    },
};

// Ícones (emoji) dos itens no inventário, no baú e nas lojas.
if (typeof Emoji !== 'undefined') for (const [id, d] of Object.entries(Items.DEFS)) Emoji.CHAR[Items.key(id)] = d.emo;

// Itens à venda: entram no catálogo das lojas como 'it_<id>' (kind 'item' — Economy.grant). Óleo e galão na conveniência; o equipamento
// de assalto (máscaras, luvas, abraçadeiras, furadeira) na boca de fumo. As peças maiores e as ferramentas, nas oficinas (economy/Mechanic.js).
if (typeof Economy !== 'undefined') {
    for (const [id, d] of Object.entries(Items.DEFS)) Economy.ITEMS['it_' + id] = { name: d.name, icon: Items.key(id), base: d.price, kind: 'item', item: id, desc: d.desc };
    Economy.STYLES.mart.stock.push(['it_oleo'], ['it_galao']);
    Economy.STYLES.drugs.stock.push(['of_balaclava', 1, 4], ['of_bandana', 1, 6], ['of_luvas', 0.9, 3], ['it_abracadeira', 1, 12], ['it_furadeira', 0.7, 1]);
}
