# Pessoas: bustos (contatos do celular, NPCs, clientes) e figuras em movimento (correr, nadar, escalar…). Pele morena do jogo.
from iconlib import *
from icons import icon, gloss, ink, inkline

SKIN = 'skin2'

def shoulders(color, y=70):
    return Part(svg('M10 100 Q10 %d 34 %d L66 %d Q90 %d 90 100 Z' % (y + 4, y, y, y + 4)), color, sh=6)
def neck(skin=SKIN): return Part(rrect(42, 56, 16, 18, 5), skin, shade=False, hl=False)
def face(skin=SKIN, cx=50, cy=40, r=21): return Part(ellipse(cx, cy, r * 0.92, r), skin, sh=5)
def feats(cx=50, cy=40, smile=True):
    out = [ink(ellipse(cx - 7.5, cy + 1, 2.4, 3)), ink(ellipse(cx + 7.5, cy + 1, 2.4, 3))]
    if smile: out.append(Layer(stroke(arc(cx, cy + 6, 7, 30, 150, 4), 2.6), INK))
    return out
def ears(skin=SKIN, cx=50, cy=42): return [Part(ellipse(cx - 19, cy, 4, 6), skin, flat=True), Part(ellipse(cx + 19, cy, 4, 6), skin, flat=True)]

def hair_short(color='hair'):
    return Part(svg('M28 38 Q26 14 50 14 Q74 14 72 38 Q66 26 58 26 Q50 30 40 26 Q32 28 28 38 Z'), color, sh=3)
def hair_curly(color='hair'):
    import math
    pts = [(50 + 26 * math.cos(math.radians(a)), 30 + 20 * math.sin(math.radians(a)) + (3 if i % 2 else 0)) for i, a in enumerate(range(180, 361, 20))]
    return Part(blob([(24, 44)] + pts + [(76, 44), (70, 30), (30, 30)]), color, sh=3)
def hair_long(color='hair'):
    return Part(svg('M26 70 Q20 40 28 22 Q38 8 50 10 Q62 8 72 22 Q80 40 74 70 L66 70 Q70 46 66 32 Q58 26 50 28 Q42 26 34 32 Q30 46 34 70 Z'), color, sh=4)
def hair_white_sides():
    return [Part(svg('M28 46 Q26 30 32 26 Q34 34 34 46 Z'), 'white_hair', flat=True), Part(svg('M72 46 Q74 30 68 26 Q66 34 66 46 Z'), 'white_hair', flat=True)]

def bust(shirt='blue', skin=SKIN, hair=None, extra=(), smile=True, over=()):
    return [shoulders(shirt), neck(skin), *ears(skin), face(skin), *(hair or []), *feats(smile=smile), *extra, *over]

@icon('👤')
def silhouette():
    return [Part(svg('M10 100 Q10 70 34 66 L66 66 Q90 70 90 100 Z'), 'grey', sh=6), Part(circle(50, 38, 22), 'grey', sh=5)]
@icon('🗣')
def speaking():
    head = svg('M20 100 L20 80 Q8 74 12 56 Q8 30 30 18 Q54 8 66 28 Q72 38 70 48 L78 58 L70 62 L70 72 Q66 80 56 78 L56 100 Z')
    waves = U(stroke(arc(74, 40, 12, -45, 45), 4), stroke(arc(74, 40, 22, -45, 45), 4))
    return [Part(head, 'grey', sh=6), Part(waves, 'grey', shade=False, hl=False)]
@icon('👨', '🧑')
def man(): return bust('blue', hair=[hair_short()])
@icon('👨‍🦲')
def bald():
    return bust('orange', over=[gloss(42, 26, 6, 3, -20, 0.5)])
@icon('👨‍🦳')
def white_hair_man(): return bust('green', hair=[hair_short('white_hair')])
@icon('👩')
def woman():
    return [hair_long(), shoulders('pink'), neck(), face(), Part(svg('M28 40 Q28 16 50 16 Q72 16 72 40 Q62 26 50 30 Q38 26 28 40 Z'), 'hair', sh=3), *feats()]
@icon('👩‍🦱')
def woman_curly():
    import math
    big = blob([(50 + 34 * math.cos(math.radians(a)), 40 + 32 * math.sin(math.radians(a)) + (4 if i % 2 else 0)) for i, a in enumerate(range(0, 360, 24))])
    return [Part(big, 'hair', sh=6), shoulders('purple'), neck(), face(), *feats()]
@icon('👩‍🦳')
def woman_white():
    return [hair_long('white_hair'), shoulders('lilac'), neck(), face(), Part(svg('M28 40 Q28 16 50 16 Q72 16 72 40 Q62 26 50 30 Q38 26 28 40 Z'), 'white_hair', sh=3), *feats()]
@icon('🧑‍🦱')
def curly(): return bust('teal', hair=[hair_curly()])
@icon('🧒')
def child():
    return [Part(svg('M22 100 Q22 78 40 74 L60 74 Q78 78 78 100 Z'), 'yellow', sh=5), Part(rrect(44, 62, 12, 14, 4), SKIN, flat=True),
            Part(circle(50, 46, 22), SKIN, sh=5), Part(svg('M28 44 Q26 22 50 22 Q74 22 72 44 Q62 32 50 36 Q38 32 28 44 Z'), 'hair', sh=3), *feats(50, 48)]
@icon('👴')
def old_man():
    glasses = U(stroke(circle(42, 41, 6), 2.4), stroke(circle(58, 41, 6), 2.4), stroke(polyline((48, 41), (52, 41)), 2.4))
    return [shoulders('brown'), neck(), *ears(), face(), *hair_white_sides(), *feats(smile=True), Layer(glasses, INK), gloss(44, 25, 6, 3, -20, 0.45)]
@icon('👵')
def old_woman():
    return [shoulders('purple'), neck(), face(), Part(circle(50, 14, 10), 'white_hair', sh=3),
            Part(svg('M28 42 Q26 20 50 20 Q74 20 72 42 Q62 30 50 32 Q38 30 28 42 Z'), 'white_hair', sh=3), *feats()]
@icon('🧔', '🧔‍♂')
def bearded():
    beard = svg('M30 40 Q30 66 50 68 Q70 66 70 40 Q66 52 58 52 L42 52 Q34 52 30 40 Z')
    return [shoulders('red'), neck(), *ears(), face(), hair_short(), Part(beard, 'hair', sh=3), *feats(smile=False),
            Layer(stroke(arc(50, 50, 6, 30, 150, 2), 2.6), '#f0d2bd')]
@icon('👮')
def police():
    cap_ = svg('M24 30 Q24 10 50 10 Q76 10 76 30 L80 34 L20 34 Z')
    return [shoulders('navy'), neck(), *ears(), face(), Part(cap_, 'navy', lines=[polyline((22, 30), (78, 30))], lw=2.6),
            Part(rrect(18, 30, 64, 6, 3), 'black', sh=1.5), Part(svg('M50 14 L56 18 L54 25 L46 25 L44 18 Z'), 'gold', sh=1.5), *feats(smile=False),
            Part(svg('M40 82 L46 84 L44 90 L38 88 Z'), 'gold', sh=1)]
@icon('🧑‍🔧')
def mechanic():
    cap_ = svg('M26 34 Q26 14 50 14 Q74 14 74 34 Z')
    wr = rot(U(cap(0, 0, 0, 22, 3.4), D(circle(0, -3, 6.5), rrect(-3, -12, 6, 10))), 35, 0, 0).transform(1, 0, 0, 1, 76, 72)
    return [shoulders('blue'), neck(), *ears(), face(), Part(U(cap_, rrect(50, 28, 34, 6, 3)), 'orange', sh=3), *feats(), Part(wr, 'steel', sh=2)]
@icon('🕵')
def detective():
    hat = U(svg('M30 30 Q30 8 50 8 Q70 8 70 30 Z'), ellipse(50, 30, 34, 7))
    coat = svg('M10 100 Q10 70 34 66 L50 84 L66 66 Q90 70 90 100 Z')
    return [Part(coat, 'sand', sh=6), neck(), face(), Part(hat, 'brown', lines=[polyline((32, 24), (68, 24))], lw=3), *feats(smile=False),
            Part(U(rrect(30, 40, 16, 8, 4), rrect(54, 40, 16, 8, 4)), 'black', sh=1)]
@icon('🥷')
def ninja():
    hood = svg('M18 100 Q14 70 26 56 Q18 40 24 26 Q34 8 50 8 Q66 8 76 26 Q82 40 74 56 Q86 70 82 100 Z')
    slit = rrect(28, 34, 44, 14, 7)
    return [Part(hood, 'black', sh=6), Part(slit, SKIN, sep=True, sh=2), ink(ellipse(40, 41, 3, 3.6)), ink(ellipse(60, 41, 3, 3.6)),
            Part(svg('M70 30 L92 22 L88 30 L94 36 Z'), 'red', sh=2)]

# ---------------------------------------------------------------------------- figuras (corpo inteiro)
def figure(pose, shirt='blue', pants='denim', skin=SKIN, head=(50, 14), hr=10):
    """pose: {'torso': (pts), 'arms': [pts, pts], 'legs': [pts, pts]} — braços e pernas como cápsulas grossas."""
    items = []
    for leg in pose.get('legs', []): items.append(Part(capsule(*leg, r=6.2), pants, sh=3))
    items.append(Part(capsule(*pose['torso'], r=9), shirt, sh=4))
    for arm in pose.get('arms', []): items.append(Part(capsule(*arm, r=4.8), shirt, sh=2.5))
    for arm in pose.get('arms', []): items.append(Part(circle(*arm[-1], 5.2), skin, flat=True))
    items.append(Part(circle(*head, hr), skin, sh=3))
    items.append(Part(I(circle(*head, hr), rrect(head[0] - hr, head[1] - hr, 2 * hr, hr * 0.8)), 'hair', flat=True, sep=False, outline=False))
    return items

@icon('🏃')
def runner():
    return figure({'torso': [(54, 30), (46, 56)], 'arms': [[(54, 34), (70, 42), (78, 32)], [(52, 34), (38, 42), (30, 54)]],
                   'legs': [[(46, 56), (62, 70), (60, 90)], [(46, 56), (36, 74), (16, 76)]]}, 'red', 'black', head=(58, 15))
@icon('🚶')
def pedestrian():
    return figure({'torso': [(50, 30), (50, 58)], 'arms': [[(52, 34), (58, 48), (60, 60)], [(48, 34), (40, 48), (38, 60)]],
                   'legs': [[(50, 58), (58, 76), (60, 94)], [(50, 58), (44, 76), (38, 94)]]}, 'green', 'denim', head=(50, 14))
@icon('🧎')
def kneeling():
    return figure({'torso': [(46, 30), (48, 58)], 'arms': [[(48, 34), (58, 46), (66, 52)], [(46, 34), (40, 48), (44, 58)]],
                   'legs': [[(48, 58), (70, 62), (70, 90)], [(48, 58), (46, 90), (26, 92)]]}, 'orange', 'black', head=(46, 15))
@icon('🙇')
def bowing():
    return [*figure({'torso': [(64, 46), (34, 52)], 'arms': [[(40, 52), (36, 72), (38, 84)]], 'legs': [[(64, 48), (66, 72), (66, 96)], [(62, 48), (56, 72), (52, 96)]]},
                    'blue', 'black', head=(20, 60), hr=12), Part(rrect(4, 96, 92, 4, 2), 'grey', flat=True)]
@icon('🙌')
def raising_hands():
    return figure({'torso': [(50, 46), (50, 80)], 'arms': [[(54, 50), (72, 36), (78, 14)], [(46, 50), (28, 36), (22, 14)]],
                   'legs': [[(50, 80), (58, 98)], [(50, 80), (42, 98)]]}, 'yellow', 'denim', head=(50, 32), hr=10)
@icon('🤸')
def cartwheel():
    return [*figure({'torso': [(50, 62), (50, 36)], 'arms': [[(50, 62), (36, 76), (28, 92)], [(50, 62), (64, 76), (72, 92)]],
                     'legs': [[(50, 38), (34, 22), (16, 8)], [(50, 38), (66, 22), (84, 8)]]}, 'purple', 'black', head=(50, 74), hr=10),
            Part(rrect(6, 96, 88, 4, 2), 'grey', flat=True)]
@icon('🧗')
def climbing():
    wall = rrect(68, 0, 32, 100, 4)
    holds = U(ellipse(74, 16, 5, 3), ellipse(76, 50, 5, 3), ellipse(72, 82, 5, 3))
    return [Part(wall, 'sand', sh=5), Part(holds, 'red', sh=1.5, sep=True),
            *figure({'torso': [(50, 36), (48, 62)], 'arms': [[(52, 38), (60, 26), (70, 16)], [(50, 40), (62, 46), (72, 50)]],
                     'legs': [[(48, 62), (60, 72), (70, 82)], [(48, 62), (36, 78), (40, 94)]]}, 'orange', 'olive', head=(46, 22))]
@icon('🏊')
def swimmer():
    water = svg('M0 70 Q12 62 25 70 Q38 78 50 70 Q62 62 75 70 Q88 78 100 70 L100 100 L0 100 Z')
    return [*figure({'torso': [(30, 60), (64, 54)], 'arms': [[(34, 58), (40, 40), (54, 32)]], 'legs': []}, 'red', 'denim', head=(22, 50), hr=10),
            Part(water, 'water', sh=4), Layer(stroke(svg('M6 84 Q18 78 30 84 Q42 90 54 84 Q66 78 78 84 Q90 90 98 84'), 2.6), alpha('#ffffff', 0.7))]
@icon('🏋')
def lifter():
    bar = U(cap(6, 22, 94, 22, 2.6), rrect(6, 10, 8, 24, 2), rrect(86, 10, 8, 24, 2), rrect(14, 13, 6, 18, 2), rrect(80, 13, 6, 18, 2))
    return [*figure({'torso': [(50, 46), (50, 70)], 'arms': [[(54, 48), (66, 40), (70, 24)], [(46, 48), (34, 40), (30, 24)]],
                     'legs': [[(50, 70), (64, 80), (62, 98)], [(50, 70), (36, 80), (38, 98)]]}, 'red', 'black', head=(50, 36), hr=9),
            Part(bar, 'iron', sh=2)]
@icon('🚴')
def cyclist():
    frame = U(stroke(polyline((24, 76), (44, 56), (66, 56), (76, 76)), 3.6), stroke(polyline((44, 56), (52, 76), (66, 56)), 3.6), stroke(polyline((24, 76), (52, 76)), 3.6))
    return [Part(stroke(circle(24, 76, 16), 5), 'rubber', sh=2), Part(stroke(circle(76, 76, 16), 5), 'rubber', sh=2), Part(frame, 'red', shade=False),
            *figure({'torso': [(46, 26), (40, 50)], 'arms': [[(46, 30), (58, 40), (66, 48)]], 'legs': [[(40, 50), (56, 62), (52, 76)]]}, 'yellow', 'black', head=(52, 16), hr=9)]
