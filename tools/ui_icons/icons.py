# ============================================================================
# tools/ui_icons/icons.py — os DESENHOS dos ícones (um por emoji que o jogo usa). Cada função devolve as peças (iconlib.Part /
# Layer) de baixo para cima; o contorno, a borda de adesivo e as faixas de sombra e de luz saem do iconlib. Registro: @icon('🚨')
# (a sequência do emoji, sem o seletor de variação FE0F). Os desenhos ficam em ic_*.py, por assunto.
# ============================================================================
from iconlib import *

ICONS = {}
def icon(*chars):
    def deco(fn):
        for ch in chars: ICONS[ch.replace('️', '')] = fn
        return fn
    return deco

# ---------------------------------------------------------------------------- peças reaproveitadas
def ln(*pts, w=LINE):
    """linha de detalhe (para Part(lines=...))."""
    return L(polyline(*pts), w)
def gloss(cx, cy, rx, ry, deg=0, a=0.6):
    """brilho (reflexo branco) por cima."""
    return Layer(ellipse(cx, cy, rx, ry, deg), alpha('#ffffff', a))
def ink(shape):
    return Layer(shape, INK)
def inkline(*pts, w=LINE):
    return Layer(stroke(polyline(*pts), w), INK)
def inkcurve(*pts, w=LINE):
    return Layer(stroke(curve(*pts), w), INK)
def wheel(cx, cy, r, hub='metal'):
    return [Part(circle(cx, cy, r), 'rubber'), Part(circle(cx, cy, r * 0.45), hub, sep=False, outline=False)]

import importlib                                                               # noqa: E402  (os desenhos se registram ao importar)
for _m in ('ic_faces', 'ic_people', 'ic_hands', 'ic_food', 'ic_wear', 'ic_vehicles', 'ic_places', 'ic_objects', 'ic_symbols'):
    try: importlib.import_module(_m)
    except ModuleNotFoundError as e:
        if e.name != _m: raise
