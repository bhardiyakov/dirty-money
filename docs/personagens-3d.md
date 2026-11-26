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

Os outros NPCs seguem 2,5D (de longe a diferença não aparece). (Esses limites valem para os pontos, `?poly=0`; com o low poly — o
padrão — todos os NPCs à vista ficam 3D: ver "Low poly" abaixo.) O jogador **pilotando** (moto, bicicleta, jet ski) também: o piloto é outro
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

3. **Detalhes** (feito):
   - **Expressões do rosto**: a pose escolhe (`pose.expr`: raiva, fúria, medo, dor, olhos fechados). O Worker manda, por ponto da cabeça,
     o material/tom de cada expressão (atributos `fa`/`fb`) e, por quadro do clipe, qual vale (`ex`); o shader troca na hora.
   - **Clarão do tiro**: os efeitos da pose (`fx` por quadro, no espaço do corpo). O clarão vira dois planos cruzados ao longo do disparo,
     com brilho aditivo, na boca do cano.
   - **Sangue do dano**: um modelo por nível de dano (`dmg`, como os atlas de dano). O jogador pelo `PlayerLook.dmg()`, os NPCs pelo
     `sheet.dmgLvl`. O modelo novo entra quando fica pronto, sem piscar.
   - **Sombra projetada**: os mesmos pontos, achatados no chão na direção do sol da cena (a hora do dia move a sombra), em preto
     translúcido. Um stencil (4) deixa cada pixel escurecer uma vez só. Ela some na sombra de prédio, à noite e em interiores; a mancha
     macia fica por baixo quando a sombra é fraca. `Config.art.char3d.shadow = false` volta só à mancha.

## Limitações

A sombra projetada assume o chão plano na altura dos pés: em encosta, parte dela entra no terreno. Cápsulas, rastros de golpe e respingos
d'água (os outros efeitos da pose) ainda não aparecem no 3D.

## Troca 3D ↔ 2,5D sem "pulo" (novembro/2026)

Os NPCs mais perto da câmera são bonecos 3D; os outros, desenhos 2,5D dos atlas. Na troca, o personagem não pode parecer que mudou:

- **Sem contorno no 2,5D.** O gerador (`tools/asset_baker/generator/NpcGenCore.js`) agora usa por padrão o estilo `igual3d`: o mesmo
  do cartum (luz em 3 faixas, rosto marcado), mas sem o contorno escuro externo (`TOON.outline = 0`) e sem os traços entre partes
  (`G.LINES = false`). Os traços viram sombra de contato e a silhueta sai antisserrilhada, como no boneco 3D. Num atlas de
  `civil_mano`, o contorno era o equivalente a 33% dos pixels do corpo; agora é zero. `NPC_ESTILO=cartum` volta ao de antes.
- **A mesma altura.** O desenho é feito visto de cima a 56°, e o quadro em pé é esticado para a altura na tela bater com a do 3D
  (`SpriteActor.STAND_SCALE`): `s = (1 + k·tan c) / (cos 56° + k·sen 56°)`, com `c` = inclinação da câmera e `k` =
  `Config.art.standDepth` (0,17), a espessura que o desenho de cima mostra (alto da cabeça e ombros). Na câmera de cima (`c` = 56°)
  dá o mesmo `1/cos 56°` de antes. Antes, com `1/cos c`, a 42° (perseguição a pé) o 2,5D ficava com uns 80% da altura do 3D. Medido
  lado a lado (o mesmo NPC só em 3D e só em 2,5D, na mesma pose): 66 px e 66 px, com os pés na mesma linha.
- **O que continua diferente.** O desenho 2,5D é sempre visto a 56°. Na câmera de perseguição, mais baixa, o 3D mostra menos do alto
  da cabeça. E o 2,5D tem 16 direções, enquanto o 3D vira o ângulo exato.

## Low poly (o padrão desde novembro/2026) — visual "PS2 realista"

O boneco em **triângulos** no lugar da nuvem de pontos. `Config.art.char3d.poly` (ligado); `?poly=0` na URL volta aos pontos,
`?poly=1` força. Mesmo esqueleto, mesmos clipes, mesma paleta (as variantes de cor continuam): só muda como o corpo é desenhado
(shader `char3dPoly`). Teste: `tests/76_low_poly.test.cjs`.

### Malha e níveis de detalhe

- **Corpo, roupa, tênis, olhos e cabelo**: a malha realista (MakeHuman, CC0) simplificada no build pelo **meshoptimizer**
  (`tools/asset_baker/lowpoly/bakelow.cjs` → `generator/malha3d_low.js`, só índices e a oclusão, ~270 KB). Os pesos dos ossos entram
  como atributos (a barra da bermuda e da manga não escorrega). Antes de simplificar, o buffer é **compactado** nos vértices usados: as
  cópias soldadas que sobravam travavam o meshoptimizer (a pele parava em ~1.100 triângulos qualquer que fosse o alvo).
- **Níveis de detalhe**, como nos motores atuais: o jogador no mais detalhado e os NPCs em 4 níveis escolhidos pelo **tamanho na
  tela** (a altura do boneco sobre a altura da tela, pela distância à câmera — `Char3D.LOD_SCREEN`), não pela distância ao jogador:

  | Nível | Quem | Triângulos (mediana / máx, com acessórios) |
  | --- | --- | --- |
  | `hero` | o jogador | 4.300 / 5.200 |
  | `npc` (L0) | NPC com mais de 10% da altura da tela | 2.500 / 3.100 |
  | `mid` (L1) | de 5,5% a 10% | 1.400 / 1.800 |
  | `far` (L2) | de 2,8% a 5,5% | 800 / 1.000 |
  | `tiny` (L3) | abaixo de 2,8% | 350 / 480 |

  Folga de 15% na borda (ninguém troca de nível para lá e para cá). `Char3D.lodBias` baixa o detalhe mais cedo: 1,7 no Low,
  1,25 no Medium, 1 no High, 0,85 no HD; o `AutoQuality` multiplica (×1,5, ×2) em vez de cortar bonecos. Cada nível de cada tipo é um
  modelo, montado quando alguém precisa dele (o L3 primeiro: é rápido e serve de ponte) e descartado depois de 90 s sem uso.
- **Fora da câmera**, o boneco não é desenhado nem tem a pose calculada (uma esfera de 1,4 m contra o frustum: a malha está no espaço
  dos ossos e não tem caixa útil). **De longe**, a pose é calculada a cada 2 (L2) ou 3 (L3) quadros, cada boneco numa fase.
- **Atributos compactos** na placa: 56 bytes por canto em vez de 116 (ossos, peso e oclusão em bytes, material e tom em bytes, normais
  em bytes normalizados, UV em 16 bits, a posição na cabeça/peito em inteiros de 16 bits ×64; a posição no osso 1 é a `position` — antes
  ia duas vezes).

- **Acessórios** (boné, capacete, colete, bolsa, alça, os cabelos geométricos): a superfície da forma do gerador por *surface nets*,
  simplificada no Worker (`G.polyPart`); o tamanho acompanha o nível (×1,6 no jogador, ×0,4 de longe).
- **SEM 2,5D**: todo personagem é 3D a qualquer distância. As **páginas** dos desenhos 2,5D (1.336 WebP, ~424 MB) **saíram do
  projeto** (`NpcArt.PAGES = false`; `bake.cjs` só as grava com `--paginas`). O quad do `SpriteActor` fica fora do desenho
  (`_hide2d`) e o visual do jogador não é desenhado no Worker do guarda-roupa (`PlayerLook`): o boneco 3D sai direto da ficha, e a
  tela de carregamento espera por ele (`Char3D.playerReady`). Os **manifestos** dos atlas (clipes, quadros, ritmo; 6 MB) e a paleta
  continuam — o `SpriteActor` toca os clipes por eles e o 3D pinta pela paleta.
- **Sem desenho de reserva, o 3D nunca desliga.** Erro repetido no quadro ou o modo seguro (degrau `char3d`) põem os personagens no
  **modo simples** (`Char3D.degrade`): todos os NPCs no L3, sem o rosto e a estampa por pixel, sem a textura de detalhe, sem derivadas
  no shader (`#define SAFE`) e sem transição entre clipes.
  Medido (SwiftShader, High, centro): 127–162 NPCs 3D, só os ~12 dentro da câmera desenhados, 0 páginas na placa, 290
  chamadas de desenho (413 antes do corte fora da câmera), tempo de placa de 0,62 s por quadro (0,75 s antes; 5,8 s com pontos).

### Visual

- **Estilo `real`** (`Config.art.char3d.style`; `?estilo3d=igual3d` volta ao do desenho 2,5D): proporções de gente (cabeça 0,64 em vez
  de 0,72 do corpo adulto) e o rosto sem o tamanho de desenho. Os Workers do 3D só montam bonecos 3D: o estilo deles não mexe nos atlas.
- **Luz suave**: a normal de cada vértice (dos dois ossos do skin, como a posição) no lugar da face chapada; céu por cima e o sol que
  "dobra" um pouco (os 5 tons da paleta misturados de forma contínua). No estilo `igual3d`, a face chapada em faixas de antes.
- **Textura de detalhe** (as do pacote da malha): dobras da camiseta, desgaste e costuras do jeans, mechas do cabelo com alfa (o cartão
  recorta). A cor continua da paleta da variante; a textura multiplica pela luz dela (a média da peça = 1). Os índices simplificados usam
  um vértice por posição, e numa costura do mapa UV o mesmo lugar tem 2 UVs: cada face escolhe a combinação de UVs mais junta.
- **Oclusão de ambiente assada por vértice** (bakelow.cjs: raios no hemisfério contra o corpo simplificado, por gênero — a malha é a
  mesma para todas as fichas): axilas, dobras, pescoço, entre as pernas. A pele só conta ela mesma (debaixo da roupa ela ficava
  "fechada" e furava a peça em triângulos escuros); olhos sem; no rosto, atenuada.
- **Rosto e estampa do peito por PIXEL** no shader, com a mesma receita do 2,5D — o rosto (`makeTexHead`: olhos, sobrancelhas, boca,
  barba, óculos, máscara e as expressões do clipe; o globo do olho é pele e recebe o olho do desenho) e a camisa (`makeTexChest`:
  listras, floral, camisa de time, logo, botões, zíper, corrente). Pintados por face, numa malha de poucas faces, eles sumiriam.
- **O resto da estampa e o dano**: a textura procedural das outras partes e o dano (terra, cortes, sangue) por face.
- **Ainda em pontos**: os objetos na mão (armas, garrafa, guarda-chuva) — poucos pontos, e o detalhe das armas é o desenho da folha.
- **Atenção nos shaders**: o Babylon quebra a linha no `;` — um `;` num comentário depois do código vira código e o shader não compila
  (o teste confere).

### Movimento

- **Clipes a ~30 quadros por segundo** (até 48): o 3D pede ao gerador mais quadros com a mesma duração (o atlas 2,5D, que paga por
  quadro desenhado, segue com 8 a 12); os ciclos são recalculados e as sequências reamostradas, com objetos e efeitos no lugar.
- **Rotação por quatérnio** entre quadros (a mistura de matrizes encolhia o membro no meio do caminho).
- **Transição de 0,2 s** entre clipes (`Config.art.char3d.fade`): a pose de agora é o ponto de partida e a nova entra suave.

**Calçado** (vale para os dois modos e o 2,5D): a parte do calçado que segue a canela (cano, tornozelo) media a altura da sola no espaço
da canela e virava "sola" — o chinelo ganhava meia preta até o meio da canela. Agora a altura é medida no espaço do pé. Os atlas 2,5D
pegam a correção quando forem renderizados de novo.
