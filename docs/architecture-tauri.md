# Dirty Money — Native Architecture (Tauri + Rust + Babylon.js)

Authoritative simulation in Rust, "dumb" Babylon.js client in the WebView. The legacy browser build (`index.html`,
`src/`) stays untouched and is the reference implementation, plus the source for the world-pack exporter.

## 1. Directory structure

```
Dirty-Money-Tauri/
├── package.json                    # Tauri CLI only (npm run dev / npm run build)
├── src-tauri/                      # ── AUTHORITY: all state, physics, AI, spatial partitioning ──
│   ├── Cargo.toml                  # release: LTO fat, codegen-units 1, panic=abort; dev deps built at O3
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/
│       ├── main.rs / lib.rs        # Tauri bootstrap, state registration, shutdown
│       ├── commands.rs             # IPC surface: world_info, subscribe_snapshots, push_input, get_chunk
│       ├── runtime.rs              # 60 TPS fixed-step thread (accumulator, catch-up cap, sleep+spin)
│       ├── sim/
│       │   ├── mod.rs              # World: tick orchestration, crowd bubble, AOI snapshot writer
│       │   ├── pool.rs             # Pool<T>: fixed capacity, generational handles, dense iteration
│       │   ├── spatial.rs          # DynamicGrid (per-tick counting sort) + StaticGrid (CSR, built once)
│       │   ├── physics.rs          # integrate, actor separation, static push-out, swept projectiles
│       │   ├── ai.rs               # staggered crowd decisions, stimulus reaction via grid queries
│       │   ├── entities.rs         # Actor / Projectile / GameEvent PODs, EventQueue
│       │   └── math.rs             # Vec2 (X/Z), xorshift RNG
│       ├── net/
│       │   ├── protocol.rs         # wire layouts + constants (mirrored in client/src/net/protocol.ts)
│       │   ├── snapshot.rs         # SnapshotWriter: reused Vec<u8>, little-endian records
│       │   └── input.rs            # InputMailbox: AtomicU64 state + AtomicU32 edge accumulator
│       └── world/
│           └── pack.rs             # world pack loader, per-chunk payload pre-encoding, procedural stand-in
└── client/                         # ── DUMB CLIENT: input, interpolation, rendering ──
    ├── index.html / vite.config.ts / tsconfig.json / package.json
    └── src/
        ├── main.ts                 # engine, camera, lights, render loop wiring
        ├── net/
        │   ├── protocol.ts         # mirror of protocol.rs
        │   ├── SnapshotDecoder.ts  # SnapshotFrame (SoA, O(1) id→row table) + decoder
        │   ├── InterpolationBuffer.ts  # ring + spare frame, server-clock estimate, lerp/extrapolate/snap
        │   └── SimLink.ts          # Tauri Channel (snapshots in), raw invoke (input out, chunks in)
        ├── input/InputSampler.ts   # 12-byte packets, on-change + heartbeat, edge accumulation
        └── render/
            ├── ThinInstanceBiome.ts    # per-prototype thin-instance batches, chunk-level LOD routing
            ├── ChunkStreamer.ts        # residency ring + frustum culling → biome rebuild on set change
            ├── ChunkData.ts            # chunk payload decode → baked matrices/colours + conservative AABB
            ├── EntityRenderer.ts       # per-kind thin-instance batches for crowds/projectiles
            ├── prototypes.ts           # placeholder meshes (to be replaced by the baked art atlas)
            └── matrix.ts               # allocation-free TRS writer, heading→yaw
```

## 2. Data flow

```
 WebView (client)                          IPC                         Rust
 ───────────────                         ─────                        ────
 InputSampler ── 12 B Uint8Array ──▶ push_input ──▶ InputMailbox (atomics) ──┐
                                                                          sim thread, 60 TPS
                                                   World::step ◀──────────┘
                                                     spawn bubble → player → AI → integrate
                                                     → DynamicGrid rebuild → actor pairs → statics
                                                     → projectiles → stimuli → deaths/recycling
 SimLink.onSnapshot ◀── Channel(Raw bytes) ◀── World::write_snapshot (AOI query on the grid)
   decode into spare frame → InterpolationBuffer.commit
 rAF (144 Hz): sample(now) → EntityRenderer → ChunkStreamer.update → InputSampler.flush → scene.render
 ChunkStreamer ── get_chunk(x, z) ──▶ WorldPack::chunk_bytes (pre-encoded, slice copy)
```

## 3. Phase 1 — backend decisions

| Concern | Decision | Cost |
|---|---|---|
| Broadphase (moving) | Uniform grid, 8 u cells, counting sort over *occupied* cells only, entries store x/z/radius inline | O(n) rebuild, no full-grid clear |
| Pairs | Forward half-stencil (self, E, SW, S, SE) — every pair once; requires radius ≤ cell/2 | O(n · local density) |
| Broadphase (static) | CSR grid, 16 u cells, built once; multi-cell AABBs deduped with a stamp counter | O(cells touched) per query |
| Memory | `Pool<T>` preallocated; `spawn` moves a value into a free slot; despawn bumps an 11-bit generation | zero allocation per tick |
| Deferred mutation | despawn/expire queues preallocated at pool capacity, drained after each pass | — |
| AI | decisions staggered over 4 ticks, steering every tick; gunshots reach agents through `query_radius` | O(events × nearby) |
| Crowd density | population bubble: spawn ring 80–160 u, recycle beyond 200 u, 1 500 target (GTA-style, same model as legacy `Zones`) | — |
| Snapshot | AOI (160 u) via grid query; 24 B header + 20 B/entity + 16 B/event into a reused `Vec<u8>` | ~30–80 KB/tick |
| Input | last-writer-wins `AtomicU64` + OR-accumulated edge bits | lock-free |
| Loop | fixed 1/60 s, ≤ 5 catch-up ticks then resync, sleep until 1.5 ms before deadline then spin | — |

**IPC reality check.** Tauri cannot share memory with WebView2, so "zero-cost" means: zero JSON, zero per-field
marshalling, zero allocation inside the tick. One owned `Vec<u8>` per publish is handed to the IPC channel; the
WebView receives a single `ArrayBuffer`. At 60 Hz × ~60 KB this is ~3.6 MB/s — negligible. Snapshot size is bounded by
the AOI, not the world population. If profiling ever shows channel latency, the next step is delta compression
(entities whose quantized state did not change are skipped and kept from the previous frame), not a transport change.

## 4. Phase 2 — frontend decisions

* **Thin instances everywhere repetition exists.** One GPU buffer per prototype (per LOD), containing only instances of
  visible chunks. Draw calls = prototypes on screen, regardless of instance count. Matrices are baked when a chunk
  loads, so a visibility change costs one `TypedArray.set` per (chunk, prototype). `thinInstanceBufferUpdated` uploads
  only `thinInstanceCount` instances.
* **Culling is chunk-level and ours.** Batch meshes use `alwaysSelectAsActiveMesh` (a single bounding box over every
  instance is meaningless); `ChunkStreamer` tests resident chunk AABBs against the frustum with a p-vertex test, only
  when the camera matrix `updateFlag` changes, and rebuilds batches only when the visible set changes. A culling
  margin keeps off-screen shadow casters in the shadow map.
* **Residency ≠ visibility.** Chunks within `loadRadius` are loaded nearest-first (2 in flight), evicted beyond
  `unloadRadius` (hysteresis). Only CPU arrays are held per chunk; GPU memory holds the visible union only.
* **Chunk LOD.** Chunks beyond `BIOME_LOD_DISTANCE` route their instances into the prototype's `lodMesh` batch.
* **Interpolation.** Render time = estimated server time − (2 ticks + 8 ms). The clock estimate tracks early arrivals
  fast and late ones slowly (jitter absorption), resyncs on > 250 ms error. Linear position, shortest-arc heading,
  ≤ 100 ms extrapolation on starvation, snap on > 10 u jumps. Id matching between frames is a dense `Int32Array` keyed
  by pool slot with generation check — no `Map`, no allocation. Incoming frames decode into a spare and swap in, so a
  late packet never corrupts a frame in use.

## 5. Frame budget targets (high-end PC, 144 Hz = 6.9 ms)

| Stage | Target |
|---|---|
| Sim tick (1 500 NPCs, 200 projectiles) | < 1.5 ms of the 16.6 ms tick, on its own thread |
| Snapshot decode + interpolation (≤ 4 096 entities) | < 0.4 ms |
| Entity matrix write + upload | < 0.5 ms |
| Biome rebuild (only on visible-set change) | < 1 ms, amortized ~0 |
| Draw calls (biome + entities + ground) | < 40 |

## 6. Migration plan from the legacy build

1. **World pack exporter** (next task): run the legacy generator (`src/map/MapData.js`, `WorldBuilder.js`,
   `RoadPlan.js`, `RuralPlan.js`) headless and emit `world.pack` — building/wall footprints as colliders, repeated props
   (trees, postes, hidrantes, guarda-sóis) as instances. Unique merged geometry (`MeshBatch`, terrain) becomes per-chunk
   static meshes, not instances. Ship it as a resource mapped to `world/world.pack`.
2. **Art**: move sprite baking (`src/art/*Sheet.js`, `SpriteBaker.js`) to an offline atlas build; entity batches get
   a per-instance `spriteFrame` attribute (anim × direction) consumed by a NodeMaterial — the server already streams
   `anim` and heading.
3. **Done — crowd pathfinding**: the legacy `GridCrowd` sends A* batches to `src-tauri/src/nav` (blocking pool,
   raw-byte IPC, raster uploaded once, barricade edits mirrored). Falls back to JS outside Tauri or on any error.
   Profiling showed the rest of the crowd is cheap once its O(n²) separation was replaced by a spatial grid, so further
   systems move only when measurements justify it (see docs/otimizacao.md).
4. **Systems port, in order**: player + weapons (`combat/`) → crowd (`npc/NPCManager`, `npcStates`) → traffic and
   vehicles (`vehicle/`; replace Havok with an oriented-box model or rapier2d on the same grids) → police and wanted
   level (`police/`) → economy/careers (pure state, no rendering) → save game.
5. **Weather**: state lives in Rust (already in the snapshot header); the client maps it to GPU particles and
   material uniforms only.
6. Retire the legacy `src/sim/worker.js` path; it is superseded by the Rust thread.

## 7. Running

The installer currently ships the **legacy game**: `scripts/package-legacy.mjs` copies `index.html`, `src/` and
`assets/` into `dist-game/` and vendors Babylon/Havok locally (offline, versions frozen). The native simulation stays
dormant (lazy `SimRuntime`) until a client subscribes, so it costs nothing there. Each system that gets ported switches
over when the new client reaches parity.

```
npm install
npx tauri icon assets/icon-512.png   # Windows build needs src-tauri/icons/icon.ico
npm run dev                          # legacy game inside the native window
npm run build                        # setup.exe with the legacy game

npm --prefix client install
npm run dev:engine                   # new Rust + Babylon client (tauri.engine.conf.json)
```

Without a `world.pack` resource the backend logs a notice and runs the procedural stand-in city (16 × 16 blocks,
streetlights, 24 000 trees). Controls: WASD move, Shift sprint, left mouse fire, E interact.
