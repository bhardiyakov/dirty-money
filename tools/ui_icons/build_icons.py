#!/usr/bin/env python3
# ============================================================================
# tools/ui_icons/build_icons.py — monta a FONTE DE ÍCONES do jogo (assets/ui/dm-icons.woff2): um desenho próprio (icons.py) para cada
# emoji que a interface usa. O jogo põe a fonte "DM Icons" na frente das pilhas de fonte (src/ui/Theme.js): todo emoji de texto, HTML
# ou canvas sai com o desenho do jogo, sem mudar os textos. tests/14_icones.test.cjs confere que todo emoji do código tem desenho.
#
#   pip install fonttools skia-pathops brotli
#   python3 tools/ui_icons/build_icons.py            → assets/ui/dm-icons.woff2 + dm-icons.json (o que ela cobre) + tools/ui_icons/preview.html
#   python3 tools/ui_icons/build_icons.py 🚨 🔥       → só esses (para conferir um desenho; não grava o .json)
#
# Sequências (homem careca 👨‍🦲, barbudo 🧔‍♂️…): ligaduras na feature ccmp. O seletor de variação (FE0F) e o ZWJ são glifos vazios.
# ============================================================================
import os, sys, html
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import iconlib
from icons import ICONS

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'ui', 'dm-icons.woff2')

def main():
    only = sys.argv[1:]
    items = []
    for seq, fn in ICONS.items():
        if only and seq not in only: continue
        layers = iconlib.build(fn())
        items.append((tuple(ord(c) for c in seq), fn.__name__, layers))
    # componentes das sequências que não têm desenho próprio (cabelo careca/branco/cacheado, ♂): precisam estar no cmap
    extra = {ord(c) for seq in ICONS for c in seq if len(seq) > 1} - {0x200D, 0xFE0F}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    n, pal = iconlib.build_font(items, OUT, extra_cmap=sorted(extra))
    print('assets/ui/dm-icons.woff2: %d ícones, %d glifos, %d cores, %.0f KB' % (len(items), n, pal, os.path.getsize(OUT) / 1024))
    if not only:                                                                # a lista do que a fonte cobre (o teste confere com o código)
        import json
        with open(os.path.join(os.path.dirname(OUT), 'dm-icons.json'), 'w', encoding='utf8') as f:
            json.dump({'icons': sorted(ICONS)}, f, ensure_ascii=False)
            f.write('\n')
    # folha de conferência
    cells = ''.join('<div class="c"><span class="i">%s</span><span class="s">%s</span><small>%s</small></div>' % (html.escape(s), html.escape(s), html.escape(ICONS[s].__name__)) for s in ICONS if not only or s in only)
    with open(os.path.join(HERE, 'preview.html'), 'w', encoding='utf8') as f:
        f.write('''<!doctype html><meta charset="utf-8"><title>DM Icons</title>
<style>@font-face{font-family:"DM Icons";src:url(../../assets/ui/dm-icons.woff2) format("woff2")}
body{margin:0;background:#141821;color:#cfd5df;font:12px system-ui;display:flex;flex-wrap:wrap;gap:6px;padding:10px}
.c{width:118px;height:112px;background:#1d2230;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.c:nth-child(4n){background:#e9edf3;color:#222}
.i{font:64px "DM Icons";line-height:1}.s{font:20px "DM Icons";line-height:1}small{opacity:.7;font-size:10px}</style>
''' + cells)

if __name__ == '__main__':
    main()
