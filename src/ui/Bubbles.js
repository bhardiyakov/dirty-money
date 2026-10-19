// ============================================================================
// Bubbles — balões de fala presos a um ponto do mundo (a cabeça de um NPC, do atendente, de quem passa na rua). DOM por cima do
// canvas, reposicionado todo quadro (projeção da câmera, antes do desenho). Somem com o tempo, longe do jogador ou fora da tela.
//   Bubbles.say(anchor, text, { ms, tone, y, key })
//     anchor: { x, z } fixo · um SpriteActor / NPC (usa .mesh.position ou .position) · ou função () => { x, z }
//     tone: 'talk' (branco) · 'shout' (amarelo, grito) · 'whisper' (cochicho, cinza) · 'hint' (dica, borda dourada) · 'angry' (vermelho)
//     key: um balão por chave (falar de novo troca o texto em vez de empilhar)
// ============================================================================

const Bubbles = {
    list: [],
    MAX: 7,
    RANGE: 26,                      // m do jogador: mais longe, ninguém "ouve"

    _init(scene) {
        if (this.root && this.scene === scene) return;
        this.scene = scene;
        if (!this.root) {
            const st = document.createElement('style');
            st.textContent = `
                #bubbles { position: fixed; inset: 0; pointer-events: none; z-index: 40; overflow: hidden; }
                #bubbles .bb { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); max-width: 260px; padding: 6px 11px 7px; border-radius: 13px;
                    font: 600 13px var(--font, system-ui); line-height: 1.3; color: #1d140b; background: #fffaf0; box-shadow: 0 3px 12px rgba(0,0,0,0.35);
                    white-space: normal; text-align: center; transition: opacity .25s; will-change: transform; }
                #bubbles .bb::after { content: ''; position: absolute; left: 50%; bottom: -6px; margin-left: -6px; border: 6px solid transparent; border-bottom: 0; border-top-color: inherit; }
                #bubbles .bb { border-top-color: #fffaf0; }
                #bubbles .bb.shout { background: #fde047; border-top-color: #fde047; font-weight: 800; text-transform: none; color: #2a1600; }
                #bubbles .bb.whisper { background: rgba(30,30,36,0.86); border-top-color: rgba(30,30,36,0.86); color: #d8d8e0; font-style: italic; font-weight: 500; }
                #bubbles .bb.hint { background: #1d1a12; border-top-color: #1d1a12; color: #fde68a; box-shadow: 0 0 0 1px #fbbf24, 0 3px 12px rgba(0,0,0,0.4); }
                #bubbles .bb.angry { background: #fee2e2; border-top-color: #fee2e2; color: #7f1d1d; font-weight: 800; }
                #bubbles .bb small { display: block; font-weight: 500; font-size: 11px; opacity: 0.7; margin-top: 1px; }`;
            document.head.appendChild(st);
            this.root = document.createElement('div'); this.root.id = 'bubbles';
            document.body.appendChild(this.root);
            this._v = new BABYLON.Vector3(); this._I = BABYLON.Matrix.Identity();
        }
        if (this._obs && this._obsScene) this._obsScene.onBeforeRenderObservable.remove(this._obs);
        this._obsScene = scene;
        this._obs = scene.onBeforeRenderObservable.add(() => this._frame());
    },

    say(anchor, text, opt = {}) {
        const g = window.game; if (!g || !g.scene || !text) return null;
        this._init(g.scene);
        const { ms = 2800, tone = 'talk', y = 2.15, key = null, who = '' } = opt;
        let b = key ? this.list.find((q) => q.key === key) : null;
        if (!b) {
            if (this.list.length >= this.MAX) this._drop(this.list[0]);
            b = { el: document.createElement('div'), key };
            this.root.appendChild(b.el);
            this.list.push(b);
        }
        b.anchor = anchor; b.y = y; b.t0 = performance.now(); b.ms = ms;
        b.el.className = 'bb ' + tone;
        b.el.innerHTML = this._esc(text) + (who ? `<small>${this._esc(who)}</small>` : '');
        b.el.style.opacity = '0';
        return b;
    },
    clear() { for (const b of this.list.slice()) this._drop(b); },
    _drop(b) { b.el.remove(); this.list.splice(this.list.indexOf(b), 1); },
    _esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); },

    _pos(a) {
        if (!a) return null;
        if (typeof a === 'function') return a();
        if (a.mesh && a.mesh.position) return a.mesh.isDisposed && a.mesh.isDisposed() ? null : { x: a.mesh.position.x, z: a.mesh.position.z, hidden: a.mesh.isEnabled && !a.mesh.isEnabled() };
        if (a.position) return { x: a.position.x, z: a.position.z };
        return a;
    },

    _frame() {
        if (!this.list.length) return;
        const g = window.game, sc = this.scene; if (!g || !sc || !sc.activeCamera) return;
        const now = performance.now(), eng = sc.getEngine(), cam = sc.activeCamera, cv = eng.getRenderingCanvas();
        const w = eng.getRenderWidth(), h = eng.getRenderHeight(), r = cv.getBoundingClientRect(), M = sc.getTransformMatrix(), vp = cam.viewport.toGlobal(w, h);
        const P = g.player && g.player.position, paused = (typeof Pool !== 'undefined' && Pool.active) || (typeof Truco !== 'undefined' && Truco.active);
        for (const b of this.list.slice()) {
            const age = now - b.t0;
            if (age > b.ms) { this._drop(b); continue; }
            const p = this._pos(b.anchor);
            const far = !p || p.hidden || (P && Math.hypot(p.x - P.x, p.z - P.z) > this.RANGE);
            if (far || paused) { b.el.style.opacity = '0'; continue; }
            const v = BABYLON.Vector3.Project(this._v.set(p.x, b.y, p.z), this._I, M, vp);
            if (v.z < 0 || v.z > 1) { b.el.style.opacity = '0'; continue; }
            const x = r.left + v.x * r.width / w, yy = r.top + v.y * r.height / h;
            b.el.style.transform = `translate(${x.toFixed(1)}px, ${yy.toFixed(1)}px) translate(-50%, -100%)`;
            const fadeIn = Math.min(1, age / 160), fadeOut = Math.min(1, (b.ms - age) / 300);
            b.el.style.opacity = String(Math.min(fadeIn, fadeOut));
        }
    },
};
