// ============================================================================
// Simulation Worker — a camada de jogabilidade emergente roda aqui, fora da Main Thread (Babylon.js/UI).
// Nesta etapa: só a ESTRUTURA BASE — entidades com tags sistêmicas, índice espacial 2D e a troca de estado com o main.js.
//
//   SimEntity     entidade com propriedades cruzadas (isObstacle, craftYield, factionValue, noiseMask, suspicionLevel, districtZone)
//   SpatialHash   grade uniforme 2D (X/Z, sem Y) para consultas por raio — a base de visão e áreas de efeito
//   SimWorld      registro das entidades + conjunto "sujo" (o que mudou no worker e precisa voltar ao main)
//
// Protocolo (ver SimSchema.MSG): o main manda lotes UPSERT/REMOVE; o worker responde, a TICK_HZ, um lote STATE só com as
// entidades que ELE mudou. Lotes são ArrayBuffers TRANSFERIDOS (zero cópia) e devolvidos (RECYCLE) para reuso: nenhum lado
// aloca por quadro.
//
// Aberto por duplo clique (file://), o navegador não deixa criar o Worker: o index.html carrega este arquivo como script comum e o
// SimBridge roda a mesma simulação na Main Thread (startSimWorker com um `self` falso). Por isso tudo fica dentro da função — as
// classes daqui não colidem com as globais do jogo (ex.: SpatialHash de core/Spatial.js).
// ============================================================================

function startSimWorker(self) {
const TICK_HZ = 10;

class SimEntity {
    constructor(id) {
        this.id = id;
        this.kind = 0;
        this.x = 0;
        this.z = 0;
        this.districtZone = 0;
        this.tags = 0;
        this.craftYield = 0;
        this.factionValue = 0;
        this.noiseMask = 0;
        this.suspicionLevel = 0;
        this._cell = -1;                        // célula atual na SpatialHash
    }

    get isObstacle() { return (this.tags & SimSchema.TAG.OBSTACLE) !== 0; }
    set isObstacle(v) { this.tags = v ? (this.tags | SimSchema.TAG.OBSTACLE) : (this.tags & ~SimSchema.TAG.OBSTACLE); }
    hasTag(bit) { return (this.tags & bit) !== 0; }
    emits(noiseBit) { return (this.noiseMask & noiseBit) !== 0; }
}

class SpatialHash {
    constructor(cellSize = 32) {
        this.size = cellSize;
        this.cells = new Map();                 // chave da célula → Set de entidades
    }

    key(x, z) { return ((Math.floor(x / this.size) + 32768) << 16) | (Math.floor(z / this.size) + 32768); }

    move(e) {
        const k = this.key(e.x, e.z);
        if (k === e._cell) return;
        this.remove(e);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, c = new Set());
        c.add(e);
        e._cell = k;
    }

    remove(e) {
        if (e._cell === -1) return;
        const c = this.cells.get(e._cell);
        if (c) { c.delete(e); if (!c.size) this.cells.delete(e._cell); }
        e._cell = -1;
    }

    // Entidades a até `r` de (x, z), no plano 2D. `out` é reaproveitado pelo chamador.
    queryRadius(x, z, r, out = []) {
        out.length = 0;
        const S = this.size, r2 = r * r, i0 = Math.floor((x - r) / S), i1 = Math.floor((x + r) / S), j0 = Math.floor((z - r) / S), j1 = Math.floor((z + r) / S);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const c = this.cells.get(((i + 32768) << 16) | (j + 32768));
            if (!c) continue;
            for (const e of c) { const dx = e.x - x, dz = e.z - z; if (dx * dx + dz * dz <= r2) out.push(e); }
        }
        return out;
    }
}

class SimWorld {
    constructor() {
        this.entities = new Map();
        this.grid = new SpatialHash();
        this.dirty = new Set();                 // mudadas no worker desde o último STATE
        this._tmp = new SimEntity(0);
        this._pool = [];                        // buffers devolvidos pelo main (RECYCLE)
    }

    get(id) { return this.entities.get(id); }

    // Mudança feita pela simulação do worker: marca para voltar ao main no próximo tick.
    touch(e) { this.dirty.add(e); }

    // Lote vindo do main: aplica sem marcar sujo (o main já tem esse estado).
    applyUpsert(buf, n) {
        const view = new Float64Array(buf), t = this._tmp;
        for (let i = 0; i < n; i++) {
            SimSchema.read(view, i, t);
            let e = this.entities.get(t.id);
            if (!e) this.entities.set(t.id, e = new SimEntity(t.id));
            e.kind = t.kind; e.x = t.x; e.z = t.z; e.districtZone = t.districtZone; e.tags = t.tags;
            e.craftYield = t.craftYield; e.factionValue = t.factionValue; e.noiseMask = t.noiseMask; e.suspicionLevel = t.suspicionLevel;
            this.grid.move(e);
        }
        return buf;
    }

    applyRemove(ids) {
        for (const id of ids) {
            const e = this.entities.get(id);
            if (!e) continue;
            this.grid.remove(e);
            this.entities.delete(id);
            this.dirty.delete(e);
        }
    }

    // Empacota as entidades sujas num buffer reaproveitado e transfere ao main.
    flush() {
        const n = this.dirty.size;
        if (!n) return;
        let buf = this._pool.pop();
        if (!buf || SimSchema.capacity(buf) < n) buf = SimSchema.alloc(n);
        const view = new Float64Array(buf);
        let i = 0;
        for (const e of this.dirty) SimSchema.write(view, i++, e);
        this.dirty.clear();
        self.postMessage({ t: SimSchema.MSG.STATE, buf, n }, [buf]);
    }

    tick() {
        // (os sistemas emergentes — IA, economia macro, territórios, caos — entram aqui e chamam touch() no que mudarem)
        this.flush();
    }
}

const world = new SimWorld();

self.onmessage = (ev) => {
    const m = ev.data, M = SimSchema.MSG;
    switch (m.t) {
        case M.INIT: setInterval(() => world.tick(), 1000 / TICK_HZ); break;
        case M.UPSERT: self.postMessage({ t: M.RECYCLE, buf: world.applyUpsert(m.buf, m.n) }, [m.buf]); break;
        case M.REMOVE: world.applyRemove(m.ids); break;
        case M.RECYCLE: world._pool.push(m.buf); break;
    }
};
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    importScripts('./schema.js');
    startSimWorker(self);
}
