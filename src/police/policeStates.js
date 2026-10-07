// ============================================================================
// Estados de FSM da polícia (viatura e policial a pé compartilham):
//   PATROL — perambula pela cidade.
//   CHASE  — persegue o jogador (preditivo).
// O estado só delega; cada unidade implementa patrol(dt)/chase(dt).
// ============================================================================

class PolicePatrolState {
    constructor(unit) {
        this.unit = unit;
        this.name = 'PATROL';
    }
    enter() { if (this.unit.onPatrolEnter) this.unit.onPatrolEnter(); }
    update(dt) { this.unit.patrol(dt); }
}

class PoliceChaseState {
    constructor(unit) {
        this.unit = unit;
        this.name = 'CHASE';
    }
    enter() { if (this.unit.onChaseEnter) this.unit.onChaseEnter(); }
    update(dt) { this.unit.chase(dt); }
}
