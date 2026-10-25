# Rostos (reações, humor dos personagens) — redondos, amarelo-ouro do jogo, com contorno e faixas.
from iconlib import *
from icons import icon, gloss, ink, inkline, inkcurve

def head(color='face'):
    return Part(circle(50, 52, 43), color, sh=7, hd=3.4)

# olhos
def e_dot(y=44, dx=15, r=6):
    return [ink(ellipse(50 - dx, y, r * 0.78, r)), ink(ellipse(50 + dx, y, r * 0.78, r))]
def e_happy(y=46, dx=15):
    return [Layer(stroke(arc(50 - dx, y + 4, 8, 200, 340), 5), INK), Layer(stroke(arc(50 + dx, y + 4, 8, 200, 340), 5), INK)]
def e_closed(y=46, dx=15):
    return [Layer(stroke(arc(50 - dx, y - 4, 8, 20, 160), 4.4), INK), Layer(stroke(arc(50 + dx, y - 4, 8, 20, 160), 4.4), INK)]
def e_wide(y=42, dx=15):
    out = []
    for sx in (-1, 1):
        out += [Part(ellipse(50 + sx * dx, y, 9, 11), 'white', shade=False, hl=False, sep=False, outline=False), ink(circle(50 + sx * dx, y + 1, 4.2))]
    return out
def e_x(y=44, dx=15):
    out = []
    for sx in (-1, 1):
        c = 50 + sx * dx
        out += [inkline((c - 6, y - 6), (c + 6, y + 6), w=4.6), inkline((c + 6, y - 6), (c - 6, y + 6), w=4.6)]
    return out
def brows_angry(y=33, dx=15):
    return [inkline((50 - dx - 9, y - 4), (50 - dx + 7, y + 4), w=5), inkline((50 + dx + 9, y - 4), (50 + dx - 7, y + 4), w=5)]

# bocas
def m_smile(y=62, w=20, d=10):
    return [Layer(stroke(arc(50, y - d, w, 25, 155, d + 4), 4.6), INK)]
def m_big(y=60):
    mouth = D(ellipse(50, y, 22, 20), rrect(0, 0, 100, y))
    tongue = I(ellipse(50, y + 20, 14, 9), mouth)
    return [Part(mouth, '#5a1820', shade=False, hl=False, sep=False, outline=False), Part(tongue, '#e2606a', flat=True, sep=False, outline=False),
            Part(I(rrect(28, y, 44, 5, 1), mouth), 'white', flat=True, sep=False, outline=False)]
def m_teeth(y=60, w=27, h=18):
    teeth = D(ellipse(50, y, w, h), rrect(0, 0, 100, y - 2))
    return [Part(U(teeth, rrect(50 - w, y - 3, 2 * w, 5, 2)), 'white', sep=False, hl=False, shade=False,
                 lines=[polyline((50 - w, y + 6), (50 + w, y + 6)), polyline((38, y - 2), (38, y + 18)), polyline((50, y - 2), (50, y + 20)), polyline((62, y - 2), (62, y + 18))], lw=2.4)]
def m_flat(y=66, w=14):
    return [inkline((50 - w, y), (50 + w, y), w=4.6)]
def m_frown(y=70, w=16):
    return [Layer(stroke(arc(50, y + 8, w, 205, 335, 10), 4.6), INK)]
def m_o(y=68, r=7):
    return [Part(ellipse(50, y, r * 0.85, r), '#5a1820', flat=True, sep=False, outline=False)]

@icon('🙂')
def slight_smile(): return [head(), *e_dot(), *m_smile(64, 17, 6)]
@icon('😊')
def blush():
    return [head(), *e_happy(), Layer(ellipse(26, 60, 8, 5), alpha('#ff7a6a', 0.55)), Layer(ellipse(74, 60, 8, 5), alpha('#ff7a6a', 0.55)), *m_smile(64, 18, 8)]
@icon('😁')
def grin(): return [head(), *e_happy(44), *m_teeth(62)]
@icon('😅')
def sweat_smile():
    drop = blob((84, 14), (90, 26), (88, 34), (82, 36), (77, 30), (79, 22))
    return [head(), *e_happy(44), *m_big(60), Part(drop, 'water', sh=2.5)]
@icon('😇')
def halo():
    ring = D(ellipse(50, 10, 30, 8), ellipse(50, 10, 22, 4.5))
    return [head(), *e_happy(48), *m_smile(66, 18, 8), Part(ring, 'gold', sh=2, hd=1)]
@icon('😉')
def wink():
    return [head(), ink(ellipse(35, 44, 4.7, 6)), Layer(stroke(arc(65, 48, 8, 200, 340), 5), INK), *m_smile(64, 19, 8)]
@icon('😎')
def cool():
    lens = U(rrect(16, 34, 30, 18, 7), rrect(54, 34, 30, 18, 7), rrect(40, 36, 20, 5, 2))
    return [head(), Part(lens, 'black', sep=False, sh=3), gloss(26, 40, 5, 2.5, 0, 0.7), gloss(64, 40, 5, 2.5, 0, 0.7), *m_smile(68, 16, 6)]
@icon('😏')
def smirk():
    return [head(), inkline((24, 42), (42, 42), w=4.4), inkline((58, 42), (76, 42), w=4.4), ink(ellipse(38, 46, 4, 4)), ink(ellipse(72, 46, 4, 4)),
            Layer(stroke(curve((36, 70), (52, 70), (66, 62)), 4.6), INK)]
@icon('😠')
def angry(): return [head('orange'), *brows_angry(), *e_dot(46, 15, 5.5), *m_frown(72)]
@icon('😡')
def rage(): return [head('red'), *brows_angry(), *e_dot(46, 15, 5.5), *m_frown(72, 18), Layer(rrect(36, 60, 28, 4, 2), alpha('#000000', 0.25))]
@icon('😨')
def fearful():
    top = I(circle(50, 52, 43), rrect(0, 0, 100, 34))
    return [head(), Part(top, '#6f8fd8', flat=True, outline=False, sep=False), *e_wide(46), *m_o(72, 8)]
@icon('😬')
def grimace():
    teeth = rrect(24, 58, 52, 18, 7)
    return [head(), *e_wide(40), Part(teeth, 'white', sep=False, shade=False, hl=False,
                                     lines=[polyline((24, 67), (76, 67)), polyline((36, 58), (36, 76)), polyline((50, 58), (50, 76)), polyline((64, 58), (64, 76))], lw=2.4)]
@icon('😴')
def sleeping():
    z = U(stroke(polyline((70, 6), (84, 6), (70, 20), (84, 20)), 3.6, join='miter'), stroke(polyline((84, 26), (94, 26), (84, 36), (94, 36)), 3, join='miter'))
    return [head(), *e_closed(48), *m_o(70, 6), Part(z, 'lilac', shade=False, hl=False)]
@icon('😵')
def dizzy(): return [head(), *e_x(42), *m_o(68, 8)]
@icon('😶')
def no_mouth(): return [head(), *e_dot(46)]
@icon('😷')
def mask():
    m = svg('M18 54 Q50 46 82 54 L80 74 Q50 90 20 74 Z')
    return [head(), *e_dot(40, 15, 5.5), Part(m, 'white', lines=[polyline((24, 62), (76, 62)), polyline((26, 70), (74, 70))], lw=2),
            inkline((18, 56), (8, 48), w=2.4), inkline((82, 56), (92, 48), w=2.4)]
@icon('🤐')
def zipper():
    zip_ = rrect(24, 60, 52, 10, 3)
    return [head(), *e_dot(), Part(zip_, 'steel', sh=2, lines=[polyline((30 + 6 * i, 60), (30 + 6 * i, 70)) for i in range(8)], lw=1.8),
            Part(rrect(70, 58, 10, 16, 3), 'steel', sh=2)]
@icon('🤔')
def thinking():
    hand = U(rrect(30, 70, 30, 20, 9), cap(44, 72, 58, 58, 5))
    return [head(), inkline((22, 30), (40, 26), w=4.4), inkline((60, 34), (76, 34), w=4.4), *e_dot(44, 15, 5.5),
            inkline((40, 64), (60, 60), w=4.4), Part(hand, 'face', sh=3)]
@icon('🤠')
def cowboy():
    brim = svg('M2 34 Q50 46 98 34 Q90 24 74 26 L26 26 Q10 24 2 34 Z')
    crown = svg('M26 28 Q28 4 42 6 Q50 10 58 6 Q72 4 74 28 Z')
    return [Part(circle(50, 58, 39), 'face', sh=7), *e_dot(56, 14, 5), *m_smile(74, 15, 6), Part(crown, 'wood'), Part(brim, 'wood', lines=[curve((24, 28), (50, 32), (76, 28))], lw=2.6)]
@icon('🤫')
def shush():
    fist = rrect(50, 70, 36, 26, 10)
    finger = U(cap(54, 80, 50, 48, 5.2))
    return [head(), *e_dot(40, 15, 5.5), Layer(stroke(arc(50, 70, 9, 200, 340, 5), 4.4), INK), Part(fist, 'face', sh=3, lines=[polyline((64, 72), (64, 84)), polyline((75, 72), (75, 84))], lw=2),
            Part(finger, 'face', sh=2), Part(rrect(46, 44, 8, 7, 3), '#ffe58c', flat=True, sep=False)]
@icon('🥰')
def love():
    def h(cx, cy, s):
        return scale(svg('M50 92 C20 70 6 52 6 34 C6 18 18 8 31 8 C40 8 46 13 50 20 C54 13 60 8 69 8 C82 8 94 18 94 34 C94 52 80 70 50 92 Z'), s, s, 50, 50).transform(1, 0, 0, 1, cx - 50, cy - 50)
    return [head(), *e_happy(46), *m_smile(64, 18, 8), Part(h(86, 22, 0.2), 'red', sh=2), Part(h(16, 26, 0.17), 'red', sh=2), Part(h(84, 78, 0.16), 'red', sh=2)]
@icon('☠')
def skull():
    sk = U(circle(50, 40, 28), rrect(34, 54, 32, 20, 6))
    bones = U(cap(16, 66, 84, 90, 4.4), cap(16, 90, 84, 66, 4.4), circle(14, 62, 5.6), circle(14, 94, 5.6), circle(86, 62, 5.6), circle(86, 94, 5.6))
    return [Part(bones, 'paper', sh=3), Part(sk, 'paper', lines=[polyline((45, 68), (45, 74)), polyline((55, 68), (55, 74))], lw=2.4),
            ink(ellipse(39, 42, 7, 8)), ink(ellipse(61, 42, 7, 8)), ink(poly((50, 52), (46, 60), (54, 60)))]
@icon('🦁')
def lion():
    pts = []
    import math as _m
    for i in range(16):
        a = _m.radians(i * 22.5); r = 47 if i % 2 == 0 else 38
        pts.append((50 + r * _m.cos(a), 52 + r * _m.sin(a)))
    mane = blob(pts)
    return [Part(mane, 'ginger'), Part(circle(50, 54, 28), 'sand', sh=5), Part(circle(30, 30, 7), 'sand', sh=2), Part(circle(70, 30, 7), 'sand', sh=2),
            *e_dot(48, 11, 4.5), Part(poly((42, 58), (58, 58), (50, 66)), 'brown', flat=True, sep=False), inkline((50, 66), (50, 72), w=2.6),
            Layer(stroke(arc(44, 70, 6, 20, 160), 2.6), INK), Layer(stroke(arc(56, 70, 6, 20, 160), 2.6), INK)]
@icon('👀')
def eyes():
    out = []
    for cx in (28, 72):
        out += [Part(ellipse(cx, 50, 20, 30), 'white', sh=5), ink(ellipse(cx + 6, 54, 9, 12)), gloss(cx + 3, 49, 3, 3, 0, 0.9)]
    return out
