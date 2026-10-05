# Personagens — atlas vetorial pronto (outubro/2026)

Jogador, pedestres, policiais, SWAT, exército, gangues e pilotos de moto/bicicleta deixaram de ser "fotografados" em pixel art
na carga. Agora vêm de um **atlas vetorial pronto**, no mesmo estilo dos carros novos (degradê suave, contorno escuro fino, brilho
no alto), com **uma direção por quadro**: o jogo gira o sprite no ângulo exato do personagem.

As **poses não mudaram**: são as mesmas do `CharacterRig` (todas as animações, tempos, armas, bolsas, moto, nado, corpo caído).
Só o desenho mudou — no lugar do `SpriteBaker` (5 tons, luz do noroeste, 8/16 direções), um renderizador com supersampling e
luz de cima (o sombreamento não depende da direção, então o sprite pode girar).

## Como funciona

```
tools/personagens/renderer.js   desenha um quadro (primitivas do CharacterRig.build → imagem vista de cima, frente para cima)
tools/personagens/atlas.js      todos os quadros de todas as folhas + bolsas → atlas
tools/personagens/index.html    pré-visualização (folha, variante, bolsa, giro) e "Gerar atlas" → assets/chars/personagens-atlas.js
src/art/CharArt.js              lê o atlas (decodifica em segundo plano), material/shader único, quadros por clipe
src/art/SpriteActor.js          clipe vetorial: o quad gira; um único atributo por troca de quadro; camada da bolsa por cima
```

- **Cores continuam por variante**: cada pixel guarda o *material* (pele, cabelo, camisa, calça, sapato, boné…) e a
  *luminosidade*; a cor vem da paleta da variante (`CharacterRig._buildVariants`, os mesmos 57 visuais de antes). Mudar cores
  de roupa/pele **não** exige gerar o atlas de novo.
- **Sombra no chão**: a silhueta deslocada para o sudeste, feita no shader — não gira com o boneco (a luz do mundo é fixa).
- **Bolsas** (mala transversal, mochila, mochila tática): uma **camada** por cima do jogador, só com os pixels que a bolsa
  muda (já com o braço passando por cima da alça). Antes cada bolsa era uma cópia inteira das 44 animações (~30 MB cada).
- **Folhas**: tudo para `player` e `civA` (o civil A também vira bandido armado); para civB, polícia, SWAT, exército, piloto e
  entregador, as animações que o jogo usa (`CharacterSheet.sets`). Se faltar um clipe numa folha, o jogo usa o do civA
  (`CharArt.FALLBACK`); se nem ele existir, o desenho procedural antigo continua como reserva.
- **Arquivo**: um PNG RGBA 2048×2048 (R = material, G = luminosidade × alfa, A = cobertura) dentro de um `.js` (~2,1 MB),
  para funcionar também aberto por duplo clique (`file://`). A decodificação começa ao carregar a página (`PNG.decodeAsync`);
  a textura é criada vazia e recebe os pixels quando eles chegam — a carga do jogo espera por isso antes de começar.

## Medições (Chromium, PC; versão anterior × atual)

| Métrica | Antes | Depois |
|---|---|---|
| "Montando sprites" na carga do jogo | 5,7 s | **2 ms** |
| Carga do jogo inteira (clique em "Novo jogo" → "Pronto") — com os carros novos | 12,1 s | **4,3 s** |
| Texturas de personagens na GPU | 54 MB (+ ~30 MB por bolsa usada) | **16 MB** (tudo, bolsas inclusas) |
| Texturas do jogo inteiro no início (carros + personagens novos) | 111 MB | **60 MB** |
| CPU de 60 pedestres andando / girando sem parar (ms por quadro) | 0,079 / 0,147 | **0,053 / 0,130** |
| Imagens desenhadas para o jogador | 4.144 (259 quadros × 16 direções) | 236 quadros, uma direção |

No celular, assar os personagens custava ~5× mais (dezenas de segundos na primeira carga): a economia ali é maior.

## Mudar poses, animações ou tipos de corpo

1. Poses e clipes: `src/art/CharacterRig.js` (`CLIPS`, `gait`, `aim`…). Tipos de corpo: `SpriteLibrary.SHEETS`
   (`src/art/CharacterSheet.js`: cabelo, porte, cinto, colete, capacete, baú).
2. Abra `http://localhost:8123/tools/personagens/` (servidor de desenvolvimento, `serve.ps1`): a página já mostra o desenho
   novo de cada clipe, em qualquer variante, bolsa e giro.
3. **Gerar atlas** (~40 s no PC) e **Salvar personagens-atlas.js** em `assets/chars/`.

Cores (variantes) não precisam disso: só a paleta muda.

## O que não mudou

Barcos e helicóptero continuam com folhas de direções (`SpriteActor` sabe desenhar os dois tipos). O exportador de moldes em PNG
(modo dev → ARTE EM PNG) agora só exporta as paletas e o que não estiver no atlas.
