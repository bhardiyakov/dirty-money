// ============================================================================
// ShopLife — the people INSIDE the shops: customers come in through the door, do what that kind of place is for and leave, while the
// staff work. Every routine is coherent with the room it happens in (art/ShopStyles.js lays out the room; art/ShopArt.js records
// where the seats, tables and counters are) and random in its details (who comes, when, how long they stay, which seat, which shelf).
//
//   food (burger, pizza, bakery, salads)  queue → order and pay at the register → wait for the order at the side (phone) → eat at a
//                                         table (fork and drink, 20–50 s) or take it away
//   fine (italian, japanese)              shown to a free table → the WAITER takes the order → brings the food → long meal → leave
//   bar                                   a stool at the bar or a table: drinks (several rounds); some stand at the bar
//   store (mart, pharmacy)                browse 1–3 shelves/coolers → queue → pay → leave
//   boutique (clothes)                    browse racks and shelves for longer → (most) pay → leave
//   guns, boca (drugs)                    straight to the counter, buy, leave; at the boca a few guys hang around on the phone
//   lux (banks, jewelry)                  bank: queue for the teller or use an ATM, sit and wait; jewelry: look at the showcases
//   (gym keeps its own regulars: Interiors._gymActor)
//
// Staff: the attendant behind the counter serves whoever is at the register ('work' facing the customer, who plays 'pay'), and
// between customers turns to prepare things behind; restaurants with table service have a WAITER walking between the counter and
// the tables. How many customers: the room's capacity × the demand at this hour for that kind of place (lunch, dinner, night…).
// Closed (or closing): nobody new comes in and whoever is inside finishes and leaves.
//
// Walking: a grid of 0.25 u over the room (the room's solids grown by the body radius), A* with 8 neighbours (no corner cutting) and
// the path pulled straight where the grid has a clear line. People avoid each other and the player (wait, then step around); the
// player bumps into them (their bodies are added to Interiors.obstacles every frame). Seats are reserved, one person each.
//
// The robbery (crime/Robbery.js) takes over: robberyCast() hands it the attendant and the customers inside, and ShopLife stops
// driving them until the session ends (then everyone runs out). A heist inside makes everyone kneel.
// Without the 2.5D characters (file://, ?npc=0) the shop keeps its old fixed extras.
// ============================================================================

const ShopLife = {
    CELL: 0.25,
    BODY_RADIUS: 0.3,
    WALK_SPEED: 1.2,
    RUN_SPEED: 3.2,
    TURN_SPEED: 9,
    MAX_AGENTS: 12,
    QUEUE_SPACING: 0.85,
    QUEUE_SLOTS: 6,
    FADE_TIME: 0.45,
    STUCK_REPATH: 1.6,
    STUCK_GIVE_UP: 7,
    MAX_LIFETIME: 300,

    FAMILY_OF: {
        burger: 'food', pizza: 'food', bakery: 'food', fit: 'food',
        italian: 'fine', japanese: 'fine', bar: 'bar',
        mart: 'store', pharmacy: 'store', clothes: 'boutique',
        guns: 'guns', drugs: 'boca', bank_branch: 'bank', bank_hq: 'bank', jewelry: 'jewelry',
    },
    CUSTOMER_TYPES: {
        default: ['loja_homem', 'loja_mulher', 'loja_jovem', 'loja_senhor', 'loja_homem', 'loja_mulher', 'loja_executiva'],
        fine: ['loja_executivo', 'loja_executiva', 'loja_senhor', 'loja_mulher', 'loja_homem'],
        bank: ['loja_executivo', 'loja_executiva', 'loja_senhor', 'loja_homem', 'loja_mulher'],
        jewelry: ['loja_executivo', 'loja_executiva', 'loja_senhor', 'loja_mulher'],
        boca: ['loja_jovem', 'loja_homem', 'loja_jovem', 'loja_homem'],
        bar: ['loja_homem', 'loja_jovem', 'loja_mulher', 'loja_senhor', 'loja_homem', 'loja_executivo'],
    },
    STAFF_TYPES: ['loja_atendente', 'loja_atendente_f'],

    active: false,
    agents: [],
    actorPool: [],
    _nextId: 1,

    // ======================================================================================== lifecycle

    available() {
        return typeof NpcArt !== 'undefined' && NpcArt.available() && ['loja_homem', 'loja_atendente'].every((id) => NpcArt.atlases[id]);
    },

    // Interiors._doEnter: takes over the shop's people. Returns false when this room keeps its fixed extras (homes, gym, no atlas).
    enter(game, shop, data) {
        this.leave();
        const family = this.FAMILY_OF[shop.style];
        if (!family || shop.home || shop.safehouse || !this.available()) return false;
        this.game = game;
        this.shop = shop;
        this.data = data;
        this.family = family;
        this.cast = this.castFor(shop);
        this.seed = Economy._h(shop.id || shop.style) >>> 0;
        this.random = Pixel.rng(this.seed ^ ((Date.now() / 1000) | 0));
        this.nav = this.navFor(data);
        this.points = this.pointsFor(data, family);
        this.baseObstacles = Interiors.obstacles.slice();
        this.queue = [];
        this.tablesToClear = [];
        this.spawnTimer = 1 + this.random() * 3;
        this.active = true;
        this.robbed = false;
        this._heistFrozen = false;
        this.createStaff();
        this.warmStart();
        return true;
    },

    leave() {
        if (!this.active) return;
        for (const agent of this.agents) this.releaseActor(agent);
        this.agents = [];
        this.queue = [];
        this.active = false;
        this.robbed = false;
    },

    // Meshes that must stay on when Interiors unloads the city (they are on the stage).
    meshes() { return this.agents.filter((agent) => agent.actor).map((agent) => agent.actor.mesh); },

    // ======================================================================================== cast and prefetch
    // The NPC pages load on demand (NpcArt): a type nobody drew yet only reaches the GPU seconds after its first actor appears, so the
    // people inside popped in after the fade. The cast of a visit (the staff and a few customer types) is picked as the player nears
    // the door and its pages are requested then (Interiors.autoEnter → prefetch); the fade stays black until they are drawn (ready).
    CAST_CUSTOMER_TYPES: 3,
    CAST_TTL: 90,                   // seconds a picked cast is kept for the door (walking back in soon meets the same people)

    castFor(shop) {
        const now = performance.now() / 1000, old = shop._lifeCast;
        if (old && now - old.at < this.CAST_TTL) { old.at = now; return old; }
        const family = this.FAMILY_OF[shop.style];
        const wanted = (this.CUSTOMER_TYPES[family] || this.CUSTOMER_TYPES.default).filter((id) => NpcArt.atlases[id]);
        const distinct = [...new Set(wanted)];
        for (let i = distinct.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [distinct[i], distinct[j]] = [distinct[j], distinct[i]]; }
        const chosen = new Set(distinct.slice(0, this.CAST_CUSTOMER_TYPES));
        const uniform = Economy._h(shop.id || shop.style) >>> 0;
        const staff = [...new Set([this.staffType(uniform), this.staffType(uniform + 1)])];
        return (shop._lifeCast = { at: now, customers: wanted.filter((id) => chosen.has(id)), staff });    // (repeated ids keep their weight)
    },

    // Requests the pages of the cast of `shop` (all but the falls). true = all of them are already on the GPU.
    prefetch(shop) {
        if (!this.FAMILY_OF[shop.style] || shop.home || shop.safehouse || !this.available()) return true;
        const cast = this.castFor(shop);
        let ready = true;
        for (const type of cast.staff.concat(cast.customers)) {
            const atlas = NpcArt.atlases[type];
            if (!atlas) continue;
            for (const page of atlas.pages) if (page.g !== 'fall' && !NpcArt.want(page)) ready = false;
        }
        return ready;
    },

    // Every person on stage already drawn (their page on the GPU)? Interiors holds the fade on black until then.
    ready() {
        if (!this.active) return true;
        return this.agents.every((agent) => !agent.actor || !agent.actor.mesh.isEnabled() || (agent.actor._pg && !agent.actor._npcWait));
    },

    // ======================================================================================== navigation grid

    navFor(data) {
        if (data._lifeNav) return data._lifeNav;
        const cell = this.CELL, radius = this.BODY_RADIUS, nx = Math.ceil(data.W / cell), nz = Math.ceil(data.D / cell);
        const blocked = new Uint8Array(nx * nz);
        const wallT = 0.7, dc = (data.door.x0 + data.door.x1) / 2;
        for (let iz = 0; iz < nz; iz++) {
            for (let ix = 0; ix < nx; ix++) {
                const x = (ix + 0.5) * cell, z = (iz + 0.5) * cell;
                const inDoorway = z < wallT + 0.2 && x > data.door.x0 + radius && x < data.door.x1 - radius;
                if (!inDoorway && (x < wallT + radius || x > data.W - wallT - radius || z < wallT + radius || z > data.D - wallT - radius)) { blocked[iz * nx + ix] = 1; continue; }
                for (const o of data.obs) {
                    if (o.wall && inDoorway) continue;
                    const cx = Math.max(o.x0, Math.min(x, o.x1)), cz = Math.max(o.z0, Math.min(z, o.z1));
                    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) { blocked[iz * nx + ix] = 1; break; }
                }
            }
        }
        const nav = { nx, nz, cell, blocked, reach: null, doorX: dc };
        nav.reach = this.floodFrom(nav, this.cellOf(nav, dc, 0.45));
        data._lifeNav = nav;
        return nav;
    },

    cellOf(nav, x, z) {
        return { ix: Math.max(0, Math.min(nav.nx - 1, Math.floor(x / nav.cell))), iz: Math.max(0, Math.min(nav.nz - 1, Math.floor(z / nav.cell))) };
    },

    isFree(nav, ix, iz) {
        return ix >= 0 && iz >= 0 && ix < nav.nx && iz < nav.nz && !nav.blocked[iz * nav.nx + ix];
    },

    // Free and reachable from the door.
    isWalkable(x, z, nav = this.nav) {
        const { ix, iz } = this.cellOf(nav, x, z);
        return this.isFree(nav, ix, iz) && !!nav.reach[iz * nav.nx + ix];
    },

    floodFrom(nav, start) {
        const reach = new Uint8Array(nav.nx * nav.nz);
        if (!this.isFree(nav, start.ix, start.iz)) return reach;
        const stack = [start.iz * nav.nx + start.ix];
        reach[stack[0]] = 1;
        while (stack.length) {
            const index = stack.pop(), ix = index % nav.nx, iz = (index / nav.nx) | 0;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = ix + dx, nz = iz + dz;
                if (!this.isFree(nav, nx, nz) || reach[nz * nav.nx + nx]) continue;
                reach[nz * nav.nx + nx] = 1;
                stack.push(nz * nav.nx + nx);
            }
        }
        return reach;
    },

    // Nearest walkable point to (x, z) within maxDistance (spiral over the cells), or null.
    nearestWalkable(x, z, maxDistance = 1.2) {
        const nav = this.nav, start = this.cellOf(nav, x, z), rings = Math.ceil(maxDistance / nav.cell);
        let best = null, bestDistance = Infinity;
        for (let r = 0; r <= rings; r++) {
            for (let dz = -r; dz <= r; dz++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const ix = start.ix + dx, iz = start.iz + dz;
                    if (!this.isFree(nav, ix, iz) || !nav.reach[iz * nav.nx + ix]) continue;
                    const px = (ix + 0.5) * nav.cell, pz = (iz + 0.5) * nav.cell, d = Math.hypot(px - x, pz - z);
                    if (d < bestDistance) { bestDistance = d; best = { x: px, z: pz }; }
                }
            }
            if (best && bestDistance <= (r + 0.5) * nav.cell) break;
        }
        return best && bestDistance <= maxDistance ? best : null;
    },

    // A* over the grid (8 neighbours, no corner cutting), then pulled straight. extraBlocked: Set of cell indices to avoid (people).
    findPath(fromX, fromZ, toX, toZ, extraBlocked = null) {
        const nav = this.nav, start = this.cellOf(nav, fromX, fromZ), goal = this.cellOf(nav, toX, toZ), nx = nav.nx;
        const startIndex = start.iz * nx + start.ix, goalIndex = goal.iz * nx + goal.ix;
        const passable = (ix, iz) => this.isFree(nav, ix, iz) && !(extraBlocked && extraBlocked.has(iz * nx + ix));
        if (startIndex === goalIndex) return [{ x: toX, z: toZ }];
        const cost = new Float32Array(nx * nav.nz).fill(Infinity), cameFrom = new Int32Array(nx * nav.nz).fill(-1), closed = new Uint8Array(nx * nav.nz);
        const open = [startIndex];
        const heuristic = (index) => { const dx = Math.abs(index % nx - goal.ix), dz = Math.abs(((index / nx) | 0) - goal.iz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
        const score = new Float32Array(nx * nav.nz).fill(Infinity);
        cost[startIndex] = 0; score[startIndex] = heuristic(startIndex);
        let found = false, iterations = 0;
        while (open.length && iterations++ < 20000) {
            let bestK = 0;
            for (let k = 1; k < open.length; k++) if (score[open[k]] < score[open[bestK]]) bestK = k;
            const current = open[bestK];
            open[bestK] = open[open.length - 1]; open.pop();
            if (current === goalIndex) { found = true; break; }
            if (closed[current]) continue;
            closed[current] = 1;
            const cx = current % nx, cz = (current / nx) | 0;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dz) continue;
                    const ix = cx + dx, iz = cz + dz, neighbour = iz * nx + ix;
                    const isGoal = neighbour === goalIndex;
                    if (!isGoal && !passable(ix, iz)) continue;
                    if (isGoal && !this.isFree(nav, ix, iz) && !(Math.abs(dx) + Math.abs(dz) === 1)) continue;
                    if (dx && dz && (!passable(cx + dx, cz) || !passable(cx, cz + dz))) continue;
                    const step = dx && dz ? 1.414 : 1, next = cost[current] + step;
                    if (next >= cost[neighbour]) continue;
                    cost[neighbour] = next; cameFrom[neighbour] = current; score[neighbour] = next + heuristic(neighbour);
                    open.push(neighbour);
                }
            }
        }
        if (!found) return null;
        const cells = [];
        for (let index = goalIndex; index !== -1 && index !== startIndex; index = cameFrom[index]) cells.push(index);
        cells.reverse();
        const points = cells.map((index) => ({ x: (index % nx + 0.5) * nav.cell, z: (((index / nx) | 0) + 0.5) * nav.cell }));
        points[points.length - 1] = { x: toX, z: toZ };
        return this.smoothPath(fromX, fromZ, points, extraBlocked);
    },

    hasLineOfSight(x0, z0, x1, z1, extraBlocked = null) {
        const nav = this.nav, distance = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(1, Math.ceil(distance / (nav.cell * 0.5)));
        for (let s = 1; s < steps; s++) {
            const x = x0 + (x1 - x0) * s / steps, z = z0 + (z1 - z0) * s / steps, { ix, iz } = this.cellOf(nav, x, z);
            if (!this.isFree(nav, ix, iz) || (extraBlocked && extraBlocked.has(iz * nav.nx + ix))) return false;
        }
        return true;
    },

    smoothPath(fromX, fromZ, points, extraBlocked) {
        const out = [];
        let anchorX = fromX, anchorZ = fromZ, k = 0;
        while (k < points.length) {
            let far = k;
            for (let j = points.length - 1; j > k; j--) {
                if (this.hasLineOfSight(anchorX, anchorZ, points[j].x, points[j].z, extraBlocked)) { far = j; break; }
            }
            out.push(points[far]);
            anchorX = points[far].x; anchorZ = points[far].z;
            k = far + 1;
        }
        return out;
    },

    // ======================================================================================== points of interest

    pointsFor(data, family) {
        const key = '_lifePoints';
        if (data[key]) return data[key];
        const nav = this.nav, life = data.life || { seats: [], tables: [], counters: [] };
        const dc = (data.door.x0 + data.door.x1) / 2;
        const points = { door: { x: dc, z: 0.45 }, outside: { x: dc, z: -0.7 }, seats: [], browse: [], barStand: [], loiter: [], atms: [], pool: [], service: null, queue: [], pickup: null, waiterHome: null };
        const rectDistance = (r, x, z) => Math.hypot(x - Math.max(r.x0, Math.min(x, r.x1)), z - Math.max(r.z0, Math.min(z, r.z1)));
        const headingTo = (x, z, r) => Math.atan2(Math.max(r.x0, Math.min(x, r.x1)) - x, Math.max(r.z0, Math.min(z, r.z1)) - z);
        const backHeading = { s: Math.PI, n: 0, e: Math.PI / 2, w: -Math.PI / 2 };

        // ---- the register: from the attendant, straight south past the counter, to the first free cell
        const clerk = data.clerk;
        if (clerk) {
            let z = clerk.z - 0.3, crossed = false;
            while (z > 0.8) {
                const free = this.isWalkable(clerk.x, z, nav);
                if (!free) crossed = true;
                else if (crossed) break;
                z -= 0.1;
            }
            const service = this.nearestWalkable(clerk.x, z - 0.2, 1.0);
            if (service) {
                points.service = { x: service.x, z: service.z, heading: Math.atan2(clerk.x - service.x, clerk.z - service.z) };
                // queue: from the register towards the door, bending around what is in the way
                let qx = service.x, qz = service.z;
                for (let k = 1; k < this.QUEUE_SLOTS; k++) {
                    let next = null;
                    for (const [dx, dz] of [[0, -1], [Math.sign(dc - qx) * 0.7, -0.7], [Math.sign(dc - qx), 0], [-Math.sign(dc - qx) * 0.7, -0.7]]) {
                        const len = Math.hypot(dx, dz) || 1, x = qx + dx / len * this.QUEUE_SPACING, zz = qz + dz / len * this.QUEUE_SPACING;
                        if (zz > 1.1 && this.isWalkable(x, zz, nav)) { next = { x, z: zz }; break; }
                    }
                    if (!next) break;
                    points.queue.push(next);
                    qx = next.x; qz = next.z;
                }
                for (const side of [1, -1]) {
                    const p = this.nearestWalkable(service.x + side * 1.5, service.z - 0.3, 0.8);
                    if (p && Math.hypot(p.x - service.x, p.z - service.z) > 1.0) { points.pickup = { x: p.x, z: p.z, heading: Math.atan2(clerk.x - p.x, clerk.z - p.z) }; break; }
                }
                const home = this.nearestWalkable(service.x + 2.6 * (service.x < data.W / 2 ? 1 : -1), service.z, 1.4);
                points.waiterHome = home ? { x: home.x, z: home.z, heading: Math.atan2(clerk.x - home.x, clerk.z - home.z) } : null;
            }
        }

        // ---- seats: facing their table (or the counter, for stools), entered from the free side
        for (const seat of life.seats) {
            let table = null, tableDistance = 1.15;
            for (const t of life.tables) { const d = rectDistance(t, seat.x, seat.z); if (d < tableDistance) { tableDistance = d; table = t; } }
            let counter = null, counterDistance = 1.7;                                   // (stools in front of a bar or a sushi counter)
            if (!table) for (const c of life.counters) { const d = rectDistance(c, seat.x, seat.z); if (d < counterDistance) { counterDistance = d; counter = c; } }
            const heading = table ? headingTo(seat.x, seat.z, table) : counter ? headingTo(seat.x, seat.z, counter) : backHeading[seat.back] !== undefined ? backHeading[seat.back] : Math.PI;
            const fx = Math.sin(heading), fz = Math.cos(heading);
            let approach = null;
            for (const [ax, az] of [[-fx, -fz], [fz, -fx], [-fz, fx]]) {
                const p = this.nearestWalkable(seat.x + ax * 0.7, seat.z + az * 0.7, 0.35);
                if (p) { approach = p; break; }
            }
            if (!approach) continue;
            points.seats.push({ x: seat.x, z: seat.z, heading, approach, kind: table ? 'dine' : counter ? 'bar' : 'wait', table, taken: null });
        }

        // ---- things to look at: shelves, coolers, gondolas, showcases, racks (anything solid that is not a wall, seat, table or register)
        const browseFamilies = { store: 1, boutique: 1, jewelry: 1, guns: 1, boca: 1, food: 1, bar: 0, fine: 0, bank: 0 };
        if (browseFamilies[family]) {
            const isCounter = (o) => life.counters.some((c) => Math.abs(c.x0 - o.x0) < 0.01 && Math.abs(c.z0 - o.z0) < 0.01);
            const isTable = (o) => life.tables.some((t) => Math.abs(t.x0 - o.x0) < 0.01 && Math.abs(t.z0 - o.z0) < 0.01);
            const stock = (data.uses || []).filter((u) => u.kind === 'stock' || u.kind === 'case');
            const fromUses = family === 'food' ? stock.filter((u) => u.kind === 'stock') : stock;
            const fromSolids = family === 'boutique' || family === 'guns' || family === 'boca'
                ? data.obs.filter((o) => !o.wall && !o.seat && o.h >= 0.85 && o.h <= 2.6 && !isCounter(o) && !isTable(o) && (o.x1 - o.x0) * (o.z1 - o.z0) < 9)
                : [];
            const rects = fromUses.concat(fromSolids.map((o) => ({ x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1 })));
            for (const r of rects) {
                const sides = [
                    { from: [r.x0, r.z0 - 0.6], to: [r.x1, r.z0 - 0.6] }, { from: [r.x0, r.z1 + 0.6], to: [r.x1, r.z1 + 0.6] },
                    { from: [r.x0 - 0.6, r.z0], to: [r.x0 - 0.6, r.z1] }, { from: [r.x1 + 0.6, r.z0], to: [r.x1 + 0.6, r.z1] },
                ];
                for (const side of sides) {
                    const length = Math.hypot(side.to[0] - side.from[0], side.to[1] - side.from[1]), count = Math.max(1, Math.floor(length / 1.2));
                    for (let k = 0; k < count; k++) {
                        const s = (k + 0.5) / count, x = side.from[0] + (side.to[0] - side.from[0]) * s, z = side.from[1] + (side.to[1] - side.from[1]) * s;
                        if (!this.isWalkable(x, z, nav)) continue;
                        if (points.browse.some((b) => Math.hypot(b.x - x, b.z - z) < 0.8)) continue;
                        if (points.service && Math.hypot(points.service.x - x, points.service.z - z) < 1.2) continue;
                        points.browse.push({ x, z, heading: headingTo(x, z, r), taken: null });
                    }
                }
            }
        }

        // ---- standing at the bar (drink) and leaning on a wall (waiting, the boca's lookouts)
        for (const c of life.counters) {
            if (family !== 'bar' || c.register) continue;
            for (let x = c.x0 + 0.5; x < c.x1 - 0.3; x += 1.0) {
                const p = this.nearestWalkable(x, c.z0 - 0.55, 0.3);
                if (p && !points.seats.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 0.8)) points.barStand.push({ x: p.x, z: p.z, heading: 0, taken: null });
            }
        }
        for (let k = 0; k < 14; k++) {
            const left = k % 2 === 0, z = 1.6 + (k >> 1) * 1.3, x = left ? 1.15 : data.W - 1.15;
            if (z > data.D - 1.5 || !this.isWalkable(x, z, nav)) continue;
            points.loiter.push({ x, z, heading: left ? Math.PI / 2 : -Math.PI / 2, taken: null });
        }
        for (const u of data.uses || []) {                                           // around the pool table: people watching the game
            if (u.kind !== 'pool') continue;
            for (const [x, z] of [[u.x0 - 0.9, (u.z0 + u.z1) / 2], [u.x1 + 0.9, (u.z0 + u.z1) / 2], [(u.x0 + u.x1) / 2, u.z0 - 0.9], [u.x0 + 0.4, u.z1 + 0.9], [u.x1 - 0.4, u.z1 + 0.9]]) {
                const p = this.nearestWalkable(x, z, 0.4);
                if (p) points.pool.push({ x: p.x, z: p.z, heading: headingTo(p.x, p.z, u), taken: null });
            }
        }
        for (const u of data.uses || []) {
            if (u.kind !== 'atm') continue;
            const p = this.nearestWalkable((u.x0 + u.x1) / 2 + 0.75, (u.z0 + u.z1) / 2, 0.6);
            if (p) points.atms.push({ x: p.x, z: p.z, heading: headingTo(p.x, p.z, u), taken: null });
        }
        data[key] = points;
        return points;
    },

    // Fresh reservations for this visit (the points are cached per room; who is using them is not).
    resetReservations() {
        for (const list of ['seats', 'browse', 'barStand', 'loiter', 'atms', 'pool']) for (const p of this.points[list]) p.taken = null;
    },

    // ======================================================================================== demand

    // How busy this kind of place is at this hour (0..1).
    demand(hour) {
        const h = ((hour % 24) + 24) % 24, bump = (center, width) => Math.exp(-(((h - center + 36) % 24 - 12) ** 2) / (2 * width * width));
        switch (this.family) {
            case 'food': return 0.25 + 0.75 * Math.max(bump(12.8, 1.4), bump(19.8, 1.6), 0.35 * bump(16, 2));
            case 'fine': return 0.15 + 0.85 * Math.max(bump(13, 1.2), bump(20.8, 1.5));
            case 'bar': return 0.2 + 0.8 * Math.max(bump(19, 2.2), bump(22.5, 2), 0.4 * bump(13, 1.5));
            case 'store': return 0.35 + 0.65 * Math.max(bump(9, 2), bump(18.5, 2.5));
            case 'boutique': return 0.3 + 0.7 * bump(16, 3);
            case 'boca': return 0.35 + 0.65 * Math.max(bump(23, 3), bump(2, 2.5));
            case 'bank': return 0.5 + 0.5 * bump(12, 2);
            default: return 0.5;
        }
    },

    capacity() {
        const P = this.points, seats = P.seats.length;
        const byFamily = { food: Math.min(10, Math.max(3, seats + 3)), fine: Math.min(10, Math.max(2, seats)), bar: Math.min(11, Math.max(3, seats + Math.min(3, P.barStand.length))),
            store: Math.min(6, 2 + Math.floor(P.browse.length / 2)), boutique: Math.min(6, 2 + Math.floor(P.browse.length / 2)), guns: 2, boca: 4, bank: 5, jewelry: Math.min(4, 1 + Math.floor(P.browse.length / 2)) };
        return Math.min(this.MAX_AGENTS - this.staffCount(), byFamily[this.family] || 4);
    },

    staffCount() { return this.agents.filter((a) => a.role !== 'customer').length; },

    targetCustomers() {
        const hour = this.game.dayNight.hour;
        if (!Economy.isOpen(this.shop.style, hour) || this.robbed) return 0;
        return Math.round(this.capacity() * this.demand(hour));
    },

    // ======================================================================================== actors

    acquireActor(type, row) {
        const sheet = NpcArt.sheet(type);
        let actor = this.actorPool.pop();
        if (!actor) {
            actor = new SpriteActor(this.game.scene, sheet, row, 'shopLife' + this._nextId);
        } else {
            if (actor.sheet !== sheet) actor.useSheet(sheet);
            actor.setVariant(row);
        }
        actor.mesh.visibility = 1;
        actor.setVisible(true);
        return actor;
    },

    releaseActor(agent) {
        if (!agent.actor) return;
        agent.actor.setVisible(false);
        agent.actor.mesh.visibility = 1;
        this.actorPool.push(agent.actor);
        agent.actor = null;
    },

    pickCustomerType() {
        const wanted = this.cast && this.cast.customers.length ? this.cast.customers : this.CUSTOMER_TYPES[this.family] || this.CUSTOMER_TYPES.default;
        const list = wanted.filter((id) => NpcArt.atlases[id]);
        return list.length ? list[Math.floor(this.random() * list.length)] : 'loja_homem';
    },
    staffType(k) {
        const id = this.STAFF_TYPES[k % this.STAFF_TYPES.length];
        return NpcArt.atlases[id] ? id : 'loja_atendente';
    },

    createAgent(role, type, variantSeed) {
        const nvar = NpcData.nvar(type) || 1, row = NpcArt.row(type, Math.abs(variantSeed) % nvar);
        const agent = {
            id: this._nextId++, role, type, actor: this.acquireActor(type, row),
            x: 0, z: 0, heading: 0, targetHeading: 0, anim: null, animRate: 1,
            plan: [], step: null, path: null, pathIndex: 0, onArrive: null, wait: 0, stuck: 0, timer: 0, age: 0,
            fade: 1, fadeDir: 0, seat: null, spot: null, inQueue: false, served: false, needs: null, outside: false,
        };
        this.agents.push(agent);
        return agent;
    },

    place(agent, x, z, heading = agent.heading) {
        agent.x = x; agent.z = z; agent.heading = heading; agent.targetHeading = heading;
        this.syncActor(agent);
    },

    syncActor(agent) {
        const a = agent.actor; if (!a) return;
        const o = Interiors.STAGE;
        a.setPosition(o.x + agent.x, o.z + agent.z);
        a.setHeading(agent.heading);
        a.mesh.position.y = 0.5;
    },

    playAnim(agent, name, rate = 1, restart = false) {
        if (!agent.actor) return;
        agent.animRate = rate;
        if (agent.anim === name && !restart) return;
        agent.anim = name;
        if (!agent.actor.play(name, 'none', { restart: true })) agent.actor.play('idle', 'none', { restart: true });
        if (agent.actor.setPhase) agent.actor.setPhase(this.random());
    },

    // ======================================================================================== staff

    createStaff() {
        const data = this.data, clerk = data.clerk;
        const uniform = this.seed;                                   // the same uniform colour for everyone who works here
        if (clerk) {
            const type = this.staffType(uniform);
            const agent = this.createAgent('clerk', type, uniform);
            this.place(agent, clerk.x, clerk.z, clerk.face);
            agent.home = { x: clerk.x, z: clerk.z, heading: clerk.face };
            agent.timer = 4 + this.random() * 8;
            agent.mode = 'idle';
            this.playAnim(agent, 'idle');
            this.clerk = agent;
        } else this.clerk = null;
        this.waiter = null;
        const P = this.points;
        if ((this.family === 'fine' || (this.family === 'food' && P.seats.filter((s) => s.kind === 'dine').length >= 6) || (this.family === 'bar' && P.seats.length >= 8)) && P.waiterHome) {
            const type = this.staffType(uniform + 1);
            const agent = this.createAgent('waiter', type, uniform);
            this.place(agent, P.waiterHome.x, P.waiterHome.z, P.waiterHome.heading);
            agent.home = P.waiterHome;
            agent.tasks = [];
            this.playAnim(agent, 'idle');
            this.waiter = agent;
        }
        // assaltada há poucos dias (WorldMemory): um PM de plantão do lado de dentro da porta, de olho em quem entra
        this.guard = null;
        if (typeof WorldMemory !== 'undefined' && WorldMemory.guarded(this.shop) && NpcArt.atlases.pm_policial) {
            const D = this.points.door, side = D.x > this.data.W / 2 ? -1 : 1;
            const agent = this.createAgent('guard', 'pm_policial', uniform + 7);
            this.place(agent, D.x + side * 1.9, 1.35, 0);
            agent.home = { x: D.x + side * 1.9, z: 1.35, heading: 0 };
            agent.timer = 2 + this.random() * 4;
            this.playAnim(agent, 'idle');
            this.guard = agent;
        }
    },

    // O PM de plantão: parado, olhando a loja; de vez em quando vira para a porta (quem entra) e volta.
    updateGuard(agent, dt) {
        agent.timer -= dt;
        if (agent.timer > 0) return;
        agent.timer = 3 + this.random() * 6;
        const P = this.game && this.game.player && this.game.player.position, o = Interiors.STAGE;
        if (P && this.random() < 0.6) agent.targetHeading = Math.atan2(P.x - o.x - agent.x, P.z - o.z - agent.z);
        else agent.targetHeading = agent.home.heading + (this.random() - 0.5) * 1.6;
    },

    updateClerk(agent, dt) {
        const serving = this.queue[0] && this.queue[0].atRegister ? this.queue[0] : null;
        if (serving) {
            agent.mode = 'serving';
            agent.targetHeading = Math.atan2(serving.x - agent.x, serving.z - agent.z);
            this.playAnim(agent, 'work');
            return;
        }
        if (agent.mode === 'serving') { agent.mode = 'idle'; agent.timer = 3 + this.random() * 5; agent.targetHeading = agent.home.heading; this.playAnim(agent, 'idle'); }
        agent.timer -= dt;
        if (agent.timer > 0) return;
        if (agent.mode === 'idle') {                                   // between customers: turn around and prepare / tidy up behind
            agent.mode = 'prepare';
            agent.targetHeading = agent.home.heading + Math.PI;
            agent.timer = 4 + this.random() * 6;
            this.playAnim(agent, 'work');
        } else {
            agent.mode = 'idle';
            agent.targetHeading = agent.home.heading;
            agent.timer = 5 + this.random() * 10;
            this.playAnim(agent, this.random() < 0.3 ? 'work' : 'idle');
        }
    },

    // The waiter: takes the order at the table, goes to the counter, brings the food, and sometimes tidies a table.
    updateWaiter(agent, dt) {
        if (agent.path) return;
        if (agent.timer > 0) { agent.timer -= dt; if (agent.timer > 0) return; }
        const task = agent.task;
        if (task) {
            agent.task = null;
            if (task.kind === 'order' && task.customer.needs === 'order') { task.customer.needs = 'cooking'; task.customer.timer = 6 + this.random() * 8; }
            if (task.kind === 'deliver' && task.customer.needs === 'food') { task.customer.needs = null; task.customer.sipTimer = 0; }
        }
        const customers = this.agents.filter((a) => a.role === 'customer' && a.seat && a.state === 'seated');
        const nextOrder = customers.find((c) => c.needs === 'order');
        const nextFood = customers.find((c) => c.needs === 'food');
        const go = (customer, kind) => {
            const seat = customer.seat, side = this.nearestWalkable(seat.approach.x + Math.cos(seat.heading) * 0.55, seat.approach.z - Math.sin(seat.heading) * 0.55, 0.9) || seat.approach;
            this.walkTo(agent, side.x, side.z, () => {
                agent.targetHeading = Math.atan2(customer.x - agent.x, customer.z - agent.z);
                this.playAnim(agent, 'work');
                agent.timer = kind === 'order' ? 3 + this.random() * 2 : 1.6;
                agent.task = { kind, customer };
            });
        };
        const toClear = (this.tablesToClear || []).find((seat) => !seat.taken);
        if (nextFood) go(nextFood, 'deliver');
        else if (nextOrder) go(nextOrder, 'order');
        else if (toClear) {                                                // clears the table someone just left (plates, glasses)
            this.tablesToClear.splice(this.tablesToClear.indexOf(toClear), 1);
            this.walkTo(agent, toClear.approach.x, toClear.approach.z, () => {
                agent.targetHeading = toClear.heading;
                this.playAnim(agent, 'work');
                agent.timer = 2.5 + this.random() * 1.5;
            });
        }
        else if (Math.hypot(agent.x - agent.home.x, agent.z - agent.home.z) > 0.3) this.walkTo(agent, agent.home.x, agent.home.z, () => { agent.targetHeading = agent.home.heading; this.playAnim(agent, 'idle'); });
        else { this.playAnim(agent, this.random() < 0.5 ? 'work' : 'idle'); agent.timer = 2 + this.random() * 3; }
    },

    // ======================================================================================== customer plans

    // What this customer will do, in order (each step is run by runStep; 'leave' is always last).
    planFor() {
        const r = this.random, P = this.points, plan = [];
        const browse = (min, max) => { const n = min + Math.floor(r() * (max - min + 1)); for (let k = 0; k < n; k++) plan.push({ kind: 'browse', time: [5, 11] }); };
        switch (this.family) {
            case 'food':
                if (r() < 0.12 && P.browse.length) plan.push({ kind: 'browse', time: [3, 6] });
                plan.push({ kind: 'queue', serve: [3.5, 6.5] });
                if (P.pickup) plan.push({ kind: 'pickup', time: [4, 9] });
                if (r() < 0.72 && P.seats.length) plan.push({ kind: 'seat', want: ['dine', 'bar', 'wait'], activity: 'eat', time: [22, 50] });
                break;
            case 'fine':
                plan.push({ kind: 'seat', want: ['dine'], activity: 'dine', time: [40, 80] });
                break;
            case 'bar':
                if (P.barStand.length && r() < 0.3) plan.push({ kind: 'standDrink', time: [18, 40] });
                if (P.pool.length && r() < 0.3) plan.push({ kind: 'watchPool', time: [15, 35] });
                plan.push({ kind: 'seat', want: r() < 0.6 ? ['bar', 'dine'] : ['dine', 'bar'], activity: 'drink', time: [30, 70] });
                break;
            case 'store':
                browse(1, 3);
                plan.push({ kind: 'queue', serve: [3, 5] });
                break;
            case 'boutique':
                browse(2, 4);
                if (r() < 0.75) plan.push({ kind: 'queue', serve: [4, 7] });
                break;
            case 'guns':
                if (P.browse.length && r() < 0.6) browse(1, 2);
                plan.push({ kind: 'queue', serve: [6, 11] });
                break;
            case 'boca':
                if (r() < 0.4 && P.loiter.length) plan.push({ kind: 'loiter', time: [20, 55] });
                else plan.push({ kind: 'queue', serve: [4, 8] });
                break;
            case 'bank':
                if (P.atms.length && r() < 0.35) plan.push({ kind: 'atm', time: [6, 10] });
                else {
                    if (r() < 0.4 && P.seats.some((s) => s.kind !== 'dine')) plan.push({ kind: 'seat', want: ['wait'], activity: 'wait', time: [8, 18] });
                    plan.push({ kind: 'queue', serve: [8, 15] });
                }
                break;
            case 'jewelry':
                browse(1, 3);
                if (r() < 0.3) plan.push({ kind: 'queue', serve: [8, 14] });
                break;
            default:
                plan.push({ kind: 'queue', serve: [4, 7] });
        }
        plan.push({ kind: 'leave' });
        return plan;
    },

    spawnCustomer() {
        const type = this.pickCustomerType();
        const agent = this.createAgent('customer', type, (this.random() * 1e6) | 0);
        const door = this.points.door, outside = this.points.outside;
        this.place(agent, outside.x + (this.random() - 0.5) * 1.2, outside.z, 0);
        agent.fade = 0; agent.fadeDir = 1;
        agent.plan = this.planFor();
        agent.state = 'entering';
        this.walkStraight(agent, door.x + (this.random() - 0.5) * 0.8, door.z + 0.3, () => this.nextStep(agent));
        return agent;
    },

    // ---- warm start: the shop is already alive when the player walks in (people mid-meal, in the queue, at the shelves)
    warmStart() {
        this.resetReservations();
        const target = this.targetCustomers(), P = this.points;
        for (let k = 0; k < target; k++) {
            const agent = this.createAgent('customer', this.pickCustomerType(), (this.random() * 1e6) | 0);
            agent.plan = this.planFor();
            agent.age = this.random() * 20;
            // skip into the middle of the plan: the step that best shows this kind of place
            const roll = this.random();
            let started = false;
            if (roll < 0.65) {
                const seatStep = agent.plan.findIndex((s) => s.kind === 'seat');
                if (seatStep >= 0) {
                    const step = agent.plan[seatStep], seat = this.freeSeat(step.want);
                    if (seat) {
                        agent.plan = agent.plan.slice(seatStep + 1);
                        this.sitDown(agent, seat, step, 0.15 + 0.7 * this.random());
                        if (this.family === 'fine' && this.random() < 0.3) agent.needs = 'order';
                        started = true;
                    }
                }
                const browseStep = !started && agent.plan.findIndex((s) => s.kind === 'browse');
                if (!started && browseStep >= 0) {
                    const spot = this.freeSpot(P.browse);
                    if (spot) {
                        agent.plan = agent.plan.slice(browseStep + 1);
                        this.place(agent, spot.x, spot.z, spot.heading);
                        this.occupySpot(agent, spot, 'browse', [2, 8]);
                        started = true;
                    }
                }
            }
            if (!started) {
                const queueStep = agent.plan.findIndex((s) => s.kind === 'queue');
                if (queueStep >= 0 && P.service && this.queue.length < P.queue.length) {
                    agent.plan = agent.plan.slice(queueStep);
                    const slot = this.queue.length === 0 ? P.service : P.queue[this.queue.length - 1];
                    this.place(agent, slot.x, slot.z, P.service.heading);
                    this.nextStep(agent);
                    started = true;
                }
            }
            if (!started) {                                            // nothing to show: just arriving, already inside
                const spawnAt = this.nearestWalkable(P.door.x + (this.random() - 0.5) * 2, 2.2 + this.random() * 2, 1.5) || P.door;
                this.place(agent, spawnAt.x, spawnAt.z, 0);
                this.nextStep(agent);
            }
        }
    },

    nextStep(agent) {
        agent.step = agent.plan.shift() || { kind: 'leave' };
        agent.timer = 0;
        this.runStep(agent);
    },

    runStep(agent) {
        const step = agent.step, P = this.points, range = (t) => t[0] + this.random() * (t[1] - t[0]);
        switch (step.kind) {
            case 'browse': {
                const spot = this.freeSpot(P.browse, agent);
                if (!spot) return this.nextStep(agent);
                spot.taken = agent;
                agent.spot = spot;
                agent.state = 'going';
                this.walkTo(agent, spot.x, spot.z, () => this.occupySpot(agent, spot, 'browse', step.time));
                return;
            }
            case 'standDrink': {
                const spot = this.freeSpot(P.barStand, agent);
                if (!spot) return this.nextStep(agent);
                spot.taken = agent; agent.spot = spot; agent.state = 'going';
                this.walkTo(agent, spot.x, spot.z, () => this.occupySpot(agent, spot, 'drink', step.time));
                return;
            }
            case 'watchPool': {
                const spot = this.freeSpot(P.pool, agent);
                if (!spot) return this.nextStep(agent);
                spot.taken = agent; agent.spot = spot; agent.state = 'going';
                this.walkTo(agent, spot.x, spot.z, () => this.occupySpot(agent, spot, this.random() < 0.6 ? 'drink' : 'idle', step.time));
                return;
            }
            case 'loiter': {
                const spot = this.freeSpot(P.loiter, agent);
                if (!spot) return this.nextStep(agent);
                spot.taken = agent; agent.spot = spot; agent.state = 'going';
                this.walkTo(agent, spot.x, spot.z, () => this.occupySpot(agent, spot, 'phone', step.time));
                return;
            }
            case 'atm': {
                const spot = this.freeSpot(P.atms, agent);
                if (!spot) return this.nextStep(agent);
                spot.taken = agent; agent.spot = spot; agent.state = 'going';
                this.walkTo(agent, spot.x, spot.z, () => this.occupySpot(agent, spot, 'pay', step.time));
                return;
            }
            case 'queue': {
                if (!P.service) return this.nextStep(agent);
                if (this.queue.length >= P.queue.length + 1) { if (agent.plan.length && agent.plan[0].kind !== 'leave') agent.plan.shift(); return this.nextStep(agent); }
                this.queue.push(agent);
                agent.inQueue = true; agent.atRegister = false; agent.served = false;
                agent.serveTime = range(step.serve);
                agent.state = 'queue';
                this.moveInQueue(agent);
                return;
            }
            case 'pickup': {
                const spot = P.pickup;
                agent.state = 'going';
                this.walkTo(agent, spot.x + (this.random() - 0.5) * 0.4, spot.z + (this.random() - 0.5) * 0.3, () => {
                    agent.state = 'waiting'; agent.targetHeading = spot.heading; agent.timer = range(step.time);
                    this.playAnim(agent, this.random() < 0.6 ? 'phone' : 'idle');
                });
                return;
            }
            case 'seat': {
                const seat = this.freeSeat(step.want, agent);
                if (!seat) return this.nextStep(agent);
                seat.taken = agent; agent.seat = seat; agent.state = 'going';
                this.walkTo(agent, seat.approach.x, seat.approach.z, () => this.sitDown(agent, seat, step, 0));
                return;
            }
            case 'leave':
            default: {
                agent.state = 'leaving';
                const door = P.door;
                this.walkTo(agent, door.x + (this.random() - 0.5) * 0.6, door.z, () => {
                    this.walkStraight(agent, P.outside.x + (this.random() - 0.5) * 1.2, P.outside.z, () => { agent.state = 'gone'; });
                    agent.fadeDir = -1;
                });
            }
        }
    },

    occupySpot(agent, spot, anim, time) {
        agent.state = 'busy';
        agent.targetHeading = spot.heading;
        agent.timer = Array.isArray(time) ? time[0] + this.random() * (time[1] - time[0]) : time;
        this.playAnim(agent, anim);
        agent.onTimer = () => { spot.taken = null; agent.spot = null; this.nextStep(agent); };
    },

    // On the seat (snaps from the approach point); `progress` > 0: already part-way (warm start).
    sitDown(agent, seat, step, progress) {
        seat.taken = agent; agent.seat = seat;
        this.place(agent, seat.x, seat.z, seat.heading);
        agent.state = 'seated';
        agent.activity = step.activity;
        const total = step.time[0] + this.random() * (step.time[1] - step.time[0]);
        agent.timer = total * (1 - progress);
        agent.sitTotal = total;
        agent.sipTimer = 4 + this.random() * 6;
        // table service: the waiter takes the order (restaurants: the meal; bar tables: the round) — the clock only runs once it is served
        if (progress === 0 && this.waiter && seat.kind === 'dine' && (step.activity === 'dine' || (step.activity === 'drink' && this.family === 'bar'))) agent.needs = 'order';
        this.seatedAnim(agent);
        agent.onTimer = () => { this.standUp(agent); };
    },

    seatedAnim(agent) {
        const activity = agent.activity, waiting = agent.needs === 'order' || agent.needs === 'cooking' || agent.needs === 'food';
        if (waiting) return this.playAnim(agent, 'sit_table');
        if (activity === 'eat' || activity === 'dine') return this.playAnim(agent, this.random() < 0.72 ? 'sit_eat' : 'sit_drink');
        if (activity === 'drink') return this.playAnim(agent, this.random() < 0.7 ? 'sit_drink' : (agent.seat && agent.seat.kind !== 'wait' ? 'sit_table' : 'sit'));
        return this.playAnim(agent, this.random() < 0.4 ? 'phone' : 'sit');
    },

    standUp(agent) {
        const seat = agent.seat;
        agent.needs = null;
        if (seat && seat.kind === 'dine' && this.waiter && (agent.activity === 'dine' || agent.activity === 'eat' || agent.activity === 'drink')) (this.tablesToClear = this.tablesToClear || []).push(seat);
        if (seat) { this.place(agent, seat.approach.x, seat.approach.z, seat.heading + Math.PI); seat.taken = null; agent.seat = null; }
        this.nextStep(agent);
    },

    freeSeat(want, agent = null) {
        const seats = this.points.seats.filter((s) => !s.taken && want.includes(s.kind));
        if (!seats.length) return null;
        // groups sit together: prefer a free seat at a table that already has someone (sometimes), else a random one
        const social = this.random() < 0.35 ? seats.filter((s) => s.table && this.points.seats.some((o) => o.taken && o.table === s.table)) : [];
        const list = social.length ? social : seats;
        return list[Math.floor(this.random() * list.length)];
    },

    freeSpot(list, agent = null) {
        const free = list.filter((s) => !s.taken || s.taken === agent);
        return free.length ? free[Math.floor(this.random() * free.length)] : null;
    },

    // ---- the queue: slot 0 is the register (served there), the others line up towards the door
    queueSlot(index) { return index === 0 ? this.points.service : this.points.queue[index - 1]; },

    moveInQueue(agent) {
        const index = this.queue.indexOf(agent), slot = this.queueSlot(index);
        if (!slot) return;
        agent.queueIndex = index;
        agent.atRegister = false;
        this.walkTo(agent, slot.x, slot.z, () => {
            agent.targetHeading = this.points.service.heading;
            if (this.queue.indexOf(agent) === 0) { agent.atRegister = true; agent.timer = agent.serveTime; this.playAnim(agent, 'pay'); }
            else this.playAnim(agent, this.random() < 0.35 ? 'phone' : 'idle');
        });
    },

    leaveQueue(agent) {
        const index = this.queue.indexOf(agent);
        if (index < 0) return;
        this.queue.splice(index, 1);
        agent.inQueue = false; agent.atRegister = false;
        for (let k = index; k < this.queue.length; k++) this.moveInQueue(this.queue[k]);
    },

    // ======================================================================================== walking

    walkTo(agent, x, z, onArrive) {
        const path = this.findPath(agent.x, agent.z, x, z);
        if (!path) { this.place(agent, x, z); if (onArrive) onArrive(); return; }
        agent.path = path; agent.pathIndex = 0; agent.onArrive = onArrive; agent.stuck = 0;
        this.playAnim(agent, agent.gait || 'walk', 1);
    },

    // Straight line, no grid (outside the door: entering and leaving).
    walkStraight(agent, x, z, onArrive) {
        agent.path = [{ x, z }]; agent.pathIndex = 0; agent.onArrive = onArrive; agent.stuck = 0; agent.free = true;
        this.playAnim(agent, agent.gait || 'walk', 1);
    },

    // Someone (another person or the player) in the way, within `reach` ahead?
    blockerAhead(agent, dirX, dirZ, reach = 0.62) {
        const p = this.game.player.position, o = Interiors.STAGE, others = [{ x: p.x - o.x, z: p.z - o.z, player: true }];
        for (const other of this.agents) if (other !== agent && other.actor && other.state !== 'seated' && !other.outside) others.push(other);
        for (const other of others) {
            const dx = other.x - agent.x, dz = other.z - agent.z, d = Math.hypot(dx, dz);
            if (d > reach || d < 1e-3) continue;
            if ((dx * dirX + dz * dirZ) / d > 0.45) return other;
        }
        return null;
    },

    stepAlong(agent, dt) {
        const target = agent.path[agent.pathIndex], dx = target.x - agent.x, dz = target.z - agent.z, distance = Math.hypot(dx, dz);
        if (distance < 0.05) {
            agent.pathIndex++;
            if (agent.pathIndex >= agent.path.length) {
                agent.path = null; agent.free = false;
                const done = agent.onArrive; agent.onArrive = null;
                this.playAnim(agent, 'idle');
                if (done) done();
            }
            return;
        }
        const dirX = dx / distance, dirZ = dz / distance;
        agent.targetHeading = Math.atan2(dirX, dirZ);
        const blocker = this.blockerAhead(agent, dirX, dirZ);
        if (blocker) {
            agent.stuck += dt;
            this.playAnim(agent, 'idle');
            const last = agent.path[agent.path.length - 1], toEnd = Math.hypot(last.x - agent.x, last.z - agent.z);
            // someone stands on (or right before) the spot: close enough, stop here (a queue squeezes, the player is in the way)
            if (toEnd < 0.95 && agent.stuck > 0.9 && Math.hypot(blocker.x - last.x, blocker.z - last.z) < 0.7) {
                agent.path = null; agent.free = false; agent.stuck = 0;
                const done = agent.onArrive; agent.onArrive = null;
                if (done) done();
                return;
            }
            if (agent.stuck > this.STUCK_REPATH && !agent.free) {                   // walk around them (people or the player)
                const blockedCells = new Set(), b = this.cellOf(this.nav, blocker.x, blocker.z);
                for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) blockedCells.add((b.iz + oz) * this.nav.nx + (b.ix + ox));
                const around = this.findPath(agent.x, agent.z, last.x, last.z, blockedCells);
                if (around) { agent.path = around; agent.pathIndex = 0; agent.stuck = this.STUCK_REPATH * 0.5; }
            }
            if (agent.stuck > this.STUCK_GIVE_UP) {                                 // (last resort: give up this errand, never deadlock)
                agent.stuck = 0; agent.path = null; agent.free = false;
                if (agent.role === 'customer' && agent.state !== 'leaving') this.abandon(agent);
                else { const done = agent.onArrive; agent.onArrive = null; if (done) done(); }
            }
            return;
        }
        agent.stuck = Math.max(0, agent.stuck - dt);
        this.playAnim(agent, agent.gait || 'walk', 1);
        const step = Math.min(distance, (agent.gait === 'run' ? this.RUN_SPEED : this.WALK_SPEED) * dt);
        agent.x += dirX * step; agent.z += dirZ * step;
    },

    // ======================================================================================== per frame

    update(dt, game) {
        if (!this.active) return;
        if (typeof Robbery !== 'undefined' && Robbery.session) {                    // the robbery drives them (ShopLife only animates)
            this.robbed = true;
            for (const agent of this.agents) if (agent.actor && agent.actor.mesh.isEnabled()) agent.actor.update(dt, 1);
            return;
        }
        if (this.robbed) this.afterRobbery();
        const heist = typeof Heists !== 'undefined' && Heists.run && Interiors.active;
        if (heist) { this.heistFreeze(); for (const agent of this.agents) if (agent.actor) agent.actor.update(dt, 1); return; }

        this.spawnTimer -= dt;
        const customers = this.agents.filter((a) => a.role === 'customer').length, target = this.targetCustomers();
        if (this.spawnTimer <= 0) {
            this.spawnTimer = 4 + this.random() * 7;
            if (customers < target) this.spawnCustomer();
        }

        for (const agent of this.agents) {
            agent.age += dt;
            agent.outside = agent.z < 0.35;
            if (agent.role === 'clerk') this.updateClerk(agent, dt);
            else if (agent.role === 'waiter') this.updateWaiter(agent, dt);
            else if (agent.role === 'guard') this.updateGuard(agent, dt);
            else this.updateCustomer(agent, dt);
            if (agent.path) this.stepAlong(agent, dt);
            this.turn(agent, dt);
            if (agent.fadeDir) {
                agent.fade = Math.max(0, Math.min(1, agent.fade + agent.fadeDir * dt / this.FADE_TIME));
                if (agent.fade >= 1 && agent.fadeDir > 0) agent.fadeDir = 0;
            }
            if (agent.actor) {
                this.syncActor(agent);
                agent.actor.mesh.visibility = agent.fade;
                agent.actor.update(dt, agent.anim === 'walk' ? agent.animRate : 1);
            }
        }
        for (const agent of this.agents.filter((a) => a.state === 'gone' || (a.fadeDir < 0 && a.fade <= 0))) this.removeAgent(agent);
        this.updateObstacles();
    },

    updateCustomer(agent, dt) {
        if (agent.age > this.MAX_LIFETIME && agent.state !== 'leaving' && agent.state !== 'gone') { this.abandon(agent); return; }
        if (agent.path) return;
        if (agent.state === 'queue') {
            if (agent.atRegister) {
                agent.timer -= dt;
                if (agent.timer <= 0) { this.leaveQueue(agent); this.nextStep(agent); }
            }
            return;
        }
        if (agent.state === 'seated') {
            if (agent.needs === 'cooking') { agent.timer2 = (agent.timer2 || 0) + dt; if (agent.timer2 > (this.family === 'bar' ? 3 : 8) + (agent.id % 5)) { agent.needs = 'food'; agent.timer2 = 0; } }
            if (agent.needs && !this.waiter) agent.needs = null;          // (no waiter: served at the counter, like a snack bar)
            if (agent.needs) { this.playAnim(agent, 'sit_table'); return; }
            agent.sipTimer -= dt;
            if (agent.sipTimer <= 0) { agent.sipTimer = 6 + this.random() * 10; this.seatedAnim(agent); }
        }
        if (agent.state === 'busy' || agent.state === 'seated' || agent.state === 'waiting') {
            agent.timer -= dt;
            const closing = !Economy.isOpen(this.shop.style, this.game.dayNight.hour);
            if (closing) agent.timer -= dt * 3;
            if (agent.timer <= 0) {
                const done = agent.onTimer; agent.onTimer = null;
                if (agent.state === 'waiting') this.nextStep(agent);
                else if (done) done();
                else this.nextStep(agent);
            }
        }
    },

    // Out of time (or stuck): free what it holds and go.
    abandon(agent) {
        this.leaveQueue(agent);
        if (agent.seat) { agent.seat.taken = null; agent.seat = null; }
        if (agent.spot) { agent.spot.taken = null; agent.spot = null; }
        agent.plan = [];
        agent.onTimer = null;
        this.nextStep(agent);
    },

    turn(agent, dt) {
        let delta = agent.targetHeading - agent.heading;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        const max = this.TURN_SPEED * dt;
        agent.heading += Math.abs(delta) <= max ? delta : Math.sign(delta) * max;
    },

    removeAgent(agent) {
        this.leaveQueue(agent);
        if (agent.seat) agent.seat.taken = null;
        if (agent.spot) agent.spot.taken = null;
        this.releaseActor(agent);
        this.agents.splice(this.agents.indexOf(agent), 1);
    },

    // The people are solid for the player (small squares; the seated ones are already on a solid seat).
    updateObstacles() {
        const o = Interiors.STAGE, r = 0.26, bodies = [];
        for (const agent of this.agents) {
            if (!agent.actor || agent.state === 'seated' || agent.outside || agent.fade < 0.5 || agent.z < 0.6) continue;
            bodies.push({ x0: o.x + agent.x - r, z0: o.z + agent.z - r, x1: o.x + agent.x + r, z1: o.z + agent.z + r, h: 1.7, person: true });
        }
        Interiors.obstacles = this.baseObstacles.concat(bodies);
    },

    // ======================================================================================== robbery and heists

    // For Robbery.start: the attendant and the customers inside, as { a: actor, x, z (local) }. ShopLife stops driving them.
    robberyCast() {
        if (!this.active) return null;
        this.robbed = true;
        const inside = this.agents.filter((a) => a.role === 'customer' && a.actor && a.z > 0.8 && a.fade > 0.5);
        for (const agent of this.agents) { agent.path = null; agent.onArrive = null; if (agent.seat) this.place(agent, agent.seat.approach.x, agent.seat.approach.z); }
        for (const agent of this.agents.filter((a) => a.role === 'customer' && !inside.includes(a))) this.removeAgent(agent);
        Interiors.obstacles = this.baseObstacles.slice();
        return {
            clerk: this.clerk && this.clerk.actor ? { a: this.clerk.actor, x: this.clerk.x, z: this.clerk.z } : null,
            hostages: inside.concat(this.waiter && this.waiter.actor ? [this.waiter] : []).map((agent) => ({ a: agent.actor, x: agent.x, z: agent.z })),
        };
    },

    // The robbery is over and the player is still inside: whoever can, runs out; the staff stay down.
    afterRobbery() {
        this.robbed = false;
        this.suspended = true;
        for (const agent of this.agents) {
            if (agent.role !== 'customer' || !agent.actor) continue;
            const pos = agent.actor.mesh.position, o = Interiors.STAGE;
            agent.x = pos.x - o.x; agent.z = pos.z - o.z;
            agent.plan = []; agent.seat = null; agent.spot = null; agent.inQueue = false;
            agent.state = 'leaving';
            agent.gait = 'run';
            this.walkTo(agent, this.points.door.x, this.points.door.z, () => { this.walkStraight(agent, this.points.outside.x, this.points.outside.z, () => { agent.state = 'gone'; }); agent.fadeDir = -1; });
        }
        this.queue = [];
    },

    heistFreeze() {
        if (this._heistFrozen) return;
        this._heistFrozen = true;
        for (const agent of this.agents) { agent.path = null; this.playAnim(agent, agent.role === 'customer' ? 'kneel' : 'surrender'); }
    },
};
