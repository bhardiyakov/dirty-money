// Cabine (greenhouse): anéis horizontais empilhados do friso (belt) até o teto,
// planta em retângulo arredondado por anel, para-brisa/vigia inclinados, colunas,
// vidros rebaixados com borracha, borda do teto arredondada e teto abaulado.
import { pchip, lerp, clamp } from './math.js';
import { emitGrid } from './grid.js';

export function makeCabin(spec, B) {
  const L = B.L, xR = B.xR;
  const X = (u) => xR + u * L;
  const fn = (v) => (typeof v === 'function' ? v : Array.isArray(v) ? pchip(v.map(([uu, y]) => [X(uu), y])) : () => v);
  const belt = fn(spec.belt);
  const roof = fn(spec.roof); // altura do teto na borda (topo do arredondamento)
  const roofR = spec.roofR ?? 0.07;
  const crown = spec.crown ?? 0.025;
  const base = spec.base ?? 0.08;
  const b0 = spec.bot, t0 = spec.top;
  const pws = spec.pws ?? 1.35, prw = spec.prw ?? 1.15, ptw = spec.ptw ?? 1.0;
  const bulge = spec.bulge ?? 0, bulgeX = spec.bulgeX ?? 0;
  const plan = (f) => {
    const bs = Math.sin(Math.PI * Math.min(Math.max(f, 0), 1));
    const p = {
      xf: lerp(X(b0.xf), X(t0.xf), Math.pow(f, pws)) + bulgeX * bs,
      xr: lerp(X(b0.xr), X(t0.xr), Math.pow(f, prw)) - bulgeX * bs,
      hw: lerp(b0.hw, t0.hw, Math.pow(f, ptw)) + bulge * bs,
      rf: lerp(b0.rf, t0.rf, f),
      rr: lerp(b0.rr, t0.rr, f),
    };
    return p;
  };
  const inset = (p, d) => ({ xf: p.xf - d, xr: p.xr + d, hw: p.hw - d, rf: Math.max(0.004, p.rf - d), rr: Math.max(0.004, p.rr - d) });
  const fix = (p) => {
    const lenHalf = (p.xf - p.xr) / 2;
    p.rf = clamp(p.rf, 0.003, Math.min(p.hw - 0.002, lenHalf - 0.002));
    p.rr = clamp(p.rr, 0.003, Math.min(p.hw - 0.002, lenHalf - 0.002));
    return p;
  };

  const nC = spec.cornerSeg ?? 4;
  const FZ = spec.frontZ ?? [0.22, 0.42];
  const RZ = spec.rearZ ?? [0.25, 0.45];
  const rearWin = spec.rearWin ?? 99;
  const frontWrap = spec.frontWrap ?? 0.5;
  const rearWrap = spec.rearWrap ?? 0.35;
  const side = spec.side ?? [{ zone: 'w', n: 3 }];
  const rows = spec.rows ?? 4;
  const glassTop = spec.glassTop ?? 0.9;
  const glassBot = spec.glassBot ?? 0.0;
  const allRZ = [...new Set([...RZ, rearWin].filter((z) => z < 50))].sort((a, b) => b - a);

  // pontos da metade direita (da frente-centro até a traseira-centro) e zonas das células
  const half = (p, f) => {
    const pts = [], zones = [];
    const ffix = Math.min(Math.max(f, 0), 1);
    // borda dianteira
    const zf = p.hw - p.rf;
    pts.push([p.xf, 0]);
    for (const z of FZ) { pts.push([p.xf, Math.min(z, zf)]); zones.push('ws'); }
    pts.push([p.xf, zf]); zones.push('ws');
    // canto dianteiro
    for (let k = 1; k <= nC; k++) {
      const a = ((k / nC) * Math.PI) / 2;
      pts.push([p.xf - p.rf + p.rf * Math.cos(a), zf + p.rf * Math.sin(a)]);
      zones.push(k / nC <= frontWrap + 1e-6 ? 'ws' : 'a');
    }
    // lateral
    const xa = p.xf - p.rf, xb = p.xr + p.rr;
    let prev = xa;
    for (let s = 0; s < side.length; s++) {
      const iv = side[s];
      let to;
      if (s === side.length - 1 || !iv.to) to = xb;
      else to = Array.isArray(iv.to) ? lerp(X(iv.to[0]), X(iv.to[1]), ffix) : X(iv.to);
      to = clamp(to, xb, prev);
      const n = iv.n ?? 1;
      for (let k = 1; k <= n; k++) {
        pts.push([lerp(prev, to, k / n), p.hw]);
        zones.push(iv.zone);
      }
      prev = to;
    }
    // canto traseiro
    const zr = p.hw - p.rr;
    for (let k = 1; k <= nC; k++) {
      const a = Math.PI / 2 + ((k / nC) * Math.PI) / 2;
      pts.push([p.xr + p.rr + p.rr * Math.cos(a), zr + p.rr * Math.sin(a)]);
      zones.push(k / nC > 1 - rearWrap + 1e-6 ? 'rw' : 'c');
    }
    // borda traseira
    let zPrev = zr;
    for (const z of allRZ) {
      const zz = Math.min(z, zr);
      pts.push([p.xr, zz]);
      zones.push((zPrev + zz) / 2 < rearWin ? 'rw' : 'rp');
      zPrev = zz;
    }
    pts.push([p.xr, 0]);
    zones.push(zPrev / 2 < rearWin ? 'rw' : 'rp');
    return { pts, zones };
  };

  // definição dos anéis
  const ringDefs = [{ k: 'base', f: 0 }];
  if (glassBot > 0) ringDefs.push({ k: 'band', f: 0 });
  for (let r = 0; r <= rows; r++) ringDefs.push({ k: 'band', f: glassBot + ((glassTop - glassBot) * r) / rows });
  ringDefs.push({ k: 'band', f: 1 });
  const nRound = spec.roundSeg ?? 3;
  for (let k = 1; k <= nRound; k++) ringDefs.push({ k: 'round', th: ((k / nRound) * Math.PI) / 2 });
  const capS = spec.cap ?? [0.86, 0.68, 0.48, 0.26, 0];
  for (const s of capS) ringDefs.push({ k: 'cap', s });

  const rowsP = [];
  let zonesRow = null;
  const rowMeta = [];
  const pTop = fix(plan(1));
  const pRoof = fix(inset(pTop, roofR));
  const xc = (pRoof.xf + pRoof.xr) / 2;
  for (const rd of ringDefs) {
    let p, yf;
    if (rd.k === 'base') {
      p = fix(plan(0));
      yf = (x) => belt(x) - base;
    } else if (rd.k === 'band') {
      p = fix(plan(rd.f));
      yf = (x) => lerp(belt(x), roof(x) - roofR, rd.f);
    } else if (rd.k === 'round') {
      p = fix(inset(pTop, roofR * (1 - Math.cos(rd.th))));
      yf = (x) => roof(x) - roofR + roofR * Math.sin(rd.th);
    } else {
      p = pRoof;
      yf = (x) => roof(x) + crown * (1 - rd.s * rd.s);
    }
    const H = half(p, rd.f ?? 1);
    if (!zonesRow) {
      zonesRow = [...H.zones, ...H.zones.slice().reverse()];
    }
    let pts = H.pts;
    if (rd.k === 'cap') pts = pts.map(([x, z]) => [xc + (x - xc) * rd.s, z * rd.s]);
    const row = [];
    for (const [x, z] of pts) row.push([x, yf(x), z]);
    for (let k = pts.length - 2; k >= 1; k--) row.push([pts[k][0], yf(pts[k][0]), -pts[k][1]]);
    rowsP.push(row);
    rowMeta.push(rd);
  }
  return { spec, rows: rowsP, zonesRow, rowMeta, plan, pTop, pRoof, belt, roof, roofR, crown, xc };
}

const GLASS = new Set(['ws', 'w', 'rw', 'q']);

export function emitCabin(mb, C, opts = {}) {
  const s = C.spec;
  const zm = { ws: 'vidro', w: 'vidro', rw: 'vidro', q: 'vidro', a: 'pintura', b: 'preto', c: 'pintura', rp: 'pintura', p: 'pintura', ...(s.zones || {}) };
  const glassD = s.glassD ?? 0.012;
  const glassWall = s.glassWall ?? 'borracha';
  const roofMat = s.roofMat ?? 'pintura';
  const frameMat = s.frameMat ?? 'pintura';
  const glassTop = s.glassTop ?? 0.9;
  const roofRegions = s.roofRegions || [];
  return emitGrid(mb, C.rows, {
    closedJ: true,
    cell: (i, j, c, n) => {
      const r0 = C.rowMeta[i], r1 = C.rowMeta[i + 1];
      const zone = C.zonesRow[j];
      const ctx = { x: c[0], y: c[1], z: c[2], az: Math.abs(c[2]), zone, n, row: r0, i };
      if (s.cellFn) {
        const r = s.cellFn(ctx);
        if (r) return r;
      }
      if (r0.k === 'base') return { m: frameMat };
      if (r0.k === 'band' && r1.k === 'band') {
        if (r1.f <= glassTop + 1e-6 && r0.f >= (s.glassBot ?? 0) - 1e-6) {
          const m = zm[zone];
          if (GLASS.has(zone) && (m === 'vidro' || m === 'vidro_escuro')) return { m, d: glassD, w: glassWall };
          return { m };
        }
        return { m: s.frameZones?.[zone] ?? frameMat };
      }
      for (const rr of roofRegions) {
        if (rr.x && (ctx.x < rr.x[0] || ctx.x > rr.x[1])) continue;
        if (rr.z && (ctx.az < rr.z[0] || ctx.az > rr.z[1])) continue;
        if (rr.rows && !rr.rows.includes(i)) continue;
        if (rr.f && !rr.f(ctx)) continue;
        return { m: rr.m, d: rr.d || 0, w: rr.w };
      }
      return { m: roofMat };
    },
  });
}
