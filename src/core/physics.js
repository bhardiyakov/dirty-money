// ============================================================================
// Physics — wrapper do Havok.
// Carrega o WASM do Havok (async), liga a física na Scene e cria corpos
// estáticos para o chão e os prédios (para o carro colidir).
// ============================================================================

class Physics {
    constructor(scene) {
        this.scene = scene;
        this.plugin = null;
        this.ready = false;
        this.staticBodies = [];
    }

    async init() {
        if (typeof HavokPhysics !== 'function') {
            throw new Error('HavokPhysics não carregado — confira a tag <script> do Havok no index.html');
        }

        // WASM embutido (vendor/HavokPhysics.wasm.js): funciona offline e em file://, onde o navegador proíbe buscar o .wasm. A string
        // base64 (~2,8 MB) é liberada depois de decodificada.
        let opts;
        if (typeof window !== 'undefined' && window.HAVOK_WASM_BASE64) {
            const s = atob(window.HAVOK_WASM_BASE64), bin = new Uint8Array(s.length);
            for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
            opts = { wasmBinary: bin };
            window.HAVOK_WASM_BASE64 = null;
        }
        const havok = await HavokPhysics(opts);
        this.plugin = new BABYLON.HavokPlugin(true, havok);
        // O Babylon 6 relê do WASM a posição/rotação de TODOS os corpos a cada passo (2 por quadro), inclusive os ~750 colisores
        // estáticos que nunca se movem: ~1.500 chamadas ao WASM e ~300 KB de lixo por quadro. Os criados aqui como estáticos pulam isso.
        const sync = this.plugin.sync.bind(this.plugin);
        // Carro parado e quieto (TrafficCar._resting marca _dmRest) também não muda: pula a releitura até alguém mexer na velocidade dele
        // (o Vehicle desmarca em setLinearVelocity/teleport, e a IA desmarca ao ver que ele foi empurrado).
        // Releitura SEM LIXO: o plugin pedia ao WASM HP_Body_GetQTransform, que devolve 4 arrays novos por corpo a cada passo (2 por
        // quadro) — a maior fonte de coleta de lixo do jogo com trânsito cheio (e coleta grande = engasgo). A matriz de cada corpo fica
        // num lugar fixo da memória do Havok (_bodyBuffer + deslocamento): lemos direto dali. Nó com pai/instâncias: caminho antigo.
        const P = this.plugin, hk = P._hknp, Tm = new BABYLON.Matrix(), Tq = new BABYLON.Quaternion();
        let F = null;
        const fast = (body) => {
            const node = body.transformNode;
            if (!node || node.parent || (body._pluginDataInstances && body._pluginDataInstances.length) || !hk.HP_Body_GetWorldTransformOffset) return false;
            const pd = body._pluginData;
            if (pd._dmOff === undefined) { const r = hk.HP_Body_GetWorldTransformOffset(pd.hpBodyId); pd._dmOff = r && typeof r[1] === 'number' ? r[1] : -1; }
            if (pd._dmOff < 0 || !P._bodyBuffer) return false;
            if (!F || F.buffer !== hk.HEAPU8.buffer) F = new Float32Array(hk.HEAPU8.buffer);          // (a memória do WASM pode crescer)
            const o = (P._bodyBuffer + pd._dmOff) >> 2;
            node.position.set(F[o + 12], F[o + 13], F[o + 14]);
            BABYLON.Matrix.FromArrayToRef(F, o, Tm);
            BABYLON.Quaternion.FromRotationMatrixToRef(Tm, Tq);
            if (node.rotationQuaternion) node.rotationQuaternion.copyFrom(Tq); else Tq.toEulerAnglesToRef(node.rotation);
            return true;
        };
        this.plugin.sync = (body) => { if (body._dmStatic || body._dmRest) return; if (!fast(body)) sync(body); };
        this.scene.enablePhysics(new BABYLON.Vector3(0, Config.physics.gravity, 0), this.plugin);
        this.ready = true;
    }

    // Chão estático — shape de malha (triângulos) por ser um plano fino.
    addStaticGround(mesh) {
        const agg = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.MESH, { mass: 0 }, this.scene);
        agg.body._dmStatic = true;
        this.staticBodies.push(agg);
        return agg;
    }

    // Sólidos estáticos (prédios, contêineres) — caixas. `node` pode ser um
    // TransformNode puro; `size` = dimensões (x, y, z) da caixa.
    addStaticBox(node, size) {
        const agg = new BABYLON.PhysicsAggregate(node, BABYLON.PhysicsShapeType.BOX,
            { mass: 0, friction: 0.6, extents: size }, this.scene);
        agg.body._dmStatic = true;
        this.staticBodies.push(agg);
        return agg;
    }
}
