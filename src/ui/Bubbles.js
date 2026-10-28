// ============================================================================
// Bubbles — balões de fala presos a um ponto do mundo (a cabeça de um NPC, do atendente, de quem passa na rua). DOM por cima do
// canvas, reposicionado todo quadro (projeção da câmera, antes do desenho). Somem com o tempo, longe do jogador ou fora da tela.
//   Bubbles.say(anchor, text, { ms, tone, y, key })
//     anchor: { x, z } fixo · um SpriteActor / NPC (usa .mesh.position ou .position) · ou função () => { x, z }
//     tone: 'talk' (branco) · 'shout' (amarelo, grito) · 'whisper' (cochicho, cinza) · 'hint' (dica, borda dourada) · 'angry' (vermelho)
//     key: um balão por chave (falar de novo troca o texto em vez de empilhar)
// Como nos quadrinhos: o balão flutua ACIMA da cabeça (LIFT), com contorno e um rabicho que aponta para quem fala. Na câmera de cima o
// personagem 2,5D é desenhado deitado, com a cabeça para cima da TELA (1 m de altura = NORTH_PER_METRE para o "cima" da tela, que gira
// com CompassCamera.yaw): a altura y quase não sobe o ponto projetado, então o balão é empurrado nessa direção; na câmera 2,5D
// inclinada, a altura projeta de verdade — mas o personagem em pé é esticado (SpriteActor.STAND_SCALE), e o balão sobe junto.
// ============================================================================

const Bubbles = {
    list: [],
    MAX: 7,
    RANGE: 26,                      // m do jogador: mais longe, ninguém "ouve"
    LIFT: 0.95,                     // câmera de cima: o quanto o balão sobe acima da cabeça (m para o "cima" da tela)
    LIFT_Y: 0.45,                   // câmera 2,5D: o mesmo, em altura (acima da cabeça já esticada pelo SpriteActor.STAND_SCALE)
    TAIL: 15,                       // px do rabicho (a ponta dele fica no ponto acima da cabeça)

    _init(scene) {
        if (this.root && this.scene === scene) return;
        this.scene = scene;
        if (!this.root) {
            const st = document.createElement('style');
            st.textContent = `
                #bubbles { position: fixed; inset: 0; pointer-events: none; z-index: 40; overflow: hidden; }
                #bubbles .bb { --bg: #fffdf6; --bd: #1d140b; position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); max-width: 250px;
                    padding: 7px 13px 8px; border-radius: 18px; border: 2px solid var(--bd); background: var(--bg);
                    font: 700 13px var(--font, system-ui); line-height: 1.3; color: #1d140b; box-shadow: 0 4px 10px rgba(0,0,0,0.32);
                    white-space: normal; text-align: center; transition: opacity .25s; will-change: transform; }
                /* rabicho de quadrinho: um triângulo inclinado com contorno (o de baixo é o contorno, o de cima o preenchimento) */
                #bubbles .bb::before, #bubbles .bb::after { content: ''; position: absolute; left: 50%; width: 0; height: 0; border-style: solid; }
                #bubbles .bb::before { bottom: -15px; margin-left: -11px; border-width: 15px 3px 0 12px; border-color: var(--bd) transparent transparent transparent; }
                #bubbles .bb::after { bottom: -10px; margin-left: -8px; border-width: 11px 2px 0 8px; border-color: var(--bg) transparent transparent transparent; }
                #bubbles .bb.shout { --bg: #fde047; --bd: #3b2400; font-weight: 800; color: #2a1600; border-width: 3px; }
                #bubbles .bb.whisper { --bg: rgba(250,250,252,0.92); --bd: #6b7280; border-style: dashed; color: #4b5563; font-style: italic; font-weight: 500; }
                #bubbles .bb.hint { --bg: #1d1a12; --bd: #fbbf24; color: #fde68a; }
                #bubbles .bb.angry { --bg: #fee2e2; --bd: #7f1d1d; color: #7f1d1d; font-weight: 800; }
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
            // acima da cabeça: na câmera de cima, para o "cima" da tela (onde o desenho põe a cabeça); na 2,5D, em altura
            const U = typeof CompassCamera !== 'undefined' ? CompassCamera.NORTH_PER_METRE : 0, yaw = U && typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0;
            const up = U ? (b.y * U + this.LIFT) : 0;
            const stand = !U && typeof SpriteActor !== 'undefined' ? SpriteActor.STAND_SCALE : 1;      // (2,5D: o personagem em pé é esticado 1/cos da inclinação)
            const v = BABYLON.Vector3.Project(this._v.set(p.x + Math.sin(yaw) * up, U ? b.y : b.y * stand + this.LIFT_Y, p.z + Math.cos(yaw) * up), this._I, M, vp);
            if (v.z < 0 || v.z > 1) { b.el.style.opacity = '0'; continue; }
            const x = r.left + v.x * r.width / w, yy = r.top + v.y * r.height / h - this.TAIL;
            b.el.style.transform = `translate(${x.toFixed(1)}px, ${yy.toFixed(1)}px) translate(-50%, -100%)`;
            const fadeIn = Math.min(1, age / 160), fadeOut = Math.min(1, (b.ms - age) / 300);
            b.el.style.opacity = String(Math.min(fadeIn, fadeOut));
        }
    },
};
