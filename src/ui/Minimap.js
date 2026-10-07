// ============================================================================
// Minimap — canto inferior esquerdo.
// Desenha a janela do mundo ao redor do jogador (north-up) com o MapRenderer (terreno raster + ruas/prédios vetoriais),
// mais blip do jogador, unidades (carros/polícia), o marcador de destino e o círculo de perseguição.
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
        this.baseSize = Math.ceil(this.size * 2.6);      // (folga para o radar girado com a câmera bússola: os cantos alcançam mais longe)
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
    // home: { x, z, icon } da safe house (sempre desenhada; na borda se estiver longe)
    update(center, heading, blips = [], gps = null, pursuit = null, home = null) {
        const ctx = this.ctx;
        const S = this.size;
        const range = Config.minimap.rangeUnits;   // unidades de mundo na largura.
        const k = S / range;                        // px por unidade
        // Câmera bússola (dirigindo): o radar gira junto — "cima" do radar = "cima" da tela (CompassCamera.yaw).
        const yaw = typeof CompassCamera !== 'undefined' ? CompassCamera.yaw || 0 : 0, ys = Math.sin(yaw), yc = Math.cos(yaw);
        const sx = (x, z) => S / 2 + ((x - center.x) * yc - (z - center.z) * ys) * k;
        const sy = (x, z) => S / 2 - ((x - center.x) * ys + (z - center.z) * yc) * k;

        ctx.save();
        this._roundRect(ctx, 0, 0, S, S, 0);
        ctx.clip();

        const B = this.baseSize, slack = B / 2 - S * Math.SQRT1_2 - 4;          // folga (px) até a borda da camada (cantos do radar girado)
        const opKey = typeof Standing !== 'undefined' && Standing.policeOp ? 1 : 0;
        if (this._baseKey === null || this._baseKey !== opKey || Math.abs(center.x - this._bx) * k > slack || Math.abs(center.z - this._bz) * k > slack) {
            this._bx = center.x; this._bz = center.z; this._baseKey = opKey;
            const bc = this.baseCtx;
            bc.save(); bc.setLineDash([]);
            MapRenderer.drawView(bc, B, B, this._bx, this._bz, k);
            bc.restore();
        }
        ctx.imageSmoothingEnabled = !!yaw;                                  // (girado: suaviza, senão os pixels serrilham)
        ctx.save();
        if (yaw) { ctx.translate(S / 2, S / 2); ctx.rotate(-yaw); ctx.translate(-S / 2, -S / 2); }
        ctx.drawImage(this.base, Math.round(S / 2 - B / 2 + (this._bx - center.x) * k), Math.round(S / 2 - B / 2 + (center.z - this._bz) * k), B, B);
        ctx.restore();

        // Área de perseguição da polícia (como no GTA V): círculo que pisca em vermelho/azul quando te enxergam e fica
        // azul-escuro, tracejado, quando você está sumindo da vista. A moldura do radar também pisca.
        const phase = Math.floor(performance.now() / 320) % 2 === 0;
        if (pursuit) {
            const cx = sx(pursuit.x, pursuit.z), cy = sy(pursuit.x, pursuit.z), rr = pursuit.r * k;
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
            const p = { ox: sx(bl.pos.x, bl.pos.z), oy: sy(bl.pos.x, bl.pos.z) };
            ctx.fillStyle = bl.color || '#ff4040';
            ctx.beginPath();
            ctx.arc(p.ox, p.oy, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Marcador de destino (blip vermelho, como no GTA San Andreas): no lugar dele ou, longe, preso na borda com uma setinha
        // apontando a direção — o mesmo esquema da safe house logo abaixo. Sem rota: o caminho é por sua conta.
        if (gps) {
            const gx = sx(gps.x, gps.z), gy = sy(gps.x, gps.z),{ inside, px, py } = this._edgePoint(gx, gy, S, 12);
            const r = 6;
            ctx.save();
            if (!inside) {
                ctx.translate(px, py); ctx.rotate(Math.atan2(gy - py, gx - px));
                ctx.fillStyle = '#ff3b3b'; ctx.strokeStyle = '#07090d'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(r + 7, 0); ctx.lineTo(r + 1, -5); ctx.lineTo(r + 1, 5); ctx.closePath(); ctx.stroke(); ctx.fill();
                ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            }
            ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fillStyle = '#ff3b3b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#07090d'; ctx.stroke();
            if (inside && Math.floor(performance.now() / 500) % 2 === 0) {      // pulso suave quando está à vista
                ctx.beginPath(); ctx.arc(px, py, r + 4, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,59,59,0.55)'; ctx.stroke();
            }
            ctx.restore();
        }

        // Safe house SEMPRE à vista (como no GTA): o ícone da casa no lugar dela ou, se estiver fora do radar, preso na borda na
        // direção dela — dá para voltar para casa sem abrir o mapa nem marcar destino.
        if (home && home.icon) {
            const hx = sx(home.x, home.z), hy = sy(home.x, home.z),{ inside, px, py } = this._edgePoint(hx, hy, S, 13);
            const r = inside ? 11 : 10;
            ctx.save();
            if (!inside) {                                          // setinha apontando para fora (para a casa)
                ctx.translate(px, py); ctx.rotate(Math.atan2(hy - py, hx - px));
                ctx.fillStyle = '#5ee08a'; ctx.strokeStyle = '#07090d'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(r + 7, 0); ctx.lineTo(r + 1, -5); ctx.lineTo(r + 1, 5); ctx.closePath(); ctx.stroke(); ctx.fill();
                ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            }
            ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.fillStyle = '#5ee08a'; ctx.fill();          // aro verde = "casa"
            ctx.drawImage(home.icon, px - r, py - r, r * 2, r * 2);
            ctx.restore();
        }

        // Blip do jogador (seta) no centro.
        ctx.translate(S / 2, S / 2);
        ctx.rotate(heading - yaw);
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
        // (a moldura de pixels é CSS no #minimap; aqui só o "N" do norte, com contorno — como numa bússola: com o radar girado, o
        // "N" corre pela borda e continua apontando o norte)
        const nr = S / 2 - 11, nx = S / 2 - ys * nr / Math.max(Math.abs(ys), Math.abs(yc)), ny = S / 2 - yc * nr / Math.max(Math.abs(ys), Math.abs(yc));
        ctx.font = '700 12px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#07090d';
        ctx.strokeText('N', nx, ny);
        ctx.fillStyle = '#eef1f7';
        ctx.fillText('N', nx, ny);
    }

    // Onde desenhar um marcador (gx, gy em px do radar): no próprio lugar, ou — fora do radar — no ponto em que a reta centro→alvo
    // cruza a borda. A borda de cima fica 26 px para dentro: lá em cima no meio está o "N", desenhado por último, que cobria o
    // marcador de quem estava exatamente ao norte.
    _edgePoint(gx, gy, S, m) {
        const top = Math.max(m, 26);
        const inside = gx > m && gx < S - m && gy > top && gy < S - m;
        if (inside) return { inside, px: gx, py: gy };
        const c = S / 2, dx = gx - c, dy = gy - c;
        const tx = dx > 0 ? (S - m - c) / dx : dx < 0 ? (m - c) / dx : Infinity;
        const ty = dy > 0 ? (S - m - c) / dy : dy < 0 ? (top - c) / dy : Infinity;
        const t = Math.min(tx, ty);
        return { inside, px: c + dx * t, py: c + dy * t };
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
