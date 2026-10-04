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

        const havok = await HavokPhysics();
        this.plugin = new BABYLON.HavokPlugin(true, havok);
        // O Babylon 6 relê do WASM a posição/rotação de TODOS os corpos a cada passo (2 por quadro), inclusive os ~750 colisores
        // estáticos que nunca se movem: ~1.500 chamadas ao WASM e ~300 KB de lixo por quadro. Os criados aqui como estáticos pulam isso.
        const sync = this.plugin.sync.bind(this.plugin);
        this.plugin.sync = (body) => { if (!body._dmStatic) sync(body); };
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
