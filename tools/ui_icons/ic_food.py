# Comidas e bebidas (lojas, ambulantes, festa junina, bares).
from iconlib import *
from icons import icon, gloss, ink, inkline

@icon('🍔')
def burger():
    top = svg('M10 46 Q10 14 50 14 Q90 14 90 46 Z')
    return [Part(rrect(10, 70, 80, 18, 8), 'wood'), Part(rrect(8, 60, 84, 12, 6), 'brown'),
            Part(svg('M6 54 L94 54 L88 64 L78 58 L68 66 L58 58 L48 66 L38 58 L28 66 L18 58 L10 64 Z'), 'leaf', sh=2), Part(rrect(10, 50, 80, 8, 4), 'yellow', sh=2),
            Part(top, 'orange'), *[Layer(ellipse(x, y, 2.4, 1.6, 20), '#fff3c4') for x, y in ((30, 30), (46, 24), (62, 30), (40, 38), (70, 38), (56, 36))]]
@icon('🍕')
def pizza():
    slice_ = svg('M50 96 L10 20 Q50 2 90 20 Z')
    crust = svg('M8 18 Q50 -2 92 18 L88 28 Q50 10 12 28 Z')
    return [Part(slice_, 'yellow'), Part(crust, 'wood', sh=3), *[Part(circle(x, y, r), 'red', sh=2) for x, y, r in ((40, 40, 7), (60, 38, 6), (50, 62, 6.5))]]
@icon('🍟')
def fries():
    sticks = U(*[rrect(x, y, 9, 50, 3, d) for x, y, d in ((24, 10, -10), (34, 4, -4), (45, 2, 0), (56, 6, 5), (66, 10, 10))])
    box = svg('M16 40 L84 40 L76 96 L24 96 Z')
    return [Part(sticks, 'yellow', sh=2), Part(box, 'red', lines=[curve((24, 52), (50, 60), (76, 52))], lw=2.4), Part(svg('M40 66 L50 60 L60 66 L56 80 L44 80 Z'), 'gold', sh=2)]
@icon('🌽')
def corn():
    cob = rot(ellipse(50, 46, 16, 36), 30, 50, 46)
    husk = U(svg('M30 96 Q20 70 34 48 Q40 70 52 80 Z'), svg('M44 98 Q70 86 76 60 Q60 66 46 78 Z'))
    lines_ = [rot(polyline((50 + dx, 14), (50 + dx, 80)), 30, 50, 46) for dx in (-8, 0, 8)] + [rot(polyline((34, y), (66, y)), 30, 50, 46) for y in range(20, 80, 9)]
    return [Part(cob, 'yellow', lines=lines_, lw=1.6), Part(husk, 'leaf', sh=3)]
@icon('🍚')
def rice():
    bowl = svg('M8 50 L92 50 Q90 88 50 92 Q10 88 8 50 Z')
    rice_ = blob((12, 52), (20, 38), (34, 30), (50, 26), (66, 30), (80, 38), (88, 52))
    return [Part(rice_, 'white', sh=3), Part(bowl, 'blue', lines=[curve((14, 62), (50, 70), (86, 62))], lw=2.2)]
@icon('🍝')
def spaghetti():
    plate = ellipse(50, 70, 46, 20)
    pasta = blob((22, 64), (26, 46), (40, 36), (60, 36), (74, 46), (78, 64), (50, 72))
    return [Part(plate, 'white', sh=4), Part(pasta, 'yellow', lines=[arc(50, 56, 18, 200, 340), arc(48, 60, 10, 180, 360), arc(54, 52, 24, 210, 330)], lw=2),
            Part(circle(50, 44, 9), 'red', sh=2), Part(cap(66, 30, 86, 6, 2.6), 'steel', sh=1)]
@icon('🍢')
def oden():
    stick = cap(50, 30, 50, 98, 3)
    return [Part(stick, 'wood', shade=False), Part(circle(50, 20, 13), 'sand', sh=3), Part(rrect(36, 34, 28, 22, 4, 45), 'orange', sh=3), Part(rrect(34, 58, 32, 18, 6), 'brown', sh=3)]
@icon('🍣')
def sushi():
    rice_ = rrect(10, 46, 80, 36, 14)
    fish = svg('M6 52 Q20 26 50 30 Q80 26 94 52 Q50 46 6 52 Z')
    return [Part(rice_, 'white', sh=5), Part(fish, 'orange', lines=[polyline((30, 34), (24, 48)), polyline((48, 32), (42, 48)), polyline((66, 34), (60, 48))], lw=2.6, lc='#fff1df'),
            Part(rrect(40, 44, 20, 38, 3), 'black', sh=2)]
@icon('🍦')
def softserve():
    cone = svg('M30 52 L70 52 L50 98 Z')
    swirl = U(ellipse(50, 50, 24, 9), ellipse(50, 38, 19, 8), ellipse(50, 26, 13, 7), svg('M44 22 Q50 4 58 14 Z'))
    return [Part(cone, 'sand', lines=[polyline((36, 60), (58, 82)), polyline((64, 60), (42, 82))], lw=2), Part(swirl, 'white', sh=4)]
@icon('🍧')
def shaved_ice():
    cup = svg('M16 54 L84 54 L74 94 L26 94 Z')
    ice = blob((14, 56), (20, 34), (36, 20), (52, 16), (68, 22), (82, 36), (86, 56))
    return [Part(ice, 'pink', sh=4), Part(I(ice, rrect(0, 0, 100, 36)), 'cyan', flat=True, sep=False, outline=False), Part(cup, 'blue', sh=4)]
@icon('🍰')
def cake():
    body = poly((8, 60), (70, 36), (92, 48), (92, 86), (8, 86))
    top = poly((8, 60), (70, 36), (92, 48), (30, 72))
    return [Part(body, 'paper', lines=[polyline((30, 72), (30, 86))]), Part(top, 'white', sh=2), Part(poly((8, 70), (30, 80), (92, 62), (92, 68), (30, 86), (8, 76)), 'pink', sh=2),
            Part(circle(62, 34, 8), 'red', sh=2)]
@icon('🍱')
def bento():
    box = rrect(6, 26, 88, 64, 8)
    return [Part(box, 'black', sh=5), Part(rrect(12, 32, 36, 52, 4), 'white', sh=3), Part(rrect(52, 32, 36, 24, 4), 'red', sh=2),
            Part(rrect(52, 60, 36, 24, 4), 'leaf', sh=2), Part(circle(30, 58, 7), 'red', sh=2), Part(rrect(14, 16, 72, 8, 3), 'wood', sh=2)]
@icon('🍶')
def sake():
    bottle = svg('M36 96 L36 54 Q36 42 44 38 L44 20 L56 20 L56 38 Q64 42 64 54 L64 96 Z')
    cup = svg('M68 66 L94 66 L90 92 L72 92 Z')
    return [Part(bottle, 'white', lines=[polyline((36, 62), (64, 62))], lw=2.4), Part(rrect(42, 10, 16, 12, 3), 'red', sh=2), Part(cup, 'white', sh=3), Part(rrect(40, 66, 20, 20, 3), 'blue', sh=2)]
@icon('🍷')
def wine():
    glass = svg('M28 8 L72 8 Q76 46 50 58 Q24 46 28 8 Z')
    wine_ = I(glass, rrect(0, 26, 100, 40))
    return [Part(U(glass, rrect(46, 56, 8, 26, 2), ellipse(50, 88, 22, 7)), 'glass', sh=3), Part(wine_, '#8b1a3a', flat=True, sep=False, outline=False), gloss(38, 22, 4, 9, 10, 0.6)]
@icon('🍺')
def beer():
    mug = rrect(16, 26, 54, 68, 6)
    handle = D(rrect(58, 38, 32, 40, 14), rrect(66, 46, 16, 24, 7))
    foam = blob((14, 30), (24, 14), (38, 18), (50, 10), (64, 16), (74, 22), (72, 34), (14, 36))
    return [Part(handle, 'glass'), Part(mug, 'gold', lines=[polyline((30, 40), (30, 84)), polyline((44, 40), (44, 84)), polyline((58, 40), (58, 84))], lw=2.2), Part(foam, 'white')]
@icon('🥃')
def tumbler():
    glass = svg('M14 26 L86 26 L80 92 L20 92 Z')
    drink = I(glass, rrect(0, 54, 100, 50))
    return [Part(glass, 'glass', sh=4), Part(drink, 'orange', flat=True, sep=False, outline=False), Part(rrect(30, 44, 18, 16, 3, 15), 'white', sh=2), gloss(26, 44, 3, 12, 0, 0.6)]
@icon('🍾')
def champagne():
    b = rot(svg('M40 98 L40 50 Q40 38 46 34 L46 14 L54 14 L54 34 Q60 38 60 50 L60 98 Z'), 30, 50, 56)
    return [Layer(U(*[rot(cap(50, 4, 50, 10, 2.2), a, 76, 14) for a in (-40, 0, 40, 80)]), '#ffe36b'), Part(b, 'green', sh=4),
            Part(rot(rrect(42, 60, 16, 22, 2), 30, 50, 56), 'gold', sh=2), Part(rot(rrect(45, 6, 10, 10, 3), 30, 50, 56), 'brown', sh=1.5)]
@icon('🍿')
def popcorn():
    box = svg('M18 40 L82 40 L72 96 L28 96 Z')
    pops = U(*[circle(x, y, 9) for x, y in ((26, 36), (40, 26), (56, 24), (72, 32), (34, 40), (50, 38), (66, 40))])
    return [Part(pops, 'white', sh=3), Part(box, 'red', lines=[polyline((40, 40), (42, 96)), polyline((60, 40), (58, 96))], lw=6, lc='#f4f4f4')]
@icon('🥐')
def croissant():
    c = D(ellipse(50, 66, 47, 40), ellipse(50, 92, 28, 26))
    return [Part(c, 'orange', sh=6, lines=[polyline((28, 34), (38, 66)), polyline((50, 26), (50, 64)), polyline((72, 34), (62, 66)), polyline((12, 54), (28, 74)), polyline((88, 54), (72, 74))], lw=2.6)]
@icon('🥖')
def baguette():
    b = rrect(4, 38, 92, 24, 12, -30)
    return [Part(b, 'sand', sh=5, lines=[rot(polyline((24 + 16 * i, 44), (34 + 16 * i, 56)), -30, 50, 50) for i in range(4)], lw=2.6)]
@icon('🥗')
def salad():
    bowl = svg('M6 50 L94 50 Q90 90 50 92 Q10 90 6 50 Z')
    leaves = U(ellipse(28, 44, 16, 12, -20), ellipse(50, 38, 16, 14), ellipse(72, 44, 16, 12, 20))
    return [Part(leaves, 'leaf', sh=3), Part(circle(40, 42, 6), 'red', sh=1.5), Part(circle(64, 40, 5), 'orange', sh=1.5), Part(bowl, 'white', sh=4)]
@icon('🥜')
def peanuts():
    p = U(ellipse(40, 34, 20, 18), ellipse(60, 66, 22, 20), rrect(36, 40, 26, 26, 10, 45))
    return [Part(p, 'sand', sh=6, lines=[curve((30, 28), (40, 22), (50, 28)), curve((52, 64), (62, 58), (72, 64))], lw=2)]
@icon('🥣')
def bowl_spoon():
    bowl = svg('M6 48 L94 48 Q90 90 50 92 Q10 90 6 48 Z')
    return [Part(cap(60, 46, 86, 8, 4), 'steel', sh=1.5), Part(ellipse(50, 48, 42, 8), 'paper', sh=2), Part(bowl, 'orange', sh=5)]
@icon('🥤')
def cup_straw():
    cup = svg('M20 30 L80 30 L72 96 L28 96 Z')
    return [Part(stroke(polyline((54, 34), (62, 6), (78, 6)), 6), 'red', shade=False), Part(rrect(16, 22, 68, 12, 4), 'white', sh=2),
            Part(cup, 'red', lines=[polyline((24, 56), (76, 56))], lw=8, lc='#f4f4f4')]
@icon('🥪')
def sandwich():
    top = poly((6, 70), (50, 18), (94, 70))
    return [Part(top, 'sand', sh=4), Part(svg('M10 72 L90 72 L84 80 L74 74 L64 82 L54 74 L44 82 L34 74 L24 82 L16 74 Z'), 'leaf', sh=1.5),
            Part(rrect(8, 64, 84, 8, 3), 'red', sh=1.5), Part(rrect(8, 80, 84, 12, 4), 'sand', sh=3)]
@icon('🧃')
def juice_box():
    box = rrect(22, 22, 52, 74, 4)
    return [Part(cap(60, 22, 70, 2, 2.6), 'white', shade=False), Part(box, 'orange', sh=5), Part(rrect(30, 46, 36, 30, 6), 'white', sh=2), Part(circle(48, 61, 9), 'leaf', sh=2)]
@icon('🧊')
def ice():
    front = poly((14, 34), (62, 34), (62, 86), (14, 86))
    top = poly((14, 34), (34, 14), (84, 14), (62, 34))
    side = poly((62, 34), (84, 14), (84, 66), (62, 86))
    return [Part(front, 'glass', sh=4), Part(top, '#d9f4fb', sh=2), Part(side, '#6db9cf', flat=True), gloss(26, 48, 4, 10, 0, 0.7)]
@icon('☕')
def coffee():
    cup = svg('M14 40 L74 40 L70 78 Q66 90 44 90 Q22 90 18 78 Z')
    handle = D(rrect(62, 46, 30, 28, 12), rrect(68, 52, 16, 16, 7))
    steam = U(stroke(curve((34, 32), (30, 22), (38, 14), (34, 4)), 3.4), stroke(curve((52, 32), (48, 22), (56, 14), (52, 4)), 3.4))
    return [Layer(steam, alpha('#d0d6de', 0.85)), Part(handle, 'white', sh=3), Part(cup, 'white', sh=6), Part(ellipse(44, 42, 28, 5), 'brown', flat=True, sep=False),
            Part(ellipse(44, 94, 40, 5), 'white', sh=1.5)]
@icon('🍽')
def plate():
    return [Part(cap(10, 10, 10, 92, 3.4), 'steel', sh=1.5), Part(U(cap(90, 10, 90, 92, 3.4), ellipse(90, 26, 5, 16)), 'steel', sh=1.5),
            Part(circle(50, 52, 34), 'white', sh=5), Part(circle(50, 52, 22), 'white', sh=3), Layer(stroke(polyline((6, 10), (6, 30), (14, 30), (14, 10)), 2.4), '#9aa3ad')]
@icon('🥥')
def coconut():
    # o coco verde aberto, com o canudo (a água de coco da praia)
    return [Part(ellipse(50, 60, 38, 34), 'green', sh=5, lines=[svg('M24 38 Q30 62 26 86'), svg('M76 38 Q70 62 74 86')], lw=1.8),
            Part(ellipse(50, 34, 20, 9), 'white', sh=2), Part(ellipse(50, 34, 12, 5), 'glass', sh=1, hl=False),
            Part(stroke(polyline((52, 34), (60, 8), (74, 4)), 5), 'red', shade=False)]
@icon('🧉')
def mate():
    # o copo de mate gelado com limão e o canudo
    cup = svg('M22 30 L78 30 L70 96 L30 96 Z')
    return [Part(stroke(polyline((56, 34), (64, 6)), 5), 'white', shade=False), Part(cup, 'glass', sh=3), Part(svg('M26 50 L74 50 L70 92 L30 92 Z'), 'orange', sh=3),
            Part(circle(72, 30, 13), 'leaf', sh=2, lines=[polyline((72, 19), (72, 41)), polyline((61, 30), (83, 30))], lw=1.6, lc='#e9f7c8')]
@icon('🥨')
def pretzel():
    # o biscoito de polvilho em argola (o "Globo"), dourado
    ring = U(stroke(ellipse(50, 50, 36, 30), 13))
    return [Part(ring, 'gold', sh=4), *[Layer(ellipse(x, y, 2.2, 1.4, 25), '#fff3c4') for x, y in ((22, 40), (36, 22), (62, 22), (80, 42), (74, 70), (50, 80), (26, 66))]]
@icon('🌭')
def hotdog():
    # o pão, a salsicha e a mostarda em zigue-zague
    return [Part(rrect(8, 44, 84, 34, 17), 'wood', sh=4), Part(rrect(4, 40, 92, 18, 9), 'red', sh=3),
            Part(stroke(polyline((16, 46), (26, 52), (36, 46), (46, 52), (56, 46), (66, 52), (76, 46), (86, 52)), 4), 'yellow', shade=False, hl=False),
            Part(rrect(12, 30, 76, 16, 8), 'gold', sh=2)]
@icon('🍹')
def tropical():
    # o copo de suco com a fatia de laranja e o canudinho
    glass = svg('M18 22 L82 22 L74 94 L26 94 Z')
    return [Part(stroke(polyline((50, 26), (60, 4)), 4), 'pink', shade=False), Part(glass, 'glass', sh=3), Part(svg('M22 42 L78 42 L72 90 L28 90 Z'), 'orange', sh=3),
            Part(svg('M58 22 A16 16 0 0 1 90 22 Z'), 'yellow', sh=2, lines=[polyline((74, 22), (74, 9)), polyline((74, 22), (84, 12)), polyline((74, 22), (64, 12))], lw=1.4, lc='#fff3a8')]
@icon('🧀')
def cheese():
    # a fatia de queijo com os furos
    wedge = svg('M8 78 L92 78 L92 46 L20 26 Z')
    return [Part(wedge, 'yellow', sh=4), Part(svg('M8 78 L92 78 L92 88 L8 88 Z'), 'gold', sh=2),
            *[Layer(ellipse(x, y, r, r * 0.8), '#c8961a') for x, y, r in ((40, 52, 6), (66, 60, 5), (78, 50, 3.5), (30, 68, 4), (56, 70, 3))]]
