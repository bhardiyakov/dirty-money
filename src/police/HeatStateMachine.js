// ============================================================================
// HeatStateMachine — the player's standing with the police: wanted level, investigation, arrest and parole.
//
//   IDLE ──crime──▶ CRIME_COMMITTED ──exposed──▶ WANTED ──escape──▶ INVESTIGATION (name on file) │ IDLE (masked / shelved)
//                        │ nobody saw                │ caught, or killed while wanted
//                        ▼                           ▼
//                  previous state               ARRESTED ──▶ PAROLE ──time served──▶ IDLE
//
//   CRIME_COMMITTED  transient. CrimeExposure decides who saw it (police / camera / witness). Nobody: back to the previous state,
//                    no record. Otherwise it is a flagrant and the chase starts.
//   WANTED           active chase. WantedSystem keeps the stars and the evasion timer (it only counts while no unit sees the player).
//                    Seen live by the police: stars by severity. Camera or witness only: 1★ (someone called 190). On parole: PAROLE_STARS.
//   INVESTIGATION    the record holds active crimes. The police do not shoot on sight, but once the record carries a warrant an
//                    officer who sees the unmasked face up close starts a 1★ arrest attempt.
//   ARRESTED         transient. Bail, illicit items confiscated, WANTED and INVESTIGATION wiped, then PAROLE.
//   PAROLE           for paroleHours any exposed offense jumps straight to a high wanted level.
//
// Identity (isMasked at the moment of the flagrant): unmasked → the crime goes to the record. Masked → it goes to `anonymous`, which
// only reaches the record if an officer sees the player's face during that chase. Escaping drops it.
// Money sinks: the HACKER wipes the record (CrimeRecord.hackerQuote), a LAWYER on retainer cuts the bail and keeps the guns, and a
// CORRUPT POLICE CHIEF (the district's delegado with enough hearts) shelves every crime there the police did not see live.
// ============================================================================

const HeatState = Object.freeze({
    IDLE: 'IDLE',
    CRIME_COMMITTED: 'CRIME_COMMITTED',
    WANTED: 'WANTED',
    INVESTIGATION: 'INVESTIGATION',
    ARRESTED: 'ARRESTED',
    PAROLE: 'PAROLE',
});

// Crime type → severity (1 minor … 5 gravest).
const CRIME_SEVERITY = Object.freeze({
    theft: 1,
    vandalism: 1,
    gunfire: 2,
    assault: 2,
    car_theft: 2,
    fraud: 2,
    hit_and_run: 2,
    evidence_tampering: 2,
    possession: 2,
    cybercrime: 2,
    burglary: 3,
    carjacking: 3,
    mugging: 3,
    arson: 3,
    explosion: 3,
    extortion: 3,
    armed_robbery: 4,
    homicide: 4,
    cop_assault: 4,
    cop_killed: 5,
    bank_robbery: 5,
});

const HEAT_TUNING = Object.freeze({
    coalesceSeconds: 0.35,           // same crime type again within this: reuse the last exposure (no new rays)
    checkEvery: 0.25,                // s between face checks (warrant recognition, unmasking during a chase)
    paroleHours: 48,
    paroleStars: 3,
    warrantSeverity: 8,              // record severity that turns an investigation into a warrant
    recognizeRange: 16,
    expireHoursPerSeverity: 48,      // statute of limitations: severity 1 → 2 days … severity 5 → 10 days
    corruptHearts: 5,                // delegado hearts that buy the shelving of a district's investigations
    bail: { base: 800, perStar: 600, perSeverity: 250 },
    lawyer: { retainer: 3500, days: 7, bailMul: 0.5 },
    hacker: { base: 600, perCrime: 0.35, floor: 0.6, halfLifeHours: 24 },
});

class HeatIdleState {
    constructor(machine) { this.machine = machine; this.name = HeatState.IDLE; }
}

class HeatCrimeCommittedState {
    constructor(machine) { this.machine = machine; this.name = HeatState.CRIME_COMMITTED; }
    enter() { this.machine._judgeCrime(); }
}

class HeatWantedState {
    constructor(machine) { this.machine = machine; this.name = HeatState.WANTED; }
    enter() { this.machine._raiseWantedLevel(); }
    update(dt) { if (this.machine._checkDue(dt)) this.machine._revealIfUnmasked(); }
}

class HeatInvestigationState {
    constructor(machine) { this.machine = machine; this.name = HeatState.INVESTIGATION; }
    update(dt) {
        const machine = this.machine;
        if (!machine.record.isDirty) machine._settle();
        else if (machine._checkDue(dt)) machine._watchForWarrant();
    }
}

class HeatArrestedState {
    constructor(machine) { this.machine = machine; this.name = HeatState.ARRESTED; }
    enter() { this.machine._processArrest(); }
}

class HeatParoleState {
    constructor(machine) { this.machine = machine; this.name = HeatState.PAROLE; }
    update(dt) {
        const machine = this.machine;
        if (!machine.onParole) machine._settle();
        else if (machine._checkDue(dt)) machine._watchForWarrant();
    }
}

class HeatStateMachine {
    static EVALUATE = -1;

    // Stars for a crime the police saw live.
    static starsFor(severity) {
        if (severity >= 5) return 3;
        return severity >= 3 ? 2 : 1;
    }

    constructor(game) {
        this.game = game;
        this.record = new CrimeRecord();
        this.anonymous = new CrimeRecord(8);
        this.paroleUntil = -Infinity;
        this.lawyerUntil = -Infinity;
        this.lastArrest = { bail: 0, lawyer: false, weaponsKept: false };
        this._crime = { type: '', severity: 0, exposure: CrimeExposure.NONE };
        this._chip = { text: '', color: '' };
        this._coalesce = Object.create(null);
        this._previous = HeatState.IDLE;
        this._pendingStars = 0;
        this._escalate = false;
        this._arrestStars = 0;
        this._checkIn = 0;
        this.states = {
            [HeatState.IDLE]: new HeatIdleState(this),
            [HeatState.CRIME_COMMITTED]: new HeatCrimeCommittedState(this),
            [HeatState.WANTED]: new HeatWantedState(this),
            [HeatState.INVESTIGATION]: new HeatInvestigationState(this),
            [HeatState.ARRESTED]: new HeatArrestedState(this),
            [HeatState.PAROLE]: new HeatParoleState(this),
        };
        this.fsm = new StateMachine(this);
        this.fsm.setState(this.states[HeatState.IDLE]);
        Economy.onDay(() => this.onNewDay());
    }

    get state() { return this.fsm.name; }
    get isMasked() { return !!(this.game.player && this.game.player.isMasked); }
    get hasLawyer() { return this.now() < this.lawyerUntil; }
    get onParole() { return this.now() < this.paroleUntil; }
    get hasWarrant() { return this.record.hasWarrant(HEAT_TUNING.warrantSeverity); }

    // Absolute game hour (the record's timestamps).
    now() {
        return Economy.day * 24 + (this.game.dayNight ? this.game.dayNight.hour : 0);
    }

    update(dt) {
        this.fsm.update(dt);
    }

    onNewDay() {
        this.record.expire(this.now(), HEAT_TUNING.expireHoursPerSeverity);
    }

    // ------------------------------------------------------------------ crimes

    // A crime happens now. `exposure`: a mask from a scripted scene that already knows who saw it (robbery, alarm, a cop on the
    // spot); by default CrimeExposure evaluates the player's exposure at this exact moment.
    commit(type, exposure = HeatStateMachine.EVALUATE) {
        const severity = CRIME_SEVERITY[type];
        if (!severity) { console.warn(`[HEAT] unknown crime type: ${type}`); return; }
        if (this.state === HeatState.ARRESTED) return;
        const crime = this._crime;
        crime.type = type;
        crime.severity = severity;
        crime.exposure = exposure === HeatStateMachine.EVALUATE ? this._exposureFor(type) : exposure;
        this._previous = this.state;
        this._transition(HeatState.CRIME_COMMITTED);
    }

    // Evidence that names the player without a chase (police found guns at home, a hacker left a digital trail).
    fileEvidence(type) {
        const severity = CRIME_SEVERITY[type];
        if (!severity) return;
        this.record.register(type, severity, this.now());
        if (this.state === HeatState.IDLE) this._transition(HeatState.INVESTIGATION);
    }

    // The police chief of the crime's district is on the payroll: crimes there that the police did not see live are shelved.
    isCorruptZone() {
        const empire = this.game.empire;
        if (!empire || !empire.influence) return false;
        const spot = this._crimeSpot();
        return empire.influence.hearts('del_' + empire.districtAt(spot.x, spot.z)) >= HEAT_TUNING.corruptHearts;
    }

    // ------------------------------------------------------------------ WantedSystem observer

    // Stars raised elsewhere (a cop recognizing a description, a scripted alarm) start a chase; stars back to 0 end it.
    onWantedChange(level) {
        const state = this.state;
        if (state === HeatState.ARRESTED || state === HeatState.CRIME_COMMITTED) return;
        if (level > 0 && state !== HeatState.WANTED) {
            this._previous = state;
            this._transition(HeatState.WANTED);
        } else if (level === 0 && state === HeatState.WANTED) {
            this.anonymous.clear();
            this._settle();
        }
    }

    // ------------------------------------------------------------------ arrest

    // Caught. Returns the report (bail paid, lawyer, guns kept) that the arrest screen shows.
    arrest(stars) {
        this._arrestStars = stars;
        this._transition(HeatState.ARRESTED);
        return this.lastArrest;
    }

    // HP reached zero: during a chase the police take the player in (ARRESTED); otherwise the record stays as it was.
    onPlayerDown() {
        if (this.state === HeatState.WANTED) return this.arrest(this.game.wanted.level);
        this.game.wanted.bust();
        return null;
    }

    // Lines of the arrest screen (the caller adds the release time).
    arrestLines(report) {
        const parole = { hours: HEAT_TUNING.paroleHours, stars: HEAT_TUNING.paroleStars };
        return [
            { text: I18n.t('heat.arrest.bail', { bail: brl(report.bail) }), color: '#ffd23f' },
            { text: I18n.t(report.lawyer ? 'heat.arrest.lawyer' : 'heat.arrest.confiscated'), color: report.lawyer ? '#86efac' : '#ff7a6e' },
            { text: I18n.t('heat.arrest.parole', parole), color: '#fbbf24' },
        ];
    }

    arrestSummary(report) {
        const key = report.lawyer ? 'heat.arrest.summaryLawyer' : 'heat.arrest.summary';
        return I18n.t(key, { bail: brl(report.bail), hours: HEAT_TUNING.paroleHours });
    }

    bailFor(stars) {
        const { base, perStar, perSeverity } = HEAT_TUNING.bail;
        const severity = this.record.totalSeverity + this.anonymous.totalSeverity;
        const lawyerMul = this.hasLawyer ? HEAT_TUNING.lawyer.bailMul : 1;
        const skillMul = 1 - ((typeof SkillTree !== 'undefined' && SkillTree.m.fine) || 0);
        return Math.round((base + perStar * stars + perSeverity * severity) * lawyerMul * skillMul / 10) * 10;
    }

    // ------------------------------------------------------------------ services (money sinks)

    hackerQuote() {
        return this.record.hackerQuote(this.now(), HEAT_TUNING.hacker);
    }

    // The hacker takes dirty cash and erases the record.
    hireHacker() {
        if (this.state === HeatState.WANTED) return I18n.t('heat.hacker.busy');
        const cost = this.hackerQuote(), inventory = this.game.inventory;
        if (!cost) return I18n.t('heat.hacker.nothing');
        if (inventory.cash < cost) return I18n.t('heat.hacker.noCash', { missing: brl(cost - inventory.cash) });
        inventory.cash -= cost;
        this.record.clear();
        if (this.state === HeatState.INVESTIGATION) this._settle();
        return I18n.t('heat.hacker.done', { cost: brl(cost) });
    }

    // A lawyer on retainer (clean money only) for `days`: cheaper bail and the guns stay with the player.
    hireLawyer() {
        const { retainer, days } = HEAT_TUNING.lawyer, inventory = this.game.inventory;
        if (this.hasLawyer) return I18n.t('heat.lawyer.already', { hours: Math.ceil(this.lawyerUntil - this.now()) });
        if (inventory.clean < retainer) return I18n.t('heat.lawyer.noClean', { missing: brl(retainer - inventory.clean) });
        inventory.clean -= retainer;
        this.lawyerUntil = this.now() + days * 24;
        return I18n.t('heat.lawyer.hired', { cost: brl(retainer), days });
    }

    // ------------------------------------------------------------------ HUD

    // The status pill under the HUD (null = nothing to show). The returned object is reused.
    statusChip() {
        const chip = this._chip;
        if (this.state === HeatState.PAROLE) {
            chip.text = I18n.t('heat.chip.parole', { hours: Math.ceil(this.paroleUntil - this.now()) });
            chip.color = 'rgba(251,191,36,0.7)';
        } else if (this.hasWarrant) {
            chip.text = I18n.t('heat.chip.warrant');
            chip.color = 'rgba(244,63,94,0.9)';
        } else if (this.record.isDirty) {
            chip.text = I18n.t('heat.chip.investigation', { count: this.record.count });
            chip.color = 'rgba(96,165,250,0.6)';
        } else {
            return null;
        }
        return chip;
    }

    // ------------------------------------------------------------------ save

    serialize() {
        return { record: this.record.serialize(), paroleUntil: this.paroleUntil, lawyerUntil: this.lawyerUntil };
    }

    // Saves made before the record existed carry the old 0..100 investigation (traces.heat): it becomes one cold case.
    load(saved, legacyTraces = null) {
        this.record.load(saved ? saved.record : this._legacyRecord(legacyTraces));
        this.anonymous.clear();
        this.paroleUntil = saved && Number.isFinite(saved.paroleUntil) ? saved.paroleUntil : -Infinity;
        this.lawyerUntil = saved && Number.isFinite(saved.lawyerUntil) ? saved.lawyerUntil : -Infinity;
        this._settle();
    }

    // ------------------------------------------------------------------ internals

    _transition(name) {
        this.fsm.setState(this.states[name]);
    }

    _settle() {
        this._transition(this._restingState());
    }

    _restingState() {
        if (this.onParole) return HeatState.PAROLE;
        return this.record.isDirty ? HeatState.INVESTIGATION : HeatState.IDLE;
    }

    _judgeCrime() {
        const crime = this._crime;
        if (crime.exposure === CrimeExposure.NONE) {
            this._transition(this._previous);
            return;
        }
        const live = CrimeExposure.isLive(crime.exposure);
        if (live || !this.isCorruptZone()) this._file(crime);
        const stars = live ? HeatStateMachine.starsFor(crime.severity) : 1;
        this._pendingStars = this._previous === HeatState.PAROLE ? Math.max(HEAT_TUNING.paroleStars, stars) : stars;
        this._escalate = live && this._previous === HeatState.WANTED;
        this._transition(HeatState.WANTED);
    }

    _file(crime) {
        const target = this.isMasked ? this.anonymous : this.record;
        target.register(crime.type, crime.severity, this.now());
    }

    _raiseWantedLevel() {
        const wanted = this.game.wanted;
        if (this._escalate) wanted.bump('crime');
        if (this._pendingStars > 0) wanted.ensureLevel(this._pendingStars, 'crime');
        this._pendingStars = 0;
        this._escalate = false;
        this._checkIn = 0;
    }

    // A masked suspect who shows the face to an officer during the chase is identified: the anonymous crimes join the record.
    _revealIfUnmasked() {
        if (!this.anonymous.isDirty || this.isMasked || !this._policeSeesWithin(HEAT_TUNING.recognizeRange)) return;
        this.record.absorb(this.anonymous);
        this.game._flash(I18n.t('heat.identified'));
    }

    _watchForWarrant() {
        if (this.isMasked || !this.hasWarrant) return;
        if (!this._policeSeesWithin(HEAT_TUNING.recognizeRange)) return;
        this.game._flash(I18n.t('heat.recognized'));
        this.game.wanted.ensureLevel(1, 'warrant');
    }

    _processArrest() {
        const report = this.lastArrest, inventory = this.game.inventory;
        report.lawyer = this.hasLawyer;
        report.weaponsKept = report.lawyer && inventory.armed;
        report.bail = this._chargeBail(this.bailFor(this._arrestStars));
        this.game.wanted.bust();
        this.record.clear();
        this.anonymous.clear();
        inventory.confiscateContraband();
        if (!report.lawyer) inventory.confiscateWeapons();
        this.paroleUntil = this.now() + HEAT_TUNING.paroleHours;
        this._transition(HeatState.PAROLE);
    }

    // Bail comes out of the cash on hand first, then out of the clean money. Returns what was paid.
    _chargeBail(amount) {
        const inventory = this.game.inventory;
        const fromCash = Math.min(inventory.cash, amount);
        const fromClean = Math.min(inventory.clean, amount - fromCash);
        inventory.cash -= fromCash;
        inventory.clean -= fromClean;
        return fromCash + fromClean;
    }

    // Coalesced exposure: a burst of the same crime reuses one evaluation.
    _exposureFor(type) {
        const now = performance.now() / 1000;
        const slot = this._coalesce[type] || (this._coalesce[type] = { at: -Infinity, exposure: CrimeExposure.NONE });
        if (now - slot.at > HEAT_TUNING.coalesceSeconds) {
            slot.exposure = CrimeExposure.evaluate(this.game);
            slot.at = now;
        }
        return slot.exposure;
    }

    _policeSeesWithin(range) {
        const police = this.game.policeManager;
        if (!police || !police.playerSeen) return false;
        const pos = this.game._playerState().pos, range2 = range * range;
        for (const unit of police.units) {
            if (!unit.mind || !unit.mind.sees) continue;
            const dx = unit.position.x - pos.x, dz = unit.position.z - pos.z;
            if (dx * dx + dz * dz <= range2) return true;
        }
        return false;
    }

    _checkDue(dt) {
        this._checkIn -= dt;
        if (this._checkIn > 0) return false;
        this._checkIn = HEAT_TUNING.checkEvery;
        return true;
    }

    // Where the crime happened on the map (inside a shop: the shop's door).
    _crimeSpot() {
        const active = typeof Interiors !== 'undefined' && Interiors.active;
        return active ? active.shop : this.game._playerState().pos;
    }

    _legacyRecord(traces) {
        const heat = traces && traces.heat;
        if (!(heat > 0)) return null;
        return [{ type: 'cold_case', severity: Math.min(5, Math.ceil(heat / 20)), timestamp: this.now() }];
    }
}
