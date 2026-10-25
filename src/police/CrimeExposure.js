// ============================================================================
// CrimeExposure — decides, at the exact moment of a crime, WHO saw the player commit it.
//
// Sources (bit flags, combined in one integer):
//   POLICE   an officer (cone of vision + line of sight) or the helicopter sees the player right now.
//   CAMERA   a CCTV trigger zone covers the player (bank, jewelry, gun shop, pharmacy and convenience store facades), or the
//            interior the player is in is recording. Scripted scenes also use it for alarms and electronic sensors.
//   WITNESS  a pedestrian is looking at the player with a clear line of sight (or is close enough to notice from behind).
//
// Architecture (accuracy and cost):
//   • Event driven, never per frame: it only runs when a crime is committed. HeatStateMachine coalesces repeated commits of the
//     same crime type, so a burst of 30 shots costs a single evaluation.
//   • Police costs zero rays: PoliceManager already runs the FOV cone + line-of-sight test of every unit each frame (mind.sees,
//     helicopter, hiding spots and crouched cover included). The answer is read (playerSeen), not recomputed.
//   • Broad phase: squared distances (no sqrt) and a dot-product cone against the observer's heading.
//   • Narrow phase: MapGeo.hasLineOfSight, a 2D march over the static occluder grid (CityGrid buildings), not a Havok raycast.
//     Havok only holds the colliders streamed around the camera (ColliderStreamer), so a long Havok ray would cross buildings
//     that are not loaded and report false sightings; the occluder grid covers the whole map, is deterministic and allocates
//     nothing. Witness rays are capped (WITNESS_RAY_BUDGET) and the search stops at the first confirmed witness.
//   • No garbage: the CCTV zones are packed once into a Float32Array; an evaluation creates no objects.
// ============================================================================

const CrimeExposure = {
    NONE: 0,
    POLICE: 1,
    CAMERA: 2,
    WITNESS: 4,

    WITNESS_RANGE: 24,
    WITNESS_FOV_COS: 0.5,            // ±60° cone in front of the pedestrian
    WITNESS_NEAR_SENSE: 4,           // this close, a pedestrian notices the crime even from behind
    WITNESS_RAY_BUDGET: 6,           // line-of-sight tests per evaluation
    CROUCH_RANGE_MUL: 0.6,
    NIGHT_RANGE_MUL: 0.75,
    SNITCH_COMMUNITY: 25,            // favela morale below this: residents break the code of silence
    CCTV_RANGE: 16,
    CCTV_FOV_COS: 0.2,               // ±78° cone out of the facade
    CCTV_STYLES: ['guns', 'pharmacy', 'mart', 'jewelry'],

    _zones: null,                    // Float32Array, 4 floats per camera: x, z, facing x, facing z
    _zoneShops: null,                // the shop behind each camera (a bank power cut turns it off)
    _zoneSource: 0,                  // door count the zones were built from

    // Exposure bit mask of the player right now.
    evaluate(game) {
        if (typeof Interiors !== 'undefined' && Interiors.active) return this._interiorExposure(game, Interiors.active);
        if (this._policeSees(game)) return this.POLICE;
        const pos = game._playerState().pos;
        let exposure = this.NONE;
        if (this._cameraSees(pos.x, pos.z)) exposure |= this.CAMERA;
        if (this._witnessSees(game, pos.x, pos.z)) exposure |= this.WITNESS;
        return exposure;
    },

    isLive(exposure) {
        return (exposure & this.POLICE) !== 0;
    },

    _policeSees(game) {
        const police = game.policeManager;
        return !!police && police.playerSeen;
    },

    _cameraSees(x, z) {
        const zones = this._cameraZones();
        if (!zones) return false;
        const range2 = this.CCTV_RANGE * this.CCTV_RANGE;
        for (let i = 0, shop = 0; i < zones.length; i += 4, shop++) {
            const dx = x - zones[i], dz = z - zones[i + 1], dist2 = dx * dx + dz * dz;
            if (dist2 > range2) continue;
            if (dist2 > 1 && dx * zones[i + 2] + dz * zones[i + 3] < this.CCTV_FOV_COS * Math.sqrt(dist2)) continue;
            if (this._powerCut(this._zoneShops[shop])) continue;
            if (MapGeo.hasLineOfSight(zones[i], zones[i + 1], x, z)) return true;
        }
        return false;
    },

    _witnessSees(game, x, z) {
        const npcs = game.npcManager && game.npcManager.npcs;
        if (!npcs || this._codeOfSilence(x, z)) return false;
        const range = this._witnessRange(game), range2 = range * range;
        const near2 = this.WITNESS_NEAR_SENSE * this.WITNESS_NEAR_SENSE;
        let rays = this.WITNESS_RAY_BUDGET;
        for (let i = 0; i < npcs.length && rays > 0; i++) {
            const npc = npcs[i];
            if (!npc.alive || npc.rag || npc.surrendered || npc.mugger) continue;
            const p = npc.position, dx = x - p.x, dz = z - p.z, dist2 = dx * dx + dz * dz;
            if (dist2 > range2) continue;
            if (dist2 > near2 && dx * Math.sin(npc.heading) + dz * Math.cos(npc.heading) < this.WITNESS_FOV_COS * Math.sqrt(dist2)) continue;
            rays--;
            if (MapGeo.hasLineOfSight(p.x, p.z, x, z)) return true;
        }
        return false;
    },

    _witnessRange(game) {
        const crouched = game.player && game.player.crouched;
        const night = game.dayNight && game.dayNight.night;
        const weather = typeof Weather !== 'undefined' && Weather.cur ? Weather.cur.sightMul : 1;
        return this.WITNESS_RANGE * (crouched ? this.CROUCH_RANGE_MUL : 1) * (night ? this.NIGHT_RANGE_MUL : 1) * weather;
    },

    // Inside the favela nobody talks to the police, unless the community has turned against the player.
    _codeOfSilence(x, z) {
        return typeof Standing !== 'undefined' && Standing.inFavela(x, z) && Standing.community >= this.SNITCH_COMMUNITY;
    },

    // An interior is one trigger zone: whoever works there sees the player, and the recorder (or the bank system) films it.
    // A robbery in progress owns its scene: Robbery reports the exposure itself when it ends.
    _interiorExposure(game, active) {
        const shop = active.shop;
        if (shop.home || shop.safehouse) return this.NONE;
        if (typeof Robbery !== 'undefined' && Robbery.session) return this.NONE;
        let exposure = this.NONE;
        if (Economy.isOpen(shop.style, game.dayNight.hour)) exposure |= this.WITNESS;
        if (this._interiorRecording(active)) exposure |= this.CAMERA;
        return exposure;
    },

    _interiorRecording(active) {
        if (active.shop.bank) return !this._powerCut(active.shop);
        const uses = active.data.uses || [];
        for (let i = 0; i < uses.length; i++) if (uses[i].kind === 'dvr') return true;
        return false;
    },

    _powerCut(shop) {
        if (!shop.bank || typeof Banks === 'undefined') return false;
        const plan = Banks.plans[shop.bank.id];
        return !!plan && plan.power === Economy.day;
    },

    // Built once from the shop doors (Interiors.index), rebuilt only if the door list changes.
    _cameraZones() {
        const doors = typeof Interiors !== 'undefined' && Interiors._doors;
        if (!doors || !doors.length) return null;
        if (this._zones && this._zoneSource === doors.length) return this._zones;
        const watched = doors.filter((door) => door.district !== 'favela' && (door.bank || this.CCTV_STYLES.includes(door.style)));
        const zones = new Float32Array(watched.length * 4);
        watched.forEach((door, i) => {
            zones[i * 4] = door.x;
            zones[i * 4 + 1] = door.z;
            zones[i * 4 + 2] = Math.sin(door.face || 0);
            zones[i * 4 + 3] = Math.cos(door.face || 0);
        });
        this._zones = zones;
        this._zoneShops = watched;
        this._zoneSource = doors.length;
        return zones;
    },
};
