# Carros — atlas vetorial pronto (outubro/2026)

Os carros deixaram de ser desenhados por código na carga. Eles vêm do pacote **"Carros 2D — vista de cima"** (desenho
vetorial com degradês e brilho, frente para a direita) e de **23 modelos novos** feitos no mesmo estilo: são **36 modelos**,
o dobro e pouco dos 13 do pacote, cada um repintável em qualquer cor e com 3 fases de amassado.

| Classe (trânsito) | Modelos |
|---|---|
| `hatch` — compactos | `hatch_moderno` (Onix), `hatch_moderno2` (HB20), `compacto_aventureiro` (Kwid), `quadradinho` (Uno), **`hatch_esportivo`** (Golf GTI), **`mini_eletrico`** (Dolphin Mini) |
| `old` — antigos | `besouro` (Fusca), `seda_classico` (Chevette), `hatch_90` (Gol bolinha), `hatch_80` (Gol quadrado), **`sedan_70`** (Opala), **`brasilia`** (Brasília), **`perua_antiga`** (Caravan) |
| `sedan` | **`sedan_popular`** (Prisma), **`sedan_medio`** (Corolla), **`sedan_luxo`** (Classe E) |
| `suv` | `suv_compacto` (Creta), `suv_cupe` (HR-V), `suv_quadrado` (Renegade), **`suv_grande`** (SW4), **`jipe_offroad`** (Troller) |
| `sports` / `super` | **`esportivo`** (M3), **`muscle`** (Mustang) / **`super`** (Ferrari), **`super2`** (Lamborghini) |
| `pickup` | **`picape_pequena`** (Strada), **`picape_media`** (Hilux), **`picape_grande`** (F-250) |
| `van` | **`van_furgao`** (Sprinter), **`kombi`** (Kombi), **`minivan`** (Spin) |
| `taxi` | `taxi_sp`, `taxi_rio` (pintura própria) |
| forças | **`viatura`** (polícia), **`swat_van`** (blindado tático), **`militar`** (jipe do exército) — pintura própria |

Em negrito, os novos. Nomes no jogo são fictícios (`CarSheet.MODELS`); os desenhos são originais, sem logotipos.
A favela e as estradas de terra agora recebem a classe `old` (antigos), quase sempre com tinta desbotada.

## Como funciona

```
tools/carros/gerador.js   desenho de cada carro em SVG (porte do gen.py do pacote + modelos novos + marcas de batida)
tools/carros/index.html   rasteriza no navegador e monta o atlas  →  assets/cars/carros-atlas.js
src/art/CarArt.js         lê o atlas, shader de pintura/amassado, lote único de quads (CarBatch) e o sprite do carro (CarActor)
src/art/CarSheet.js       catálogo (física e desempenho), pinturas, classes, cores de fábrica de cada modelo
```

- **Um desenho por modelo, girado no shader** (antes: 32 direções assadas por modelo). O ângulo é exato: faróis,
  lanternas e o giroflex saem do lugar certo do desenho em qualquer direção.
- **Pintura no shader**: toda cor derivada da pintura no desenho é uma mistura dela com branco/preto, então cada pixel
  é `K + M1·pintura + M2·pintura2`. O build desenha o carro com as tintas em preto e em branco e separa K, M1 e M2. A
  tabela de pinturas é `CarSheet.PAINTS` (mesma numeração de antes: 6 = viatura, 12 = carcaça carbonizada, 13–18 =
  desbotadas…). `paint2` pinta teto de outra cor (mini elétrico, Opala, Kombi) e faixas (esportivos).
- **Amassados no atlas**: cada pixel guarda em que fase (1, 2, 3) uma marca aparece e quanto ela escurece/clareia.
  Trocar de fase é mudar um número no vértice — nada de folha extra. Fase 1: arranhões e trinca no para-brisa; 2: capô
  amassado, farol quebrado, vidro trincado; 3: frente esmagada, vidros estourados, teto afundado. Carcaça = pintura 12.
- **Portas**: a lâmina de cada modelo está no atlas e gira em volta da dobradiça (qualquer ângulo), com o vão escuro na
  lateral (`CarDoors`).
- **Um lote para todos os carros** (`CarBatch`, como o `GlowBatch`): todos os carros do mundo são quads de uma única
  malha, desenhada no grupo 1 (depois dos pedestres, antes das copas e dos brilhos), testando a profundidade do mundo.
  1 chamada de desenho para os carros e 1 para as portas abertas (nenhuma quando não há porta aberta).
- **Arquivo**: duas texturas 1024×1024 (A = cor + alfa, B = pinturas + amassados), pré-multiplicadas pelo alfa (sem
  franja nos mipmaps), em PNG dentro de um `.js` (~1 MB). Por ser `.js`, funciona aberto por duplo clique (`file://`).
  A decodificação começa ao carregar a página (descompressão nativa do navegador, `PNG.decodeAsync`) e a carga do jogo
  só espera por ela antes de criar o trânsito.

## Medições (Chromium, PC; mesmas condições, versão anterior × atual)

| Métrica | Antes | Depois |
|---|---|---|
| CPU para preparar os carros na carga | 745–1.289 ms (assar 18–20 modelos × 32 direções) | 0 ms de "assar"; ~140 ms de decodificação em segundo plano, durante o menu |
| Memória de vídeo no início do jogo | 111 MB | **98 MB** |
| Memória de vídeo depois de 14 batidas e 4 portas abertas | 141 MB (amassados e portas assados e guardados) | **98 MB** (nada novo) |
| Pior quadro na "tempestade" (14 carros amassando até a fase 3 + 4 portas) | 114 ms (3 quadros > 50 ms) | **32 ms** (nenhum > 50 ms) |
| 24 carros parados na tela: ms/quadro · render CPU · draw calls | 11,6 · 2,2 · 147 | **7,0 · 1,3 · 125** |
| Variedade | 22 modelos × pinturas | **36 modelos** × pinturas × 2ª cor |

No celular a carga procedural custava ~5× mais, então a economia ali é maior.

## Adicionar ou mudar um carro

1. Em `tools/carros/gerador.js`, copie uma chamada `car({ ... })` parecida e mude `id`, `nome`, `categoria`, medidas e
   peças (`L`/`W` em px a 70 px = 1 m; `cf`/`rf`/`rr_x`/`cr` = para-brisa, teto e vidro traseiro ao longo do carro; `bed`
   = caçamba, `cargo` = furgão, `spoiler`, `racing`, `lightbar`, `texts`…). Use `'P'`/`'P2'` nas cores que devem
   seguir a pintura/pintura 2; `fixed: true` = pintura própria (táxi, viatura).
2. Com o servidor de desenvolvimento (`serve.ps1`), abra `http://localhost:8123/tools/carros/`. O catálogo mostra o
   desenho; **Gerar atlas** rasteriza e mostra o resultado com a conta do jogo (teste pintura, amassado e carcaça);
   **Salvar carros-atlas.js** grava o arquivo — escolha `assets/cars/carros-atlas.js`.
3. Em `src/art/CarSheet.js`, ponha o modelo em `MODELS` (nome, classe de trânsito, massa, potência, velocidade, peso
   dentro da classe, vida, tanque) e as cores de fábrica dele em `POOLS`. As medidas (comprimento, largura, faróis,
   porta, giroflex) vêm sozinhas do atlas.

A galeria (`sprites.html` → Carros) mostra todos os modelos, as fases de amassado e as pinturas.
