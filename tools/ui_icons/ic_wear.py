# Roupas, bolsas e acessórios (boutique, guarda-roupa, inventário).
from iconlib import *
from icons import icon, gloss, ink, inkline

@icon('👕')
def tshirt():
    s = poly((30, 10), (40, 14), (60, 14), (70, 10), (96, 26), (86, 44), (76, 38), (76, 92), (24, 92), (24, 38), (14, 44), (4, 26))
    return [Part(s, 'blue', lines=[arc(50, 12, 11, 20, 160)], lw=3)]
@icon('🎽')
def tank():
    s = svg('M30 6 L38 6 Q40 22 50 22 Q60 22 62 6 L70 6 Q70 26 78 34 L78 94 L22 94 L22 34 Q30 26 30 6 Z')
    sash = poly((24, 40), (34, 34), (76, 80), (76, 92), (70, 94))
    return [Part(s, 'cyan'), Part(I(sash, s), 'red', flat=True, sep=False, outline=False)]
@icon('👔')
def tie():
    collar = U(poly((26, 6), (50, 22), (40, 34), (20, 18)), poly((74, 6), (50, 22), (60, 34), (80, 18)))
    knot = poly((42, 22), (58, 22), (55, 34), (45, 34))
    blade = poly((45, 34), (55, 34), (64, 78), (50, 96), (36, 78))
    return [Part(rrect(14, 4, 72, 94, 6), 'white', sh=5), Part(collar, 'white', sh=2), Part(blade, 'red', lines=[polyline((44, 50), (58, 44)), polyline((42, 66), (60, 58))], lw=2), Part(knot, 'red', sh=2)]
@icon('👖')
def jeans():
    p = svg('M22 6 L78 6 L84 94 L60 94 L52 36 L48 36 L40 94 L16 94 Z')
    return [Part(p, 'denim', lines=[polyline((22, 16), (78, 16)), polyline((50, 16), (50, 34)), curve((28, 22), (36, 30), (44, 22))], lw=2.4)]
@icon('🩳')
def shorts():
    p = svg('M14 18 L86 18 L92 76 L58 80 L50 48 L42 80 L8 76 Z')
    return [Part(p, 'orange', lines=[polyline((14, 28), (86, 28)), polyline((50, 28), (50, 46))], lw=2.4)]
@icon('🧥')
def coat():
    body = svg('M30 8 L50 18 L70 8 L94 24 L90 94 L60 94 L50 30 L40 94 L10 94 L6 24 Z')
    return [Part(body, 'brown', lines=[polyline((50, 30), (50, 94)), polyline((26, 54), (40, 54)), polyline((60, 54), (74, 54))], lw=2.4),
            Part(U(poly((30, 8), (50, 18), (42, 40)), poly((70, 8), (50, 18), (58, 40))), 'sand', sh=2), Part(circle(46, 64, 2.6), 'black', flat=True), Part(circle(46, 78, 2.6), 'black', flat=True)]
@icon('🦺')
def vest():
    v = svg('M28 6 L40 6 Q42 26 50 30 Q58 26 60 6 L72 6 Q74 24 84 30 L84 94 L16 94 L16 30 Q26 24 28 6 Z')
    return [Part(v, 'orange', lines=[polyline((50, 30), (50, 94))], lw=2.4), Part(I(rrect(0, 56, 100, 8), v), '#e6e8eb', flat=True, sep=False, outline=False),
            Part(I(rrect(0, 74, 100, 8), v), '#e6e8eb', flat=True, sep=False, outline=False)]
@icon('🧢')
def cap_():
    crown = svg('M14 64 Q12 24 50 20 Q86 22 86 60 Z')
    bill = svg('M10 60 L86 58 Q98 60 98 70 Q70 76 10 68 Z')
    return [Part(crown, 'red', lines=[curve((50, 20), (46, 40), (48, 60))], lw=2.2), Part(bill, 'red', sh=2), Part(circle(50, 20, 4), 'red', flat=True)]
@icon('👒')
def sunhat():
    return [Part(ellipse(50, 66, 46, 16), 'sand', sh=4), Part(svg('M24 64 Q24 28 50 28 Q76 28 76 64 Z'), 'sand', sh=4), Part(rrect(24, 52, 52, 10, 3), 'red', sh=2),
            Part(circle(70, 54, 7), 'pink', sh=2)]
@icon('🎩')
def tophat():
    return [Part(ellipse(50, 80, 46, 12), 'black', sh=3), Part(rrect(24, 14, 52, 66, 6), 'black', sh=5), Part(rrect(24, 58, 52, 10, 2), 'red', sh=2)]
@icon('⛑')
def rescue_helmet():
    h = svg('M10 66 Q10 22 50 18 Q90 22 90 66 Z')
    return [Part(h, 'white', sh=6), Part(U(rrect(44, 30, 12, 32, 2), rrect(34, 40, 32, 12, 2)), 'red', sh=2), Part(rrect(4, 62, 92, 10, 4), 'white', sh=2)]
@icon('🪖')
def mil_helmet():
    h = svg('M8 68 Q8 20 50 18 Q92 20 92 68 Z')
    return [Part(h, 'olive', sh=7, lines=[curve((20, 46), (50, 40), (80, 46))], lw=2.4), Part(rrect(2, 62, 96, 12, 5), 'olive', sh=2)]
@icon('🕶')
def sunglasses():
    l = svg('M8 34 L46 34 Q46 62 28 62 Q10 62 8 34 Z')
    return [Part(stroke(polyline((10, 34), (90, 34)), 5), 'black', shade=False), Part(l, 'black', sh=4), Part(flipx(l), 'black', sh=4),
            gloss(22, 42, 6, 3, 20, 0.6), gloss(62, 42, 6, 3, 20, 0.6)]
@icon('🧤')
def gloves():
    g = U(rrect(14, 34, 34, 40, 10), *[cap(18 + 8 * i, 38, 18 + 8 * i, 14 + (4 if i in (0, 3) else 0), 4.2) for i in range(4)], cap(46, 54, 56, 42, 4.6))
    return [Part(move(g, 34, 10), 'red', sh=4), Part(g, 'red', sh=4), Part(rrect(14, 72, 34, 14, 3), 'black', sh=2), Part(rrect(48, 82, 34, 14, 3), 'black', sh=2)]
@icon('👞')
def dress_shoe():
    s = svg('M4 66 Q4 50 20 48 L44 44 Q56 40 66 48 L90 58 Q98 62 96 74 L96 80 L4 80 Z')
    return [Part(s, 'brown', lines=[curve((30, 46), (40, 56), (52, 50))], lw=2.4), Part(rrect(4, 76, 92, 10, 3), 'black', sh=1.5)]
@icon('👟')
def sneaker():
    s = svg('M6 62 Q6 40 22 38 L40 36 L60 52 L88 58 Q98 62 96 74 L4 74 Z')
    return [Part(s, 'red', lines=[polyline((42, 42), (36, 50)), polyline((50, 48), (44, 56))], lw=2.4), Part(rrect(4, 70, 94, 12, 5), 'white', sh=2),
            Part(svg('M20 52 Q34 60 52 58 L54 64 Q32 66 18 58 Z'), 'white', flat=True, sep=False)]
@icon('🥾')
def boot():
    s = svg('M18 10 L52 10 L54 56 L86 64 Q96 68 94 80 L18 80 Z')
    return [Part(s, 'wood', lines=[polyline((26, 22), (48, 22)), polyline((26, 32), (48, 32)), polyline((26, 42), (48, 42))], lw=2.4), Part(rrect(16, 78, 80, 12, 3), 'black', sh=2)]
@icon('🩴')
def flipflop():
    sole = rot(ellipse(50, 54, 24, 44), 25, 50, 54)
    strap = U(stroke(curve((52, 24), (38, 46), (32, 64)), 5), stroke(curve((52, 24), (62, 44), (72, 56)), 5))
    return [Part(sole, 'yellow', sh=4), Part(strap, 'blue', shade=False)]
@icon('👛')
def purse():
    body = svg('M14 44 Q14 30 30 30 L70 30 Q86 30 86 44 L84 84 Q82 92 72 92 L28 92 Q18 92 16 84 Z')
    return [Part(U(circle(42, 26, 6), circle(58, 26, 6)), 'gold', sh=2), Part(body, 'pink', sh=6), Part(rrect(14, 44, 72, 6, 2), 'gold', sh=1.5)]
@icon('👜')
def handbag():
    handle = D(rrect(26, 8, 48, 50, 22), rrect(34, 16, 32, 40, 16))
    body = svg('M10 44 L90 44 L84 94 L16 94 Z')
    return [Part(handle, 'brown', sh=2), Part(body, 'red', sh=6), Part(rrect(42, 52, 16, 12, 3), 'gold', sh=2)]
@icon('👝')
def pouch():
    body = svg('M14 40 Q14 30 26 30 L74 30 Q86 30 86 40 L82 86 Q80 94 70 94 L30 94 Q20 94 18 86 Z')
    return [Part(body, 'purple', sh=6), Part(svg('M14 40 L86 40 L50 62 Z'), 'purple', sh=3), Part(circle(50, 58, 5), 'gold', sh=1.5)]
@icon('🎒')
def backpack():
    body = rrect(18, 18, 64, 78, 18)
    pocket = rrect(28, 56, 44, 32, 8)
    return [Part(D(rrect(36, 4, 28, 26, 12), rrect(43, 10, 14, 16, 6)), 'brown'),
            Part(body, 'orange'), Part(pocket, 'orange', lines=[polyline((28, 66), (72, 66))]),
            Part(rrect(46, 62, 8, 9, 2), 'iron', sep=False)]
@icon('🧳')
def luggage():
    handle = D(rrect(36, 6, 28, 22, 8), rrect(42, 12, 16, 16, 4))
    return [Part(handle, 'black', sh=2), Part(rrect(16, 22, 68, 68, 10), 'teal', sh=6, lines=[polyline((36, 26), (36, 86)), polyline((64, 26), (64, 86))], lw=2.6),
            Part(circle(28, 94, 5), 'rubber', sh=1.5), Part(circle(72, 94, 5), 'rubber', sh=1.5)]
@icon('💼')
def briefcase():
    handle = D(rrect(34, 10, 32, 22, 8), rrect(40, 16, 20, 16, 4))
    return [Part(handle, 'brown', sh=2), Part(rrect(8, 26, 84, 64, 10), 'brown', sh=6, lines=[polyline((8, 50), (92, 50))], lw=2.6), Part(rrect(42, 44, 16, 12, 3), 'gold', sh=2)]
@icon('💍')
def ring():
    band = D(circle(50, 62, 30), circle(50, 62, 21))
    gem = poly((36, 26), (50, 12), (64, 26), (50, 40))
    return [Part(band, 'gold', sh=5), Part(gem, 'glass', sh=3, lines=[polyline((36, 26), (64, 26)), polyline((50, 12), (50, 40))], lw=1.6)]
@icon('📿')
def beads():
    import math
    beads_ = [circle(50 + 32 * math.cos(math.radians(a)), 42 + 30 * math.sin(math.radians(a)), 6) for a in range(0, 360, 30)]
    return [Part(U(*beads_), 'wood', sh=2), Part(U(rrect(46, 72, 8, 22, 2), rrect(40, 80, 20, 7, 2)), 'gold', sh=2)]
@icon('⌚')
def watch():
    strap = rrect(32, 2, 36, 96, 10)
    return [Part(strap, 'black', sh=3), Part(circle(50, 50, 26), 'steel', sh=5), Part(circle(50, 50, 19), 'white', shade=False),
            inkline((50, 50), (50, 37), w=3.4), inkline((50, 50), (60, 55), w=3.4), Part(rrect(76, 44, 8, 12, 2), 'steel', sh=1)]
@icon('👑')
def crown():
    c = poly((10, 30), (30, 52), (50, 18), (70, 52), (90, 30), (84, 82), (16, 82))
    return [Part(c, 'gold', sh=7), Part(rrect(16, 70, 68, 12, 2), 'gold', sh=2), Part(circle(50, 60, 6), 'red', sh=2), Part(circle(30, 64, 4.5), 'blue', sh=1.5), Part(circle(70, 64, 4.5), 'leaf', sh=1.5),
            *[Part(circle(x, y, 5), 'gold', sh=1.5) for x, y in ((10, 28), (50, 16), (90, 28))]]
