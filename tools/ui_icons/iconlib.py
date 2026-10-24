# ============================================================================
# tools/ui_icons/iconlib.py — o traço dos ÍCONES do jogo (o lugar dos emojis): formas vetoriais + o estilo, e a montagem da fonte
# colorida (COLR/CPAL v0) que o jogo usa no lugar do Noto Color Emoji.
#
# ESTILO "Dirty Money" — o mesmo das armas pintadas da interface: um adesivo — borda clara fina por fora do contorno escuro grosso —,
# cor chapada, sombra numa faixa embaixo/à direita, luz numa faixa fina em cima/à esquerda (luz vindo do alto à esquerda) e linhas de
# detalhe escuras. As faixas
# saem sozinhas da forma (a forma menos ela mesma deslocada), então desenhar um ícone é só dizer as formas e as cores.
#
# Espaço de desenho: 0..100 nos dois eixos, y PARA BAIXO (como SVG); o ícone ocupa a caixa toda (contorno e borda saem ~7 unidades
# para fora). Na fonte: 1 em = 1000; a caixa vira 900 × 900, de −40 (abaixo da linha de base) a 860, com 100 de cada lado.
# ============================================================================
import math
import pathops
from pathops import Path, LineCap, LineJoin

INK = '#0d1017'          # contorno e linhas
OUT = 4.4                # espessura do contorno (unidades de desenho)
HALO = 2.8               # a borda clara de "adesivo" em volta do contorno (como as armas pintadas da interface)
HALO_C = '#cfd5de'
LINE = 3.0               # linha de detalhe
SEP = 2.4                # linha entre uma peça e as de trás

# ---------------------------------------------------------------------------- cores
def _hex(c):
    c = c.lstrip('#')
    if len(c) == 3: c = ''.join(ch * 2 for ch in c)
    return [int(c[i:i + 2], 16) for i in (0, 2, 4)] + ([int(c[6:8], 16)] if len(c) == 8 else [255])
def _fmt(rgba): return '#%02x%02x%02x' % tuple(rgba[:3]) + ('' if rgba[3] == 255 else '%02x' % rgba[3])
def mix(a, b, t):
    A, B = _hex(a), _hex(b)
    return _fmt([round(A[i] + (B[i] - A[i]) * t) for i in range(4)])
def dark(c, t=0.3): return mix(c, '#0b0d14', t)
def light(c, t=0.38): return mix(c, '#ffffff', t)
def alpha(c, a): A = _hex(c); A[3] = round(a * 255); return _fmt(A)

# materiais: (base, sombra, luz)
MAT = {
    'skin': ('#e8a77b', '#b97350', '#f9d2b2'), 'skin2': ('#b9774c', '#875231', '#dca37a'), 'skin3': ('#7d4a2c', '#57311b', '#a8724c'),
    'metal': ('#8d95a1', '#5a616c', '#d0d6de'), 'steel': ('#c3cad4', '#87909d', '#f1f4f8'), 'iron': ('#40454f', '#262a31', '#717986'),
    'wood': ('#a9672f', '#74421b', '#d99a5c'), 'gold': ('#f4b731', '#b77a12', '#ffe28c'), 'brass': ('#d9a440', '#9a6c1d', '#f6d585'),
    'cash': ('#62b157', '#3b7a34', '#ade191'), 'red': ('#e2453d', '#a3241e', '#ff8b7c'), 'blue': ('#3b7ed8', '#22509a', '#93bdf3'),
    'navy': ('#2b3d66', '#1a2644', '#5873a8'), 'green': ('#2fb466', '#1c7a43', '#86e3a6'), 'olive': ('#7d8b3d', '#535e22', '#b5c26f'),
    'yellow': ('#f6cf3a', '#c2951a', '#fff08f'), 'orange': ('#f0882a', '#b2541a', '#ffc274'), 'purple': ('#8b5cd6', '#5d3796', '#c4a6f5'),
    'pink': ('#ec6aa0', '#b03e6f', '#ffb1d1'), 'white': ('#e9ecf1', '#a9b1bd', '#ffffff'), 'paper': ('#f1e8d2', '#c2b28e', '#fffaf0'),
    'brown': ('#7b4a2a', '#52301a', '#a8714a'), 'black': ('#363b46', '#1f232b', '#646c7a'), 'cyan': ('#2fc3d9', '#1b8396', '#94ecf7'),
    'face': ('#f7c23c', '#c98a16', '#ffe58c'), 'glass': ('#8fd3e6', '#4f98b0', '#e6fbff'), 'leaf': ('#4fa64a', '#2f6e2c', '#9bd98d'),
    'denim': ('#3f69a8', '#284573', '#86a8db'), 'rubber': ('#2b2f37', '#17191e', '#555c69'), 'flame': ('#ff9a1f', '#e0531a', '#ffe36b'),
    'water': ('#46a7f0', '#2370b8', '#a8dcff'), 'blood': ('#c3202a', '#7e1017', '#f2626b'), 'grey': ('#9aa1ab', '#6a717c', '#d6dbe2'),
    'lilac': ('#b9a3e3', '#8770b5', '#e3d8fb'), 'teal': ('#1f9e8f', '#136459', '#79d8cb'), 'sand': ('#d9b778', '#a7864c', '#f3dfb2'),
    'hair': ('#2a211d', '#151010', '#5a4a40'), 'white_hair': ('#e6e6e6', '#a8acb3', '#ffffff'), 'ginger': ('#b8562a', '#7c3418', '#e58a5a'),
}
def mat(c):
    if isinstance(c, tuple): return c
    if c in MAT: return MAT[c]
    return (c, dark(c, 0.3), light(c, 0.38))

# ---------------------------------------------------------------------------- formas
K = 0.5522847498
def P(): return Path()
def copy(p): q = Path(); q.addPath(p); return q
def move(p, dx, dy): return p.transform(1, 0, 0, 1, dx, dy)
def scale(p, sx, sy=None, cx=50, cy=50):
    sy = sx if sy is None else sy
    return p.transform(sx, 0, 0, sy, cx - cx * sx, cy - cy * sy)
def rot(p, deg, cx=50, cy=50):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return p.transform(c, s, -s, c, cx - cx * c + cy * s, cy - cx * s - cy * c)
def flipx(p, cx=50): return p.transform(-1, 0, 0, 1, 2 * cx, 0)
def flipy(p, cy=50): return p.transform(1, 0, 0, -1, 0, 2 * cy)

def poly(*pts):
    if len(pts) == 1: pts = pts[0]
    p = Path(); p.moveTo(*pts[0])
    for q in pts[1:]: p.lineTo(*q)
    p.close(); return p
def polyline(*pts):
    if len(pts) == 1: pts = pts[0]
    p = Path(); p.moveTo(*pts[0])
    for q in pts[1:]: p.lineTo(*q)
    return p
def ellipse(cx, cy, rx, ry=None, deg=0):
    ry = rx if ry is None else ry
    U = [(1, 0), (1, K), (K, 1), (0, 1), (-K, 1), (-1, K), (-1, 0), (-1, -K), (-K, -1), (0, -1), (K, -1), (1, -K)]
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    T = [(cx + u * rx * c - v * ry * s, cy + u * rx * s + v * ry * c) for u, v in U]
    p = Path(); p.moveTo(*T[0])
    for i in range(4): p.cubicTo(*T[1 + 3 * i], *T[2 + 3 * i], *T[(3 + 3 * i) % 12])
    p.close(); return p
def circle(cx, cy, r): return ellipse(cx, cy, r, r)
def rrect(x, y, w, h, r=0, deg=0):
    r = min(r, w / 2, h / 2)
    p = Path()
    if r <= 0:
        p.moveTo(x, y); p.lineTo(x + w, y); p.lineTo(x + w, y + h); p.lineTo(x, y + h); p.close()
    else:
        k = r * (1 - K)
        p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.cubicTo(x + w - k, y, x + w, y + k, x + w, y + r)
        p.lineTo(x + w, y + h - r); p.cubicTo(x + w, y + h - k, x + w - k, y + h, x + w - r, y + h)
        p.lineTo(x + r, y + h); p.cubicTo(x + k, y + h, x, y + h - k, x, y + h - r)
        p.lineTo(x, y + r); p.cubicTo(x, y + k, x + k, y, x + r, y); p.close()
    return rot(p, deg, x + w / 2, y + h / 2) if deg else p
def arc(cx, cy, r, a0, a1, ry=None):
    """arco aberto (graus, 0 = direita, sentido horário na tela) — para linhas."""
    ry = r if ry is None else ry
    n = max(2, int(abs(a1 - a0) / 8) + 1)
    pts = [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    return polyline(pts)
def pie(cx, cy, r, a0, a1, ry=None):
    ry = r if ry is None else ry
    n = max(2, int(abs(a1 - a0) / 6) + 1)
    pts = [(cx, cy)] + [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    return poly(pts)
def svg(d):
    from fontTools.svgLib.path import parse_path
    p = Path(); parse_path(d, p.getPen()); return p
def curve(*pts):
    """linha suave (Catmull-Rom → cúbicas) por pontos — aberta."""
    if len(pts) == 1: pts = pts[0]
    p = Path(); p.moveTo(*pts[0])
    for i in range(len(pts) - 1):
        p0 = pts[max(0, i - 1)]; p1 = pts[i]; p2 = pts[i + 1]; p3 = pts[min(len(pts) - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6); c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        p.cubicTo(*c1, *c2, *p2)
    return p
def blob(*pts):
    """forma fechada suave pelos pontos."""
    if len(pts) == 1: pts = pts[0]
    n = len(pts); p = Path(); p.moveTo(*pts[0])
    for i in range(n):
        p0 = pts[(i - 1) % n]; p1 = pts[i]; p2 = pts[(i + 1) % n]; p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6); c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        p.cubicTo(*c1, *c2, *p2)
    p.close(); return p
def stroke(p, w, cap='round', join='round'):
    q = copy(p)
    q.stroke(w, {'round': LineCap.ROUND_CAP, 'butt': LineCap.BUTT_CAP, 'square': LineCap.SQUARE_CAP}[cap],
             {'round': LineJoin.ROUND_JOIN, 'miter': LineJoin.MITER_JOIN, 'bevel': LineJoin.BEVEL_JOIN}[join], 4)
    q.convertConicsToQuads()                                                    # (cantos redondos do traço: cônicas → quadráticas)
    return simp(q)
def cap(x1, y1, x2, y2, r): return stroke(polyline((x1, y1), (x2, y2)), 2 * r)
def capsule(*pts, r=4):
    return stroke(polyline(*pts), 2 * r)
def simp(p):
    q = copy(p); q.simplify(fix_winding=True, keep_starting_points=False); return q
def U(*ps):
    ps = [p for p in ps if p is not None]
    if not ps: return Path()
    out = copy(ps[0])
    for p in ps[1:]: out = pathops.op(out, p, pathops.PathOp.UNION, fix_winding=True)
    return out
def D(a, *bs):
    out = copy(a)
    for b in bs: out = pathops.op(out, b, pathops.PathOp.DIFFERENCE, fix_winding=True)
    return out
def I(a, b): return pathops.op(a, b, pathops.PathOp.INTERSECTION, fix_winding=True)
def erode(p, d): return D(p, stroke(p, 2 * d)) if d > 0 else p
def grow(p, d): return U(p, stroke(p, 2 * d)) if d > 0 else p
def bounds(p):
    try: return p.bounds
    except Exception: return (0, 0, 0, 0)
def empty(p): b = bounds(p); return b[2] - b[0] < 1e-3 or b[3] - b[1] < 1e-3

# ---------------------------------------------------------------------------- peças e ícone
class Part:
    """uma peça do ícone: forma + cor; sombra/luz automáticas; linhas de detalhe (cortadas na peça)."""
    def __init__(self, shape, color, shade=True, hl=True, lines=(), lw=LINE, lc=INK, sh=None, hd=None, sep=True, outline=True, clip=True, flat=False):
        self.shape = simp(shape); self.color = mat(color); self.shade = shade and not flat; self.hl = hl and not flat
        self.lines = list(lines); self.lw = lw; self.lc = lc; self.sh = sh; self.hd = hd; self.sep = sep; self.outline = outline; self.clip = clip

class Layer:
    """camada pronta (sem sombra nem contorno): brilho, efeito, detalhe solto por cima."""
    def __init__(self, shape, color): self.shape = simp(shape); self.color = color

def L(shape, w=LINE): return ('line', shape, w)

def build(items):
    """itens (Part / Layer, na ordem de baixo para cima) → [(caminho, cor)], com o contorno em volta de tudo."""
    parts = [it for it in items if isinstance(it, Part)]
    layers = []
    sil = U(*[p.shape for p in parts if p.outline])
    if not empty(sil):
        layers.append((U(sil, stroke(sil, 2 * (OUT + HALO))), HALO_C))
        layers.append((U(sil, stroke(sil, 2 * OUT)), INK))
    drawn = None
    for it in items:
        if isinstance(it, Layer):
            if not empty(it.shape): layers.append((it.shape, it.color))
            continue
        s = it.shape
        if empty(s): continue
        base, shc, lc = it.color
        if it.sep and drawn is not None:
            ring = I(stroke(s, 2 * SEP), drawn)
            if not empty(ring): layers.append((ring, INK))
        layers.append((s, base))
        b = bounds(s); m = min(b[2] - b[0], b[3] - b[1])
        if it.shade:
            d = it.sh if it.sh is not None else max(2.0, min(8.5, 0.17 * m))
            sh = D(s, move(s, -d, -d))
            if not empty(sh): layers.append((sh, shc))
        if it.hl:
            h = it.hd if it.hd is not None else max(1.2, min(4.2, 0.1 * m))
            e = erode(s, min(2.2, 0.09 * m))
            if not empty(e):
                hp = D(e, move(e, h, h))
                if not empty(hp): layers.append((hp, lc))
        for ln in it.lines:
            if isinstance(ln, tuple) and ln and ln[0] == 'line': shp, w = ln[1], ln[2]
            else: shp, w = ln, it.lw
            g = stroke(shp, w)
            if it.clip: g = I(g, erode(s, 0.4))
            if not empty(g): layers.append((g, it.lc))
        drawn = s if drawn is None else U(drawn, s)
    # junta camadas seguidas da mesma cor (menos glifos)
    out = []
    for shp, col in layers:
        if out and out[-1][1] == col: out[-1] = (U(out[-1][0], shp), col)
        else: out.append((shp, col))
    return out

# ---------------------------------------------------------------------------- fonte
def to_font_units(p):
    q = p.transform(9, 0, 0, -9, 100, 860)
    q.simplify(fix_winding=True, keep_starting_points=False)
    return q

def build_font(icons, out_path, family='DM Icons', adv=1100, extra_cmap=()):
    """icons: [(sequência de códigos (tupla de ints), nome, [(caminho, cor)])]. Grava WOFF2 (ou TTF/OTF pela extensão)."""
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
    order = ['.notdef', 'space', 'zwj', 'vs16']
    charstrings, widths, cmap, colr, palette, pidx = {}, {}, {}, {}, [], {}
    def cs(glyph, path, w):
        pen = T2CharStringPen(w, None)
        if path is not None: path.draw(pen)
        charstrings[glyph] = pen.getCharString(); widths[glyph] = w
    cs('.notdef', None, adv); cs('space', None, adv // 3); cs('zwj', None, 0); cs('vs16', None, 0)
    cmap[0x200D] = 'zwj'; cmap[0xFE0F] = 'vs16'                                 # (sem o espaço: o dos textos fica com a fonte deles)
    fea = []
    for seq, name, layers in icons:
        gname = 'u' + '_'.join('%04X' % c for c in seq)
        order.append(gname)
        lay = []
        for i, (shp, col) in enumerate(layers):
            ln = '%s.l%d' % (gname, i); order.append(ln)
            cs(ln, to_font_units(shp), adv)
            if col not in pidx:
                pidx[col] = len(palette); A = _hex(col); palette.append((A[0] / 255, A[1] / 255, A[2] / 255, A[3] / 255))
            lay.append((ln, pidx[col]))
        cs(gname, to_font_units(layers[0][0]) if layers else None, adv)       # (sem cor: a silhueta)
        colr[gname] = lay
        if len(seq) == 1: cmap[seq[0]] = gname
        else:
            comps = [c for c in seq if c not in (0x200D, 0xFE0F)]
            fea.append('    sub %s by %s;' % (' zwj '.join('u%04X' % c for c in comps), gname))
    for cp in extra_cmap:                                                      # componentes de sequência sem desenho próprio
        if cp not in cmap:
            g = 'u%04X' % cp
            if g not in charstrings: order.append(g); cs(g, None, adv)
            cmap[cp] = g
    fb = FontBuilder(1000, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(family.replace(' ', ''), {'FullName': family}, charstrings, {})
    lsb = {}
    for g in order:
        b = charstrings[g].calcBounds(None) if g in charstrings else None
        lsb[g] = int(b[0]) if b else 0
    fb.setupHorizontalMetrics({g: (widths[g], lsb[g]) for g in order})
    fb.setupHorizontalHeader(ascent=880, descent=-120)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=880, sTypoDescender=-120, sTypoLineGap=0, usWinAscent=900, usWinDescent=150, achVendID='DMNY')
    fb.setupPost()
    fb.setupCOLR(colr, version=0)
    fb.setupCPAL([palette])
    if fea:
        addOpenTypeFeaturesFromString(fb.font, 'languagesystem DFLT dflt;\nfeature ccmp {\n' + '\n'.join(fea) + '\n} ccmp;\n')
    if out_path.endswith('.woff2'): fb.font.flavor = 'woff2'
    fb.save(out_path)
    return len(order), len(palette)
