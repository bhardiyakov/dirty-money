// ============================================================================
// Carreira: ARMEIRO — contrabando e fabricação de armas, aproveitando o caos.
//   Catador de Sucata   CATAR SUCATA: ir a uma cena de tiroteio RECENTE (policial ou traficante morto nos últimos minutos — o
//                       Careers anota) ou a uma zona de conflito da favela e vasculhar 3 pontos (E): sucata e cápsulas. Polícia
//                       por perto enquanto você mexe na cena = abordagem (procurado).
//   Torneiro Mecânico   FABRICAR na bancada (favela ou em casa): pistola artesanal, submetralhadora rústica, munição recarregada…
//                       e VENDER o lote aos vapores (favela). Com Engenharia baixa, parte das armas TRAVA na mão do comprador:
//                       a moral com o tráfico cai.
//   Mercador da Morte   fuzis montados com peças importadas (Inteligência 4); contratos com facções e milícias (em breve).
// Skills: ENGENHARIA (−10% de material por nível e menos falhas) e INTELIGÊNCIA (libera receitas de calibre maior).
// ============================================================================

class GunsmithCareer extends Career {
    constructor(mgr) {
        super(mgr, {
            id: 'gunsmith', name: 'ARMEIRO', icon: '🔩', color: '#c8b078',
            desc: 'Sucata de tiroteio vira arma caseira. Fabrique com capricho: arma que trava queima seu nome com o tráfico.',
            ranks: [
                { name: 'Catador de Sucata', xp: 0, desc: 'Recolhe cápsulas e peças nas cenas de tiroteio.' },
                { name: 'Torneiro Mecânico', xp: 500, desc: 'Fabrica armas caseiras e recarrega munição para os vapores.' },
                { name: 'Mercador da Morte', xp: 2500, desc: 'Fuzis com peças importadas; contratos com facções (em breve).' },
            ],
            skills: {
                engenharia: { name: 'Engenharia', desc: '−10% de material por nível e −6 pontos de chance de a arma travar' },
                inteligencia: { name: 'Inteligência', desc: 'Libera receitas: escopeta (nível 2) e fuzil montado (nível 4)' },
            },
        });
        this.data = { scrap: 0, casings: 0, stock: {}, jams: 0 };
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

    get jamChance() { return Math.max(0, 0.3 - 0.06 * this.skill('engenharia')); }
    need(R) { const k = 1 - 0.1 * this.skill('engenharia'); return { scrap: Math.max(1, Math.ceil(R.scrap * k)), casings: Math.ceil(R.casings * k), cost: R.cost }; }

    jobs() {
        return [
            { id: 'scrap', rank: 0, name: 'Catar sucata', pay: 'sucata + cápsulas', make: () => new ScrapJob(this),
                desc: 'Vá à cena de tiroteio mais recente (ou a uma zona de conflito da favela) e vasculhe 3 pontos com E. Polícia perto enquanto você mexe na cena = abordagem.' },
            { id: 'merchant', rank: 2, name: 'Contrato com facção', pay: '—', soon: true, make: () => null,
                desc: 'Em breve: miras, silenciadores e pentes importados; vender exclusividade a uma facção cria inimigos na outra.' },
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
        html += `<button data-act="sell" ${total > 0 && inFav ? '' : 'disabled'}>Vender o lote aos vapores (até ${brl(total)})${inFav ? '' : ' — só na favela'}</button></div>`;
        return html;
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
            if (jam) { Standing.add('traffic', -3 * jam); d.jams += jam; }
            return `Vendeu ${sold} peça(s) por ${brl(pay)}${jam ? ` · ${jam} arma(s) TRAVARAM na mão do comprador: moral com o tráfico −${3 * jam}` : ''}`;
        }
        return null;
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
