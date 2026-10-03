// ============================================================================
// EndScreen — telas de fim ("DETIDO" ao ser preso, "FIM DA LINHA" ao morrer) em PIXEL ART.
// Os textos não são texto de página: cada um é desenhado numa tela minúscula (1 pixel de arte = vários pixels da
// tela), com a fonte limiarizada (sem serrilhado suave), preenchimento em faixas com dither, brilho no topo, contorno
// grosso e, no título, sangue escorrendo; depois ampliado com `image-rendering: pixelated`. O fundo é o jogo
// parado atrás de um blur total, com varredura (scanlines) e vinheta.
// ============================================================================

class PixelText {
    // Renderiza `text` em pixel art. o: { font, size (px de arte), fill: [hi, c1, c2, c3, edge], outline: cor, thick (px),
    // drips (0..1: chance de escorrer por coluna), seed }. Retorna um <canvas> (tamanho em pixels de ARTE).
    static render(text, o) {
        const thick = o.thick || 1, maxDrip = o.drips ? Math.round(o.size * 0.34) : 0;
        const pad = thick + 2;
        const m = document.createElement('canvas').getContext('2d');
        m.font = `${o.size}px ${o.font}`;
        const tw = Math.ceil(m.measureText(text).width);
        const W = tw + pad * 2, Hh = Math.ceil(o.size * 1.25) + pad * 2 + maxDrip;

        const c = document.createElement('canvas');
        c.width = W; c.height = Hh;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.font = `${o.size}px ${o.font}`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#000';
        ctx.fillText(text, pad, pad);
        const src = ctx.getImageData(0, 0, W, Hh).data;

        const mask = new Uint8Array(W * Hh);
        let minY = Hh, maxY = 0;
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
            if (src[(y * W + x) * 4 + 3] >= 110) { mask[y * W + x] = 1; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
        const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < Hh ? mask[y * W + x] : 0);
        const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7 + (o.seed || 1) * 74.7) * 43758.5453; return n - Math.floor(n); };
        const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const F = o.fill.map(rgb), OUT = rgb(o.outline);

        const out = ctx.createImageData(W, Hh);
        const put = (x, y, col) => { const i = (y * W + x) * 4; out.data[i] = col[0]; out.data[i + 1] = col[1]; out.data[i + 2] = col[2]; out.data[i + 3] = 255; };
        const full = new Uint8Array(mask);                     // máscara + pingos (para o contorno)
        const span = Math.max(1, maxY - minY);

        // Preenchimento em faixas: brilho na borda de cima, 3 tons com dither nas emendas, borda escura embaixo, manchas.
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
            if (!mask[y * W + x]) continue;
            const t = (y - minY) / span;
            let band = t < 0.36 ? 1 : (t < 0.68 ? 2 : 3);
            const seam = [0.36, 0.68].find((s) => Math.abs(t - s) < 0.05);
            if (seam !== undefined && ((x + y) & 1)) band = t < seam ? band + 1 : band - 1;
            let col = F[band];
            if (!at(x, y - 1) && t < 0.5) col = F[0];                                  // brilho no topo
            else if (!at(x - 1, y) && t < 0.6) col = F[Math.max(0, band - 1)];          // luz na borda esquerda
            if (!at(x, y + 1)) col = F[4];                                              // borda de baixo, escura
            else if (t > 0.5 && hash(x, y) < 0.08) col = F[Math.min(4, band + 1)];     // manchas
            put(x, y, col);
        }

        // Sangue escorrendo: de algumas colunas da borda de baixo, fios de 1–2 px com gota na ponta.
        if (maxDrip) {
            for (let x = 1; x < W - 1; x++) {
                let by = maxY; while (by >= minY && !mask[by * W + x]) by--;       // pixel mais baixo da coluna
                if (by < maxY - 8 || hash(x, 3) > o.drips * 0.45) continue;
                const len = 2 + Math.floor(hash(x, 9) * maxDrip);
                for (let k = 1; k <= len; k++) {
                    const y = by + k; if (y >= Hh) break;
                    put(x, y, F[k === len ? 1 : 2]); full[y * W + x] = 1;
                    if (hash(x, 5) < 0.4 && x + 1 < W) { put(x + 1, y, F[3]); full[y * W + x + 1] = 1; }
                }
            }
        }

        // Contorno grosso (losango) em volta de tudo.
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
            if (full[y * W + x]) continue;
            let hit = false;
            for (let dy = -thick; dy <= thick && !hit; dy++) for (let dx = -thick; dx <= thick; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > thick + (thick > 1 ? 1 : 0)) continue;
                const xx = x + dx, yy = y + dy;
                if (xx >= 0 && yy >= 0 && xx < W && yy < Hh && full[yy * W + xx]) { hit = true; break; }
            }
            if (hit) put(x, y, OUT);
        }
        ctx.putImageData(out, 0, 0);
        c.className = 'es-px';
        return c;
    }
}

class EndScreen {
    constructor() {
        const css = document.createElement('style');
        css.textContent = `
            #endscreen { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center;
                justify-content: center; gap: 3.2vh; opacity: 0; visibility: hidden; pointer-events: none;
                transition: opacity 0.7s ease, visibility 0s linear 0.7s;
                -webkit-backdrop-filter: blur(24px) brightness(0.5) saturate(0.7); backdrop-filter: blur(24px) brightness(0.5) saturate(0.7);
                background:
                    repeating-linear-gradient(0deg, rgba(0,0,0,0.20) 0 2px, rgba(0,0,0,0) 2px 4px),
                    radial-gradient(ellipse at center, rgba(30,0,0,0.05) 25%, rgba(0,0,0,0.85) 100%); }
            #endscreen.show { opacity: 1; visibility: visible; transition: opacity 0.7s ease; }
            #endscreen .es-px { image-rendering: pixelated; image-rendering: crisp-edges; display: block; }
            #endscreen .es-title { filter: drop-shadow(0 0 14px rgba(255,30,30,0.7)) drop-shadow(0 0 46px rgba(255,0,0,0.4)); }
            #endscreen .es-lines { display: flex; flex-direction: column; align-items: center; gap: 1.4vh; }
            #endscreen .es-press { margin-top: 3vh; animation: esBlink 1.3s steps(2, jump-none) infinite; }
            @keyframes esBlink { 0% { opacity: 1; } 55% { opacity: 1; } 56% { opacity: 0.25; } 100% { opacity: 0.25; } }`;
        document.head.appendChild(css);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Press+Start+2P&display=swap';
        document.head.appendChild(link);

        const el = this.el = document.createElement('div');
        el.id = 'endscreen';
        el.innerHTML = '<div class="es-title-wrap"></div><div class="es-lines"></div><div class="es-press-wrap"></div>';
        document.body.appendChild(el);
        this.titleEl = el.querySelector('.es-title-wrap');
        this.linesEl = el.querySelector('.es-lines');
        this.pressEl = el.querySelector('.es-press-wrap');
        this.visible = false;
        this._token = 0;
    }

    // Garante que as fontes de pixel carregaram (ou desiste em 1,5 s e usa a reserva).
    async _fonts() {
        if (!document.fonts) return;
        const load = Promise.all([document.fonts.load('40px "Luckiest Guy"', 'DETIDO'), document.fonts.load('8px "Press Start 2P"', 'PRESSIONE')]).catch(() => {});
        await Promise.race([load, new Promise((r) => setTimeout(r, 1500))]);
    }

    // title: texto grande | lines: [{ text, color? }] | prompt: texto piscando embaixo.
    async show({ title, lines = [], prompt = 'PRESSIONE QUALQUER BOTÃO PARA CONTINUAR' }) {
        const token = ++this._token;
        await this._fonts();
        if (token !== this._token) return;                      // (fechou/abriu outra enquanto as fontes carregavam)
        const vw = window.innerWidth, vh = window.innerHeight;

        // Título: sangue vermelho em pixel art, gotejando.
        const T = PixelText.render(title, {
            font: '"Luckiest Guy", Impact, "Arial Black", sans-serif', size: 46, thick: 2, drips: 0.5, seed: title.length * 7,
            fill: ['#ff6a66', '#d8262c', '#a8141b', '#7c0c12', '#4a070b'], outline: '#14040a',
        });
        let s = Math.max(2, Math.floor(Math.min(vw * 0.8 / T.width, vh * 0.36 / T.height)));
        T.style.width = T.width * s + 'px'; T.style.height = T.height * s + 'px';
        T.classList.add('es-title');
        this.titleEl.replaceChildren(T);

        // Linhas de informação (fonte de pixel nativa de 8 px).
        const ls = Math.max(2, Math.min(4, Math.round(vw / 480)));
        const nodes = lines.map((l) => {
            const c = PixelText.render(l.text, {
                font: '"Press Start 2P", monospace', size: 8, thick: 1,
                fill: [l.color || '#ffe27a', l.color || '#ffd23f', l.color || '#f0b72a', l.color || '#d99a1a', '#8a5a0c'], outline: '#050505',
            });
            c.style.width = c.width * ls + 'px'; c.style.height = c.height * ls + 'px';
            return c;
        });
        this.linesEl.replaceChildren(...nodes);

        // Aviso piscando.
        const P = PixelText.render(prompt, {
            font: '"Press Start 2P", monospace', size: 8, thick: 1,
            fill: ['#ffffff', '#f4f4f4', '#e6e6e6', '#d4d4d4', '#bdbdbd'], outline: '#000000',
        });
        const ps = Math.max(1, Math.min(3, Math.floor(vw * 0.86 / P.width)));
        P.style.width = P.width * ps + 'px'; P.style.height = P.height * ps + 'px';
        P.classList.add('es-press');
        this.pressEl.replaceChildren(P);

        this.visible = true;
        this.el.classList.add('show');
    }

    hide() {
        this._token++;
        this.visible = false;
        this.el.classList.remove('show');
    }
}
