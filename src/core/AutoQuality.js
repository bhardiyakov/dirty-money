// ============================================================================
// AutoQuality — qualidade adaptativa. Mede o tempo REAL entre quadros (o teto é Config.perf.fpsCap, 30 Hz ≈ 33 ms) e, se o aparelho
// não consegue manter o ritmo por alguns segundos, desce um degrau por vez (sempre o mais barato primeiro, nunca sobe sozinho):
//   1) mapa de sombras 2048/1024 → 512    2) sombras desligadas    3) resolução interna 560/440 → 400 (pixel perfeito, câmera reajusta)
// O degrau alcançado vira o perfil leve (`dm_quality=lite`) nas próximas sessões. `?q` na URL mostra o degrau no console.
// ============================================================================

class AutoQuality {
    constructor(game) {
        this.g = game;
        this.level = 0;
        this.acc = 0; this.n = 0; this.bad = 0; this.cool = 6;        // 6 s de carência no início (carregamento e aquecimento de shaders)
        this.slow = 1000 / Config.perf.fpsCap * 1.35;                  // média de ms por quadro acima disto = quadro "ruim"
        this.off = location.search.includes('full');
    }

    // Chamado todo quadro com o dt REAL em segundos (antes do teto de 50 ms do jogo).
    tick(dtReal, paused) {
        if (this.off || paused || dtReal > 0.5) return;               // aba em segundo plano / menu: não conta
        if (this.cool > 0) { this.cool -= dtReal; return; }
        this.acc += dtReal * 1000; this.n++;
        if (this.acc < 1000) return;                                   // janela de 1 s
        const avg = this.acc / this.n;
        this.acc = 0; this.n = 0;
        this.bad = avg > this.slow ? this.bad + 1 : Math.max(0, this.bad - 1);
        if (this.bad >= 4) { this.bad = 0; this.cool = 5; this._down(); }
    }

    _down() {
        const g = this.g, ge = g.gameEngine, sg = ge.shadowGenerator;
        this.level++;
        if (this.level === 1) {
            if (sg) ge.setShadowSize(512);
        } else if (this.level === 2) {
            if (g.dayNight) g.dayNight.forceNoShadows = true;
            if (sg) sg.getShadowMap().refreshRate = 0;
        } else if (this.level === 3) {
            Config.art.internalHeight = Math.min(Config.art.internalHeight, 400);
            ge.resize(); g.camera.fitPixelScale(ge.renderHeight); g.camera.onResize();
        } else { this.level = 3; this.off = true; return; }
        try { localStorage.setItem('dm_quality', 'lite'); } catch (e) { /* sem storage */ }
        console.log(`[QUALIDADE] desempenho baixo: degrau ${this.level}`);
        if (g._flash) g._flash('Modo econômico: qualidade reduzida para manter a fluidez');
    }
}
