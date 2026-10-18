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
- **Relevo (parecer 3D visto de cima)**: o gerador também desenha a ALTURA de cada carro (`CarGen.heightSVG`: carroceria
  na cintura com as bordas arredondadas, teto, caçamba rebaixada, giroflex e luminoso em cima do teto) e as máscaras da
  cabine, do teto e dos vidros. No build cada VIDRO vira um plano inclinado da borda do teto até o topo da carroceria
  (altura pela distância às duas bordas, em ponto flutuante); daí saem as normais, gravadas na textura C. O
  shader ilumina o carro com o **sol do mundo** (`CarArt.setSun`, chamado pelo `DayNight`): o lado virado para o sol
  clareia, o outro escurece, a lataria tem brilho e os vidros refletem o céu — mais claro no vidro virado para o lado do
  sol, então cada plano inclinado (para-brisa, vidro traseiro, janelas) se destaca do outro. Como a luz não gira com o carro, numa curva o
  brilho "escorre" pela carroceria. Motos, bicicletas, barcos, portas e o pneu ganham um domo tirado do alfa. Força em
  `Config.art.carRelief` (0 = plano, como antes). Teto e capô planos ficam iguais ao desenho (a luz é relativa a uma
  superfície plana): o efeito está nas bordas e na cabine.
- **Arquivo**: três texturas 1024×1024 (A = cor + alfa, B = pinturas + amassados, pré-multiplicadas pelo alfa — sem
  franja nos mipmaps; C = altura, normal e vidro), em PNG dentro de um `.js` (~1,6 MB). Por ser `.js`, funciona aberto por duplo clique (`file://`).
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

## Carros em 3D (outubro/2026)

Os **36 carros** (os 34 do pacote "veiculos3d" + os dois táxis, feitos no mesmo gerador) agora são **malhas 3D** no jogo:
carroceria com volume, vidros, faróis, lanternas, frisos, placas e as **quatro rodas separadas**. Motos, bicicletas e barcos
seguem no atlas 2D. Ajustes › **Carros 3D** liga/desliga na hora (desligado = os carros desenhados de antes, mais leve); `?cars2d`
na URL força os desenhados; `Config.art.cars3d` é o padrão.

```
tools/carros3d/gerador/   o gerador procedural do pacote (cópia) + veiculos/taxis.js (táxi SP e Rio)
tools/carros3d/build.js   converte cada carro: simplifica, corta o que a câmera de cima nunca vê, quantiza e comprime
tools/carros3d/index.html gera, mostra (com o MESMO shader do jogo) e salva  →  assets/cars/carros3d.js
src/art/CarArt3D.js       carrega, monta as malhas, o shader e o ator (Car3DActor, mesma interface do CarActor)
```

- **Animações**: as rodas **rolam** pela distância percorrida (ângulo = distância ÷ raio, com teto por quadro para não "andar
  para trás" no estroboscópio) e as dianteiras **esterçam** com o volante. A carroceria gira em volta do eixo das rodas com
  molas pouco amortecidas: **mergulha** na freada, **senta** na arrancada, **inclina para fora** na curva (e atrasa um pouco no
  giro), passa do ponto e assenta; em velocidade, emendas e buracos do asfalto dão **trancos**. As rodas ficam no chão.
  Pneu furado baixa aquele canto. Tudo é calculado no shader de vértice a partir de poucos números por carro.
- **Visual**: pintura da tabela do jogo (`CarSheet.PAINTS`: pintura, pintura 2 nos modelos de teto/faixa de outra cor,
  desbotada, carcaça queimada), luz do sol do mundo e do céu, verniz, reflexo do céu em vidros e cromados. Amassados: fase 1
  riscos, fase 2 lataria amassada e vidros trincados, fase 3 frente esmagada, teto afundado e vidros estourados. As lâmpadas
  do próprio modelo acendem (`CarLights` → `setLamps`): faróis, lanternas/freio, setas, ré, giroflex e o luminoso do táxi.
- **Desempenho**: uma malha por modelo com instâncias (todos os carros do mesmo modelo = 1 chamada de desenho; só os perto da
  câmera viram instância), um material só. Arquivo de 1,8 MB (~160 mil triângulos no total, ~4,4 mil por carro; o pacote
  original tem ~33 mil por carro). Medido: 40 carros de 36 modelos diferentes na tela ≈ 0,7 ms de CPU e ~1 ms de GPU.
- **Profundidade achatada**: cada carro grava profundidade numa fatia fina logo acima do chão, então ele se esconde sob
  prédios, viadutos e copas, e os personagens 2,5D continuam passando por cima dele, como com o sprite. A geometria estampada
  (faróis, frisos, placas, letreiros) ganha uma pequena vantagem de profundidade e nunca afunda na lataria.
- **Continua do atlas 2D**: a física e a sombra (caixas), as medidas do catálogo, a porta aberta (lâmina girando na dobradiça),
  as miniaturas do HUD e a galeria.

### Mudar um carro 3D

1. Edite a descrição em `tools/carros3d/gerador/veiculos/*.js` (veja o `LEIA-ME` do pacote: perfil, planta, cabine, detalhes).
2. Abra `http://localhost:8123/tools/carros3d/` (servidor `serve.ps1`), **Gerar** (detalhe 0,3, tolerância 4 mm, "só o que a
   câmera de cima vê") e confira na vista (pintura, amassado, luzes, câmera do jogo). **Salvar carros3d.js** grava o arquivo.
3. Modelo novo: também no `MODELS`/`POOLS` do `CarSheet` e no atlas 2D (`tools/carros`), que segue dando as medidas, a porta e a
   miniatura.

## Motos, helicópteros e barcos em 3D (outubro/2026)

O mesmo gerador e o mesmo shader dos carros agora fazem os **outros veículos**, num arquivo à parte (`assets/cars/veiculos3d.js`,
`VEH3D`; o `carros3d.js` não muda). `node tools/carros3d/gerar.mjs veiculos` gera o arquivo sem o navegador (`carros` gera o dos
carros; sem argumento, os dois).

- **Motos** (`gerador/veiculos/motos.js`): de rua (estilo CG 160, a do dia a dia e a do motoboy — o entregador anda na versão com
  **baú**), **scooter** (estilo PCX), **trilha** (estilo XR/Bros, pneus com cravos), **esportiva** (estilo CBR, carenagem e bolha)
  e **custom de viagem** (estilo Harley: V2 cromado, alforjes, para-brisa, encosto). Duas rodas que rolam (a da frente esterça) e
  a moto INTEIRA deita para dentro da curva; caída, fica de lado. As manoplas ficam no mesmo lugar em todas, a partir do banco,
  para as mãos do piloto 2,5D (clipes `ride_*`) caírem no guidão; o sprite do piloto sobe à altura do banco do modelo. No
  trânsito: `Bikes.pickMoto` sorteia o modelo; `Bikes.MODELS` tem o desempenho de cada um. Sem o arquivo 3D, todas usam a moto do
  atlas.
- **Ré de moto e bicicleta**: não tem marcha a ré — o piloto fica de pé, montado, e anda para trás com os pés no chão
  (`RiderActor.walkBack`, o clipe de andar tocado ao contrário), no passo (`Config.vehicle.bikeReverse`).
- **Helicópteros** (`gerador/veiculos/helis.js`): o civil (estilo Bell 206) e o da polícia (Águia, com giroflex e holofote). Os
  rotores são partes à parte que giram no shader; o helicóptero inclina para a frente voando e deita nas curvas (`HeliVisual`).
  Desenhado no grupo 2 (por cima da cidade) com profundidade de verdade; o disco borrado do rotor e a sombra continuam sendo quads.
- **Barcos** (`gerador/veiculos/barcos.js`, que já existiam no gerador): jet ski, lancha e barco de pesca. Origem na linha
  d'água: o que fica abaixo dela não é desenhado; sobem e descem com as ondas de verdade (`Waves`), empinam acelerando e
  inclinam na curva. O piloto senta no banco do modelo (`seat`).
