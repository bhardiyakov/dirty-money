// ============================================================================
// Temper — o TEMPERAMENTO dos pedestres: quem REVIDA uma agressão, e com quê (Config.npc.temper).
//   • HOMENS: `men` (60%) revidam. Atacado A MÃO LIVRE (soco, chute), sai no braço; atacado com FACA, TACO ou ARMA DE FOGO, só revida
//     quem também anda ARMADO — parte dos que revidam leva faca (`knife`) ou revólver (`gun`), mais na periferia (× `periphery`).
//     Armado e levando a pior no braço (ou vendo o outro sacar), saca a dele (FightState: escalada).
//   • MULHERES: revidam bem menos (`women`), mais na periferia (`womenPeriphery`: favela, periferia, porto) — e sempre com faca ou
//     taco (`womenBat` = fração do taco).
//   • Idosos (vovó, senhores grisalhos): `oldK` da chance.
//   • Faca ou taco contra arma de fogo: só com o atirador colado (`closeVsGun` m); mais longe, foge.
// O sorteio é FIXO por pessoa (o pedestre do pool + o desenho e a cor que ele veste agora: o mesmo pedestre reage sempre igual); a
// região conta na hora da briga. Sem os clipes da arma no atlas (bonecos antigos, tipos sem os clipes): a mão livre.
// ============================================================================

const Temper = {
    PERIPHERY: ['favela', 'mirante', 'periferia', 'industrial', 'roca'],      // distritos (Empire.districtAt) da periferia
    OLD: /vovo|senhor|repartido/,
    // golpe/arma que acertou → tipo de agressão (NPC._hitKind): mão livre, arma branca (faca, taco, cassetete) ou arma de fogo
    ATTACK: { punch: 'hand', punchL: 'hand', kick: 'hand', stab: 'blade', swing: 'blade', baton: 'blade', gun: 'gun' },
    // a arma na mão → o golpe (Melee) e o clipe dele
    BLOW: { knife: 'stab', bat: 'swing' },

    attackOf(kind) { return this.ATTACK[kind] || null; },

    // Tipo do desenho do pedestre (null = boneco antigo) e o sexo (a ficha do tipo).
    typeOf(npc) { const s = npc.actor && npc.actor.sheet; return s && s.isNpc ? String(s.id).replace(/#d\d+$/, '') : null; },
    _sex(id) {
        try { if (id && typeof NpcData !== 'undefined' && NpcData.d) return NpcData.variantSpec(id, 0).gender === 'f' ? 'f' : 'm'; } catch (e) { /* ficha desconhecida */ }
        return 'm';
    },
    _hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },

    // Os dados fixos de quem o pedestre é agora: { key, id, sex, old, r (sorteio de revidar), w (sorteio da arma) } — 0..1.
    of(npc) {
        const id = this.typeOf(npc), key = npc.id + '|' + (id || (npc.id % 2 ? 'civB' : 'civA')) + '|' + (npc.actor ? npc.actor.npcRow : 0);
        const T = npc._temper;
        if (T && T.key === key) return T;
        const h = this._hash(key);
        return (npc._temper = { key, id, sex: this._sex(id), old: !!id && this.OLD.test(id), r: (h % 10007) / 10007, w: ((h >>> 14) % 10009) / 10009 });
    },

    // Periferia? (favela, periferia, porto e indústria)
    periphery(game, x, z) {
        const e = game && game.empire;
        if (e && e.districtAt) return this.PERIPHERY.includes(e.districtAt(x, z));
        return typeof Standing !== 'undefined' && !!Standing.inFavela && Standing.inFavela(x, z);
    },

    // O desenho tem os clipes de brigar com `w`? ('none' sempre)
    // (no manifesto, sem os substitutos do getClip — que trocam a faca pela mão livre)
    has(npc, w) {
        if (!w || w === 'none') return true;
        const key = (w === 'pistol' ? 'shoot' : this.BLOW[w]) + ':' + w;
        return this._atlases(npc).some((A) => !!A.data.clips[key]);
    },
    _atlases(npc) {
        const s = npc.actor && npc.actor.sheet;
        if (!s || !s.isNpc || !s.atlasList || typeof NpcArt === 'undefined') return [];
        return s.atlasList().map((id) => NpcArt.atlases[id]).filter(Boolean);
    },

    // Quem é, ali onde está: { sex, fighter, weapon: null | 'knife' | 'bat' | 'pistol' } (a arma só se o desenho tem os clipes).
    profile(npc, game = npc.ctx && npc.ctx.game) {
        const C = Config.npc.temper, d = this.of(npc), per = this.periphery(game, npc.position.x, npc.position.z), oldK = d.old ? C.oldK : 1;
        let fighter, weapon = null;
        if (d.sex === 'f') {
            fighter = d.r < (per ? C.womenPeriphery : C.women) * oldK;
            if (fighter) weapon = d.w < C.womenBat ? 'bat' : 'knife';
        } else {
            fighter = d.r < C.men * oldK;
            const k = per ? C.periphery : 1;
            if (fighter) weapon = d.w < C.gun * k ? 'pistol' : d.w < (C.gun + C.knife) * k ? 'knife' : null;
        }
        if (weapon && !this.has(npc, weapon)) weapon = null;
        return { sex: d.sex, fighter, weapon };
    },

    // Revida? attack = 'hand' | 'blade' | 'gun' (outra coisa — atropelamento, explosão — ninguém revida); foe = o agressor.
    // → null (foge) ou { weapon (com que entra na briga), armed (a arma que ele tem, para a escalada) }.
    reply(npc, attack, foe, game) {
        if (!attack) return null;
        const P = this.profile(npc, game);
        if (!P.fighter) return null;
        const w = P.weapon;
        if (attack === 'hand') return { weapon: P.sex === 'f' && w ? w : 'none', armed: w };          // (ela já vem com a faca/o taco)
        if (!w) return null;                                                                        // atacado com arma: só quem tem uma
        if (attack === 'gun' && w !== 'pistol' && (!foe || hypot(foe.position.x - npc.position.x, foe.position.z - npc.position.z) > Config.npc.temper.closeVsGun)) return null;
        return { weapon: w, armed: w };
    },

    // Que ameaça `foe` traz na mão agora: 'gun' | 'blade' | 'hand' (o jogador: a arma equipada; um pedestre brigando: a dele).
    threat(foe, game) {
        if (game && foe === game.player) {
            const W = typeof Weapons !== 'undefined' && Weapons[foe.weapon];
            return W && W.gun ? 'gun' : W && W.melee && foe.weapon !== 'fists' ? 'blade' : 'hand';
        }
        const S = foe && foe.fsm && foe.fsm.current, w = S && S.weapon;
        return w === 'pistol' ? 'gun' : w === 'knife' || w === 'bat' ? 'blade' : 'hand';
    },

    // O jogador ATIROU (Game._onAttack): ataque com arma de fogo também para quem ele mirou ou estava do lado — e não só para quem a
    // bala pegou (um tiro de pistola deixa um pedestre com 20% da vida: ninguém revidaria). Quem anda armado (revólver; faca, colado)
    // e topa, saca e responde; o resto foge com o alerta do tiro (chamado depois).
    onPlayerShot(game, pos, angle) {
        if (!game.npcManager || !game.combat) return 0;
        const ux = Math.sin(angle), uz = Math.cos(angle), pl = game.player;
        let n = 0;
        for (const npc of game.npcManager.npcs) {
            if (!npc.alive || npc.rag || npc.free || npc.index < 0 || npc._rage || /^(FIGHT|HURT|SURRENDER|MUG|DEAD|RAG)$/.test(npc.state)) continue;
            const dx = npc.position.x - pos.x, dz = npc.position.z - pos.z, d = hypot(dx, dz);
            if (d > 18 || d < 0.1) continue;
            const along = dx * ux + dz * uz, off = Math.abs(dx * uz - dz * ux);
            if (!(d <= 6 || (along > 0 && off < 2.5))) continue;                   // mirou nele (passou a menos de 2,5 m) ou atirou do lado dele
            if (npc.hp < npc.maxHp * 0.4 || !MapGeo.hasLineOfSight(pos.x, pos.z, npc.position.x, npc.position.z)) continue;
            const R = this.reply(npc, 'gun', pl, game);
            if (!R) continue;
            npc.threat.set(pos.x, 0, pos.z);
            npc.fsm.setState(new FightState(npc, pl, R));
            n++;
        }
        return n;
    },

    // Pede já as páginas dos clipes da arma (a faca/o taco/o revólver moram em páginas à parte: NpcGenTypes `lazy`) — chegam enquanto
    // ele cambaleia ou saca, em vez de ele congelar no último quadro desenhado.
    prefetch(npc, w) {
        if (!w || w === 'none') return;
        for (const A of this._atlases(npc)) {
            for (const n of w === 'pistol' ? ['draw', 'aim', 'shoot', 'idle', 'run'] : [this.BLOW[w], 'idle', 'run']) {
                const c = A.data.clips[n + ':' + w] && NpcArt.clip(A.id, n + ':' + w);
                if (c && c.pages) NpcArt.wantClip(c);
            }
        }
    },
};
