// ============================================================================
// Spatial — controle de ESCOPO: o jogo só gasta CPU/GPU com o que está perto da câmera.
//
//   SpatialHash   grade de "chunks" (células quadradas) para consultas por vizinhança em O(itens próximos) em vez de O(todos).
//                 Reconstruída por quadro para coisas que se movem (obstáculos do trânsito) — sem lixo: os baldes são reaproveitados.
//
//   Zones         em que ZONA está um ponto, a partir do retângulo que a câmera mostra (+ margem):
//                   0 = ATIVA     (na tela + margem de 14 u): lógica e animação completas, todo quadro.
//                   1 = PRÓXIMA   (até ~2× a tela):            lógica a cada 3 quadros (veículos: 2), com o dt somado — nada pipoca
//                                                              ao entrar na tela.
//                   2 = SUSPENSA  (longe):                     "dorme": lógica a cada 8 quadros (~4 Hz; veículos: 5), só o suficiente
//                                                              para a posição andar e o minimapa acompanhar.
//                 every(entity, tier) diz se a entidade roda NESTE quadro (escalonado pelo id para espalhar a carga).
//                 asleep(x, z): fora da BOLHA ACORDADA (2× a visão máxima do zoom) — ali nada roda (ver Zones.asleep).
//
//   RenderCuller  particionamento espacial do RENDER. O Babylon, por padrão, avalia TODAS as malhas da cena a cada quadro
//                 (isReady, matriz, LOD, frustum…): ~1.100 malhas para desenhar ~150. Aqui as malhas ESTÁTICAS do mundo (matriz
//                 congelada: prédios, terreno, postes, sombras) vão para uma grade de 64 u na carga; a cada quadro o
//                 Babylon só recebe como candidatas as malhas das células que o retângulo da câmera (+ margem) toca (lista refeita só quando
//                 a câmera muda de célula) e as dinâmicas (carros, pessoas, efeitos) cujo nó raiz está dentro do retângulo.
// ============================================================================

class SpatialHash {
    constructor(cell = 16) {
        this.cell = cell;
        this.buckets = new Map();       // chave → array (reaproveitado entre quadros)
        this.used = [];                 // baldes com algo neste quadro
    }
    _key(i, j) { return (i + 4096) * 8192 + (j + 4096); }        // (cabe num inteiro pequeno do V8: a chave antiga passava de 2³¹ e cada Map.get ficava mais lento)
    clear() { for (const b of this.used) b.length = 0; this.used.length = 0; }
    insert(o, x, z) {
        if (!inWorld(x, z)) return;                                      // (fora do mundo: não entra na grade — ver inWorld)
        const k = this._key(Math.floor(x / this.cell), Math.floor(z / this.cell));
        let b = this.buckets.get(k);
        if (!b) this.buckets.set(k, b = []);
        if (!b.length) this.used.push(b);
        b.push(o);
    }
    // Tudo nas células que o círculo (x, z, r) toca (pode trazer um pouco a mais: quem chama ainda testa a distância).
    query(x, z, r, out) {
        out.length = 0;
        if (!inWorld(x, z)) return out;                                  // (posição infinita/gigante: o laço abaixo não terminaria)
        const c = this.cell, i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const b = this.buckets.get(this._key(i, j));
            if (b && b.length) for (let n = 0; n < b.length; n++) out.push(b[n]);
        }
        return out;
    }
}

const Zones = {
    cx: 0, cz: 0, hx: 60, hz: 40, frame: 0, margin: 14,
    count: [0, 0, 0],                // quantas entidades caíram em cada zona (último quadro; para o painel dev)
    _cnt: [0, 0, 0],

    // BOLHA ACORDADA: círculo FIXO de raio = 2× a meia-diagonal da maior visão possível (zoom todo afastado, Config.camera.maxView),
    // centrado na câmera. Fora dela o mundo DORME de verdade (asleep): carros sem IA nem física (corpo congelado no Havok), patrulha e
    // pedestres calmos sem lógica. O trânsito VIVE dentro dela: nasce entre a borda da tela no zoom máximo (sr) e a borda da bolha (ar)
    // e, ao sair, é reciclado para essa faixa (TrafficManager) — como no GTA. Não depende do zoom atual (dar zoom não acorda ninguém).
    ar: 139, sr: 76,
    asleep(x, z) { const dx = x - this.cx, dz = z - this.cz; return dx * dx + dz * dz > this.ar * this.ar; },

    update(game) {
        const cam = game.camera, c = cam.camera.position, eng = game.gameEngine.engine, asp = eng.getAspectRatio(cam.camera);
        this.cx = c.x; this.cz = c.z;
        this.hz = cam.view + this.margin;
        this.hx = cam.view * asp + this.margin;
        if (cam.viewYaw) this.hx = this.hz = Math.hypot(cam.view * asp, cam.view) + this.margin;      // câmera girada (bússola): o quadrado que cobre a tela em qualquer ângulo
        const hd = Math.hypot(Config.camera.maxView * Math.max(1, asp), Config.camera.maxView);      // meia-diagonal da tela no zoom máximo
        this.sr = hd + 6; this.ar = 2 * hd;
        this.frame++;
        this.count = this._cnt.slice(); this._cnt[0] = this._cnt[1] = this._cnt[2] = 0;
    },
    tier(x, z) {
        const dx = Math.abs(x - this.cx), dz = Math.abs(z - this.cz);
        const t = dx <= this.hx && dz <= this.hz ? 0 : (dx <= this.hx * 2 + 30 && dz <= this.hz * 2 + 30 ? 1 : 2);
        this._cnt[t]++;
        return t;
    },
    // Ponto dentro do retângulo da tela ampliado em `pad` u (sem contar nas estatísticas)?
    near(x, z, pad = 0) { return Math.abs(x - this.cx) <= this.hx + pad && Math.abs(z - this.cz) <= this.hz + pad; },
    // A entidade (com id numérico) roda neste quadro? Zona 0 sempre; 1 a cada n1 quadros; 2 a cada n2 (veículos usam 2/5: a direção
    // por perseguição de rota precisa de correções mais frequentes do que a lógica de um pedestre).
    // n1/n2 são contados a 30 FPS: com teto maior (60 no app de PC) o intervalo cresce junto, e quem está fora da tela continua rodando
    // as mesmas vezes por SEGUNDO (senão a 60 FPS toda a lógica fora da tela custaria o dobro sem ninguém ver diferença).
    every(id, tier, n1 = 3, n2 = 8) {
        if (tier === 0) return true;
        const k = Config.perf.fpsCap > 30 ? Math.round(Config.perf.fpsCap / 30) : 1;
        return (this.frame + (id | 0)) % ((tier === 1 ? n1 : n2) * k) === 0;
    },
};

class RenderCuller {
    constructor(scene, cell = 64) {
        this.scene = scene;
        this.cell = cell;
        this.grid = new Map();
        this.staticSet = new Set();
        this.dynamic = [];
        this._dynDirty = true;
        this.cand = { data: [], length: 0 };
        this._range = '';
        this._stamp = 0;
        this.enabled = !location.search.includes('nocull');
        this.stats = { static: 0, dynamic: 0, candidates: 0 };
        scene.onNewMeshAddedObservable.add(() => { this._dynDirty = true; });
        scene.onMeshRemovedObservable.add((m) => { this._dynDirty = true; if (this.staticSet.has(m)) { this.staticSet.delete(m); this._range = ''; } });
    }

    _key(i, j) { return (i + 4096) * 8192 + (j + 4096); }        // (cabe num inteiro pequeno do V8: a chave antiga passava de 2³¹ e cada Map.get ficava mais lento)

    // Registra as malhas estáticas que existem agora (fim da carga). Malhas com alwaysSelectAsActiveMesh ou gigantes (mar, lotes de
    // brilho) ficam como dinâmicas: são candidatas sempre.
    build() {
        for (const m of this.scene.meshes) {
            if (this.staticSet.has(m) || !m.isWorldMatrixFrozen || m.alwaysSelectAsActiveMesh || m.skeleton) continue;
            const bb = m.getBoundingInfo().boundingBox, a = bb.minimumWorld, b = bb.maximumWorld;
            if (b.x - a.x > 2400 || b.z - a.z > 2400) continue;
            const c = this.cell;
            for (let i = Math.floor(a.x / c); i <= Math.floor(b.x / c); i++) for (let j = Math.floor(a.z / c); j <= Math.floor(b.z / c); j++) {
                const k = this._key(i, j);
                let arr = this.grid.get(k);
                if (!arr) this.grid.set(k, arr = []);
                arr.push(m);
            }
            m._cullStamp = 0;
            this.staticSet.add(m);
        }
        this._dynDirty = true; this._range = '';
        this.stats.static = this.staticSet.size;
        if (this.enabled && !this._hooked) {
            this._hooked = true;
            this.scene.getActiveMeshCandidates = () => this._candidates();
        }
    }

    _candidates() {
        const sc = this.scene, cam = sc.activeCamera;
        if (!cam || !this.enabled) return { data: sc.meshes, length: sc.meshes.length };
        if (this._dynDirty) {
            this._dynDirty = false;
            this.dynamic.length = 0;
            for (const m of sc.meshes) if (!this.staticSet.has(m)) this.dynamic.push(m);
            this._range = '';
        }
        // Retângulo visto: o do jogo (Zones, que já tem a margem) ou, num palco/câmera diferente, o tamanho do frustum na altura do chão.
        const p = cam.position, hz = Zones.hz + 6, hx = Zones.hx + 6;
        if (!inWorld(p.x, p.z)) return { data: sc.meshes, length: sc.meshes.length };      // (câmera fora do mundo: o laço da grade não terminaria)
        const c = this.cell, i0 = Math.floor((p.x - hx) / c), i1 = Math.floor((p.x + hx) / c), j0 = Math.floor((p.z - hz) / c), j1 = Math.floor((p.z + hz) / c);
        const range = i0 + ',' + i1 + ',' + j0 + ',' + j1;
        if (range !== this._range) {
            this._range = range;
            const out = this.cand.data; out.length = 0;
            const st = ++this._stamp;
            for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
                const arr = this.grid.get(this._key(i, j));
                if (!arr) continue;
                for (const m of arr) if (m._cullStamp !== st && !m.isDisposed()) { m._cullStamp = st; out.push(m); }
            }
            this._nStatic = out.length;
        }
        // estáticas da área + dinâmicas cuja RAIZ (o nó que o jogo/física move) está no retângulo. Malha grande ou com vértices em
        // coordenadas de mundo (raio local > 40 u) e as marcadas alwaysSelectAsActiveMesh entram sempre. (Quem fica de fora não tem a
        // matriz recalculada pelo render, mas getAbsolutePosition() recalcula sob demanda: a IA continua lendo posições certas.)
        const out = this.cand.data;
        out.length = this._nStatic;
        const pad = 8, X0 = p.x, Z0 = p.z;
        for (const m of this.dynamic) {
            if (m.alwaysSelectAsActiveMesh || m._cullAlways) { out.push(m); continue; }
            let r = m._cullR;
            if (r === undefined) {
                const bi = m.getBoundingInfo && m.getBoundingInfo();
                r = m._cullR = bi ? bi.boundingSphere.radius * Math.max(Math.abs(m.scaling.x), Math.abs(m.scaling.z), 1) : 0;
                if (!bi || r > 40) { m._cullAlways = true; out.push(m); continue; }
            }
            // Malha parada (matriz congelada: pedaços do terreno criados depois da carga, com vértices em coordenadas de mundo e
            // posição 0,0,0) vale pelo centro da caixa. Pela posição, os pedaços pequenos (raio ≤ 40 u: ilhotas, pontas de costa)
            // ficavam "na origem" e nunca eram desenhados — o chão sumia e aparecia o mar por baixo das árvores.
            let q;
            if (m.isWorldMatrixFrozen && !m.parent) q = m._cullC || (m._cullC = m.getBoundingInfo().boundingBox.centerWorld.clone());
            else { let root = m; while (root.parent) root = root.parent; q = root.position; }
            if (Math.abs(q.x - X0) <= hx + r + pad && Math.abs(q.z - Z0) <= hz + r + pad) out.push(m);
        }
        this.cand.length = out.length;
        this.stats.dynamic = this.dynamic.length; this.stats.candidates = out.length;
        return this.cand;
    }
}
