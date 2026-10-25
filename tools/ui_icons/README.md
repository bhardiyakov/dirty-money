# tools/ui_icons — os ícones da interface

Dois conjuntos, no mesmo estilo de **adesivo** (borda clara fina por fora, contorno escuro grosso, cor chapada com faixas de sombra e luz):

| | Fonte | Saída (`assets/ui/`) | No jogo |
|---|---|---|---|
| **Armas** (mão, faca, taco, pistola, silenciador, revólver, fuzil, AK-47, RPG, lança-foguetes, minigun, granada, molotov) | `source/armas_hud.jpg` (a folha pintada) | `armas_hud.webp` + `armas_hud.json` | `WeaponArt.load` (boot) → HUD, roda de armas, inventário, lojas |
| **Ícones** (todo emoji que a interface usa: ~280) | `icons.py` + `ic_*.py` (desenhos em código) | `dm-icons.woff2` (fonte colorida COLR) + `dm-icons.json` | `Theme`: a fonte "DM Icons" vem na frente das pilhas de fonte |

```
node tools/ui_icons/armas_hud.cjs                   # recorta as armas da folha (precisa do sharp de tools/asset_baker)
pip install fonttools skia-pathops brotli
python3 tools/ui_icons/build_icons.py               # monta a fonte de ícones + preview.html (folha de conferência)
python3 tools/ui_icons/build_icons.py 🚨 🔥          # só esses (para conferir um desenho)
node tools/ui_icons/shot_preview.cjs saida.png      # fotografa a preview.html no Chromium (como o jogo desenha)
```

- **Armas**: cada arma tem uma caixa na folha (`BOX` em `armas_hud.cjs`). O fundo (azul-marinho, painéis e as linhas deles) sai por
  inundação a partir da borda da caixa; a borda clara do adesivo segura a inundação (com um fechamento de 3 px para as falhas do JPEG),
  e o brilho do fogo do molotov vira transparência. A SMG, a escopeta e o foguete não estão na folha: ficam com o desenho em código.
- **Ícones**: cada desenho é uma lista de peças (`Part(forma, cor)`, de baixo para cima). O `iconlib` faz o resto: contorno e borda em
  volta de tudo, linha escura onde uma peça cobre outra, faixa de sombra (a forma menos ela mesma deslocada para cima/esquerda) e de
  luz, e as linhas de detalhe cortadas na peça. Espaço de desenho 0..100, y para baixo. Materiais prontos em `iconlib.MAT` (pele,
  metal, madeira, ouro, dinheiro…).
- **Emoji novo no código**: `tests/14_icones.test.cjs` falha apontando qual falta. Desenhe com `@icon('🆕')` num `ic_*.py` e rode
  `build_icons.py`. Sequências (👨‍🦲, 🧔‍♂️) viram ligaduras; o seletor de variação (FE0F) não importa.
- Símbolos de texto (★ ✔ ✕ ♠ ♥ setas) não são emojis: ficam com a fonte do texto (a cor vem do CSS).
