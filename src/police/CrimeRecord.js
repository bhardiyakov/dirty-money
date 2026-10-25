// ============================================================================
// CrimeRecord — the police database: the player's ACTIVE crimes, an array of { type, severity, timestamp }.
//   timestamp   absolute game hour (Economy.day * 24 + hour), so sleeping and time skips age the record too.
//
// Kept small on purpose: the same crime repeated within MERGE_WINDOW_HOURS updates the last entry instead of adding one (a
// shootout is one "gunfire", not thirty), the array has a fixed capacity (the mildest crime is evicted when full), and
// expired crimes are compacted in place.
// ============================================================================

class CrimeRecord {
    static MERGE_WINDOW_HOURS = 0.5;

    constructor(capacity = 24) {
        this.capacity = capacity;
        this.crimes = [];
        this.lastCrimeAt = -Infinity;
    }

    get count() { return this.crimes.length; }
    get isDirty() { return this.crimes.length > 0; }
    get totalSeverity() { return this.crimes.reduce((sum, crime) => sum + crime.severity, 0); }

    hasWarrant(severityThreshold) {
        return this.totalSeverity >= severityThreshold;
    }

    register(type, severity, timestamp) {
        const last = this.crimes[this.crimes.length - 1];
        if (last && last.type === type && timestamp - last.timestamp <= CrimeRecord.MERGE_WINDOW_HOURS) {
            last.severity = Math.max(last.severity, severity);
            last.timestamp = timestamp;
        } else {
            if (this.crimes.length >= this.capacity) this._evictMildest();
            this.crimes.push({ type, severity, timestamp });
        }
        this.lastCrimeAt = Math.max(this.lastCrimeAt, timestamp);
    }

    // Moves every crime of `other` into this record (a masked suspect identified) and empties it.
    absorb(other) {
        for (const crime of other.crimes) this.register(crime.type, crime.severity, crime.timestamp);
        other.clear();
    }

    clear() {
        this.crimes.length = 0;
        this.lastCrimeAt = -Infinity;
    }

    // Drops the crimes older than severity × hoursPerSeverity (statute of limitations), compacting the array in place.
    expire(now, hoursPerSeverity) {
        let kept = 0, lastAt = -Infinity;
        for (const crime of this.crimes) {
            if (now - crime.timestamp >= crime.severity * hoursPerSeverity) continue;
            this.crimes[kept++] = crime;
            lastAt = Math.max(lastAt, crime.timestamp);
        }
        this.crimes.length = kept;
        this.lastCrimeAt = lastAt;
    }

    // Hacker price to wipe the record: Σ(base × severity) × frequency multiplier, rounded to R$ 50.
    hackerQuote(now, pricing) {
        if (!this.isDirty) return 0;
        const weighted = this.crimes.reduce((sum, crime) => sum + pricing.base * crime.severity, 0);
        return Math.round(weighted * this.frequencyMultiplier(now, pricing) / 50) * 50;
    }

    // Grows with the number of crimes and decays (half-life) with the hours since the last one, down to `floor`:
    // a record that has gone cold is cheaper to erase.
    frequencyMultiplier(now, { perCrime, floor, halfLifeHours }) {
        const peak = 1 + (this.crimes.length - 1) * perCrime;
        const decay = Math.pow(0.5, Math.max(0, now - this.lastCrimeAt) / halfLifeHours);
        return floor + (peak - floor) * decay;
    }

    _evictMildest() {
        let mildest = 0;
        for (let i = 1; i < this.crimes.length; i++) {
            if (this.crimes[i].severity < this.crimes[mildest].severity) mildest = i;
        }
        this.crimes.splice(mildest, 1);
    }

    serialize() {
        return this.crimes.map((crime) => ({ type: crime.type, severity: crime.severity, timestamp: crime.timestamp }));
    }

    load(crimes) {
        this.clear();
        for (const crime of crimes || []) {
            if (crime && crime.type && crime.severity > 0) this.register(crime.type, crime.severity, crime.timestamp || 0);
        }
    }
}
