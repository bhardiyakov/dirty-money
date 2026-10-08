// ============================================================================
// Gerador dos carros vistos de cima (SVG) — porte para JS do `fonte/gen.py` do pacote "Carros 2D" (vista de cima, frente para a
// DIREITA, desenho vetorial com degradês e brilho), com os 13 carros originais e mais 23 modelos novos (picapes, vans, esportivos,
// superesportivos, sedãs, antigos e as viaturas da polícia, SWAT e exército).
//
// Escala do desenho: 70 px = 1 metro (como no pacote). O build (index.html) rasteriza cada SVG na densidade do jogo.
//
// Cores: cada carro é desenhado com DUAS tintas variáveis — `P` (pintura) e `P2` (detalhe: teto de outra cor, faixas) — e o resto fixo.
// Toda cor derivada da pintura é uma MISTURA dela com branco/preto (light/dark/mix), então o pixel final é afim na tinta:
//     cor = K + M1·P + M2·P2
// O build desenha o carro com P/P2 em preto e em branco e separa K, M1 e M2: o jogo repinta qualquer modelo em qualquer cor no shader,
// com um único desenho. Modelos `fixed` (táxis, viaturas) têm a pintura própria e não mudam de cor.
// ============================================================================

const CarGen = (() => {
    const S = 70;              // px por metro (desenho)
    const K = 0.5523;          // aproximação de arco por bézier
    const f = (v) => (Math.round(v * 10) / 10).toString();

    // ------------------------------------------------------------------ cores
    const rgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
    const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
    const light = (c, t) => mix(c, '#ffffff', t);
    const dark = (c, t) => mix(c, '#000000', t);

    // RNG determinístico (mulberry32) por carro: os amassados saem sempre iguais.
    const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

    // ------------------------------------------------------------------ formas
    // Contorno da carroceria: retângulo arredondado com laterais e frente levemente abauladas.
    function bodyPath(L, W, fr, fry, rr, rry, sb = 2, fb = 3, rb = 2, y0 = 0) {
        const t = y0, b = y0 + W;
        return `M${f(rr)},${f(t)} Q${f(L / 2)},${f(t - sb)} ${f(L - fr)},${f(t)} ` +
            `C${f(L - fr + fr * K)},${f(t)} ${f(L)},${f(t + fry - fry * K)} ${f(L)},${f(t + fry)} ` +
            `Q${f(L + fb)},${f((t + b) / 2)} ${f(L)},${f(b - fry)} ` +
            `C${f(L)},${f(b - fry + fry * K)} ${f(L - fr + fr * K)},${f(b)} ${f(L - fr)},${f(b)} ` +
            `Q${f(L / 2)},${f(b + sb)} ${f(rr)},${f(b)} ` +
            `C${f(rr - rr * K)},${f(b)} 0,${f(b - rry + rry * K)} 0,${f(b - rry)} ` +
            `Q${f(-rb)},${f((t + b) / 2)} 0,${f(t + rry)} ` +
            `C0,${f(t + rry - rry * K)} ${f(rr - rr * K)},${f(t)} ${f(rr)},${f(t)} Z`;
    }

    // Retângulo arredondado; fb/rb abaulam a borda da frente/trás.
    function rrect(x0, x1, y0, y1, r, fb = 0, rb = 0) {
        r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
        const cy = (y0 + y1) / 2;
        return `M${f(x0 + r)},${f(y0)} L${f(x1 - r)},${f(y0)} Q${f(x1)},${f(y0)} ${f(x1)},${f(y0 + r)} ` +
            `Q${f(x1 + fb)},${f(cy)} ${f(x1)},${f(y1 - r)} Q${f(x1)},${f(y1)} ${f(x1 - r)},${f(y1)} ` +
            `L${f(x0 + r)},${f(y1)} Q${f(x0)},${f(y1)} ${f(x0)},${f(y1 - r)} ` +
            `Q${f(x0 - rb)},${f(cy)} ${f(x0)},${f(y0 + r)} Q${f(x0)},${f(y0)} ${f(x0 + r)},${f(y0)} Z`;
    }

    // Área envidraçada (para-brisa + janelas laterais + vidro traseiro).
    function cabinPath(cf, cr, W, ciF, ciR, wb, rbul, r = 6) {
        return `M${f(cr + r)},${f(ciR)} L${f(cf - r)},${f(ciF)} Q${f(cf)},${f(ciF)} ${f(cf + wb * 0.25)},${f(ciF + r * 1.4)} ` +
            `Q${f(cf + wb)},${f(W / 2)} ${f(cf + wb * 0.25)},${f(W - ciF - r * 1.4)} Q${f(cf)},${f(W - ciF)} ${f(cf - r)},${f(W - ciF)} ` +
            `L${f(cr + r)},${f(W - ciR)} Q${f(cr)},${f(W - ciR)} ${f(cr - rbul * 0.25)},${f(W - ciR - r)} ` +
            `Q${f(cr - rbul)},${f(W / 2)} ${f(cr - rbul * 0.25)},${f(ciR + r)} Q${f(cr)},${f(ciR)} ${f(cr + r)},${f(ciR)} Z`;
    }

    // x da borda da carroceria (frente ou traseira) na altura y.
    function edgeX(c, y, front = true) {
        const L = c.L, W = c.W, by0 = c.body_y0 || 0;
        let yy = y - by0;
        const bw = W - 2 * by0;
        yy = Math.min(yy, bw - yy);
        if (front) {
            const fr = c.fr, fry = c.fry;
            if (yy >= fry) return L;
            const t = Math.max(0, (fry - yy) / fry);
            return L - fr + fr * Math.sqrt(Math.max(0, 1 - t * t));
        }
        const rr = c.rr, rry = c.rry;
        if (yy >= rry) return 0;
        const t = Math.max(0, (rry - yy) / rry);
        return rr - rr * Math.sqrt(Math.max(0, 1 - t * t));
    }

    // Faixa que acompanha o contorno (faróis/lanternas).
    function band(c, front, y0, y1, depth, off = 0, n = 14) {
        const ys = []; for (let k = 0; k < n; k++) ys.push(y0 + (y1 - y0) * k / (n - 1));
        const sgn = front ? -1 : 1;
        const outer = ys.map((y) => [edgeX(c, y, front) + sgn * off - sgn * 0.3, y]);
        const inner = ys.slice().reverse().map((y, k) => {
            const tt = k / (n - 1), taper = 0.55 + 0.45 * (1 - Math.pow(Math.abs(2 * tt - 1), 3));
            return [edgeX(c, y, front) + sgn * (off + depth * taper), y];
        });
        return outer.concat(inner);
    }

    const poly = (pts) => 'M' + pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' L') + ' Z';
    const mirrorY = (pts, W) => pts.map(([x, y]) => [x, W - y]);

    // ------------------------------------------------------------------ carro
    // opts: { paint, paint2 } (tintas desta renderização; padrão = cores do catálogo) | dmg: camada de amassados (ver damageSVG)
    // size: [w, h] em px da imagem final (escala o viewBox) — padrão = tamanho do desenho.
    function carSVG(c, opts = {}) {
        const cid = c.id + (opts.tag || '');
        const L = c.L, W = c.W, PAD = c.pad || 10;
        const P = c.fixed ? c.color : (opts.paint || c.color), P2 = c.fixed ? (c.color2 || c.color) : (opts.paint2 || c.color2 || c.color);
        const res = (v) => (v === 'P' ? P : v === 'P2' ? P2 : v);
        const paint = P;
        const roofc = res(c.roof || 'P');
        const stroke = dark(paint, 0.45);
        const cw = L + PAD * 2, ch = W + PAD * 2;
        const g = (n) => `${cid}-${n}`;
        const defs = [], out = [];

        defs.push(`
  <linearGradient id="${g('paint')}" x1="0" y1="0" x2="0" y2="${W}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${light(paint, 0.30)}"/><stop offset="0.16" stop-color="${light(paint, 0.08)}"/>
    <stop offset="0.5" stop-color="${paint}"/><stop offset="0.84" stop-color="${dark(paint, 0.12)}"/>
    <stop offset="1" stop-color="${dark(paint, 0.32)}"/></linearGradient>
  <linearGradient id="${g('roof')}" x1="0" y1="0" x2="0" y2="${W}" gradientUnits="userSpaceOnUse">
    <stop offset="0.12" stop-color="${light(roofc, 0.22)}"/><stop offset="0.5" stop-color="${light(roofc, 0.04)}"/>
    <stop offset="0.88" stop-color="${dark(roofc, 0.18)}"/></linearGradient>
  <linearGradient id="${g('glass')}" x1="${c.cr}" y1="0" x2="${c.cf + 6}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#2c333c"/><stop offset="0.25" stop-color="#1a1f26"/>
    <stop offset="0.75" stop-color="#1c2129"/><stop offset="1" stop-color="#46505c"/></linearGradient>
  <radialGradient id="${g('shine')}" cx="0.5" cy="0.35" r="0.6">
    <stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="${g('head')}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#bfe9f7"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
  <linearGradient id="${g('tail')}" x1="1" y1="0" x2="0" y2="0">
    <stop offset="0" stop-color="#ff7a6e"/><stop offset="1" stop-color="#b3141c"/></linearGradient>
  <linearGradient id="${g('chrome')}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f4f6f8"/><stop offset="0.5" stop-color="#a9afb6"/><stop offset="1" stop-color="#e3e6ea"/></linearGradient>
  <linearGradient id="${g('bed')}" x1="0" y1="0" x2="0" y2="${W}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#1c1d21"/><stop offset="0.5" stop-color="#2e3036"/><stop offset="1" stop-color="#17181b"/></linearGradient>`);

        const fenders = c.fenders || [];          // [cx, cy, rx, ry] — paralamas destacados (Fusca)
        const by0 = c.body_y0 || 0, bW = W - 2 * by0;
        const bpath = bodyPath(L, bW, c.fr, c.fry, c.rr, c.rry, c.sb ?? 2, c.fb ?? 3, c.rb ?? 2, by0);
        const clipD = bpath + fenders.map(([x, y, rx, ry]) => ` M${f(x - rx)},${f(y)} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0 Z`).join('');
        defs.push(`  <clipPath id="${g('clip')}"><path d="${clipD}"/></clipPath>`);
        const cab = cabinPath(c.cf, c.cr, W, c.ci_f, c.ci_r, c.wb ?? 8, c.rwb ?? 4);
        defs.push(`  <clipPath id="${g('cabclip')}"><path d="${cab}"/></clipPath>`);
        const roofD = rrect(c.rr_x, c.rf, c.ri, W - c.ri, c.roof_r ?? 9, c.roof_fb ?? 3, c.roof_rb ?? 2);
        defs.push(`  <clipPath id="${g('roofclip')}"><path d="${roofD}"/></clipPath>`);

        out.push(`<g transform="translate(${PAD},${PAD})">`);

        // estepe atrás (jipes): por baixo da carroceria
        if (c.spare) {
            const r = c.spare;
            out.push(`<circle cx="${f(-r * 0.35)}" cy="${f(W / 2)}" r="${r}" fill="#1b1b1f" stroke="#0c0c0e" stroke-width="1"/>`);
            out.push(`<circle cx="${f(-r * 0.35)}" cy="${f(W / 2)}" r="${f(r * 0.55)}" fill="#2b2c31"/>`);
            out.push(`<circle cx="${f(-r * 0.35)}" cy="${f(W / 2)}" r="${f(r * 0.22)}" fill="url(#${g('chrome')})"/>`);
        }

        // pneus (aparecem só um pouquinho nas laterais)
        const tr = c.wheel_r;
        const tw = c.tire_out ?? 2.5;
        // (noFrontTires: as rodas da frente saem do desenho — o jogo as desenha à parte, esterçando com o volante; ver tireSpec)
        const frontX = Math.max(...c.wheels_x);
        for (const wx of c.wheels_x) {
            if (opts.noFrontTires && wx === frontX) continue;
            for (const [y0, y1] of [[by0 - tw, by0 + 10], [W - by0 - 10, W - by0 + tw]]) {
                out.push(`<rect x="${f(wx - tr)}" y="${f(y0)}" width="${f(2 * tr)}" height="${f(y1 - y0)}" rx="4" fill="#1b1b1f"/>`);
            }
        }

        // para-choque de impulsão (jipes, SWAT): na frente, fora da carroceria
        if (c.bullbar) {
            const bc = c.bullbar === 'chrome' ? `url(#${g('chrome')})` : '#25262b';
            out.push(`<rect x="${L - 2}" y="${f(W * 0.2)}" width="9" height="${f(W * 0.6)}" rx="3" fill="${bc}" stroke="#0e0f11" stroke-width="0.8"/>`);
            for (const yy of [W * 0.28, W * 0.72]) out.push(`<rect x="${L - 8}" y="${f(yy - 2)}" width="10" height="4" fill="#1d1e22"/>`);
        }

        // paralamas (Fusca) — peças separadas abaixo da carroceria
        for (const [x, y, rx, ry] of fenders) {
            out.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#${g('paint')})" stroke="${stroke}" stroke-width="1.4"/>`);
            out.push(`<ellipse cx="${x}" cy="${f(y + (y < W / 2 ? -ry * 0.25 : ry * 0.25))}" rx="${f(rx * 0.7)}" ry="${f(ry * 0.4)}" fill="url(#${g('shine')})" opacity="0.7"/>`);
        }
        for (const [x0, x1] of c.running_boards || []) {
            out.push(`<rect x="${x0}" y="${by0 - 3}" width="${x1 - x0}" height="7" rx="2" fill="#2a2a2e"/>`);
            out.push(`<rect x="${x0}" y="${W - by0 - 4}" width="${x1 - x0}" height="7" rx="2" fill="#2a2a2e"/>`);
        }

        // carroceria
        out.push(`<path d="${bpath}" fill="url(#${g('paint')})" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>`);

        // ---- detalhes recortados pela carroceria
        out.push(`<g clip-path="url(#${g('clip')})">`);
        // painéis de outra cor (portas da viatura) — ficam por baixo dos vidros e do teto: aparecem nas laterais
        for (const p of c.panels || []) {
            out.push(`<rect x="${p.x0}" y="-5" width="${p.x1 - p.x0}" height="${W + 10}" fill="${res(p.color)}"/>`);
            if (p.edge) for (const x of [p.x0, p.x1]) out.push(`<rect x="${x - 1.2}" y="-5" width="2.4" height="${W + 10}" fill="${res(p.edge)}"/>`);
        }
        // faixa lateral (táxi do Rio)
        if (c.stripe) {
            const [col, x0, x1, th] = c.stripe;
            out.push(`<rect x="${x0}" y="${by0 - 4}" width="${x1 - x0}" height="${th + 4}" fill="${res(col)}"/>`);
            out.push(`<rect x="${x0}" y="${W - by0 - th}" width="${x1 - x0}" height="${th + 4}" fill="${res(col)}"/>`);
        }
        // plástico preto (SUV / aventureiro / jipe)
        if (c.cladding) {
            const cl = '#2a2b2f', ex = c.cladding === 'big' ? 4 : 0;
            out.push(`<rect x="${L - 7}" y="-5" width="14" height="${W + 10}" fill="${cl}"/>`);
            out.push(`<rect x="-7" y="-5" width="13" height="${W + 10}" fill="${cl}"/>`);
            for (const wx of c.wheels_x) for (const cy of [by0 - 1, W - by0 + 1]) out.push(`<ellipse cx="${wx}" cy="${cy}" rx="${tr + 7 + ex}" ry="${6 + ex}" fill="${cl}"/>`);
        }
        // para-choques
        const bump = c.bumpers;
        if (bump) {
            const col = bump === 'chrome' ? `url(#${g('chrome')})` : bump === 'paint' ? `url(#${g('paint')})` : '#2b2c31';
            const bw = c.bumper_w ?? 6;
            out.push(`<rect x="${L - bw}" y="-5" width="${bw + 6}" height="${W + 10}" fill="${col}"/>`);
            out.push(`<rect x="-6" y="-5" width="${bw + 6}" height="${W + 10}" fill="${col}"/>`);
        }
        // grade
        const gw = c.grille ?? 0.36;
        if (gw) {
            const gy0 = W * (0.5 - gw / 2), gy1 = W * (0.5 + gw / 2);
            const gc = c.grille_chrome ? `url(#${g('chrome')})` : '#1d1e22';
            out.push(`<rect x="${L - 5}" y="${f(gy0)}" width="10" height="${f(gy1 - gy0)}" rx="2" fill="${gc}"/>`);
            const n = c.grille_slots || 4;
            for (let k = 1; k < n; k++) {
                const yy = gy0 + (gy1 - gy0) * k / n;
                out.push(`<line x1="${L - 4}" y1="${f(yy)}" x2="${L + 3}" y2="${f(yy)}" stroke="${c.grille_chrome ? '#3a3c42' : '#55575d'}" stroke-width="0.8"/>`);
            }
            if (c.grille_line) out.push(`<rect x="${L - 6}" y="${f(gy0)}" width="1.6" height="${f(gy1 - gy0)}" fill="${c.grille_line}"/>`);
        }
        if (c.kidney) for (const sy of [-1, 1]) out.push(`<rect x="${L - 6}" y="${f(W / 2 + sy * 9 - 6)}" width="9" height="12" rx="3" fill="#18191c" stroke="url(#${g('chrome')})" stroke-width="1.2"/>`);
        // faróis
        const off = c.bumpers ? (c.bumper_w ?? 0) : 0;
        const hl = c.head || ['band', 9, 3, 24];
        for (const side of [0, 1]) {
            if (hl[0] === 'band') {
                const [, depth, y0, y1] = hl;
                let pts = band(c, true, by0 + y0, by0 + y1, depth, off);
                if (side) pts = mirrorY(pts, W);
                out.push(`<path d="${poly(pts)}" fill="url(#${g('head')})" stroke="#40505a" stroke-width="0.9" stroke-linejoin="round"/>`);
                let p2 = band(c, true, by0 + y0 + (y1 - y0) * 0.45, by0 + y1 - 2, depth * 0.45, off + depth * 0.25, 8);
                if (side) p2 = mirrorY(p2, W);
                out.push(`<path d="${poly(p2)}" fill="#ffffff" opacity="0.9"/>`);
            } else {                                    // redondo (round2 = dois por lado)
                const [hx, hy, r] = c.head_pos || [L - 9, 14, 7];
                const list = hl[0] === 'round2' ? [[hx, hy], [hx - r * 0.2, hy + r * 2.2]] : [[hx, hy]];
                for (const [x, y] of list) {
                    const yy = side ? W - y : y;
                    out.push(`<circle cx="${f(x)}" cy="${f(yy)}" r="${r}" fill="url(#${g('head')})" stroke="#40505a" stroke-width="1"/>`);
                    out.push(`<circle cx="${f(x + 1.5)}" cy="${f(yy - 1.5)}" r="${f(r * 0.35)}" fill="#fff"/>`);
                }
            }
        }
        // lanternas
        const tl = c.tail || ['band', 7, 3, 22];
        for (const side of [0, 1]) {
            if (tl[0] === 'band') {
                const [, depth, y0, y1] = tl;
                let pts = band(c, false, by0 + y0, by0 + y1, depth, off);
                if (side) pts = mirrorY(pts, W);
                out.push(`<path d="${poly(pts)}" fill="url(#${g('tail')})" stroke="#5a1010" stroke-width="0.9" stroke-linejoin="round"/>`);
            } else {
                const [tx, ty, r] = c.tail_pos || [8, 14, 6];
                const list = tl[0] === 'round2' ? [[tx, ty], [tx, ty + r * 2.3]] : [[tx, ty]];
                for (const [x, y] of list) out.push(`<circle cx="${f(x)}" cy="${f(side ? W - y : y)}" r="${r}" fill="url(#${g('tail')})" stroke="#5a1010" stroke-width="1"/>`);
            }
        }
        if (c.tail_bar) out.push(`<rect x="${off + 0.5}" y="${f(by0 + (tl[3] || 22))}" width="3.2" height="${f(W - 2 * (by0 + (tl[3] || 22)))}" fill="url(#${g('tail')})" opacity="0.9"/>`);
        out.push('</g>');

        // vincos do capô
        const cf = c.cf, cr = c.cr, ciF = c.ci_f, ri = c.ri;
        if (c.hood_lines !== false) {
            for (const side of [0, 1]) {
                let y1 = ciF + 10, y2 = 17;
                if (side) { y1 = W - y1; y2 = W - y2; }
                out.push(`<path d="M${cf + 8},${f(y1)} Q${f((cf + L) / 2)},${f((y1 + y2) / 2 + (side ? -2 : 2))} ${L - 16},${f(y2)}" fill="none" stroke="${dark(paint, 0.3)}" stroke-opacity="0.35" stroke-width="1.2"/>`);
            }
        }
        // caçamba (picapes): piso escuro com frisos, laterais e tampa
        if (c.bed) {
            const b = c.bed, in_ = b.inset ?? 9;
            out.push(`<g clip-path="url(#${g('clip')})">`);
            out.push(`<path d="${rrect(b.x0, b.x1, in_, W - in_, 4)}" fill="url(#${g('bed')})" stroke="${dark(paint, 0.55)}" stroke-width="1.4"/>`);
            for (let x = b.x0 + 12; x < b.x1 - 6; x += 12) out.push(`<line x1="${x}" y1="${in_ + 3}" x2="${x}" y2="${W - in_ - 3}" stroke="#3a3c43" stroke-width="2"/>`);
            out.push(`<rect x="${b.x0 + 1}" y="${in_ + 1}" width="${b.x1 - b.x0 - 2}" height="3" fill="#0d0e10" opacity="0.6"/>`);       // sombra da borda (luz de cima)
            out.push(`<rect x="${b.x1 - 4}" y="${in_}" width="4" height="${W - 2 * in_}" fill="${dark(paint, 0.25)}"/>`);              // parede da cabine
            if (b.cover) out.push(`<path d="${rrect(b.x0 + 2, b.x1 - 3, in_ + 2, W - in_ - 2, 3)}" fill="#26272c" stroke="#111" stroke-width="0.8"/>`);
            if (b.rollbar) {
                out.push(`<rect x="${b.x1 - 16}" y="${in_ - 1}" width="6" height="${W - 2 * in_ + 2}" rx="2" fill="url(#${g('chrome')})" stroke="#555a60" stroke-width="0.6"/>`);
            }
            if (b.cargo) for (const [x0, x1, y0, y1, col] of b.cargo) out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="2" fill="${col}" stroke="#111" stroke-width="0.6"/>`);
            out.push('</g>');
        }
        // brilho no capô
        const hoodLen = L - cf;
        out.push(`<g clip-path="url(#${g('clip')})">` +
            `<path d="${poly([[cf + hoodLen * 0.18, 0], [cf + hoodLen * 0.5, 0], [cf + hoodLen * 0.32, W], [cf, W]])}" fill="#fff" opacity="0.13"/>` +
            `<path d="${poly([[cf + hoodLen * 0.58, 0], [cf + hoodLen * 0.66, 0], [cf + hoodLen * 0.48, W], [cf + hoodLen * 0.4, W]])}" fill="#fff" opacity="0.10"/>` +
            `<path d="${bpath}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2" transform="translate(0,1.4)"/>` +
            '</g>');
        // tampa do porta-malas / capô traseiro
        if (cr > 40 && !c.bed) out.push(`<g clip-path="url(#${g('clip')})"><path d="${poly([[cr * 0.25, 0], [cr * 0.6, 0], [cr * 0.4, W], [cr * 0.05, W]])}" fill="#fff" opacity="0.1"/></g>`);
        for (const x of c.rear_lines || []) out.push(`<path d="M${x},${f(W * 0.3)} Q${x - 3},${f(W / 2)} ${x},${f(W * 0.7)}" fill="none" stroke="${dark(paint, 0.35)}" stroke-opacity="0.45" stroke-width="1.1"/>`);
        for (const [x, y0, y1] of c.vents || []) {
            for (let k = 0; k < 5; k++) {
                const xx = x + k * 3.2;
                out.push(`<line x1="${f(xx)}" y1="${y0}" x2="${f(xx)}" y2="${y1}" stroke="${dark(paint, 0.45)}" stroke-width="1.3" stroke-linecap="round"/>`);
            }
        }
        // tomada de ar no capô
        if (c.hood_scoop) {
            const [x0, x1, w] = c.hood_scoop;
            out.push(`<path d="${rrect(x0, x1, W / 2 - w / 2, W / 2 + w / 2, 5, 2, 0)}" fill="${dark(paint, 0.15)}" stroke="${dark(paint, 0.5)}" stroke-width="1"/>`);
            out.push(`<rect x="${x1 - 6}" y="${f(W / 2 - w / 2 + 4)}" width="5" height="${w - 8}" rx="1.5" fill="#141518"/>`);
        }
        // saídas de ar no capô (esportivos)
        for (const [x, y, len] of c.hood_vents || []) for (const yy of [y, W - y]) {
            for (let k = 0; k < 4; k++) out.push(`<line x1="${x + k * 3.4}" y1="${f(yy - len / 2)}" x2="${x + k * 3.4}" y2="${f(yy + len / 2)}" stroke="#16171a" stroke-width="1.6" stroke-linecap="round"/>`);
        }
        // faixas de corrida (pintura 2): capô e porta-malas (o teto vem depois)
        const racing = c.racing;
        const racingRects = (x0, x1) => {
            const [col, w, gap] = racing, s = [];
            for (const sy of [-1, 1]) s.push(`<rect x="${x0}" y="${f(W / 2 + sy * (gap / 2 + w / 2) - w / 2)}" width="${x1 - x0}" height="${w}" fill="${res(col)}"/>`);
            return s.join('');
        };
        if (racing) out.push(`<g clip-path="url(#${g('clip')})">${racingRects(-5, L + 5)}</g>`);

        // vincos das portas + maçanetas
        for (const dx of c.door_seams || []) {
            out.push(`<line x1="${dx}" y1="${by0 + 1}" x2="${dx}" y2="${ciF - 1}" stroke="${dark(paint, 0.5)}" stroke-opacity="0.55" stroke-width="1"/>`);
            out.push(`<line x1="${dx}" y1="${W - by0 - 1}" x2="${dx}" y2="${W - ciF + 1}" stroke="${dark(paint, 0.5)}" stroke-opacity="0.55" stroke-width="1"/>`);
        }
        for (const hx of c.handles || []) {
            out.push(`<rect x="${hx - 7}" y="${f(by0 + 1.6)}" width="7" height="2.4" rx="1.2" fill="${light(paint, 0.55)}" stroke="${dark(paint, 0.5)}" stroke-width="0.5"/>`);
            out.push(`<rect x="${hx - 7}" y="${W - by0 - 4}" width="7" height="2.4" rx="1.2" fill="${light(paint, 0.55)}" stroke="${dark(paint, 0.5)}" stroke-width="0.5"/>`);
        }
        // entradas de ar laterais (superesportivos)
        if (c.side_intakes) {
            const [x0, x1] = c.side_intakes;
            for (const side of [0, 1]) {
                const Y = (y) => (side ? W - y : y);
                out.push(`<path d="${poly([[x0, Y(by0 + 2)], [x1, Y(by0 + 2)], [x1 - 6, Y(by0 + 11)], [x0 + 10, Y(by0 + 9)]])}" fill="#141518" stroke="${dark(paint, 0.5)}" stroke-width="0.8"/>`);
            }
        }

        // ---- vidros
        out.push(`<path d="${cab}" fill="url(#${g('glass')})" stroke="${dark(paint, 0.6)}" stroke-width="1.2" stroke-linejoin="round"/>`);
        const rf = c.rf, rrx = c.rr_x;
        out.push(`<g clip-path="url(#${g('cabclip')})" opacity="0.5">` +
            `<path d="${poly([[rf + 6, ri + 2], [rf + 16, ri + 2], [cf + 2, W * 0.62], [cf - 10, W * 0.62]])}" fill="#ffffff" opacity="0.28"/>` +
            `<path d="${poly([[rf + 22, ri + 2], [rf + 27, ri + 2], [cf + 5, W * 0.5], [cf, W * 0.5]])}" fill="#ffffff" opacity="0.22"/>` +
            `<path d="${poly([[cr - 4, W * 0.3], [rrx - 2, W * 0.3], [rrx - 6, W * 0.48], [cr - 4, W * 0.48]])}" fill="#ffffff" opacity="0.18"/>` +
            '</g>');
        // furgão: chapa no lugar dos vidros atrás da cabine (só as janelas da frente aparecem)
        if (c.cargo) {
            out.push(`<g clip-path="url(#${g('cabclip')})"><rect x="-5" y="-5" width="${c.cargo + 5}" height="${W + 10}" fill="url(#${g('paint')})"/>` +
                `<rect x="${c.cargo - 1.5}" y="-5" width="1.5" height="${W + 10}" fill="${dark(paint, 0.5)}" opacity="0.6"/></g>`);
        }

        // colunas
        const pc = dark(paint, 0.08), pw = c.a_pillar ?? 4.5;
        for (const side of [0, 1]) {
            const Y = (y) => (side ? W - y : y);
            out.push(`<line x1="${rf - 2}" y1="${f(Y(ri + 2))}" x2="${cf - 3}" y2="${f(Y(ciF + 1.5))}" stroke="${pc}" stroke-width="${pw}" stroke-linecap="round"/>`);
            const cwid = c.c_pillar ?? 10;
            if (cwid > 0) {
                const cp = [[cr + 2, Y(c.ci_r)], [cr + 2 + cwid, Y(c.ci_r)], [rrx + cwid * 0.5, Y(ri + 1)], [rrx - 2, Y(ri + 1)]];
                out.push(`<path d="${poly(cp)}" fill="${pc}" stroke="${pc}" stroke-width="1.5" stroke-linejoin="round"/>`);
            }
            for (const bx of c.b_pillars || []) out.push(`<rect x="${bx - 2.5}" y="${f(Math.min(Y(ciF - 1), Y(ri + 1)))}" width="5" height="${f(Math.abs(Y(ri + 1) - Y(ciF - 1)))}" fill="${pc}"/>`);
        }

        // teto
        const roofFill = c.canvas_top ? res(c.canvas_top) : `url(#${g('roof')})`;
        out.push(`<path d="${roofD}" fill="${roofFill}" stroke="${dark(c.canvas_top ? res(c.canvas_top) : roofc, 0.4)}" stroke-width="1.2"/>`);
        if (c.canvas_top) {                                         // capota de lona: arcos e costuras
            for (let x = rrx + 16; x < rf - 8; x += 22) out.push(`<rect x="${x}" y="${ri + 1}" width="3" height="${W - 2 * ri - 2}" fill="${dark(res(c.canvas_top), 0.3)}" opacity="0.7"/>`);
            out.push(`<rect x="${rrx + 2}" y="${f(W / 2 - 0.6)}" width="${rf - rrx - 4}" height="1.2" fill="${dark(res(c.canvas_top), 0.35)}" opacity="0.6"/>`);
        }
        if (racing && !c.racing_skip_roof) out.push(`<g clip-path="url(#${g('roofclip')})">${racingRects(rrx - 2, rf + 2)}</g>`);
        out.push(`<ellipse cx="${f((rrx + rf) / 2)}" cy="${f(W * 0.38)}" rx="${f((rf - rrx) * 0.4)}" ry="${f((W - 2 * ri) * 0.22)}" fill="url(#${g('shine')})" opacity="${c.canvas_top ? 0.15 : 0.5}"/>`);
        if (c.roof_ribs) for (let x = rrx + 18; x < rf - 10; x += 20) out.push(`<rect x="${x}" y="${ri + 3}" width="2" height="${W - 2 * ri - 6}" rx="1" fill="${dark(roofc, 0.25)}" opacity="0.55"/>`);
        if (c.sunroof) {
            const [x0, x1] = c.sunroof;
            out.push(`<path d="${rrect(x0, x1, ri + 10, W - ri - 10, 4)}" fill="#20262e" stroke="#111" stroke-width="0.8"/>`);
            out.push(`<path d="${poly([[x0 + 6, ri + 12], [x0 + 12, ri + 12], [x0 + 4, W - ri - 12], [x0 + 1, W - ri - 12]])}" fill="#fff" opacity="0.1"/>`);
        }
        if (c.roof_hatch) {
            const [x0, x1] = c.roof_hatch;
            out.push(`<path d="${rrect(x0, x1, W / 2 - (x1 - x0) / 2, W / 2 + (x1 - x0) / 2, 4)}" fill="${dark(roofc, 0.2)}" stroke="#0e0f11" stroke-width="1"/>`);
            out.push(`<rect x="${x0 + 3}" y="${f(W / 2 - 1)}" width="${x1 - x0 - 6}" height="2" fill="#0e0f11" opacity="0.6"/>`);
        }

        // barras de teto
        if (c.rails) {
            const [rc, x0, x1] = c.rails;
            for (const yy of [ri + 4, W - ri - 7]) out.push(`<rect x="${x0}" y="${yy}" width="${x1 - x0}" height="3.2" rx="1.6" fill="${rc}" stroke="#111" stroke-width="0.6"/>`);
            if (c.rails[3]) for (const xx of c.rails[3]) out.push(`<rect x="${xx}" y="${ri + 4}" width="3" height="${W - 2 * ri - 8}" rx="1.4" fill="${rc}" stroke="#111" stroke-width="0.5"/>`);
        }
        // aerofólio traseiro (sobre o porta-malas) e aerofólio de teto (hatch esportivo)
        if (c.spoiler) {
            const [x, d, col] = c.spoiler, sc = res(col || 'P');
            out.push(`<rect x="${x}" y="${by0 + 5}" width="${d}" height="${W - 2 * by0 - 10}" rx="2.5" fill="${sc === '#1a1a1d' || sc === '#1d1e22' ? sc : `url(#${g('paint')})`}" stroke="${dark(sc, 0.55)}" stroke-width="1"/>`);
            out.push(`<rect x="${x + 1}" y="${by0 + 7}" width="${d - 2}" height="2.2" fill="#fff" opacity="0.25"/>`);
            for (const yy of [by0 + 3, W - by0 - 9]) out.push(`<rect x="${x - 1}" y="${yy}" width="${d + 2}" height="6" rx="1.5" fill="#1a1b1e"/>`);
        }
        if (c.roof_spoiler) out.push(`<rect x="${rrx - 7}" y="${ri + 2}" width="9" height="${W - 2 * ri - 4}" rx="3" fill="${dark(roofc, 0.1)}" stroke="${dark(roofc, 0.5)}" stroke-width="1"/>`);
        // tampa do motor de vidro (motor central) com frisos
        if (c.engine_cover) {
            const [x0, x1, in_, hexa] = c.engine_cover;
            out.push(`<path d="${rrect(x0, x1, in_, W - in_, 6)}" fill="#20252c" stroke="${dark(paint, 0.55)}" stroke-width="1.2"/>`);
            if (hexa) {
                for (let x = x0 + 8; x < x1 - 4; x += 11) for (let y = in_ + 7 + ((x - x0) / 11 % 2) * 5; y < W - in_ - 4; y += 10) out.push(`<path d="M${x - 3},${y} l1.6,-2.8 h3 l1.6,2.8 l-1.6,2.8 h-3 Z" fill="#11141a" stroke="#3b424c" stroke-width="0.5"/>`);
            } else {
                for (let x = x0 + 7; x < x1 - 4; x += 7) out.push(`<rect x="${x}" y="${in_ + 4}" width="2.4" height="${W - 2 * in_ - 8}" rx="1" fill="#0f1216"/>`);
            }
            out.push(`<path d="${poly([[x0 + 4, in_ + 3], [x0 + 14, in_ + 3], [x0 + 6, W - in_ - 3], [x0 + 2, W - in_ - 3]])}" fill="#fff" opacity="0.12"/>`);
        }

        // luminoso de táxi
        if (c.taxi_sign) {
            const [bg, fg, txtC] = c.taxi_sign;
            const sx = (rrx + rf) / 2 - 9;
            out.push(`<rect x="${f(sx)}" y="${f(W / 2 - 19)}" width="17" height="38" rx="3.5" fill="${bg}" stroke="#222" stroke-width="1"/>`);
            out.push(`<rect x="${f(sx + 2)}" y="${f(W / 2 - 17)}" width="13" height="34" rx="2.5" fill="${fg}"/>`);
            out.push(`<text x="0" y="0" transform="translate(${f(sx + 11.6)},${f(W / 2)}) rotate(-90)" text-anchor="middle" ` +
                `font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="8.5" fill="${txtC}">TÁXI</text>`);
        }
        // giroflex (viaturas): base escura com lentes vermelha e azul
        if (c.lightbar) {
            const [lx, lw, lh, cols] = c.lightbar, y0 = W / 2 - lh / 2;
            const [ca, cb] = cols || ['#2050e0', '#d8202a'];          // esquerda azul, direita vermelha (como os brilhos do CarLights)
            out.push(`<rect x="${lx - lw / 2}" y="${f(y0 - 2)}" width="${lw}" height="${lh + 4}" rx="3" fill="#1a1b1f" stroke="#0a0a0c" stroke-width="0.8"/>`);
            out.push(`<rect x="${lx - lw / 2 + 2}" y="${f(y0)}" width="${lw - 4}" height="${f(lh / 2 - 1.5)}" rx="2" fill="${ca}"/>`);
            out.push(`<rect x="${lx - lw / 2 + 2}" y="${f(W / 2 + 1.5)}" width="${lw - 4}" height="${f(lh / 2 - 1.5)}" rx="2" fill="${cb}"/>`);
            out.push(`<rect x="${lx - lw / 2 + 2}" y="${f(y0 + 1)}" width="${lw - 4}" height="2" rx="1" fill="#fff" opacity="0.45"/>`);
            out.push(`<rect x="${lx - lw / 2 + 2}" y="${f(W / 2 + 2.5)}" width="${lw - 4}" height="2" rx="1" fill="#fff" opacity="0.35"/>`);
            out.push(`<rect x="${lx - 2}" y="${f(y0)}" width="4" height="${lh}" fill="#c8ccd2"/>`);
        }
        // letreiros (POLÍCIA no capô, TÁTICO no teto...)
        for (const t of c.texts || []) {
            out.push(`<text x="0" y="0" transform="translate(${f(t.x)},${f(t.y ?? W / 2)}) rotate(${t.rot ?? -90})" text-anchor="middle" dominant-baseline="central" ` +
                `font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="${t.size}" fill="${res(t.color)}" letter-spacing="${t.sp ?? 0.5}">${t.str}</text>`);
        }
        // estrela/emblema (exército)
        if (c.star) {
            const [sx, sy, r, col] = c.star, pts = [];
            for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.42 : r; pts.push([sx + Math.cos(a) * rr, sy + Math.sin(a) * rr]); }
            out.push(`<path d="${poly(pts)}" fill="${col}" opacity="0.9"/>`);
        }
        // snorkel (jipes)
        if (c.snorkel) out.push(`<rect x="${c.cf - 18}" y="${by0 - 2}" width="14" height="7" rx="3" fill="#1d1e22" stroke="#0b0b0d" stroke-width="0.6"/>`);

        // antena (antigos)
        if (c.antenna) { const [ax, ay] = c.antenna; out.push(`<line x1="${ax}" y1="${ay}" x2="${ax - 18}" y2="${ay - 1}" stroke="#222" stroke-width="1.1"/>`); }

        if (c.blade_bumpers) for (const x of [L - 2, -4]) out.push(`<rect x="${x}" y="${by0 + 6}" width="6" height="${W - 2 * by0 - 12}" rx="3" fill="url(#${g('chrome')})" stroke="#6b7076" stroke-width="0.8"/>`);

        // retrovisores
        const mx = c.mirror_x ?? cf - 2, mo = c.mirror_out ?? 7;
        for (const side of [0, 1]) {
            let pts = [[mx, by0 + 3], [mx - 3, by0 - mo + 1], [mx - 8, by0 - mo], [mx - 12, by0 - mo + 2.5], [mx - 11, by0 + 3]];
            if (side) pts = mirrorY(pts, W);
            out.push(`<path d="${poly(pts)}" fill="${res(c.mirror_color || 'P')}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`);
        }

        // camada de amassados (só nas passadas de dano do build)
        if (opts.dmg) out.push(opts.dmg);

        out.push('</g>');
        const [sw, sh] = opts.size || [cw, ch];
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none">\n` +
            `<defs>${defs.join('')}\n</defs>\n` + out.join('\n') + '\n</svg>\n';
    }

    // ------------------------------------------------------------------ relevo (3D no shader)
    // ALTURA (m) de cada ponto do carro visto de cima, em tons de cinza (0 = chão, branco = HMAX): o build tira daí as normais e o jogo
    // ilumina o carro com o sol do mundo (CarArt) — a luz não gira junto com o carro, e é isso que faz ele parecer 3D.
    // Carroceria plana na altura da cintura (rampas suaves no capô viravam listras: a altura sai em 8 bits), teto na altura dele,
    // caçamba rebaixada, bordas arredondadas. Os VIDROS não saem daqui: o build (atlas.js) monta cada um como um plano inclinado da
    // borda do teto até o topo da carroceria, a partir das máscaras abaixo.
    // mode 'glass' = máscara dos vidros (reflexo do céu) | 'cab' = cabine inteira (vidros + teto) | 'roof' = só o teto.
    const HMAX = 2.2;
    const HEIGHTS = {             // [cintura, teto] (m) por categoria
        super: [0.72, 1.12], esportivo: [0.78, 1.25], suv: [1.02, 1.72], picape: [1.02, 1.78], forca: [1.05, 1.8], van: [1.0, 2.0],
    };
    const heightsOf = (c) => HEIGHTS[c.categoria] || [0.9, 1.45];
    function heightSVG(c, mode, size) {
        const L = c.L, W = c.W, PAD = c.pad || 10, cw = L + PAD * 2, ch = W + PAD * 2;
        const [belt, roofH] = heightsOf(c);
        const v = (m) => { const k = Math.round(Math.max(0, Math.min(1, m / HMAX)) * 255); return `rgb(${k},${k},${k})`; };
        const by0 = c.body_y0 || 0, bW = W - 2 * by0;
        const bpath = bodyPath(L, bW, c.fr, c.fry, c.rr, c.rry, c.sb ?? 2, c.fb ?? 3, c.rb ?? 2, by0);
        const cab = cabinPath(c.cf, c.cr, W, c.ci_f, c.ci_r, c.wb ?? 8, c.rwb ?? 4);
        const roofD = rrect(c.rr_x, c.rf, c.ri, W - c.ri, c.roof_r ?? 9, c.roof_fb ?? 3, c.roof_rb ?? 2);
        const id = c.id + '-h' + mode, defs = [], out = [];
        const wrap = (body) => {
            const [sw, sh] = size || [cw, ch];
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none">` +
                `<defs>${defs.join('')}</defs><rect x="0" y="0" width="${cw}" height="${ch}" fill="#000"/><g transform="translate(${PAD},${PAD})">${body}</g></svg>`;
        };
        if (mode === 'cab' || mode === 'roof') {
            defs.push(`<clipPath id="${id}c"><path d="${bpath}"/></clipPath>`);
            out.push(`<g clip-path="url(#${id}c)">${mode === 'cab' ? `<path d="${cab}" fill="#fff"/>` : ''}<path d="${roofD}" fill="#fff"/></g>`);
            return wrap(out.join(''));
        }
        if (mode === 'glass') {
            defs.push(`<clipPath id="${id}c"><path d="${bpath}"/></clipPath>`);
            out.push(`<g clip-path="url(#${id}c)"><path d="${cab}" fill="#fff"/><path d="${roofD}" fill="#000"/>`);
            if (c.cargo) out.push(`<rect x="-5" y="-5" width="${c.cargo + 5}" height="${W + 10}" fill="#000"/>`);
            if (c.sunroof) out.push(`<path d="${rrect(c.sunroof[0], c.sunroof[1], c.ri + 10, W - c.ri - 10, 4)}" fill="#fff"/>`);
            if (c.engine_cover) { const [x0, x1, in_] = c.engine_cover; out.push(`<path d="${rrect(x0, x1, in_, W - in_, 6)}" fill="#fff"/>`); }
            out.push('</g>');
            return wrap(out.join(''));
        }
        const trunk = belt - 0.06;
        defs.push(`<clipPath id="${id}c"><path d="${bpath}"/></clipPath>`);
        // borrões: bordas da carroceria (arredondadas) e peças pequenas
        const blur = (n, sx, sy) => defs.push(`<filter id="${id}${n}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${f(sx)} ${f(sy)}"/></filter>`);
        blur('e', 3.2, 3.2); blur('s', 1.6, 1.6);
        const inner = [];
        inner.push(`<rect x="-20" y="-20" width="${L + 40}" height="${W + 40}" fill="${v(belt)}"/>`);
        // caçamba (picapes): rebaixada, com as bordas na altura da cintura
        if (c.bed) { const b = c.bed, in_ = b.inset ?? 9; inner.push(`<path d="${rrect(b.x0, b.x1, in_, W - in_, 4)}" fill="${v(b.cover ? belt - 0.04 : belt - 0.42)}" filter="url(#${id}s)"/>`); }
        inner.push(`<path d="${roofD}" fill="${v(roofH)}"/>`);          // (os vidros em volta: atlas.js, rampa até a cintura)
        // peças em cima do teto / da carroceria
        if (c.lightbar) { const [lx, lw, lh] = c.lightbar; inner.push(`<rect x="${lx - lw / 2}" y="${f(W / 2 - lh / 2 - 2)}" width="${lw}" height="${lh + 4}" rx="3" fill="${v(roofH + 0.14)}"/>`); }
        if (c.taxi_sign) { const sx = (c.rr_x + c.rf) / 2 - 9; inner.push(`<rect x="${f(sx)}" y="${f(W / 2 - 19)}" width="17" height="38" rx="3.5" fill="${v(roofH + 0.18)}"/>`); }
        if (c.rails) { const [, x0, x1] = c.rails; for (const yy of [c.ri + 4, W - c.ri - 7]) inner.push(`<rect x="${x0}" y="${yy}" width="${x1 - x0}" height="3.2" rx="1.6" fill="${v(roofH + 0.06)}"/>`); }
        if (c.roof_spoiler) inner.push(`<rect x="${c.rr_x - 7}" y="${c.ri + 2}" width="9" height="${W - 2 * c.ri - 4}" rx="3" fill="${v(roofH + 0.03)}"/>`);
        if (c.spoiler) { const [x, d] = c.spoiler; inner.push(`<rect x="${x}" y="${by0 + 5}" width="${d}" height="${W - 2 * by0 - 10}" rx="2.5" fill="${v(trunk + 0.22)}"/>`); }
        if (c.snorkel) inner.push(`<rect x="${c.cf - 18}" y="${by0 - 2}" width="14" height="7" rx="3" fill="${v(roofH - 0.1)}"/>`);
        // fora do recorte da carroceria: paralamas, estribos, para-choque de impulsão, estepe e retrovisores
        const outer = [];
        for (const [x, y, rx, ry] of c.fenders || []) outer.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${v(belt - 0.22)}"/>`);
        for (const [x0, x1] of c.running_boards || []) for (const y of [by0 - 3, W - by0 - 4]) outer.push(`<rect x="${x0}" y="${y}" width="${x1 - x0}" height="7" rx="2" fill="${v(0.35)}"/>`);
        if (c.bullbar) outer.push(`<rect x="${L - 2}" y="${f(W * 0.2)}" width="9" height="${f(W * 0.6)}" rx="3" fill="${v(0.55)}"/>`);
        if (c.spare) outer.push(`<circle cx="${f(-c.spare * 0.35)}" cy="${f(W / 2)}" r="${c.spare}" fill="${v(belt - 0.1)}"/>`);
        const mx = c.mirror_x ?? c.cf - 2, mo = c.mirror_out ?? 7;
        for (const sd of [0, 1]) {
            let pts = [[mx, by0 + 3], [mx - 3, by0 - mo + 1], [mx - 8, by0 - mo], [mx - 12, by0 - mo + 2.5], [mx - 11, by0 + 3]];
            if (sd) pts = mirrorY(pts, W);
            outer.push(`<path d="${poly(pts)}" fill="${v(belt + 0.05)}"/>`);
        }
        out.push(`<g filter="url(#${id}e)">${outer.join('')}<g clip-path="url(#${id}c)">${inner.join('')}</g></g>`);
        return wrap(out.join(''));
    }

    // Porta dianteira vista de cima (lâmina fina) para a animação de abrir. Dobradiça na ponta direita (frente do carro).
    function doorSVG(c, opts = {}) {
        const dl = c.door_len, t = 9, y = 3;
        const paint = c.fixed ? (c.door_color || c.color) : (opts.paint || c.color);
        const cw = dl + 4, ch = t + 6;
        const gid = `${c.id}${opts.tag || ''}-door`;
        const body = `<path d="M2,${y + 1.5} Q2,${y} 4,${y} L${dl},${y} Q${dl + 2},${y} ${dl + 2},${y + 3} L${dl + 2},${y + t - 2} ` +
            `Q${dl + 2},${y + t} ${dl},${y + t} L6,${y + t} Q2,${y + t} 2,${y + t - 3} Z" fill="url(#${gid})" stroke="${dark(paint, 0.45)}" stroke-width="1"/>`;
        const trim = `<rect x="4" y="${y + t - 3.2}" width="${dl - 6}" height="2.6" rx="1.2" fill="#2b2c30"/>`;
        const glass = `<rect x="${f(dl * 0.18)}" y="${y + 2.6}" width="${f(dl * 0.62)}" height="2.3" rx="1" fill="#2a313a"/>`;
        const handle = `<rect x="7" y="${y + 0.6}" width="7" height="2" rx="1" fill="${light(paint, 0.55)}"/>`;
        const [sw, sh] = opts.size || [cw, ch];
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none">` +
            `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${light(paint, 0.3)}"/><stop offset="0.6" stop-color="${paint}"/>` +
            `<stop offset="1" stop-color="${dark(paint, 0.3)}"/></linearGradient></defs><g>${body}${trim}${glass}${handle}</g></svg>\n`;
    }

    // ------------------------------------------------------------------ amassados
    // Marcas de batida em 3 fases (cumulativas), geradas a partir das medidas do carro. Cada marca: { lv, d } onde d é o SVG da forma
    // e o tom vai em `dark` (escurece) ou `light` (clareia) com a opacidade `a`. O build desenha duas camadas a partir disto:
    //   limiar  — em que fase a marca aparece (cinza 64/128/192; 255 = nunca)
    //   desvio  — quanto escurece/clareia (cinza 128 = nada; 0 = preto; 255 = branco)
    function damageMarks(c) {
        const R = rng(hashStr(c.id)), L = c.L, W = c.W, by0 = c.body_y0 || 0;
        const cf = c.cf, rf = c.rf, rrx = c.rr_x, cr = c.cr, ri = c.ri;
        const M = [];
        // soft: borda macia (desfoque em px do desenho) | glass: recortada pela área envidraçada
        const add = (lv, kind, a, d, soft = 0, glass = false) => M.push({ lv, kind, a, d, soft, glass });
        const rnd = (a, b) => a + (b - a) * R();
        const line = (pts, w) => `<path d="M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' L')}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
        const blob = (cx, cy, rx, ry, rot = 0) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})" fill="#000" stroke="#000" stroke-width="0"/>`;
        const zig = (x0, y0, x1, y1, n, amp) => { const p = []; for (let k = 0; k <= n; k++) { const t = k / n; p.push([x0 + (x1 - x0) * t + (k % 2 ? amp : -amp) * 0.4, y0 + (y1 - y0) * t + (k % 2 ? amp : -amp)]); } return p; };
        const crack = (cx, cy, n, len, w = 0.9) => { let s = ''; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + rnd(-0.3, 0.3), l = rnd(len * 0.5, len); const mx = cx + Math.cos(a) * l * 0.5 + rnd(-2, 2), my = cy + Math.sin(a) * l * 0.5 + rnd(-2, 2); s += line([[cx, cy], [mx, my], [cx + Math.cos(a) * l, cy + Math.sin(a) * l]], w); } return s; };
        const web = (cx, cy, r) => { let s = ''; for (const k of [0.35, 0.7]) { const pts = []; for (let q = 0; q <= 8; q++) { const a = q / 8 * Math.PI * 2; pts.push([cx + Math.cos(a) * r * k * rnd(0.8, 1.15), cy + Math.sin(a) * r * k * rnd(0.8, 1.15)]); } s += line(pts, 0.7); } return s; };
        const glassAll = `<rect x="${c.cargo || -10}" y="-10" width="${L + 20}" height="${W + 20}" fill="#000"/>`;
        const hasTrunk = cr > 40 && !c.bed;
        const sideY = (side) => (side ? W - by0 - 4 : by0 + 4);
        const hoodMid = (cf + L) / 2, wsX = (rf + c.cf) / 2, roofX = (rrx + rf) / 2;
        const side1 = R() < 0.5 ? 0 : 1;          // lado que apanha primeiro
        const hasRear = !c.cargo && !c.bed && rrx - cr > 8;

        // ---- fase 1: arranhões, trinca no para-brisa, mossas pequenas
        for (const side of [0, 1]) {
            const x0 = rnd(L * 0.25, L * 0.45), len = rnd(40, 70), y = sideY(side) + (side ? -rnd(0, 3) : rnd(0, 3));
            add(1, 'light', 0.5, line([[x0, y], [x0 + len * 0.5, y + rnd(-2, 2)], [x0 + len, y + rnd(-3, 3)]], 1.2));
        }
        add(1, 'light', 0.4, line([[cf + 10, rnd(W * 0.3, W * 0.45)], [cf + (L - cf) * 0.55, rnd(W * 0.35, W * 0.6)]], 1.0));
        add(1, 'light', 0.65, crack(wsX + rnd(-3, 3), W * rnd(0.3, 0.4), 5, 12), 0, true);
        add(1, 'dark', 0.3, blob(rnd(L * 0.15, L * 0.3), sideY(side1) + (side1 ? -5 : 5), 12, 6, rnd(-10, 10)), 3);
        add(1, 'dark', 0.26, blob(L - 20, side1 ? W - by0 - 18 : by0 + 18, 11, 9), 3);

        // ---- fase 2: capô amassado, um farol quebrado, para-brisa trincado, porta afundada
        add(2, 'dark', 0.4, blob(hoodMid + rnd(-8, 8), W * rnd(0.38, 0.6), (L - cf) * 0.24, W * 0.18, rnd(-20, 20)), 5);
        add(2, 'light', 0.45, line(zig(cf + 14, W * 0.3, L - 14, W * 0.62, 5, 4), 1.2));
        { const yy = side1 ? W - by0 - 16 : by0 + 16; add(2, 'dark', 0.5, blob(L - 6, yy, 22, 16), 4); add(2, 'dark', 0.75, blob(L - 5, yy, 8, 12)); }   // canto e farol
        add(2, 'light', 0.6, crack(wsX, W * 0.52, 9, 22) + web(wsX, W * 0.52, 18), 0, true);
        add(2, 'dark', 0.34, blob(L * rnd(0.4, 0.55), sideY(1 - side1) + (side1 ? 5 : -5), 24, 7), 3);
        add(2, 'light', 0.45, line([[6, W * 0.25], [16, W * 0.27]], 1.3) + line([[5, W * 0.7], [13, W * 0.72]], 1.1));

        // ---- fase 3: frente esmagada, faróis e lanternas quebrados, vidros estourados, teto afundado
        add(3, 'dark', 0.55, `<rect x="${f(L - (L - cf) * 0.3)}" y="${-6}" width="${f((L - cf) * 0.3 + 16)}" height="${W + 12}" fill="#000" stroke="#000" stroke-width="0"/>`, 9);
        for (let k = 0; k < 3; k++) { const x = L - 10 - k * ((L - cf) * 0.13); add(3, 'light', 0.4, line(zig(x, W * 0.14, x - 4, W * 0.86, 6, 3.5), 1.1)); }
        { const yy = side1 ? by0 + 16 : W - by0 - 16; add(3, 'dark', 0.75, blob(L - 5, yy, 8, 12)); }
        for (const yy of [by0 + 14, W - by0 - 14]) add(3, 'dark', 0.62, blob(6, yy, 6, 10));
        add(3, 'light', 0.2, glassAll, 0, true);                                                      // vidros estourados (embaçados)
        add(3, 'light', 0.55, crack(wsX - 4, W * 0.3, 10, 24) + web(wsX - 4, W * 0.3, 16), 0, true);
        if (hasRear) add(3, 'light', 0.5, crack((cr + rrx) / 2, W * 0.55, 8, 18), 0, true);
        add(3, 'dark', 0.3, blob(roofX + rnd(-10, 10), W * 0.52, (rf - rrx) * 0.3, (W - 2 * ri) * 0.32, rnd(-15, 15)), 7);
        add(3, 'light', 0.32, line([[roofX - 18, W * 0.36], [roofX + 2, W * 0.55], [roofX + 20, W * 0.47]], 1.1));
        for (const side of [0, 1]) add(3, 'dark', 0.32, blob(L * 0.5, sideY(side) + (side ? -2 : 2), L * 0.26, 4), 2.5);
        add(3, 'dark', 0.45, blob(4, side1 ? by0 + 6 : W - by0 - 6, 22, 18), 5);                     // canto traseiro amassado
        if (hasTrunk) add(3, 'dark', 0.3, blob(cr * 0.45, W * 0.5, cr * 0.3, W * 0.2, rnd(-10, 10)), 5);
        return M;
    }

    // SVG de uma das duas camadas de dano do carro `c` (mesmo enquadramento do carSVG). mode: 'thr' (limiar) | 'shift' (desvio).
    function damageSVG(c, mode, size) {
        const L = c.L, W = c.W, PAD = c.pad || 10, cw = L + PAD * 2, ch = W + PAD * 2;
        const by0 = c.body_y0 || 0;
        // (veículos de outro desenho — motos, bicicletas, barcos: veiculos.js — trazem a silhueta, os vidros e as marcas próprias)
        const V = c.custom;
        const bpath = V ? V.clip : bodyPath(L, W - 2 * by0, c.fr, c.fry, c.rr, c.rry, c.sb ?? 2, c.fb ?? 3, c.rb ?? 2, by0);
        const cab = V ? (V.glass || "M0,0 Z") : cabinPath(c.cf, c.cr, W, c.ci_f, c.ci_r, c.wb ?? 8, c.rwb ?? 4);
        const roofD = V ? "M0,0 Z" : rrect(c.rr_x, c.rf, c.ri, W - c.ri, c.roof_r ?? 9, c.roof_fb ?? 3, c.roof_rb ?? 2);
        const marks = V ? V.marks(c) : damageMarks(c);
        const out = [], filters = new Set();
        const recolor = (d, col, widen) => {
            let s = d.replace(/fill="#000"/g, `fill="${col}"`).replace(/stroke="#000"/g, `stroke="${col}"`);
            if (widen) s = s.replace(/stroke-width="([\d.]+)"/g, (m, w) => `stroke-width="${(+w + widen).toFixed(2)}"`);
            return s;
        };
        const wrap = (m, s, blur) => {
            if (blur) { filters.add(m.soft); s = `<g filter="url(#soft${m.soft})">${s}</g>`; }
            if (m.glass) s = `<g clip-path="url(#gclip)">${s}</g>`;
            return s;
        };
        if (mode === 'thr') {
            // limiar: a marca cobre a área do desfoque inteira (alarga o contorno), fases mais baixas por cima
            out.push(`<rect x="${-PAD}" y="${-PAD}" width="${cw}" height="${ch}" fill="#ffffff"/>`);
            for (const lv of [3, 2, 1]) {
                const g = Math.round(lv * 64), col = hex([g, g, g]);
                for (const m of marks) if (m.lv === lv) out.push(wrap(m, recolor(m.d, col, 1.2 + m.soft * 4), false));
            }
        } else {
            out.push(`<rect x="${-PAD}" y="${-PAD}" width="${cw}" height="${ch}" fill="#808080"/>`);
            for (const m of marks) out.push(`<g opacity="${m.a}">${wrap(m, recolor(m.d, m.kind === 'dark' ? '#000000' : '#ffffff', 0), m.soft > 0)}</g>`);
        }
        const fdefs = [...filters].map((s) => `<filter id="soft${s}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`).join('');
        const [sw, sh] = size || [cw, ch];
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none">` +
            `<defs><clipPath id="dclip"><path d="${bpath}"/></clipPath><clipPath id="gclip"><path d="${cab} ${roofD}" clip-rule="evenodd"/></clipPath>${fdefs}</defs>` +
            `<g transform="translate(${PAD},${PAD})"><g clip-path="url(#dclip)">${out.join('')}</g></g></svg>`;
    }

    // ------------------------------------------------------------------ catálogo
    const CARS = [];
    const car = (kw) => { if (kw.door_len === undefined) kw.door_len = 64; CARS.push(kw); return kw; };

    // ---------------- POPULARES (os 4 do pacote + 2 novos)
    car({ id: 'hatch_moderno', nome: 'Hatch moderno (estilo Onix)', categoria: 'popular',
        L: 287, W: 122, color: '#c8202e', fr: 36, fry: 30, rr: 18, rry: 20,
        cf: 186, rf: 146, rr_x: 40, cr: 17, ci_f: 9, ci_r: 14, ri: 20, wb: 10, rwb: 5,
        wheels_x: [225, 60], wheel_r: 22, head: ['band', 10, 3, 30], tail: ['band', 8, 3, 24],
        b_pillars: [106], door_seams: [176, 106, 52], handles: [150, 92], c_pillar: 13, door_len: 66, door_hinge: 176 });

    car({ id: 'hatch_moderno2', nome: 'Hatch moderno (estilo HB20)', categoria: 'popular',
        L: 280, W: 120, color: '#d9dde2', fr: 34, fry: 28, rr: 16, rry: 18,
        cf: 183, rf: 145, rr_x: 42, cr: 15, ci_f: 9, ci_r: 13, ri: 19, wb: 10, rwb: 5,
        wheels_x: [220, 58], wheel_r: 22, head: ['band', 12, 3, 33], tail: ['band', 8, 3, 27],
        b_pillars: [104], door_seams: [173, 104, 52], handles: [148, 90], c_pillar: 12, door_len: 64, door_hinge: 173 });

    car({ id: 'compacto_aventureiro', nome: 'Compacto aventureiro (estilo Kwid)', categoria: 'popular',
        L: 259, W: 116, color: '#ee7b1c', fr: 30, fry: 26, rr: 16, rry: 18,
        cf: 172, rf: 138, rr_x: 38, cr: 14, ci_f: 9, ci_r: 13, ri: 19, wb: 9, rwb: 4,
        wheels_x: [203, 54], wheel_r: 23, head: ['band', 9, 4, 28], tail: ['band', 8, 3, 24],
        b_pillars: [98], door_seams: [163, 98, 50], handles: [140, 86], c_pillar: 12,
        cladding: true, grille: 0.44, rails: ['#2b2b2f', 46, 132], door_len: 60, door_hinge: 163 });

    car({ id: 'quadradinho', nome: 'Quadradinho (estilo Uno)', categoria: 'popular',
        L: 256, W: 113, color: '#2b5fb8', fr: 12, fry: 12, rr: 10, rry: 10, sb: 1, fb: 1.5, rb: 1,
        cf: 188, rf: 164, rr_x: 20, cr: 8, ci_f: 7, ci_r: 9, ri: 15, wb: 5, rwb: 2, roof_r: 6, roof_fb: 1, roof_rb: 0.5,
        wheels_x: [208, 50], wheel_r: 20, head: ['band', 8, 6, 30], tail: ['band', 6, 5, 32],
        b_pillars: [], door_seams: [180, 90], handles: [104], c_pillar: 9, a_pillar: 4,
        bumpers: 'black', bumper_w: 7, grille: 0.4, hood_lines: false, door_len: 86, door_hinge: 180 });

    car({ id: 'hatch_esportivo', nome: 'Hatch esportivo (estilo Golf GTI)', categoria: 'popular', novo: true,
        L: 292, W: 126, color: '#d7141a', roof: '#1d1e22', fr: 30, fry: 28, rr: 16, rry: 18,
        cf: 188, rf: 148, rr_x: 46, cr: 18, ci_f: 10, ci_r: 15, ri: 21, wb: 10, rwb: 5,
        wheels_x: [228, 60], wheel_r: 24, tire_out: 3.5, head: ['band', 13, 3, 28], tail: ['band', 8, 3, 28],
        b_pillars: [], door_seams: [178, 96], handles: [112], c_pillar: 15, grille: 0.5, grille_line: '#e01b24', grille_slots: 6,
        roof_spoiler: true, mirror_color: '#1d1e22', door_len: 86, door_hinge: 178 });

    car({ id: 'mini_eletrico', nome: 'Compacto elétrico (estilo Dolphin Mini)', categoria: 'popular', novo: true,
        L: 250, W: 118, color: '#7cc8c0', color2: '#f2f2ee', roof: 'P2', fr: 40, fry: 36, rr: 26, rry: 28,
        cf: 168, rf: 138, rr_x: 36, cr: 14, ci_f: 10, ci_r: 14, ri: 20, wb: 12, rwb: 6, roof_r: 15,
        wheels_x: [198, 52], wheel_r: 21, head: ['band', 8, 4, 24], tail: ['band', 6, 4, 26], tail_bar: true,
        b_pillars: [100], door_seams: [162, 100, 50], handles: [140, 86], c_pillar: 12, grille: 0, hood_lines: false,
        mirror_color: 'P2', door_len: 60, door_hinge: 162 });

    // ---------------- ANTIGOS (os 4 do pacote + 3 novos)
    car({ id: 'besouro', nome: 'Clássico besouro (estilo Fusca)', categoria: 'antigo',
        L: 283, W: 108, color: '#7fb7d9', body_y0: 9, fr: 62, fry: 34, rr: 58, rry: 36, sb: 1, fb: 4, rb: 4,
        cf: 200, rf: 178, rr_x: 98, cr: 76, ci_f: 17, ci_r: 22, ri: 25, wb: 6, rwb: 8, roof_r: 26, roof_fb: 0, roof_rb: 0,
        fenders: [[228, 18, 40, 16], [228, 90, 40, 16], [64, 18, 44, 17], [64, 90, 44, 17]],
        running_boards: [[110, 188]],
        wheels_x: [228, 64], wheel_r: 23, head: ['round', 0, 0], head_pos: [252, 12, 7.5],
        tail: ['round', 0, 0], tail_pos: [36, 10, 5.5],
        b_pillars: [], door_seams: [196, 132], handles: [146], c_pillar: 6, a_pillar: 4, blade_bumpers: true,
        grille: 0, hood_lines: false, vents: [[16, 40, 68]], rear_lines: [52],
        mirror_x: 200, mirror_out: 8, mirror_color: '#c9ced3', door_len: 60, door_hinge: 196 });

    car({ id: 'seda_classico', nome: 'Sedã clássico (estilo Chevette)', categoria: 'antigo',
        L: 294, W: 110, color: '#9a6b3a', fr: 14, fry: 14, rr: 12, rry: 12, sb: 1, fb: 1.5, rb: 1,
        cf: 186, rf: 160, rr_x: 104, cr: 82, ci_f: 8, ci_r: 10, ri: 16, wb: 5, rwb: 3, roof_r: 6, roof_fb: 1, roof_rb: 1,
        wheels_x: [226, 62], wheel_r: 21, head: ['band', 8, 6, 32], tail: ['band', 6, 4, 36],
        b_pillars: [], door_seams: [180, 100], handles: [114], c_pillar: 10,
        bumpers: 'chrome', bumper_w: 5, grille: 0.42, rear_lines: [70], door_len: 78, door_hinge: 180 });

    car({ id: 'hatch_90', nome: 'Hatch anos 90 (estilo Gol Bolinha)', categoria: 'antigo',
        L: 273, W: 115, color: '#2a8a55', fr: 32, fry: 28, rr: 20, rry: 22,
        cf: 180, rf: 144, rr_x: 38, cr: 14, ci_f: 9, ci_r: 13, ri: 19, wb: 9, rwb: 5, roof_r: 12,
        wheels_x: [214, 56], wheel_r: 21, head: ['band', 10, 4, 30], tail: ['band', 7, 3, 30],
        b_pillars: [], door_seams: [172, 82], handles: [96], c_pillar: 13,
        bumpers: 'black', bumper_w: 5, grille: 0.34, door_len: 86, door_hinge: 172 });

    car({ id: 'hatch_80', nome: 'Hatch anos 80 (estilo Gol Quadrado)', categoria: 'antigo',
        L: 269, W: 112, color: '#e2bd3a', fr: 10, fry: 10, rr: 10, rry: 10, sb: 1, fb: 1, rb: 1,
        cf: 176, rf: 150, rr_x: 36, cr: 12, ci_f: 8, ci_r: 11, ri: 16, wb: 5, rwb: 2, roof_r: 6, roof_fb: 1, roof_rb: 0.5,
        wheels_x: [212, 54], wheel_r: 20, head: ['band', 8, 5, 30], tail: ['band', 6, 4, 38],
        b_pillars: [], door_seams: [170, 82], handles: [96], c_pillar: 12,
        bumpers: 'black', bumper_w: 7, grille: 0.4, hood_lines: false, door_len: 86, door_hinge: 170 });

    car({ id: 'sedan_70', nome: 'Sedã anos 70 (estilo Opala)', categoria: 'antigo', novo: true,
        L: 330, W: 124, color: '#3e6b4f', color2: '#2a2522', roof: 'P2', fr: 12, fry: 12, rr: 10, rry: 10, sb: 1, fb: 1.5, rb: 1,
        cf: 210, rf: 182, rr_x: 112, cr: 88, ci_f: 8, ci_r: 10, ri: 16, wb: 5, rwb: 3, roof_r: 6, roof_fb: 1, roof_rb: 1,
        wheels_x: [262, 70], wheel_r: 22, head: ['round2', 0, 0], head_pos: [320, 13, 6], tail: ['band', 6, 4, 42],
        b_pillars: [], door_seams: [202, 112], handles: [128], c_pillar: 14,
        bumpers: 'chrome', bumper_w: 6, grille: 0.48, grille_chrome: true, grille_slots: 6, rear_lines: [78],
        antenna: [236, 8], door_len: 90, door_hinge: 202 });

    car({ id: 'brasilia', nome: 'Perua compacta anos 70 (estilo Brasília)', categoria: 'antigo', novo: true,
        L: 282, W: 114, color: '#d9b43a', fr: 10, fry: 10, rr: 10, rry: 10, sb: 1, fb: 1, rb: 1,
        cf: 198, rf: 178, rr_x: 22, cr: 10, ci_f: 8, ci_r: 9, ri: 15, wb: 4, rwb: 2, roof_r: 5, roof_fb: 0.5, roof_rb: 0.5,
        wheels_x: [226, 56], wheel_r: 20, head: ['band', 8, 6, 30], tail: ['band', 6, 4, 26],
        b_pillars: [], door_seams: [192, 108], handles: [124], c_pillar: 8, a_pillar: 4,
        bumpers: 'chrome', bumper_w: 5, grille: 0, hood_lines: false, vents: [[8, 42, 72]], door_len: 82, door_hinge: 192 });

    car({ id: 'perua_antiga', nome: 'Perua anos 80 (estilo Caravan)', categoria: 'antigo', novo: true,
        L: 322, W: 118, color: '#8a2a2a', fr: 12, fry: 12, rr: 10, rry: 10, sb: 1, fb: 1.5, rb: 1,
        cf: 206, rf: 182, rr_x: 22, cr: 10, ci_f: 8, ci_r: 9, ri: 16, wb: 5, rwb: 2, roof_r: 6, roof_fb: 1, roof_rb: 0.5,
        wheels_x: [258, 66], wheel_r: 21, head: ['band', 8, 6, 34], tail: ['band', 6, 5, 28],
        b_pillars: [142], door_seams: [200, 142, 82], handles: [168, 110], c_pillar: 10,
        bumpers: 'chrome', bumper_w: 5, grille: 0.46, rails: ['#c9cdd2', 40, 172, [70, 140]], door_len: 70, door_hinge: 200 });

    // ---------------- SUVs (os 3 do pacote + 2 novos)
    car({ id: 'suv_compacto', nome: 'SUV compacto (estilo Creta)', categoria: 'suv',
        L: 301, W: 126, color: '#b9bec5', roof: '#1f2024', fr: 28, fry: 26, rr: 18, rry: 18,
        cf: 198, rf: 160, rr_x: 36, cr: 12, ci_f: 9, ci_r: 13, ri: 20, wb: 9, rwb: 4,
        wheels_x: [236, 64], wheel_r: 25, head: ['band', 8, 4, 32], tail: ['band', 8, 3, 25],
        b_pillars: [110], door_seams: [188, 110, 54], handles: [160, 96], c_pillar: 14,
        cladding: true, grille: 0.5, rails: ['#c9cdd2', 46, 150], door_len: 70, door_hinge: 188 });

    car({ id: 'suv_cupe', nome: 'SUV cupê (estilo HR-V)', categoria: 'suv',
        L: 301, W: 125, color: '#253f86', fr: 30, fry: 28, rr: 20, rry: 20,
        cf: 197, rf: 158, rr_x: 56, cr: 22, ci_f: 9, ci_r: 15, ri: 20, wb: 10, rwb: 6, roof_rb: 4,
        wheels_x: [236, 64], wheel_r: 25, head: ['band', 9, 4, 34], tail: ['band', 7, 3, 30],
        b_pillars: [112], door_seams: [187, 112, 60], handles: [160, 96], c_pillar: 16,
        cladding: true, grille: 0.46, door_len: 70, door_hinge: 187 });

    car({ id: 'suv_quadrado', nome: 'SUV quadrado (estilo Renegade)', categoria: 'suv',
        L: 294, W: 126, color: '#5f7d3e', roof: '#1e1f22', fr: 14, fry: 14, rr: 12, rry: 12, sb: 1, fb: 1.5, rb: 1,
        cf: 212, rf: 186, rr_x: 18, cr: 8, ci_f: 8, ci_r: 9, ri: 16, wb: 5, rwb: 2, roof_r: 7, roof_fb: 1, roof_rb: 0.5,
        wheels_x: [236, 60], wheel_r: 26, head: ['round', 0, 0], head_pos: [284, 16, 9],
        tail: ['band', 6, 5, 28], b_pillars: [118], door_seams: [204, 118, 50], handles: [170, 104], c_pillar: 10,
        cladding: true, grille: 0.5, hood_lines: false, rails: ['#2b2b2f', 30, 176], door_len: 74, door_hinge: 204 });

    car({ id: 'suv_grande', nome: 'SUV grande 7 lugares (estilo SW4)', categoria: 'suv', novo: true,
        L: 340, W: 134, color: '#2b2d33', fr: 24, fry: 24, rr: 16, rry: 16,
        cf: 226, rf: 192, rr_x: 28, cr: 12, ci_f: 9, ci_r: 12, ri: 21, wb: 8, rwb: 3, roof_r: 10,
        wheels_x: [272, 70], wheel_r: 27, head: ['band', 10, 4, 34], tail: ['band', 8, 3, 28],
        b_pillars: [134, 72], door_seams: [216, 134, 72], handles: [188, 116], c_pillar: 14,
        cladding: true, grille: 0.56, grille_chrome: true, grille_slots: 3, rails: ['#2b2b2f', 40, 186], sunroof: [130, 172],
        door_len: 78, door_hinge: 216 });

    car({ id: 'jipe_offroad', nome: 'Jipe off-road (estilo Troller)', categoria: 'suv', novo: true, pad: 22,
        L: 282, W: 130, color: '#d06a1e', roof: '#1e1f22', fr: 8, fry: 8, rr: 8, rry: 8, sb: 0.5, fb: 0.5, rb: 0.5,
        cf: 202, rf: 186, rr_x: 18, cr: 8, ci_f: 8, ci_r: 8, ri: 14, wb: 3, rwb: 1, roof_r: 5, roof_fb: 0.5, roof_rb: 0.5,
        wheels_x: [228, 58], wheel_r: 28, tire_out: 5, head: ['round', 0, 0], head_pos: [272, 19, 9], tail: ['band', 6, 5, 22],
        b_pillars: [], door_seams: [196, 122], handles: [150], c_pillar: 8, a_pillar: 5,
        cladding: 'big', bumpers: 'black', bumper_w: 9, grille: 0.46, grille_slots: 7, hood_lines: false,
        spare: 22, bullbar: 'dark', snorkel: true, rails: ['#2b2b2f', 30, 170, [60, 100, 140]], door_len: 72, door_hinge: 196 });

    // ---------------- TÁXIS (pintura própria)
    const sedan = { L: 308, W: 122, fr: 30, fry: 26, rr: 18, rry: 20,
        cf: 200, rf: 162, rr_x: 98, cr: 76, ci_f: 9, ci_r: 12, ri: 19, wb: 10, rwb: 4,
        wheels_x: [244, 64], wheel_r: 22, head: ['band', 10, 3, 30], tail: ['band', 7, 3, 30],
        b_pillars: [124], door_seams: [192, 124, 68], handles: [170, 110], c_pillar: 12,
        rear_lines: [60], door_len: 66, door_hinge: 192 };
    car(Object.assign({}, sedan, { id: 'taxi_sp', nome: 'Táxi branco (estilo São Paulo)', categoria: 'taxi', color: '#eef0f2', fixed: true,
        taxi_sign: ['#d8a312', '#ffd23a', '#1d1d1d'] }));
    car(Object.assign({}, sedan, { id: 'taxi_rio', nome: 'Táxi amarelo e azul (estilo Rio)', categoria: 'taxi', color: '#f6c526', fixed: true,
        taxi_sign: ['#1f3f9a', '#ffffff', '#1f3f9a'], stripe: ['#1f3f9a', 14, 290, 4.5] }));

    // ---------------- SEDÃS (novos)
    car({ id: 'sedan_popular', nome: 'Sedã compacto (estilo Prisma)', categoria: 'seda', novo: true,
        L: 300, W: 118, color: '#7a8088', fr: 26, fry: 24, rr: 16, rry: 18,
        cf: 192, rf: 154, rr_x: 94, cr: 72, ci_f: 9, ci_r: 12, ri: 19, wb: 9, rwb: 4,
        wheels_x: [238, 62], wheel_r: 21, head: ['band', 10, 4, 28], tail: ['band', 7, 3, 28],
        b_pillars: [118], door_seams: [186, 118, 66], handles: [162, 104], c_pillar: 12, rear_lines: [58], door_len: 64, door_hinge: 186 });

    const medio = { L: 322, W: 126, fr: 34, fry: 28, rr: 22, rry: 22,
        cf: 206, rf: 164, rr_x: 96, cr: 70, ci_f: 9, ci_r: 13, ri: 20, wb: 11, rwb: 6,
        wheels_x: [254, 66], wheel_r: 23, head: ['band', 12, 3, 32], tail: ['band', 8, 3, 30],
        b_pillars: [126], door_seams: [198, 126, 72], handles: [172, 112], c_pillar: 14, rear_lines: [56],
        grille: 0.44, grille_chrome: true, grille_slots: 3, door_len: 68, door_hinge: 198 };
    car(Object.assign({}, medio, { id: 'sedan_medio', nome: 'Sedã médio (estilo Corolla)', categoria: 'seda', novo: true, color: '#e9e7e1' }));

    car({ id: 'sedan_luxo', nome: 'Sedã executivo (estilo Classe E)', categoria: 'seda', novo: true,
        L: 352, W: 132, color: '#15161a', fr: 30, fry: 26, rr: 22, rry: 22,
        cf: 228, rf: 186, rr_x: 108, cr: 84, ci_f: 10, ci_r: 13, ri: 21, wb: 10, rwb: 6,
        wheels_x: [286, 72], wheel_r: 24, head: ['band', 11, 3, 30], tail: ['band', 8, 3, 34],
        b_pillars: [140], door_seams: [220, 140, 80], handles: [192, 124], c_pillar: 15, rear_lines: [66],
        grille: 0.42, grille_chrome: true, grille_slots: 5, sunroof: [128, 168], door_len: 76, door_hinge: 220 });

    // ---------------- ESPORTIVOS e SUPERESPORTIVOS (novos)
    car({ id: 'esportivo', nome: 'Cupê esportivo (estilo M3)', categoria: 'esportivo', novo: true,
        L: 318, W: 132, color: '#1e56c8', color2: '#f4f1e8', fr: 30, fry: 26, rr: 20, rry: 22,
        cf: 200, rf: 160, rr_x: 100, cr: 72, ci_f: 12, ci_r: 16, ri: 24, wb: 10, rwb: 8, roof_r: 12,
        wheels_x: [252, 64], wheel_r: 25, tire_out: 4, head: ['band', 13, 3, 30], tail: ['band', 9, 3, 30],
        b_pillars: [], door_seams: [190, 110], handles: [126], c_pillar: 18, grille: 0, kidney: true,
        racing: ['P2', 12, 8], spoiler: [8, 10, 'P'], hood_vents: [[236, 26, 14]], door_len: 96, door_hinge: 190 });

    car({ id: 'muscle', nome: 'Muscle car (estilo Mustang)', categoria: 'esportivo', novo: true,
        L: 336, W: 134, color: '#f0cf2a', color2: '#16161a', fr: 20, fry: 18, rr: 14, rry: 14, sb: 1.5, fb: 2, rb: 1,
        cf: 198, rf: 166, rr_x: 92, cr: 64, ci_f: 12, ci_r: 16, ri: 24, wb: 7, rwb: 6, roof_r: 10,
        wheels_x: [272, 66], wheel_r: 26, tire_out: 4, head: ['band', 10, 4, 26], tail: ['band', 8, 5, 42],
        b_pillars: [], door_seams: [188, 104], handles: [120], c_pillar: 24, grille: 0.52, grille_slots: 5,
        racing: ['P2', 15, 9], hood_scoop: [228, 272, 30], spoiler: [6, 7, 'P'], door_len: 100, door_hinge: 188 });

    car({ id: 'super', nome: 'Superesportivo (estilo Ferrari)', categoria: 'super', novo: true,
        L: 322, W: 140, color: '#d7141a', fr: 44, fry: 40, rr: 28, rry: 26, sb: 3, fb: 4, rb: 2,
        cf: 198, rf: 166, rr_x: 126, cr: 104, ci_f: 16, ci_r: 24, ri: 32, wb: 14, rwb: 6, roof_r: 14,
        wheels_x: [262, 62], wheel_r: 26, tire_out: 4.5, head: ['band', 12, 2, 24], tail: ['round2', 0, 0], tail_pos: [7, 20, 6],
        b_pillars: [], door_seams: [192, 130], handles: [], c_pillar: 0, grille: 0.5, grille_slots: 6,
        engine_cover: [36, 100, 34, false], side_intakes: [112, 152], hood_vents: [[232, 34, 16]], hood_lines: true,
        mirror_x: 188, door_len: 70, door_hinge: 192 });

    car({ id: 'super2', nome: 'Superesportivo em cunha (estilo Lamborghini)', categoria: 'super', novo: true,
        L: 328, W: 144, color: '#5fd02a', fr: 34, fry: 42, rr: 16, rry: 20, sb: 4, fb: 2, rb: 1,
        cf: 208, rf: 178, rr_x: 130, cr: 110, ci_f: 18, ci_r: 26, ri: 34, wb: 10, rwb: 4, roof_r: 10,
        wheels_x: [268, 62], wheel_r: 27, tire_out: 5, head: ['band', 14, 2, 22], tail: ['band', 5, 2, 44],
        b_pillars: [], door_seams: [200, 132], handles: [], c_pillar: 0, grille: 0.62, grille_slots: 8,
        engine_cover: [32, 106, 30, true], side_intakes: [114, 160], spoiler: [10, 12, '#1a1a1d'], hood_lines: true,
        mirror_x: 198, door_len: 72, door_hinge: 200 });

    // ---------------- PICAPES (novas)
    car({ id: 'picape_pequena', nome: 'Picape pequena (estilo Strada)', categoria: 'picape', novo: true,
        L: 316, W: 122, color: '#e8eaf0', fr: 28, fry: 26, rr: 10, rry: 12,
        cf: 208, rf: 170, rr_x: 126, cr: 114, ci_f: 9, ci_r: 10, ri: 19, wb: 10, rwb: 2, roof_r: 8,
        bed: { x0: 6, x1: 110, inset: 9 },
        wheels_x: [252, 64], wheel_r: 22, head: ['band', 10, 3, 28], tail: ['band', 5, 4, 22],
        b_pillars: [], door_seams: [200, 130], handles: [144], c_pillar: 6, door_len: 72, door_hinge: 200 });

    car({ id: 'picape_media', nome: 'Picape cabine dupla (estilo Hilux)', categoria: 'picape', novo: true,
        L: 372, W: 134, color: '#9aa1aa', fr: 24, fry: 24, rr: 10, rry: 10,
        cf: 252, rf: 216, rr_x: 130, cr: 120, ci_f: 9, ci_r: 10, ri: 20, wb: 8, rwb: 2, roof_r: 8,
        bed: { x0: 6, x1: 114, inset: 10, rollbar: true },
        wheels_x: [298, 72], wheel_r: 27, head: ['band', 10, 3, 32], tail: ['band', 5, 4, 24],
        b_pillars: [172], door_seams: [244, 172, 126], handles: [214, 152], c_pillar: 6,
        cladding: true, grille: 0.56, grille_chrome: true, grille_slots: 3, door_len: 72, door_hinge: 244 });

    car({ id: 'picape_grande', nome: 'Picape grande (estilo F-250)', categoria: 'picape', novo: true,
        L: 394, W: 144, color: '#7a1f36', fr: 14, fry: 14, rr: 8, rry: 8, sb: 1, fb: 1.5, rb: 0.5,
        cf: 270, rf: 238, rr_x: 152, cr: 142, ci_f: 10, ci_r: 10, ri: 22, wb: 5, rwb: 2, roof_r: 6,
        bed: { x0: 6, x1: 136, inset: 11, cover: true },
        wheels_x: [320, 76], wheel_r: 29, head: ['band', 9, 6, 36], tail: ['band', 5, 4, 26],
        b_pillars: [198], door_seams: [262, 198, 148], handles: [234, 176], c_pillar: 6,
        bumpers: 'chrome', bumper_w: 8, grille: 0.62, grille_chrome: true, grille_slots: 4, door_len: 76, door_hinge: 262 });

    // ---------------- VANS (novas)
    car({ id: 'van_furgao', nome: 'Furgão (estilo Sprinter)', categoria: 'van', novo: true,
        L: 394, W: 140, color: '#eef0f3', fr: 30, fry: 30, rr: 8, rry: 8, sb: 1, fb: 2, rb: 0.5,
        cf: 334, rf: 302, rr_x: 10, cr: 6, ci_f: 10, ci_r: 10, ri: 12, wb: 10, rwb: 1, roof_r: 8, roof_fb: 2, roof_rb: 0.5,
        cargo: 272, roof_ribs: true,
        wheels_x: [332, 70], wheel_r: 25, head: ['band', 11, 3, 32], tail: ['band', 5, 4, 30],
        b_pillars: [], door_seams: [326, 272, 196], handles: [302, 248], c_pillar: 0,
        bumpers: 'black', bumper_w: 6, grille: 0.48, hood_lines: false, door_len: 66, door_hinge: 326 });

    car({ id: 'kombi', nome: 'Kombi (estilo VW Kombi)', categoria: 'van', novo: true,
        L: 316, W: 124, color: '#2cb5a8', color2: '#f6f3ec', roof: 'P2', fr: 18, fry: 34, rr: 18, rry: 26, sb: 1, fb: 6, rb: 2,
        cf: 294, rf: 270, rr_x: 16, cr: 8, ci_f: 8, ci_r: 10, ri: 15, wb: 7, rwb: 2, roof_r: 16, roof_fb: 4, roof_rb: 2,
        wheels_x: [262, 56], wheel_r: 20, head: ['round', 0, 0], head_pos: [304, 22, 8], tail: ['round', 0, 0], tail_pos: [8, 16, 5],
        b_pillars: [], door_seams: [288, 222, 152], handles: [270, 206], c_pillar: 0, a_pillar: 4,
        bumpers: 'chrome', bumper_w: 5, grille: 0, hood_lines: false, vents: [[22, 26, 40], [22, 84, 98]],
        mirror_x: 296, door_len: 60, door_hinge: 288 });

    car({ id: 'minivan', nome: 'Minivan (estilo Spin)', categoria: 'van', novo: true,
        L: 322, W: 126, color: '#6e2232', fr: 30, fry: 28, rr: 12, rry: 14,
        cf: 228, rf: 194, rr_x: 26, cr: 10, ci_f: 9, ci_r: 11, ri: 20, wb: 9, rwb: 3, roof_r: 10,
        wheels_x: [258, 62], wheel_r: 22, head: ['band', 10, 3, 30], tail: ['band', 7, 4, 28],
        b_pillars: [150, 82], door_seams: [220, 150, 82], handles: [194, 126], c_pillar: 12,
        rails: ['#2b2b2f', 40, 182], door_len: 70, door_hinge: 220 });

    // ---------------- FORÇAS (pintura própria): viatura, SWAT, exército
    car(Object.assign({}, medio, { id: 'viatura', nome: 'Viatura da polícia', categoria: 'forca', novo: true, fixed: true,
        color: '#eef0f3', door_color: '#22272f', panels: [{ x0: 66, x1: 200, color: '#22272f', edge: '#d8202a' }],
        lightbar: [130, 20, 52], grille: 0.44, grille_chrome: false, bullbar: 'dark', pad: 16,
        texts: [{ str: 'POLÍCIA', x: 262, size: 13, color: '#1b2a6b' }, { str: '190', x: 40, size: 12, color: '#1b2a6b' }] }));

    car({ id: 'swat_van', nome: 'Blindado tático (SWAT)', categoria: 'forca', novo: true, fixed: true, pad: 18,
        L: 394, W: 144, color: '#1c1f24', door_color: '#1c1f24', fr: 22, fry: 22, rr: 8, rry: 8, sb: 0.5, fb: 1, rb: 0.5,
        cf: 326, rf: 300, rr_x: 12, cr: 6, ci_f: 12, ci_r: 12, ri: 14, wb: 6, rwb: 1, roof_r: 6, roof_fb: 1, roof_rb: 0.5,
        cargo: 270, roof_ribs: true, roof_hatch: [150, 190], lightbar: [282, 16, 64],
        wheels_x: [326, 72], wheel_r: 28, tire_out: 4, head: ['band', 9, 4, 30], tail: ['band', 5, 4, 30],
        b_pillars: [], door_seams: [318, 270], handles: [296], c_pillar: 0, cladding: 'big',
        bumpers: 'black', bumper_w: 9, grille: 0.5, grille_slots: 6, hood_lines: false, bullbar: 'dark',
        texts: [{ str: 'TÁTICO', x: 92, size: 18, color: '#c8ced8', sp: 2 }], door_len: 66, door_hinge: 318 });

    car({ id: 'militar', nome: 'Jipe do exército (estilo Marruá)', categoria: 'forca', novo: true, fixed: true, pad: 22,
        L: 300, W: 138, color: '#566338', door_color: '#566338', canvas_top: '#4a5233', fr: 8, fry: 8, rr: 8, rry: 8, sb: 0.5, fb: 0.5, rb: 0.5,
        cf: 210, rf: 196, rr_x: 22, cr: 10, ci_f: 9, ci_r: 9, ri: 13, wb: 3, rwb: 1, roof_r: 4, roof_fb: 0.5, roof_rb: 0.5,
        wheels_x: [242, 60], wheel_r: 30, tire_out: 5, head: ['round', 0, 0], head_pos: [290, 20, 8], tail: ['band', 5, 5, 20],
        b_pillars: [], door_seams: [204, 128], handles: [], c_pillar: 0, a_pillar: 5,
        cladding: 'big', bumpers: 'black', bumper_w: 10, grille: 0.5, grille_slots: 8, hood_lines: false,
        spare: 22, bullbar: 'dark', star: [252, 69, 14, '#e8e4d0'], door_len: 72, door_hinge: 204 });

    return { S, CARS, HMAX, carSVG, heightSVG, heightsOf, doorSVG, damageSVG, damageMarks, mix, light, dark, rgb, hex, rng, hashStr, rrect, poly, f };
})();

if (typeof module !== 'undefined') module.exports = CarGen;
