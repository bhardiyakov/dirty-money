// ============================================================================
// SimSchema — layout binário das ENTIDADES SISTÊMICAS, compartilhado pela Main Thread (main.js) e pelo Web Worker (sim/worker.js).
// Cada entidade é um registro de STRIDE números (Float64: ids e bitmasks até 2^53 sem perda) num buffer contíguo, então os lotes
// trafegam como ArrayBuffer transferível (zero cópia) em vez de objetos clonados.
//
//   TAG          bitmask de propriedades booleanas cruzadas (qualquer crime, qualquer distrito): isObstacle…
//   NOISE        bitmask de canais de ruído que a entidade emite/escuta (passos, tiro, alarme, motor)
//   DISTRICT     zona da cidade a que a entidade pertence (índice estável, ver DISTRICTS)
// ============================================================================

const SimSchema = {
    STRIDE: 10,
    F: { ID: 0, KIND: 1, X: 2, Z: 3, DISTRICT: 4, TAGS: 5, CRAFT_YIELD: 6, FACTION_VALUE: 7, NOISE_MASK: 8, SUSPICION: 9 },

    TAG: { OBSTACLE: 1 << 0 },
    NOISE: { STEPS: 1 << 0, GUNSHOT: 1 << 1, ALARM: 1 << 2, ENGINE: 1 << 3 },
    DISTRICTS: ['unknown', 'favela', 'downtown', 'commercial', 'residential', 'industrial', 'port', 'island'],

    // Mensagens (campo `t`).
    MSG: { INIT: 'init', UPSERT: 'upsert', REMOVE: 'remove', STATE: 'state', RECYCLE: 'recycle' },

    // Escreve a entidade `e` (objeto com os campos da classe) no registro `i` de `view`.
    write(view, i, e) {
        const o = i * this.STRIDE, F = this.F;
        view[o + F.ID] = e.id; view[o + F.KIND] = e.kind; view[o + F.X] = e.x; view[o + F.Z] = e.z;
        view[o + F.DISTRICT] = e.districtZone; view[o + F.TAGS] = e.tags; view[o + F.CRAFT_YIELD] = e.craftYield;
        view[o + F.FACTION_VALUE] = e.factionValue; view[o + F.NOISE_MASK] = e.noiseMask; view[o + F.SUSPICION] = e.suspicionLevel;
    },

    // Lê o registro `i` de `view` para dentro de `e` (reaproveita o objeto: sem alocação por registro).
    read(view, i, e) {
        const o = i * this.STRIDE, F = this.F;
        e.id = view[o + F.ID]; e.kind = view[o + F.KIND]; e.x = view[o + F.X]; e.z = view[o + F.Z];
        e.districtZone = view[o + F.DISTRICT]; e.tags = view[o + F.TAGS]; e.craftYield = view[o + F.CRAFT_YIELD];
        e.factionValue = view[o + F.FACTION_VALUE]; e.noiseMask = view[o + F.NOISE_MASK]; e.suspicionLevel = view[o + F.SUSPICION];
        return e;
    },

    // Buffer para `n` registros (capacidade mínima de 64 para os lotes pequenos não realocarem).
    alloc(n) { return new ArrayBuffer(Math.max(64, n) * this.STRIDE * 8); },
    capacity(buf) { return buf.byteLength / (this.STRIDE * 8); },
};
