# Veículos (concessionária, polícia, mapa, corridas).
from iconlib import *
from icons import icon, gloss, ink, inkline, wheel

def car_side(color, roof=None):
    body = svg('M6 66 Q6 54 18 52 L30 50 L40 34 Q43 30 50 30 L70 30 Q76 30 80 36 L88 50 Q96 52 96 62 L96 72 Q96 76 92 76 L8 76 Q6 76 6 72 Z')
    win = U(poly((42, 36), (56, 36), (56, 50), (34, 50)), poly((60, 36), (72, 36), (80, 50), (60, 50)))
    items = [Part(body, color, lines=[polyline((58, 52), (58, 72)), polyline((84, 58), (94, 58))], lw=2.2), Part(win, 'glass', sep=False, outline=False, sh=2)]
    if roof: items += roof
    return items + wheel(26, 76, 11) + wheel(76, 76, 11) + [Part(ellipse(10, 62, 3, 4), 'yellow', flat=True, sep=False)]

@icon('🚗', '🚘')
def car(): return car_side('red')
@icon('🚓', '🚔')
def police_car():
    bar = U(rrect(44, 22, 24, 8, 3))
    items = car_side('white', roof=[Part(rrect(44, 22, 12, 9, 3), 'blue', sh=2), Part(rrect(56, 22, 12, 9, 3), 'red', sh=2)])
    items.insert(1, Part(I(rrect(4, 58, 92, 8), svg('M6 66 Q6 54 18 52 L30 50 L88 50 Q96 52 96 62 L96 72 L6 72 Z')), 'navy', flat=True, sep=False, outline=False))
    return items
@icon('🏎')
def racecar():
    body = svg('M4 64 L14 54 L40 52 L50 40 L62 40 L66 52 L90 54 L96 64 L96 72 L4 72 Z')
    wing = U(rrect(4, 40, 16, 6, 2), rrect(10, 44, 4, 12))
    return [Part(wing, 'black', sh=2), Part(body, 'red', lines=[polyline((40, 60), (66, 60))], lw=6, lc='#f4f4f4'), Part(ellipse(56, 44, 6, 5), 'yellow', sh=2),
            *wheel(22, 72, 12), *wheel(78, 72, 12)]
@icon('🚌')
def bus():
    body = rrect(4, 24, 92, 56, 8)
    wins = U(*[rrect(10 + 18 * i, 32, 14, 16, 3) for i in range(4)], rrect(82, 32, 10, 26, 3))
    return [Part(body, 'yellow', lines=[polyline((4, 60), (96, 60))], lw=3), Part(wins, 'glass', sep=False, outline=False, sh=2), *wheel(24, 82, 10), *wheel(76, 82, 10)]
@icon('🛵')
def scooter():
    body = svg('M12 70 Q14 54 30 52 L52 52 L58 34 L64 34 L72 66 Q60 74 44 72 Z')
    return [Part(stroke(polyline((60, 32), (56, 18), (66, 14)), 4.4), 'black', shade=False), Part(rrect(26, 44, 24, 8, 4), 'black', sh=2),
            Part(body, 'red', sh=5), *wheel(22, 76, 12), *wheel(78, 76, 12), Part(ellipse(68, 26, 6, 4), 'yellow', flat=True, sep=False)]
@icon('🚁')
def helicopter():
    body = svg('M16 54 Q16 36 38 34 L64 34 Q76 36 80 50 L96 50 L98 58 L80 60 Q76 72 58 74 L30 74 Q16 72 16 54 Z')
    return [Part(stroke(polyline((4, 22), (96, 22)), 5), 'black', shade=False), Part(rrect(46, 22, 8, 14, 2), 'black', sh=1),
            Part(stroke(polyline((24, 86), (68, 86), (76, 80)), 4), 'black', shade=False), Part(stroke(polyline((34, 74), (34, 86)), 3.6), 'black', shade=False),
            Part(stroke(polyline((58, 74), (58, 86)), 3.6), 'black', shade=False),
            Part(body, 'olive', sh=6), Part(svg('M20 52 Q22 40 36 40 L42 40 L42 56 L20 56 Z'), 'glass', sep=False, sh=2)]
@icon('🚤')
def speedboat():
    hull = svg('M2 56 L98 56 Q92 78 70 80 L16 80 Z')
    cabin = svg('M30 56 L42 36 L66 36 L72 56 Z')
    water = svg('M0 84 Q12 78 25 84 Q38 90 50 84 Q62 78 75 84 Q88 90 100 84 L100 100 L0 100 Z')
    return [Part(cabin, 'glass', sh=3), Part(hull, 'white', lines=[polyline((8, 66), (92, 66))], lw=4, lc='#e2453d'), Part(water, 'water', sh=3)]
@icon('🛞')
def tire():
    return [Part(circle(50, 50, 44), 'rubber', sh=7, lines=[*[rot(polyline((50, 8), (50, 18)), a, 50, 50) for a in range(0, 360, 30)]], lw=2.4, lc='#555c69'),
            Part(circle(50, 50, 22), 'steel', sh=4), Part(circle(50, 50, 7), 'iron', sh=2)]
