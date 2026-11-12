# Otimização — varredura de desempenho (outubro/2026)

Medições feitas com Chromium headless (GPU por software), comparando a versão anterior e a atual nas mesmas condições.
Os números absolutos de um celular serão maiores; as **proporções** valem.

## Resultado

| Métrica | Antes | Depois |
|---|---|---|
| Tempo de CPU por quadro (jogo rodando) | 23–58 ms | **11–12 ms** |
| Lixo de memória gerado por quadro | 1.254 KB | **518 KB** |
| Heap JS no início | 196 MB | **151 MB** |
| Memória de vídeo no início | ~166 MB | **~106 MB** |
| Memória de vídeo em sessão longa (24 bairros, portas, batidas) | 315 MB e não voltava | pico ~180 MB, **volta a ~140 MB** em repouso |
| Vértices por quadro (tela) — centro da cidade | 697 mil | **~116 mil** |
| Vértices por quadro (mapa de sombra) — centro | 491 mil | **~62 mil** |
| Draw calls no centro da cidade | 190 | **130** (média de 8 pontos do mapa: 92 → 89) |
| Travadas ao repor o trânsito / chegar a SWAT / sacar arma de novo | sim (assar sprites na hora) | **não** |

Visual: comparação pixel a pixel antes/depois (dia, entardecer, noite, favela, chuva) — idêntico, exceto carros com
32 direções (pedido).

## O que foi encontrado e corrigido

### CPU e coletor de lixo
- **Havok sincronizava os ~750 colisores estáticos** (prédios, muros) a cada passo de física (2 por quadro): 1.500
  chamadas ao WASM e ~300 KB de lixo por quadro. Estáticos agora pulam a sincronização (`core/physics.js`).
- **`Math.hypot` do V8 é ~18× mais lento que `sqrt` e aloca a cada chamada**; o jogo o usava em 296 lugares,
  muitos por quadro. Trocado por `hypot()` (em `config.js`).
- **Getters estáticos recriavam tabelas inteiras a cada leitura** (`Pickups.TYPES`, `CarSheet.MODELS`,
  `Birds.SPECIES`…, 65 no total), lidos em laços por quadro. `memoStatics()` monta cada tabela uma vez.
- `Vehicle.velocity/speed` liam o WASM e criavam um vetor novo a cada leitura (dezenas por carro por quadro): agora
  uma leitura por passo de física; o movimento dos carros reaproveita vetores.
- Atropelamento testava **todos os carros × todas as pessoas** (~7 mil testes/quadro): agora grade espacial.
- Dicas de interação (12 buscas por quadro, varrendo todos os muros e esconderijos do mundo): grade espacial e
  recálculo a ~10 Hz.
- Água: mexer no `uOffset` e trocar a textura faziam o Babylon **varrer todos os ~270 materiais** a cada quadro.
  Agora os pixels de uma única textura são reescritos (~4×/s, 25 KB).
- Chuva: até ~9 mil `fillRect` de 1 pixel por quadro → uma risca pronta por gota (`drawImage`).
- Faróis de carros fora de alcance eram reapagados todo quadro; filtro de projetores de sombra com cache.

### GPU, vértices e bateria
- Malhas da cidade mescladas em pedaços de 512 u: um único pedaço de acabamentos (`trim`: platibandas, fios do
  "gato", postes de madeira) tinha **154 mil vértices**, processados mesmo fora da tela — e de novo no mapa de sombra.
  Camadas densas agora usam pedaços de 128 u (`Config.world.detailChunk`); as demais continuam em 512 u, com a grade
  deslocada para o centro da cidade não cair na quina de 4 pedaços (`meshChunkOffset`).
- Lotes de brilho **do mapa inteiro** desenhados sempre (semáforos 51 mil vértices, postes 56 mil, fogos 12,8 mil
  mesmo sem fogos): brilhos fixos agora em lotes por região (`GlowGrid`), fogos escondidos quando ociosos.
- `GlowBatch` reenviava o buffer **inteiro** à GPU a cada mudança (1,5 MB no entardecer): agora só a faixa alterada;
  postes e lojas acendem por um *uniform* de intensidade.
- Mapa de sombra: alvo de cor RGBA half-float (32 MB) que o PCF nem lê + profundidade float32 (16 MB) → canal único +
  profundidade 16 bits: **48 → 16 MB**, mesma sombra.

### Memória de vídeo e travadas
- Folhas de **portas (5 MB por modelo)** e **amassados** nunca eram liberadas: agora saem da GPU após 90 s sem uso e
  voltam em segundo plano (`CarLibrary.sweep`).
- SWAT/exército eram assados na carga, descartados 60 s depois e **re-assados na hora no meio da perseguição**:
  agora são preparados aos poucos quando o procurado chega a 2★/4★.
- Clipes do jogador eram descartados após 60 s e re-assados na hora (150–400 ms num celular ao sacar a arma de novo):
  folhas do dia a dia (jogador, civis, polícia, motos) ficam residentes.
- Carro de modelo novo era assado (64 direções) **na hora** ao repor o trânsito: agora entra numa fila e o carro
  nasce com outro modelo já pronto da mesma classe.
- Orçamento de "assar" em segundo plano agora usa só o tempo que **sobra** no quadro (antes: 9 ms fixos).
- Vegetação: atlas de vento forte/tempestade (2 × 7 MB) só são preparados quando chove.
- Carros e portas com **32 direções** (antes 64): metade da memória e do preparo.

### Robustez
- `AutoQuality` (degrau 1) quebrava as sombras PCF ao reduzir o mapa (`resize` recriava o alvo sem a textura de
  profundidade). Corrigido (`GameEngine.setShadowSize`).
- Sem física (Havok não carregou: sem internet / CDN fora), o jogo travava a cada quadro. Agora segue sem física.
- O Havok vem de uma URL **sem versão** (muda sozinha na CDN; última mudança 2 dias antes desta análise): o cache
  offline congela no aparelho a versão que funcionou.
- `index.html` tinha dois "`` `n ``" literais (resto de edição no PowerShell).

### Carregamento e offline
- **Service worker** (`sw.js`): depois da 1ª visita, Babylon + Havok + fontes (~7 MB) saem do aparelho e o jogo
  abre **offline**. Arquivos do jogo: rede primeiro (edições aparecem no recarregar). Não atua em `file://`.
- Checagem O(n²) de sobreposição ao gerar quintais (0,4 s na carga) → pré-filtro por quarteirão.

## Desempenho no PC depois do upgrade visual (novembro/2026)

Relato: ~10 FPS num PC. O benchmark de rota fixa (`node tests/bench.cjs`, preset High) mostrou que o quadro tinha crescido muito
desde a base da etapa 0 (`medicao-desempenho.md`), e que o `AutoQuality` não tinha como reagir.

**O que foi medido antes de mexer**

| | Base da etapa 0 | Antes desta rodada |
|---|---|---|
| Triângulos por quadro (High) | 74 a 258 mil | 312 mil a **2,17 milhões** |
| Desenhos por quadro | 105 a 145 | 157 a 297 |
| Desenhos no mapa de sombras | 11 a 27 | 49 a 87 |
| Geometria na placa | 124 MB | 724 MB |

- A **CPU está folgada**: jogo ~15 ms por quadro neste ambiente lento, dos quais ~7 ms são o envio do render. O gargalo é a placa.
- **Vegetação 3D: 11,1 milhões de triângulos no mundo.** Um punhado de cascalho tinha 720 triângulos (9 pedras × 80); na mata, só
  o cascalho somava 609 mil triângulos por quadro. Tufos, capins e cascalho da cidade ainda entravam no mapa de sombras.
- **Acabamentos (`world_trim`): 5,8 milhões de vértices** em pedaços de 128 u. A câmera em 3ª pessoa mostra uma janela de uns
  40 × 60 u, mas a favela desenhava 5 pedaços inteiros (661 mil vértices), e o mapa de sombras outros tantos.
- O **mapa de sombras redesenha tudo o que projeta**: no centro eram 334 mil dos 633 mil triângulos do quadro.
- O **`AutoQuality` só mexia nas sombras** e desistia. Quem continuava lento sem sombras ficava lento para sempre.
- O automático punha **vídeo integrado no High** (Intel UHD / Iris Xe e as APUs da AMD não estavam na lista de placas fracas).
- O PR anterior (#103: faixas, desafios, efeitos de tela) **não mudou o quadro**: mesmos desenhos e triângulos antes e depois, e os
  módulos novos somam ~0,1 ms de CPU. O shader dos efeitos de tela, porém, podia custar no Windows (ver abaixo) e foi corrigido.

**O que mudou**

- **Vegetação rasteira** (`Trees3D.COVER`: tufos, capins, samambaias, cascalho, entulho, lixo):
  - pedra pequena (até meio metro) com 20 triângulos em vez de 80: o cascalho foi de 720 para 180 por punhado;
  - fora do mapa de sombras. A sombra de um tufo de 40 cm não se lê, e cada malha era desenhada de novo nele;
  - pode sumir inteira (`Trees3D.setCover`), como degrau do `AutoQuality`. Árvores, arbustos e pedras ficam.
- **Acabamentos em pedaços de 64 u** (`Config.world.trimChunk`): entram só os que tocam a tela e a janela da sombra. São ~4× mais
  malhas no mundo, mas menos desenhos por quadro na favela e na mata (191 contra 227), porque os pedaços vazios não entram.
- **`AutoQuality` com degraus de verdade** (`core/AutoQuality.js`), do que menos se nota ao que mais se nota:
  1. mapa de sombras a 512;
  2. resolução a 85%;
  3. sem MSAA e sem a paralaxe das fachadas (o relevo fica; saem as ~15 amostras por pixel de parede);
  4. sem sombras;
  5. resolução a 70%;
  6. sem vegetação rasteira, espelho da água a cada 3 quadros;
  7. resolução a 58%.

  - Um segundo só conta como lento se a maioria dos quadros dele foi lenta: um engasgo isolado numa máquina boa não custa qualidade.
  - Abaixo da metade do ritmo ele desce em 2 s em vez de 4.
  - O degrau alcançado fica guardado por preset e placa, e a sessão seguinte começa um degrau acima dele: não repete o primeiro
    minuto a 10 FPS e ainda pode se recuperar. Escolher um preset à mão em Ajustes › Gráficos apaga o degrau guardado.
  - Os degraus de resolução, MSAA e vegetação só valem com placa de vídeo de verdade. Num rasterizador por software (o navegador
    dos testes) ele faz só os dois de sombra, como antes.
- **Preset automático**: vídeo integrado (`Graphics.MID_GPU`: Intel HD/UHD/Iris, AMD Radeon Graphics/Vega) começa no Medium.
  Intel Arc e os chips da Apple continuam no High.
- **Teto de pixels por preset** (`maxPx`: 1,5 / 2,4 / 4,2 Mpx; HD sem teto). Num monitor 4K o High desenhava 8,3 Mpx com MSAA 4×;
  agora desenha o equivalente a 1440p e o navegador amplia. Em 1080p e 1440p nada muda.
- **Efeitos de tela sem custo em repouso** (`Lighting.fx`). O shader da gradação tinha os efeitos dentro de `if`. No Windows, o
  compilador HLSL tira as leituras de textura de dentro dos `if` e passa a fazê-las sempre: 7 leituras de tela a mais por pixel com
  tudo em zero. Agora são duas variantes do shader, e a com efeitos só entra enquanto algum está ativo.
- O cartão dos desafios do dia fica `visibility: hidden` fora da tela: vidro fosco com opacidade 0 ainda é desenhado pelo navegador.

**Resultado** (mesmo benchmark, High, 1280×720; triângulos e desenhos valem para qualquer máquina)

| Cena | Triângulos antes | Depois | | Desenhos antes | Depois |
|---|---|---|---|---|---|
| Favela (início) | 2.056 mil | **979 mil** | −52% | 227 | 191 |
| Centro | 713 mil | **577 mil** | −19% | 237 | 236 |
| Lagoa | 1.180 mil | **948 mil** | −20% | 297 | 303 |
| Mata atlântica | 2.173 mil | **1.134 mil** | −48% | 248 | 227 |
| Centro à noite com chuva | 312 mil | **270 mil** | −14% | 157 | 158 |

**Tempo de quadro neste ambiente** (sem placa de vídeo: o rasterizador por software é limitado por preenchimento de pixels, como
um vídeo integrado fraco; os valores absolutos não valem para um PC, as proporções sim):

- Só os cortes de geometria, antes e depois em sequência na mesma máquina (mediana de 28 quadros por cena): favela 1.622 e
  1.343 ms antes, 1.235 ms depois; centro 1.521 e 1.570 antes, 1.643 depois; mata 1.749 e 1.722 antes, 1.752 depois. Ou seja,
  de 0 a −20%, dentro do ruído fora da favela. **Cortar triângulos sozinho não resolve um PC limitado por preenchimento.**
- Um recurso desligado por vez (centro): MSAA, paralaxe das fachadas, gradação e a qualidade do PCF mudam menos que o ruído (±5%).
- Os degraus do `AutoQuality`, do preset High ao último (mediana de 22 quadros): centro **1.644 → 373 ms (4,4×)**, favela
  **1.158 → 450 ms (2,6×)**, com 135 a 145 desenhos e 190 a 415 mil triângulos no fim. O que mais rende é a resolução: 85% tira
  ~23% do tempo, 70% outros ~30%. Por isso ela vem cedo na lista.

**O que não foi medido.** Não há placa de vídeo neste ambiente: o ganho em FPS num PC real não foi medido aqui. Para medir, abra
o jogo com `?bench&gfx=high` (ou `medium`) antes e depois e compare a coluna de FPS sem teto.

**O que ainda pesa** (próximos cortes, por ordem de ganho):
- o mapa de sombras ainda redesenha os acabamentos e as árvores inteiras (no centro, metade dos triângulos);
- postes de luz: ~5.800 no mundo, 386 vértices cada (108 MB); semáforos: ~1 milhão de vértices;
- plantações da roça nos acabamentos (1,4 milhão de vértices de folhas);
- cada célula de vegetação tem a sua cópia da geometria do modelo (~150 MB), por causa do VAO dividido entre malhas;
- memória de vídeo estimada: 959 MB de texturas (638 MB de atlas de personagens) e 712 MB de geometria.

`tests/52_desempenho` confere os pedaços de 64 u, as rasteiras fora da sombra, o cascalho leve, o vídeo integrado, o teto de
pixels, as duas variantes do shader e o `AutoQuality` descendo até o fim, guardando o degrau e retomando um acima.

## Carros e personagens

Os carros saíram do desenho procedural: atlas vetorial pronto (36 modelos), girado e repintado no shader, todos num
lote único. Medições e como adicionar modelos em [`carros.md`](carros.md).

Os personagens também: atlas vetorial (839 quadros, uma direção cada, girados no jogo), 54 → 16 MB de textura e a fase
"Montando sprites" da carga de 5,7 s para 2 ms. Ver [`personagens.md`](personagens.md).

## Arte em PNG

Infraestrutura pronta para trocar a arte procedural por PNG indexado, folha por folha — ver
[`sprites-png.md`](sprites-png.md). Com os moldes exportados na pasta, o jogo carrega ~24% mais rápido mesmo no PC
(no celular, onde desenhar por código custa ~5×, o ganho é maior).

## App de PC (Tauri) — segunda rodada (outubro/2026)

Medido no navegador interno com GPU real (Intel Iris Xe integrada), meio-dia travado, jogador no centro da cidade,
comparações A/B na mesma sessão (liga/desliga em tempo real).

| Mudança | Antes | Depois |
|---|---|---|
| **60 FPS no app de PC** (`config.js`; `AutoQuality` volta a 30 antes de baixar a qualidade) | teto 30 | teto 60 |
| Caixas de sombra dos veículos num lote só (`render/ShadowBoxBatch.js`) | ~20 desenhos no mapa de sombra | 1 |
| Mapa de sombra (tempo) | 1,08 ms | 0,75 ms |
| Casa do jogador congelada quando o fade está parado; água congelada (a textura é a mesma) | 8 materiais reavaliados por quadro | 0 |
| Quadro inteiro (72 pedestres) | 10,0 ms | 9,1 ms |
| `Zones.every` conta quadros a 30 FPS: a 60, quem está fora da tela roda as mesmas vezes por **segundo** | lógica fora da tela ×2 a 60 FPS | igual a 30 FPS |
| `syncVisual` dos carros lia `getAbsolutePosition()` (refaz a matriz) | ~6 µs por carro | posição direta |
| **Separação da multidão era O(n²)** (`GridCrowd`) → grade espacial | 600 pedestres: 4,7 ms | 0,6 ms |
| Quadro inteiro com 600 pedestres | 9,6 ms (44 FPS) | 4,4 ms (57 FPS) |
| A* da multidão no app de PC: em lote, numa thread do Rust (`src-tauri/src/nav`) | rajadas de 13–15 ms (tiro: todos refazem caminho) | fora do quadro |

Escala da multidão: com a separação corrigida, o gargalo deixou de ser o número de pedestres. O A* só pesa em
rajadas (pânico, nascimento em massa) e, no app de PC, sai da thread do jogo. No navegador e em `file://` continua o
A* em JS com orçamento de 3 ms por quadro. Se o Rust falhar, o jogo volta sozinho para o JS.

### Pontes e viaduto (bug: quem passava "por cima" sumia por baixo)

O Babylon desenha em camadas (rendering groups) e cada camada começa com a profundidade zerada: o que está na camada 1
sempre cobre a 0. As estruturas "x…" (feitas para ficar ACIMA de quem passa, com o furo em volta do jogador) estão na camada
1 e eram desenhadas depois de tudo.
- **Pontes cidade ↔ ilha** (tabuleiro a 0,22 u, tudo passa por cima): usavam os materiais "x", então jogador, pedestres e carros
  sumiam sob o tabuleiro. Agora usam os materiais de rua comuns (camada 0, mesmas texturas). O barco que passa por baixo
  (rebaixado a y 0,1) continua escondido pela profundidade.
- **Viaduto:** o tabuleiro vinha depois do lote de carros (que não grava profundidade) e cobria até quem estava EM CIMA. Agora as
  estruturas "x" desenham antes dos carros e gravam profundidade: carro em cima aparece, carro embaixo some. O furo em volta do
  jogador virou pontilhado 2×2 (cada pixel é desenhado inteiro ou descartado): carro embaixo, perto do jogador, aparece pelo furo.
- **Nível do carro no viaduto:** só sobe quem entra pela rampa alinhado com a via, e fica no tabuleiro até sair pela outra ponta
  (antes a direção era conferida o tempo todo: girar ou derrapar lá em cima jogava o carro para baixo do tabuleiro).
- **Rampas:** a viga sob a pista usava a altura mais alta de cada degrau de 4 u e furava o asfalto (faixas cinza na pista).

Conferido na tela: pessoas, carros, moto e bicicleta na ponte; barco escondido sob ela (só a proa para fora); carro em cima do
viaduto visível; carro embaixo escondido longe do jogador e visível pelo furo perto dele; rampa contínua.

**Sombra das pontes (sensação de altura):** as pontes ficam rentes à água (física plana), então não tinham sombra.
`world/BridgeShadows.js` desenha sobre a água a sombra de um tabuleiro a 10 u de altura: deslocada na direção do sol, com a
mesma força das outras sombras (lida do ShadowGenerator: some à noite, enfraquece com chuva e no modo sem sombras), encolhendo
até zero nas cabeceiras e com a faixa de cada pilar. O trecho sob o próprio tabuleiro fica escondido por ele. Uma malha para as
três pontes (1 draw call); as posições só são refeitas quando o sol muda. O viaduto, que é alto de verdade, já projetava sombra
real nas ruas de baixo (medido: asfalto na sombra com ~60% do brilho do asfalto ao sol).

### Em cima e embaixo: viaduto a pé, nadar/navegar sob as pontes e pular da ponte

O mundo é plano (2D); "estar em cima" ou "embaixo" virou um estado do jogador (`Player.onDeck` / `Player.underBridge`) que
decide a altura do desenho (`baseY`), com o que ele bate e a altura do furo (`revealY`). O furo (RevealPlugin) só abre no que
está ACIMA do alvo; a pé a referência é a cabeça (a mureta ao lado não abre furo).
- **Viaduto a pé:** sobe quem entra pelo PÉ da rampa andando ao longo da via (embaixo do tabuleiro não sobe); fica até sair pela
  outra ponta, contido entre as muretas, com o sprite na camada 1 (junto do tabuleiro). Ao descer do carro lá em cima, herda o nível.
- **Sob as pontes:** quem chega à área do tabuleiro vindo da água (nadando ou no raso) passa por baixo até sair do outro lado: a
  água continua água (`MapGeo.waterDepthBelow`), a mureta não segura (`resolveCircle(…, inWater)`), o sprite fica a y 0,1 e o furo
  da ponte (materiais `b…` com o RevealPlugin) o mostra. Barco: encalha só em margem e píer (`MapGeo.isShore`) e a mureta tem a
  camada de física 8, que o barco ignora (carro ainda bate).
- **Pular da ponte:** a mureta é pulável (V); o pouso é na água, 2,5 u além dela, com anéis de mergulho. Quem está nadando embaixo
  não sobe por ela, e a polícia não segue o pulo.

Testado: nado de um lado ao outro sob a ponte; furo aberto embaixo e fechado em cima; pulo da ponte para a água; V recusado
nadando sob a mureta; subida a pé pela rampa (0 → 6,2 u), presa entre as muretas e visível; barco atravessando por baixo.

**Depois:** o furo pontilhado deu lugar ao corte do teto (`render/RoofCut.js`): o trecho do viaduto, o vão da ponte, o túnel ou a
cobertura em cima do alvo some inteiro e volta quando ele sai; as copas ficam inteiras e quem está embaixo aparece como a silhueta
dourada (`XRaySilhouette`). Ver analise-jogabilidade.md.

### Travamento no respawn: GPS (corrigido)

Sintoma: depois de morrer/ser preso, o navegador congelava ("a página não está respondendo") e às vezes caía. Achado com a
caixa-preta (`core/HangProbe.js`: travou na seção "rua", 2,2 s depois de acordar) e a pausa do depurador (`world/Gps.js`).

Causa: o Dijkstra do GPS guardava as distâncias num `Float32Array` e não marcava nós já resolvidos. Gravar em 32 bits às vezes
arredonda para cima; a mesma distância (64 bits) voltava a parecer menor, o nó voltava à fila e reexpandia os vizinhos — em
cascata, sem fim. Com um destino marcado, a rota é recalculada a cada 0,7 s a partir de onde você está; acordar longe
(hospital/delegacia) era o gatilho comum. Em 7 pares aleatórios de pontos, a versão antiga passou de 50 mil passos sem
terminar em 3.

Correção: distâncias em `Float64Array`, cada nó fechado uma vez só e um teto de segurança. 59 rotas comparadas com um
Dijkstra de referência: comprimentos idênticos; a pior levou 1,8 ms.

A caixa-preta fica no jogo: só grava nas janelas de morte/prisão e custa um `if` fora delas.

Depois disso o GPS foi **substituído por um marcador** (como o blip vermelho do GTA San Andreas): `game.gps` guarda só
`{ x, z, label }`; o minimapa mostra o blip no lugar ou preso na borda com uma setinha (a borda de cima fica abaixo do "N",
que antes cobria marcadores ao norte — vale também para a safe house); o mapa da pausa mostra o alfinete e a distância em
linha reta. Nada é recalculado por quadro — só a checagem de chegada (uma distância, ~4×/s). `world/Gps.js` continua
para o que precisa de um caminho UMA vez por pedido: a corrida do mototáxi e o prazo das missões.

### Travamento no respawn: posições fora do mundo (proteção)

Um segundo relato da caixa-preta apontou de novo a seção "rua", 2,5 s depois de acordar. Ali, além do GPS, roda a colisão
carro × poste/hidrante (`StreetProps`), que varre a grade com `for (gx = floor((x - R)/16); gx <= floor((x + R)/16); gx++)`.
Com x infinito ou gigante (acima de ~1e17, `gx + 1 === gx`) esse laço nunca termina. O mesmo padrão existe em mais de 20
buscas por grade (grade espacial, cidade, ruas, interiores, poças, culling da câmera). Um corpo que nasce ou é teleportado dentro
de outro pode ser lançado pela física para posições assim.

Proteção em duas camadas:
- `inWorld(x, z)` (config.js): posição finita e dentro do mundo (com folga de 3.000 u). As buscas que recebem posições de
  entidades ou da câmera devolvem vazio fora disso: `SpatialHash.insert/query`, `RenderCuller._candidates`,
  `CityGrid.obstaclesAround/nearestHideSpot/nearestVault`, `RoadPlan.nearestRoadPoint/nodeNear/onPavement/nearbyRoadPoints`,
  `Interiors.shopNear`, `Puddles._requery` e a colisão do `StreetProps`.
- `Game._rescueStrays` (logo depois dos passos de física): veículo ou jogador fora do mundo volta, parado, para o último
  lugar bom (guardado a cada 0,5 s). Fica registrado no console (`[RESGATE] ...`) e na caixa-preta.

Testado provocando o problema: carro posto em (1e20, 1e20) → as buscas voltam na hora, a atualização da rua leva 0,2 ms e o
resgate devolve o carro, que segue dirigindo. Em 6 ciclos de morte e prisão com polícia ativa, nenhum resgate foi necessário
nesta máquina. Se acontecer na sua, o console vai dizer qual veículo e onde.

### Jogo offline (sem internet) e por duplo clique

Babylon.js 6.40.0 e Havok vinham de CDN a cada abertura. Sem internet o `.wasm` do Havok não carregava, o jogo seguia
**sem física** e, sem física, não existem carros, polícia nem pedestres (nem pelo dev mode). Agora as três peças ficam em
`vendor/` (`babylon.min.js`, `HavokPhysics_umd.js` e `HavokPhysics.wasm.js` — o `.wasm` embutido em base64, porque em
`file://` o navegador proíbe buscar arquivos); `core/physics.js` passa o binário ao Havok (`wasmBinary`). Bônus: a versão do
Havok fica congelada (o sync rápido de `physics.js` lê a memória interna dele). O manifesto só é carregado por http(s)
(em `file://` gerava erros de CORS no console). Para atualizar o Havok: baixar os dois arquivos da CDN e regerar o base64.

### Respawn (hospital/delegacia) e outros saltos

O respawn é um TELEPORTE: o mundo em volta do destino nasce de uma vez, enquanto voando de helicóptero ele chega aos
poucos. Medido no perfil leve, função por função, nos quadros logo após acordar:

| | Antes | Depois |
|---|---|---|
| Colisores (`ColliderStreamer`) | salto criava ~170 e destruía ~700 corpos num quadro (11–36 ms) | só os de até 40 u na hora; o resto 40/quadro, descarte 80/quadro |
| Terreno (`TerrainBuilder`) | orçamento de 5 ms conferido só entre pedaços; cada pedaço 12–19 ms → 5 quadros seguidos de 15–22 ms | pedaço montado em fatias (1 linha de células / 1 malha por passo); respeita o orçamento |
| `MeshBatch.quad/tri` | um array + iterador de lixo por quad (milhares por pedaço) | sem alocação |

Verificado também: 6 mortes seguidas (favela ↔ hospital) sem vazamento — memória, malhas, texturas, materiais e corpos
físicos voltam aos mesmos números. Neste PC (8 núcleos, Iris Xe) nenhum caminho de morte/prisão travou o navegador,
antes ou depois; os picos que sobram (20–40 ms) são pausas do coletor de lixo e o acender dos faróis quando o salto de
horas cai à noite.

Medir no app: `?fps60` simula o teto do app no navegador; `?full` desliga o `AutoQuality` (necessário para medir com
a aba em segundo plano, que senão grava o perfil leve).

## Próximos passos recomendados

1. **Pool de veículos** no trânsito: hoje cada reposição (3×/s) destrói e recria malhas + corpo físico + sprite
   (~1 ms no PC, ~6–8 ms no celular).
2. **Sprites em lote (instancing)** quando a arte em PNG chegar: juntar os clipes de cada tipo num atlas único e
   desenhar todos os atores do mesmo tipo numa chamada. **Feito para os carros** (atlas vetorial + `CarBatch`, ver
   [`carros.md`](carros.md)); os personagens já usam um atlas e um material únicos, falta juntá-los num lote.
3. **Acessórios em camada** (mochilas) em vez de uma cópia inteira das animações do jogador por bolsa.
4. **Fixar a versão do Havok** numa URL versionada compatível com o Babylon 6.40.
5. **Geração do mundo fora da thread principal ou pré-calculada** (a semente é fixa: dá para gerar uma vez e
   distribuir como dados) — hoje são 4–7 s de CPU antes do menu.
6. **Empacotar/minificar para produção** (ex.: esbuild): 116 arquivos e 2,2 MB de código → um arquivo de ~700 KB.
7. **Atlas de fachadas e telhados**: hoje cada variante de parede/telhado é um material (≈20), e cada um vira uma
   draw call por pedaço visível. Um atlas com repetição no shader juntaria tudo em 1–2 chamadas por pedaço (o maior
   ganho restante de CPU no render, principalmente no celular).
8. Dividir o `game.js` (2.300 linhas) em sistemas com interface comum de `update` — facilita perfil e LOD por sistema.
9. Ligar o `SpriteIO` nas demais artes procedurais (vegetação, barcos, helicópteros, pássaros, itens, interiores,
   texturas do chão) — lista em `sprites-png.md`.

## Como medir

Painel DEV → aba INFO (capacidade, custo por sistema, draw calls, memória). Teste de carga em MUNDO.

## Gráfico suave (outubro/2026)

Ajustes › **✨ Gráfico suave** (`Config.art.smooth`, ligado por padrão; só vale na **alta definição** — o modo pixel art
continua pixelado de propósito). Código em `src/render/Smooth.js`. Tira o serrilhado em quatro frentes:

| Frente | Antes | Agora |
|---|---|---|
| Resolução | a tela era desenhada em "pixels da página" e o navegador ampliava (Windows a 125%/150%, retina): borrada e serrilhada | densidade real do monitor, até `Config.perf.dprCap` (2 no PC, 1,5 no perfil leve) — o enquadramento da câmera não muda (`GameEngine.viewHeight`) |
| Bordas da geometria | sem antisserrilhamento | **MSAA 4×** (1º pós-processamento da câmera; FXAA sem WebGL 2) |
| Texturas do chão e dos telhados | pixels duros (`NEAREST`): grão "serrilhado" e pixels de tamanhos desiguais com a câmera andando | trilinear + anisotrópico; o chão do mundo grande (`TerrainSplat`) e a orla/espuma (`WaterPlugin`) sem a grade de 5 cm |
| Sprites de paleta (árvores, arbustos, mobiliário de rua: `PropSprites`) | contorno em escada | bilinear à mão "nítido" sobre a cor já pintada: miolo do pixel da arte duro, só a borda suavizada, na medida do zoom (como os personagens 2,5D) |
| Sombras | PCF de qualidade baixa | PCF média (borda macia) |

Custo medido (GPU integrada/dedicada do PC de teste, janela de 652×698 px da página = 815×872 reais): +0,7 ms de GPU por
quadro, CPU igual. Cresce com a área da tela. O `AutoQuality` ganhou um degrau: **2) sem o gráfico suave** (antes de
reduzir o mapa de sombras), então em aparelho que não aguenta ele volta à imagem de antes sozinho. Trocar o ajuste no meio
do jogo descongela por 2 s os materiais do mundo (os defines da sombra e o uniform do chão mudam) e congela de novo.
