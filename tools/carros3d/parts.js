// ============================================================================
// PEÇAS MÓVEIS dos carros (o jogo abre, amassa, solta e arranca cada uma — src/art/CarArt3D.js, src/vehicle/CarParts.js): a malha
// da carroceria é CORTADA nas frestas do próprio modelo (as linhas de porta que o gerador estampa — details.doorLines —, a base do
// para-brisa, a base do vidro traseiro, o fim dos para-choques) e cada vértice ganha a PEÇA dele:
//    7 capô · 8 porta-malas / tampa traseira (hatch, SUV, perua) / tampa da caçamba (picape) · 9..12 portas (dianteira esq./dir.,
//    traseira esq./dir.) · 13 para-choque dianteiro · 14 traseiro · 15/16 portas traseiras do furgão (esq./dir.)
// Cada peça leva a DOBRADIÇA (pivô e eixo, nos eixos do jogo: +X direita, +Y cima, +Z frente; o ângulo positivo ABRE a peça), o tipo
// (0 gira na dobradiça · 1 corre — a porta lateral do furgão · 2 pende — o para-choque solto cai de um lado), o ângulo máximo e a
// caixa (centro e meias medidas — o destroço que cai).
// A peça ganha também o LADO DE DENTRO (a pele de dentro, recuada, com o forro, e a borda na cor do carro: aberta, a porta tem
// espessura) e o carro ganha um INTERIOR simples (assoalho, laterais, painel, bancos, cofre do motor com o motor, fundo do porta-malas)
// — aberta a porta ou o capô, aparece o que tem dentro, e não um buraco.
// ============================================================================

export const PART = { body: 0, hood: 7, trunk: 8, dFL: 9, dFR: 10, dRL: 11, dRR: 12, bumpF: 13, bumpR: 14, rearL: 15, rearR: 16 };

// ---------------------------------------------------------------------------- malha em listas (fácil de cortar)
function toLists(m) {
  const P = Array.from(m.P), N = Array.from(m.N), M = Array.from(m.Mt), I = Array.from(m.Ix);
  return { P, N, M, I };
}
function toTyped(L, Pt) {
  const nv = L.P.length / 3, ni = L.I.length;
  return { P: Float32Array.from(L.P), N: Float32Array.from(L.N), Mt: Uint8Array.from(L.M), Pt: Uint8Array.from(Pt), Ix: nv > 65535 ? Uint32Array.from(L.I) : Uint16Array.from(L.I), nv, ni };
}
const tc = (L, t) => { const I = L.I, P = L.P, a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3; return [(P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3]; };
const tn = (L, t) => {
  const I = L.I, N = L.N, a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
  const x = N[a] + N[b] + N[c], y = N[a + 1] + N[b + 1] + N[c + 1], z = N[a + 2] + N[b + 2] + N[c + 2], l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

// Corta os triângulos que atravessam o plano n·p = d (só os que passam no filtro f(centro, normal)): cada um vira 3, os vértices
// novos na aresta (posição e normal interpoladas; o mesmo ponto dos dois lados da aresta — sem fresta).
function splitPlane(L, n, d, f) {
  const t0 = L.I.length;
  splitPlane0(L, n, d, f);
  if (L.dbg) L.dbg.push(`${L.dbgName || '?'}:+${(L.I.length - t0) / 3}`);
}
function splitPlane0(L, n, d, f) {
  const nt = L.I.length / 3, P = L.P, N = L.N, M = L.M, out = [], made = new Map();
  const dist = (i) => P[i * 3] * n[0] + P[i * 3 + 1] * n[1] + P[i * 3 + 2] * n[2] - d;
  // (a extensão do triângulo: [yMin, yMax, zMin, zMax] — o triângulo comprido da soleira atravessa a fresta com o centro longe dela)
  const ext = (a, b, c) => [Math.min(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]), Math.max(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]), Math.min(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]), Math.max(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2])];
  const mid = (i, j, t) => {
    const key = i < j ? i * 4194304 + j : j * 4194304 + i;                 // (o mesmo ponto para os dois triângulos da aresta)
    if (made.has(key)) return made.get(key);
    if (j < i) { const q = i; i = j; j = q; t = 1 - t; }
    const k = P.length / 3;
    made.set(key, k);
    for (let c = 0; c < 3; c++) P.push(P[i * 3 + c] + (P[j * 3 + c] - P[i * 3 + c]) * t);
    let x = N[i * 3] + (N[j * 3] - N[i * 3]) * t, y = N[i * 3 + 1] + (N[j * 3 + 1] - N[i * 3 + 1]) * t, z = N[i * 3 + 2] + (N[j * 3 + 2] - N[i * 3 + 2]) * t;
    const l = Math.hypot(x, y, z) || 1; N.push(x / l, y / l, z / l);
    M.push(M[i]);
    return k;
  };
  for (let t = 0; t < nt; t++) {
    let a = L.I[t * 3], b = L.I[t * 3 + 1], c = L.I[t * 3 + 2];
    const da = dist(a), db = dist(b), dc = dist(c), e = 1e-5;
    const sa = da > e ? 1 : da < -e ? -1 : 0, sb = db > e ? 1 : db < -e ? -1 : 0, sc = dc > e ? 1 : dc < -e ? -1 : 0;
    if (!((sa > 0 || sb > 0 || sc > 0) && (sa < 0 || sb < 0 || sc < 0)) || (L.skin && !L.skin(M[a])) || (f && !f(tc(L, t), tn(L, t), ext(a, b, c)))) { out.push(a, b, c); continue; }
    // gira o triângulo para o vértice SOZINHO do seu lado ficar em `a` (a ordem — o sentido da face — fica)
    let A = a, B = b, C = c, dA = da, dB = db, dC = dc;
    const lone = (x, y, z) => Math.sign(x) !== Math.sign(y) && Math.sign(x) !== Math.sign(z);
    if (lone(sb || 1e-9, sa || 1e-9, sc || 1e-9) && sb !== 0) { A = b; B = c; C = a; dA = db; dB = dc; dC = da; }
    else if (lone(sc || 1e-9, sa || 1e-9, sb || 1e-9) && sc !== 0) { A = c; B = a; C = b; dA = dc; dB = da; dC = db; }
    if (Math.abs(dB) < e || Math.abs(dC) < e) {
      // um vértice NO plano: corta só a aresta oposta
      if (Math.abs(dB) < e) { const m = mid(A, C, dA / (dA - dC)); out.push(A, B, m, m, B, C); }
      else { const m = mid(A, B, dA / (dA - dB)); out.push(A, m, C, m, B, C); }
      continue;
    }
    const ab = mid(A, B, dA / (dA - dB)), ac = mid(A, C, dA / (dA - dC));
    out.push(A, ab, ac, ab, B, C, ab, C, ac);
  }
  L.I = out;
}

// ---------------------------------------------------------------------------- a geometria do modelo
// Tudo nos eixos do JOGO: z = frente (o x do gerador), x = direita (o z do gerador), y = cima.
function geometry(v, info) {
  const ctx = v.ctx, spec = ctx.spec, L = spec.L, W = spec.W, X = (u) => -L / 2 + u * L, B = ctx.body, C = ctx.cabin;
  const cat = info.categoria || '';
  const body = spec.body || {};
  const ySill = body.ySill ?? 0.25, yWaist = body.yWaist ?? 0.6, yBelt = body.yBelt ?? 0.98;
  const hw = (z) => Math.max(0.2, B ? B.halfW(z) : W / 2);
  const zF = B ? B.xF : L / 2, zR = B ? B.xR : -L / 2;
  const cab = C && C.spec && C.spec.bot ? C.spec : null;
  const belt = (z) => (C ? C.belt(z) : yBelt), roof = (z) => (C ? C.roof(z) : yBelt + 0.45);
  // a borda da janela (pilar A na frente, C atrás) na altura y: a fração da cabine e o plano dela
  const winEdge = (y, front) => {
    if (!C) return front ? zF : zR;
    const zm = front ? X(cab.bot.xf) : X(cab.bot.xr), b = belt(zm), r = roof(zm) - (C.roofR || 0.07);
    const f = Math.max(0, Math.min(1, (y - b) / Math.max(0.05, r - b)));
    const p = C.plan(f);
    return front ? p.xf : p.xr;
  };
  // frestas de porta (verticais): [zBaixo, yBaixo, zCima, yCima], da frente para trás
  const seams = (ctx.seams || []).filter(([z0, y0, z1, y1]) => Math.abs(y1 - y0) > 0.3 && Math.abs(z1 - z0) < 0.5 * Math.abs(y1 - y0))
    .map(([z0, y0, z1, y1]) => (y0 <= y1 ? [z0, y0, z1, y1] : [z1, y1, z0, y0]))
    .sort((a, b) => (b[0] + b[2]) - (a[0] + a[2]));
  return { spec, L, W, X, B, C, cab, cat, ySill, yWaist, yBelt, hw, zF, zR, belt, roof, winEdge, seams, arches: ctx.arches || [] };
}

// As portas do modelo: pares de frestas seguidas (o espaço menor que 0,35 m é um pilar, não uma porta). → [{ front, rear }] (frestas)
function doorPairs(G, slug) {
  if (slug === 'onibus') return [];                                         // (ônibus: as portas sanfonadas ficam fixas)
  const S = G.seams, out = [], mid = (s) => (s[0] + s[2]) / 2;
  for (let i = 0; i + 1 < S.length && out.length < 2; i++) if (mid(S[i]) - mid(S[i + 1]) >= 0.35) out.push({ front: S[i], rear: S[i + 1] });
  return out;
}
const lineZ = (s, y) => { const t = (y - s[1]) / ((s[3] - s[1]) || 1); return s[0] + (s[2] - s[0]) * Math.max(0, Math.min(1, t)); };

// ---------------------------------------------------------------------------- o corte e a classificação
export function segment(full, v, info, slug, mats) {
  const G = geometry(v, info), L = toLists(full), kindOf = (mi) => mats[mi] ? mats[mi].k : 0, nameOf = (mi) => (mats[mi] ? mats[mi].n : '');
  // só a PELE é cortada (pintura, teto, vidro, plástico do para-choque): os detalhes miúdos estampados ficam inteiros, pelo centro
  const SKIN = new Set(['pintura', 'teto', 'pintura2', 'faixa', 'vidro', 'vidro_escuro', 'plastico', 'plastico_cinza', 'preto']);
  L.skin = (mi) => mats[mi] && !mats[mi].s && SKIN.has(mats[mi].n);
  const isLamp = (mi) => { const k = kindOf(mi); return k >= 6 && k <= 12; };
  const parts = {};
  const pairs = doorPairs(G, slug);
  const vanRear = /^(van_furgao|ambulancia|swat_van|caveirao)$/.test(slug);
  const pickup = G.cat === 'Picapes';
  const hatch = !pickup && !vanRear && slug !== 'onibus' && G.cab && G.cab.bot.xr < 0.1;
  const sedan = !pickup && !vanRear && slug !== 'onibus' && G.cab && G.cab.bot.xr >= 0.1;
  const zH = G.cab ? G.X(G.cab.bot.xf) : G.zF;                             // a base do para-brisa (a dobradiça do capô)
  const hasHood = G.zF - zH > 0.4 && slug !== 'onibus';
  const zT = G.cab ? G.X(G.cab.bot.xr) : G.zR;                             // a base do vidro traseiro
  const yBump = Math.max(0.35, Math.min(0.6, G.yWaist - 0.05));            // o alto dos para-choques
  const dBump = Math.min(0.34, (G.zF - G.zR) * 0.07);
  // o alto do teto atrás (a dobradiça da tampa traseira do hatch) e a borda da caçamba (picape)
  let roofRearY = 0, roofRearZ = G.zF, bedTop = 0;
  for (let i = 0; i < L.P.length; i += 3) if (L.P[i + 2] < (G.zF + G.zR) / 2) roofRearY = Math.max(roofRearY, L.P[i + 1]);
  for (let i = 0; i < L.P.length; i += 3) if (L.P[i + 1] > roofRearY - 0.06) roofRearZ = Math.min(roofRearZ, L.P[i + 2]);
  if (pickup) for (let i = 0; i < L.P.length; i += 3) if (L.P[i + 2] < zT - 0.2 && L.P[i + 2] > G.zR + 0.25) bedTop = Math.max(bedTop, L.P[i + 1]);
  void roofRearZ;

  // ---- os cortes (cada plano só nos triângulos da região dele)
  const side = (c, n) => Math.abs(n[0]) > 0.3;
  L.dbg = process.env.PARTS_DBG ? [] : null;
  // (a região das portas, ao longo do carro: só lá a cintura e os pilares cortam)
  const zDoor0 = pairs.length ? Math.min(...pairs.map((p) => Math.min(p.rear[0], p.rear[2]))) - 0.12 : 0, zDoor1 = pairs.length ? Math.max(...pairs.map((p) => Math.max(p.front[0], p.front[2]))) + 0.12 : 0;
  const inDoors = (c, e) => e[3] > zDoor0 && e[2] < zDoor1;

  for (const pr of pairs) for (const s of [pr.front, pr.rear]) {
    L.dbgName = 'fresta';
    const dz = s[2] - s[0], dy = s[3] - s[1], l = Math.hypot(dz, dy), nz = dy / l, ny = -dz / l;
    splitPlane(L, [0, ny, nz], ny * s[1] + nz * s[0], (c, n, e) => side(c, n) && e[1] > Math.min(s[1], s[3]) - 0.15 && e[0] < Math.max(s[1], s[3]) + 0.05);
  }
  const doorBot = pairs.map((p) => Math.max(G.ySill - 0.02, Math.min(p.front[1], p.rear[1])));
  L.dbgName = 'soleira';
  for (const y of new Set(doorBot.map((y) => Math.round(y * 1000) / 1000))) splitPlane(L, [0, 1, 0], y, (c, n, e) => side(c, n) && inDoors(c, e));
  L.dbgName = 'pilarB';                                                              // (a cintura: a janela começa aí)
  if (pairs.length > 1) { const Bz = lineZ(pairs[0].rear, 2); for (const o of [0.04, -0.04]) splitPlane(L, [0, 0, 1], Bz + o, (c, n, e) => side(c, n) && e[1] > G.yBelt - 0.05); }
  // os pilares A (na frente da 1ª porta) e C (atrás da última): o plano pela linha do pilar, recuado 7 cm
  L.dbgName = 'pilarAC';
  if (pairs.length && G.C) {
    const yb = G.yBelt + 0.01, yt = G.roof(G.X(G.cab.bot.xf)) - 0.1;
    for (const [front, o] of [[true, -0.07], [false, 0.07]]) {
      const z0 = G.winEdge(yb, front) + o, z1 = G.winEdge(yt, front) + o, dz = z1 - z0, dy = yt - yb, l = Math.hypot(dz, dy) || 1, nz = dy / l, ny = -dz / l;
      splitPlane(L, [0, ny, nz], ny * yb + nz * z0, (c, n, e) => side(c, n) && e[1] > G.yBelt - 0.05);
    }
  }
  L.dbgName = 'capo'; if (hasHood) splitPlane(L, [0, 0, 1], zH, (c, n) => n[1] > 0.25);
  L.dbgName = 'mala';
  if (sedan) splitPlane(L, [0, 0, 1], zT, (c, n) => n[1] > 0.25);
  L.dbgName = 'parachoque'; splitPlane(L, [0, 0, 1], G.zF - dBump, (c) => c[1] < yBump + 0.1);
  splitPlane(L, [0, 0, 1], G.zR + dBump, (c) => c[1] < yBump + 0.1);
  splitPlane(L, [0, 1, 0], yBump, (c) => c[2] > G.zF - dBump - 0.05 || c[2] < G.zR + dBump + 0.05);
  L.dbgName = 'fundo'; if (vanRear) splitPlane(L, [1, 0, 0], 0, (c, n) => n[2] < -0.5);
  if (pickup) splitPlane(L, [0, 1, 0], bedTop - 0.02, (c, n) => n[2] < -0.5);

  if (L.dbg) console.log('  [cortes]', slug, L.dbg.join(' '), 'caçamba', bedTop.toFixed(2), 'pc', yBump.toFixed(2), 'zR', G.zR.toFixed(2), 'zT', zT.toFixed(2));
  // ---- a peça de cada triângulo (pelo centro e a normal)
  const nt = L.I.length / 3, tp = new Uint8Array(nt);
  const archHit = (c) => G.arches.some((a) => Math.hypot(c[2] - a.x, c[1] - a.y) < a.r + 0.05);
  for (let t = 0; t < nt; t++) {
    const c = tc(L, t), n = tn(L, t), mi = L.M[L.I[t * 3]], nm = nameOf(mi), [x, y, z] = c, ax = Math.abs(x), hwz = G.hw(z);
    if (nm === 'chassi' || nm === 'pneu') continue;
    // para-choques: a ponta da frente / de trás, abaixo do alto deles (as lanternas e faróis ficam na carroceria)
    if (y < yBump && !isLamp(mi)) {
      if (z > G.zF - dBump && !archHit(c)) { tp[t] = PART.bumpF; continue; }
      if (z < G.zR + dBump && !archHit(c)) { tp[t] = PART.bumpR; continue; }
    }
    // capô: o tampo à frente da base do para-brisa, longe das bordas de lado
    if (hasHood && z > zH && n[1] > 0.4 && y > G.yWaist * 0.75 && y < G.belt(zH) + 0.12 && ax < hwz * 0.93 && !isLamp(mi) && nm !== 'vidro' && nm !== 'borracha' && nm !== 'grade') { tp[t] = PART.hood; continue; }
    // traseira
    if (sedan && z < zT && n[1] > 0.4 && y > G.yWaist * 0.75 && y < G.belt(zT) + 0.12 && ax < hwz * 0.93 && !isLamp(mi) && nm !== 'vidro') { tp[t] = PART.trunk; continue; }
    if (sedan && z < zT && n[2] < -0.55 && y > G.yWaist + 0.04 && ax < hwz * 0.62 && !isLamp(mi)) { tp[t] = PART.trunk; continue; }
    if (hatch && n[2] < -0.35 && y > yBump + 0.03 && y < roofRearY - 0.03 && ax < hwz * 0.9 && z < G.zR + 0.9 && !isLamp(mi)) { tp[t] = PART.trunk; continue; }
    if (pickup && n[2] < -0.5 && y > yBump && y < bedTop && z < G.zR + 0.25 && ax < hwz * 0.95 && !isLamp(mi)) { tp[t] = PART.trunk; continue; }
    if (vanRear && n[2] < -0.5 && y > yBump && z < G.zR + 0.35 && ax < hwz * 0.97 && !isLamp(mi)) { tp[t] = x < 0 ? PART.rearL : PART.rearR; continue; }
    // portas: a lateral entre as frestas da porta, da soleira até o teto (a janela vai junto; os pilares A, B e C ficam), e o retrovisor
    for (let k = 0; k < pairs.length; k++) {
      const pr = pairs[k], yb = doorBot[k];
      if (y < yb || n[1] > 0.6) continue;
      let zf = lineZ(pr.front, y), zr = lineZ(pr.rear, y);
      if (y > G.yBelt - 0.02) {
        if (k === 0) zf = Math.min(zf, G.winEdge(y, true) - 0.07);
        if (pairs.length > 1 && k === 0) zr = Math.max(zr, lineZ(pr.rear, 2) + 0.04);
        if (pairs.length > 1 && k === 1) zf = Math.min(zf, lineZ(pr.front, 2) - 0.04);
        if (k === pairs.length - 1) zr = Math.max(zr, G.winEdge(y, false) + 0.07);
        if (y > G.roof(z) - 0.05) continue;
      }
      if (z > zf || z < zr) continue;
      const mirror = k === 0 && ax > hwz + 0.01 && y > G.yBelt - 0.15 && y < G.yBelt + 0.3;
      if (!(Math.abs(n[0]) > 0.3 || mirror) || archHit(c)) continue;
      tp[t] = (k === 0 ? PART.dFL : PART.dRL) + (x > 0 ? 1 : 0);
      break;
    }
  }

  // ---- cada vértice numa peça só (o vértice dividido entre peças vira um por peça)
  const map = new Map(), P = [], N = [], M = [], Pt = [], I = [];
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
    const i = L.I[t * 3 + k], key = i * 32 + tp[t];
    let j = map.get(key);
    if (j === undefined) {
      j = P.length / 3; map.set(key, j);
      P.push(L.P[i * 3], L.P[i * 3 + 1], L.P[i * 3 + 2]); N.push(L.N[i * 3], L.N[i * 3 + 1], L.N[i * 3 + 2]); M.push(L.M[i]); Pt.push(tp[t]);
    }
    I.push(j);
  }

  // ---- as dobradiças (pivô, eixo: o ângulo positivo abre) e a caixa de cada peça
  // (a caixa pela PELE da peça: antena, friso e enfeite não esticam a dobradiça)
  const box = (code) => {
    const mn = [9, 9, 9], mx = [-9, -9, -9];
    for (let i = 0; i < Pt.length; i++) if (Pt[i] === code && L.skin(M[i])) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], P[i * 3 + c]); mx[c] = Math.max(mx[c], P[i * 3 + c]); }
    if (mn[0] > mx[0]) for (let i = 0; i < Pt.length; i++) if (Pt[i] === code) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], P[i * 3 + c]); mx[c] = Math.max(mx[c], P[i * 3 + c]); }
    return mn[0] > mx[0] ? null : { c: mn.map((a, c) => (a + mx[c]) / 2), h: mn.map((a, c) => (mx[c] - a) / 2), mn, mx };
  };
  const r3 = (x) => Math.round(x * 1000) / 1000, put = (code, p, a, t, m, w = 0) => {
    const b = box(code);
    if (!b) return;
    parts[code] = { p: p.map(r3), a: a.map(r3), t, m: r3(m), w: r3(w || b.h[0]), c: b.c.map(r3), h: b.h.map(r3) };
  };
  pairs.forEach((pr, k) => {
    for (const s of [-1, 1]) {
      const code = (k === 0 ? PART.dFL : PART.dRL) + (s > 0 ? 1 : 0), b = box(code);
      if (!b) continue;
      const x = s * (s > 0 ? b.mx[0] : -b.mn[0]);
      const z0 = lineZ(pr.front, b.mn[1]), z1 = lineZ(pr.front, Math.min(b.mx[1], G.yBelt));
      const slide = vanRear && k === 1 && slug !== 'caveirao';
      if (slide) put(code, [x, b.mn[1], b.mx[2]], [0, 0, -1], 1, (b.mx[2] - b.mn[2]) * 0.95);
      else {
        const ay = b.mx[1] - b.mn[1], az = z1 - z0, al = Math.hypot(ay, az) || 1;
        put(code, [x, b.mn[1], z0], [0, (s < 0 ? 1 : -1) * ay / al, (s < 0 ? 1 : -1) * az / al], 0, 1.15);
      }
    }
  });
  if (hasHood) { const b = box(PART.hood); if (b) put(PART.hood, [0, b.mx[1] - 0.02, b.mn[2]], [-1, 0, 0], 0, 1.2); }
  if (sedan) { const b = box(PART.trunk); if (b) put(PART.trunk, [0, b.mx[1] - 0.02, b.mx[2]], [1, 0, 0], 0, 1.25); }
  if (hatch) { const b = box(PART.trunk); if (b) put(PART.trunk, [0, b.mx[1], b.mx[2]], [1, 0, 0], 0, 1.35); }
  if (pickup) { const b = box(PART.trunk); if (b) put(PART.trunk, [0, b.mn[1], b.c[2]], [-1, 0, 0], 0, 1.5); }
  if (vanRear) for (const [code, s] of [[PART.rearL, -1], [PART.rearR, 1]]) { const b = box(code); if (b) put(code, [s < 0 ? b.mn[0] : b.mx[0], b.mn[1], b.c[2]], [0, s < 0 ? 1 : -1, 0], 0, 1.65); }
  for (const code of [PART.bumpF, PART.bumpR]) { const b = box(code); if (b) put(code, b.c, [0, 0, 1], 2, 0.5, b.h[0]); }

  return { L: { P, N, M, I }, Pt, parts, G, flags: { hatch, sedan, pickup, vanRear, hasHood, zH, zT, yBump, roofRearY } };
}

// ---------------------------------------------------------------------------- o lado de dentro e o interior
// (depois do recorte do "só o que se vê de cima": nada disso aparece com tudo fechado)
export function insides(mesh, seg, matIndex, used) {
  const { G, parts, flags } = seg;
  const P = Array.from(mesh.P), N = Array.from(mesh.N), M = Array.from(mesh.Mt), Pt = Array.from(mesh.Pt), I = Array.from(mesh.Ix);
  const trim = matIndex('forro'), seat = matIndex('estofado_preto'), engine = matIndex('metal_escuro'), dark = matIndex('chassi'), paint = matIndex('pintura');
  const vtx = (p, n, m, pt) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); M.push(m); Pt.push(pt); return P.length / 3 - 1; };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const pos = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], nrm = (i) => [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
  // a convenção da malha (o sentido da face da frente): o normal geométrico concorda ou não com o normal do vértice
  let agree = 0;
  for (let t = 0; t < Math.min(400, I.length / 3); t++) { const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2], g = cross(sub(pos(b), pos(a)), sub(pos(c), pos(a))), n = nrm(a); agree += Math.sign(dot(g, n)); }
  const conv = agree >= 0 ? 1 : -1;
  // triângulo de UM lado, virado para `n` (a face da frente na mesma convenção da malha)
  const tri = (p0, p1, p2, n, m, pt) => {
    const g = cross(sub(p1, p0), sub(p2, p0));
    if (dot(g, g) < 1e-14) return;
    const a = vtx(p0, n, m, pt), b = vtx(p1, n, m, pt), c = vtx(p2, n, m, pt);
    if (dot(g, n) * conv >= 0) I.push(a, b, c); else I.push(a, c, b);
  };
  const quad = (p0, p1, p2, p3, n, m, pt = 0) => {
    const g = cross(sub(p1, p0), sub(p2, p0));
    if (dot(g, g) < 1e-14) return tri(p0, p2, p3, n, m, pt);
    const a = vtx(p0, n, m, pt), b = vtx(p1, n, m, pt), c = vtx(p2, n, m, pt), d = vtx(p3, n, m, pt);
    if (dot(g, n) * conv >= 0) I.push(a, b, c, a, c, d); else I.push(a, c, b, a, d, c);
  };

  // ---- a pele de dentro e a borda das peças que abrem (portas, capô, tampas): pelo CONTORNO da peça, simplificado
  const nt = I.length / 3;
  for (const codeS of Object.keys(parts)) {
    const code = +codeS, pa = parts[code];
    if (pa.t === 2) continue;                                               // (para-choque: maciço o bastante)
    const th = code === 7 || code === 8 ? 0.035 : 0.05;
    const kp = (p) => `${Math.round(p[0] * 400)},${Math.round(p[1] * 400)},${Math.round(p[2] * 400)}`;
    const edges = new Map(), skin = (mi) => used[mi] && !used[mi].s && /^(pintura|teto|pintura2|faixa|vidro|vidro_escuro|plastico|plastico_cinza|preto)$/.test(used[mi].n);
    for (let t = 0; t < nt; t++) {
      if (Pt[I[t * 3]] !== code || !skin(M[I[t * 3]])) continue;
      for (let e = 0; e < 3; e++) {
        const a = I[t * 3 + e], b = I[t * 3 + (e + 1) % 3], ka = kp(pos(a)), kb = kp(pos(b));
        if (ka === kb) continue;
        const k = ka < kb ? ka + '|' + kb : kb + '|' + ka, r = edges.get(k);
        if (r) r.n++; else edges.set(k, { n: 1, ka, kb, a, b });
      }
    }
    // as arestas de um triângulo só, encadeadas em laços
    const next = new Map(), pts = new Map();
    for (const E of edges.values()) {
      if (E.n !== 1) continue;
      (next.get(E.ka) || next.set(E.ka, []).get(E.ka)).push(E.kb);
      (next.get(E.kb) || next.set(E.kb, []).get(E.kb)).push(E.ka);
      pts.set(E.ka, { p: pos(E.a), n: nrm(E.a) }); pts.set(E.kb, { p: pos(E.b), n: nrm(E.b) });
    }
    const seen = new Set(), loops = [];
    for (const k0 of next.keys()) {
      if (seen.has(k0)) continue;
      const loop = [];
      let prev = null, cur = k0;
      while (cur && !seen.has(cur)) {
        seen.add(cur); loop.push(pts.get(cur));
        const nb = (next.get(cur) || []).filter((k) => k !== prev && !seen.has(k));
        prev = cur; cur = nb[0];
      }
      let per = 0; for (let i = 0; i < loop.length; i++) per += Math.hypot(...sub(loop[i].p, loop[(i + 1) % loop.length].p));
      if (loop.length >= 4) loops.push({ loop, per });
    }
    loops.sort((a, b) => b.per - a.per);
    for (const { loop } of loops.slice(0, 1)) {                                // (só o contorno de fora: o maior)
      // simplifica: tira o ponto quase na reta entre os vizinhos (a peça é grande; o contorno fino não aparece)
      let L2 = loop.slice();
      for (let pass = 0; pass < 10 && L2.length > 12; pass++) {
        const keep = [];
        for (let i = 0; i < L2.length; i++) {
          const a = L2[(i + L2.length - 1) % L2.length].p, b = L2[i].p, c = L2[(i + 1) % L2.length].p, ac = sub(c, a), l = Math.hypot(...ac) || 1;
          const dv = Math.hypot(...cross(sub(b, a), ac)) / l;
          if (dv > 0.02 || i % 2 === 1) keep.push(L2[i]);
        }
        if (keep.length === L2.length) break;
        L2 = keep;
      }
      // o leque de dentro (recuado `th`, pelos normais) e a borda (a faixa entre o contorno e o recuo), virada para fora
      const inner = L2.map((q) => q.p.map((x, c) => x - q.n[c] * th)), cen = inner.reduce((s, p) => [s[0] + p[0] / inner.length, s[1] + p[1] / inner.length, s[2] + p[2] / inner.length], [0, 0, 0]);
      const navg = norm(L2.reduce((s, q) => [s[0] + q.n[0], s[1] + q.n[1], s[2] + q.n[2]], [0, 0, 0]));
      const inN = [-navg[0], -navg[1], -navg[2]];
      // (o leque: o centro e os pontos de dentro compartilhados)
      const ic = vtx(cen, inN, trim, code), iv = inner.map((p) => vtx(p, inN, trim, code));
      for (let i = 0; i < L2.length; i++) {
        const j = (i + 1) % L2.length, g = cross(sub(inner[i], cen), sub(inner[j], cen));
        if (dot(g, g) > 1e-14) { if (dot(g, inN) * conv >= 0) I.push(ic, iv[i], iv[j]); else I.push(ic, iv[j], iv[i]); }
        const a = L2[i].p, b = L2[j].p, mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], e = norm(sub(b, a));
        let o = sub(mid, cen); o = sub(o, e.map((x) => x * dot(o, e))); o = norm(o);
        quad(a, b, inner[j], inner[i], o, paint, code);
      }
    }
  }
  // ---- o INTERIOR (peça 0: a carroceria). Cavidade = faces viradas para dentro (aparece por uma abertura); bloco = para fora.
  const block = (x0, y0, z0, x1, y1, z1, m) => {
    quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], m);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], m);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], m);
    quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], m);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], m);
  };
  const tub = (x0, y0, z0, x1, y1, z1, m) => {
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 1, 0], m);
    quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [1, 0, 0], m);
    quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [-1, 0, 0], m);
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, -1], m);
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, 1], m);
  };
  const fr = parts[9] || parts[10], rr = parts[11] || parts[12];
  if (fr) {
    const z1 = flags.hasHood ? Math.min(fr.c[2] + fr.h[2], flags.zH) : fr.c[2] + fr.h[2], z0 = rr ? rr.c[2] - rr.h[2] : fr.c[2] - fr.h[2] - 0.5;
    const yF = G.ySill + 0.08, hw = Math.max(0.3, G.hw((z0 + z1) / 2) - 0.08), yb = G.yBelt;
    tub(-hw, yF, z0, hw, yb - 0.05, z1, trim);                              // o assoalho e as laterais por dentro
    block(-hw, yb - 0.25, z1 - 0.35, hw, yb - 0.02, z1, dark);              // o painel
    const zs = fr.c[2] - fr.h[2] * 0.15;                                     // os bancos da frente (assento e encosto)
    for (const s of [-1, 1]) {
      const xa = Math.min(s * hw * 0.85, s * hw * 0.12), xb = Math.max(s * hw * 0.85, s * hw * 0.12);
      block(xa, yF + 0.22, zs - 0.25, xb, yF + 0.36, zs + 0.25, seat);
      block(xa, yF + 0.36, zs - 0.33, xb, yb + 0.3, zs - 0.2, seat);
    }
    if (rr || z1 - z0 > 2) { const zb = rr ? rr.c[2] : z0 + 0.6; block(-hw * 0.9, yF + 0.2, zb - 0.3, hw * 0.9, yF + 0.34, zb + 0.25, seat); block(-hw * 0.9, yF + 0.34, zb - 0.4, hw * 0.9, yb + 0.25, zb - 0.28, seat); }
  }
  const hood = parts[7];
  if (hood) {                                                                // o cofre do motor e o motor
    const x = hood.h[0] * 0.88, z0 = hood.c[2] - hood.h[2] + 0.04, z1 = hood.c[2] + hood.h[2] - 0.12, y0 = Math.max(0.3, G.ySill + 0.1), y1 = hood.c[1] - 0.06;
    if (z1 > z0 + 0.2 && y1 > y0 + 0.15) { tub(-x, y0, z0, x, y1, z1, dark); block(-x * 0.55, y0, z0 + 0.12, x * 0.45, y1 - 0.12, z1 - 0.15, engine); block(-x * 0.85, y0, z1 - 0.1, x * 0.85, y1 - 0.08, z1 - 0.04, engine); }
  }
  const tr = parts[8];
  if (tr && (flags.sedan || flags.hatch)) {                                   // o fundo do porta-malas
    const x = tr.h[0] * 0.88, z0 = G.zR + 0.15, z1 = flags.sedan ? tr.c[2] + tr.h[2] - 0.05 : tr.c[2] + tr.h[2] + 0.55, y0 = Math.max(0.35, G.ySill + 0.15), y1 = Math.min(tr.c[1], G.yBelt) - 0.05;
    if (z1 > z0 + 0.2 && y1 > y0 + 0.1) tub(-x, y0, z0, x, y1, z1, trim);
  }
  if (parts[15] || parts[16]) {                                               // o baú do furgão
    const b = parts[15] || parts[16], hw = Math.max(0.4, G.hw(b.c[2] + 1) - 0.1);
    tub(-hw, b.c[1] - b.h[1] + 0.05, b.c[2] + 0.1, hw, b.c[1] + b.h[1] - 0.1, b.c[2] + 2.4, trim);
  }
  const nv = P.length / 3;
  return { P: Float32Array.from(P), N: Float32Array.from(N), Mt: Uint8Array.from(M), Pt: Uint8Array.from(Pt), Ix: nv > 65535 ? Uint32Array.from(I) : Uint16Array.from(I), nv, ni: I.length, nb: nt };
}

export { toTyped };
