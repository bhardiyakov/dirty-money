# Arte em PNG — guia para trocar a arte procedural

Hoje quase toda a arte do Dirty Money é desenhada por código na carga (`SpriteBaker`). Isso custa segundos de CPU no
celular e não permite um artista desenhar à mão. (**Carros e personagens** já saíram desse esquema: vêm de atlas vetoriais
prontos, com outro formato — ver [`carros.md`](carros.md) e [`personagens.md`](personagens.md). O que segue vale para o resto e
para a paleta.) O jogo agora aceita **PNGs prontos no lugar de qualquer folha**:
se o arquivo existe e está listado no `assets/sprites/manifest.json`, ele é usado; se não, a folha continua sendo
desenhada por código. Dá para trocar **uma folha por vez**.

## 1. Gerar os moldes

1. Abra o jogo servido por http (ex.: `serve.ps1`), comece um jogo e ligue o **modo dev**
   (ESC → Configurações → Modo dev).
2. Painel DEV (tecla `` ` ``) → aba **MUNDO** → **ARTE EM PNG** → **Exportar arte atual como PNG (moldes)**.
3. No Chrome/Edge de computador, escolha a pasta **`assets/sprites`** do projeto: os arquivos são gravados direto
   lá. Em outros navegadores, baixa `dirty-money-sprites.zip` com a mesma estrutura — extraia em `assets/sprites`.

O que sai (~375 arquivos, ~12 MB):

| Arquivo | Conteúdo | Tamanho |
|---|---|---|
| `char/<tipo>/<clipe>-<arma>.png` | uma animação de um tipo de personagem | largura = direções × quadro, altura = quadros × quadro |
| `pal/char.png`, `pal/car.png` | **paletas** (cores de verdade; `pal/car` = barcos e helicóptero) | 80 colunas × uma linha por variante |
| `manifest.json` | lista do que o jogo lê de arquivo + tamanho, quadros, fps de cada um | — |

Tipos de personagem: `player` (e `player_cross`, `player_pack`, `player_tactical` — o jogador com cada bolsa),
`civA`, `civB`, `police`, `swat`, `army`, `rider` (piloto + bicicleta/moto, quadro de 80 px), `courier`.

Exportar só gera **cópias exatas** da arte atual: com eles na pasta, o jogo fica idêntico, só que carrega mais rápido
(lê arquivo em vez de desenhar). A partir daí, cada PNG redesenhado aparece no jogo.

## 2. O formato (importante)

Os PNGs são **INDEXADOS (8 bits, paleta de 256 cores)**. O que o jogo lê é o **número da cor** (índice), não a cor:

```
índice = rampa × 5 + nível          nível: 0 contorno · 1 sombra · 2 base · 3 luz · 4 brilho
índice 254 = transparente           índice 255 = sombra projetada no chão (o jogo pinta translúcida)
```

A **rampa** diz *o que* é o pixel; a **paleta** do jogo diz *de que cor* ele fica em cada variante. Por isso um único
desenho de `civA` vira dezenas de pedestres diferentes.

Rampas dos personagens (`pal/char.png`):

| rampa | parte | índices (contorno…brilho) |
|---|---|---|
| 1 | pele | 5–9 |
| 2 | cabelo | 10–14 |
| 3 | camisa / tronco | 15–19 |
| 4 | calça | 20–24 |
| 5 | sapatos | 25–29 |
| 6 | manga | 30–34 |
| 7 | metal (arma) | 35–39 |
| 8 | madeira | 40–44 |
| 9 | escuro (detalhes) | 45–49 |
| 10 | boné / capacete | 50–54 |
| 11 | dourado | 55–59 |
| 12 | antebraço | 60–64 |
| 13 | clarão do tiro | 65–69 |
| 14 | sangue | 70–74 |

Rampas de barcos e helicóptero (`pal/car.png`): 1 pintura · 2 pintura 2 (faixas/teto) · 3 vidro · 4 pneus/escuro · 5 cromado ·
6 farol · 7 lanterna · 8 letreiro · 9 banco · 10 acabamento.

As cores que aparecem no PNG exportado são as de **uma variante de referência** (jogador laranja, policial azul,
civil…) só para você enxergar o que está fazendo. Pintar com a "cor da camisa" é usar os índices 15–19.

### Layout

- **Direções = colunas**, da esquerda para a direita, começando no **norte** (personagem olhando para o topo da
  tela) e girando no **sentido horário** (norte → leste → sul → oeste). Personagens: 16 direções (jogador e pilotos)
  ou 8 (pedestres e polícia).
- **Quadros = linhas**, de cima para baixo, na ordem da animação. Quantidade e fps de cada clipe estão no
  `manifest.json` (`frames`, `fps`, `loop`).
- O tamanho do arquivo **tem que ser exatamente** o do molde. Se não bater, o jogo avisa no console e usa o desenho
  por código.
- A luz vem do **noroeste** (canto superior esquerdo): mantenha as luzes/sombras coerentes entre as direções.

## 3. Desenhando no Aseprite (recomendado)

1. Abra o PNG do molde: ele já vem em **Color Mode → Indexed** com a paleta certa.
2. Desenhe usando **somente as cores da paleta**. Para recolorir algo (camisa → calça), troque os índices, não a cor.
3. Grid: `View → Grid → Grid Settings` com o tamanho do quadro (64×64, 80×80 ou 112×112) para ver cada direção/quadro.
4. Salve como PNG **mantendo o modo indexado**. Não use "otimizar paleta" nem converta para RGB — isso embaralha os
   índices.
5. Para mudar as **cores** (não o desenho), edite `pal/char.png` / `pal/car.png`: cada linha é uma variante.

Outros editores servem desde que salvem **PNG indexado de 8 bits preservando a ordem da paleta**.

## 4. Como o jogo carrega

- `SpriteIO.init()` (antes do menu) lê o `manifest.json` e baixa: paletas e o essencial primeiro; o que a carga do
  jogo usa em seguida; mochilas e SWAT/exército em segundo plano.
- Os PNGs são decodificados na hora em que a folha é pedida (1–5 ms cada) e viram a mesma textura de 2 bytes/pixel
  que o desenho por código gerava.
- Com o service worker (`sw.js`), depois da primeira visita tudo vem do aparelho, inclusive offline.
- Aberto por duplo clique (`file://`), o navegador bloqueia a leitura dos arquivos: o jogo usa o desenho por código.
- Painel DEV → MUNDO mostra quantas folhas foram lidas de PNG na sessão.

Para **voltar** uma folha ao desenho por código, apague a entrada dela no `manifest.json` (ou o arquivo).

## 5. Ainda desenhados por código (próximos passos)

Mesmo esquema (`SpriteIO.indices(key, W, H)` antes de desenhar), ainda não ligado em: vegetação e objetos
(`PropSprites`), barcos (`BoatSheet`), helicópteros (`HeliSheet`), pássaros (`Birds`), itens (`ItemSprites`),
esconderijos (`HideSprites`), armas (`WeaponArt`), interiores (`HouseArt`, `ShopArt`) e as texturas do chão e
fachadas (`TileFactory`, que não são indexadas — usarão PNG comum).

Sugestão de arquitetura para quando a arte chegar: desenhar **mochilas e acessórios como camada separada** sobre o
personagem (hoje cada bolsa é uma cópia inteira das 44 animações do jogador — 132 arquivos a mais).
