// ============================================================================
// Minimap (GPS) — canto inferior esquerdo.
// Desenha a janela do mundo ao redor do jogador (north-up) com o MapRenderer (terreno raster + ruas/prédios vetoriais),
// mais blip do jogador, unidades (carros/polícia), a rota do GPS e o círculo de perseguição.
// ============================================================================

class Minimap {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.size = Config.minimap.size;

        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.size * dpr;
        this.canvas.height = this.size * dpr;
        this.canvas.style.width = this.size + 'px';
        this.canvas.style.height = this.size + 'px';
        this.ctx.scale(dpr, dpr);
        // Camada estática (ruas, prédios, terrenos) numa tela 2× maior, redesenhada só quando o foco sai da folga: o MapRenderer
        // percorre todas as vias/quarteirões do mapa a cada chamada, caro demais para refazer 20× por segundo.
        this.base = document.createElement('canvas');
        this.baseSize = this.size * 2;
        this.base.width = this.baseSize * dpr;
        this.base.height = this.baseSize * dpr;
        this.baseCtx = this.base.getContext('2d');
        this.baseCtx.scale(dpr, dpr);
        this.dpr = dpr;
        this._bx = this._bz = 0;
        this._baseKey = null;
        MapRenderer.drawWorld(1);                       // o mundo raster é assado uma vez (compartilhado com o mapa de pausa)
    }

    // center: Vector3 | heading: rad (0 = norte) | blips: [{pos, color}]
    update(center, heading, blips = [], gps = null, pursuit = null) {
        const ctx = this.ctx;
        const S = this.size;
        const range = Config.minimap.rangeUnits;   // unidades de mundo na largura.
        const k = S / range;                        // px por unidade
        const sx = (x) => S / 2 + (x - center.x) * k, sy = (z) => S / 2 - (z - center.z) * k;

        ctx.save();
        this._roundRect(ctx, 0, 0, S, S, 0);
        ctx.clip();

        const B = this.baseSize, slack = (B - S) / 2 - 4;                         // folga (px) até a borda da camada
        const opKey = typeof Standing !== 'undefined' && Standing.policeOp ? 1 : 0;
        if (this._baseKey === null || this._baseKey !== opKey || Math.abs(center.x - this._bx) * k > slack || Math.abs(center.z - this._bz) * k > slack) {
            this._bx = center.x; this._bz = center.z; this._baseKey = opKey;
            const bc = this.baseCtx;
            bc.save(); bc.setLineDash([]);
            MapRenderer.drawView(bc, B, B, this._bx, this._bz, k);
            bc.restore();
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.base, Math.round(S / 2 - B / 2 + (this._bx - center.x) * k), Math.round(S / 2 - B / 2 + (center.z - this._bz) * k), B, B);

        // Área de perseguição da polícia (como no GTA V): círculo que pisca em vermelho/azul quando te enxergam e fica
        // azul-escuro, tracejado, quando você está sumindo da vista. A moldura do radar também pisca.
        const phase = Math.floor(performance.now() / 320) % 2 === 0;
        if (pursuit) {
            const cx = sx(pursuit.x), cy = sy(pursuit.z), rr = pursuit.r * k;
            const red = '216,42,42', blue = '46,100,235';
            const col = pursuit.seen ? (phase ? red : blue) : blue;
            ctx.save();
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${col},${pursuit.seen ? 0.26 : 0.14})`; ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = `rgba(${col},${pursuit.seen ? 0.95 : 0.6})`;
            if (!pursuit.seen) ctx.setLineDash([9, 7]);
            ctx.stroke();
            ctx.restore();
        }
        const mm = this.canvas;
        mm.classList.toggle('alert-r', !!(pursuit && pursuit.seen && phase));
        mm.classList.toggle('alert-b', !!(pursuit && pursuit.seen && !phase));

        // Blips.
        for (const bl of blips) {
            const p = { ox: sx(bl.pos.x), oy: sy(bl.pos.z) };
            ctx.fillStyle = bl.color || '#ff4040';
            ctx.beginPath();
            ctx.arc(p.ox, p.oy, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Rota do GPS (amarelo/azul tracejado, como no mapa grande) e marcador do destino (na borda, se estiver longe).
        if (gps && gps.route && gps.route.length > 1) {
            const P = gps.route.map((q) => [sx(q.x), sy(q.z)]);
            ctx.save();
            ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
            const path = () => { ctx.beginPath(); P.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); };
            ctx.setLineDash([]); ctx.strokeStyle = '#07090d'; ctx.lineWidth = 7; path(); ctx.stroke();
            ctx.setLineDash([8, 8]); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3.5; path(); ctx.stroke();
            ctx.lineDashOffset = -8; ctx.strokeStyle = '#4aa8ff'; path(); ctx.stroke();
            ctx.restore();
            const d = P[P.length - 1], m = 14;
            const inside = d[0] > m && d[0] < S - m && d[1] > m && d[1] < S - m;
            const px = Math.max(m, Math.min(S - m, d[0])), py = Math.max(m, Math.min(S - m, d[1]));
            ctx.save();
            ctx.translate(px, py);
            if (!inside) ctx.rotate(Math.atan2(d[1] - S / 2, d[0] - S / 2) + Math.PI / 2);        // seta apontando para o destino
            ctx.fillStyle = '#4aa8ff'; ctx.strokeStyle = '#07090d'; ctx.lineWidth = 2.5;
            ctx.beginPath();
            if (inside) { ctx.moveTo(0, 0); ctx.bezierCurveTo(-8, -9, -8, -19, 0, -19); ctx.bezierCurveTo(8, -19, 8, -9, 0, 0); }     // alfinete
            else { ctx.moveTo(0, -9); ctx.lineTo(8, 7); ctx.lineTo(0, 3); ctx.lineTo(-8, 7); ctx.closePath(); }
            ctx.stroke(); ctx.fill();
            if (inside) { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, -13, 3, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
        }

        // Blip do jogador (seta) no centro.
        ctx.translate(S / 2, S / 2);
        ctx.rotate(heading);
        ctx.fillStyle = '#00e0ff';
        ctx.strokeStyle = '#003a44';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 7);
        ctx.lineTo(0, 3);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // Moldura + Norte.
        // (a moldura de pixels é CSS no #minimap; aqui só o "N" do norte, com contorno)
        ctx.font = '700 12px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#07090d';
        ctx.strokeText('N', S / 2, 5);
        ctx.fillStyle = '#eef1f7';
        ctx.fillText('N', S / 2, 5);
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
}
