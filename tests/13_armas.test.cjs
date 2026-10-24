// Armas da folha (tools/asset_baker/source/armas.jpg → armas.cjs → generator/armas_sprites.js → NpcGenChar "ARMAS DA FOLHA"): o
// desenho de cada arma vira o objeto 3D na mão dos personagens. Confere, no gerador, as proporções (comprimento de verdade) e as cores
// da folha em cada arma; no jogo, que o revólver e a AK-47 do jogador saem com o desenho deles (atlas protagonista_armas), que o tiro
// sai da ponta do cano desenhado e que os civis armados (revólver) e os traficantes de fuzil (AK) têm os clipes.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT, boot, gameWait } = require('./lib.cjs');

// O gerador num contexto à parte (o mesmo que o bake.cjs carrega).
function loadGen() {
    const dir = path.join(ROOT, 'tools', 'asset_baker', 'generator'), ctx = vm.createContext({ console });
    for (const f of ['NpcGenCore.js', 'NpcGenChar.js', 'NpcGenRender.js', 'NpcGenAnims.js', 'NpcGenTypes.js', 'NpcGenBuild.js', 'malha3d.js', 'NpcGenMesh.js', 'veiculos_occ.js', 'armas_sprites.js']) {
        const p = path.join(dir, f);
        if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p });
    }
    return { G: vm.runInContext('(() => { const G = {}; NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G); return G; })()', ctx), A: vm.runInContext('typeof NPC_ARMAS === "undefined" ? null : NPC_ARMAS', ctx) };
}

module.exports = {
    name: 'armas',
    async run(ctx, c) {
        // 1) gerador: as armas da folha, no tamanho de verdade e com as cores dela
        const { G, A } = loadGen();
        const SHEET = ['pistol', 'revolver', 'pistol_sil', 'smg', 'rifle_ak', 'rpg', 'rpg_head', 'launcher', 'minigun', 'grenade', 'molotov', 'molotov_fogo0'];
        c.ok(A && SHEET.every((k) => A[k] && A[k].rows.length === A[k].h), `folha convertida: ${SHEET.filter((k) => !(A && A[k])).join(', ') || 'todas as armas'}`);
        const len = (k) => A[k].w * A[k].s;                                  // (comprimento do desenho, unidades do gerador: 1 u ≈ 1,9 cm)
        const L = Object.fromEntries(['pistol', 'revolver', 'pistol_sil', 'smg', 'rifle_ak', 'rpg', 'launcher', 'minigun', 'grenade'].map((k) => [k, len(k)]));
        c.ok(L.pistol < L.revolver && L.revolver < L.pistol_sil && L.pistol_sil < L.smg && L.smg < L.rifle_ak && L.grenade < L.pistol, 'proporções: granada < pistola < revólver < silenciador < SMG < AK — ' + Object.entries(L).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · '));
        c.ok(Math.abs(L.rifle_ak * 0.019 - 0.88) < 0.15 && L.rpg * 0.019 > 0.8 && L.launcher * 0.019 > 0.8, `AK-47 com ~0,88 m (${(L.rifle_ak * 0.019).toFixed(2)} m), RPG e lança-foguetes com mais de 0,8 m`);
        const props = G.bakeProps(0.6), M = G.M;
        const mats = (k) => { const p = props[k], s = new Set(); for (let i = 0; i < p.n; i++) s.add(p.mat[i]); return s; };
        const want = { rifle_ak: [M.wood, M.metal], revolver: [M.chrome], launcher: [M.green], rpg_head: [M.green], molotov: [M.wood], molotov_fogo0: [M.gold], grenade: [M.green] };
        for (const [k, ms] of Object.entries(want)) c.ok(props[k] && ms.every((m) => mats(k).has(m)), `${k}: pintada com as cores da folha`);
        const tip = G.PROP_MUZZLE.rifle_ak, B = props.rifle_ak;
        let ymax = -1e9; for (let i = 0; i < B.n; i++) ymax = Math.max(ymax, B.pos[i * 3 + 1]);
        c.ok(tip && Math.abs(tip[1] - ymax) < 2, `boca do cano da AK na ponta do desenho (y ${tip && tip[1].toFixed(1)} · ponta ${ymax.toFixed(1)})`);

        // 2) no jogo
        const { page, errors, close } = await boot(ctx);
        const data = await page.evaluate(() => {
            const T = NpcData.d.types, arms = NpcArt.atlases.protagonista_armas, clips = arms ? arms.data.clips : {};
            const has = (id, k) => !!(NpcArt.atlases[id] && NpcArt.atlases[id].data.clips[k]);
            return {
                guns: { civil: T.civil_mano.guns.pistol, hero: T.protagonista.guns.ak47 },
                looks: { revolver: Weapons.revolver.look || 'revolver', ak47: Weapons.ak47.look || 'ak47' },
                arms: ['idle:revolver', 'aim:revolver', 'shoot:revolver', 'idle:ak47', 'aim:ak47', 'shoot:ak47', 'run:ak47'].filter((k) => !clips[k]),
                npc: { civil: has('civil_mano', 'aim:pistol') && has('civil_mano', 'shoot:pistol'), fuzil: has('trafic_fuzil', 'shoot:smg') },
                muzzle: ['pistol', 'revolver', 'ak47', 'smg'].map((w) => !!NpcData.muzzle(w)),
            };
        });
        c.eq(data.guns.civil, 'revolver', 'civis homens armados desenham o revólver');
        c.eq(data.guns.hero, 'rifle_ak', 'a AK-47 do jogador é desenhada como a AK da folha');
        c.ok(data.looks.revolver === 'revolver' && data.looks.ak47 === 'ak47', `revólver e AK-47 com desenho próprio na mão (${data.looks.revolver}, ${data.looks.ak47})`);
        c.ok(!data.arms.length, `atlas protagonista_armas com os clipes do revólver e da AK${data.arms.length ? ' — faltam ' + data.arms.join(', ') : ''}`);
        c.ok(data.npc.civil && data.npc.fuzil, 'civis armados e traficante de fuzil com os clipes de mirar/atirar');
        c.ok(data.muzzle.every(Boolean), 'ponta do cano medida no build para pistola, revólver, AK-47 e SMG');

        // o jogador saca o revólver e a AK-47: o desenho vem do atlas das armas, e o tiro sai da ponta do cano desenhado
        for (const w of ['revolver', 'ak47']) {
            await page.evaluate((w) => { game.inventory.give(w, 60); game.player.action = null; game.equipWeapon(w); }, w);
            await gameWait(page, 1.2);
            const r = await page.evaluate((w) => {
                const p = game.player, a = p.actor, cl = a.clip, ang = p.root.rotation.y, tip = Combat.muzzleOffset(p.look, ang, a);
                const b0 = new Set(game.combat.bullets.filter((b) => b.on));
                game.combat.fire({ x: p.position.x, z: p.position.z, angle: ang, owner: 'player', ref: p }, w);
                const b = game.combat.bullets.find((q) => q.on && !b0.has(q));
                return { look: p.look, clip: cl && cl.name + ':' + cl.weapon, atlas: cl && cl.atlas, tip, d: b && tip ? Math.hypot(b.x - p.position.x - tip[0], b.z - p.position.z - tip[1]) : null };
            }, w);
            c.ok(r.look === w && r.clip && r.clip.endsWith(':' + w), `${w}: na mão com o clipe dele (${r.clip}, atlas ${r.atlas})`);
            c.ok(r.atlas === 'protagonista_armas' || /^hero:/.test(r.atlas || ''), `${w}: desenho do atlas das armas (${r.atlas})`);
            c.ok(r.tip && Math.hypot(r.tip[0], r.tip[1]) > 0.3 && r.d != null && r.d < 0.05, `${w}: a bala sai da ponta do cano desenhado (${r.tip ? Math.hypot(r.tip[0], r.tip[1]).toFixed(2) : '—'} m à frente; desvio ${r.d == null ? '—' : r.d.toFixed(3)})`);
        }
        const far = await page.evaluate(() => { const p = game.player, a = p.actor, ang = p.root.rotation.y, n = (w) => { const t = Combat.muzzleOffset(w, ang, null); return t ? Math.hypot(t[0], t[1]) : 0; }; return { ak: n('ak47'), pistol: n('pistol') }; });
        c.ok(far.ak > far.pistol, `o cano da AK-47 vai mais longe que o da pistola (${far.ak.toFixed(2)} × ${far.pistol.toFixed(2)} m)`);

        // visual do guarda-roupa sem o atlas das armas: o revólver sai como a pistola na roupa dele (não na roupa inicial)
        const alt = await page.evaluate(() => {
            const f = PlayerLook.drawsArms; PlayerLook.drawsArms = () => false;
            game.player.weapon = 'revolver'; const r = game.player.look; game.player.weapon = 'ak47'; const a = game.player.look;
            PlayerLook.drawsArms = f; return { r, a };
        });
        c.ok(alt.r === 'pistol' && alt.a === 'smg', `sem o atlas das armas no visual: revólver → ${alt.r}, AK-47 → ${alt.a}`);

        c.noErrors(errors, 'armas');
        await close();
    },
};
