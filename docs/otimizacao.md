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

## Celular de 4 GB (novembro/2026)

Relato: o jogo só rodava bem num S25 Ultra; em celulares mais modestos não dava para jogar. Medido no navegador dos testes no
perfil de um celular (tela de toque, 915×412, preset Medium — o que um aparelho de 4 GB recebia), com a GPU por software: aqui a
"placa" é RAM do processo da GPU, como num celular, em que a placa de vídeo divide a memória com tudo.

**O que foi medido antes de mexer**

| | Medium (o que o celular recebia) |
|---|---|
| Memória do navegador (todos os processos) | **2,54 GB** (página ~930 MB, GPU ~1 GB) |
| Pico da página durante a CARGA | **~2,0 GB** (3,2 GB no total) |
| Heap JS | 477 MB · o jogo **caía** com o heap do V8 limitado a 480 MB (abre com 640) |
| Texturas / geometria na placa | 339 MB (127 de atlas 2,5D) / **450 MB** (227 só de vegetação 3D) |
| Desenhos / triângulos por quadro | 425 (+95 no mapa de sombras) / 845 mil |
| Malhas na cena | 6.420 |

- **Vegetação 3D: a mesma árvore copiada por célula.** Cada espécie em cada célula de 128 u tinha a sua cópia dos vértices (uma
  geometria por malha por causa do VAO do Babylon) — 227 MB na placa e outra cópia na RAM.
- **Toda a geometria ficava duas vezes na memória**: na placa e na cópia do Babylon em JavaScript (mais o lote do WorldBuilder
  apontando para ela). No celular as duas estão na mesma RAM.
- **Vértice do mundo com 40 bytes** (posição, normal e cor em float) onde 20 bastam.
- **Pico da carga**: o mundo inteiro (~3,5 milhões de vértices em 1.111 lotes) ficava em arrays comuns do JavaScript (8 bytes por
  número, folga de crescimento) até o fim da montagem: ~600 MB vivos de uma vez, mais o lixo que o coletor ainda não tinha levado.
- **Personagens 3D sem limite** (`max: 999`, raio de 400 m): todo NPC na tela era um boneco de milhares de pontos.
- O perfil de CPU mostrou que o JavaScript do jogo custa ~3–4 ms por quadro aqui (no celular, ~3–4× isso): o gargalo do celular
  modesto é **memória e GPU**, não a lógica. Dos números do `Perf`, boa parte era espera pela GPU por software.

**O que mudou para todos os presets**

- `Trees3D._gpu/_share`: os vértices e índices de cada modelo vão à placa UMA vez; cada célula ganha a sua `Geometry` (o VAO fica
  nela) apontando para os mesmos buffers (`setVerticesBuffer`/`setIndexBuffer`, com contagem de referências). Vegetação: 227 → ~2 MB.
- `MeshBatch._compactTo`: o mundo estático (`world_…`) com normal em `BYTE` e cor em `UNSIGNED_BYTE` normalizados — o vértice cai de
  40 para 20 bytes (acabamentos: 120 → 64 MB). Cor fora de 0..1 fica em float. `?compacto=0` volta ao float para comparar.
- `MeshBatch.releaseStatic` (no fim da pré-carga, `Game._releaseStatic`): solta a cópia na RAM dos vértices e índices de malhas
  paradas (matriz congelada, sem esqueleto, buffer não atualizável e não de instâncias) e os lotes do WorldBuilder: ~114 MB.
  As posições dos modelos de vegetação ficam (`_dmKeep`): o terreno monta células novas durante o jogo.
- `MeshBatch._spill`: a cada 2.048 vértices o lote despeja o que empilhou em pedaços Float32/Uint32 e recomeça; o `build` (e o
  `Speedway._split`, que lê o lote inteiro) emendam um lote por vez (`_unspill`). Antes do `_flush`: 310 → 209 MB nos lotes, heap vivo
  575 → 431 MB. As sombras-fantasma dos prédios são montadas já em arrays tipados.
- `RenderStats` conta cada buffer da placa uma vez e em bytes reais (8 bits na normal/cor; buffer de instâncias pelo tamanho dele).

**O perfil do celular modesto** (`Graphics.PHONE`, automático com tela de toque e `navigator.deviceMemory ≤ 4`; `?celular` força,
`?celular=0` desliga; o S25 Ultra e afins, 8 GB, seguem no Medium normal; escolher High/HD à mão é respeitado):

| Corte | Por quê |
|---|---|
| 30 FPS, tela até 1,25×, teto de 0,85 Mpx, MSAA 2× | metade do trabalho e da bateria; tela pequena |
| sem sombras, brilho de verdade, espelho da água | cada um dobra desenhos ou passadas |
| fachadas sem a paralaxe de oclusão, chão sem o mapa de normais, gradação sem o desfoque, sem o borrão (Trails) | custos por pixel em quase a tela inteira |
| atlas 2,5D em meia resolução (`npcHalf`) com 64 MB; atlas de cenário na resolução do Low | memória de textura |
| bonecos 3D só os 8 mais perto (raio 40 m) | cada um são milhares de pontos com esqueleto no vertex shader |
| vegetação em células de 256 u, acabamentos em pedaços de 128 u, sem as rasteiras | menos malhas (heap) e desenhos |
| menos gente (0,5), vida da cidade baixa, névoa a 75 m, interface (minimapa, painel, prompt) na metade do ritmo | CPU e desenhos |

**Resultado** (mesmo ambiente, mesmo ponto do mapa; "antes" = Medium no celular; "depois" = perfil do celular)

| | Antes | Depois |
|---|---|---|
| Memória do navegador | 2,54 GB | **~1,9 GB** (página ~770 MB, GPU ~840 MB) |
| Pico da página na carga | ~2,0 GB | **~1,8 GB** |
| Menor heap do V8 com que o jogo abre | > 480 MB (cai com 480) | **≤ 320 MB** |
| Heap JS em jogo | 477 MB | **~297 MB** |
| Texturas (atlas 2,5D) | 339 MB (127) | **~252 MB (64)** |
| Geometria na placa | 450 MB | **~155 MB** |
| Desenhos por quadro | 425 + 95 de sombra | **~160** |
| Malhas na cena | 6.420 | **~4.090** |

No Medium de PC (sem o perfil do celular), só as mudanças gerais: geometria 450 → ~180 MB, heap ~477 → ~360 MB, mesma imagem.

**Como medir:** `?perf` mostra no canto a memória de vídeo estimada (texturas, personagens, geometria) e o heap. O teste de heap
limitado (abrir o Chromium com `--js-flags=--max-old-space-size=N`) é o que mais se aproxima de "o celular aguenta abrir?".
`tests/73_celular` confere o perfil, a memória e desenhos, o mundo compacto e sem a cópia na RAM, a vegetação dividindo os
buffers e que o despejo do lote dá o mesmo resultado que empilhar tudo de uma vez.

**O que não foi medido.** Não há celular aqui: o FPS num aparelho de verdade não foi medido. A conta de memória da GPU por
software é maior que a de um driver de celular (cópias internas do SwiftShader), mas as proporções valem.

**O que ainda pesa** (próximos cortes): o heap de ~300 MB é espalhado — ~4 mil malhas do Babylon (cada uma com matrizes, caixa
e os defines do material: ~35 MB só em `PrepareDefinesForLight`), os 46 manifestos dos atlas 2,5D lidos inteiros na abertura
(~12 MB), ~7 mil `TransformNode` de colisores (~14 MB, poderiam nascer só quando o `ColliderStreamer` os põe na física).

## Notebook e celular sem segurar 30 FPS (novembro/2026)

Relato: nem o notebook nem o S25 Ultra seguravam 30 FPS, e os dois esquentavam. Medido no navegador dos testes, preset Medium (o de
notebook com vídeo integrado e de celular), câmera parada no centro, só o render, sincronizando com a GPU a cada quadro (`tools` em
`scratchpad`: liga/desliga um recurso por vez e compara a mediana).

**O que pesava**

| Recurso | Custo no quadro (GPU simulada) |
|---|---|
| **NPCs em 3D** (bonecos de pontos, `max: 999` num raio de 400 m: **84 bonecos, 444 mil pontos** no centro) | **57%** |
| Personagens 2,5D, chão, meia resolução, todo o resto | 0–13% cada (o resto dentro do ruído) |

| Bonecos 3D | Quadro |
|---|---|
| 84 (sem limite) | 8,7 s |
| 16 | 5,7 s |
| 8 | 5,3 s |
| 0 | 3,7 s |

Cada boneco são milhares de quadradinhos instanciados com o esqueleto no vertex shader e `discard` no fragment (sem descarte
antecipado de profundidade): caro em qualquer GPU, muito em celular e vídeo integrado.

Além disso:
- **Medium a 60 FPS**: notebook e celular no limite o tempo todo (o calor), oscilando entre 30 e 60.
- **AutoQuality frouxo**: no teto de 30 só contava como lento quadro acima de 45 ms em 60% da janela — ficava em 22–29 FPS sem baixar
  nada (a 60 Hz um jogo que não cabe em 33 ms alterna quadros de 33 e 50 ms).
- **Antisserrilhado dos personagens 2,5D**: até 4×4 amostras com laços de tamanho vindo do pixel e `continue` — o Chrome no Windows
  (Direct3D) desenrola e lê a textura em todas as voltas, sempre (até ~500 leituras por pixel de personagem).
- CPU do render (o Babylon mandando o quadro): 8–9 ms no Medium, ~4 ms só da passada de sombra; no celular, 2–3× isso.

**O que mudou**

- NPCs 3D só os mais perto, por preset: Medium 6 (26 m), High 12 (36 m), HD 24 (50 m), Low 0, celular 4 (22 m). Os outros no 2,5D (a
  arte de sempre). Os degraus de personagens do AutoQuality cortam a quantidade (metade; depois 2). `?npc3d=N` para medir.
  Quadro do centro: **8,7 → 4,0 s**.
- Medium a **30 FPS** estáveis por padrão; **Ajustes › Taxa de quadros** (automático / 30 / 60).
- AutoQuality: lento = acima de **1,15×** o tempo alvo em **metade** dos quadros (30 FPS: 38 ms).
- Medium: MSAA 2×, sombra com PCF baixo e **redesenhada a cada 2 quadros** (`Config.perf.shadowEvery`; o sol só anda nesses quadros —
  `GameEngine.update` — e a sombra não desalinha), fachadas sem a paralaxe de oclusão (~15 leituras por pixel de parede).
- Low e Medium: acabamentos em pedaços de 128 u e vegetação em células de 256 u — CPU do render **9,2 → 7,0 ms** (centro) e
  **8,4 → 4,6 ms** (favela), 5.700 → 3.800 malhas. `?trim=N` e `?celula=N` para medir.
- Personagens 2,5D: laços do antisserrilhado com tamanho fixo na compilação (`AAN`): 2×2 no Medium e no celular, 3×3 no High (era
  4×4), 4×4 no HD; a média de longe em 2×2.

**O que não foi medido.** O FPS num notebook e num celular de verdade. Para medir aí: `?perf` (painel com FPS, ms de GPU e de CPU,
desenhos) ou `?bench&gfx=medium` (a tabela de rota fixa).

## Modo seguro que não fica preso (novembro/2026)

**O caso.** Um notebook com Intel Iris Xe (Chrome no Windows, Direct3D 11) mandou o diagnóstico: preset Low escolhido à mão e
"modo seguro: LIGADO — desligou: efeitos de tela". Sem os efeitos de tela não há gradação de cor, brilho nem antisserrilhado: o
jogo fica bem mais feio do que precisa. O modo seguro guardava a decisão por placa de vídeo **para sempre**, sem data nem motivo.
Não dava para saber se ela veio de uma versão antiga, cujos shaders podiam falhar nessa placa.

**O que mudou** (`core/SafeMode.js`):
- O estado guardado agora traz a revisão do desenho (`REV`), a data e o motivo. O diagnóstico mostra os três, por exemplo
  "desde 23/11/2026 · revisão 2 · motivo: tela só com a cor do céu".
- Quando o estado é de outra revisão, não tem data ou tem mais de 14 dias, o jogo tenta de novo com tudo ligado:
  - a imagem chega em 8 checagens seguidas: o modo seguro é apagado;
  - a imagem não chega: os degraus voltam um a um, como na primeira vez, e ficam guardados com a revisão nova;
  - não dá para saber (8 checagens com a tela escura, à noite): volta ao que estava guardado e tenta de novo na próxima abertura.
- As regras contam checagens, não segundos, porque num aparelho lento cada quadro demora.
- `REV` sobe sempre que os shaders de tela mudam. Os estados guardados antes desta mudança não têm revisão e são tentados de novo.
- `Char3D.on` agora considera o `disable()`. O 3D já parava de desenhar, mas o diagnóstico continuava dizendo "ligados".

Teste: `74_modo_seguro`.

## Teste de desenho na abertura (novembro/2026)

**O caso.** No mesmo notebook (Iris Xe, Chrome 157, Direct3D 11), em todos os presets, só apareciam o jogador e as partículas. A
tela era toda da cor do céu, sem mundo, interiores, carros nem o fundo preto do esconderijo. Mesmo assim o painel `?perf` contava
desenhos: 19 desenhos e 18 malhas ativas, que é o normal dentro do esconderijo. O Babylon só conta um desenho com o shader pronto,
então os materiais padrão eram desenhados sem que nada aparecesse. O jogador e as partículas usam shaders próprios, com uniforms
simples. Os materiais padrão recebem câmera, luz e malha por *uniform buffers*.

**O que mudou:**
- `core/GpuCheck.js` roda no `GameEngine`, antes de qualquer material do jogo. Numa cena descartável ele desenha um plano vermelho
  de material padrão, com a luz, a névoa de perseguição verde e os plugins do jogo, sobre um fundo azul, e lê o pixel do meio.
- Se o pixel não sai vermelho, ele tenta, nesta ordem, e fica com a primeira opção que desenha:
  1. sem uniform buffers;
  2. a névoa padrão do Babylon (a câmera de cima fica sem o corte das bordas);
  3. as duas juntas.
- O diagnóstico mostra o resultado na linha "teste de desenho".
- `?ubo=0` força o modo sem uniform buffers. `?desenho=simular` finge que o primeiro desenho falhou.
- A vigia do modo seguro agora lê uma grade fora do meio da tela, onde fica o jogador. Com efeitos de tela ligados, ela lê a cena
  antes da gradação de cor.

**Diagnóstico seguinte do notebook.** O teste de desenho deu ok: numa cena isolada o material padrão desenha. No jogo, a vigia nova
viu "só céu" e desligou efeitos, personagens 3D e sombras, sem resolver. A causa está em algo que só a cena do jogo tem. Por isso:
- `core/SceneProbe.js`: quando a vigia vê só céu, antes da escada de degraus, o jogo testa uma suspeita por vez na cena de verdade e
  olha a tela depois de cada uma. As suspeitas, em ordem:
  1. texturas fora da tela (sombra, luz da noite, espelho d'água), que regravam a câmera da cena no meio do quadro;
  2. a névoa, empurrada para o infinito;
  3. o plugin de luz da noite, que vale para todos os materiais padrão;
  4. as luzes.

  A primeira que faz o mundo aparecer fica, e o modo seguro lembra dela (degrau `x:…`).
- Diagnóstico, linha "erros de desenho (1 quadro)": desenha um quadro e pergunta à placa (`gl.getError`) depois de cada malha. Assim
  aparece qual desenho o Direct3D recusou e com que erro.
- Último recurso: se nada resolve, a próxima abertura dessa placa vai sem uniform buffers (`ubo0` no estado do modo seguro, lido pelo
  `GpuCheck`).

Testes: `75_teste_desenho` (normal, falha simulada → sem uniform buffers com o esconderijo e a rua aparecendo) e `74_modo_seguro` (a vigia,
o teste da cena simulado e as linhas do diagnóstico).

**Chrome × Firefox no mesmo notebook.** O Firefox, na mesma placa e no mesmo Direct3D 11 (também via ANGLE), abre e roda o Medium a 25–30
FPS. O Chrome não desenha o mundo. A diferença de pipeline entre os dois diagnósticos: o Chrome usa a **compilação paralela de
shaders** (KHR_parallel_shader_compile) e o Firefox não. O teste de desenho desligava a compilação paralela enquanto rodava, e por isso
passava no Chrome. Agora:
- O teste de desenho roda como o jogo roda, com a compilação paralela (espera o shader ficar pronto). A primeira saída, se falhar, é
  **sem compilação paralela**, como no Firefox; depois vem sem uniform buffers e a névoa padrão.
- Os últimos recursos do modo seguro, um por abertura: sem compilação paralela, depois sem uniform buffers. Os degraus da escada que
  não resolveram saem: a próxima abertura vem com tudo ligado, mais o pedido. Esses pedidos não vencem pela data, só com uma revisão
  nova (`SafeMode.REV` = 3).
- `?paralelo=0` força a compilação sem paralelismo.

**"WebGL not supported" (Chrome 158, mesmo notebook).** O navegador recusou o WebGL antes do jogo abrir. Isso acontece quando a placa
de vídeo "travou" algumas vezes (o Chrome bloqueia o site até ser fechado por completo), com a aceleração gráfica desligada ou logo
depois de uma atualização do navegador. As versões atuais do Chrome não têm mais WebGL por software como reserva. Agora:
- A carga que falha por WebGL abre uma tela própria com os passos: fechar o navegador por completo, ligar a aceleração gráfica,
  conferir `chrome://gpu` ou abrir em outro navegador.
- O diagnóstico testa o WebGL do navegador (linha "WebGL do navegador").
- Cada vez que a placa reinicia o jogo (`webglcontextlost`), isso é anotado entre aberturas (`gpuLost`, as últimas 10, com a placa)
  e aparece no diagnóstico ("a placa reiniciou o jogo").
- Depois de uma reinicialização nos últimos 7 dias, a próxima abertura dessa placa compila os shaders sem paralelismo, como o Firefox
  (`GpuCheck`, modo "forçado"). `?paralelo=1` desliga essa proteção.
- **Intel no Direct3D 11** (Iris Xe, UHD… no Chrome e no Edge): o jogo já abre sem compilação paralela, sem esperar um travamento
  (`GpuCheck.noParallelFor`). No notebook Iris Xe, a placa travou até o Windows reiniciar o driver (a tela piscou) antes de o
  Chrome bloquear o WebGL. `?paralelo=1` liga a compilação paralela mesmo assim.

## Plantas de longe, aves, helicóptero e o atlas dos props (novembro/2026)

Continuação do mapa de polígonos (depois dos personagens low poly): o que ainda era desenho 2,5D virou polígono, e a vegetação
ganhou nível de detalhe pela distância, como nos motores atuais.

**Plantas com menos detalhe longe** (`render/Trees3D.js`, `?plantalod=0` desliga para comparar):
- cada malha de planta (uma por espécie e célula, com instâncias) ganha uma gêmea de LONGE com o mesmo conjunto de instâncias: o
  modelo no detalhe −1 (um terço dos cachos da copa, maiores; troncos com metade dos lados; pedras na icosfera simples);
- a troca é feita 5 vezes por segundo pela distância da câmera à borda da célula: além de 70 u (× 0,65 no Low, 0,85 no Medium,
  1,3 no HD) entra a de longe, com 10% de folga na volta para não piscar;
- a vegetação rasteira (tufos, capim, samambaia, cascalho, lixo) some além de 45 u (mesma escala);
- a troca usa `isVisible`, não `setEnabled`: as lojas e interiores ligam e desligam as malhas da cidade com `setEnabled`.

Medição (SwiftShader, Medium, o MESMO quadro com `Trees3D.lodOn` ligado e desligado na mesma sessão — ligado/desligado/ligado; duas
aberturas diferentes não servem: na mata o terreno ainda está chegando e o mesmo lugar variou de 1,7 a 2,2 milhões de triângulos):

| Cena | Triângulos (com → sem) | Desenhos | Quadro |
|---|---|---|---|
| mata | 1,44 M ← 1,72 M (−16%) | 217 ← 232 | −9% |
| favela | 1,27 M ← 1,54 M (−17%) | 263 ← 281 | −8% |
| centro | 1,22 M ← 1,28 M (−5%) | 290 ← 291 | igual (poucas plantas) |
| Lagoa | 0,89 M ← 1,63 M (−46%) | 273 ← 325 | −15% |

**Aves em 3D** (`world/Birds.js` + `art/Animals3D.js`, espécie `ave`): pombo, gaivota, rolinha e bem-te-vi viraram modelos de
~670 triângulos (corpo, cabeça, bico, olhos, rabo em leque, pernas e as asas), uma malha por espécie com instâncias. A asa é
modelada aberta e o shader a dobra no corpo (encolhe, gira para trás, deita no lombo e desce até o rabo) quando a ave está pousada,
e abre e bate no voo (o pombo bate rápido, a gaivota bate e plana, pousando todas batem rápido); a cabeça bica, as pernas andam e
recolhem no voo. A sombra é a de verdade (mapa de sombras). Tamanho perto do real (o pombo com ~0,4 m). O atlas `birdsHD`
(9,4 MB) não existe mais; `?bichos=2d` volta aos sprites.

**Helicóptero sem textura**: o corpo e os rotores já eram o modelo 3D (`CarArt3D`); o disco borrado e a sombra agora também são
polígonos (`HeliArt.blurMesh`: anéis com cor e transparência por vértice, o rastro escuro atrás de cada pá; `HeliArt.shadowMesh`:
uma grade de 0,27 m com a silhueta do corpo e do disco na transparência dos vértices, lida uma vez de um canvas pequeno que é jogado
fora). A carga da polícia também deixou de desenhar o corpo e as pás 2D que ninguém usava: −4 texturas de ~3 MB.

**Atlas dos props sob demanda** (`PropSprites.lazy`): com as árvores 3D, nenhum quad do mapa usa o atlas dos props (conferido na
favela, centro, Lagoa e mata: zero malhas). Ele só é montado se algum tipo sem modelo 3D pedir o desenho — e a mancha do chão
(`stain`) ganhou modelo (`Trees3D`, duas poças rasas e restos chatos), então nenhum pede. −23,4 MB (`propsHD`).

**Total**: ~45 MB a menos de textura na memória de vídeo (propsHD 23,4 + birdsHD 9,4 + helicóptero ~12,5), com o mesmo visual.
Teste: `tests/77_poligonos.test.cjs` (aves dobrando/abrindo/batendo a asa, helicóptero sem textura, atlas não montado, plantas de
longe no modelo leve e a rasteira sumindo longe).

## Telhados em polígonos (novembro/2026)

`render/Roofs3D.js` (`Config.art.roofPoly`; `?telhados=2d` volta às texturas). As 27 texturas `hd_roof` (~32 MB no High) saem.

- **Relevo de verdade** nos painéis de ~2 × 2 u (instanciados: o modelo vai à placa uma vez por tipo e nível): telha colonial em
  fiadas com a boca da telha, telha plana/ardósia/cedro com as juntas desencontradas, zinco ondulado, chapa com junta em pé, lona com
  rugas, manta em faixas, telhado verde. O acabamento (tom de cada telha, musgo, ferrugem e escorridos, tábuas da fôrma, juntas,
  desgaste da tinta, brita) é pintado no shader pela posição, sem textura; `Roofs3D.shade = 0` desliga para medir.
- **Peças em cima** (instâncias): pneus, pedras e tijolos no zinco, cordas na lona, respiros e alçapão na manta e no concreto, vasos,
  mesas com guarda-sol e cadeiras na laje do Mirante, baldes e tijolos na laje crua, arbustos no telhado verde, claraboia na chapa.
- **Nível de detalhe por painel**: baldes de 24 u em três faixas pela câmera — perto (30 u × o preset) o relevo inteiro e as peças;
  meio (95 u) o relevo simples; longe UMA placa lisa por telhado (as lajes são só a placa a qualquer distância).
- As malhas mudam de lugar com a câmera, então ficam fora da grade estática do `RenderCuller` (`_cullAlways`) — arquivadas pela caixa
  da carga, o painel de perto sumia em outras regiões.

**A primeira versão era cara**: cada telhado longe era um painel liso por 2 × 2 u — dezenas de milhares de instâncias de 2
triângulos (só a laje de concreto do centro somava 14.848). Medido na mesma sessão (telhados à mostra × escondidos, SwiftShader, Medium):

| Cena | Texturas | Painéis lisos (1ª versão) | Placa por telhado |
|---|---|---|---|
| favela | ~110 ms | ~575 ms | ~112 ms |
| centro | ~0 | ~725 ms | ~96 ms |

Com a placa, os telhados em polígonos custam o mesmo que as texturas, com relevo de perto e 32 MB a menos. Teste:
`tests/78_telhados.test.cjs` (sem textura, números, as faixas acompanham a câmera e o painel de perto é desenhado depois de andar).

## Fachadas em polígonos (novembro/2026)

`render/Walls3D.js` (`Config.art.wallPoly`; `?fachadas=2d` volta às texturas). As texturas pintadas das fachadas saem — por estilo,
o ladrilho de dia (`facade_*`), o da luz da noite (`win_*`) e o do relevo (`relief_*`), 480 px cada no High.

- **A parede é pintada no shader** (`Wall3DPlugin`), sem textura: a UV da parede vira a GRADE DAS JANELAS (u = baia + posição na
  baia, v = andar + posição no andar, com um deslocamento inteiro por lado do prédio) e a cor do vértice é a cor PRÓPRIA de cada prédio,
  sorteada da paleta do estilo — o mesmo estilo não se repete igual em duas casas vizinhas.
- **64 estilos** (eram 48 texturas, quase todas variações de cor): 14 materiais de parede (reboco pintado, reboco descascando sobre o
  tijolo baiano, bloco aparente com pilar e viga de concreto, tijolo, concreto de fôrma, pele de vidro, chapa ondulada, tábua, pedra,
  enxaimel, pastilha, azulejo português, granito, taipa), 14 tipos de janela (grade, vitrô basculante, folha de madeira, veneziana,
  escritório, janelão, colonial com arco, de correr de alumínio, em fita, de galpão, cobogó, tábua pregada, a mistura da favela) e 6
  térreos (porta, porta de aço com pichação, portaria de vidro, garagem, portão, a mistura da favela). Os bairros misturam estilos
  (o centro tem torre de vidro ao lado do prédio de reboco e do de pastilha).
- **Peças em 3D** (instâncias de 9 modelos): moldura com o vão (a janela fica de fato recuada; a moldura tem largura fixa em
  qualquer tamanho — os cantos de dentro entram 8 cm no vertex shader), peitoril, verga, venezianas, ar-condicionado (split com
  suporte e o de janela), toldo listrado, sacada (laje e guarda-corpo de vidro, grade de ferro recortada no shader ou mureta), floreira
  com flores, brise (aleta vertical e lâmina horizontal), marquise, caixa da porta de aço, cano de descida, relógio de luz com o fio.
  O lado colado no vizinho (as casas geminadas da favela) não ganha peça até a altura dele.
- **O hash inteiro** (`Walls3D.ih` no JS e `w3i` no shader, a mesma conta exata) decide cada janela: o tipo na mistura da favela, a
  folha fechada, a grade, o ar, o toldo, a sacada, a porta do térreo. O desenho e a peça 3D sempre combinam, e o desenho fica embaixo
  da peça: quando ela some de longe, a moldura, o peitoril, o ar e as venezianas continuam desenhados no lugar.
- **Nível de detalhe** por balde de 24 u, como nos telhados: perto (34 u × o preset) todas as peças; meio (95 u) só as grandes (toldo,
  ar, sacada, brise, cano, marquise); longe só as sacadas e os brises (a silhueta das torres). As fatias de cada balde são geradas na
  primeira vez e guardadas (as ~200 mais recentes de perto e do meio).
- **O vidro reflete o céu** num termo próprio (não multiplicado pela luz do sol): a janela do lado da sombra continua clara de dia,
  como de verdade, e o reflexo some à noite.
- **À noite**: cada janela acende pela hora (`WindowLights.state`, casa ou escritório), com a luz dela (quente, neutra, fria ou a TV
  piscando), o teto mais claro, o abajur, a cortina, o vulto dos móveis; o escritório com a linha das luminárias e as mesas; a luz
  vaza na parede em volta; a portaria fica acesa e a lâmpada da porta acende em algumas casas.

**Medição** (SwiftShader, Medium, na mesma sessão: as paredes ou as peças escondidas × à mostra; as cenas do `Bench`). As texturas das
fachadas somavam 64 no Medium (~19 MB; o triplo no High) e saem todas:

| Etapa | Favela: paredes | Favela: peças 3D | Centro: paredes | Centro: peças 3D |
|---|---|---|---|---|
| Texturas (antes) | ~5–140 ms (ruído) | — | ~0 | — |
| 1ª versão (um shader com tudo; peças com sombra e sacadas no mapa inteiro) | ~433 ms | ~203 ms | ~0 | ~62 ms |
| Um shader por estilo, peças sem sombra e com limite | ~276 ms | ~49 ms | ~55 ms | ~33 ms |
| Menos ruído e as janelas numa conta só | ~250 ms | ~50 ms | ~80 ms | ~23 ms |
| **Atlas das janelas** (uma leitura no lugar das contas) | **~80 ms** | ~0–50 ms | ~12 ms | ~18 ms |

As medições oscilam ±50–100 ms de uma rodada para outra (o quadro do software é longo). O ATLAS DAS JANELAS (`Walls3D.atlas`: 1024 ×
512, 21 desenhos de vão em ladrilhos de 128 px — grade, basculante, folha de madeira aberta/fechada/meio aberta, veneziana, escritório,
janelão, colonial com o arco, de correr com e sem grade, fita, galpão, cruz, tábua pregada, porta de madeira, porta de aço, portão,
portaria; R = barras, G = o que cobre o vão, B = o sombreado, A = fora do arco; desenhado em JS na carga, ~2,7 MB com os mipmaps) troca
as contas de caixilho, grade, tábuas e chapa por UMA leitura de textura: a parede da favela — o pior caso, a câmera no beco com quase a
tela toda de parede — caiu de ~250 para ~80 ms, na faixa das texturas de antes.

### Um shader por estilo (a lição da medição)

A primeira versão tinha UM shader de parede com os 14 materiais e os 14 tipos de janela escolhidos por uniform (`if`). Na GPU de
verdade um `if` num uniform é barato, mas o renderizador por software (SwiftShader — a referência das medições) executa TODOS os ramos
em cada pixel, com máscara: a parede da favela custava ~440 ms por quadro contra ~70 ms com o código tirado pelo pré-processador
(`Walls3D._lite`), e desligar o desenho pelo uniform (`Walls3D.shade = 0`) não mudava nada. Em celular, um shader enorme também pesa
(registradores). Agora cada estilo compila SÓ o que usa: o material (`W3FAM`), os tipos de janela e de porta e os detalhes
(peitoril, verga, ar, pichação, pilar) viram `#define` — 32 variantes para os 64 estilos, compiladas na tela de carga
(`Walls3D.precompile`, e não na hora em que o bairro novo aparece). O mesmo vale para os telhados (`ROOFK`) e o chão (`GVKIND`).
Também caíram os ruídos por pixel (o mesmo ruído serve ao tom, à mancha e à rachadura do reboco; pilar e escorrido por sorteio), as
peças deixaram de projetar sombra em tempo real (o mapa de sombra redesenhava as milhares de instâncias) e as sacadas e brises
longe têm limite (240 u × o preset; antes as torres de luxo do outro lado do mapa entravam no desenho).

## Luz mais realista (novembro/2026)

- **Sombra de contato assada** (`WorldBuilder._contactAO`, `Config.light.contactAO`): uma faixa escura e macia de 1,1 u no chão em
  volta do pé de cada prédio (alfa no vértice, cantos em leque), na altura do chão em volta (calçada, pátio ou rente ao morro). O céu
  não chega no pé da parede: o prédio "senta" no chão. Zero custo de luz por quadro (sem luz, sem névoa, sem receber sombra).
- **A cor da lâmpada pelo bairro**: vapor de sódio laranja na favela, na zona industrial, no porto e no campo; LED branco (frio ou
  quente) no centro, no comércio, na orla e na Lagoa; nos bairros, a mistura das duas. A cor vale para o difusor da luminária e para a
  luz no chão (`NightLights`).
- **A luz do térreo no chão**: a lâmpada da porta (a mesma que o shader da fachada acende) e a portaria acesa entram no campo de luz
  da noite — a calçada em frente fica iluminada.
- **O vidro reflete o céu** independente do sol (ver as fachadas) e a luz das janelas vaza na parede em volta.

## O chão sem planejamento (novembro/2026)

`render/GroundVariety.js` (`Config.art.groundVariety`; `?chao=0` desliga). Um MAPA DE ZONAS de 256 × 256 sobre o mundo inteiro
(~10 u por texel, montado na carga pelo bairro de cada quadra, com ruído): a idade do asfalto, as zonas de paralelepípedo, o tipo de
calçada de cada quadra e a sujeira. O shader do chão (por tipo, `GVKIND`) pinta por cima da textura de hoje: asfalto novo e preto ao
lado do velho cinza e rachado (o couro de jacaré), REMENDOS retangulares (asfalto novo e cimento, com a junta), a brita aparente; ruas
de PARALELEPÍPEDO em fiadas; a calçada de placas de cimento, de LADRILHO HIDRÁULICO sextavado, de PEDRA PORTUGUESA em ondas (a da
orla) ou de cimento quebrado com terra e mato nas frestas; terra batida com manchas úmidas, brita solta e pedrinhas; areia com as
ondinhas do vento; cimento com juntas e rachaduras; grama com manchas secas. As faixas pintadas da rua ficam. Custo medido na mesma
sessão (com × sem o código, pelo pré-processador): favela ~0 (ruído), centro ~70 ms (~5%), mata ~0.

## A mata de longe e a água (novembro/2026)

- **Manto de copas** (`Trees3D`, terceiro nível de detalhe): além de `LOD.manto` (140 u × o preset) a planta vira a copa numa bolha
  só, sem tronco nem cachos (20 triângulos por bolha) — de longe a mata é um manto. Não projeta sombra (fica além da janela dela).
- **Reflexo da água só de perto** (`Water.NEAR`, 60 u): o espelho desenha só o que está em pé perto da água que aparece na tela (uma
  grade 7 × 7 do chão visto); o resto da água reflete o céu pelo shader. As peças miúdas das fachadas ficam fora do espelho.

## O resto em polígonos (novembro/2026)

O inventário da memória de vídeo (todas as texturas da cena, com tamanho e quem usa) mostrou o que ainda era DESENHO: os atlas 2D de
carros e de personagens (todos já são 3D), as vitrines das lojas, o calçadão, o gramado do estádio, a seta de saída dos interiores,
os esconderijos, as casas de máquinas, o barraco do protagonista por fora, a torcida do autódromo e a sombra do avião. Agora:

- **Atlas 2D fora da placa.** Carros (`CarArt`: 3 texturas de 1024², ~16 MB) e personagens (`CharArt`: 2048 × 1936, ~15 MB) não
  sobem mais na carga: a miniatura do HUD sai da CPU e o atlas só vai para a placa se algum desenho 2D for de fato pedido (o lote 2D
  de carros no primeiro ator 2D; o de personagens quando um quad vetorial aparece na tela — `CharArt.need`, que decodifica de novo no
  Worker).
- **A porta do carro 3D em 3D** (`CarDoors`): a folha na cor do carro (colunas, moldura, vidro escuro, maçaneta) gira na dobradiça
  da frente, e o vão mostra o interior (soleira, assento, encosto). Duas malhas com instâncias para todas as portas abertas.
- **Vitrines em polígonos** (`render/Shops3D.js`, `Config.art.shopPoly`; `?lojas=2d` = o atlas pintado de 2 × 1800 × 864, ~16 MB):
  a frente de loja SALIENTE da parede — pilares e verga na cor da loja, rodapé de granito com a pingadeira, duas vitrines com o
  caixilho de alumínio e o montante, e o vidro afastado do fundo: atrás dele a sala (o fundo, a bancada, duas prateleiras com a
  mercadoria em caixinhas coloridas) aparece com paralaxe de verdade. A porta de vidro com o puxador e a soleira. Em cima, o LETREIRO,
  uma caixa de luz saliente na cor da loja, com a moldura, o ícone e o nome — só o texto é textura (`shopText`, 512 × 1024 em
  luminância + alfa, ~1,3 MB com os mipmaps). A oficina tem o portão de enrolar (as lâminas em degrau, o rolo, a luz escapando
  embaixo). À NOITE a sala, a mercadoria e a caixa do letreiro acendem pelo alfa do vértice (`ShopGlow`) e o nome pelo
  `WindowLights`. As baias do térreo atrás da loja ficam sem peça da fachada (`Walls3D`). As lojas entram nos pedaços de 64 u dos
  acabamentos (só os que tocam a tela são desenhados); as caixinhas de dentro têm só a frente e o topo.
- **Superfícies no shader** (`render/ProcSurf.js`, `Config.art.procSurf`; `?superficies=2d` = as texturas): o CALÇADÃO (as ondas de
  pedra portuguesa preta sobre a branca, as pedrinhas e o rejunte; era 512 × 768), o GRAMADO DO ESTÁDIO (as faixas do corte e as
  linhas do campo em distância, nítidas de perto; era 640 × 480) e o BARRACO por fora (o bloco com o reboco caído aos pedaços, a chapa
  de zinco ondulada com as emendas e a ferrugem escorrida, as tábuas pintadas e descascadas, o telhado de zinco, o vidro e a porta; os
  pneus, as pedras, as ripas, a caixa-d'água e o "gato" da luz do telhado viraram peças 3D).
- **Em 3D**: os ESCONDERIJOS (a caçamba com a base, as rodinhas, as duas tampas com nervuras, o puxador e o lixo na fresta; os caixotes
  com as tábuas em relevo, a moldura, a travessa em X e as quinas de metal; o latão com os aros e a tampa — no lugar das laterais
  lisas com o topo pintado), as CASAS DE MÁQUINAS (a chapa, os montantes, a tampa com aba, a veneziana, a portinhola, a grelha de
  exaustão), a TORCIDA do autódromo (cada pessoa sentada: o tronco na cor da camisa, a cabeça, o boné de alguns, os braços para cima
  de outros, no banco colorido), a SETA DE SAÍDA dos interiores (o halo, a sombra, o contorno branco, o corpo em degradê; só a palavra
  "SAÍDA" é textura, 256 × 80) e a SOMBRA DO AVIÃO (a silhueta — fuselagem, asas, empenagem — com a borda macia, no lugar da mancha
  redonda).

**Medição** (SwiftShader, Medium, centro, as malhas das lojas escondidas × à mostra, na mesma sessão): com o atlas, ~97 ms de dia e
~0 à noite (ruído); em polígonos, ~65 ms de dia e ~0 à noite — empate dentro do ruído (±50–100 ms num quadro de ~1,4 s), com a
memória das vitrines caindo de ~7 MB (Medium; ~16 MB no High) para ~1,4 MB. As 745 lojas somam ~350 mil triângulos no mapa, mas em
pedaços de 64 u: na tela entram só as de perto.

**Bug antigo corrigido no caminho**: o GRAMADO do estádio nunca aparecia com o relevo ligado. O piso do estádio (o disco azul, 4 cm
abaixo do campo) é um triângulo grande de chão que o MeshBatch subdivide para seguir o morro, e o gramado era uma malha plana fixa a
0,46 m — ficava enterrado embaixo do disco. Agora o gramado também sai pelo MeshBatch com o relevo.

**O que continua textura, e por quê**: o que é ESCRITA ou foto do chão. Os nomes das lojas, das placas de trânsito e de rua
(`roadSigns`), "PARE" e "ÔNIBUS" no asfalto e as marcas de tinta gasta (`roadDecals`), os anúncios e o logo do autódromo, as placas dos
pontos turísticos e o pôster do mototáxi — texto em polígonos seria milhares de triângulos por letra; o mapa do terreno (`TerrainSplat`:
o tipo de chão e a altura de cada célula, é dado, não desenho), as fotos do chão (asfalto, calçada, areia: o `GroundVariety` desenha por
cima), as partículas (spray da água) e os interiores (montados só ao entrar).
