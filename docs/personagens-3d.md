# Personagens em 3D

Implementação: `src/art/Char3D.js` (o ator 3D e o shader `char3d`), `tools/asset_baker/wardrobe/worker-main.js` (mensagens `char3d` e
`char3dClip` do Worker do gerador, empacotado em `assets/baked/wardrobe.worker.js` por `node tools/asset_baker/bake.cjs --data`).
Configuração: `Config.art.char3d`. `?boneco=2d` na URL volta ao desenho 2,5D.

## Como funciona

O gerador dos personagens é o mesmo que desenha os atlas 2,5D. Em vez de fotografar cada pose em 16 direções, ele manda ao jogo:

| O quê | Quando | Conteúdo |
| --- | --- | --- |
| Pontos do personagem | uma vez por visual (roupa, bolsa, aparência) | posição e normal no osso 1 e no osso 2, peso do osso 2 (skin linear da malha 3D), material e tom |
| Clipe | na 1ª vez que ele toca | matrizes dos 16 ossos em cada quadro, escala da pose e os objetos na mão (arma, garrafa…) com os pontos deles |

A GPU monta o boneco a cada quadro: skin de 2 ossos, luz do sol em faixas (os 5 tons do desenho) e a cor pela rampa de cada material da
ficha. Cada ponto vira um disquinho do tamanho certo na tela (`splat` × espaçamento). Quadros vizinhos do clipe são misturados (`blend`).

**Modelos** (`Char3DModel`): um por ficha — o do jogador (as cores da roupa dele, rampas próprias; refeito quando o visual muda) e um por
TIPO de NPC (todas as variantes de um tipo têm a mesma forma: a cor vem da paleta do `NpcArt`, pela linha `npcRow` do ator). Pontos,
clipes e objetos na mão são compartilhados; cada ator clona a malha (mesma geometria) com o seu material (ossos, linha da paleta).
Dois Workers: um do jogador (o visual dele nunca espera os NPCs) e um dos NPCs.

**Quem fica 3D** (`Char3D.tick`, a cada 0,25 s): o jogador e os NPCs MAIS PERTO dele, até `Config.art.char3d.npc.max` num raio de
`radius` m (folga de 15% para quem já está 3D: ninguém pisca na borda). O limite vem do nível gráfico (`Graphics.PRESETS.npc3d`):

| Nível | NPCs 3D |
| --- | --- |
| Low (e placa de vídeo por software) | 0 — só o jogador |
| Medium | 6 |
| High | 14 |
| HD | 20 |

Os outros NPCs seguem 2,5D (de longe a diferença não aparece). O jogador **pilotando** (moto, bicicleta, jet ski) também: o piloto é outro
ator, e usa o modelo do visual dele — mesmo no Low.

O `SpriteActor` continua sendo a lógica do personagem — clipe, fase, rumo, posição, pulo, visibilidade. O ator 3D só o lê a cada quadro
e esconde o desenho 2,5D (`layerMask` 0) enquanto o 3D está à mostra. Clipe que o gerador não tem (folha antiga) ou que ainda está
chegando do Worker: o 2,5D aparece no lugar.

**Raio-X** (`render/XRaySilhouette.js`): com o 3D à mostra, a silhueta dourada é feita do próprio boneco. O corpo marca 2 no stencil onde
aparece; a cópia de silhueta só pinta onde algo mais perto escondeu o corpo (profundidade GREATER, stencil ≠ 2) — sem isso, os pontos
de trás do próprio corpo virariam silhueta.

## Fases

1. **Jogador** (feito): `Config.art.char3d.player`.
2. **NPCs, polícia e gangues** (feito): pedestres, polícia, BOPE, exército, traficantes, pilotos de moto/bicicleta, frequentadores de
   academia e lojas — todo personagem 2,5D do gerador. Teste: `tests/54_personagens3d.test.cjs`.

## Ainda não tem no 3D

Clarão do tiro e respingos (efeitos da pose), expressões do rosto (`faces`), sangue do dano (`dmg`) e sombra projetada (há uma mancha
macia sob os pés).
