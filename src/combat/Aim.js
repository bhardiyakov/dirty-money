// ============================================================================
// Aim — the player's AIM with a firearm. Always manual: the shot goes where the reticle is, wherever that is on the screen.
//   PC (mouse):   the cursor is the reticle. Holding the right button = STEADY aim (the body faces the reticle, walks slowly and the
//                 circle tightens with time).
//   GAMEPAD:      holding LT (aiming), the right stick places the reticle around the player (direction and distance = how far it is
//                 pushed; at rest, ahead of the player); RT fires. Without LT the right stick turns the camera (360°: Game._look) and RT
//                 fires where the player faces.
//   PHONE:        the fire button turns into a right stick: dragging it places the reticle the same way, and the gun fires by
//                 itself while the reticle is over a target (a person, the helicopter, a car).
// AJUDA DE MIRA (controle e celular — Ajustes › Ajuda de mira; Config.aim): o retículo puxa de leve para a pessoa mais perto dele e, com
// o LT segurado e o analógico parado, TRAVA no alvo mais perto à frente (o mesmo enquanto valer). O mouse é sempre manual.
// RETORNO DE ACERTO: cada bala que pega em alguém mostra o marcador (✕) na mira com um estalo; derrubou, ele fica vermelho e maior.
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
		// the right stick aims (instead of turning the camera and zooming): LT held with a gun ready, or a grenade being readied (Throwables)
		inp.stickAim = (can && inp.padAim) || !!(W && W.throwable && g.mode === 'player' && Throwables.s && Throwables.s.phase !== 'throw');
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
		this.active = false; this.settle = 0; this.target = null; this.point = null; this.source = null; this.autoFire = false; this._lock = null;
		this.ret.style.display = 'none';
		this._cursor(false);
	}

	// Where the reticle is (CSS px of the window) and what moves it, or null. Phone: the fire button dragged as a stick
	// (input.touchAim). Gamepad: only while LT is held — the right stick, held a moment after release, and with the stick at rest
	// ahead of the player (without LT the stick is the camera's). Mouse: the cursor.
	_reticle(dt) {
		const inp = this.g.input;
		if (inp.touchAim) { this._lock = null; return this._assist(this._fromStick(inp.touchAim, 'touch')); }
		if (inp.usingPad) {
			if (!inp.aimHeld) { this._sT = 0; this._lock = null; return null; }
			const rs = inp.rstick;
			if (Math.hypot(rs.x, rs.y) > 0.25) { this._last.x = rs.x; this._last.y = rs.y; this._sT = 0.3; } else this._sT -= dt;
			if (this._sT > 0) { this._lock = null; return this._assist(this._fromStick(this._last, 'stick')); }
			return (this._help() && this._lockOn()) || this._fromStick(this._facing(0.5), 'stick', true);
		}
		this._lock = null;
		if (this.g.touch && this.g.touch.shown) return null;
		return inp.mouseX >= 0 ? { x: inp.mouseX, y: inp.mouseY, kind: 'mouse' } : null;
	}
	// ------------------------------------------------------------------ ajuda de mira (controle e celular)
	_help() { const S = this.g.menu && this.g.menu.settings; return !S || S.aimHelp !== false; }
	// Onde a pessoa/o helicóptero `c` aparece na tela (o peito; o helicóptero, o corpo) — o ponto que a mira busca.
	_aimAt(c, kind, y) {
		const S = typeof SpriteActor !== 'undefined' && SpriteActor.standing() ? SpriteActor.STAND_SCALE : 1;
		return kind === 'person' ? this._screen(c.position.x, y + 1.0 * S, c.position.z) : this._screen(c.position.x, y, c.position.z);
	}
	// Ímã: o retículo `src` anda `pull` do caminho até a pessoa mais perto dele na tela (dentro do alcance da arma) — mais forte quanto
	// mais perto. Carros não puxam.
	_assist(src) {
		if (!src || !this._help()) return src;
		const A = Config.aim, p = this.g.player, P = p.position, W = Weapons[p.weapon], range = (W && W.range) || 40;
		const R = Math.max(A.pullMinPx, A.pullR * this._pxPerM());
		let best = null, bd = R;
		this._forTargets((c, kind, y) => {
			if (kind === 'car' || Math.hypot(c.position.x - P.x, c.position.z - P.z) > range) return;
			const q = this._aimAt(c, kind, y), d = Math.hypot(q.x - src.x, q.y - src.y);
			if (d < bd) { bd = d; best = q; }
		});
		if (!best) return src;
		const u = 1 - bd / R, k = A.pull * u * u * (3 - 2 * u);
		return { x: src.x + (best.x - src.x) * k, y: src.y + (best.y - src.y) * k, kind: src.kind };
	}
	// TRAVA (LT segurado, analógico parado): o alvo mais perto à frente (±lockCone, até o alcance da arma, à vista) — e o mesmo enquanto
	// ele estiver vivo, à vista e ao alcance. null = ninguém (a mira fica à frente, como antes).
	_lockOn() {
		const p = this.g.player, P = p.position, W = Weapons[p.weapon], range = ((W && W.range) || 40) * 0.9, h = p.root.rotation.y, cone = Config.aim.lockCone;
		let keep = null, best = null, bs = Infinity;
		this._forTargets((c, kind, y) => {
			if (kind === 'car') return;
			const dx = c.position.x - P.x, dz = c.position.z - P.z, d = Math.hypot(dx, dz);
			if (c === this._lock) { if (d < range * 1.15) keep = { c, kind, y }; return; }
			if (d > range || d < 0.5) return;
			const da = Math.abs(this._wrap(Math.atan2(dx, dz) - h));
			if (da > cone) return;
			const sc = d + da * 12;
			if (sc < bs) { bs = sc; best = { c, kind, y }; }
		});
		const los = (L) => L && MapGeo.hasLineOfSight(P.x, P.z, L.c.position.x, L.c.position.z);
		const L = los(keep) ? keep : los(best) ? best : null;
		this._lock = L ? L.c : null;
		if (!L) return null;
		const q = this._aimAt(L.c, L.kind, L.y);
		return { x: q.x, y: q.y, kind: 'stick' };
	}

	// `screen`: v já é um vetor da tela (_facing). Senão, com o movimento absoluto (Config.camera.worldMove), o analógico aponta nos
	// eixos do MAPA como o andar (cima = norte, esquerda = oeste): a direção no mundo é projetada para a tela, mantendo o alcance.
	_fromStick(v, kind, screen = false) {
		const c = this._chest(), R = Aim.STICK_REACH * Math.min(window.innerWidth, window.innerHeight), m = Math.hypot(v.x, v.y);
		if (!screen && m > 1e-3 && Config.camera.worldMove) {
			const a = Aim.stickAngle(v), p = this.g.player.position, f = this._screen(p.x + Math.sin(a) * 5, this._chestY(), p.z + Math.cos(a) * 5);
			const dx = f.x - c.x, dy = f.y - c.y, d = Math.hypot(dx, dy) || 1;
			return { x: c.x + dx / d * m * R, y: c.y + dy / d * m * R, kind };
		}
		return { x: c.x + v.x * R, y: c.y + v.y * R, kind };
	}
	// The way the player faces, as a stick vector of length `k` on the screen.
	_facing(k) {
		const p = this.g.player, h = p.root.rotation.y, c = this._chest(), f = this._screen(p.position.x + Math.sin(h) * 5, this._chestY(), p.position.z + Math.cos(h) * 5);
		const dx = f.x - c.x, dy = f.y - c.y, d = Math.hypot(dx, dy) || 1;
		return { x: dx / d * k, y: dy / d * k };
	}
	// Right stick (x right +, y down +) → world direction (rad, 0 = north): the map's axes with Config.camera.worldMove, else turned
	// by the compass camera. (Throwables, _fromStick)
	static stickAngle(rs) { return Math.atan2(rs.x, -rs.y) + (typeof CompassCamera !== 'undefined' ? CompassCamera.moveYaw() : 0); }
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
		if (typeof Needs !== 'undefined') mul *= Needs.spreadMul();                // cansado: a mão treme
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
		if (g.watch && g.watch.rockets) for (const o of g.watch.rockets) if (o.actor) person(o);           // (fogueteiros nos telhados)
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
		const v = BABYLON.Vector3.Project(this._v.set(x, y + (typeof Relief !== 'undefined' ? Relief.at(x, z) : 0), z), this._I, sc.getTransformMatrix(), cam.viewport.toGlobal(w, h));
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
		this._retC = c; this._retT = performance.now();                       // (o marcador de acerto aparece aqui)
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
			#aimRet.steady { border-width: 3px; } #aimRet.steady:not(.lock) { border-color: #4ade80; }
			#hitMark { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 6; pointer-events: none; opacity: 0; }
			#hitMark i { position: absolute; left: -5px; top: -1.5px; width: 10px; height: 3px; border-radius: 1px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.6); }
			#hitMark i:nth-child(1) { transform: rotate(45deg) translateX(-10px); } #hitMark i:nth-child(2) { transform: rotate(135deg) translateX(-10px); }
			#hitMark i:nth-child(3) { transform: rotate(225deg) translateX(-10px); } #hitMark i:nth-child(4) { transform: rotate(315deg) translateX(-10px); }
			#hitMark.on { animation: hitMk .22s ease-out forwards; }
			#hitMark.kill { animation: hitMkK .42s ease-out forwards; } #hitMark.kill i { background: #ff3b3b; width: 13px; left: -6.5px; }
			@keyframes hitMk { 0% { opacity: 1; scale: 1.35; } 60% { opacity: 1; scale: 1; } 100% { opacity: 0; scale: 1; } }
			@keyframes hitMkK { 0% { opacity: 1; scale: 1.6; } 70% { opacity: 1; scale: 1.1; } 100% { opacity: 0; scale: 1.1; } }`;
		document.head.appendChild(css);
		this.ret = document.createElement('div');
		this.ret.id = 'aimRet';
		document.body.appendChild(this.ret);
		this.mark = document.createElement('div');
		this.mark.id = 'hitMark';
		this.mark.innerHTML = '<i></i><i></i><i></i><i></i>';
		document.body.appendChild(this.mark);
		this.hits = 0; this.kills = 0;                                      // (testes)
	}

	// ------------------------------------------------------------------ retorno de acerto (Combat: bala do jogador pegou em alguém)
	// O marcador (✕) na mira — ou, sem mira na tela (tiro do quadril no controle), em cima de quem levou — e o estalo; derrubou: vermelho,
	// maior, e o som mais grave. (A escopeta põe 8 bagos: um marcador por disparo, não por bago.)
	onHit(t, kill, kind) {
		const now = performance.now();
		if (kill) this.kills++; else this.hits++;
		if (!kill && now - (this._markT || 0) < 70) return;
		this._markT = now;
		let c = this.ret.style.display === 'block' && now - (this._retT || 0) < 250 ? this._retC : null;
		if (!c && t && t.position) { try { c = this._aimAt(t, kind === 'heli' ? 'air' : 'person', kind === 'heli' ? (t.alt || 0) : 0); } catch (e) { c = null; } }
		if (!c) return;
		const el = this.mark;
		el.style.transform = `translate(${c.x}px, ${c.y}px)`;
		el.className = '';
		void el.offsetWidth;                                                 // (recomeça a animação)
		el.className = kill ? 'kill' : 'on';
		if (kill) { AudioFX.blip(620, 0.07, 0.11); setTimeout(() => AudioFX.blip(420, 0.11, 0.11), 70); }
		else AudioFX.blip(1900, 0.035, 0.06);
	}

	_wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
	_lerpAngle(a, b, t) { return a + this._wrap(b - a) * t; }
}
