# Ícones que faltavam (o teste 14_icones apontava 34): rostos e gestos, objetos da furtividade e dos roubos, aviação, sinais e telas.
from iconlib import *
from icons import icon, gloss, ink, inkline, inkcurve, wheel
from ic_faces import head, e_wide, e_closed, e_dot
from ic_hands import fingers_up, SK
from ic_objects import phone

# ---------------------------------------------------------------------------- rostos e corpo
@icon('😱')
def scream():
    pale = I(circle(50, 52, 43), rrect(0, 0, 100, 40))
    return [head(), Layer(pale, alpha('#6f8fd8', 0.55)), *e_wide(40, 15), Part(ellipse(50, 70, 9, 14), '#5a1820', shade=False, hl=False, sep=False, outline=False),
            Part(ellipse(10, 64, 10, 18, -12), SK, sh=3), Part(ellipse(90, 64, 10, 18, 12), SK, sh=3)]
@icon('🫣')
def peeking():
    hand = U(rrect(12, 60, 76, 32, 14), fingers_up([20, 50, 80], 28, 64, r=6.2))           # (dedos abertos: os olhos espiam no vão)
    return [head(), Part(hand, SK, sh=4), *e_dot(44, 15, 5.5)]
@icon('😮‍💨')
def exhaling():
    puff = U(circle(84, 70, 9), circle(93, 61, 7), circle(95, 76, 6))
    return [head(), *e_closed(44, 15), Part(ellipse(60, 68, 6, 7), '#5a1820', flat=True, sep=False, outline=False), Part(puff, 'white', sh=2)]
@icon('👁')
def eye():
    lens = I(circle(50, 92, 62), circle(50, 8, 62))
    return [Part(lens, 'white', sh=4), Part(circle(50, 50, 17), 'blue', sh=3, sep=False), ink(circle(50, 50, 7)), gloss(45, 45, 4, 4, 0, 0.9)]
@icon('👂')
def ear():
    outer = ellipse(52, 50, 28, 42)
    inner = svg('M60 26 Q40 20 36 40 Q34 52 46 56 Q54 60 50 72')
    return [Part(outer, SK, sh=6), Layer(stroke(inner, 6), dark('#b9774c', 0.35)), Part(ellipse(46, 66, 8, 7), dark('#b9774c', 0.15), flat=True, sep=False, outline=False)]
@icon('👆')
def point_up():
    fist = rrect(26, 48, 50, 44, 14)
    finger = cap(44, 52, 44, 8, 7.5)
    thumb = rrect(20, 58, 34, 14, 7)
    return [Part(finger, SK, sh=3), Part(fist, SK, sh=6, lines=[polyline((56, 60), (76, 60)), polyline((56, 72), (76, 72))], lw=2.2), Part(thumb, SK, sh=3)]

# ---------------------------------------------------------------------------- objetos
@icon('🪕')
def banjo():
    neck = rrect(46, 4, 12, 62, 3, 32)
    drum = circle(36, 66, 30)
    strings = [rot(polyline((48 + 2 * i, 10), (48 + 2 * i, 70)), 32, 52, 36) for i in range(3)]
    return [Part(neck, 'wood', sh=3), Part(drum, 'wood', sh=4), Part(circle(36, 66, 23), 'paper', sh=4, sep=True), *[Layer(stroke(s, 1.4), '#5a616c') for s in strings]]
@icon('🩺')
def stethoscope():
    tube = stroke(svg('M26 10 L26 40 Q26 62 46 62 Q66 62 66 40 L66 10'), 5)
    down = stroke(svg('M46 62 Q46 84 66 84 L74 84'), 5)
    return [Part(U(tube, down), 'black', shade=False), Part(circle(26, 10, 5), 'steel', sh=1.5), Part(circle(66, 10, 5), 'steel', sh=1.5),
            Part(circle(80, 82, 13), 'steel', sh=3), Part(circle(80, 82, 6), 'iron', flat=True, sep=False)]
@icon('🛟')
def ring_buoy():
    ring = D(circle(50, 50, 44), circle(50, 50, 21))
    reds = U(*[pie(50, 50, 46, a, a + 45) for a in (0, 90, 180, 270)])
    return [Part(ring, 'white', sh=6), Part(I(ring, reds), 'red', flat=True, sep=False, outline=False), Layer(stroke(arc(50, 50, 32, 0, 360), 1.8), alpha('#5a616c', 0.6))]
@icon('🗄')
def file_cabinet():
    drawers = [rrect(20, 14 + 26 * i, 60, 22, 3) for i in range(3)]
    return [Part(rrect(14, 6, 72, 90, 5), 'grey', sh=5), *[Part(d, 'steel', sh=2) for d in drawers], *[Part(rrect(40, 22 + 26 * i, 20, 5, 2), 'iron', flat=True, sep=False) for i in range(3)]]
@icon('🗝')
def old_key():
    bow = D(U(circle(26, 26, 18), circle(14, 14, 9), circle(38, 14, 9), circle(14, 38, 9)), circle(26, 26, 7))
    shaft = rot(rrect(34, 22, 60, 9, 4), 45, 26, 26)
    bits = U(rot(rrect(78, 30, 8, 14, 1), 45, 26, 26), rot(rrect(66, 30, 6, 10, 1), 45, 26, 26))
    return [Part(U(bow, shaft, bits), 'brass', sh=4)]
@icon('🔦')
def flashlight():
    beam = poly((62, 30), (100, 4), (100, 58))
    body = rrect(8, 54, 46, 20, 6, -28)
    headp = rot(poly((50, 50), (68, 42), (68, 74), (50, 66)), -28, 50, 58)
    return [Layer(beam, alpha('#ffe36b', 0.55)), Part(body, 'black', sh=3), Part(headp, 'steel', sh=3), Part(rot(rrect(22, 60, 10, 6, 2), -28, 27, 63), 'red', flat=True, sep=False)]
@icon('🔕')
def bell_off():
    bell = svg('M50 10 Q74 12 76 44 L82 70 L18 70 L24 44 Q26 12 50 10 Z')
    return [Part(bell, 'gold', sh=6), Part(circle(50, 78, 8), 'gold', sh=2), Part(rrect(12, 66, 76, 8, 4), 'brass', sh=2),
            Part(stroke(polyline((14, 90), (86, 10)), 9), 'red', sh=2)]
@icon('📥')
def inbox():
    tray = svg('M8 58 L28 58 L34 70 L66 70 L72 58 L92 58 L92 90 L8 90 Z')
    arrow = poly((50, 56), (72, 34), (58, 34), (58, 6), (42, 6), (42, 34), (28, 34))
    return [Part(arrow, 'green', sh=4), Part(tray, 'blue', sh=5)]
@icon('⏱')
def stopwatch():
    return [Part(rrect(42, 4, 16, 10, 3), 'steel', sh=2), Part(rrect(70, 14, 12, 8, 3, 40), 'steel', sh=1.5), Part(circle(50, 56, 40), 'steel', sh=5),
            Part(circle(50, 56, 32), 'white', sh=4, sep=False), inkline((50, 56), (50, 32), w=4), inkline((50, 56), (66, 64), w=3.2), ink(circle(50, 56, 4))]
@icon('🧼')
def soap():
    bar = rrect(12, 40, 64, 44, 14, -12)
    bubbles = [circle(76, 30, 12), circle(58, 18, 8), circle(86, 54, 7)]
    return [Part(bar, 'pink', sh=6), *[Part(b, 'glass', sh=2) for b in bubbles], gloss(28, 52, 8, 4, -12, 0.5)]
@icon('🪂')
def parachute():
    canopy = D(ellipse(50, 40, 46, 34), rrect(0, 40, 100, 60))
    reds = U(*[I(canopy, rrect(4 + 23 * i, 0, 11.5, 40)) for i in range(4)])
    lines = [polyline((6, 40), (46, 80)), polyline((32, 40), (48, 80)), polyline((68, 40), (52, 80)), polyline((94, 40), (54, 80))]
    return [*[Layer(stroke(l, 1.8), '#3a3f49') for l in lines], Part(canopy, 'white', sh=5), Part(reds, 'red', flat=True, sep=False, outline=False),
            Part(rrect(42, 78, 16, 18, 4), 'olive', sh=2)]
@icon('🎞')
def film():
    strip = rrect(6, 18, 88, 64, 4)
    holes = U(*[rrect(10 + 14 * i, 22, 7, 7, 1.5) for i in range(6)], *[rrect(10 + 14 * i, 71, 7, 7, 1.5) for i in range(6)])
    return [Part(D(strip, holes), 'black', sh=4), Part(rrect(14, 34, 32, 32, 2), 'glass', sh=2), Part(rrect(54, 34, 32, 32, 2), 'orange', sh=2)]
@icon('⌨')
def keyboard():
    keys = U(*[rrect(12 + 10 * j, 30 + 12 * i, 7, 8, 1.5) for i in range(3) for j in range(8)], rrect(26, 66, 48, 8, 2))
    return [Part(rrect(4, 22, 92, 58, 6), 'grey', sh=5), Part(keys, 'white', flat=True, sep=False)]
@icon('🖱')
def mouse():
    body = rrect(26, 22, 48, 70, 24)
    return [Layer(stroke(curve((50, 22), (50, 10), (70, 6)), 3.2), INK), Part(body, 'white', sh=6, lines=[polyline((50, 24), (50, 50)), polyline((28, 50), (72, 50))], lw=2.4),
            Part(rrect(46, 32, 8, 12, 4), 'iron', flat=True, sep=False)]
@icon('📳')
def vibrate():
    waves = [Layer(stroke(arc(50, 50, r, a0, a1), 4), '#f0882a') for r in (36, 46) for a0, a1 in ((-35, 35), (145, 215))]
    return [*waves, *phone()]
@icon('🎬')
def clapper():
    board = rrect(8, 42, 84, 48, 4)
    top = rot(rrect(8, 24, 84, 16, 3), -14, 8, 40)
    stripes = U(*[rot(poly((14 + 18 * i, 24), (24 + 18 * i, 24), (18 + 18 * i, 40), (8 + 18 * i, 40)), -14, 8, 40) for i in range(5)])
    return [Part(top, 'black', sh=2), Layer(I(stripes, top), '#f1f4f8'), Part(board, 'black', sh=5, lines=[polyline((14, 58), (86, 58)), polyline((14, 72), (86, 72))], lw=2, lc='#9aa1ab')]

# ---------------------------------------------------------------------------- sinais e letras (botões)
def _btn(color='blue'):
    return Part(rrect(4, 14, 92, 72, 12), color, sh=5)
def _letters(strokes, w=6.2):
    return Layer(U(*[stroke(s, w) for s in strokes]), '#ffffff')
@icon('🆕')
def new_button():
    N = [polyline((14, 64), (14, 36), (32, 64), (32, 36))]
    E = [polyline((56, 36), (42, 36), (42, 64), (56, 64)), polyline((42, 50), (54, 50))]
    W = [polyline((62, 36), (68, 64), (75, 46), (82, 64), (88, 36))]
    return [_btn('blue'), _letters(N + E + W, 5.4)]
@icon('🅿')
def parking():
    P_ = [polyline((38, 74), (38, 26), (56, 26)), svg('M56 26 Q70 26 70 39 Q70 52 56 52 L38 52')]
    return [_btn('blue'), _letters(P_, 9)]
@icon('🔠')
def letters_upper():
    A = [polyline((12, 46), (20, 22), (28, 46)), polyline((15, 38), (25, 38))]
    B = [polyline((58, 46), (58, 22), (68, 22)), svg('M68 22 Q76 22 76 28 Q76 34 68 34 L58 34'), svg('M68 34 Q78 34 78 40 Q78 46 68 46 L58 46')]
    C = [svg('M30 58 Q14 56 14 68 Q14 80 30 78')]
    D_ = [polyline((58, 56), (58, 80)), svg('M58 56 Q78 56 78 68 Q78 80 58 80')]
    return [_btn('blue'), _letters(A + B + C + D_, 4.6)]
@icon('⬅')
def left():
    return [Part(poly((6, 50), (48, 10), (48, 36), (94, 36), (94, 64), (48, 64), (48, 90)), 'blue', sh=5)]
@icon('🌊')
def wave():
    body = svg('M4 92 L4 60 Q14 30 44 22 Q74 16 86 36 Q66 30 58 44 Q52 56 66 64 Q80 70 96 60 L96 92 Z')
    foam = svg('M44 22 Q74 16 86 36 Q66 30 58 44 Q56 34 44 30 Z')
    return [Part(body, 'water', sh=6), Part(foam, 'white', sh=2, sep=False)]
@icon('🌃')
def night_city():
    sky = rrect(2, 4, 96, 92, 10)
    bld = U(rrect(6, 50, 20, 46), rrect(28, 30, 22, 66), rrect(52, 44, 18, 52), rrect(72, 58, 22, 38))
    wins = U(*[rrect(33 + 9 * j, 38 + 11 * i, 5, 6, 1) for i in range(4) for j in range(2)], *[rrect(10 + 7 * j, 58 + 10 * i, 4, 5, 1) for i in range(3) for j in range(2)],
             *[rrect(56 + 7 * j, 52 + 11 * i, 4, 5, 1) for i in range(3) for j in range(2)], rrect(78, 66, 4, 5, 1), rrect(86, 74, 4, 5, 1))
    stars = U(*[circle(x, y, 1.8) for x, y in ((14, 16), (40, 12), (60, 22), (22, 34))])
    return [Part(sky, 'navy', sh=4), Layer(stars, '#fff08f'), Part(D(circle(78, 24, 12), circle(84, 19, 10)), 'yellow', flat=True, sep=False),
            Part(I(bld, sky), 'black', flat=True, sep=False), Layer(wins, '#ffe08a')]

# ---------------------------------------------------------------------------- aviação e estrada
def _plane_top():
    body = cap(50, 8, 50, 92, 8)
    wings = poly((50, 36), (94, 58), (94, 66), (50, 54), (6, 66), (6, 58))
    tail = poly((50, 78), (68, 90), (68, 95), (50, 89), (32, 95), (32, 90))
    return U(body, wings, tail)
@icon('✈')
def airplane():
    p = rot(_plane_top(), 45)
    return [Part(p, 'white', sh=5), Layer(rot(cap(50, 14, 50, 20, 4), 45), '#4f98b0')]
def _plane_side(c='white'):
    body = svg('M8 50 Q8 42 18 42 L74 42 Q92 44 96 52 Q92 58 74 58 L18 58 Q8 58 8 50 Z')
    wing = poly((40, 50), (60, 50), (48, 72), (36, 72))
    tail = poly((10, 44), (18, 44), (26, 24), (16, 24))
    wins = U(*[circle(30 + 9 * i, 48, 2.4) for i in range(6)])
    return [Part(tail, 'blue', sh=2), Part(body, c, sh=4), Layer(wins, '#4f98b0'), Part(wing, 'grey', sh=2)]
def _turned(items, deg, cx=50, cy=46):
    for it in items: it.shape = rot(it.shape, deg, cx, cy)          # (gira as peças prontas: Part e Layer guardam a forma em .shape)
    return items
def _runway():
    return Part(rrect(4, 86, 92, 8, 3), 'iron', flat=True, lines=[polyline((14, 90), (30, 90)), polyline((44, 90), (60, 90)), polyline((74, 90), (88, 90))], lw=2, lc='#ffffff')
@icon('🛫')
def takeoff(): return [_runway(), *_turned(_plane_side(), -20)]
@icon('🛬')
def landing(): return [_runway(), *_turned(_plane_side(), 16)]
@icon('🛩')
def small_plane():
    body = svg('M14 52 Q14 44 24 44 L70 44 Q86 46 88 54 Q86 60 70 60 L24 60 Q14 60 14 52 Z')
    wing = rrect(34, 30, 34, 8, 3)
    return [Part(poly((14, 46), (22, 46), (28, 30), (18, 30)), 'white', sh=2), Part(wing, 'white', sh=2), Part(body, 'red', sh=4),
            Part(svg('M60 46 L72 46 Q80 48 80 52 L60 52 Z'), 'glass', sep=False, sh=1), Part(rrect(88, 40, 4, 28, 2), 'iron', sh=1), *wheel(42, 70, 6)]
@icon('🚑')
def ambulance():
    body = svg('M4 30 Q4 24 10 24 L66 24 Q70 24 74 30 L88 44 Q96 46 96 56 L96 72 Q96 76 92 76 L8 76 Q4 76 4 72 Z')
    cross = U(rrect(26, 36, 8, 24, 1), rrect(18, 44, 24, 8, 1))
    return [Part(rrect(30, 14, 22, 10, 3), 'red', sh=2), Part(body, 'white', sh=5, lines=[polyline((6, 64), (94, 64))], lw=5, lc='#e2453d'),
            Part(svg('M70 32 L84 46 L70 46 Z'), 'glass', sep=False, sh=1), Part(cross, 'red', flat=True, sep=False), *wheel(24, 78, 10), *wheel(76, 78, 10)]
@icon('🚏')
def bus_stop():
    return [Part(rrect(46, 30, 8, 66, 2), 'metal', sh=2), Part(rrect(22, 6, 56, 34, 8), 'blue', sh=4),
            Part(rrect(34, 12, 32, 20, 4), 'white', flat=True, sep=False), Layer(U(rrect(38, 16, 10, 7, 1), rrect(52, 16, 10, 7, 1)), '#4f98b0'), Part(rrect(36, 90, 28, 6, 2), 'iron', sh=1)]
@icon('🛣')
def motorway():
    road = poly((40, 8), (60, 8), (98, 96), (2, 96))
    dash = U(*[poly((49 - 0.6 * t, 14 + 18 * t / 2), (51 + 0.6 * t, 14 + 18 * t / 2), (51.5 + 0.8 * t, 24 + 18 * t / 2), (48.5 - 0.8 * t, 24 + 18 * t / 2)) for t in range(0, 8, 2)])
    return [Part(rrect(0, 40, 100, 58, 6), 'leaf', sh=3), Part(road, 'iron', sh=3), Layer(I(dash, road), '#ffe08a'),
            Layer(stroke(polyline((42, 8), (8, 96)), 2.4), '#f1f4f8'), Layer(stroke(polyline((58, 8), (92, 96)), 2.4), '#f1f4f8')]
