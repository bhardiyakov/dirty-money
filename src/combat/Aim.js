// ============================================================================
// Aim — the player's AIM with a firearm. Always manual: the shot goes where the reticle is, wherever that is on the screen.
//   PC (mouse):   the cursor is the reticle. Holding the right button = STEADY aim (the body faces the reticle, walks slowly and the
//                 circle tightens with time).
//   GAMEPAD:      the right stick places the reticle around the player (direction and distance = how far it is pushed); RT fires.
//                 LT = steady aim.
//   PHONE:        the fire button turns into a right stick: dragging it places the reticle the same way, and the gun fires by
//                 itself while the reticle is over a target (a person, the helicopter, a car).
// Targets are found on the SCREEN, where they are drawn — a helicopter high in the air, someone on a deck or a roof, a car — not on
// the ground under the reticle; a shot at something high up flies over the buildings and only hits that target. With nothing under
// the reticle, the shot goes to the ground point under it (at chest height).
// PONTARIA — quanto o personagem acerta. Vem das habilidades do ramo COMBATE: "Mão firme" (dispersão) e "Olho de águia" (mira):
//   • a mira FIRMA com o tempo parado mirando (de 0,85 s a 0,35 s): o círculo da mira encolhe até a dispersão mínima;
//   • a dispersão mínima cai com a pontaria; andar abre o círculo; cada tiro dá um coice que desfirma um pouco (menos com pontaria).
// O círculo na tela mostra a dispersão real do próximo tiro: é a área onde a bala pode cair.
// ============================================================================

class Aim {
	static get AIM_HEIGHT() { return 1.2; }       // the ground under the reticle is taken at chest height (2.5D: what the eye points at)
	static get STICK_REACH() { return 0.42; }     // full stick = the reticle this fraction of the screen's short side away from the player
	static get HIGH() { return 2.5; }             // targets this high (m) or flying: the shot goes over the buildings, only at them

	constructor(game) {
		this.g = game;
		this.active = false;        // steady aim (right mouse button / LT)
		this.target = null;         // what is under the reticle (person, helicopter, car) or null
		this.point = null;          // ground point the shot goes to when there is no target
		this.heading = 0;           // aim direction (rad, 0 = north/+z)
		this.settle = 0;            // 0 = the gun just came up · 1 = steady
		this.source = null;         // where the reticle comes from: 'mouse' | 'stick' | 'touch' | null
		this.autoFire = false;      // phone: the reticle is over a target — the game fires
		this._sT = 0;               // (stick: holds the reticle a moment after it is released — release and fire)
		this._last = { x: 0, y: 0 };
		this._build();
	}

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
		inp.stickAim = can || !!(W && W.throwable && g.mode === 'player');      // (gun or grenade in hand: the right stick aims instead of zooming)
		const src = can ? this._reticle(dt) : null;
		if (!src) { this._release(); return; }
		const q = Aim.quality();
		if (inp.aimHeld) { if (!this.active) this.settle = 0; this.settle = Math.min(1, this.settle + dt / (0.85 - 0.5 * q)); } else this.settle = 0;
		this.active = inp.aimHeld;
		this.source = src.kind;
		this.target = this._pick(src.x, src.y);
		const at = this.target ? this.target.position : this._groundAt(src.x, src.y);
		this.point = at ? { x: at.x, z: at.z } : null;
		if (this.point) {
			const want = Math.atan2(this.point.x - p.position.x, this.point.z - p.position.z);
			this.heading = src.kind === 'mouse' ? want : this._lerpAngle(this.heading, want, 1 - Math.exp(-22 * dt));
		}
		// stick / finger, or the steady aim: the body faces the reticle (walks sideways, does not run); the mouse turns it at the shot
		p.aimHeading = this.active || src.kind !== 'mouse' ? this.heading : null;
		p.aimFree = src.kind !== 'mouse' && !this.active;
		this.autoFire = src.kind === 'touch' && !!this.target;
		this._draw(W, src);
	}

	_release() {
		const p = this.g.player;
		if (this.source || this.active) { p.aimHeading = null; p.aimFree = false; }
		this.active = false; this.settle = 0; this.target = null; this.point = null; this.source = null; this.autoFire = false;
		this.ret.style.display = 'none';
		this._cursor(false);
	}

	// Where the reticle is (CSS px of the window) and what moves it, or null. Phone: the fire button dragged as a stick
	// (input.touchAim). Gamepad: the right stick, held a moment after release; with LT and the stick at rest, ahead of the player.
	// Mouse: the cursor.
	_reticle(dt) {
		const inp = this.g.input;
		if (inp.touchAim) return this._fromStick(inp.touchAim, 'touch');
		if (inp.usingPad) {
			const rs = inp.rstick;
			if (Math.hypot(rs.x, rs.y) > 0.25) { this._last.x = rs.x; this._last.y = rs.y; this._sT = 0.3; } else this._sT -= dt;
			if (this._sT > 0) return this._fromStick(this._last, 'stick');
			return inp.aimHeld ? this._fromStick(this._facing(0.5), 'stick') : null;
		}
		if (this.g.touch && this.g.touch.shown) return null;
		return inp.mouseX >= 0 ? { x: inp.mouseX, y: inp.mouseY, kind: 'mouse' } : null;
	}
	_fromStick(v, kind) {
		const c = this._chest(), R = Aim.STICK_REACH * Math.min(window.innerWidth, window.innerHeight);
		return { x: c.x + v.x * R, y: c.y + v.y * R, kind };
	}
	// The way the player faces, as a stick vector of length `k` on the screen.
	_facing(k) {
		const p = this.g.player, h = p.root.rotation.y, c = this._chest(), f = this._screen(p.position.x + Math.sin(h) * 5, this._chestY(), p.position.z + Math.cos(h) * 5);
		const dx = f.x - c.x, dy = f.y - c.y, d = Math.hypot(dx, dy) || 1;
		return { x: dx / d * k, y: dy / d * k };
	}
	// Right stick (x right +, y down +) → world direction (rad, 0 = north), with the compass camera's turn. (Throwables)
	static stickAngle(rs) { return Math.atan2(rs.x, -rs.y) + (typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0); }
	_chestY() { return this.g.player.baseY - 0.5 + Aim.AIM_HEIGHT; }
	_chest() { const p = this.g.player.position; return this._screen(p.x, this._chestY(), p.z); }

	// Esconde a seta do mouse sobre o jogo enquanto o círculo da mira está no cursor (ele é a mira).
	_cursor(hide) {
		if (hide === this._cursorHidden) return;
		this._cursorHidden = hide;
		const cv = this.g.scene.getEngine().getRenderingCanvas();
		if (cv) cv.style.cursor = hide ? 'none' : '';
	}

	// ------------------------------------------------------------------ disparo (Game._onAttack)
	// Direction of the shot: at the target under the reticle (leading it if it moves), else at the point under the reticle, else
	// straight ahead.
	shotAngle(x, z, heading, weaponKey = this.g.player.weapon) {
		const W = Weapons[weaponKey], t = this.target;
		if (t && this._alive(t)) return this.g.combat.leadAngle(x, z, t, W ? W.speed : 0);
		if (this.point) return Math.atan2(this.point.x - x, this.point.z - z);
		return heading;
	}
	// Extra options of the shot: at a target high up (the helicopter, someone on a roof or deck) the bullet flies over the buildings
	// and only that target can be hit.
	shotOpts() {
		const t = this.target;
		return t && this._alive(t) && (this._targetKind === 'air' || this._targetY >= Aim.HIGH) ? { over: true, only: t } : null;
	}

	// Multiplicador da dispersão da arma para o próximo tiro (já com a habilidade Mão firme).
	spreadMul() {
		const base = 1 - ((SkillTree.m || {}).spread || 0);
		if (!this.active) return base;
		const qa = Aim.aimSkill(), s = this.settle, ease = s * s * (3 - 2 * s);
		const steady = 0.42 - 0.22 * qa;                                            // dispersão com a mira firme
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
	_alive(t) { return t.alive !== false && !t.destroyed; }

	// Everyone that can be shot: fn(target, kind, y) — 'person' (y = feet), 'air' (y = altitude), 'car' (y = the deck it is on).
	_forTargets(fn) {
		const g = this.g;
		const person = (t) => { if (t.alive && t.position) fn(t, 'person', t.actor && t.actor.mesh ? Math.max(0, t.actor.mesh.position.y - 0.5) : (t.position.y || 0)); };
		if (g.npcManager) for (const n of g.npcManager.npcs) person(n);
		if (g.policeManager) {
			for (const o of g.policeManager.officers) person(o);
			const h = g.policeManager.heli;
			if (h && h.alive) fn(h, 'air', h.alt || 0);
		}
		if (g.gangs) for (const o of g.gangs.members) person(o);
		if (g.watch && g.watch.lookouts) for (const o of g.watch.lookouts) if (o.actor) person(o);
		if (g.carDamage) for (const c of g.carDamage.allCars()) if (!c.destroyed && c !== g.activeCar) fn(c, 'car', c.elev || 0);
	}

	// What is drawn under the screen point (sx, sy), or null: a person by the line from the feet to the head as drawn (the standing
	// sprite), the helicopter by its body in the air, a car by its body. People win over a car under them.
	_pick(sx, sy) {
		const S = typeof SpriteActor !== 'undefined' && SpriteActor.standing() ? SpriteActor.STAND_SCALE : 1, ppm = this._pxPerM();
		let best = null, bs = 1;
		this._forTargets((t, kind, y) => {
			const P = t.position;
			let d, r;
			if (kind === 'person') {
				const a = this._screen(P.x, y + 0.2, P.z), b = this._screen(P.x, y + 1.7 * S, P.z);
				d = this._segDist(sx, sy, a, b); r = Math.max(14, 0.5 * ppm);
			} else if (kind === 'air') {
				const c = this._screen(P.x, y, P.z); d = Math.hypot(sx - c.x, sy - c.y); r = Math.max(24, 2.6 * ppm);
			} else {
				const c = this._screen(P.x, y + 0.8, P.z); d = Math.hypot(sx - c.x, sy - c.y) * 1.3; r = Math.max(18, (t.halfLen + t.halfW) * 0.5 * ppm);
			}
			const s = d / r;
			if (s < bs) { bs = s; best = t; this._targetKind = kind; this._targetY = y; }
		});
		return best;
	}

	// ------------------------------------------------------------------ tela
	// Pixels of the window per metre of camera-facing size (orthographic 2.5D: constant across the screen).
	_pxPerM() {
		const cv = this.g.scene.getEngine().getRenderingCanvas(), view = this.g.camera.view;
		return (cv ? cv.getBoundingClientRect().height : window.innerHeight) / (2 * Math.max(1, view));
	}
	_segDist(px, py, a, b) {
		const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1, u = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / l2));
		return Math.hypot(px - (a.x + vx * u), py - (a.y + vy * u));
	}
	// Ground point under a window point (the camera ray × the plane at the player's chest height), or null.
	_groundAt(sx, sy) {
		const sc = this.g.scene, cam = sc.activeCamera, cv = sc.getEngine().getRenderingCanvas();
		if (!cam || !cv) return null;
		const r = cv.getBoundingClientRect();
		const ray = sc.createPickingRay(sx - r.left, sy - r.top, BABYLON.Matrix.Identity(), cam);
		if (Math.abs(ray.direction.y) < 1e-4) return null;
		const h = typeof CompassCamera !== 'undefined' && CompassCamera.tilted ? this._chestY() : 0, t = (h - ray.origin.y) / ray.direction.y;
		return t > 0 ? { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t } : null;
	}
	// (Throwables: the ground under the mouse cursor.)
	_mouseGround() { const inp = this.g.input; return inp.mouseX >= 0 ? this._groundAt(inp.mouseX, inp.mouseY) : null; }

	// World point -> window CSS px.
	_screen(x, y, z) {
		const sc = this.g.scene, eng = sc.getEngine(), cam = sc.activeCamera, cv = eng.getRenderingCanvas();
		const w = eng.getRenderWidth(), h = eng.getRenderHeight(), r = cv.getBoundingClientRect();
		const v = BABYLON.Vector3.Project(this._v.set(x, y, z), this._I, sc.getTransformMatrix(), cam.viewport.toGlobal(w, h));
		return { x: r.left + v.x * r.width / w, y: r.top + v.y * r.height / h };
	}

	// The reticle: on the target (red) or at the reticle point; its radius is the real spread at that distance.
	_draw(W, src) {
		const p = this.g.player.position, el = this.ret, t = this.target;
		let c = src;
		if (t) {
			const S = typeof SpriteActor !== 'undefined' && SpriteActor.standing() ? SpriteActor.STAND_SCALE : 1;
			c = this._targetKind === 'person' ? this._screen(t.position.x, this._targetY + 1.0 * S, t.position.z)
				: this._screen(t.position.x, this._targetY + (this._targetKind === 'car' ? 0.8 : 0), t.position.z);
		}
		const at = this.point || p, dist = Math.max(2, Math.hypot(at.x - p.x, at.z - p.z));
		const spread = W.spread * this.spreadMul() * (W.pellets > 1 ? 0.8 : 1);
		const rad = Math.max(11, Math.min(90, dist * Math.tan(spread) * this._pxPerM()));
		el.style.display = 'block';
		el.style.transform = `translate(${c.x - rad}px, ${c.y - rad}px)`;
		el.style.width = el.style.height = rad * 2 + 'px';
		el.className = (t ? 'lock' : '') + (this.settle >= 0.98 ? ' steady' : '');
		this._cursor(src.kind === 'mouse');
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
