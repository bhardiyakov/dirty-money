// ============================================================================
// FavelaWatch — o sistema de alarme da favela:
//   • FOGUETEIROS: ficam SEMPRE nos telhados (sprite no alto de uma laje; ~14, mais perto da entrada). Parados e fora de alcance,
//     soltam pipas de dia (sem chuva) e UMA salva de fogos (~8 s) quando o alarme liga (a polícia entra) e param, mesmo que o alarme (e a invasão) continue.
//   • OLHEIROS: nos cantos da favela e nas vielas de entrada (~8). Enxergam a polícia que entra na favela (alcance 55 u + linha de
//     visada; na operação, o rádio avisa) e ligam o alarme. Aí FOGEM "para cima" — favela adentro, rumo aos traficantes (em
//     saltos pelas vielas) — e, passado o alarme, voltam ao posto.
// Os dois existem como DADOS o tempo todo (o alarme dispara mesmo longe); só viram sprite quando o jogador chega a ~120 u.
// ============================================================================

class FavelaWatch {
    constructor(game) {
        this.game = game;
        this.rockets = null; this.lookouts = null;
        this._t = 0; this._det = 0; this._prevAlarm = 0; this.volley = 0;
        this.streamIn = 120;
    }

    _build() {
        const b = Standing._bounds(), W = b.x1 - b.x0, rng = Pixel.rng(4242), home = SafeHouse.spawnWorld(), sheet = this.game.sprites.sheets.civA;
        this.sheet = sheet; this.rockets = []; this.lookouts = [];
        // fogueteiros: uma laje por faixa de profundidade (14 faixas)
        const slices = Array.from({ length: 14 }, () => []);
        for (const blk of CityGrid.blocks) {
            if (blk.district !== 'favela') continue;
            for (const l of blk.lots) {
                if ((l.x1 - l.x0) * (l.z1 - l.z0) < 28 || (l.height || 0) < 6) continue;
                const x = (l.x0 + l.x1) / 2, z = (l.z0 + l.z1) / 2;
                if (home && hypot(x - home.x, z - home.z) < 30) continue;
                const k = Math.min(13, Math.floor(Standing.depth(x, z) * 14));
                slices[k].push({ x, z, h: l.height });
            }
        }
        for (const s of slices) if (s.length) { const l = s[Math.floor(rng() * s.length)]; this.rockets.push({ x: l.x, z: l.z, h: l.h, actor: null, fire: rng() * 2 }); }
        // olheiros: 4 cantos + 3 vielas de entrada
        const anchors = [[b.x0 + 12, b.z0 + 12], [b.x0 + 12, b.z1 - 12], [b.x1 - 12, b.z0 + 12], [b.x1 - 12, b.z1 - 12],
            [b.x1 - 6, b.z0 + 60], [b.x1 - 6, (b.z0 + b.z1) / 2], [b.x1 - 6, b.z1 - 60]];
        for (const [ax, az] of anchors) {
            const r = RoadPlan.nearestRoadPoint(ax, az, 45);
            if (!r || !Standing.inFavela(r.x, r.z)) continue;
            const L = { post: { x: r.x, z: r.z }, x: r.x, z: r.z, state: 'post', t: 0, actor: null, idx: -1, tr: null, hop: 0, alive: true, hp: 40, respawn: 0, position: { x: r.x, y: 0, z: r.z }, kind: 'lookout' };
            L.takeDamage = (amount, from, source) => this._hit(L, amount, from, source);
            this.lookouts.push(L);
        }
    }

    // ---------------------------------------------------------------- sprites (streaming)
    _vis(x, z) { const f = this.game.camera.target; return hypot(x - f.x, z - f.z) < this.streamIn; }

    _stream() {
        const nav = this.game.nav, scene = this.game.scene, sprites = this.game.sprites;
        const [va, vb] = CharacterRig.VARIANT_GROUPS.poor;
        for (const R of this.rockets) {
            const on = this._vis(R.x, R.z);
            if (on && !R.actor) {
                R.actor = new SpriteActor(scene, this.sheet, va + Math.floor(Math.random() * (vb - va + 1)), 'fogueteiro');
                R.actor.play('idle'); R.actor.setPosition(R.x, R.z); R.actor.mesh.position.y = R.h + 0.5; R.actor.setHeading(Math.random() * Math.PI * 2);
            } else if (!on && R.actor) { R.actor.dispose(); R.actor = null; this._kiteDrop(R); }
        }
        for (const L of this.lookouts) {
            const on = this._vis(L.x, L.z);
            if (on && !L.actor) {
                const p = nav.closestPoint(new BABYLON.Vector3(L.x, 0, L.z));
                L.actor = new SpriteActor(scene, this.sheet, va + Math.floor(Math.random() * (vb - va + 1)), 'olheiro');
                L.actor.play('idle', 'none'); L.heading = Math.random() * Math.PI * 2;
                L.tr = new BABYLON.TransformNode('olheiro', scene); L.tr.position = p.clone();
                if (L.alive) L.idx = nav.crowd.addAgent(p, { radius: Config.police.officerRadius, height: 1.6, maxAcceleration: 40, maxSpeed: 2, collisionQueryRange: 2, pathOptimizationRange: 3, separationWeight: 2 }, L.tr);
                else { L.actor.play('dead', 'none'); L.actor.setPosition(L.x, L.z); }
                L.dest = null;
            } else if (!on && L.actor) this._unstream(L);
        }
    }

    // Olheiro baleado: cai; matá-lo azeda a moral com o tráfico (e provoca os traficantes por perto). Volta ao posto depois de ~3 min.
    _hit(L, amount, from, source) {
        if (!L.alive) return;
        L.hp -= amount;
        if (L.hp > 0) return;
        L.alive = false; L.respawn = 180; L.state = 'post';
        if (L.idx >= 0) { this.game.nav.crowd.removeAgent(L.idx); L.idx = -1; }
        if (L.actor) L.actor.play('dead', 'none', { restart: true });
        if (source === 'player') {
            Standing.add('traffic', -6);
            this.game._flash('Você abateu um olheiro do C.V! (moral com o tráfico −6)');
            if (this.game.gangs) this.game.gangs._provoke(L);
        }
    }

    _unstream(L) {
        if (L.idx >= 0) this.game.nav.crowd.removeAgent(L.idx);
        L.idx = -1; L.tr.dispose(); L.tr = null; L.actor.dispose(); L.actor = null;
    }


    // ---------------------------------------------------------------- pipas (de dia, sem chuva, sem alarme)
    _kiteWanted() {
        const g = this.game, h = g.dayNight.hour, st = g.weather ? g.weather.state : 'clear';
        return this.inside !== false && h >= 7 && h < 17.5 && !(Standing.alarm > 0) && !/rain|storm|chuva|tempest/i.test(String(st));
    }
    _kiteMake(R, i) {
        const sc = this.game.scene, col = ['#ff4a4a', '#4ab0ff', '#ffd23f', '#5aff7a', '#ff7ad0'][i % 5];
        const m = BABYLON.MeshBuilder.CreateDisc('pipa', { radius: 0.95, tessellation: 4 }, sc);
        m.rotation.x = Math.PI / 2; m.rotation.y = Math.PI / 4;
        const mat = new BABYLON.StandardMaterial('pipaMat', sc); mat.diffuseColor = BABYLON.Color3.Black(); mat.specularColor = BABYLON.Color3.Black();
        mat.emissiveColor = BABYLON.Color3.FromHexString(col); mat.disableLighting = true; mat.backFaceCulling = false; m.material = mat; m.isPickable = false;
        const line = BABYLON.MeshBuilder.CreateLines('pipaFio', { points: [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, 1, 0)], updatable: true }, sc);
        line.color = new BABYLON.Color3(0.95, 0.95, 0.9); line.isPickable = false;
        R.kite = { m, line, i };
    }
    _kiteDrop(R) { if (!R.kite) return; R.kite.m.material.dispose(); R.kite.m.dispose(); R.kite.line.dispose(); R.kite = null; }
    _kiteUpdate(R, t) {
        const k = R.kite, i = k.i, hx = R.x, hz = R.z, hy = R.h + 1.6;
        const x = hx + 4 + 2.6 * Math.sin(t * 0.6 + i), z = hz + 5 + 2.2 * Math.cos(t * 0.5 + i * 1.7), y = R.h + 11 + 1.8 * Math.sin(t * 0.9 + i * 2.3);
        k.m.position.set(x, y, z); k.m.rotation.y = Math.PI / 4 + 0.35 * Math.sin(t * 1.3 + i);
        BABYLON.MeshBuilder.CreateLines(null, { points: [new BABYLON.Vector3(hx, hy, hz), new BABYLON.Vector3(x, y - 0.1, z)], instance: k.line });
    }
    // ---------------------------------------------------------------- alarme
    _detect() {
        const g = this.game, pm = g.policeManager; if (!pm) return false;
        if (g.op && g.op.active && g.op.t > 1.5 && g.op.cops.length) return true;           // na invasão o rádio avisa
        const seen = (u) => {
            if (!u.alive && u.alive !== undefined) return false;
            const x = u.position.x, z = u.position.z;
            if (!Standing.inFavela(x, z) || Standing.depth(x, z) < 0.02) return false;
            for (const L of this.lookouts) if (L.alive && hypot(L.x - x, L.z - z) < 55 && MapGeo.hasLineOfSight(L.x, L.z, x, z)) return true;
            return false;
        };
        for (const o of pm.officers) if (o.alive && !o.rag && seen(o)) return true;
        for (const c of pm.cars) if (!c.destroyed && seen(c)) return true;
        return false;
    }

    // Um passo de fuga/retorno: salto de até 35 u pelas vielas rumo a (tx, tz).
    _hop(L, tx, tz) {
        const nav = this.game.nav, a = nav.crowd.agents[L.idx], dx = tx - L.x, dz = tz - L.z, d = hypot(dx, dz);
        if (d < 6) return true;
        const k = Math.min(1, 35 / d), r = RoadPlan.nearestRoadPoint(L.x + dx * k, L.z + dz * k, 30);
        const p = nav.closestPoint(new BABYLON.Vector3(r ? r.x : L.x + dx * k, 0, r ? r.z : L.z + dz * k));
        L.dest = p;
        if (a && !a.path && !a.queued && L.hop++ >= 2) { nav.crowd.agentTeleport(L.idx, p); L.tr.position.copyFrom(p); L.hop = 0; }
        else nav.crowd.agentGoto(L.idx, p);
        return false;
    }

    update(dt, pos) {
        if (!this.rockets) this._build();
        const g = this.game;
        this.inside = Standing.nearFavela(pos.x, pos.z, 20);                                // fogos, pipas e alarme só existem com o jogador na favela
        if (!this.inside) { Standing.alarm = 0; this.volley = 0; this._prevAlarm = 0; }
        this._t -= dt; this._det -= dt;
        if (Standing.alarm > 0) Standing.alarm -= dt;
        if (this.volley > 0) this.volley -= dt;
        if (this._t <= 0) { this._t = 0.5; this._stream(); }

        // detecção (2,5×/s): polícia dentro da favela → liga/renova o alarme
        if (this._det <= 0 && this.inside) {
            this._det = 0.4;
            if (this._detect()) {
                if (!(Standing.alarm > 0)) {
                    g._flash('🎆 Fogos! Os olheiros avisaram: INVASÃO POLICIAL na favela!' + (g.op && g.op.reason ? ' (' + g.op.reason + ')' : ''));
                    AudioFX.blip(300, 0.4, 0.25);
                    this.volley = 8;                                                    // fogos só na entrada da polícia: uma salva de ~8 s e para
                    for (const L of this.lookouts) { L.state = 'flee'; L.t = 0; }
                }
                Standing.alarm = 90;
            }
        }
        if (this._prevAlarm > 0 && !(Standing.alarm > 0)) for (const L of this.lookouts) { L.state = 'return'; }
        this._prevAlarm = Standing.alarm > 0 ? 1 : 0;

        const b = Standing._bounds(), W = b.x1 - b.x0, f = g.camera.target;

        // fogueteiros: fogos enquanto o alarme durar (só gasta efeito perto da câmera)
        for (const R of this.rockets) {
            if (R.actor) {
                R.actor.update(dt, 1);
                const kw = this._kiteWanted();                                // pipa na mão de dia; some à noite, na chuva e no alarme
                if (kw && !R.kite) this._kiteMake(R, this.rockets.indexOf(R)); else if (!kw && R.kite) this._kiteDrop(R);
                if (R.kite) this._kiteUpdate(R, performance.now() / 1000);
            }
            if (!(this.volley > 0)) continue;                                  // (só durante a salva de entrada da polícia)
            R.fire -= dt;
            if (R.fire > 0 || hypot(R.x - f.x, R.z - f.z) > 110) continue;
            R.fire = 1.2 + Math.random() * 2.2;
            if (!g.fireworks.launch(R.x, R.z, R.h + 0.6)) R.fire = 0.6;           // (muitos fogos no ar: tenta de novo já já)
        }

        // olheiros: ficam no posto, fogem para o fundo no alarme e voltam depois
        for (const L of this.lookouts) {
            if (!L.alive) {                                                    // abatido: o corpo fica; passa o tempo longe da vista e ele volta
                L.position.x = L.x; L.position.z = L.z;
                if (L.actor) { L.actor.update(dt, 1); continue; }
                L.respawn -= dt;
                if (L.respawn <= 0) { L.alive = true; L.hp = 40; L.x = L.post.x; L.z = L.post.z; L.state = 'post'; }
                continue;
            }
            const target = L.state === 'flee' ? { x: b.x1 - W * 0.82, z: L.post.z } : (L.state === 'return' ? L.post : null);
            if (!L.actor) {                                                    // sem sprite: só os dados andam
                if (target) { L.x = target.x; L.z = target.z; if (L.state === 'return') L.state = 'post'; }
                continue;
            }
            const nav = g.nav, a = nav.crowd.agents[L.idx];
            if (target) {
                L.t -= dt;
                if (L.t <= 0) { L.t = 1.2; if (this._hop(L, target.x, target.z) && L.state === 'return') L.state = 'post'; }
            }
            const run = L.state === 'flee' ? 6.2 : (L.state === 'return' ? 2.4 : 2.0);
            if (a && a.params.maxSpeed !== run) { a.params.maxSpeed = run; nav.crowd.updateAgentParameters(L.idx, a.params); }
            const v = nav.crowd.getAgentVelocity(L.idx), sp = v ? hypot(v.x, v.z) : 0;
            if (sp > 0.4) { const ty = Math.atan2(v.x, v.z); let d = (ty - L.heading) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; L.heading += d * (1 - Math.exp(-12 * dt)); }
            L.actor.play(sp < 0.4 ? 'idle' : (L.state === 'flee' ? 'run' : 'walk'), 'none');
            L.x = L.tr.position.x; L.z = L.tr.position.z;
            L.position.x = L.x; L.position.z = L.z;
            L.actor.setPosition(L.x, L.z); L.actor.setHeading(L.heading); L.actor.update(dt, sp < 0.4 ? 1 : Math.max(0.7, sp / 3));
        }
    }
}
