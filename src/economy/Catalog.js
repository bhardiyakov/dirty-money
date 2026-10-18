// ============================================================================
// Catalog — o que se compra e se guarda: carros (CarSheet), motos e bicicletas (Bikes) e barcos (BoatSheet), por um só nome de
// modelo. Usado pelas lojas (Dealers + ui/CarUI.js) e pela garagem (Garage) para não perguntar a cada passo de que tipo é.
// ============================================================================

const Catalog = {
    kind(m) {
        if (CarSheet.MODELS[m]) return 'car';
        if (typeof Bikes !== 'undefined' && Bikes.MODELS[m]) return 'moto';
        if (typeof BoatSheet !== 'undefined' && BoatSheet.MODELS[m]) return 'boat';
        return null;
    },
    spec(m) { const k = this.kind(m); return k === 'car' ? CarSheet.MODELS[m] : k === 'moto' ? Bikes.MODELS[m] : k === 'boat' ? BoatSheet.MODELS[m] : null; },
    label(m) { const s = this.spec(m); return s ? (s.model ? `${s.name} ${s.model}` : s.name) : m; },
    // Cores de fábrica (linhas de CarSheet.PAINTS).
    pool(m) {
        const k = this.kind(m);
        return (k === 'car' ? CarSheet.POOLS[m] : k === 'moto' ? Bikes.PAINTS[Bikes.base(m)] : k === 'boat' ? BoatSheet.PAINT_ROWS[m] : null) || [0];
    },
    // Miniatura (canvas) ou null. Moto que só existe em 3D: a do atlas.
    preview(m, paint) {
        const k = this.kind(m);
        if (k === 'car') return CarSheet.preview(m, paint);
        const id = k === 'moto' ? (CarArt.model(Bikes.ART[m]) ? Bikes.ART[m] : 'moto') : m;
        return CarArt.model(id) ? CarArt.preview(id, paint) : null;
    },
};
