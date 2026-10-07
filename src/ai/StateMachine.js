// ============================================================================
// StateMachine — FSM genérica e reutilizável.
// Cada estado é um objeto com { name, enter(), update(dt), exit() }.
// Reaproveitada por pedestres (Fase 2) e pela polícia (Fase 4).
// ============================================================================

class StateMachine {
    constructor(owner) {
        this.owner = owner;
        this.current = null;
    }

    setState(state) {
        if (this.current && this.current.exit) this.current.exit();
        this.current = state;
        if (this.current.enter) this.current.enter();
    }

    update(dt) {
        if (this.current && this.current.update) this.current.update(dt);
    }

    get name() {
        return this.current ? this.current.name : 'NONE';
    }
}
