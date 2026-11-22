// ============================================================================
// HomeBurglary — INVASÃO DE CASAS E APARTAMENTOS (o mesmo motor do arrombamento de loja: crime/StoreBurglary.js — escuro, lanterna,
// barulho, digitais, alarme, a caixa de força do quarteirão e a perícia).
//
//   AS PORTAS   toda casa e prédio residencial da cidade com porta na calçada (bairros residenciais, centro, comércio, orla e Lagoa;
//               fora a favela e os imóveis à venda) — parado (ou agachado) na porta: E arromba (mini-game da fechadura; apartamento
//               com portaria é mais difícil). O PADRÃO sai do mercado imobiliário (economy/RealEstate.js): casa popular, kitnet,
//               apartamento, alto padrão, cobertura, mansão — e com ele o interior (art/HomeStylesRes.js + art/HomeStyles.js), o que
//               tem para levar e a segurança: alarme a partir do apartamento médio (energia ligada), câmera Wi-Fi a partir do alto
//               padrão (grava na nuvem: só cortando a energia).
//   QUEM ESTÁ   depende da hora e do dia: de madrugada todo mundo DORME (dá para entrar — em silêncio: barulho acorda, e quem acorda
//               liga 190 e vê seu rosto); dia de semana em horário comercial a maioria está FORA, trabalhando (a vovó, quase sempre
//               em casa); fim de semana de sol, na praia; à noite, todo mundo acordado (não dá). Alguns viajaram (casa vazia o dia todo).
//   O SAQUE     embaixo do colchão, gavetas da cômoda (dinheiro e joias), guarda-roupa (relógio, bolsa de grife), TV e videogame
//               (pesados), notebook, cofre (com sorte, um revólver), a prataria da cristaleira, o porta-joias da vovó. A mercadoria vai
//               para o receptador da favela (carreira de Ladrão).
//   DESCOBREM   quem dormia, ao acordar (6h30); quem saiu, ao voltar (18h30); quem viajou, dias depois — ou na hora, se o alarme tocou ou
//               alguém acordou. Daí a perícia (StoreBurglary.cases).
// ============================================================================

const Residences = {
    list: null, _grid: null, C: 14,
    BIOMES: new Set(['residential', 'downtown', 'commercial', 'resort']),
    NAME: { home_casa: 'Casa de família', home_kitnet: 'Kitnet', home_vovo: 'Casa da vovó', home_apto: 'Apartamento', home_cobertura: 'Cobertura', home_mansion: 'Mansão' },

    build() {
        if (this.list) return this.list;
        const out = this.list = [], G = this._grid = new Map(), C = this.C, t0 = performance.now();
        if (typeof CityGrid === 'undefined' || !CityGrid.blocks) return out;
        Interiors.index();
        const props = (typeof RealEstate !== 'undefined' && RealEstate.list) || [];
        const home = typeof SafeHouse !== 'undefined' && SafeHouse.spawnWorld ? SafeHouse.spawnWorld() : null;
        for (const b of CityGrid.blocks) {
            if (b.open || b.virtual || b.organic || b.station || !this.BIOMES.has(b.biome)) continue;
            b.lots.forEach((l, li) => {
                if (l.landmark || l.safehouse || (l.shops || []).length) return;
                if ((l.x1 - l.x0) * (l.z1 - l.z0) < 30) return;
                const d = CityGrid.lotDoor(b, l); if (!d) return;
                if (Interiors.shopNear(d.x, d.z, 4.5)) return;
                if (props.some((p) => hypot(p.x - d.x, p.z - d.z) < 4)) return;
                if (home && hypot(home.x - d.x, home.z - d.z) < 12) return;
                for (let i = out.length - 1; i >= 0 && out[i].block === b.id; i--) if (hypot(out[i].x - d.x, out[i].z - d.z) < 5) return;
                const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, loc = RealEstate.locate(cx, cz, b);
                let tier = RealEstate.tierOf(loc.idx);
                if (tier.type === 'Barraco') tier = RealEstate.TIERS[1];
                const apt = b.biome !== 'residential' || /Apart|Kitnet|Cobertura/.test(tier.type);
                const stars = b.district === 'lagoa' ? 5 : tier.stars;
                const id = `${b.id}|res|${li}`, h = Pixel.hash(Economy._h(id), 23, 9);
                const style = this._style(stars, h, apt);
                const sw = b.sw || 4, ex = d.x - Math.sin(d.face) * sw / 2, ez = d.z - Math.cos(d.face) * sw / 2;
                const r = {
                    id, res: true, kind: style, style, name: (apt && style === 'home_casa' ? 'Apartamento de família' : this.NAME[style]), type: tier.type, stars,
                    tier: stars <= 2 ? 1 : stars === 3 ? 2 : stars === 4 ? 3 : 4, apt, alarm: stars >= 3, cams: stars >= 4,
                    x: d.x, z: d.z, face: d.face, ex, ez, district: b.district, biome: b.biome, block: b.id, region: loc.region,
                    variant: Math.floor(Pixel.hash(Economy._h(id), 17, 3) * 5) % 5,
                };
                out.push(r);
                const k = Math.floor(r.x / C) * 100003 + Math.floor(r.z / C);
                (G.get(k) || G.set(k, []).get(k)).push(r);
            });
        }
        console.log(`[CASAS] ${out.length} residências que dá para arrombar (${(performance.now() - t0).toFixed(0)} ms)`);
        return out;
    },
    _style(stars, h, apt) {
        if (stars >= 5) return h < 0.5 ? 'home_cobertura' : 'home_mansion';
        if (stars === 4) return h < 0.75 ? 'home_apto' : 'home_casa';
        if (stars === 3) return h < 0.4 ? 'home_apto' : h < 0.7 ? 'home_casa' : h < 0.85 ? 'home_vovo' : 'home_kitnet';
        if (stars === 2 || apt) return h < 0.45 ? 'home_kitnet' : h < 0.75 ? 'home_casa' : 'home_vovo';
        return h < 0.55 ? 'home_casa' : h < 0.85 ? 'home_vovo' : 'home_kitnet';
    },
    near(x, z, r = 1.4) {
        this.build();
        const C = this.C, G = this._grid;
        let best = null, bd = r;
        for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) {
            for (const q of G.get(i * 100003 + j) || []) { const d = hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = q; } }
        }
        return best;
    },

    // Quem está em casa agora: 'away' | 'asleep' | 'awake'. Estável dentro de cada faixa do dia (sorteio por casa, dia e faixa).
    who(r, game, hour = game.dayNight.hour, day = Economy.day) {
        const rnd = (salt) => Pixel.hash(Economy._h(r.id), day * 13 + salt, 7);
        const wkend = day % 7 >= 5, vovo = r.style === 'home_vovo', kit = r.style === 'home_kitnet';
        if (rnd(1) < 0.08) return 'away';                                               // viajaram
        if (hour >= 23 || hour < 6) return kit && hour >= 23 && rnd(2) < 0.5 ? 'awake' : rnd(3) < 0.9 ? 'asleep' : 'awake';
        if (hour < 8) return 'awake';
        if (!wkend && hour < 17.5) return rnd(4) < (vovo ? 0.25 : 0.68) ? 'away' : 'awake';
        if (wkend && hour >= 9 && hour < 17) { const sun = typeof Weather === 'undefined' || !Weather.cur || Weather.cur.k < 0.3; return rnd(5) < (vovo ? 0.2 : sun ? 0.6 : 0.35) ? 'away' : 'awake'; }
        return rnd(6) < 0.18 ? 'away' : 'awake';
    },
    // Quando descobrem o arrombamento (hora absoluta: Traces.now()).
    discoverAt(r, who, now, hour) {
        const until = (h) => now + (((((h - hour) % 24) + 24) % 24) || 24);
        if (who === 'asleep') return until(6.5);
        const travel = Pixel.hash(Economy._h(r.id), Economy.day * 13 + 1, 7) < 0.08;
        return travel ? now + 30 + (Economy._h(r.id) % 18) : until(18.5);
    },
};

const HomeBurglary = {
    // Saque de casa: [rótulo do E, s, barulho ao começar]
    ACT: {
        bed: ['revistar embaixo do colchão', 3, 2], chest: ['revirar as gavetas', 3.5, 4], closet: ['revirar o guarda-roupa', 4, 4],
        tv: ['levar a TV e o videogame', 4, 9], desk: ['pegar o notebook', 2, 1], safe: ['arrombar o cofre', 16, 0],
        cabinet: ['levar a prataria', 3, 7], jewelbox: ['esvaziar o porta-joias', 2, 1],
    },
    KINDS: ['bed', 'chest', 'closet', 'tv', 'desk', 'safe', 'cabinet', 'jewelbox'],
    mul(r) { return 0.6 + 0.35 * (r.stars - 1) + (r.style === 'home_mansion' ? 0.8 : 0); },

    // ---------------------------------------------------------------- na rua
    outPrompt(game) {
        if (game.mode !== 'player' || Interiors.active || game.player.busy) return null;
        const pl = game.player, p = pl.position;
        if ((pl.speed || 0) > 1.4 && !pl.crouched) return null;                       // (passando direto: não enche a tela de portas)
        const r = Residences.near(p.x, p.z); if (!r) return null;
        const who = Residences.who(r, game), what = r.apt ? 'o apartamento' : 'a casa';
        if (who === 'awake') return `<b>${r.name}</b><small>${r.region} · tem gente acordada em ${what} (luz acesa, TV ligada) — volte quando saírem ou de madrugada</small>`;
        const why = StoreBurglary.why(game, r);
        if (why) return `<b>${r.name}</b><small>${why}</small>`;
        const pw = Power.forShop(r);
        const sec = !r.alarm ? 'sem alarme' : pw ? '⚡ sem energia: alarme e câmera desligados' : `⚠ alarme${r.cams ? ' e câmera Wi-Fi' : ''} (sabote a caixa de força)`;
        return `<b>E</b> arrombar ${what} (furtivo)<small>${r.name} · ${r.region} · ${who === 'asleep' ? '💤 moradores dormindo: silêncio' : '🚪 ninguém em casa'} · ${sec}${StoreBurglary.gloves() ? '' : ' · 🖐 sem luvas'}</small>`;
    },
    outInteract(game) {
        if (game.mode !== 'player' || Interiors.active || game.player.busy || game.lockpick.active) return false;
        const p = game.player.position, r = Residences.near(p.x, p.z); if (!r) return false;
        if (Residences.who(r, game) === 'awake') return false;
        // (o E de quem está ali na calçada vem antes: ponto de ônibus, mendigo, testemunha, quiosque, ferido)
        const mods = [typeof Buses !== 'undefined' && Buses, typeof StreetLife !== 'undefined' && StreetLife, typeof StreetIdle !== 'undefined' && StreetIdle,
            typeof Witnesses !== 'undefined' && Witnesses, typeof Stands !== 'undefined' && Stands, typeof Rescue !== 'undefined' && Rescue];
        if (mods.some((m) => { try { return m && m.prompt && m.prompt(game); } catch (e) { return false; } })) return false;
        return StoreBurglary.breakIn(game, r);
    },

    // ---------------------------------------------------------------- lá dentro
    // Os moradores DORMINDO nas camas (Interiors._doEnter → _useActors): um adulto na primeira cama, uma criança na segunda.
    cast(r, data) {
        if (!r || !r.res || Residences.who(r, window.game) !== 'asleep') return [];
        const beds = (data.uses || []).filter((u) => u.kind === 'bed').slice(0, 2);
        return beds.map((u, i) => ({ x: (u.x0 + u.x1) / 2, z: (u.z0 + u.z1) / 2 + 0.3, face: Math.PI, variant: i * 3 + 1, bed: u }));
    },
    onEnter(game, s) {
        const r = s.shop;
        s.who = Residences.who(r, game);
        s.sleepers = [];
        if (s.who === 'asleep') {
            const L = this.cast(r, Interiors.active.data), o = Interiors.STAGE;
            L.forEach((e, i) => {
                const a = Interiors._actors[i]; if (!a) return;
                const x = o.x + e.x, z = o.z + e.z, ob = Interiors.obstacles.find((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
                a.play('dead'); a.mesh.position.y = 0.35 + (ob ? Math.min(ob.h, 1.8) : 0.7);       // (deitado em cima da cama — no beliche, na de cima)
                s.sleepers.push({ a, x, z, bed: e.bed, awake: false });
            });
        }
        s.cams = !!(s.power && r.cams);
        s.alarm = s.power && r.alarm ? { t: (s.forced ? 0.5 : 9) + 2.5 * StoreBurglary.skill(game, 'eletronica'), off: false, rang: false } : null;
    },
    // Ponto de saque de casa (cama com gente dormindo em cima: não).
    useOk(s, u) {
        if (!this.KINDS.includes(u.kind)) return false;
        if (u.kind === 'bed' && (s.sleepers || []).some((q) => q.bed && Math.abs(q.bed.x0 + Interiors.STAGE.x - u.x0) < 0.01 && Math.abs(q.bed.z0 + Interiors.STAGE.z - u.z0) < 0.01)) return false;
        return true;
    },
    hint(game, s, u) {
        if (u.kind === 'tv') return 'pesada (8 kg): receptador';
        if (u.kind === 'safe') return Items.has(game.inventory, 'furadeira') ? 'com a furadeira (barulho)' : 'demora e faz barulho (a furadeira corta pela metade)';
        if (u.kind === 'cabinet') return 'talheres e bandejas de prata — tilintam';
        if (u.kind === 'bed') return 'o dinheiro que esconderam';
        return '';
    },

    // O fim de uma ação de saque em casa (StoreBurglary._finishAct).
    finish(game, s, A) {
        const r = s.shop, inv = game.inventory, k = this.mul(r), B = StoreBurglary.burglar(game), rnd = Math.random;
        const cash = (a, b) => { const v = Math.round((a + rnd() * (b - a)) * k / 10) * 10; inv.addCash(v); s.loot.cash += v; return v; };
        const goods = (what, a, b, kg) => {
            if (typeof Bags !== 'undefined' && Bags.room(game) < kg) { game._flash(`🎒 Não cabe: ${what} pesa ${kg} kg (${Bags.label(game)})`); return -1; }
            const v = Math.round((a + rnd() * (b - a)) * k / 10) * 10, D = B && B.data;
            if (D) { D.goods += v; D.weight += kg; }
            s.loot.goods += v; s.loot.kg += kg; return v;
        };
        const jewels = (n, a, b) => {
            let got = 0, val = 0;
            for (let i = 0; i < n; i++) { if (inv.slotsNeeded({ kind: 'jewel' }) > inv.slotsFree()) break; const v = Math.round((a + rnd() * (b - a)) * k / 10) * 10; inv.addJewel(v); got++; val += v; }
            s.loot.jv += val; return { got, val };
        };
        let msg = '';
        if (A.kind === 'bed') { StoreBurglary._touch('o colchão'); msg = rnd() < 0.6 ? `💵 Embaixo do colchão: +${brl(cash(60, 650))}` : 'Embaixo do colchão: nada'; }
        else if (A.kind === 'chest') {
            StoreBurglary._touch('as gavetas');
            const c = rnd() < 0.7 ? cash(40, 420) : 0, j = rnd() < 0.5 ? jewels(1, 300, 2200) : { got: 0, val: 0 };
            msg = c || j.got ? `🗄 Gavetas: ${c ? '+' + brl(c) : ''}${c && j.got ? ' e ' : ''}${j.got ? `uma joia (${brl(j.val)})` : ''}` : 'Gavetas: só roupa e papel';
        } else if (A.kind === 'closet') {
            StoreBurglary._touch('o guarda-roupa');
            const v = goods(rnd() < 0.5 ? 'relógio' : 'bolsa de grife', 300, 1800, 1); if (v < 0) { s.done[A.key] = 0; return; }
            const c = rnd() < 0.35 ? cash(100, 900) : 0;
            msg = `👜 Guarda-roupa: ${rnd() < 0.5 ? 'relógio' : 'bolsa de grife'} (${brl(v)})${c ? ` e ${brl(c)} numa caixa de sapato` : ''}`;
        } else if (A.kind === 'tv') {
            StoreBurglary._touch('a TV');
            const v = goods('a TV', 600, 2500, 8); if (v < 0) { s.done[A.key] = 0; return; }
            msg = `📺 TV e videogame (${brl(v)}, +8 kg) — receptador`;
        } else if (A.kind === 'desk') {
            StoreBurglary._touch('a mesa');
            const v = goods('o notebook', 900, 3500, 2); if (v < 0) { s.done[A.key] = 0; return; }
            msg = `💻 ${r.style === 'home_kitnet' ? 'PC gamer e notebook' : 'Notebook'} (${brl(v)}, +2 kg) — receptador`;
        } else if (A.kind === 'safe') {
            StoreBurglary._touch('o cofre');
            const c = cash(1500, 9000);
            let gun = '';
            if (rnd() < 0.2 && inv.weapons && inv.weapons.revolver) { inv.addWeapon('revolver', 18); gun = ' e um revólver (+18 balas)'; s.loot.guns.push('revolver'); }
            msg = `💰 Cofre da casa: +${brl(c)}${gun}`;
        } else if (A.kind === 'cabinet') {
            StoreBurglary._touch('a cristaleira');
            const v = goods('a prataria', 500, 2000, 4); if (v < 0) { s.done[A.key] = 0; return; }
            msg = `🍽 Prataria da cristaleira (${brl(v)}, +4 kg) — receptador`;
        } else if (A.kind === 'jewelbox') {
            StoreBurglary._touch('o porta-joias');
            const j = jewels(2 + Math.floor(rnd() * 2), 500, 3000);
            msg = j.got ? `💍 Porta-joias: ${j.got} peças (${brl(j.val)})` : '🎒 Mochila cheia: não cabe joia';
        }
        if (msg) game._flash(msg);
        AudioFX.blip(860, 0.08, 0.14);
        if (B) B.addXp(A.kind === 'safe' ? 16 : 9);
    },

    // Por quadro (StoreBurglary.update): passos perto de quem dorme fazem barulho (agachado, não); barulho cheio acorda.
    tick(dt, game, s) {
        if (!s.sleepers || !s.sleepers.length) return;
        const pl = game.player, p = pl.position, sp = pl.speed || 0;
        let near = Infinity;
        for (const q of s.sleepers) near = Math.min(near, hypot(q.x - p.x, q.z - p.z));
        if (near < 3.2 && sp > 0.4 && !pl.crouched) StoreBurglary._noise(game, 7 * dt);
        if (s.noise >= 50 && !s.woke) this.wake(game, s, near);
    },
    wake(game, s, near) {
        const q = s.sleepers.find((x) => !x.awake) || s.sleepers[0]; if (!q) return;
        s.woke = true; q.awake = true;
        q.a.play('idle'); q.a.mesh.position.y = 0.5;
        const p = game.player.position;
        q.a.setPosition(q.x + 0.9, q.z - 0.6); q.a.setHeading(Math.atan2(p.x - q.x, p.z - q.z));
        if (typeof Bubbles !== 'undefined') Bubbles.say(q.a, ['Quem tá aí?!', 'LADRÃO! Socorro!', 'Tem alguém em casa!'][Math.floor(Math.random() * 3)], { tone: 'shout', ms: 2600 });
        AudioFX.scream && AudioFX.scream({ position: { x: q.x, z: q.z } }, 1);
        s.seen = near < 9 && !Traces.fullMask();                                         // (viu você de perto, de rosto à mostra)
        StoreBurglary._ring(game, 'O morador acordou e ligou 190');
    },
};
