// ============================================================================
// Aim — a MIRA do jogador com arma de fogo (segurar LT/L2 no controle ou o botão direito do mouse).
//   ASSISTIDA (padrão): trava no alvo mais provável à frente (polícia e facção têm preferência); o analógico direito (empurrão) ou o
//                       cursor do mouse trocam de alvo. O corpo vira para o alvo numa velocidade que depende da habilidade.
//   MANUAL:             você aponta — analógico direito (controle) ou cursor do mouse; nada é travado. Erra menos que a assistida
//                       quando a mira está firme (recompensa a precisão).
//   (Escolha em Ajustes › Mira; fica em PauseMenu.settings.aimAssist.)
// PONTARIA — quanto o personagem acerta. Vem das habilidades do ramo COMBATE: "Mão firme" (dispersão) e "Olho de águia" (mira):
//   • a mira FIRMA com o tempo parado mirando (de 0,85 s a 0,35 s): o círculo da mira encolhe até a dispersão mínima;
//   • a dispersão mínima cai com a pontaria; andar abre o círculo; cada tiro dá um coice que desfirma um pouco (menos com pontaria);
//   • a mira assistida trava mais longe e vira mais rápido para o alvo.
// Sem mirar (tiro "do quadril") é como antes: assistida puxa um pouco para quem está bem à frente; manual sai reto.
// O círculo na tela mostra a dispersão real do próximo tiro: é a área onde a bala pode cair.
// ============================================================================

class Aim {
    constructor(game) {
        this.g = game;
        this.active = false;        // mirando agora
        this.target = null;         // alvo travado (assistida)
        this.heading = 0;           // direção da mira (rad, 0 = norte/+z)
        this.settle = 0;            // 0 = acabou de levantar a arma · 1 = mira firme
        this._stickHeld = false;
        this._mouseT = 0;
        this._build();
    }

    get assisted() { return this.g.menu.settings.aimAssist !== false; }

    // Pontaria de 0 a 1 (as duas habilidades no máximo = 1). Mostrada no STATUS.
    static quality() {
        const m = SkillTree.m || {};
        return Math.max(0, Math.min(1, (m.spread || 0) / 0.36 * 0.5 + (m.aim || 0) / 0.3 * 0.5));
    }
    static aimSkill() { return Math.max(0, Math.min(1, ((SkillTree.m || {}).aim || 0) / 0.3)); }

    // ------------------------------------------------------------------ por quadro
    update(dt) {
        const g = this.g, p = g.player, inp = g.input, W = Weapons[p.weapon];
        const can = g.mode === 'player' && p.alive && W && W.gun && !p.swimming && !p.rag && !g.lockpick.active && !g.hiding && !g.holdup
            && !g.arrest && !g.death && !g.inventoryOpen && !g.menu.isOpen && !(g.motoUI && g._modalUiOpen());
        if (!can || !inp.aimHeld) { if (this.active) this._stop(); return; }

        const q = Aim.quality(), qa = Aim.aimSkill();
        if (!this.active) { this.active = true; this.settle = 0; this.target = null; this.heading = p.root.rotation.y; }
        this.settle = Math.min(1, this.settle + dt / (0.85 - 0.5 * q));

        // De onde vem a direção: analógico direito (controle) ou cursor (mouse, se foi o último usado).
        const rs = inp.rstick, stickMag = Math.hypot(rs.x, rs.y);
        const stickDir = stickMag > 0.35 ? Math.atan2(rs.x, -rs.y) : null;
        const mouse = !inp.usingPad ? this._mouseGround() : null;
        const mouseDir = mouse ? Math.atan2(mouse.x - p.position.x, mouse.z - p.position.z) : null;

        let want;
        if (this.assisted) {
            const range = Math.min(W.range, 24 + 14 * qa);
            if (this.target && !this._valid(this.target, range * 1.15)) this.target = null;
            // Trocar de alvo: empurrão do analógico (borda) ou o cursor passando perto de outro.
            const flick = stickMag > 0.75 && !this._stickHeld;
            this._stickHeld = stickMag > 0.5;
            if (flick) this.target = this._best(stickDir, 0.7, range, this.target) || this.target;
            else if (mouse && performance.now() - inp.mouseMovedAt < 120) {
                const t = this._nearPoint(mouse, 3.5, range);
                if (t) this.target = t;
            }
            if (!this.target) this.target = this._best(stickDir ?? mouseDir ?? this.heading, 0.9, range, null);
            want = this.target ? Math.atan2(this.target.position.x - p.position.x, this.target.position.z - p.position.z) : (stickDir ?? mouseDir ?? this.heading);
            this.heading = this._lerpAngle(this.heading, want, 1 - Math.exp(-(7 + 11 * q) * dt));      // vira para o alvo (pontaria = mais rápido)
        } else {
            this.target = null;
            want = stickDir ?? mouseDir ?? this.heading;
            this.heading = this._lerpAngle(this.heading, want, 1 - Math.exp(-20 * dt));
        }
        p.aimHeading = this.heading;
        this._mouse = mouse;
        this._draw(W, q);
    }

    _stop() {
        this.active = false; this.target = null; this.settle = 0;
        this.g.player.aimHeading = null;
        this.ret.style.display = 'none';
    }

    // ------------------------------------------------------------------ disparo (Game._onAttack)
    // Direção do tiro: mirando = a mira; sem mirar = assistida puxa de leve (cone estreito), manual sai reto.
    shotAngle(x, z, heading) {
        if (this.active) return this.heading;
        return this.assisted ? this.g.combat.aimAssist(x, z, heading) : heading;
    }

    // Multiplicador da dispersão da arma para o próximo tiro (já com a habilidade Mão firme).
    spreadMul() {
        const base = 1 - ((SkillTree.m || {}).spread || 0);
        if (!this.active) return base;
        const qa = Aim.aimSkill(), s = this.settle, ease = s * s * (3 - 2 * s);
        const steady = (this.assisted ? 0.55 : 0.42) - 0.22 * qa;                 // dispersão com a mira firme (manual erra menos)
        let mul = 1.1 + (steady - 1.1) * ease;
        if (this.g.player.speed > 0.6) mul *= 1.35;                                 // andando mirando: mais aberto
        return base * mul;
    }

    // Coice: cada tiro desfirma um pouco a mira (rajadas abrem o círculo; a pontaria segura melhor).
    onShot(weaponKey) {
        if (!this.active) return;
        const W = Weapons[weaponKey], kick = W && W.auto ? 0.16 : (W && W.pellets > 1 ? 0.5 : 0.3);
        this.settle = Math.max(0, this.settle - kick * (1 - 0.55 * Aim.quality()));
    }

    // ------------------------------------------------------------------ alvos
    _forTargets(fn) {
        const g = this.g;
        if (g.npcManager) for (const n of g.npcManager.npcs) if (n.alive) fn(n, 1);
        if (g.policeManager) {
            for (const o of g.policeManager.officers) if (o.alive) fn(o, 0.7);
            const h = g.policeManager.heli;
            if (h && h.alive) fn(h, 0.8);
        }
        if (g.gangs) for (const o of g.gangs.members) if (o.alive) fn(o, 0.7);
        if (g.watch && g.watch.lookouts) for (const o of g.watch.lookouts) if (o.alive && o.actor) fn(o, 0.9);
    }

    _sees(t) {
        const p = this.g.player.position;
        return t.flying || MapGeo.hasLineOfSight(p.x, p.z, t.position.x, t.position.z);
    }

    _valid(t, range) {
        if (!t || !t.alive) return false;
        const p = this.g.player.position, d = Math.hypot(t.position.x - p.x, t.position.z - p.z);
        return d <= range && d > 0.5 && this._sees(t);
    }

    // Melhor alvo num cone em torno de `dir` (exclui `skip`). Preferência: perto do centro do cone, perto do jogador, polícia/facção.
    _best(dir, cone, range, skip) {
        const p = this.g.player.position;
        let best = null, bs = Infinity;
        this._forTargets((t, w) => {
            if (t === skip) return;
            const dx = t.position.x - p.x, dz = t.position.z - p.z, d = Math.hypot(dx, dz);
            if (d > range || d < 0.5) return;
            const da = Math.abs(this._wrap(Math.atan2(dx, dz) - dir));
            if (da > cone) return;
            const s = (da * 14 + d * 0.3) * w;
            if (s < bs && this._sees(t)) { bs = s; best = t; }
        });
        return best;
    }

    // Alvo mais perto de um ponto do chão (cursor do mouse).
    _nearPoint(pt, radius, range) {
        const p = this.g.player.position;
        let best = null, bd = radius;
        this._forTargets((t) => {
            const d = Math.hypot(t.position.x - pt.x, t.position.z - pt.z);
            if (d < bd && Math.hypot(t.position.x - p.x, t.position.z - p.z) <= range && this._sees(t)) { bd = d; best = t; }
        });
        return best;
    }

    // ------------------------------------------------------------------ tela
    // Ponto do chão sob o cursor do mouse (raio da câmera × plano y = 0), ou null.
    _mouseGround() {
        const inp = this.g.input;
        if (inp.mouseX < 0) return null;
        const sc = this.g.scene, cam = sc.activeCamera, cv = sc.getEngine().getRenderingCanvas();
        if (!cam || !cv) return null;
        const r = cv.getBoundingClientRect();
        const ray = sc.createPickingRay(inp.mouseX - r.left, inp.mouseY - r.top, BABYLON.Matrix.Identity(), cam);
        if (Math.abs(ray.direction.y) < 1e-4) return null;
        const t = -ray.origin.y / ray.direction.y;
        return t > 0 ? { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t } : null;
    }

    // Mundo (x, z) -> pixel CSS da janela.
    _toScreen(x, z) {
        const sc = this.g.scene, eng = sc.getEngine(), cam = sc.activeCamera, cv = eng.getRenderingCanvas();
        const w = eng.getRenderWidth(), h = eng.getRenderHeight(), r = cv.getBoundingClientRect();
        const v = BABYLON.Vector3.Project(this._v.set(x, 0.6, z), this._I, sc.getTransformMatrix(), cam.viewport.toGlobal(w, h));
        return { x: r.left + v.x * r.width / w, y: r.top + v.y * r.height / h };
    }

    // Círculo da mira: no alvo (assistida) ou no ponto apontado; o raio é a dispersão real naquela distância.
    _draw(W, q) {
        const p = this.g.player.position, el = this.ret;
        let ax, az;
        if (this.target) { ax = this.target.position.x; az = this.target.position.z; }
        else if (this._mouse) { ax = this._mouse.x; az = this._mouse.z; }
        else { const d = Math.min(W.range * 0.55, 14); ax = p.x + Math.sin(this.heading) * d; az = p.z + Math.cos(this.heading) * d; }
        const dist = Math.max(2, Math.hypot(ax - p.x, az - p.z));
        const c = this._toScreen(ax, az);
        const spread = W.spread * this.spreadMul() * (W.pellets > 1 ? 0.8 : 1);
        const side = this._toScreen(ax + Math.cos(this.heading) * dist * Math.tan(spread), az - Math.sin(this.heading) * dist * Math.tan(spread));
        const rad = Math.max(11, Math.min(90, Math.hypot(side.x - c.x, side.y - c.y)));
        el.style.display = 'block';
        el.style.transform = `translate(${c.x - rad}px, ${c.y - rad}px)`;
        el.style.width = el.style.height = rad * 2 + 'px';
        el.className = (this.target ? 'lock' : '') + (this.settle >= 0.98 ? ' steady' : '');
    }

    _build() {
        this._v = new BABYLON.Vector3(); this._I = BABYLON.Matrix.Identity();
        const css = document.createElement('style');
        css.textContent = `
            #aimRet { position: fixed; left: 0; top: 0; z-index: 5; pointer-events: none; display: none; box-sizing: border-box; border-radius: 50%;
                border: 2px solid rgba(255,255,255,0.85); box-shadow: 0 0 0 1px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.4); transition: border-color .12s; }
            #aimRet::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px #000; }
            #aimRet.lock { border-color: #ff4a4a; } #aimRet.lock::after { background: #ff4a4a; }
            #aimRet.steady { border-width: 3px; } #aimRet.steady:not(.lock) { border-color: #4ade80; }`;
        document.head.appendChild(css);
        this.ret = document.createElement('div');
        this.ret.id = 'aimRet';
        document.body.appendChild(this.ret);
    }

    _wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
    _lerpAngle(a, b, t) { return a + this._wrap(b - a) * t; }
}
