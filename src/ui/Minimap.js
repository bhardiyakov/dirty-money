// ============================================================================
// Minimap — canto inferior esquerdo.
// Desenha a janela do mundo ao redor do jogador (north-up) com o MapRenderer (terreno raster + ruas/prédios vetoriais),
// mais blip do jogador, unidades (carros/polícia), o marcador de destino e o círculo de perseguição.
// Lojas e lugares em que dá para entrar (Minimap.places) aparecem com ícone pequeno quando estão à vista: dá para se localizar
// pelo radar ("estou do lado da farmácia"). No celular, tocar no radar abre o mapa expandido (TouchControls → PauseMenu.openMap).
// ============================================================================

class Minimap {
    // Ícone de cada tipo de interior (Economy.STYLES) no radar.
    static get STYLE_ICON() {
        return { burger: 'burger', mart: 'cart', pharmacy: 'pharmacy', bar: 'beer', bakery: 'bakery', pizza: 'pizza', fit: 'salad', italian: 'pasta', japanese: 'sushi',
            guns: 'gun', clothes: 'shirt', gym: 'gym', drugs: 'drugs', bank_branch: 'bank', bank_hq: 'bank', jewelry: 'jewels' };
    }
    // Pontos do mapa (CityGrid.pois) que também vão para o radar: os que não são porta de loja (as lojas vêm TODAS das portas do
    // Interiors, não só a amostra do mapa de pausa). Safe house, fachadas, baile e mototáxi já têm marcador próprio. Imóvel: só os seus.
    static get RADAR_POIS() { return ['hospital', 'station', 'gas', 'marina', 'dealer', 'paynspray', 'chop', 'imovel', 'negocio']; }

    // Lugares com ícone: [{ x, z, icon, name, label?, door }]. Conferido no máximo 1×/s e refeito só quando algo mudou (bancos tomam
    // portas de loja, imóveis são comprados e vendidos, POIs entram no CityGrid) — a mesma lista serve de cache para o mapa de pausa.
    static places() {
        const now = performance.now();
        if (Minimap._places && now - Minimap._placesT < 1000) return Minimap._places;
        Minimap._placesT = now;
        if (!CityGrid.blocks) return (Minimap._places = []);
        Interiors.index();
        const key = `${Interiors._doors.length}|${Banks.list.length}|${(CityGrid.pois || []).length}|${Object.keys(RealEstate.owned).join(',')}`;
        if (key === Minimap._placesKey) return Minimap._places;
        Minimap._placesKey = key;
        const out = [], SI = Minimap.STYLE_ICON, RP = Minimap.RADAR_POIS, T = PauseMenu.POI_TYPES;
        for (const d of Interiors._doors) { const icon = SI[d.style]; if (icon) out.push({ x: d.x, z: d.z, icon, name: d.name, label: d.bank ? '' : Economy.STYLES[d.style].label, door: true }); }
        for (const p of CityGrid.pois || []) {
            if (!RP.includes(p.type)) continue;
            if (p.type === 'imovel') { const q = RealEstate.byId[p.prop]; if (!q || !RealEstate.isOwned(q)) continue; }
            out.push({ x: p.x, z: p.z, icon: T[p.type].icon, name: p.name, door: false });
        }
        return (Minimap._places = out);
    }

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

    // center: Vector3 | heading: rad (0 = norte) | blips: [{pos, color, ring?}] (ring = raio em u de um círculo de alcance — o radar da polícia)
    // home: { x, z, icon } da safe house (sempre desenhada; na borda se estiver longe)
    // marks: [{ x, z }] lugares seus com ícone (as fachadas de lavagem), desenhados com `markIcon` só quando estão dentro do radar
    update(center, heading, blips = [], gps = null, pursuit = null, home = null, marks = null, markIcon = null) {
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
            const col = pursuit.search ? '245,190,40' : pursuit.seen ? (phase ? red : blue) : blue;      // (amarelo: área de busca depois de um assalto — crime/Traces.js)
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

        // Alcance da polícia (radar): círculos translúcidos por baixo dos pontos.
        let ringed = false;
        for (const bl of blips) {
            if (!bl.ring) continue;
            if (!ringed) { ringed = true; ctx.save(); ctx.fillStyle = 'rgba(58,123,255,0.13)'; ctx.strokeStyle = 'rgba(90,150,255,0.55)'; ctx.lineWidth = 1.5; }
            ctx.beginPath(); ctx.arc(sx(bl.pos.x, bl.pos.z), sy(bl.pos.x, bl.pos.z), bl.ring * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        if (ringed) ctx.restore();

        // Lojas e lugares em que dá para entrar: ícones pequenos por baixo dos blips (carros e polícia ficam por cima).
        if (this.iconOf) this._drawPlaces(ctx, S, sx, sy);

        // Blips.
        for (const bl of blips) {
            const p = { ox: sx(bl.pos.x, bl.pos.z), oy: sy(bl.pos.x, bl.pos.z) };
            ctx.fillStyle = bl.color || '#ff4040';
            ctx.beginPath();
            ctx.arc(p.ox, p.oy, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Fachadas de lavagem: ícone com aro dourado, só quando estão à vista no radar (não poluem a borda).
        if (marks && markIcon) {
            for (const m of marks) {
                const mx = sx(m.x, m.z), my = sy(m.x, m.z), r = 8;
                if (mx < -r || my < -r || mx > S + r || my > S + r) continue;
                ctx.beginPath(); ctx.arc(mx, my, r + 1.5, 0, Math.PI * 2); ctx.fillStyle = '#f5c542'; ctx.fill();
                ctx.drawImage(markIcon, mx - r, my - r, r * 2, r * 2);
            }
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

        if (this.expandHint) this._drawExpandHint(ctx, S);
    }

    // Ícones dos lugares à vista (Minimap.places). No celular o CSS encolhe o radar (108 px): os ícones crescem na mesma proporção
    // para continuar legíveis. Lojas coladas umas nas outras viram um ícone só (o primeiro), sem formar um borrão.
    _drawPlaces(ctx, S, sx, sy) {
        const shown = this.canvas.clientWidth || S, r = Math.max(7, Math.min(13, 6.5 * S / shown)), gap = r * 2;
        const drawn = this._drawn || (this._drawn = []);
        drawn.length = 0;
        for (const p of Minimap.places()) {
            const x = sx(p.x, p.z), y = sy(p.x, p.z);
            if (x < -r || y < -r || x > S + r || y > S + r) continue;
            let near = false;
            for (let i = 0; i < drawn.length; i += 2) if (Math.abs(drawn[i] - x) < gap && Math.abs(drawn[i + 1] - y) < gap) { near = true; break; }
            if (near) continue;
            drawn.push(x, y);
            ctx.drawImage(this.iconOf(p.icon), x - r, y - r, r * 2, r * 2);
        }
    }

    // Celular: quatro cantinhos de "expandir" no canto inferior direito — tocar no radar abre o mapa grande.
    _drawExpandHint(ctx, S) {
        const k = S / (this.canvas.clientWidth || S), h = 6 * k, c = S - 15 * k, a = 2.6 * k;
        ctx.save();
        ctx.fillStyle = 'rgba(8,10,16,0.62)';
        ctx.beginPath(); ctx.arc(c, c, h + 4 * k, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#eef1f7'; ctx.lineWidth = 1.4 * k; ctx.lineCap = 'round';
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const x = c + sx * h, y = c + sy * h;
            ctx.moveTo(x - sx * a, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * a);
        }
        ctx.stroke();
        ctx.restore();
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
memoStatics(Minimap, 'STYLE_ICON', 'RADAR_POIS');
