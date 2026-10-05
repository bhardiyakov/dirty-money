// ============================================================================
// Veículos que não são carros — moto, bicicleta, jet ski, lancha e barco — desenhados no MESMO estilo dos carros (gerador.js):
// vista de cima, frente para a DIREITA, 70 px = 1 m, degradê na pintura, contorno escuro fino e brilho no alto. Entram no mesmo atlas
// (assets/cars/carros-atlas.js), com a mesma conta de pintura (cor = K + M1·P + M2·P2) e as 3 fases de amassado; o jogo desenha todos
// no lote único dos carros (CarArt/CarBatch).
//
// Moto e bicicleta também têm o desenho CAÍDAS DE LADO (`*_caida`): de cima vê-se o perfil, com as rodas redondas.
// O piloto NÃO faz parte do desenho: é o sprite do personagem (atlas dos personagens, clipes ride_*) desenhado por cima.
//
// Cada modelo é { id, nome, categoria, L, W, pad, color, color2, lamps, custom: { draw(P, P2, g), clip, glass?, marks } }:
//   draw   devolve { defs, body } (SVG no sistema do desenho, já sem o deslocamento da margem)
//   clip   silhueta (onde as marcas de batida podem aparecer)
//   marks  marcas de dano em 3 fases (mesmo formato do damageMarks dos carros)
// ============================================================================

(() => {
    const G = CarGen, { light, dark, mix, f, rrect, poly } = G;
    const ell = (cx, cy, rx, ry) => `M${f(cx - rx)},${f(cy)} a${f(rx)},${f(ry)} 0 1,0 ${f(2 * rx)},0 a${f(rx)},${f(ry)} 0 1,0 ${f(-2 * rx)},0 Z`;

    // Degradês comuns (ids únicos por desenho: prefixo `g`).
    const grads = (g, P, P2, W) => `
  <linearGradient id="${g}paint" x1="0" y1="0" x2="0" y2="${W}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${light(P, 0.32)}"/><stop offset="0.18" stop-color="${light(P, 0.08)}"/>
    <stop offset="0.5" stop-color="${P}"/><stop offset="0.82" stop-color="${dark(P, 0.14)}"/><stop offset="1" stop-color="${dark(P, 0.34)}"/></linearGradient>
  <linearGradient id="${g}paint2" x1="0" y1="0" x2="0" y2="${W}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${light(P2, 0.3)}"/><stop offset="0.5" stop-color="${P2}"/><stop offset="1" stop-color="${dark(P2, 0.3)}"/></linearGradient>
  <linearGradient id="${g}seat" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a4d55"/><stop offset="0.45" stop-color="#2c2e34"/><stop offset="1" stop-color="#17181c"/></linearGradient>
  <linearGradient id="${g}chrome" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f4f6f8"/><stop offset="0.5" stop-color="#a9afb6"/><stop offset="1" stop-color="#e3e6ea"/></linearGradient>
  <linearGradient id="${g}tire" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3a3b40"/><stop offset="0.5" stop-color="#1b1b1f"/><stop offset="1" stop-color="#0e0e10"/></linearGradient>
  <linearGradient id="${g}glass" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#2c333c"/><stop offset="0.5" stop-color="#1a1f26"/><stop offset="1" stop-color="#4a5562"/></linearGradient>
  <linearGradient id="${g}deck" x1="0" y1="0" x2="0" y2="${W}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#fbf8f0"/><stop offset="0.5" stop-color="#ebe6d8"/><stop offset="1" stop-color="#cfc8b6"/></linearGradient>
  <linearGradient id="${g}head" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bfe9f7"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
  <radialGradient id="${g}shine" cx="0.5" cy="0.35" r="0.6">
    <stop offset="0" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;

    // Pneu visto de cima (faixa escura com a banda de rodagem).
    const tireTop = (g, x0, x1, y0, y1) => `<rect x="${f(x0)}" y="${f(y0)}" width="${f(x1 - x0)}" height="${f(y1 - y0)}" rx="${f((y1 - y0) / 2)}" fill="url(#${g}tire)" stroke="#0a0a0c" stroke-width="0.8"/>` +
        Array.from({ length: Math.floor((x1 - x0) / 5) - 1 }, (_, k) => `<line x1="${f(x0 + 4 + k * 5)}" y1="${f(y0 + 1)}" x2="${f(x0 + 4 + k * 5)}" y2="${f(y1 - 1)}" stroke="#2f3035" stroke-width="0.8"/>`).join('');

    // Roda de perfil (moto/bicicleta caídas): pneu, aro e cubo; spokes = raios da bicicleta.
    const wheelSide = (g, cx, cy, r, tire, spokes) => {
        let s = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="#151518" stroke-width="${f(tire)}"/>`;
        s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r - tire / 2 - 0.6)}" fill="none" stroke="url(#${g}chrome)" stroke-width="1.6"/>`;
        if (spokes) for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; s += `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(cx + Math.cos(a) * (r - tire / 2))}" y2="${f(cy + Math.sin(a) * (r - tire / 2))}" stroke="#b9bec6" stroke-width="0.6"/>`; }
        else { s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r - tire / 2 - 1.5)}" fill="#2a2b30"/>`; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; s += `<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(cx + Math.cos(a) * (r - tire))}" y2="${f(cy + Math.sin(a) * (r - tire))}" stroke="url(#${g}chrome)" stroke-width="2.2" stroke-linecap="round"/>`; } }
        s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(Math.max(2, r * 0.14))}" fill="url(#${g}chrome)" stroke="#55585e" stroke-width="0.6"/>`;
        return s;
    };

    // Marcas de batida genéricas (arranhões, mossas, amassados grandes) dentro da caixa do desenho. Formato igual ao damageMarks.
    const genericMarks = (c, extra) => {
        const R = G.rng(G.hashStr(c.id)), L = c.L, W = c.W, M = [];
        const add = (lv, kind, a, d, soft = 0, glass = false) => M.push({ lv, kind, a, d, soft, glass });
        const rnd = (a, b) => a + (b - a) * R();
        const line = (pts, w) => `<path d="M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' L')}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
        const blob = (cx, cy, rx, ry, rot = 0) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})" fill="#000" stroke="#000" stroke-width="0"/>`;
        const s = Math.max(0.35, Math.min(1.6, W / 120));                       // escala das marcas (moto pequena × barco grande)
        for (let k = 0; k < 3; k++) { const x = rnd(L * 0.15, L * 0.75), y = rnd(W * 0.2, W * 0.8); add(1, 'light', 0.5, line([[x, y], [x + rnd(10, 30) * s, y + rnd(-4, 4) * s]], 1.1)); }
        add(1, 'dark', 0.3, blob(rnd(L * 0.2, L * 0.4), W * rnd(0.25, 0.75), 10 * s, 6 * s, rnd(-20, 20)), 3 * s);
        add(2, 'dark', 0.42, blob(L * rnd(0.7, 0.85), W * rnd(0.35, 0.65), L * 0.09, W * 0.16, rnd(-20, 20)), 4 * s);
        add(2, 'dark', 0.36, blob(L * rnd(0.3, 0.5), W * (R() < 0.5 ? 0.2 : 0.8), L * 0.12, W * 0.1, rnd(-10, 10)), 3 * s);
        for (let k = 0; k < 2; k++) { const x = rnd(L * 0.3, L * 0.9), y = rnd(W * 0.2, W * 0.8); add(2, 'light', 0.45, line([[x, y], [x + 8 * s, y + 3 * s], [x + 16 * s, y - 2 * s], [x + 26 * s, y + 2 * s]], 1.1)); }
        add(3, 'dark', 0.55, blob(L * 0.95, W * 0.5, L * 0.12, W * 0.42), 6 * s);
        add(3, 'dark', 0.4, blob(L * rnd(0.4, 0.6), W * rnd(0.4, 0.6), L * 0.16, W * 0.22, rnd(-20, 20)), 5 * s);
        add(3, 'dark', 0.45, blob(L * 0.05, W * (R() < 0.5 ? 0.25 : 0.75), L * 0.08, W * 0.2), 4 * s);
        for (let k = 0; k < 3; k++) { const x = rnd(L * 0.2, L * 0.9); add(3, 'light', 0.35, line([[x, W * 0.15], [x - 4 * s, W * 0.5], [x + 3 * s, W * 0.85]], 1.0)); }
        if (extra) extra(add, rnd, line, blob);
        return M;
    };

    const V = [];
    const veh = (kw) => { kw.novo = true; kw.noDoor = true; V.push(kw); return kw; };

    // ================================================================== MOTO (Rider 250) — 2,14 × 0,83 m
    veh({ id: 'moto', nome: 'Moto (Rider 250)', categoria: 'duas_rodas', kind: 'bike', L: 150, W: 58, pad: 8, color: '#c8202e', color2: '#f4f1e8',
        lamps: { x: 0.0, zF: 0.95, zR: -1.0 },
        custom: {
            clip: rrect(2, 148, 12, 46, 10),
            marks: (c) => genericMarks(c),
            draw(P, P2, g) {
                const W = 58, cy = 29, st = dark(P, 0.45), o = [];
                o.push(tireTop(g, 2, 38, cy - 6.5, cy + 6.5));                                                     // pneu traseiro (largo)
                o.push(tireTop(g, 112, 148, cy - 5, cy + 5));                                                      // pneu dianteiro
                o.push(`<path d="M18,${cy + 9} L74,${cy + 9} Q78,${cy + 12} 74,${cy + 15} L18,${cy + 15} Q12,${cy + 12} 18,${cy + 9} Z" fill="url(#${g}chrome)" stroke="#5a5e65" stroke-width="0.8"/>`);   // escapamento (direita)
                o.push(`<circle cx="16" cy="${cy + 12}" r="3" fill="#1a1a1d" stroke="#5a5e65" stroke-width="0.6"/>`);
                o.push(`<path d="${rrect(60, 98, cy - 14, cy + 14, 6)}" fill="#2a2c31" stroke="#0e0f11" stroke-width="1"/>`);    // motor
                for (let k = 0; k < 5; k++) o.push(`<line x1="${66 + k * 6}" y1="${cy - 12}" x2="${66 + k * 6}" y2="${cy + 12}" stroke="#4a4d54" stroke-width="1.2"/>`);
                o.push(`<path d="M6,${cy - 7} Q4,${cy} 6,${cy + 7} L44,${cy + 8} Q52,${cy} 44,${cy - 8} Z" fill="url(#${g}paint)" stroke="${st}" stroke-width="1.2"/>`);   // rabeta
                o.push(`<rect x="3" y="${cy - 4}" width="5" height="8" rx="2" fill="#d8202a" stroke="#5a1010" stroke-width="0.7"/>`);   // lanterna
                o.push(`<path d="${ell(52, cy, 14, 15)}" fill="url(#${g}paint)" stroke="${st}" stroke-width="1"/>`);                    // tampas laterais
                o.push(`<path d="${rrect(32, 86, cy - 10, cy + 10, 9, 2, 3)}" fill="url(#${g}seat)" stroke="#0d0e10" stroke-width="1"/>`);  // banco
                o.push(`<line x1="40" y1="${cy}" x2="80" y2="${cy}" stroke="#4a4d55" stroke-width="0.8" stroke-dasharray="2 2"/>`);
                o.push(`<path d="${ell(98, cy, 19, 15)}" fill="url(#${g}paint)" stroke="${st}" stroke-width="1.3"/>`);                  // tanque
                o.push(`<path d="M82,${cy - 2.5} L114,${cy - 2.5} L114,${cy + 2.5} L82,${cy + 2.5} Z" fill="${P2}" opacity="0.95"/>`);  // faixa (pintura 2)
                o.push(`<ellipse cx="96" cy="${cy - 6}" rx="11" ry="5" fill="url(#${g}shine)"/>`);
                o.push(`<circle cx="90" cy="${cy}" r="2.6" fill="url(#${g}chrome)" stroke="#55585e" stroke-width="0.5"/>`);             // tampa do tanque
                for (const s of [-1, 1]) o.push(`<line x1="110" y1="${cy + s * 6}" x2="124" y2="${cy + s * 6}" stroke="url(#${g}chrome)" stroke-width="2.4" stroke-linecap="round"/>`);   // garfo
                o.push(`<path d="${rrect(116, 146, cy - 6, cy + 6, 5)}" fill="url(#${g}paint)" stroke="${st}" stroke-width="1"/>`);   // paralama
                o.push(`<path d="${ell(124, cy, 5, 7.5)}" fill="url(#${g}head)" stroke="#40505a" stroke-width="0.9"/><circle cx="125.5" cy="${cy - 2}" r="2" fill="#fff"/>`);   // farol
                o.push(`<path d="${rrect(103, 112, cy - 7, cy + 7, 2.5)}" fill="#18191c" stroke="#08080a" stroke-width="0.6"/><rect x="105" y="${cy - 4}" width="5" height="8" rx="1" fill="#2f8fa8" opacity="0.8"/>`);   // painel
                o.push(`<path d="M116,4 Q111,${cy} 116,${W - 4}" fill="none" stroke="#1e1f23" stroke-width="3.2" stroke-linecap="round"/>`);   // guidão
                for (const y of [4, W - 12]) o.push(`<rect x="111" y="${y}" width="7" height="8" rx="2.5" fill="#101114"/>`);
                for (const y of [9, W - 9]) o.push(`<line x1="114" y1="${y}" x2="119" y2="${y + (y < cy ? -3 : 3)}" stroke="#3a3c42" stroke-width="1.2"/><ellipse cx="120" cy="${y + (y < cy ? -4.5 : 4.5)}" rx="2.6" ry="3.6" fill="url(#${g}chrome)" stroke="#44474d" stroke-width="0.6"/>`);   // retrovisores
                return { defs: grads(g, P, P2, W), body: o.join('') };
            },
        } });

    // MOTO CAÍDA de lado (perfil). Deitada sobre a esquerda: o alto da moto (banco, tanque) aponta para y pequeno.
    veh({ id: 'moto_caida', nome: 'Moto caída', categoria: 'duas_rodas', kind: 'bike', L: 150, W: 76, pad: 8, color: '#c8202e', color2: '#f4f1e8',
        lamps: { x: 0.0, zF: 0.95, zR: -1.0 },
        custom: {
            clip: rrect(2, 148, 4, 74, 12),
            marks: (c) => genericMarks(c),
            draw(P, P2, g) {
                const W = 76, st = dark(P, 0.45), o = [];
                o.push(wheelSide(g, 26, 50, 23, 7, false));
                o.push(wheelSide(g, 124, 50, 22, 6, false));
                o.push(`<path d="M30,64 L84,64 Q90,68 84,72 L30,72 Q24,68 30,64 Z" fill="url(#${g}chrome)" stroke="#5a5e65" stroke-width="0.8"/>`);   // escapamento
                o.push(`<path d="${rrect(56, 96, 38, 64, 7)}" fill="#2a2c31" stroke="#0e0f11" stroke-width="1"/>`);                       // motor
                for (let k = 0; k < 5; k++) o.push(`<line x1="${62 + k * 6}" y1="40" x2="${62 + k * 6}" y2="62" stroke="#4a4d54" stroke-width="1.2"/>`);
                o.push(`<line x1="26" y1="50" x2="64" y2="46" stroke="#3a3c42" stroke-width="5" stroke-linecap="round"/>`);              // balança
                o.push(`<path d="M6,22 Q10,18 18,18 L50,22 L52,32 L20,34 Q8,32 6,22 Z" fill="url(#${g}paint)" stroke="${st}" stroke-width="1.2"/>`);   // rabeta
                o.push(`<rect x="3" y="20" width="5" height="7" rx="2" fill="#d8202a" stroke="#5a1010" stroke-width="0.6"/>`);
                o.push(`<path d="M34,22 Q36,16 46,16 L84,18 Q90,20 86,26 L38,28 Q33,27 34,22 Z" fill="url(#${g}seat)" stroke="#0d0e10" stroke-width="1"/>`);   // banco
                o.push(`<path d="M80,30 Q80,14 96,12 L110,14 Q118,18 114,30 Q104,40 90,40 Q80,38 80,30 Z" fill="url(#${g}paint)" stroke="${st}" stroke-width="1.3"/>`);   // tanque
                o.push(`<path d="M84,24 L114,22 L114,26 L84,28 Z" fill="${P2}" opacity="0.95"/>`);
                o.push(`<ellipse cx="96" cy="20" rx="10" ry="4" fill="url(#${g}shine)"/>`);
                o.push(`<line x1="114" y1="16" x2="124" y2="50" stroke="url(#${g}chrome)" stroke-width="4" stroke-linecap="round"/>`);    // garfo
                o.push(`<path d="M106,30 Q118,24 140,34 L142,40 Q122,34 108,38 Z" fill="url(#${g}paint)" stroke="${st}" stroke-width="1"/>`);   // paralama
                o.push(`<circle cx="124" cy="14" r="6" fill="url(#${g}head)" stroke="#40505a" stroke-width="0.9"/>`);                    // farol
                o.push(`<line x1="110" y1="4" x2="116" y2="16" stroke="#1e1f23" stroke-width="3.2" stroke-linecap="round"/><rect x="106" y="1" width="8" height="6" rx="2" fill="#101114"/>`);   // guidão
                return { defs: grads(g, P, P2, W), body: o.join('') };
            },
        } });

    // ================================================================== BICICLETA (Urbana BMX) — 1,74 × 0,63 m
    veh({ id: 'bicicleta', nome: 'Bicicleta (Urbana)', categoria: 'duas_rodas', kind: 'bike', L: 122, W: 44, pad: 8, color: '#2f86d0', color2: '#f4f1e8',
        lamps: { x: 0.0, zF: 0.8, zR: -0.85 },
        custom: {
            clip: rrect(2, 120, 14, 30, 6),
            marks: (c) => genericMarks(c),
            draw(P, P2, g) {
                const W = 44, cy = 22, st = dark(P, 0.45), o = [];
                o.push(tireTop(g, 2, 36, cy - 2.4, cy + 2.4));
                o.push(tireTop(g, 86, 120, cy - 2.2, cy + 2.2));
                for (const s of [-1, 1]) o.push(`<line x1="18" y1="${cy + s * 3}" x2="50" y2="${cy + s * 1.6}" stroke="url(#${g}paint)" stroke-width="2" stroke-linecap="round"/>`);   // garfo traseiro
                o.push(`<circle cx="52" cy="${cy + 4}" r="5" fill="none" stroke="url(#${g}chrome)" stroke-width="1.8"/>`);              // coroa
                o.push(`<line x1="18" y1="${cy + 3}" x2="50" y2="${cy + 8}" stroke="#3a3c42" stroke-width="1" stroke-dasharray="1.5 1"/>`);   // corrente
                o.push(`<line x1="38" y1="${cy}" x2="90" y2="${cy}" stroke="${st}" stroke-width="5.2" stroke-linecap="round"/>`);          // quadro
                o.push(`<line x1="38" y1="${cy}" x2="90" y2="${cy}" stroke="url(#${g}paint)" stroke-width="3.8" stroke-linecap="round"/>`);
                o.push(`<line x1="44" y1="${cy - 1}" x2="84" y2="${cy - 1}" stroke="${P2}" stroke-width="1" opacity="0.9"/>`);         // filete (pintura 2)
                for (const s of [-1, 1]) o.push(`<line x1="92" y1="${cy + s * 2.6}" x2="104" y2="${cy + s * 2.6}" stroke="url(#${g}chrome)" stroke-width="1.6" stroke-linecap="round"/>`);   // garfo
                o.push(`<rect x="86" y="${cy - 3.5}" width="7" height="7" rx="2" fill="#2a2c31"/>`);                                 // caixa de direção
                o.push(`<path d="M24,${cy - 5.5} Q22,${cy} 24,${cy + 5.5} L36,${cy + 4} L46,${cy + 1.6} L46,${cy - 1.6} L36,${cy - 4} Z" fill="url(#${g}seat)" stroke="#0b0b0d" stroke-width="0.8"/>`);   // selim
                o.push(`<path d="M92,3 Q86,${cy} 92,${W - 3}" fill="none" stroke="#1e1f23" stroke-width="2.6" stroke-linecap="round"/>`);   // guidão
                for (const y of [2, W - 9]) o.push(`<rect x="88" y="${y}" width="6" height="7" rx="2.5" fill="#101114"/>`);
                o.push(`<rect x="1" y="${cy - 2}" width="3" height="4" rx="1" fill="#d8202a"/>`);                                    // refletor
                return { defs: grads(g, P, P2, W), body: o.join('') };
            },
        } });

    veh({ id: 'bicicleta_caida', nome: 'Bicicleta caída', categoria: 'duas_rodas', kind: 'bike', L: 124, W: 70, pad: 8, color: '#2f86d0', color2: '#f4f1e8',
        lamps: { x: 0.0, zF: 0.8, zR: -0.85 },
        custom: {
            clip: rrect(2, 122, 2, 68, 10),
            marks: (c) => genericMarks(c),
            draw(P, P2, g) {
                const W = 70, st = dark(P, 0.45), o = [];
                o.push(wheelSide(g, 24, 46, 21, 3.6, true));
                o.push(wheelSide(g, 100, 46, 21, 3.6, true));
                const BB = [54, 50], ST = [44, 18], HT = [88, 18], HB = [91, 28], RA = [24, 46];
                const tube = (a, b, w = 4.2) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${st}" stroke-width="${w + 1.4}" stroke-linecap="round"/><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="url(#${g}paint)" stroke-width="${w}" stroke-linecap="round"/>`;
                o.push(tube(RA, BB, 2.6), tube(RA, ST, 2.4), tube(BB, ST), tube(ST, HT), tube(BB, HB));
                o.push(`<line x1="${HB[0]}" y1="${HB[1]}" x2="100" y2="46" stroke="url(#${g}chrome)" stroke-width="2.6" stroke-linecap="round"/>`);   // garfo
                o.push(`<circle cx="${BB[0]}" cy="${BB[1]}" r="6" fill="none" stroke="url(#${g}chrome)" stroke-width="2"/><line x1="${BB[0]}" y1="${BB[1]}" x2="${BB[0] + 7}" y2="${BB[1] + 9}" stroke="#3a3c42" stroke-width="2"/><rect x="${BB[0] + 4}" y="${BB[1] + 8}" width="8" height="3" rx="1" fill="#16171a"/>`);   // pedivela
                o.push(`<line x1="44" y1="18" x2="42" y2="10" stroke="#3a3c42" stroke-width="2.4"/><path d="M30,10 Q30,6 36,6 L52,8 Q54,10 50,12 L34,13 Q30,13 30,10 Z" fill="url(#${g}seat)" stroke="#0b0b0d" stroke-width="0.8"/>`);   // selim
                o.push(`<line x1="88" y1="18" x2="84" y2="6" stroke="#2a2c31" stroke-width="2.4"/><line x1="78" y1="5" x2="94" y2="5" stroke="#1e1f23" stroke-width="2.6" stroke-linecap="round"/>`);   // guidão
                return { defs: grads(g, P, P2, W), body: o.join('') };
            },
        } });

    // ================================================================== JET SKI (Aqua Rider 300) — 3,0 × 1,1 m
    const jetHull = 'M8,5 Q2,5 2,12 L2,66 Q2,73 8,73 L108,75 Q172,72 208,39 Q172,6 108,3 Z';
    veh({ id: 'jetski', nome: 'Jet ski (Aqua Rider 300)', categoria: 'barco', kind: 'boat', L: 210, W: 78, pad: 10, color: '#d93a30', color2: '#2f6fd0',
        lamps: { x: 0.0, zF: 1.35, zR: -1.4 },
        custom: {
            clip: jetHull,
            marks: (c) => genericMarks(c),
            draw(P, P2, g) {
                const W = 78, cy = 39, st = dark(P, 0.45), o = [];
                o.push(`<path d="${jetHull}" fill="url(#${g}paint)" stroke="${st}" stroke-width="1.6" stroke-linejoin="round"/>`);
                o.push(`<path d="M10,8 L108,6 Q166,9 198,39 Q166,69 108,72 L10,70" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.6"/>`);   // friso claro
                for (const y of [9.5, W - 9.5]) o.push(`<line x1="28" y1="${y}" x2="150" y2="${y + (y < cy ? 2 : -2)}" stroke="${P2}" stroke-width="2.4" stroke-linecap="round"/>`);   // faixas (pintura 2)
                o.push(`<path d="${rrect(4, 28, 12, W - 12, 4)}" fill="#d9dce2" stroke="#8a8f98" stroke-width="0.8"/>`);              // plataforma de popa
                for (let k = 0; k < 5; k++) o.push(`<line x1="${8 + k * 4}" y1="16" x2="${8 + k * 4}" y2="${W - 16}" stroke="#9aa0a8" stroke-width="0.8"/>`);
                for (const [y0, y1] of [[13, 25], [W - 25, W - 13]]) o.push(`<path d="${rrect(30, 116, y0, y1, 4)}" fill="#3b3e44" stroke="#22242a" stroke-width="0.8"/>` +
                    Array.from({ length: 16 }, (_, k) => `<line x1="${34 + k * 5}" y1="${y0 + 2}" x2="${34 + k * 5}" y2="${y1 - 2}" stroke="#4c5058" stroke-width="0.8"/>`).join(''));   // apoios dos pés
                o.push(`<path d="${ell(150, cy, 46, 25)}" fill="url(#${g}paint2)" stroke="${dark(P2, 0.45)}" stroke-width="1.3"/>`);   // capô (pintura 2)
                o.push(`<ellipse cx="156" cy="${cy - 9}" rx="26" ry="8" fill="url(#${g}shine)"/>`);
                o.push(`<path d="${rrect(30, 110, cy - 13, cy + 13, 12, 3, 2)}" fill="url(#${g}seat)" stroke="#0d0e10" stroke-width="1"/>`);   // banco
                o.push(`<line x1="40" y1="${cy}" x2="104" y2="${cy}" stroke="#4a4d55" stroke-width="0.8" stroke-dasharray="2 2"/>`);
                o.push(`<path d="M30,${cy - 9} Q24,${cy} 30,${cy + 9}" fill="none" stroke="url(#${g}chrome)" stroke-width="2.6" stroke-linecap="round"/>`);   // alça
                o.push(`<path d="M126,${cy - 15} Q138,${cy} 126,${cy + 15} L120,${cy + 13} Q130,${cy} 120,${cy - 13} Z" fill="url(#${g}glass)" stroke="#11151a" stroke-width="0.8"/>`);   // para-brisa
                o.push(`<path d="${rrect(110, 120, cy - 7, cy + 7, 2.5)}" fill="#18191c"/><rect x="112" y="${cy - 4}" width="6" height="8" rx="1" fill="#2f8fa8" opacity="0.8"/>`);
                o.push(`<path d="M118,12 Q112,${cy} 118,${W - 12}" fill="none" stroke="url(#${g}chrome)" stroke-width="3.2" stroke-linecap="round"/>`);   // guidão
                for (const y of [10, W - 18]) o.push(`<rect x="113" y="${y}" width="8" height="8" rx="3" fill="#101114"/>`);
                o.push(`<circle cx="200" cy="${cy}" r="3" fill="url(#${g}head)" stroke="#40505a" stroke-width="0.7"/>`);
                return { defs: grads(g, P, P2, W), body: o.join('') };
            },
        } });

    // ================================================================== LANCHA (Marlin 21 Sport) — 6,4 × 2,3 m
    const lanHull = 'M10,4 L250,2 C360,2 420,40 446,80.5 C420,121 360,159 250,159 L10,157 Q2,157 2,149 L2,12 Q2,4 10,4 Z';
    const lanDeck = 'M20,16 L250,14 C350,14 405,45 428,80.5 C405,116 350,147 250,147 L20,145 Q14,145 14,139 L14,22 Q14,16 20,16 Z';
    veh({ id: 'lancha', nome: 'Lancha (Marlin 21 Sport)', categoria: 'barco', kind: 'boat', L: 448, W: 161, pad: 26, color: '#e8eaf0', color2: '#1d2748',
        lamps: { x: 0.75, zF: 3.0, zR: -3.1 },
        custom: {
            clip: lanHull,
            glass: 'M262,28 Q300,80.5 262,133 L250,133 Q286,80.5 250,28 Z',
            marks: (c) => genericMarks(c),
            draw(P, P2, g) {
                const W = 161, cy = 80.5, st = dark(P, 0.45), o = [];
                o.push(`<path d="${rrect(-22, 4, cy - 17, cy + 17, 5)}" fill="#26282d" stroke="#0e0f11" stroke-width="1"/><path d="${rrect(-18, 0, cy - 12, cy + 12, 4)}" fill="url(#${g}paint2)"/><rect x="-26" y="${cy - 3}" width="6" height="6" rx="2" fill="#1a1a1d"/>`);   // motor de popa
                o.push(`<path d="${lanHull}" fill="url(#${g}paint)" stroke="${st}" stroke-width="1.8" stroke-linejoin="round"/>`);
                o.push(`<g clip-path="url(#${g}hclip)"><rect x="14" y="2" width="330" height="7" fill="${P2}"/><rect x="14" y="${W - 9}" width="330" height="7" fill="${P2}"/></g>`);   // faixas
                o.push(`<path d="${lanDeck}" fill="url(#${g}deck)" stroke="#9a9484" stroke-width="1.2"/>`);
                o.push(`<path d="M290,36 C340,40 395,62 412,80.5 C395,99 340,121 290,125 Q280,80.5 290,36 Z" fill="#f6f1e4" stroke="#b8b0a0" stroke-width="1"/>`);   // solário de proa
                for (const k of [0, 1, 2, 3]) o.push(`<path d="M${306 + k * 24},${44 + k * 5} Q${300 + k * 24},80.5 ${306 + k * 24},${117 - k * 5}" fill="none" stroke="#cfc6b2" stroke-width="1.2"/>`);
                o.push(`<path d="${rrect(28, 62, 26, W - 26, 8)}" fill="#f2ecdd" stroke="#b8b0a0" stroke-width="1"/><line x1="45" y1="30" x2="45" y2="${W - 30}" stroke="#cfc6b2" stroke-width="1.2"/>`);   // banco de popa
                for (const [y0, y1] of [[36, 68], [W - 68, W - 36]]) o.push(`<path d="${rrect(196, 222, y0, y1, 6)}" fill="#f2ecdd" stroke="#b8b0a0" stroke-width="1"/>`);   // bancos
                for (const [y0, y1] of [[33, 70], [W - 70, W - 33]]) o.push(`<path d="${rrect(228, 254, y0, y1, 4)}" fill="#e2dccb" stroke="#8a8474" stroke-width="1"/>`);   // consoles
                o.push(`<circle cx="238" cy="${W - 52}" r="9" fill="none" stroke="#202226" stroke-width="2.4"/><rect x="242" y="${W - 64}" width="9" height="8" rx="1.5" fill="#1b2a35"/>`);   // timão e painel
                o.push(`<path d="M262,28 Q300,80.5 262,133 L250,133 Q286,80.5 250,28 Z" fill="url(#${g}glass)" stroke="#11151a" stroke-width="1"/>`);   // para-brisa
                o.push(`<path d="M262,28 Q300,80.5 262,133" fill="none" stroke="url(#${g}chrome)" stroke-width="1.6"/>`);
                o.push(`<ellipse cx="350" cy="40" rx="60" ry="10" fill="url(#${g}shine)" opacity="0.7"/>`);
                for (const [x, y] of [[24, 9], [24, W - 9], [300, 12], [300, W - 12]]) o.push(`<rect x="${x - 4}" y="${y - 1.5}" width="8" height="3" rx="1.5" fill="url(#${g}chrome)"/>`);   // cunhos
                o.push(`<circle cx="408" cy="54" r="3" fill="#d8202a"/><circle cx="408" cy="${W - 54}" r="3" fill="#20b050"/><circle cx="12" cy="${cy}" r="3" fill="#f4f1e8"/>`);   // luzes de navegação
                return { defs: grads(g, P, P2, W) + `<clipPath id="${g}hclip"><path d="${lanHull}"/></clipPath>`, body: o.join('') };
            },
        } });

    // ================================================================== BARCO DE PESCA (Caiçara 30) — 9,0 × 3,2 m
    const barHull = 'M12,6 L360,2 C500,2 590,50 628,112 C590,174 500,222 360,222 L12,218 Q2,218 2,208 L2,16 Q2,6 12,6 Z';
    const barDeck = 'M24,20 L360,16 C490,16 570,60 606,112 C570,164 490,208 360,208 L24,204 Q16,204 16,196 L16,28 Q16,20 24,20 Z';
    veh({ id: 'barco', nome: 'Barco de pesca (Caiçara 30)', categoria: 'barco', kind: 'boat', L: 630, W: 224, pad: 18, color: '#e8eaf0', color2: '#2f6fd0',
        lamps: { x: 1.1, zF: 4.2, zR: -4.3 },
        custom: {
            clip: barHull,
            glass: 'M474,50 L488,56 L488,168 L474,174 Z',
            marks: (c) => genericMarks(c),
            draw(P, P2, g) {
                const W = 224, cy = 112, st = dark(P, 0.45), o = [];
                for (const x of [150, 250, 350]) for (const y of [2, W - 2]) o.push(`<ellipse cx="${x}" cy="${y}" rx="9" ry="5" fill="#1b1b1f" stroke="#0a0a0c" stroke-width="0.8"/>`);   // defensas (pneus)
                o.push(`<path d="${barHull}" fill="url(#${g}paint)" stroke="${st}" stroke-width="2" stroke-linejoin="round"/>`);
                o.push(`<g clip-path="url(#${g}hclip)"><rect x="16" y="2" width="460" height="8" fill="${P2}"/><rect x="16" y="${W - 10}" width="460" height="8" fill="${P2}"/></g>`);
                o.push(`<path d="${barDeck}" fill="#c9b994" stroke="#8a7a58" stroke-width="1.4"/>`);                                  // convés de madeira
                o.push(`<g clip-path="url(#${g}dclip)">` + Array.from({ length: 21 }, (_, k) => `<line x1="16" y1="${24 + k * 9}" x2="610" y2="${24 + k * 9}" stroke="#b09e78" stroke-width="0.8"/>`).join('') + '</g>');   // tábuas
                o.push(`<path d="${rrect(30, 96, 44, 120, 14)}" fill="#3f6e60" stroke="#24443a" stroke-width="1"/>`);              // rede amontoada
                for (let k = 0; k < 9; k++) o.push(`<line x1="${34 + k * 7}" y1="48" x2="${30 + k * 7 + 8}" y2="116" stroke="#5a9080" stroke-width="0.8"/>`);
                o.push(`<path d="${rrect(120, 210, 84, 148, 6)}" fill="#ece8dc" stroke="#8a8474" stroke-width="1.2"/><rect x="120" y="113" width="90" height="4" fill="#c8c2b2"/>`);   // caixa de pesca (gelo)
                o.push(`<path d="${rrect(296, 476, 26, W - 26, 10)}" fill="${dark(P2, 0.35)}" stroke="#101216" stroke-width="1"/>`);   // cabine (sombra)
                o.push(`<path d="${rrect(300, 472, 30, W - 30, 10)}" fill="url(#${g}paint2)" stroke="${dark(P2, 0.5)}" stroke-width="1.2"/>`);   // cabine (pintura 2)
                o.push(`<path d="${rrect(308, 466, 38, W - 38, 8)}" fill="#eef0f2" stroke="#9aa0a8" stroke-width="1"/>`);             // teto
                o.push(`<ellipse cx="370" cy="${cy - 30}" rx="50" ry="14" fill="url(#${g}shine)" opacity="0.6"/>`);
                o.push(`<path d="M474,50 L488,56 L488,168 L474,174 Z" fill="url(#${g}glass)" stroke="#11151a" stroke-width="1"/>`);    // vidro da frente
                o.push(`<circle cx="400" cy="${cy}" r="6" fill="url(#${g}chrome)" stroke="#55585e" stroke-width="0.8"/><rect x="376" y="${cy - 3}" width="48" height="6" rx="3" fill="#202226"/>`);   // mastro e radar
                o.push(`<circle cx="286" cy="58" r="11" fill="none" stroke="#f07a1a" stroke-width="5"/><circle cx="286" cy="58" r="11" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="4 13"/>`);   // boia
                o.push(`<path d="${rrect(560, 590, cy - 14, cy + 14, 4)}" fill="#2a2c31" stroke="#0e0f11" stroke-width="1"/>`);         // guincho da âncora
                o.push(`<path d="M480,22 C540,26 586,60 604,112 C586,164 540,198 480,202" fill="none" stroke="url(#${g}chrome)" stroke-width="2.4"/>`);   // guarda-corpo
                o.push(`<path d="M22,24 L292,22 M22,200 L292,202" fill="none" stroke="url(#${g}chrome)" stroke-width="2"/>`);
                for (const s of [-1, 1]) o.push(`<line x1="20" y1="${cy + s * 92}" x2="-14" y2="${cy + s * 104}" stroke="#d8dce2" stroke-width="1.4"/>`);   // varas
                o.push(`<circle cx="612" cy="${cy}" r="4" fill="#f4f1e8"/><circle cx="560" cy="44" r="4" fill="#d8202a"/><circle cx="560" cy="${W - 44}" r="4" fill="#20b050"/>`);
                return { defs: grads(g, P, P2, W) + `<clipPath id="${g}hclip"><path d="${barHull}"/></clipPath>` + `<clipPath id="${g}dclip"><path d="${barDeck}"/></clipPath>`, body: o.join('') };
            },
        } });

    // Desenho completo (mesmo enquadramento do carSVG: margem `pad` em volta, viewBox escalado para `size`).
    function vehSVG(c, opts = {}) {
        const PAD = c.pad || 10, cw = c.L + PAD * 2, ch = c.W + PAD * 2, g = c.id + (opts.tag || '') + '-';
        const P = opts.paint || c.color, P2 = opts.paint2 || c.color2 || c.color;
        const d = c.custom.draw(P, P2, g);
        const [sw, sh] = opts.size || [cw, ch];
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none">\n` +
            `<defs>${d.defs}\n</defs>\n<g transform="translate(${PAD},${PAD})">${d.body}${opts.dmg || ''}</g>\n</svg>\n`;
    }

    for (const v of V) G.CARS.push(v);
    G.vehSVG = vehSVG;
    G.svgOf = (c, opts) => (c.custom ? vehSVG(c, opts) : G.carSVG(c, opts));

    // Pneu dianteiro avulso (o jogo o gira com a direção): faixa escura com banda de rodagem, 1 m × 0,25 m no desenho — o jogo escala
    // para o tamanho de cada modelo (CarActor).
    G.tireSVG = (size) => {
        const L = 70, W = 18;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}" viewBox="0 0 ${L + 4} ${W + 4}" preserveAspectRatio="none">` +
            `<defs><linearGradient id="tt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3b40"/><stop offset="0.5" stop-color="#1b1b1f"/><stop offset="1" stop-color="#0e0e10"/></linearGradient></defs>` +
            `<g transform="translate(2,2)"><rect x="0" y="0" width="${L}" height="${W}" rx="5" fill="url(#tt)" stroke="#0a0a0c" stroke-width="1"/>` +
            Array.from({ length: 13 }, (_, k) => `<line x1="${5 + k * 5}" y1="2" x2="${5 + k * 5}" y2="${W - 2}" stroke="#2f3035" stroke-width="1.2"/>`).join('') + '</g></svg>';
    };
})();
