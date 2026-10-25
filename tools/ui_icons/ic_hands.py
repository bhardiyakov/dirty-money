# Mãos e gestos (pele morena do jogo).
from iconlib import *
from icons import icon, gloss, ink, inkline

SK = 'skin2'

def fingers_up(xs, top, base, r=6.6, tops=None):
    return U(*[cap(x, base, x, (tops[i] if tops else top), r) for i, x in enumerate(xs)])

@icon('✋')
def raised_hand():
    palm = rrect(24, 44, 50, 46, 16)
    fing = fingers_up([31, 43, 55, 67], 12, 50, tops=[22, 12, 14, 24])
    thumb = cap(26, 66, 10, 48, 7)
    return [Part(U(palm, fing, thumb), SK, lines=[ln for ln in []], sh=6),
            inkline((36, 52), (36, 34), w=2), inkline((49, 52), (49, 26), w=2), inkline((61, 52), (61, 30), w=2)]
@icon('🖐')
def splayed_hand():
    palm = rrect(28, 46, 46, 44, 16)
    f = U(cap(36, 52, 22, 16, 6.4), cap(46, 50, 44, 10, 6.4), cap(56, 50, 64, 12, 6.4), cap(66, 54, 82, 24, 6.2), cap(30, 68, 8, 52, 7))
    return [Part(U(palm, f), SK, sh=6)]
@icon('✊')
def raised_fist():
    fist = rrect(20, 26, 60, 50, 14)
    arm = rrect(30, 70, 40, 30, 6)
    knuck = [inkline((35, 30), (35, 50), w=2.2), inkline((50, 28), (50, 50), w=2.2), inkline((65, 30), (65, 50), w=2.2)]
    thumb = rrect(16, 48, 46, 14, 7)
    return [Part(arm, SK, sh=5), Part(fist, SK, sh=6), *knuck, Part(thumb, SK, sh=3)]
@icon('👊')
def fist_bump():
    fist = rrect(14, 24, 72, 58, 18)
    return [Part(fist, SK, sh=7), *[Part(rrect(20 + 16 * i, 26, 16, 26, 7), SK, sh=3) for i in range(4)], Part(rrect(22, 56, 44, 16, 8), SK, sh=3)]
@icon('👍')
def thumbs_up():
    fist = rrect(26, 46, 52, 44, 12)
    thumb = U(cap(40, 52, 46, 14, 9), rrect(26, 46, 26, 16, 8))
    cuff = rrect(10, 46, 18, 46, 4)
    return [Part(thumb, SK, sh=4), Part(fist, SK, sh=6, lines=[polyline((52, 58), (78, 58)), polyline((52, 70), (78, 70)), polyline((52, 81), (78, 81))], lw=2.2),
            Part(cuff, 'blue', sh=3)]
@icon('🤏')
def pinching():
    hand = rrect(16, 44, 46, 46, 16)
    index = U(cap(50, 50, 74, 26, 6.4), cap(74, 26, 84, 36, 5.6))
    thumb = U(cap(52, 70, 80, 54, 6.4))
    return [Part(hand, SK, sh=6), Part(index, SK, sh=3), Part(thumb, SK, sh=3)]
@icon('🤝')
def handshake():
    left = U(rrect(4, 40, 30, 30, 8), cap(26, 44, 62, 40, 9))
    right = U(rrect(66, 40, 30, 30, 8), cap(74, 60, 38, 62, 9))
    return [Part(rrect(0, 38, 14, 34, 4), 'navy', sh=2), Part(rrect(86, 38, 14, 34, 4), 'red', sh=2), Part(left, SK, sh=4),
            Part(right, 'skin', sh=4, lines=[polyline((48, 54), (44, 68)), polyline((56, 54), (52, 68))], lw=2.2)]
@icon('🤞')
def crossed():
    palm = rrect(24, 50, 46, 42, 14)
    f1 = cap(40, 56, 56, 12, 6.4)
    f2 = cap(56, 56, 38, 14, 6.4)
    return [Part(palm, SK, sh=6), Part(f2, SK, sh=3), Part(f1, SK, sh=3), Part(cap(26, 70, 14, 56, 6.4), SK, sh=3)]
@icon('🫳')
def palm_down():
    hand = U(rrect(14, 30, 58, 34, 14), *[cap(30 + 12 * i, 50, 34 + 12 * i, 78, 5.6) for i in range(4)], cap(66, 46, 88, 56, 6))
    return [Part(rrect(0, 32, 18, 30, 4), 'blue', sh=2), Part(hand, SK, sh=5)]
@icon('🫵')
def pointing_at():
    fist = rrect(40, 26, 50, 46, 16)
    index = U(cap(48, 50, 26, 64, 10))
    return [Part(rrect(76, 30, 24, 40, 4), 'blue', sh=2), Part(fist, SK, sh=6, lines=[polyline((56, 30), (56, 48)), polyline((68, 30), (68, 48))], lw=2.2),
            Part(index, SK, sh=3), Part(circle(22, 66, 12), SK, sh=3), Part(ellipse(19, 64, 6, 7, 20), 'skin', flat=True, sep=False)]
@icon('💪')
def biceps():
    arm = svg('M14 92 Q8 70 20 56 Q32 44 46 44 Q52 28 62 18 Q70 10 80 14 Q90 20 84 32 Q78 40 70 42 Q86 56 84 74 Q80 92 60 94 Z')
    return [Part(arm, SK, sh=7, lines=[curve((50, 60), (62, 66), (72, 62))], lw=2.6)]
@icon('🙏')
def praying():
    l = svg('M50 8 Q42 12 36 30 Q30 50 26 66 L18 82 L36 94 L50 72 Z')
    r = flipx(l)
    return [Part(l, SK, sh=5), Part(r, SK, sh=5), Part(rrect(14, 84, 26, 14, 4, -30), 'blue', sh=2), Part(rrect(60, 84, 26, 14, 4, 30), 'blue', sh=2)]
@icon('🥊')
def glove():
    g = svg('M20 70 Q10 40 26 22 Q40 8 60 12 Q82 16 84 40 Q86 62 70 72 Z')
    thumb = blob((24, 46), (38, 40), (46, 54), (36, 64), (24, 60))
    return [Part(g, 'red', sh=8), Part(thumb, 'red', sh=3), Part(rrect(22, 70, 50, 24, 6), 'white', sh=3, lines=[polyline((30, 78), (64, 78))], lw=2.4), gloss(46, 24, 10, 5, -10, 0.45)]
