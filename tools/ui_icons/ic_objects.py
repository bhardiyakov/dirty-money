# Objetos: dinheiro, ferramentas, eletrônicos, casa, crime, jogos de bar.
from iconlib import *
from icons import icon, gloss, ink, inkline, inkcurve
import math

# ---------------------------------------------------------------------------- dinheiro
@icon('💵')
def banknote():
    note = rrect(4, 22, 92, 56, 6)
    return [Part(move(note, 4, 6), 'cash', sh=3), Part(note, 'cash', sh=5, lines=[rrect(12, 30, 76, 40, 4)], lw=2), Part(circle(50, 50, 13), 'cash', sh=2),
            Layer(stroke(svg('M55 43 C50 40 44 42 45 47 C46 52 55 50 55 55 C55 60 49 61 44 58'), 3.4), '#2f5f2a'), inkline((50, 38), (50, 62), w=2.6)]
@icon('💸')
def money_wings():
    note = rrect(26, 30, 48, 34, 5)
    wing = svg('M26 40 Q10 26 2 30 Q8 36 6 40 Q12 42 10 46 Q18 48 26 52 Z')
    return [Part(wing, 'white', sh=2), Part(flipx(wing), 'white', sh=2), Part(note, 'cash', sh=4, lines=[rrect(31, 35, 38, 24, 3)], lw=1.8), Part(circle(50, 47, 7), 'cash', sh=1.5)]
@icon('💰')
def money_bag():
    bag = blob((50, 30), (70, 34), (86, 56), (86, 80), (72, 94), (28, 94), (14, 80), (14, 56), (30, 34))
    neck = poly((38, 18), (62, 18), (58, 32), (42, 32))
    return [Part(bag, 'sand'), Part(neck, 'sand'), Part(rrect(34, 26, 32, 8, 4), 'brown'),
            Layer(stroke(svg('M57 54 C49 49 40 52 42 58 C44 64 58 62 59 70 C60 78 49 82 41 77'), 5), '#2f5f2a'), Layer(stroke(polyline((50, 46), (50, 86)), 4), '#2f5f2a')]
@icon('🪙')
def coin():
    return [Part(ellipse(50, 50, 42, 44), 'gold', sh=7), Part(ellipse(50, 50, 30, 32), 'gold', sh=3, lines=[], hd=2), Layer(stroke(svg('M58 38 C50 34 40 36 42 44 C44 52 60 50 60 58 C60 66 50 68 42 62'), 4.4), '#9a6c1d'),
            Layer(stroke(polyline((50, 30), (50, 72)), 3.4), '#9a6c1d')]
@icon('💳')
def card():
    c = rrect(4, 20, 92, 62, 8)
    return [Part(c, 'blue', sh=5), Part(I(rrect(0, 32, 100, 12), c), 'black', flat=True, sep=False, outline=False), Part(rrect(14, 52, 18, 14, 3), 'gold', sh=2),
            Layer(U(rrect(40, 56, 40, 4, 2), rrect(40, 66, 26, 4, 2)), alpha('#ffffff', 0.7))]
@icon('💎')
def gem():
    g = poly((22, 18), (78, 18), (96, 40), (50, 94), (4, 40))
    return [Part(g, 'cyan', sh=6, lines=[polyline((4, 40), (96, 40)), polyline((36, 18), (28, 40), (50, 94)), polyline((64, 18), (72, 40), (50, 94)), polyline((50, 18), (36, 40)), polyline((50, 18), (64, 40))], lw=2, lc='#1b8396'),
            gloss(30, 28, 6, 3, -10, 0.7)]
@icon('🧾')
def receipt():
    r = poly((16, 4), (84, 4), (84, 92), (76, 86), (68, 92), (59, 86), (50, 92), (41, 86), (32, 92), (24, 86), (16, 92))
    return [Part(r, 'paper', sh=5, lines=[polyline((26, 20), (74, 20)), polyline((26, 34), (60, 34)), polyline((26, 48), (74, 48)), polyline((26, 62), (54, 62)), polyline((60, 72), (74, 72))], lw=3)]
@icon('🧮')
def abacus():
    frame = D(rrect(6, 10, 88, 80, 6), rrect(14, 18, 72, 64, 2))
    rods = [polyline((14, 30 + 16 * i), (86, 30 + 16 * i)) for i in range(4)]
    beads_ = U(*[ellipse(x, 30 + 16 * i, 6, 6) for i, xs in enumerate([(22, 32, 66), (22, 54, 64, 74), (30, 40, 76), (22, 60)]) for x in xs])
    return [Part(rrect(14, 18, 72, 64, 2), 'paper', flat=True, lines=rods, lw=2.2), Part(beads_, 'red', sh=2), Part(frame, 'wood', sh=4)]

# ---------------------------------------------------------------------------- ferramentas
@icon('🔧')
def wrench():
    head = D(circle(28, 28, 22), poly((18, 0), (40, 0), (34, 30), (22, 30)), circle(28, 6, 9))
    return [Part(U(rot(head, -45, 28, 28), cap(36, 36, 84, 84, 9)), 'steel', lines=[polyline((44, 50), (78, 84))], lw=2)]
@icon('🔩')
def nut_bolt():
    hexa = poly([(30 + 20 * math.cos(math.radians(60 * i)), 30 + 20 * math.sin(math.radians(60 * i))) for i in range(6)])
    nut = poly([(70 + 18 * math.cos(math.radians(60 * i + 30)), 72 + 18 * math.sin(math.radians(60 * i + 30))) for i in range(6)])
    return [Part(rot(rrect(24, 34, 12, 54, 3), -40, 30, 30), 'steel', sh=2, lines=[rot(polyline((24, 46 + 8 * i), (36, 50 + 8 * i)), -40, 30, 30) for i in range(5)], lw=1.8),
            Part(hexa, 'steel', sh=4), Part(D(nut, circle(70, 72, 7)), 'metal', sh=4)]
@icon('🪛')
def screwdriver():
    return [Part(rot(rrect(46, 4, 8, 50, 2), 45, 50, 50), 'steel', sh=2), Part(rot(rrect(40, 50, 20, 46, 8), 45, 50, 50), 'red', sh=4, lines=[rot(polyline((50, 56), (50, 90)), 45, 50, 50)], lw=2.4)]
@icon('🛠')
def hammer_wrench():
    hammer = U(rot(rrect(44, 30, 12, 66, 4), -45, 50, 50), rot(rrect(26, 8, 48, 22, 4), -45, 50, 50))
    wr = rot(U(D(circle(50, 14, 14), rrect(44, 0, 12, 14)), rrect(44, 20, 12, 74, 5)), 45, 50, 50)
    return [Part(wr, 'steel', sh=3), Part(rot(rrect(44, 30, 12, 66, 4), -45, 50, 50), 'wood', sh=3), Part(rot(rrect(26, 8, 48, 22, 4), -45, 50, 50), 'iron', sh=3)]
@icon('🧰')
def toolbox():
    handle = D(rrect(30, 8, 40, 22, 8), rrect(38, 14, 24, 16, 4))
    return [Part(handle, 'iron', sh=2), Part(rrect(6, 26, 88, 66, 6), 'red', sh=6, lines=[polyline((6, 46), (94, 46))], lw=3), Part(rrect(40, 40, 20, 12, 3), 'steel', sh=2)]
@icon('✂')
def scissors():
    blades = U(rot(rrect(46, 4, 9, 56, 4), -18, 50, 56), rot(rrect(46, 4, 9, 56, 4), 18, 50, 56))
    rings = U(D(circle(30, 78, 15), circle(30, 78, 8)), D(circle(70, 78, 15), circle(70, 78, 8)))
    return [Part(blades, 'steel', sh=2), Part(rings, 'red', sh=3), Part(circle(50, 56, 4), 'iron', flat=True)]
@icon('🔪')
def knife():
    blade = svg('M4 86 Q30 52 62 34 L72 48 Q40 76 4 86 Z')
    handle = rot(rrect(64, 22, 34, 16, 6), -33, 81, 30)
    return [Part(blade, 'steel', sh=4, lines=[curve((14, 78), (40, 60), (64, 44))], lw=1.6, lc='#87909d'), Part(handle, 'black', sh=3),
            Part(circle(76, 33, 2.4), 'steel', flat=True), Part(circle(87, 26, 2.4), 'steel', flat=True)]
@icon('🔫')
def pistol():
    body = svg('M6 26 L90 26 L90 44 L58 44 L52 52 L46 52 L42 46 L36 46 L44 90 L20 90 L14 54 L6 50 Z')
    return [Part(body, 'iron', sh=5, lines=[polyline((10, 34), (86, 34))], lw=2.4), Part(rrect(18, 54, 22, 34, 4, -10), 'brown', sh=3), Part(stroke(arc(46, 50, 8, 0, 180), 3.2), 'iron', shade=False)]
@icon('💣')
def bomb():
    return [Part(stroke(curve((64, 26), (74, 12), (88, 14)), 4.4), 'brown', shade=False), Layer(U(*[rot(cap(90, 4, 90, 10, 2.2), a, 90, 14) for a in (-60, 0, 60, 120)]), '#ffd35a'),
            Part(rrect(54, 22, 18, 14, 3, 40), 'iron', sh=2), Part(circle(44, 60, 36), 'black', sh=8), gloss(32, 46, 9, 6, -30, 0.45)]
@icon('🧪')
def test_tube():
    tube = rot(rrect(38, 4, 24, 90, 12), 30, 50, 50)
    liquid = I(tube, rot(rrect(30, 50, 40, 50), 30, 50, 50))
    return [Part(tube, 'glass', sh=3), Part(liquid, 'green', flat=True, sep=False, outline=False), Layer(U(circle(56, 62, 3), circle(48, 72, 2.4)), alpha('#ffffff', 0.7)),
            Part(rot(rrect(34, 2, 32, 8, 3), 30, 50, 50), 'glass', sh=1.5)]
@icon('💊')
def pill():
    p = rrect(8, 32, 84, 36, 18, -35)
    half = I(p, rot(rrect(50, 0, 60, 100), -35, 50, 50))
    return [Part(p, 'white', sh=5), Part(half, 'red', flat=True, sep=False, outline=False), gloss(30, 44, 8, 3, -35, 0.6)]
@icon('🩹')
def bandage():
    b = rrect(4, 34, 92, 32, 12, -35)
    pad = rrect(34, 34, 32, 32, 3, -35)
    return [Part(b, 'sand', sh=4), Part(pad, 'paper', sh=2, lines=[], lw=2), Layer(U(*[circle(50 + dx, 50 + dy, 1.6) for dx in (-6, 0, 6) for dy in (-6, 0, 6)]), '#a7864c')]
@icon('🩸')
def blood_drop():
    return [Part(svg('M50 4 Q74 40 80 58 Q86 92 50 96 Q14 92 20 58 Q26 40 50 4 Z'), 'blood', sh=7), gloss(36, 62, 5, 10, 15, 0.5)]
@icon('🦴')
def bone():
    b = U(cap(24, 76, 76, 24, 9), circle(18, 70, 10), circle(30, 82, 10), circle(70, 18, 10), circle(82, 30, 10))
    return [Part(b, 'paper', sh=5)]
@icon('🫁')
def lungs():
    l = svg('M44 30 Q30 18 18 34 Q6 56 10 80 Q14 94 30 90 Q44 86 44 70 Z')
    return [Part(U(rrect(45, 6, 10, 30, 4), stroke(polyline((50, 30), (40, 44)), 6), stroke(polyline((50, 30), (60, 44)), 6)), 'pink', sh=2), Part(l, 'pink', sh=6), Part(flipx(l), 'pink', sh=6)]
@icon('🪽')
def wing():
    w = svg('M8 80 Q14 36 50 18 Q76 6 94 12 Q88 22 80 26 Q90 30 90 34 Q78 40 70 40 Q80 46 78 50 Q66 54 56 54 Q64 60 60 64 Q44 70 36 70 Q22 80 8 80 Z')
    return [Part(w, 'white', sh=5, lines=[curve((36, 40), (60, 28), (84, 24)), curve((30, 52), (54, 44), (74, 44)), curve((22, 64), (44, 58), (58, 60))], lw=2)]

# ---------------------------------------------------------------------------- casa
@icon('🛋')
def couch():
    return [Part(rrect(12, 24, 76, 40, 10), 'teal', sh=5), Part(rrect(4, 44, 24, 38, 8), 'teal', sh=3), Part(rrect(72, 44, 24, 38, 8), 'teal', sh=3),
            Part(rrect(24, 56, 52, 24, 4), 'teal', sh=3, lines=[polyline((50, 56), (50, 80))], lw=2.4), Part(U(rrect(10, 82, 6, 12, 2), rrect(84, 82, 6, 12, 2)), 'wood', sh=1)]
@icon('🛏')
def bed():
    return [Part(rrect(4, 30, 12, 64, 3), 'wood', sh=3), Part(rrect(84, 52, 12, 42, 3), 'wood', sh=3), Part(rrect(10, 56, 80, 22, 4), 'blue', sh=4),
            Part(rrect(16, 40, 26, 18, 8), 'white', sh=3)]
@icon('🛌')
def in_bed():
    return [Part(rrect(4, 30, 12, 64, 3), 'wood', sh=3), Part(rrect(84, 52, 12, 42, 3), 'wood', sh=3), Part(rrect(16, 40, 26, 18, 8), 'white', sh=3),
            Part(circle(30, 40, 11), 'skin2', sh=3), Part(svg('M10 56 Q40 44 90 56 L90 78 L10 78 Z'), 'blue', sh=4)]
@icon('🪑')
def chair():
    return [Part(rrect(24, 6, 52, 46, 6), 'wood', sh=4, lines=[polyline((34, 18), (66, 18)), polyline((34, 30), (66, 30))], lw=2.4), Part(rrect(18, 50, 64, 12, 3), 'wood', sh=2),
            Part(U(rrect(22, 60, 8, 36, 2), rrect(70, 60, 8, 36, 2)), 'brown', sh=2)]
@icon('💺')
def seat():
    return [Part(rrect(18, 4, 50, 66, 14), 'blue', sh=5), Part(rrect(14, 58, 64, 22, 8), 'blue', sh=3), Part(rrect(70, 36, 20, 10, 4), 'iron', sh=2), Part(rrect(36, 80, 10, 16, 2), 'iron', sh=2)]
@icon('🪴')
def plant():
    leaves = U(ellipse(34, 34, 12, 26, -30), ellipse(66, 34, 12, 26, 30), ellipse(50, 26, 12, 26))
    return [Part(leaves, 'leaf', sh=4, lines=[polyline((50, 50), (50, 8)), polyline((50, 52), (28, 18)), polyline((50, 52), (72, 18))], lw=2), Part(svg('M24 54 L76 54 L68 96 L32 96 Z'), 'orange', sh=5),
            Part(rrect(20, 50, 60, 10, 3), 'orange', sh=2)]
@icon('🗑')
def trash():
    return [Part(rrect(40, 4, 20, 10, 3), 'metal', sh=1.5), Part(rrect(10, 12, 80, 12, 4), 'metal', sh=2),
            Part(svg('M16 26 L84 26 L76 96 L24 96 Z'), 'metal', sh=5, lines=[polyline((36, 36), (38, 86)), polyline((50, 36), (50, 86)), polyline((64, 36), (62, 86))], lw=3)]
@icon('🧺')
def basket():
    handle = D(ellipse(50, 40, 34, 30), ellipse(50, 40, 26, 22), rrect(0, 40, 100, 60))
    return [Part(handle, 'wood', sh=2), Part(svg('M6 42 L94 42 L84 94 L16 94 Z'), 'sand', sh=5, lines=[polyline((10, 56), (90, 56)), polyline((12, 70), (88, 70)), polyline((14, 84), (86, 84)), polyline((32, 42), (34, 94)), polyline((50, 42), (50, 94)), polyline((68, 42), (66, 94))], lw=2)]
@icon('🧽')
def sponge():
    return [Part(rrect(8, 28, 84, 50, 8), 'yellow', sh=5), Part(rrect(8, 66, 84, 14, 4), 'leaf', sh=2), Layer(U(*[circle(x, y, 2.8) for x, y in ((24, 40), (40, 50), (60, 38), (76, 52), (30, 58), (54, 58))]), '#c2951a')]
@icon('🧶')
def yarn():
    return [Part(stroke(curve((70, 80), (86, 90), (96, 80)), 4), 'red', shade=False), Part(circle(46, 52, 40), 'red', sh=7, lines=[curve((10, 40), (40, 30), (70, 20)), curve((10, 60), (50, 44), (84, 36)), curve((20, 80), (54, 62), (86, 60)), curve((40, 90), (64, 76), (80, 80))], lw=2.4)]
@icon('💡')
def bulb():
    glass = svg('M50 4 Q82 4 84 34 Q84 52 66 64 L66 72 L34 72 L34 64 Q16 52 16 34 Q18 4 50 4 Z')
    return [Part(glass, 'yellow', sh=6), Part(rrect(34, 70, 32, 20, 4), 'metal', sh=3, lines=[polyline((34, 77), (66, 77)), polyline((34, 84), (66, 84))], lw=2), Part(rrect(42, 88, 16, 8, 3), 'iron', sh=1.5),
            Layer(stroke(polyline((42, 64), (42, 46), (50, 40), (58, 46), (58, 64)), 2.4), '#c2951a'), gloss(34, 24, 6, 10, 20, 0.6)]
@icon('🔌')
def plug():
    return [Part(stroke(curve((50, 76), (50, 90), (30, 96)), 6), 'black', shade=False), Part(U(rrect(34, 4, 8, 22, 2), rrect(58, 4, 8, 22, 2)), 'steel', sh=1.5),
            Part(svg('M22 22 L78 22 L78 52 Q78 72 58 76 L42 76 Q22 72 22 52 Z'), 'white', sh=5)]
@icon('🔋')
def battery():
    return [Part(rrect(4, 26, 84, 48, 8), 'black', sh=4), Part(rrect(86, 40, 10, 20, 3), 'black', sh=1.5), Part(rrect(12, 34, 52, 32, 3), 'green', sh=3)]

# ---------------------------------------------------------------------------- eletrônicos
@icon('📱')
def phone():
    return [Part(rrect(22, 4, 56, 92, 10), 'black', sh=4), Part(rrect(28, 14, 44, 68, 3), 'blue', sh=0.1, shade=False), Layer(rrect(42, 86, 16, 4, 2), '#5a616c'), gloss(38, 30, 5, 12, 20, 0.35)]
@icon('📟')
def pager():
    return [Part(rrect(8, 22, 84, 58, 10), 'black', sh=5), Part(rrect(16, 30, 52, 24, 3), 'cash', shade=False), Layer(stroke(polyline((22, 42), (60, 42)), 3), '#2f5f2a'),
            Part(U(circle(80, 40, 5), circle(80, 62, 5)), 'grey', sh=1.5), Part(rrect(16, 60, 52, 10, 3), 'grey', sh=1.5)]
@icon('📞')
def receiver():
    r = svg('M14 30 Q12 18 24 14 L34 12 L42 30 L34 38 Q42 56 58 66 L66 58 L84 66 L82 76 Q78 88 66 86 Q30 76 14 30 Z')
    return [Part(r, 'black', sh=6), gloss(26, 22, 4, 3, -30, 0.5)]
@icon('💻')
def laptop():
    return [Part(rrect(16, 12, 68, 52, 5), 'iron', sh=3), Part(rrect(22, 18, 56, 40, 2), 'blue', shade=False, sep=False), Part(svg('M6 66 L94 66 L98 82 Q98 86 94 86 L6 86 Q2 86 2 82 Z'), 'steel', sh=3),
            Layer(rrect(40, 74, 20, 4, 2), '#87909d'), gloss(34, 28, 4, 8, 20, 0.35)]
@icon('🖥')
def desktop():
    return [Part(rrect(6, 8, 88, 62, 6), 'iron', sh=4), Part(rrect(12, 14, 76, 48, 2), 'blue', shade=False, sep=False), Part(rrect(42, 70, 16, 14, 2), 'steel', sh=2), Part(rrect(26, 84, 48, 10, 3), 'steel', sh=2)]
@icon('💾')
def floppy():
    return [Part(svg('M6 10 Q6 6 10 6 L80 6 L94 20 L94 90 Q94 94 90 94 L10 94 Q6 94 6 90 Z'), 'blue', sh=6), Part(rrect(24, 6, 48, 30, 2), 'steel', sh=2), Part(rrect(56, 12, 10, 18, 1), 'blue', flat=True),
            Part(rrect(18, 52, 64, 42, 3), 'white', sh=2, lines=[polyline((26, 64), (74, 64)), polyline((26, 76), (74, 76))], lw=2.4)]
@icon('📺')
def tv():
    return [Part(U(stroke(polyline((34, 4), (50, 20), (66, 4)), 3.4)), 'iron', shade=False), Part(rrect(4, 20, 92, 64, 10), 'wood', sh=6), Part(rrect(12, 28, 60, 48, 8), 'glass', sh=3),
            Part(U(circle(84, 38, 5), circle(84, 56, 5)), 'iron', sh=1.5), Part(U(rrect(16, 84, 10, 10, 2), rrect(74, 84, 10, 10, 2)), 'iron', sh=1)]
@icon('📻')
def radio():
    return [Part(stroke(polyline((20, 26), (60, 4)), 3), 'iron', shade=False), Part(rrect(4, 26, 92, 62, 10), 'red', sh=6), Part(circle(30, 58, 18), 'iron', sh=3, lines=[polyline((18, 50), (42, 50)), polyline((16, 58), (44, 58)), polyline((18, 66), (42, 66))], lw=2.4, lc='#717986'),
            Part(rrect(56, 38, 32, 16, 3), 'paper', sh=2), Part(U(circle(62, 70, 6), circle(80, 70, 6)), 'iron', sh=1.5)]
@icon('📸')
def camera_flash():
    return [Layer(U(*[rot(cap(80, 2, 80, 10, 2.2), a, 80, 14) for a in (-50, 0, 50)]), '#ffd35a'), Part(rrect(4, 26, 92, 64, 10), 'iron', sh=6), Part(rrect(16, 18, 24, 12, 3), 'iron', sh=2),
            Part(circle(50, 58, 22), 'steel', sh=4), Part(circle(50, 58, 13), 'navy', sh=2), gloss(45, 53, 4, 3, 0, 0.7), Part(rrect(72, 34, 14, 8, 2), 'yellow', flat=True)]
@icon('📹')
def video_camera():
    return [Part(poly((66, 44), (96, 26), (96, 74), (66, 56)), 'iron', sh=4), Part(rrect(4, 28, 66, 48, 8), 'iron', sh=5), Part(circle(22, 18, 10), 'iron', sh=2), Part(circle(46, 18, 10), 'iron', sh=2),
            Part(circle(20, 52, 7), 'red', flat=True)]
@icon('📡')
def satellite():
    dish = svg('M14 18 Q14 70 66 70 Z')
    return [Part(U(rrect(40, 70, 12, 22, 2), rrect(26, 88, 40, 8, 2)), 'iron', sh=2), Part(dish, 'steel', sh=6), Part(stroke(polyline((36, 50), (70, 18)), 3.6), 'iron', shade=False), Part(circle(72, 16, 6), 'red', sh=1.5),
            Layer(U(stroke(arc(72, 16, 14, -80, 10), 3), stroke(arc(72, 16, 22, -80, 10), 3)), '#2fc3d9')]
@icon('📶')
def signal():
    return [Part(U(*[rrect(10 + 22 * i, 74 - 20 * i, 16, 22 + 20 * i, 3) for i in range(4)]), 'green', sh=3)]
@icon('🔊')
def speaker():
    sp = poly((8, 36), (28, 36), (54, 12), (54, 88), (28, 64), (8, 64))
    return [Part(sp, 'iron', sh=5), Part(U(stroke(arc(58, 50, 16, -50, 50), 5), stroke(arc(58, 50, 30, -50, 50), 5)), 'cyan', shade=False)]
@icon('🔇')
def mute():
    sp = poly((8, 36), (28, 36), (54, 12), (54, 88), (28, 64), (8, 64))
    return [Part(sp, 'iron', sh=5), Part(U(cap(66, 34, 92, 66, 4.4), cap(92, 34, 66, 66, 4.4)), 'red', shade=False)]
@icon('📢')
def loudspeaker():
    horn = poly((18, 38), (74, 10), (74, 90), (18, 62))
    return [Part(rrect(28, 60, 18, 30, 4, -20), 'iron', sh=2), Part(horn, 'red', sh=6), Part(rrect(6, 36, 16, 28, 4), 'iron', sh=2), Part(ellipse(76, 50, 8, 40), 'white', sh=3)]
@icon('📣')
def megaphone():
    horn = poly((18, 42), (78, 16), (78, 84), (18, 58))
    return [Part(horn, 'orange', sh=6), Part(rrect(4, 40, 18, 20, 4), 'iron', sh=2), Part(ellipse(80, 50, 8, 34), 'white', sh=3), Part(rrect(30, 60, 12, 24, 4, 10), 'iron', sh=2)]
@icon('📯')
def horn():
    tube = U(stroke(curve((10, 60), (30, 74), (56, 66), (66, 46), (52, 30), (36, 40), (42, 56)), 8))
    bell = poly((64, 50), (96, 26), (96, 82))
    return [Part(tube, 'brass', sh=2), Part(bell, 'brass', sh=5), Part(rrect(4, 54, 12, 12, 3), 'brass', sh=1.5)]

# ---------------------------------------------------------------------------- papel, escritório
@icon('📰')
def newspaper():
    return [Part(rrect(4, 14, 92, 76, 4), 'paper', sh=5, lines=[polyline((12, 26), (88, 26)), polyline((52, 40), (88, 40)), polyline((52, 52), (88, 52)), polyline((52, 64), (88, 64)), polyline((12, 78), (88, 78))], lw=3.4),
            Part(rrect(12, 36, 32, 32, 2), 'grey', sh=2)]
@icon('📖')
def open_book():
    l = svg('M50 22 Q30 10 6 14 L6 84 Q30 80 50 92 Z')
    return [Part(l, 'paper', sh=4, lines=[polyline((14, 30), (42, 34)), polyline((14, 44), (42, 48)), polyline((14, 58), (42, 62))], lw=2.4),
            Part(flipx(l), 'paper', sh=4, lines=[polyline((58, 34), (86, 30)), polyline((58, 48), (86, 44)), polyline((58, 62), (86, 58))], lw=2.4), Part(rrect(46, 18, 8, 76, 3), 'red', sh=2)]
@icon('📚')
def books():
    return [Part(rrect(6, 66, 88, 18, 3), 'blue', sh=3), Part(rrect(12, 48, 76, 18, 3), 'red', sh=3), Part(rrect(4, 30, 84, 18, 3), 'leaf', sh=3), Part(rrect(16, 12, 70, 18, 3), 'orange', sh=3),
            Layer(U(rrect(80, 70, 10, 10, 1), rrect(14, 52, 10, 10, 1), rrect(76, 34, 8, 10, 1), rrect(22, 16, 8, 10, 1)), '#f1e8d2')]
@icon('📁')
def folder():
    return [Part(svg('M4 20 Q4 14 10 14 L36 14 L44 24 L90 24 Q96 24 96 30 L96 84 Q96 90 90 90 L10 90 Q4 90 4 84 Z'), 'yellow', sh=6), Part(rrect(4, 36, 92, 54, 6), 'gold', sh=4)]
@icon('📋')
def clipboard():
    return [Part(rrect(12, 10, 76, 88, 6), 'wood', sh=5), Part(rrect(20, 20, 60, 70, 3), 'paper', sh=2, lines=[polyline((28, 40), (72, 40)), polyline((28, 54), (72, 54)), polyline((28, 68), (60, 68))], lw=3),
            Part(rrect(34, 4, 32, 16, 4), 'steel', sh=2)]
@icon('📅')
def calendar():
    return [Part(rrect(6, 14, 88, 82, 8), 'white', sh=5), Part(I(rrect(6, 14, 88, 82, 8), rrect(0, 0, 100, 34)), 'red', flat=True, sep=False, outline=False),
            Layer(U(*[rrect(16 + 18 * j, 44 + 16 * i, 12, 10, 2) for i in range(3) for j in range(4)]), '#a9b1bd'), Part(U(rrect(24, 4, 8, 18, 3), rrect(68, 4, 8, 18, 3)), 'iron', sh=1.5)]
@icon('📊')
def bar_chart():
    return [Part(rrect(4, 6, 92, 88, 6), 'white', sh=5), Part(rrect(16, 54, 16, 32, 2), 'red', sh=2), Part(rrect(42, 26, 16, 60, 2), 'leaf', sh=2), Part(rrect(68, 40, 16, 46, 2), 'blue', sh=2)]
@icon('📍')
def pin():
    p = svg('M50 96 Q30 64 22 50 Q14 32 26 16 Q36 4 50 4 Q64 4 74 16 Q86 32 78 50 Q70 64 50 96 Z')
    return [Part(p, 'red', sh=7), Part(circle(50, 34, 12), 'white', sh=2)]
@icon('🏷')
def label():
    t = poly((6, 50), (40, 10), (94, 10), (94, 90), (40, 90))
    return [Part(t, 'yellow', sh=6), Part(circle(30, 50, 7), '#1d2230', flat=True, sep=False), Part(stroke(curve((30, 50), (14, 36), (4, 14)), 3), 'iron', shade=False)]
@icon('🪪')
def id_card():
    return [Part(rrect(4, 18, 92, 66, 8), 'paper', sh=5), Part(rrect(12, 30, 30, 40, 4), 'blue', sh=2), Part(circle(27, 44, 8), 'skin2', sh=2), Part(svg('M14 70 Q14 56 27 56 Q40 56 40 70 Z'), 'navy', sh=1.5),
            Layer(U(rrect(50, 34, 38, 6, 3), rrect(50, 48, 30, 6, 3), rrect(50, 62, 36, 6, 3)), '#a7864c')]
@icon('📦')
def package():
    front = poly((8, 34), (54, 46), (54, 96), (8, 82))
    side = poly((54, 46), (92, 30), (92, 80), (54, 96))
    top = poly((8, 34), (48, 18), (92, 30), (54, 46))
    return [Part(front, 'sand', sh=4), Part(side, '#b89355', flat=True), Part(top, '#e8cc90', flat=True), Part(I(poly((24, 28), (32, 25), (74, 40), (74, 88), (66, 91), (66, 43)), U(front, side, top)), 'brown', flat=True, sep=False, outline=False)]

# ---------------------------------------------------------------------------- segurança
@icon('🔑')
def key():
    k = U(D(circle(28, 30, 22), circle(28, 30, 9)), rot(rrect(40, 26, 56, 12, 3), 40, 28, 30), rot(rrect(74, 38, 8, 14, 1), 40, 28, 30), rot(rrect(86, 38, 8, 16, 1), 40, 28, 30))
    return [Part(k, 'gold', sh=5)]
@icon('🔐')
def lock_key():
    shackle = D(rrect(26, 6, 44, 50, 22), rrect(36, 16, 24, 40, 12))
    return [Part(shackle, 'steel', sh=3), Part(rrect(14, 40, 68, 52, 8), 'gold', sh=6), Part(U(circle(48, 60, 7), rrect(45, 62, 6, 16, 2)), 'black', flat=True, sep=False),
            Part(rot(U(D(circle(78, 66, 10), circle(78, 66, 4)), rrect(76, 74, 6, 22, 2)), 0, 0, 0), 'steel', sh=2)]
@icon('🔓')
def unlock():
    shackle = D(rrect(46, 4, 44, 50, 22), rrect(56, 14, 24, 40, 12), rrect(56, 30, 40, 30))
    return [Part(shackle, 'steel', sh=3), Part(rrect(10, 40, 68, 54, 8), 'gold', sh=6), Part(U(circle(44, 62, 7), rrect(41, 64, 6, 16, 2)), 'black', flat=True, sep=False)]
@icon('🛡')
def shield():
    s = svg('M50 4 L90 16 Q92 64 50 96 Q8 64 10 16 Z')
    return [Part(s, 'blue', sh=7), Part(I(s, rrect(50, 0, 50, 100)), '#2c64b3', flat=True, sep=False, outline=False), Layer(stroke(svg('M50 14 L80 23 Q80 60 50 84 Q20 60 20 23 Z'), 3), alpha('#ffffff', 0.55))]
@icon('🚨')
def siren():
    dome = U(pie(50, 62, 30, 180, 360, 34), rrect(20, 60, 60, 6))
    return [Layer(U(*[rot(poly((49, 2), (51, 2), (52, 16), (48, 16)), a, 50, 50) for a in (-60, -30, 0, 30, 60)]), '#ffd35a'),
            Part(rrect(12, 68, 76, 20, 5), 'iron'), Part(dome, 'red'), Layer(ellipse(39, 42, 6, 10, -25), alpha('#ffffff', 0.75))]
@icon('🔎')
def magnifier():
    return [Part(cap(62, 62, 90, 90, 8), 'black', sh=2), Part(D(circle(40, 40, 32), circle(40, 40, 22)), 'iron', sh=3), Part(circle(40, 40, 22), 'glass', sh=2), gloss(32, 32, 6, 4, -40, 0.7)]
@icon('🛢')
def oil_drum():
    return [Part(rrect(16, 8, 68, 86, 10), 'blue', sh=6, lines=[polyline((16, 34), (84, 34)), polyline((16, 66), (84, 66))], lw=3.4), Part(ellipse(50, 14, 30, 6), 'steel', sh=1.5), Part(circle(64, 13, 3), 'iron', flat=True)]
@icon('🕒')
def clock3():
    return [Part(circle(50, 50, 44), 'white', sh=7), Layer(U(*[rot(rrect(48.5, 10, 3, 8, 1), a, 50, 50) for a in range(0, 360, 30)]), '#5a616c'),
            inkline((50, 50), (50, 22), w=4.4), inkline((50, 50), (74, 50), w=4.4), Part(circle(50, 50, 5), 'red', flat=True)]
@icon('⏳')
def hourglass():
    glass = poly((24, 14), (76, 14), (54, 50), (76, 86), (24, 86), (46, 50))
    sand_ = U(poly((32, 24), (68, 24), (50, 46)), poly((50, 58), (70, 82), (30, 82)))
    return [Part(glass, 'glass', sh=3), Part(sand_, 'sand', flat=True, sep=False, outline=False), Part(rrect(16, 6, 68, 10, 3), 'wood', sh=2), Part(rrect(16, 84, 68, 10, 3), 'wood', sh=2)]
@icon('⚖')
def scales():
    return [Part(U(rrect(46, 12, 8, 74, 2), rrect(28, 84, 44, 10, 3)), 'gold', sh=3), Part(rrect(8, 18, 84, 7, 3), 'gold', sh=2),
            Part(stroke(polyline((10, 22), (2, 52), (18, 52), (10, 22)), 2.4), 'gold', shade=False), Part(stroke(polyline((90, 22), (82, 52), (98, 52), (90, 22)), 2.4), 'gold', shade=False),
            Part(pie(10, 52, 14, 0, 180, 9), 'gold', sh=2), Part(pie(90, 52, 14, 0, 180, 9), 'gold', sh=2), Part(circle(50, 12, 6), 'gold', sh=1.5)]
@icon('⚙')
def gear():
    teeth = U(*[rot(rrect(42, 2, 16, 20, 3), a, 50, 50) for a in range(0, 360, 45)], circle(50, 50, 34))
    return [Part(D(teeth, circle(50, 50, 13)), 'metal', sh=7)]

# ---------------------------------------------------------------------------- jogos e diversão
@icon('🃏')
def joker():
    card = rrect(16, 4, 68, 92, 8)
    return [Part(move(card, 6, 4), 'white', sh=3), Part(card, 'white', sh=5), Part(svg('M30 46 L36 24 L50 38 L64 24 L70 46 Z'), 'red', sh=2), Part(U(circle(36, 22, 4), circle(64, 22, 4)), 'gold', sh=1),
            Part(circle(50, 58, 12), 'face', sh=2), ink(U(circle(45, 56, 1.8), circle(55, 56, 1.8))), Layer(stroke(arc(50, 60, 5, 30, 150), 2), INK),
            Layer(U(rrect(22, 10, 6, 14, 2), rrect(72, 76, 6, 14, 2)), '#e2453d')]
@icon('🁣')
def domino():
    t = rrect(26, 4, 48, 92, 8)
    pips = U(*[circle(x, y, 4.4) for x, y in ((38, 18), (62, 38), (50, 28), (38, 62), (62, 62), (38, 82), (62, 82), (50, 72))])
    return [Part(t, 'white', sh=5, lines=[polyline((30, 50), (70, 50))], lw=3), ink(pips)]
@icon('🎲')
def die():
    front = rrect(8, 26, 60, 66, 8)
    top = poly((14, 24), (40, 6), (94, 6), (66, 24))
    side = poly((68, 28), (94, 8), (94, 70), (68, 90))
    return [Part(top, 'white', sh=2), Part(side, '#d4d9e0', flat=True), Part(front, 'white', sh=5), ink(U(*[circle(x, y, 5) for x, y in ((24, 42), (38, 59), (52, 76)) ])),
            Layer(U(circle(56, 15, 4, ), circle(81, 37, 3.4), circle(81, 60, 3.4)), '#e2453d')]
@icon('🎱')
def eightball():
    return [Part(circle(50, 50, 44), 'black', sh=7), Part(circle(46, 44, 18), 'white', sh=2), Layer(stroke(U(circle(46, 37, 5), circle(46, 49, 6)), 3), INK), gloss(30, 28, 8, 5, -35, 0.4)]
@icon('🎯')
def target():
    return [Part(circle(48, 52, 42), 'white', sh=7), Part(circle(48, 52, 32), 'red', sh=3), Part(circle(48, 52, 21), 'white', sh=2), Part(circle(48, 52, 10), 'red', sh=1.5),
            Part(stroke(polyline((48, 52), (86, 14)), 4), 'wood', shade=False), Part(poly((80, 6), (96, 6), (94, 20)), 'blue', sh=1.5)]
@icon('🎮')
def gamepad():
    pad = svg('M24 30 L76 30 Q94 30 96 56 Q98 84 82 84 Q72 84 66 72 L34 72 Q28 84 18 84 Q2 84 4 56 Q6 30 24 30 Z')
    return [Part(pad, 'iron', sh=6), Part(U(rrect(16, 48, 22, 8, 2), rrect(23, 41, 8, 22, 2)), 'grey', sh=1.5), Part(circle(70, 46, 5), 'red', sh=1.5), Part(circle(80, 56, 5), 'leaf', sh=1.5),
            Part(circle(60, 56, 5), 'blue', sh=1.5), Part(circle(70, 66, 5), 'yellow', sh=1.5)]
@icon('🎨')
def palette():
    p = svg('M50 6 Q92 6 94 46 Q96 66 78 66 Q64 66 66 78 Q68 94 50 94 Q8 94 6 52 Q6 6 50 6 Z')
    return [Part(D(p, circle(70, 76, 9)), 'sand', sh=7), Part(circle(30, 30, 7.4), 'red', sh=1.5), Part(circle(52, 22, 7.4), 'yellow', sh=1.5), Part(circle(74, 32, 7.4), 'blue', sh=1.5), Part(circle(24, 54, 7.4), 'leaf', sh=1.5), Part(circle(40, 74, 7.4), 'purple', sh=1.5)]
@icon('🧩')
def puzzle():
    p = svg('M10 30 L36 30 Q32 20 40 14 Q50 8 58 16 Q64 24 58 30 L84 30 L84 54 Q94 50 98 60 Q98 72 86 74 L84 74 L84 94 L10 94 L10 70 Q20 74 24 66 Q26 56 16 52 Q12 52 10 54 Z')
    return [Part(p, 'leaf', sh=7)]
@icon('🥁')
def drum():
    return [Part(U(cap(20, 6, 46, 30, 3), cap(80, 6, 54, 30, 3)), 'wood', shade=False), Part(rrect(10, 30, 80, 60, 12), 'red', sh=6, lines=[polyline((10, 48), (30, 88), (50, 48), (70, 88), (90, 48))], lw=2.6, lc='#ffe28c'),
            Part(ellipse(50, 32, 40, 10), 'paper', sh=2)]
@icon('🎵')
def note():
    return [Part(U(ellipse(34, 78, 16, 12, -20), rrect(44, 10, 8, 68, 2), svg('M48 10 Q70 16 76 36 Q66 26 48 26 Z')), 'black', sh=4)]
@icon('🎶')
def notes():
    return [Part(U(ellipse(22, 80, 14, 10, -20), ellipse(70, 70, 14, 10, -20), rrect(30, 16, 7, 64, 2), rrect(78, 8, 7, 62, 2), poly((30, 16), (85, 6), (85, 20), (30, 30))), 'black', sh=4)]
@icon('🎉')
def party():
    cone = poly((8, 94), (34, 30), (72, 68))
    conf = [Part(rrect(52, 10, 6, 14, 2, 30), 'yellow', sh=1), Part(rrect(76, 22, 6, 14, 2, -30), 'leaf', sh=1), Part(rrect(82, 50, 6, 14, 2, 60), 'pink', sh=1),
            Part(circle(64, 32, 4), 'blue', sh=1), Part(circle(88, 34, 3.4), 'red', sh=1), Part(circle(40, 14, 3.4), 'cyan', sh=1)]
    return [Part(cone, 'yellow', sh=5, lines=[polyline((20, 66), (44, 90)), polyline((26, 50), (58, 82))], lw=4, lc='#e2453d'), *conf]
@icon('🎆')
def fireworks():
    rays = U(*[rot(cap(50, 10, 50, 30, 3), a, 50, 46) for a in range(0, 360, 30)])
    return [Part(rays, 'yellow', shade=False), Part(circle(50, 46, 8), 'orange', sh=2), Layer(U(*[rot(circle(50, 4, 3.4), a, 50, 46) for a in range(15, 360, 30)]), '#ff6fb1'),
            Part(rrect(46, 76, 8, 22, 2), 'red', sh=1.5)]
@icon('🏅')
def medal():
    ribbon = U(poly((24, 4), (42, 4), (56, 40), (44, 46)), poly((76, 4), (58, 4), (44, 40), (56, 46)))
    return [Part(ribbon, 'blue', sh=2), Part(circle(50, 66, 28), 'gold', sh=5), Part(circle(50, 66, 18), 'gold', sh=3), Layer(svg('M50 54 L54 62 L62 63 L56 69 L58 77 L50 73 L42 77 L44 69 L38 63 L46 62 Z'), '#b77a12')]
@icon('🏆')
def trophy():
    cup = svg('M24 10 L76 10 L74 40 Q70 60 50 62 Q30 60 26 40 Z')
    handles = D(U(rrect(8, 14, 30, 30, 14), rrect(62, 14, 30, 30, 14)), rrect(15, 20, 16, 18, 8), rrect(69, 20, 16, 18, 8))
    return [Part(handles, 'gold'), Part(cup, 'gold'), Part(rrect(44, 60, 12, 16, 2), 'gold'), Part(rrect(28, 76, 44, 16, 4), 'brown'), Layer(ellipse(38, 26, 5, 10, 10), alpha('#ffffff', 0.6))]
@icon('🏏')
def cricket():
    return [Part(rot(rrect(40, 4, 20, 70, 8), 35, 50, 50), 'wood', sh=4), Part(rot(rrect(46, 70, 8, 26, 3), 35, 50, 50), 'black', sh=2), Part(circle(80, 80, 10), 'red', sh=2)]
@icon('⚽')
def soccer():
    ball = circle(50, 50, 44)
    def pent(cx, cy, r, a0):
        return poly([(cx + r * math.cos(math.radians(a0 + 72 * k)), cy + r * math.sin(math.radians(a0 + 72 * k))) for k in range(5)])
    outer = []
    for i in range(5):
        a = -90 + 36 + 72 * i
        cx, cy = 50 + 46 * math.cos(math.radians(a)), 50 + 46 * math.sin(math.radians(a))
        outer.append(pent(cx, cy, 16, a + 180))
    seams = U(*[stroke(polyline((50 + 15 * math.cos(math.radians(-90 + 72 * i)), 50 + 15 * math.sin(math.radians(-90 + 72 * i))),
                                (50 + 30 * math.cos(math.radians(-90 + 72 * i)), 50 + 30 * math.sin(math.radians(-90 + 72 * i)))), 2.6) for i in range(5)])
    return [Part(ball, 'white', sh=7), Part(I(U(pent(50, 50, 15, -90), *outer), ball), 'black', flat=True, sep=False, outline=False), Layer(I(seams, ball), INK)]
@icon('🛒')
def cart():
    basket = poly((14, 22), (92, 22), (82, 62), (24, 62))
    return [Part(stroke(polyline((2, 10), (14, 10), (26, 72), (84, 72)), 5), 'steel', shade=False), Part(basket, 'red', sh=5, lines=[polyline((18, 36), (88, 36)), polyline((21, 49), (85, 49)), polyline((38, 22), (40, 62)), polyline((58, 22), (58, 62)), polyline((76, 22), (72, 62))], lw=2.4),
            *[Part(circle(x, 86, 8), 'rubber', sh=2) for x in (34, 76)]]
