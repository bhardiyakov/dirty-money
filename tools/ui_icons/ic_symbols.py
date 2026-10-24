# Símbolos (avisos, setas, estados), clima e natureza.
from iconlib import *
from icons import icon, gloss, ink, inkline
import math

HEART = 'M50 92 C20 70 6 52 6 34 C6 18 18 8 31 8 C40 8 46 13 50 20 C54 13 60 8 69 8 C82 8 94 18 94 34 C94 52 80 70 50 92 Z'

@icon('❤')
def heart():
    return [Part(svg(HEART), 'red'), Layer(ellipse(28, 28, 7, 10, 35), alpha('#ffffff', 0.7))]
@icon('⚠')
def warning():
    return [Part(svg('M50 6 L96 88 Q98 94 92 94 L8 94 Q2 94 4 88 Z'), 'yellow'), Layer(U(rrect(45, 32, 10, 34, 5), circle(50, 78, 5.5)), INK)]
@icon('⚡')
def bolt():
    return [Part(poly((58, 2), (18, 56), (46, 56), (36, 98), (82, 38), (54, 38), (66, 2)), 'yellow', sh=6)]
@icon('🔥')
def fire():
    outer = blob((50, 4), (66, 26), (82, 46), (84, 70), (70, 92), (50, 98), (30, 92), (16, 70), (20, 46), (32, 34), (38, 50), (42, 26))
    inner = blob((52, 40), (62, 56), (68, 74), (60, 90), (50, 93), (40, 90), (33, 76), (38, 60), (46, 64))
    return [Part(outer, 'flame'), Part(inner, 'yellow', sep=False)]
@icon('✅')
def check():
    return [Part(rrect(6, 6, 88, 88, 18), 'green', sh=7), Layer(stroke(polyline((26, 52), (44, 70), (76, 32)), 11), '#f4fff7')]
@icon('❌')
def cross():
    return [Part(U(cap(16, 16, 84, 84, 10), cap(84, 16, 16, 84, 10)), 'red', sh=5)]
@icon('❗')
def exclaim():
    return [Part(U(svg('M38 6 L62 6 L56 66 L44 66 Z')), 'red', sh=4), Part(circle(50, 84, 10), 'red', sh=3)]
@icon('❔')
def question():
    q = stroke(svg('M30 32 Q30 10 50 10 Q72 10 72 30 Q72 44 56 50 Q50 54 50 64'), 13)
    return [Part(q, 'white', sh=3), Part(circle(50, 86, 8), 'white', sh=2)]
@icon('⭐')
def star():
    pts = []
    for i in range(10):
        r = 47 if i % 2 == 0 else 20
        a = math.radians(-90 + 36 * i)
        pts.append((50 + r * math.cos(a), 54 + r * math.sin(a)))
    return [Part(poly(pts), 'gold', sh=6), gloss(38, 40, 5, 3, -30, 0.6)]
@icon('✨')
def sparkles():
    def sp(cx, cy, r):
        return poly([(cx + (r if i % 2 == 0 else r * 0.28) * math.cos(math.radians(-90 + 45 * i)), cy + (r if i % 2 == 0 else r * 0.28) * math.sin(math.radians(-90 + 45 * i))) for i in range(8)])
    return [Part(sp(40, 56, 38), 'gold', sh=4), Part(sp(80, 20, 16), 'gold', sh=2), Part(sp(82, 78, 12), 'gold', sh=1.5)]
@icon('🔴')
def red_circle():
    return [Part(circle(50, 50, 42), 'red', sh=7), gloss(36, 34, 9, 6, -30, 0.45)]
@icon('🟥')
def red_square():
    return [Part(rrect(8, 8, 84, 84, 12), 'red', sh=7)]
@icon('⏩')
def fast_forward():
    return [Part(U(poly((8, 18), (48, 50), (8, 82)), poly((50, 18), (90, 50), (50, 82))), 'blue', sh=5)]
@icon('⏪')
def rewind():
    return [Part(U(poly((92, 18), (52, 50), (92, 82)), poly((50, 18), (10, 50), (50, 82))), 'blue', sh=5)]
@icon('⬆')
def up():
    return [Part(poly((50, 6), (90, 48), (64, 48), (64, 94), (36, 94), (36, 48), (10, 48)), 'blue', sh=5)]
@icon('⬇')
def down():
    return [Part(poly((50, 94), (90, 52), (64, 52), (64, 6), (36, 6), (36, 52), (10, 52)), 'blue', sh=5)]
@icon('🔄')
def cycle():
    a1 = stroke(arc(50, 50, 32, 200, 340), 12, cap='butt')
    a2 = stroke(arc(50, 50, 32, 20, 160), 12, cap='butt')
    tip1 = poly((74, 22), (96, 34), (76, 50))
    tip2 = poly((26, 78), (4, 66), (24, 50))
    return [Part(U(a1, tip1, a2, tip2), 'blue', sh=4)]
@icon('♻')
def recycle():
    arm = U(stroke(polyline((34, 30), (50, 10), (64, 32)), 10), poly((58, 24), (78, 30), (66, 46)))
    return [Part(U(arm, rot(arm, 120, 50, 54), rot(arm, 240, 50, 54)), 'green', sh=4)]
@icon('➰')
def loop():
    return [Part(stroke(curve((6, 66), (28, 70), (52, 58), (60, 36), (46, 24), (34, 36), (42, 58), (68, 70), (94, 66)), 9), 'gold', sh=2)]
@icon('♨')
def hot_springs():
    steam = U(*[stroke(curve((x, 60), (x - 8, 44), (x + 6, 30), (x - 2, 10)), 6) for x in (30, 50, 70)])
    return [Part(steam, 'red', sh=2), Part(svg('M6 66 Q6 92 50 92 Q94 92 94 66 Q84 60 78 66 Q78 82 50 82 Q22 82 22 66 Q16 60 6 66 Z'), 'red', sh=4)]
@icon('💤')
def zzz():
    z = lambda x, y, s: stroke(polyline((x, y), (x + s, y), (x, y + s), (x + s, y + s)), s * 0.28, join='miter')
    return [Part(U(z(8, 54, 34), z(50, 30, 24), z(76, 8, 16)), 'lilac', sh=2)]
@icon('💥')
def boom():
    pts = []
    for i in range(16):
        r = 47 if i % 2 == 0 else 24
        a = math.radians(-90 + 22.5 * i + (6 if i % 4 == 0 else 0))
        pts.append((50 + r * math.cos(a), 50 + r * math.sin(a)))
    inner = [(50 + (p[0] - 50) * 0.55, 50 + (p[1] - 50) * 0.55) for p in pts]
    return [Part(poly(pts), 'orange', sh=5), Part(poly(inner), 'yellow', sh=3)]
@icon('💧')
def droplet():
    return [Part(svg('M50 4 Q74 40 80 58 Q86 92 50 96 Q14 92 20 58 Q26 40 50 4 Z'), 'water', sh=7), gloss(36, 62, 5, 10, 15, 0.6)]
@icon('💨')
def dash():
    return [Part(U(stroke(curve((4, 34), (50, 34), (70, 30), (74, 16), (62, 10), (54, 20)), 7), stroke(curve((4, 56), (70, 56), (90, 60), (92, 76), (78, 82), (72, 72)), 7), stroke(polyline((14, 78), (52, 78)), 7)), 'white', sh=2)]
@icon('🌀')
def cyclone():
    sp = [(50 + (40 - i * 1.2) * math.cos(math.radians(i * 22)), 50 + (40 - i * 1.2) * math.sin(math.radians(i * 22))) for i in range(30)]
    return [Part(stroke(curve(sp), 9), 'blue', sh=2)]
@icon('🌑')
def new_moon():
    return [Part(circle(50, 50, 44), 'black', sh=6), Layer(U(circle(34, 36, 7), circle(62, 62, 9), circle(66, 30, 5)), '#2a2e37')]
@icon('🌙')
def moon():
    return [Part(D(circle(46, 50, 42), circle(70, 38, 36)), 'yellow', sh=5)]
@icon('🌡')
def thermometer():
    return [Part(U(rrect(38, 4, 24, 70, 12), circle(50, 76, 20)), 'white', sh=4), Part(U(rrect(45, 34, 10, 44, 5), circle(50, 76, 13)), 'red', sh=2),
            Layer(U(*[rrect(64, 16 + 12 * i, 10, 3, 1) for i in range(4)]), '#6a717c')]
@icon('🌸')
def blossom():
    petal = ellipse(50, 24, 15, 22)
    return [Part(U(*[rot(petal, a, 50, 52) for a in range(0, 360, 72)]), 'pink', sh=5), Part(circle(50, 52, 10), 'yellow', sh=2)]
@icon('🌺')
def hibiscus():
    petal = ellipse(50, 26, 18, 24)
    return [Part(U(*[rot(petal, a, 50, 52) for a in range(0, 360, 72)]), 'red', sh=5), Part(cap(50, 52, 74, 30, 3), 'yellow', shade=False), Part(circle(74, 30, 5), 'yellow', sh=1)]
@icon('🌿')
def herb():
    leaf = ellipse(0, 0, 9, 18)
    leaves = U(*[rot(move(leaf, x, y), d, x, y) for x, y, d in ((34, 30, -40), (66, 40, 40), (34, 58, -40), (66, 68, 40), (50, 14, 0))])
    return [Part(stroke(curve((50, 96), (48, 60), (50, 20)), 4.4), 'leaf', shade=False), Part(leaves, 'leaf', sh=3)]
@icon('🐍')
def snake():
    body = stroke(curve((14, 88), (40, 92), (60, 80), (50, 62), (30, 54), (32, 36), (56, 30), (74, 34)), 14)
    head = ellipse(80, 30, 14, 11, -10)
    return [Part(body, 'green', sh=3), Part(head, 'green', sh=3), ink(circle(84, 26, 2.6)), Part(stroke(polyline((92, 34), (98, 38), (96, 42)), 2.4), 'red', shade=False)]
@icon('🐔')
def chicken():
    body = blob((30, 40), (50, 36), (76, 44), (86, 62), (76, 84), (46, 88), (22, 76), (16, 58))
    head = circle(34, 30, 16)
    return [Part(body, 'white', sh=6), Part(head, 'white', sh=3), Part(U(circle(30, 12, 6), circle(38, 14, 5)), 'red', sh=1.5), Part(poly((18, 30), (6, 34), (18, 38)), 'yellow', sh=1),
            Part(ellipse(22, 44, 4, 6), 'red', flat=True), ink(circle(32, 28, 2.6)), Part(stroke(polyline((44, 88), (44, 98)), 3.4), 'yellow', shade=False),
            Part(stroke(polyline((60, 88), (60, 98)), 3.4), 'yellow', shade=False), Part(ellipse(62, 62, 16, 10, -20), 'white', sh=2)]
@icon('💬')
def speech():
    b = svg('M14 14 L86 14 Q96 14 96 26 L96 62 Q96 74 86 74 L40 74 L20 92 L24 74 L14 74 Q4 74 4 62 L4 26 Q4 14 14 14 Z')
    return [Part(b, 'white', sh=5), ink(U(circle(30, 44, 5), circle(50, 44, 5), circle(70, 44, 5)))]
