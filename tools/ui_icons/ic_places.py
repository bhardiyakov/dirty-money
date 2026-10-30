# Lugares (mapa, celular, lojas), placas e bandeiras.
from iconlib import *
from icons import icon, gloss, ink, inkline

def house(x, y, w, h, wall='sand', roof='red', door=True):
    body = rrect(x, y + h * 0.42, w, h * 0.58, 2)
    rf = poly((x - 4, y + h * 0.46), (x + w / 2, y), (x + w + 4, y + h * 0.46))
    items = [Part(body, wall, sh=4), Part(rf, roof, sh=4)]
    if door: items.append(Part(rrect(x + w * 0.4, y + h * 0.7, w * 0.2, h * 0.3, 2), 'brown', sh=2))
    return items

@icon('🏠')
def home():
    return [*house(12, 12, 76, 84), Part(rrect(62, 14, 10, 24, 1), 'brown', sh=2), Part(rrect(20, 60, 16, 14, 2), 'glass', sh=2)]
@icon('🏘')
def houses():
    return [*house(40, 6, 54, 56, 'white', 'blue', False), *house(6, 36, 60, 60), Part(rrect(70, 46, 12, 12, 2), 'glass', sh=2)]
@icon('🏙')
def city():
    bld = [rrect(4, 40, 22, 58, 2), rrect(28, 14, 26, 84, 2), rrect(56, 30, 18, 68, 2), rrect(76, 50, 20, 48, 2)]
    cols = ['blue', 'grey', 'navy', 'teal']
    items = []
    for b, c in zip(bld, cols): items.append(Part(b, c, sh=4))
    wins = U(*[rrect(33 + 9 * j, 22 + 12 * i, 5, 7, 1) for i in range(6) for j in range(2)], *[rrect(9 + 7 * j, 48 + 11 * i, 4, 6, 1) for i in range(4) for j in range(2)])
    return items + [Layer(wins, '#ffe08a')]
@icon('🏥')
def hospital():
    return [Part(rrect(8, 22, 84, 76, 4), 'white', sh=6), Part(rrect(30, 8, 40, 20, 3), 'white', sh=3),
            Part(U(rrect(42, 32, 16, 40, 2), rrect(30, 44, 40, 16, 2)), 'red', sh=2), Part(rrect(40, 80, 20, 18, 2), 'glass', sh=2)]
@icon('🏦')
def bank():
    roof = poly((4, 34), (50, 6), (96, 34))
    cols = U(*[rrect(14 + 20 * i, 38, 10, 44, 1) for i in range(4)])
    return [Part(roof, 'steel', sh=4), Part(rrect(6, 32, 88, 8, 2), 'steel', sh=2), Part(cols, 'white', sh=2), Part(rrect(4, 82, 92, 14, 2), 'steel', sh=3),
            Part(circle(50, 22, 7), 'gold', sh=2)]
@icon('🏪')
def store():
    awning = U(*[poly((8 + 14 * i, 30), (22 + 14 * i, 30), (22 + 14 * i, 44), (8 + 14 * i, 44)) for i in range(6)])
    stripes = U(*[poly((8 + 28 * i, 30), (22 + 28 * i, 30), (22 + 28 * i, 44), (8 + 28 * i, 44)) for i in range(3)])
    return [Part(rrect(10, 40, 80, 56, 3), 'white', sh=5), Part(rrect(8, 10, 84, 20, 3), 'leaf', sh=3), Part(awning, 'red', sh=2),
            Part(stripes, 'white', flat=True, sep=False, outline=False), Part(rrect(18, 54, 30, 24, 2), 'glass', sh=2), Part(rrect(56, 54, 24, 42, 2), 'brown', sh=2)]
@icon('🏭')
def factory():
    body = poly((4, 96), (4, 50), (28, 36), (28, 50), (52, 36), (52, 50), (76, 36), (76, 96))
    return [Layer(U(circle(86, 14, 8), circle(94, 6, 6)), alpha('#c9ced8', 0.9)), Part(rrect(78, 18, 14, 78, 2), 'red', sh=3), Part(body, 'grey', sh=5),
            Part(U(*[rrect(10 + 22 * i, 62, 14, 12, 2) for i in range(3)]), 'glass', sh=2)]
@icon('⛪')
def church():
    return [Part(U(rrect(46, 2, 8, 22), rrect(40, 8, 20, 7)), 'gold', sh=1.5), Part(poly((30, 40), (50, 20), (70, 40)), 'red', sh=3),
            Part(rrect(32, 38, 36, 58, 2), 'white', sh=4), Part(rrect(6, 58, 88, 38, 2), 'white', sh=4), Part(poly((2, 62), (24, 46), (46, 62)), 'red', sh=2), Part(poly((54, 62), (76, 46), (98, 62)), 'red', sh=2),
            Part(svg('M42 96 L42 74 Q50 64 58 74 L58 96 Z'), 'brown', sh=2)]
@icon('⛽')
def fuel():
    return [Part(stroke(polyline((70, 40), (86, 40), (86, 76), (94, 76), (94, 30), (84, 20)), 4.4), 'black', shade=False),
            Part(rrect(14, 10, 56, 86, 8), 'red', sh=6), Part(rrect(22, 20, 40, 24, 4), 'glass', sh=2), Part(rrect(8, 88, 68, 10, 3), 'iron', sh=2)]
@icon('🚪')
def door():
    return [Part(rrect(20, 4, 60, 94, 4), 'wood', sh=6, lines=[polyline((30, 14), (70, 14), (70, 44), (30, 44), (30, 14)), polyline((30, 54), (70, 54), (70, 88), (30, 88), (30, 54))], lw=2.4),
            Part(circle(68, 52, 4.5), 'gold', sh=1.5)]
@icon('🚧')
def construction():
    board = rrect(6, 20, 88, 34, 4)
    stripes = U(*[poly((x, 20), (x + 14, 20), (x - 6, 54), (x - 20, 54)) for x in range(14, 120, 28)])
    return [Part(U(rrect(16, 50, 8, 46), rrect(76, 50, 8, 46)), 'grey', sh=2), Part(board, 'white', sh=4), Part(I(stripes, board), 'orange', flat=True, sep=False, outline=False),
            Part(circle(20, 12, 7), 'yellow', sh=2), Part(circle(80, 12, 7), 'yellow', sh=2)]
@icon('🛑')
def stop():
    import math
    oct_ = poly([(50 + 46 * math.cos(math.radians(22.5 + 45 * i)), 50 + 46 * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)])
    return [Part(oct_, 'red', sh=7), Layer(stroke(poly([(50 + 39 * math.cos(math.radians(22.5 + 45 * i)), 50 + 39 * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]), 3), '#f4f4f4'),
            Layer(rrect(24, 44, 52, 12, 3), '#f4f4f4')]
@icon('🏁')
def checkered():
    flag = svg('M18 10 Q42 2 60 10 Q78 18 94 10 L94 56 Q78 64 60 56 Q42 48 18 56 Z')
    sq = U(*[rrect(18 + 15.2 * j, 10 + 11.5 * i, 15.2, 11.5) for i in range(4) for j in range(5) if (i + j) % 2 == 0])
    return [Part(cap(14, 6, 14, 98, 4), 'iron', sh=2), Part(flag, 'white', sh=4), Part(I(sq, flag), 'black', flat=True, sep=False, outline=False)]
@icon('🏳')
def white_flag():
    return [Part(cap(14, 6, 14, 98, 4), 'iron', sh=2), Part(svg('M18 10 Q42 2 60 10 Q78 18 94 10 L94 56 Q78 64 60 56 Q42 48 18 56 Z'), 'white', sh=4)]
@icon('🏴')
def black_flag():
    return [Part(cap(14, 6, 14, 98, 4), 'iron', sh=2), Part(svg('M18 10 Q42 2 60 10 Q78 18 94 10 L94 56 Q78 64 60 56 Q42 48 18 56 Z'), 'black', sh=4)]
@icon('🗺')
def worldmap():
    panels = [poly((4, 14), (34, 6), (34, 86), (4, 94)), poly((34, 6), (66, 14), (66, 94), (34, 86)), poly((66, 14), (96, 6), (96, 86), (66, 94))]
    land = U(blob((14, 30), (30, 24), (44, 34), (40, 52), (24, 58), (12, 46)), blob((54, 56), (70, 50), (86, 60), (80, 76), (60, 78)))
    return [Part(panels[0], 'paper', sh=3), Part(panels[1], '#e1d5b8', flat=True), Part(panels[2], 'paper', sh=3), Part(land, 'leaf', flat=True, sep=False, outline=False),
            Part(svg('M70 20 Q78 20 78 28 Q78 34 70 42 Q62 34 62 28 Q62 20 70 20 Z'), 'red', sh=2)]
@icon('🌐')
def globe():
    return [Part(circle(50, 50, 44), 'blue', sh=7, lines=[ellipse(50, 50, 20, 44), polyline((6, 50), (94, 50)), curve((12, 28), (50, 34), (88, 28)), curve((12, 72), (50, 66), (88, 72)), polyline((50, 6), (50, 94))], lw=2.4, lc='#bfe0ff')]
@icon('🏟')
def stadium():
    # o Maracanã em 3/4: a parede do anel, a cobertura branca, a arquibancada azul e o gramado com a linha do meio
    wall = U(rrect(4, 52, 92, 26, 4), ellipse(50, 78, 46, 17))
    return [Part(wall, 'grey', sh=4, lines=[polyline((20, 60), (20, 88)), polyline((36, 62), (36, 93)), polyline((50, 62), (50, 95)), polyline((64, 62), (64, 93)), polyline((80, 60), (80, 88))], lw=2.2),
            Part(ellipse(50, 52, 46, 30), 'white', sh=5), Part(ellipse(50, 51, 35, 20), 'blue', sh=3),
            Part(ellipse(50, 51, 23, 12), 'leaf', sh=2, lines=[polyline((50, 40), (50, 62)), circle(50, 51, 4.5)], lw=1.8, lc='#eaffdf')]
@icon('✝')
def redeemer():
    # o Cristo de braços abertos no alto do morro
    hill = svg('M2 98 Q22 70 40 74 Q50 66 60 74 Q80 66 98 98 Z')
    robe = poly((44.5, 28), (55.5, 28), (60, 66), (40, 66))
    return [Part(hill, 'leaf', sh=4), Part(rrect(40, 64, 20, 12, 2), 'grey', sh=2), Part(U(robe, rrect(6, 25, 88, 9, 4.5)), 'white', sh=3),
            Part(circle(50, 17, 7.5), 'white', sh=2)]
@icon('🚡')
def tramway():
    # o bondinho: o cabo, o carrinho e a cabine vermelha pendurada
    return [Part(stroke(polyline((2, 14), (98, 42)), 3.4), 'iron', shade=False, hl=False), Part(rrect(47.5, 30, 5, 14, 1), 'iron', shade=False, hl=False),
            Part(rrect(38, 22, 24, 9, 3), 'grey', sh=1.5), Part(rrect(24, 42, 52, 42, 8), 'red', sh=5),
            Part(U(rrect(31, 50, 16, 15, 2.5), rrect(53, 50, 16, 15, 2.5)), 'glass', sh=2), Part(rrect(24, 76, 52, 8, 3), 'iron', sh=1.5)]
