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

## Low poly (o padrão desde novembro/2026)

O boneco em **triângulos de face chapada** no lugar da nuvem de pontos, no estilo das cidades low poly. `Config.art.char3d.poly`
(ligado); `?poly=0` na URL volta aos pontos, `?poly=1` força. Mesmo esqueleto, mesmos clipes, mesma paleta: só muda como o corpo é
desenhado (shader `char3dPoly`). Teste: `tests/76_low_poly.test.cjs`.

- **Corpo e cabelo**: a malha realista (MakeHuman, CC0, ~6,5 mil triângulos por peça de roupa) simplificada no build pelo
  **meshoptimizer** (`tools/asset_baker/lowpoly/bakelow.cjs` → `generator/malha3d_low.js`, só os índices, 89 KB). Os pesos dos ossos
  entram como atributos da simplificação: a barra da bermuda, da manga e da regata não escorrega para o outro lado do joelho/cotovelo.
  Cada face tem a cor da região do osso da maioria dos cantos.
- **Acessórios** (boné, capacete, colete, bolsa, alça, os cabelos que a malha não tem): a superfície da forma geométrica do gerador
  por *surface nets* e simplificada (`G.polyPart` em `NpcGenMesh.js`, no Worker; 120 a 420 triângulos por peça).
- **Rosto e estampa do peito**: pintados por PIXEL no shader com a mesma receita do 2,5D — o rosto (`makeTexHead`: olhos, sobrancelhas,
  boca, barba, óculos, máscara e as expressões do clipe: raiva, fúria, medo, dor, olhos fechados; o globo do olho é pele, como nos
  pontos, e recebe o olho do desenho) e a camisa (`makeTexChest`: listras, floral, camisa de time, logo, botões, zíper, corrente). O
  Worker manda a posição de cada canto no espaço da cabeça ou do peito (`fp`, com qual dos dois) e a ficha (`face`). Pintados por face,
  numa malha de poucas faces, eles sumiriam ou virariam um mosaico.
- **O resto da estampa e o dano**: a textura procedural das outras partes (cadarço, dobras…) e o dano (terra, cortes, sangue) por face,
  no centro dela.
- **Atenção nos shaders**: o Babylon quebra a linha no `;` — um `;` num comentário depois do código vira código e o shader não compila
  (o teste confere).
- **Um modelo por tipo**: os triângulos não mudam com a distância (sem os 3 níveis de detalhe dos pontos).
- **Ainda em pontos**: os objetos na mão (armas, garrafa, guarda-chuva) — poucos pontos, e o detalhe das armas é o desenho da folha.

Peso: 2,0 a 3,2 mil triângulos por personagem (com os acessórios), contra 13,9 a 36 mil pontos (2 triângulos cada) no modo de pontos.
Medido no jogo (SwiftShader, gráfico Alto, os mesmos 12 NPCs 3D na tela): tempo de placa de 5,8 s por quadro com os pontos e 1,2 s em
low poly — e isso ainda com os acessórios em pontos (hoje eles também são triângulos). As chamadas de desenho quase não mudam (~300 na
cena inteira; o boneco é 1 por personagem): instanciar os NPCs não compensa agora.

**Calçado** (vale para os dois modos e o 2,5D): a parte do calçado que segue a canela (cano, tornozelo) media a altura da sola no espaço
da canela e virava "sola" — o chinelo ganhava meia preta até o meio da canela. Agora a altura é medida no espaço do pé. Os atlas 2,5D
pegam a correção quando forem renderizados de novo.
