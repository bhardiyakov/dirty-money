// ============================================================================
// CharacterSheet — folhas de sprites de UM tipo de corpo (jogador, civil A/B,
// policial). Cada CLIPE (idle, walk, punch...) vira uma textura própria:
//   colunas = direções (heading), linhas = frames da animação.
// O bake é PREGUIÇOSO: o clipe só é "fotografado" na primeira vez que é pedido
// (ou numa chamada explícita de pré-aquecimento).
//
// SpriteMaterial — shader de paleta INDEXADA: o atlas guarda (rampa, nível) e a
// cor vem de uma textura de paleta (1 linha por variante). Troca de roupa/pele/
// cabelo = trocar a linha, sem rebake.
// ============================================================================

const SpriteMaterial = {
    _registered: false,

    register() {
        if (this._registered) return;
        this._registered = true;
        BABYLON.Effect.ShadersStore['spriteVertexShader'] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            attribute vec4 color;
            uniform mat4 worldViewProjection;
            varying vec2 vUV;
            varying float vVariant;
            varying float vShade;
            void main(void) {
                vUV = uv;
                vVariant = color.r;
                vShade = color.g;
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }`;
        BABYLON.Effect.ShadersStore['spriteFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying float vVariant;
            varying float vShade;
            uniform sampler2D atlas;
            uniform sampler2D palette;
            uniform vec2 palSize;
            uniform vec3 tint;
            uniform float shadowAlpha;
            void main(void) {
                vec4 t = texture2D(atlas, vUV);
                if (t.a < 0.5) discard;
                float ramp = floor(t.r * 255.0 + 0.5);
                float level = floor(t.g * 255.0 + 0.5);
                if (ramp > 250.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.05, shadowAlpha);
                    return;
                }
                vec2 puv = vec2((ramp * 5.0 + level + 0.5) / palSize.x, (floor(vVariant + 0.5) + 0.5) / palSize.y);
                vec3 c = texture2D(palette, puv).rgb;
                gl_FragColor = vec4(c * tint * vShade, 1.0);
            }`;
    },

    // Variante com "fade" pontilhado em volta de um foco (jogador): usada nas copas de
    // árvore, que ficam ACIMA dos personagens mas nunca podem escondê-los. Dither 2×2
    // em pixels internos => visual de pixel art, sem alpha blending suave.
    registerFade() {
        if (this._fadeRegistered) return;
        this._fadeRegistered = true;
        BABYLON.Effect.ShadersStore['spriteFadeVertexShader'] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            attribute vec4 color;
            uniform mat4 worldViewProjection;
            uniform mat4 world;
            varying vec2 vUV;
            varying float vVariant;
            varying float vShade;
            varying vec3 vWorld;
            void main(void) {
                vUV = uv;
                vVariant = color.r;
                vShade = color.g;
                vWorld = (world * vec4(position, 1.0)).xyz;
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }`;
        BABYLON.Effect.ShadersStore['spriteFadeFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying float vVariant;
            varying float vShade;
            varying vec3 vWorld;
            uniform sampler2D atlas;
            uniform sampler2D palette;
            uniform vec2 palSize;
            uniform vec3 tint;
            uniform float shadowAlpha;
            uniform vec2 focus;
            uniform float fadeR;
            void main(void) {
                vec4 t = texture2D(atlas, vUV);
                if (t.a < 0.5) discard;
                float ramp = floor(t.r * 255.0 + 0.5);
                float level = floor(t.g * 255.0 + 0.5);
                if (ramp > 250.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.05, shadowAlpha);
                    return;
                }
                float k = clamp(length(vWorld.xz - focus) / fadeR, 0.0, 1.0);
                vec2 puv = vec2((ramp * 5.0 + level + 0.5) / palSize.x, (floor(vVariant + 0.5) + 0.5) / palSize.y);
                vec3 c = texture2D(palette, puv).rgb;
                gl_FragColor = vec4(c * tint * vShade, smoothstep(0.2, 1.0, k));      // furo macio (degradê de alfa)
            }`;
    },

    // Cor de luz ambiente dos sprites, COMPARTILHADA por todos os materiais (mesma referência):
    // o ciclo dia/noite só precisa mexer nesta cor para escurecer/esquentar todos os sprites.
    sharedTint() {
        return this._tint || (this._tint = new BABYLON.Color3(1, 1, 1));
    },

    // Material do shader para um atlas específico (a paleta é compartilhada).
    // opts.fade = true: dither em volta de `focus` (setVector2) com raio `fadeR`.
    create(scene, name, atlas, palette, opts = {}) {
        this.register();
        const fade = !!opts.fade;
        if (fade) this.registerFade();
        const shader = fade ? 'spriteFade' : 'sprite';
        const m = new BABYLON.ShaderMaterial(name, scene, { vertex: shader, fragment: shader }, {
            attributes: ['position', 'uv', 'color'],
            uniforms: ['worldViewProjection', 'world', 'palSize', 'tint', 'shadowAlpha', 'focus', 'fadeR'],
            samplers: ['atlas', 'palette'],
            needAlphaBlending: true,
        });
        m.setTexture('atlas', atlas);
        m.setTexture('palette', palette.texture);
        m.setVector2('palSize', new BABYLON.Vector2(palette.width, palette.height));
        m.setColor3('tint', this.sharedTint());
        m.setFloat('shadowAlpha', 0.36);
        if (fade) {
            m.setVector2('focus', new BABYLON.Vector2(0, 0));
            m.setFloat('fadeR', opts.fadeR || 3.2);
        }
        m.backFaceCulling = false;
        return m;
    },
};

class CharacterSheet {
    // look: { hair, build, belt } | dirs: nº de direções | frame: lado do frame (px).
    constructor(scene, palette, { name = 'sheet', dirs = 16, frame = 64, look = {} } = {}) {
        this.scene = scene;
        this.palette = palette;
        this.name = name;
        this.dirs = dirs;
        this.frame = frame;
        this.look = look;
        this.clips = {};      // clipes prontos
        this.jobs = {};       // bakes em andamento (progressivos)
        this.pending = [];    // fila de pré-aquecimento em segundo plano
    }

    // Normaliza (clipe, arma): devolve { def, w, key } ou null se a arma não é suportada.
    _resolve(name, weapon) {
        const def = CharacterRig.CLIPS[name];
        if (!def) throw new Error('clipe desconhecido: ' + name);
        let w = weapon || 'none';
        if (def.weapons) { if (!def.weapons.includes(w)) return null; }
        else if (!def.armed) w = 'none';
        return { def, w, key: name + ':' + w };
    }

    // Retorna o clipe (bakeando agora, se preciso) ou null se a arma não é suportada.
    getClip(name, weapon = 'none') {
        const r = this._resolve(name, weapon);
        if (!r) return null;
        if (this.clips[r.key]) return this.clips[r.key];
        const job = this.jobs[r.key] || (this.jobs[r.key] = this._startJob(name, r.w, r.def));
        job.step(Infinity);
        return this.clips[r.key];
    }

    // Job de bake PROGRESSIVO: faz um frame de animação (todas as direções) por passo.
    _startJob(name, weapon, def) {
        const F = this.frame, D = this.dirs, N = def.frames;
        const W = D * F, H = N * F;
        const data = new Uint8Array(W * H * 4);
        const key = name + ':' + weapon;
        const self = this;
        const job = {
            f: 0, ms: 0,
            step(budgetMs) {
                const t0 = performance.now();
                while (this.f < N && (performance.now() - t0 < budgetMs)) {
                    const f = this.f;
                    const t = def.loop ? f / N : (N > 1 ? f / (N - 1) : 0);
                    const prims = CharacterRig.build(def.pose(t, weapon), self.look);
                    for (let d = 0; d < D; d++) {
                        const img = SpriteBaker.bake(prims, { size: F, heading: (d * Math.PI * 2) / D });
                        for (let y = 0; y < F; y++) {
                            const src = y * F * 4;
                            const dst = ((f * F + y) * W + d * F) * 4;
                            data.set(img.subarray(src, src + F * 4), dst);
                        }
                    }
                    this.f++;
                }
                this.ms += performance.now() - t0;
                if (this.f >= N) self._finish(key, name, weapon, def, data, W, H, this.ms);
            },
        };
        return job;
    }

    _finish(key, name, weapon, def, data, W, H, ms) {
        const tex = BABYLON.RawTexture.CreateRGBATexture(data, W, H, this.scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const material = SpriteMaterial.create(this.scene, `${this.name}_${name}_${weapon}`, tex, this.palette);
        this.clips[key] = { name, weapon, frames: def.frames, dirs: this.dirs, fps: def.fps, loop: def.loop, texture: tex, material, frame: this.frame, W, H };
        delete this.jobs[key];
    }

    // Pré-aquece uma lista de [clipe, arma] AGORA (use só para o essencial).
    warm(list) {
        for (const [name, weapon] of list) this.getClip(name, weapon || 'none');
    }

    // Enfileira clipes para assar aos poucos (veja pump).
    queue(list) {
        for (const [name, weapon] of list) {
            const r = this._resolve(name, weapon || 'none');
            if (r && !this.clips[r.key]) this.pending.push([name, weapon || 'none']);
        }
    }

    // Gasta até `budgetMs` do frame assando a fila. Retorna true enquanto ainda há trabalho.
    pump(budgetMs) {
        const t0 = performance.now();
        while (this.pending.length && performance.now() - t0 < budgetMs) {
            const [name, weapon] = this.pending[0];
            const r = this._resolve(name, weapon);
            if (!r || this.clips[r.key]) { this.pending.shift(); continue; }
            const job = this.jobs[r.key] || (this.jobs[r.key] = this._startJob(name, r.w, r.def));
            job.step(Math.max(0.5, budgetMs - (performance.now() - t0)));
            if (this.clips[r.key]) this.pending.shift();
        }
        return this.pending.length > 0;
    }
}

// ----------------------------------------------------------------------------
// SpriteLibrary — paleta + folhas por tipo de corpo, criadas uma vez por cena.
// ----------------------------------------------------------------------------
class SpriteLibrary {
    constructor(scene) {
        this.scene = scene;
        this.palette = CharacterRig.createPalette(scene);
        this.sheets = {
            player: new CharacterSheet(scene, this.palette, { name: 'player', dirs: 16, look: { hair: 'short', build: 1.08, belt: true } }),
            civA: new CharacterSheet(scene, this.palette, { name: 'civA', dirs: 8, look: { hair: 'short', build: 1.0 } }),
            civB: new CharacterSheet(scene, this.palette, { name: 'civB', dirs: 8, look: { hair: 'long', build: 0.9 } }),
            police: new CharacterSheet(scene, this.palette, { name: 'police', dirs: 8, look: { hair: 'police', build: 1.05, belt: true } }),
            // Forças especiais: corpo mais robusto, capacete (SWAT: com máscara e colete).
            swat: new CharacterSheet(scene, this.palette, { name: 'swat', dirs: 8, look: { hair: 'helmet', build: 1.2, belt: true, vest: true, mask: true } }),
            army: new CharacterSheet(scene, this.palette, { name: 'army', dirs: 8, look: { hair: 'helmet', build: 1.1, belt: true } }),
            // Pilotos de bicicleta/moto (o veículo vai desenhado junto): quadro de 80 px porque a moto é mais
            // comprida que o boneco; 16 direções para curvar suave. A cor do quadro/tanque vem da variante (slot `cap`).
            rider: new CharacterSheet(scene, this.palette, { name: 'rider', dirs: 16, frame: 80, look: { hair: 'short', build: 1.05, belt: true } }),
            // Entregadores de aplicativo: capacete e baú térmico nas costas (só a moto andando usa esta folha).
            courier: new CharacterSheet(scene, this.palette, { name: 'courier', dirs: 16, frame: 80, look: { hair: 'helmet', build: 1.05, belt: true, box: true } }),
        };
    }

    // Variantes: 0 = jogador, 1 = policial, 2..(VARIANT_SWAT-1) = civis, depois SWAT e exército.
    get civilianVariants() { return CharacterRig.VARIANT_SWAT - 2; }

    // Assa a fila de pré-aquecimento de todas as folhas usando até `budgetMs` por frame.
    pump(budgetMs = 4) {
        const t0 = performance.now();
        let more = false;
        for (const key of Object.keys(this.sheets)) {
            const left = budgetMs - (performance.now() - t0);
            if (left <= 0) { more = more || this.sheets[key].pending.length > 0; continue; }
            more = this.sheets[key].pump(left) || more;
        }
        return more;
    }
}
