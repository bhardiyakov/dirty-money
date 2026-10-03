// ============================================================================
// Carreira: ARMEIRO — contrabando e fabricação de armas, aproveitando o caos.
//   Catador de Sucata   CATAR SUCATA: ir a uma cena de tiroteio RECENTE (policial ou traficante morto nos últimos minutos — o
//                       Careers anota) ou a uma zona de conflito da favela e vasculhar 3 pontos (E): sucata e cápsulas. Polícia
//                       por perto enquanto você mexe na cena = abordagem (procurado).
//   Torneiro Mecânico   FABRICAR na bancada (favela ou em casa): pistola artesanal, submetralhadora rústica, munição recarregada…
//                       e VENDER o lote aos vapores (favela). Com Engenharia baixa, parte das armas TRAVA na mão do comprador:
//                       a moral com o tráfico cai.
//   Mercador da Morte   fuzis montados com peças importadas (Inteligência 4); CONTRATOS: entregar um lote do estoque ao C.V
//                       (moral +) ou à MILÍCIA do Rio Seco (paga mais, mas o tráfico odeia e você vira ALVO DE SEQUESTRO — o
//                       resgate sai do seu bolso, a não ser que pague SEGURANÇAS). ACESSÓRIOS IMPORTADOS (dinheiro limpo) para as
//                       SUAS armas: silenciador (o tiro não chama a polícia de longe) e pente estendido (+50% no carregador).
// Munição recarregada do estoque também pode ir para a SUA mochila (botão "usar munição").
// Skills: ENGENHARIA (−10% de material por nível e menos falhas) e INTELIGÊNCIA (libera receitas de calibre maior).
// ============================================================================

class GunsmithCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'gunsmith', name: 'ARMEIRO', icon: '🔩', color: '#c8b078',
            desc: 'Sucata de tiroteio vira arma caseira. Fabrique com capricho: arma que trava queima seu nome com o tráfico.',
            ranks: [
                { name: 'Catador de Sucata', xp: 0, desc: 'Recolhe cápsulas e peças nas cenas de tiroteio.' },
                { name: 'Torneiro Mecânico', xp: 1200, desc: 'Fabrica armas caseiras e recarrega munição para os vapores.' },
                { name: 'Mercador da Morte', xp: 6000, desc: 'Fuzis montados, contratos com C.V e milícia, silenciador e pente estendido.' },
            ],
            skills: {
                engenharia: { name: 'Engenharia', desc: '−10% de material por nível e −6 pontos de chance de a arma travar' },
                inteligencia: { name: 'Inteligência', desc: 'Libera receitas: escopeta (nível 2) e fuzil montado (nível 4)' },
            },
        });
        this.data = { scrap: 0, casings: 0, stock: {}, jams: 0, mods: {}, rivalDeals: 0, guards: 0 };
    }

    static get RECIPES() {
        return {
            pistol_c: { name: 'Pistola artesanal', rank: 1, intel: 0, scrap: 5, casings: 0, cost: 80, price: 520, gun: true },
            ammo_c: { name: 'Munição recarregada (caixa)', rank: 1, intel: 0, scrap: 1, casings: 24, cost: 30, price: 190, gun: false },
            smg_c: { name: 'Submetralhadora rústica', rank: 1, intel: 1, scrap: 9, casings: 0, cost: 150, price: 1150, gun: true },
            shotgun_c: { name: 'Escopeta de cano serrado', rank: 1, intel: 2, scrap: 12, casings: 0, cost: 200, price: 1450, gun: true },
            rifle_c: { name: 'Fuzil montado (peças importadas)', rank: 2, intel: 4, scrap: 18, casings: 0, cost: 2200, price: 6200, gun: true },
        };
    }

    lotValue() { const R = GunsmithCareer.RECIPES, d = this.data; return Object.keys(R).reduce((s, k) => s + (R[k].gun ? (d.stock[k] || 0) * R[k].price : 0), 0); }
    static get ACCESSORIES() { return { sil: { name: 'Silenciador', price: 6000, desc: 'o tiro só é percebido bem de perto: a polícia não vem pelo barulho' }, ext: { name: 'Pente estendido', price: 4500, desc: '+50% de balas no carregador' } }; }

    get jamChance() { return Math.max(0, 0.3 - 0.06 * this.skill('engenharia')); }
    need(R) { const k = 1 - 0.1 * this.skill('engenharia'); return { scrap: Math.max(1, Math.ceil(R.scrap * k)), casings: Math.ceil(R.casings * k), cost: R.cost }; }

    jobs() {
        return [
            { id: 'scrap', rank: 0, name: 'Catar sucata', pay: 'sucata + cápsulas', make: () => new ScrapJob(this),
                desc: 'Vá à cena de tiroteio mais recente (ou a uma zona de conflito da favela) e vasculhe 3 pontos com E. Polícia perto enquanto você mexe na cena = abordagem.' },
            { id: 'cv', rank: 2, name: 'Contrato: Comando Verde', pay: 'lote × 1,4 + moral', make: () => new ArmsDealJob(this, 'cv'),
                check: () => this.lotValue() < 3000 ? 'Precisa de um lote de pelo menos R$ 3.000 no estoque' : null,
                desc: 'Entregue o seu estoque de armas (lote mínimo R$ 3.000) no fundo da favela. Paga 40% acima dos vapores e o tráfico gosta.' },
            { id: 'mil', rank: 2, name: 'Contrato: Milícia do Rio Seco', pay: 'lote × 1,9', make: () => new ArmsDealJob(this, 'mil'),
                check: () => this.lotValue() < 3000 ? 'Precisa de um lote de pelo menos R$ 3.000 no estoque' : null,
                desc: 'A milícia paga quase o dobro — mas armar o inimigo derruba sua moral com o tráfico e te torna alvo de sequestro (contrate seguranças).' },
        ];
    }

    panel() {
        const d = this.data, R = GunsmithCareer.RECIPES, here = this.mgr.atBase(), inFav = (() => { const p = this.g.player.position; return Standing.inFavela(p.x, p.z); })();
        const stock = Object.keys(R).filter((k) => d.stock[k] > 0).map((k) => `${d.stock[k]}× ${R[k].name}`).join(' · ') || 'nada';
        let html = `<div class="cr-row"><span>Sucata</span><b>${d.scrap} kg</b></div><div class="cr-row"><span>Cápsulas</span><b>${d.casings}</b></div>
            <div class="cr-row"><span>Estoque</span><b>${stock}</b></div><div class="cr-row"><span>Chance de travar</span><b>${Math.round(this.jamChance * 100)}%</b></div>`;
        if (this.rank < 1) return html + '<p class="cr-dim">Na patente TORNEIRO MECÂNICO você fabrica armas na bancada (favela ou em casa).</p>';
        html += `<p class="cr-dim">${here ? 'Bancada disponível aqui.' : 'Para fabricar, vá para a favela ou para dentro de casa.'}</p><div class="cr-btns">`;
        for (const [k, Rc] of Object.entries(R)) {
            const n = this.need(Rc), locked = this.rank < Rc.rank || this.skill('inteligencia') < Rc.intel;
            const can = !locked && here && d.scrap >= n.scrap && d.casings >= n.casings && this.g.inventory.cash >= n.cost;
            html += `<button data-act="craft" data-arg="${k}" ${can ? '' : 'disabled'}>${Rc.name} — ${n.scrap} kg${n.casings ? ` + ${n.casings} cáps.` : ''} + ${brl(n.cost)}${locked ? ` (${this.rank < Rc.rank ? this.ranks[Rc.rank].name : 'Inteligência ' + Rc.intel})` : ''}</button>`;
        }
        const total = Object.keys(R).reduce((s, k) => s + (d.stock[k] || 0) * R[k].price, 0);
        html += `<button data-act="sell" ${total > 0 && inFav ? '' : 'disabled'}>Vender o lote aos vapores (até ${brl(total)})${inFav ? '' : ' — só na favela'}</button>`;
        html += `<button data-act="ammo" ${d.stock.ammo_c > 0 ? '' : 'disabled'}>Usar munição do estoque na sua arma (${d.stock.ammo_c || 0} caixa(s) · +24 balas cada)</button></div>`;
        if (this.rank < 2) return html + '<p class="cr-dim">Como MERCADOR DA MORTE: contratos com facções e acessórios importados para as suas armas.</p>';
        const w = this.g.player.weapon, gun = this.g.inventory.isGun(w), m = d.mods[w] || {};
        html += `<h3 style="font-size:13px;margin-top:6px">IMPORTADOS — ${gun ? Weapons[w].name : 'saque uma arma de fogo'}</h3><div class="cr-btns">`;
        for (const [k, A] of Object.entries(GunsmithCareer.ACCESSORIES)) html += `<button data-act="acc" data-arg="${k}" ${gun && !m[k] ? '' : 'disabled'}>${m[k] ? '✔ ' : ''}${A.name} (${brl(A.price)} limpo) — ${A.desc}</button>`;
        html += `</div><div class="cr-row"><span>Negócios com a milícia</span><b>${d.rivalDeals}</b></div><div class="cr-row"><span>Seguranças</span><b>${d.guards > 0 ? d.guards + ' dia(s)' : 'nenhum'}</b></div>
            <div class="cr-btns"><button data-act="guards">Contratar seguranças por 5 dias (${brl(8000)})</button></div>`;
        return html;
    }

    onNewDay() {
        const d = this.data, g = this.g;
        if (d.guards > 0) d.guards--;
        if (this.rank < 2 || d.rivalDeals <= 0) return;
        const risk = Math.min(0.5, 0.12 * d.rivalDeals) * (d.guards > 0 ? 0.2 : 1);
        if (Math.random() >= risk) return;
        const ransom = Math.round((g.inventory.cash + g.inventory.clean) * 0.25);
        const fromDirty = Math.min(g.inventory.cash, ransom);
        g.inventory.cash -= fromDirty; g.inventory.clean = Math.max(0, g.inventory.clean - (ransom - fromDirty));
        d.rivalDeals = Math.max(0, d.rivalDeals - 1);
        g._flash(`🚨 SEQUESTRO! O tráfico pegou um parente seu por armar a milícia — resgate de ${brl(ransom)}${d.guards > 0 ? ' (os seguranças falharam)' : ''}`);
    }

    action(name, arg) {
        const d = this.data, inv = this.g.inventory, R = GunsmithCareer.RECIPES;
        if (name === 'craft') {
            const Rc = R[arg]; if (!Rc) return null;
            if (this.rank < Rc.rank || this.skill('inteligencia') < Rc.intel) return 'Receita bloqueada';
            if (!this.mgr.atBase()) return 'Só dá para fabricar na favela ou em casa';
            const n = this.need(Rc);
            if (d.scrap < n.scrap || d.casings < n.casings) return 'Falta material — cate mais sucata';
            if (inv.cash < n.cost) return `Faltam ${brl(n.cost - inv.cash)}`;
            d.scrap -= n.scrap; d.casings -= n.casings; inv.cash -= n.cost;
            d.stock[arg] = (d.stock[arg] || 0) + 1;
            this.addXp(Rc.gun ? 30 + Rc.price / 60 : 12);
            AudioFX.blip(420, 0.12, 0.16);
            return `Fabricou: ${Rc.name}`;
        }
        if (name === 'ammo') {
            const w = this.g.player.weapon;
            if (!(d.stock.ammo_c > 0)) return 'Sem munição recarregada no estoque';
            if (!inv.isGun(w) || !inv.owned(w)) return 'Saque a arma de fogo que vai receber a munição';
            d.stock.ammo_c--; inv.addAmmo(w, 24);
            return `+24 balas para ${Weapons[w].name} (${inv.ammoText(w)})`;
        }
        if (name === 'acc') {
            const A = GunsmithCareer.ACCESSORIES[arg], w = this.g.player.weapon;
            if (!A) return null;
            if (this.rank < 2) return 'Só para Mercador da Morte';
            if (!inv.isGun(w)) return 'Saque a arma de fogo que vai receber o acessório';
            const m = d.mods[w] || (d.mods[w] = {});
            if (m[arg]) return 'Essa arma já tem';
            if (inv.clean < A.price) return `Precisa de ${brl(A.price)} de dinheiro LIMPO (importação oficial)`;
            inv.clean -= A.price; m[arg] = 1; this.mgr.applyMods();
            this.addXp(60);
            return `${A.name} instalado na ${Weapons[w].name}`;
        }
        if (name === 'guards') {
            if (inv.cash < 8000) return `Faltam ${brl(8000 - inv.cash)}`;
            inv.cash -= 8000; d.guards += 5;
            return 'Seguranças contratados por 5 dias: sequestro fica muito mais difícil';
        }
        if (name === 'sell') {
            const p = this.g.player.position;
            if (!Standing.inFavela(p.x, p.z)) return 'Os vapores só compram na favela';
            let pay = 0, sold = 0, jam = 0;
            for (const [k, Rc] of Object.entries(R)) {
                const n = d.stock[k] || 0;
                for (let i = 0; i < n; i++) {
                    if (Rc.gun && Math.random() < this.jamChance) { jam++; continue; }
                    pay += Math.round(Rc.price * (0.9 + Math.random() * 0.2)); sold++;
                }
                d.stock[k] = 0;
            }
            if (!sold && !jam) return 'Seu estoque está vazio';
            inv.addCash(pay);
            this.addXp(sold * 15);
            if (this.g.achievements) this.g.achievements.bump('gunsSold', sold);
            if (jam) { Standing.add('traffic', -3 * jam); d.jams += jam; }
            return `Vendeu ${sold} peça(s) por ${brl(pay)}${jam ? ` · ${jam} arma(s) TRAVARAM na mão do comprador: moral com o tráfico −${3 * jam}` : ''}`;
        }
        return null;
    }
}

// Contrato de armas (Mercador da Morte): leva o lote do estoque até o comprador.
class ArmsDealJob extends CareerJob {
    constructor(c, buyer) {
        super(c, { title: buyer === 'cv' ? 'CONTRATO · C.V' : 'CONTRATO · MILÍCIA', text: buyer === 'cv' ? 'Entregue o lote no fundo da favela' : 'Entregue o lote no ponto da milícia', limit: 480 });
        this.buyer = buyer;
    }
    start() {
        const p = this.g._playerState().pos;
        if (this.buyer === 'cv') this.drop = this.mgr.favelaSpot(7704, 0.55, 0.85);
        else { const d = this.mgr.cityDoor(p, 150, 900, (q) => q.district !== 'favela' && q.biome === 'industrial') || this.mgr.cityDoor(p, 150, 1200, (q) => q.district !== 'favela'); if (!d) { this.why = 'A milícia não respondeu'; return false; } this.drop = { x: d.x, z: d.z }; }
        this.value = this.c.lotValue();
        this.target(this.drop.x, this.drop.z, this.buyer === 'cv' ? 'Entrega ao C.V' : 'Ponto da milícia');
        return true;
    }
    status() { return `LOTE ${brl(this.value)}`; }
    prompt() { return this.g.mode === 'player' && this.near(this.g.player.position, 4) ? `<b>E</b> entregar o lote (${brl(this.value)})<small>${this.buyer === 'cv' ? 'o tráfico paga 40% a mais' : 'a milícia paga quase o dobro — o tráfico vai saber'}</small>` : ''; }
    interact() {
        const g = this.g; if (g.mode !== 'player' || !this.near(g.player.position, 4)) return false;
        const c = this.c, d = c.data, R = GunsmithCareer.RECIPES;
        let ok = 0, jam = 0;
        let sold = 0;
        for (const k of Object.keys(R)) { if (!R[k].gun) continue; const n = d.stock[k] || 0; for (let i = 0; i < n; i++) { if (Math.random() < c.jamChance) jam++; else { ok += R[k].price; sold++; } } d.stock[k] = 0; }
        if (g.achievements) g.achievements.bump('gunsSold', sold);
        const mul = this.buyer === 'cv' ? 1.4 : 1.9, pay = Math.round(ok * mul);
        if (this.buyer === 'cv') Standing.add('traffic', 6 - 3 * jam);
        else { Standing.add('traffic', -12); d.rivalDeals++; }
        this.succeed(pay, 150 + pay / 80, `lote entregue${jam ? ` (${jam} arma(s) travaram no teste)` : ''}${this.buyer === 'mil' ? ' · o tráfico ficou sabendo (moral −12)' : ''}`);
        return true;
    }
}

class ScrapJob extends CareerJob {
    constructor(c) { super(c, { title: 'CATAR SUCATA', text: 'Vasculhe a cena antes que a perícia limpe tudo', limit: 300 }); this.spots = []; this.busy = 0; this.cop = false; }

    start() {
        const p = this.g._playerState().pos, s = this.mgr.recentScene(p, 0, 600);
        let c;
        if (s) { c = s; this.text = 'Cena de tiroteio recente: vasculhe 3 pontos (cuidado com a polícia)'; }
        else { c = this.mgr.favelaSpot(Math.floor(Math.random() * 1e6), 0.3, 0.7); this.text = 'Zona de conflito na favela: vasculhe 3 pontos'; }
        for (let i = 0; i < 3; i++) {                                        // 3 pontos em volta da cena, sempre em chão livre (nunca dentro de prédio)
            let s2 = null;
            for (let t = 0; t < 24 && !s2; t++) {
                const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5, q = this.mgr.streetNear(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, 10);
                if (q && Math.hypot(q.x - c.x, q.z - c.z) < 12 && this.spots.every((o) => Math.hypot(o.x - q.x, o.z - q.z) > 2.5)) s2 = q;
            }
            this.spots.push(s2 || { x: c.x, z: c.z });
        }
        this.target(this.spots[0].x, this.spots[0].z, s ? 'Cena do tiroteio' : 'Zona de conflito');
        return true;
    }

    status() { return `PONTO ${3 - this.spots.length + 1}/3`; }

    prompt() {
        if (this.busy > 0 || this.g.mode !== 'player') return '';
        return this.near(this.g.player.position, 3.2) ? '<b>E</b> catar cápsulas e peças<small>leva alguns segundos — polícia por perto vai estranhar</small>' : '';
    }

    interact() {
        const g = this.g;
        if (this.busy > 0 || g.mode !== 'player' || g.player.busy || !this.near(g.player.position, 3.2)) return false;
        this.mgr.act('rummage', 2.0);
        this.busy = 2.0;
        return true;
    }

    update(dt, pos) {
        const g = this.g;
        if (this.busy > 0) {
            if (!this.cop && this.mgr.copDist(pos) < 22) { this.cop = true; g.wanted.reportCrime(); g.wanted.ensureLevel(1); g._flash('🚨 Abordagem! A polícia te viu mexendo na cena do crime'); }
            this.busy -= dt;
            if (this.busy > 0) return;
            const d = this.c.data, sc = 2 + Math.floor(Math.random() * 3), ca = 4 + Math.floor(Math.random() * 10);
            d.scrap += sc; d.casings += ca;
            g._flash(`+${sc} kg de sucata · +${ca} cápsulas`);
            this.spots.shift();
            if (!this.spots.length) { this.succeed(0, 80, 'sucata recolhida'); return; }
            this.target(this.spots[0].x, this.spots[0].z);
        }
    }
}
