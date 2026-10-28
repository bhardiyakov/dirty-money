# NPCs 2,5D — o pacote de personagens no jogo

Pedestres, Polícia Militar, BOPE, Exército, traficantes **e o protagonista** usam agora os personagens do pacote de NPCs
("GTA 2,5D": vistos do alto a 56°, 8 direções desenhadas, contorno escuro e sombreamento em 5 tons). O pacote veio com 17 fichas
renderizadas por um gerador em Python; o gerador foi **portado para JavaScript** (`tools/asset_baker/generator/`) — dá o mesmo
resultado pixel a pixel (conferido contra os PNGs do pacote) e é com ele que o jogo ganhou animações novas, mais tipos de NPC,
variações de cor e a personalização do jogador.

**Build-time asset baking.** O gerador **não roda no jogo**: `tools/asset_baker/bake.cjs` (Node) renderiza tudo no build e grava
arquivos estáticos em `assets/baked/` — páginas `.webp` sem perdas, manifestos `.json`, as **camadas de dano** e `npc-data.json`
(tipos, variantes, paletas, ficha do jogador). O jogo só carrega e decodifica (WebP num Worker de decodificação). A única exceção é o
**guarda-roupa**: uma roupa de forma nova é desenhada na hora, em Workers com o gerador empacotado (`assets/baked/wardrobe.worker.js`),
que o jogador já veste enquanto ela é desenhada, e guardada no IndexedDB — terminou, os Workers são encerrados (ver *Personalização do jogador*).

## O que tem

| | |
|---|---|
| **Tipos** (`NpcGenTypes.TYPES`) | 17 civis (os 10 do pacote + banhista, corredora, executivo, vovó, skatista, "mano", motoboy), PM e PM feminina, BOPE de capacete e de touca ninja, soldado do Exército, 3 traficantes e o protagonista |
| **Variações** | cada tipo tem 5–10 variantes de cor (pele, cabelo, roupa, calçado, boné). Farda não muda de cor. Mesma forma, outra linha da paleta: não custa memória |
| **Animações** | as do pacote (parado, andando, correndo, soco, chute, armas, cassetete, granada, apanhar, morrer, levantar, mãos ao alto, nadar) e as novas para o que o jogo já fazia: **roubar carro** (puxa o motorista), **abrir a porta**, **entrar no carro**, **assalto** (sacar, anunciar com a arma), **render-se e ajoelhar**, **furto** (carteirada), **arrombar** fechadura, **pular grade**, **pânico** (correr com as mãos pra cima), **cambalhota**, **arremessado no ar**, caído, morto **com poça de sangue**, correr armado (pistola / submetralhadora / escopeta / fuzil / taco), mexer na bolsa, carregar maleta/sacola, puxar mala de rodinhas, andar sobrecarregado, boiar parado |
| **Crime de rua** (`src/npc/StreetCrime.js`) | de tempos em tempos, perto do jogador, um pedestre vira assaltante (visual de traficante), rende outro pedestre (que ergue as mãos e ajoelha) e foge correndo armado. Quem vê foge; derrubar o assaltante liberta a vítima |
| **Jogador** | o protagonista 2,5D. Roupa, boné/chapéu, bolsa e aparência mudam o desenho (ver abaixo) |
| **Golpes** | soco, chute, taco e cassetete com colisão de verdade (ver abaixo); pedestres revidam — no braço, de faca, taco ou revólver (*Quem revida*), a PM usa o cassetete |
| **Briga de trânsito** | parte das batidas entre veículos vira briga: o motorista desce, xinga, chuta a porta e sai no braço (*Briga de trânsito*) |
| **Pilotando** | moto (**64 direções**, o corpo deitando junto com a moto, pés nas pedaleiras e joelhos no tanque, recortado pela moto 3D), scooter (pés no assoalho), bicicleta (pedalando, 32 direções), jet ski e lancha (no timão, 16); moto e jet ski inclinam na curva. O jogador **sobe na moto/bicicleta** passando a perna por cima (dos dois lados). Entregadores: o tipo **motoboy** (capacete, baú vermelho). Quem cai da moto mantém o visual |
| **Proporções de adulto** | o pacote é "chibi" (~3,3 cabeças: parecia criança). As poses continuam escritas no esqueleto do pacote e são **redirecionadas** para um esqueleto adulto na hora de desenhar (`G.ADULT`: pernas ×1,7, tronco ×1,35, braços ×1,38, cabeça ×0,6 → ~5,3 cabeças); objetos 20% maiores; as armas da folha (abaixo) no tamanho de verdade |

`?npc=0` na URL volta tudo aos bonecos antigos (comparar/depurar).

## Proporções de adulto (`G.ADULT`, NpcGenChar + `Pose.adult` em NpcGenAnims)

- **Partes**: cada parte assada é esticada ao longo do osso (pernas, braços, tronco) ou encolhida (cabeça, mãos) — `shapeFor`/`reshape`.
- **Pose**: os ÂNGULOS de cada junta passam para os ossos novos; a pélvis sobe na proporção das pernas (pé no chão continua no chão),
  as pernas em IK são recalculadas (o pé fica à mesma distância lateral, o passo cresce), objetos seguem a mão que os segura, a mão de
  apoio volta a pegar na arma, o que está no chão (sangue) só acompanha o corpo; na água, os ombros ficam na mesma altura.
- Membros marcados em `pose.abs` (pilotar, subir na moto) têm o alvo do IK já no espaço adulto. `G.ADULT = null` = desenho do pacote
  (é o que `validate.html` compara).
- Escala no jogo: `Config.art.npcPpu` = 26 px/m (= `NpcGenBuild.PPU`): adultos na mesma escala dos veículos (que são 1,3× o real).

- **Postura e silhueta** (outubro/2026): `G.ARM_ABD = 0,6` fecha os braços nas poses FK de descanso (abdução ≤ 18°: parado,
  andando, correndo — sem o ar de "gorila"); `ADULT.head = 0,72` (era 0,6, depois 0,66: de cima, o rosto e o cabelo dizem quem é quem; 0,72 com as expressões); corpo
  feminino com ombros 0,84, braços 0,8 e quadril 1,08 (`bodyFactors`) e, na malha, braços 20% mais finos (`fitFor('f')`).
- **Visual 3D, sem contorno** (outubro/2026, `G.LINES = false`, `G.TOON = null`; o padrão até o estilo cartum, abaixo): o renderizador não desenha mais o contorno preto em volta
  do boneco nem os traços onde uma parte passa na frente da outra (viram sombra de contato macia); a sombra no chão sai em degradê
  (alfa); e o pixel de borda guarda a fração coberta (dos 2×2 subpixels) nos 2 bits baixos da luz — o shader vira isso em alfa, então a
  silhueta sai suavizada, como um render 3D. De perto, a ampliação fica lisa (`sharp` até 1,6, sem os "quadradinhos" de pixel art).
  `G.LINES = true` volta ao desenho cartunesco com traços.
- **Redução no jogo** (`NpcArt`, uniform `mini`): com o boneco menor que o atlas (texels por pixel > 1,3 — dirigindo, celular), o
  shader tira a média de n×n amostras sobre a pegada do pixel (até 4×4) em vez do bilinear de 4 amostras, que serrilhava e tremia.

## Estilo cartum (o padrão desde outubro/2026)

Os bonecos seguem uma arte de referência "cartum HD" (contorno escuro, cores chapadas, rosto marcado), com as mesmas proporções de
adulto. Tudo no gerador (`NpcGenCore`: `G.LINES = true` e `G.TOON`; o desenho em `NpcGenRender._smooth`):

- **Luz em 3 faixas chapadas** (sombra, base, luz — `dark`/`lit`, passagem de `soft` de largura) em vez do degradê contínuo; as mechas e
  costuras por cima, fracas (`tex`); brilho só em material duro (metal, couro, lente, capacete — `toonShine`); pixels soltos limpos.
- **Contorno externo suavizado** (`_toonOutline`, `outline` = 1,75 px na alta): a distância de cada pixel à silhueta, medida nos
  subpixels, vira o alfa da borda de fora — ampliado no jogo (zoom, telas de alta densidade), o contorno sai liso, sem degraus. Onde uma
  parte passa na frente da outra, traço escuro de 1 px.
- **Rosto**: olhos e sobrancelhas × `face` (1,4, `makeTexHead`) e a cabeça erguida 10° (`ADULT.headUp`, em `Pose.adult`) — com a câmera
  a 56°, o rosto aparece ~25% mais alto. Em alta (2×2 subpixels), olho, boca e sobrancelha ganham o pixel com metade dele coberta
  (`DECAL_MIN2`; os mínimos de 4×4 nunca davam e o rosto se apagava na pele).
- **Expressões** (`NpcGenChar.FACES`, `NpcGenAnims.exprOf`): a cabeça assada guarda, além do rosto da ficha (`eyes`: `neutral` ou
  `angry`, o jeito parado de cada um), uma variante por expressão — os mesmos pontos, só o material e o tom (`faces` da parte, também com
  o dano pintado) — e o renderizador usa a do quadro (`pose.expr`, marcada em `clipPoses`):

  | expressão | rosto | clipes |
  |---|---|---|
  | `angry` | cara fechada | de arma na mão (parado, andando, correndo, agachado), mirar, sacar, passo lateral, granada/molotov armados, cassetete |
  | `rage` | sobrancelhas em V baixas, olhos apertados, dentes trincados | soco, chute, taco, faca, atirar, render alguém, arremessar, roubar carro |
  | `scared` | olhos redondos arregalados, pupila pequena, sobrancelhas erguidas, boca em "O" | fugindo em pânico, render-se, ajoelhado, mãos ao alto, arremessado |
  | `pain` | olhos espremidos "> <", sobrancelhas franzidas, boca aberta | apanhando, levantando, academia, carregando peso, escalando |
  | `closed` | olhos fechados | caído; morrendo (dor e depois fechados); cambalhota: medo e depois dor |

  Máscara e touca escondem a boca (e os dentes); óculos escuros, os olhos. Outro clipe ou expressão: a tabela `EXPR` em `NpcGenAnims`.
- Sombra no chão macia, como no visual 3D. O formato dos atlas não muda (código + luz; o contorno é cor fixa com alfa de 8 bits).
- Comparar com o visual anterior: `tools/asset_baker/preview.html?estilo=3d`. Mudou alguma coisa aqui? `npm run bake` (todos os tipos).
- O tamanho manda: o atlas tem 52 px/m (~90 px por adulto). Na tela, a pé, no zoom padrão (o enquadramento "pixel a pixel" do chão,
  `fitPixelScale`, × `footZoom`) um adulto tem ~40 px de altura numa tela 1080p; no zoom máximo, ~130 px. Rosto e detalhes só aparecem
  de perto. Mais nitidez ampliado pede atlas maiores (k = 1,5: 2,25× a memória de vídeo e o download, e o guarda-roupa mais lento).

## Corpo da malha 3D (`NpcGenMesh`, `assets/npcs/malha3d.js`)

O corpo de todos os personagens (NPCs e jogador) vem do **personagem realista 3D** (pacote "personagem_3d_realista", MakeHuman, CC0:
masculino e feminino, portes magro/forte/gordo, 11 cabelos) e não mais das formas geométricas — mas continua pixel art pré-renderizada e
cartunesca:

- **Extração** (`tools/personagens3d/`, `http://localhost:8123/tools/personagens3d/` → *Salvar malha3d.js*): lê `fonte/personagens_masc_fem.glb`,
  põe na pose de repouso do jogo (braços quase caídos, **mãos em punho** para segurar arma/guidão/bolsa), converte os pesos de skin dos 65
  ossos Mixamo para os 15 do gerador, simplifica o corpo (~17 mil → ~3,5 mil triângulos) e guarda as texturas pequenas (alfa dos
  cartões de cabelo, dobras da roupa). Os cabelos vão uma vez só (os da feminina são os mesmos ajustados à cabeça dela).
  A página compara lado a lado o geométrico e a malha (tipo, clipe, porte, cabelo, alta definição).
- **Encaixe** (`fitFor`): cada osso da malha é levado ao osso do esqueleto cartunesco — ao longo do osso pelas juntas (o cotovelo da
  malha cai no cotovelo do boneco), na seção pela parte geométrica que ele substitui (tronco medido num corte na altura do peito e da
  cintura, para colete, mochila e alças continuarem servindo). A cabeça tem duas escalas (crânio maior, rosto mais curto) e os olhos da
  malha caem onde o rosto é pintado: olhos, sobrancelhas, boca, barba, óculos e máscaras continuam sendo as texturas procedurais da ficha.
- **Amostragem**: pontos na superfície dos triângulos (densidade igual à das formas assadas), cada um com o osso principal e o 2º osso
  + peso → o renderizador faz **skin de 2 ossos** (`skinPose` em NpcGenRender): cotovelo, joelho, ombro e pescoço dobram sem fresta.
- **Roupa da ficha sobre a malha** (camiseta + jeans + tênis): manga longa pinta o braço, regata tira a manga, bermuda mostra a canela
  (com meia), bota sobe na canela, chinelo vira pé, luvas, relógio; estampas, zíper, gola, colete, mochila, chapéu: como antes.
- **Porte** (`body`): magro/normal/forte/gordo = morphs Magro/—/Forte/Gordo da malha. `gender: 'f'` = corpo feminino.
- **Cabelos da malha**: `short` (curto clássico), `buzz` (raspado), `curly` (crespo curto), `long`, `ponytail` e os novos `side`
  (repartido), `quiff` (topete), `pixie`, `bob` (chanel), `bob_fringe` (chanel com franja), `braid` (trança). Os outros estilos
  (espetado, black power, coque, moicano, dreads) continuam geométricos. O corte do chapéu vale para os dois.
- Desligar: `G.MESH3D = false` (ou `mesh3d: false` numa ficha) volta às formas geométricas. Sem `malha3d.js`, idem (os estilos novos
  viram cabelo curto).
- Custo: ~270–410 mil pontos por boneco (o geométrico: ~380 mil). O skin pula o 2º osso nos pontos de costas para a câmera (que são
  descartados): por quadro, a malha sai no mesmo tempo do geométrico ou menos. Os atlas prontos não mudam de tamanho. `malha3d.js` tem 2,2 MB.

## Sombreado "pré-renderizado" e alta definição

- **Sombreado contínuo** (`NpcGenRender._smooth`, padrão; `G.SHADE = 'cel'` = os 5 tons do pacote): cada pixel ganha uma LUZ —
  difusa suave + céu + oclusão ambiente (dobras e axilas escurecem) + luz de recorte nas bordas + o desenho das texturas + brilho
  especular por material (`SHINE`: couro, cabelo, capacete e metal brilham; algodão e jeans não). Linhas finas de desenho onde uma parte
  passa na frente da outra (contorno escuro) ou o material muda com degrau (a cor escura do próprio material).
- **Formato 2 do atlas** (2 bytes por pixel, como antes): material × 8 + nível de água, e a luz (64 níveis). O shader do jogo
  (`NpcArt`) anda pela rampa de 5 tons da paleta conforme a luz — as variantes de cor continuam saindo da paleta, de graça.
- **Alta definição, sempre** (`Config.art.hd`): os atlas assados já saem com o **dobro da resolução** (`HD_K` = 1: 52 px por metro);
  os visuais do guarda-roupa, idem.
- **Atlas em PÁGINAS de até 4096 px de lado.** O jogo endereça cada quadro como x·4096 + y (exato em float). `NpcGenBuild.packPages`
  separa os quadros por grupo de clipes (`GROUPS`: hot = parado/andar/correr/armas, act, fall, water, car, gym; arm = os clipes `lazy` de um tipo — a faca, o revólver e o taco dos civis) e paridade da direção
  (pares / ímpares), páginas de até ~8 Mpx; todas as direções de uma paridade de um clipe ficam na mesma página (o quadro seguinte,
  `fr2`, sai da mesma textura). Formato dos arquivos: cabeçalho de `tools/asset_baker/bake.cjs`.
- **Dano pintado** (1 sujo, 2 machucado, 3 muito machucado — `NpcGenMesh.paintDamage`): o dano só repinta a roupa e a pele, então cada
  nível é uma CAMADA do tamanho da página base (`<tipo>/d<n>p<i>.webp`), com o pixel machucado onde ele muda e (0, 0) no resto —
  quase vazia, poucos KB a centenas de KB. Só os clipes do dia a dia machucado têm camada (`npc-data.json` → `dmg`); o atlas
  `<tipo>#d<n>` (`NpcArt.dmgAtlas`) usa os mesmos retângulos da base e a página = base + camada, juntadas no Worker de decodificação.

## Pilotando (`ride_*`, `mount`)

O veículo é 3D (`CarArt3D`, `assets/cars/veiculos3d.js`) e o piloto 2,5D vai por cima com a origem no **banco** do modelo. Mãos e
pés vão nas manoplas, pedaleiras, assoalho, pedais e timão do modelo: `RIDE` em NpcGenAnims (medidas em m no jogo tiradas da malha —
moto = a CG 160, scooter = a PCX, bike = a bicicleta urbana — × `Config.vehicle.scale` × `Bikes.SCALE` = 1,17, `VEH_K`). Mudou a
escala de um veículo, o `npcPpu` ou a malha? Ajuste `RIDE`, rode `node tools/asset_baker/vehocc.cjs` e gere os atlas de novo.
As folhas antigas `rider`/`courier` viram tipos 2,5D sozinhas (`NpcArt.attach`); variante 0 = o jogador (a folha dele).

**Piloto colado na moto 3D** (outubro/2026):
- **Inclinação**: `ride_moto` tem 7 degraus (+28,6° … 0 … −28,6°, `rideBank`) e cada um é a pose reta INTEIRA (pélvis, tronco, mãos nas
  manoplas, pés nas pedaleiras) girada em volta do eixo da frente que passa no **banco** (a origem do desenho). A moto 3D deita o mesmo
  ângulo em volta da linha das rodas (`CarArt3D`: bank = inclinação × 0,5 rad = `RiderActor.BANK` = `RIDE_BANK`), **na hora** — com
  piloto, sem a mola que atrasava e passava do ponto — e o `RiderActor._place` põe a origem do piloto no banco **já deitado e
  empinado** (a mesma conta da matriz do modelo). Antes o piloto deitava ~12° só na pélvis enquanto a moto deitava ~29° com mola: o banco
  escorregava de baixo dele nas curvas.
- **Ângulo da curva pela física**: atan(velocidade × giro / g) — a curva que está acontecendo, não o guidão (`Vehicle._animateBike`). A
  bicicleta deita 20% disso (o ciclista pedalando não tem degraus de inclinação).
- **Direções**: a moto 3D gira livre; o piloto tinha 16 direções (22,5°) e ficava torto em relação ao guidão entre uma e outra. Agora
  `ride_moto` tem **64** (desvio máximo ~4°, com a histerese) e `ride_bike` 32 (`dirs` na tabela `CLIPS`).
- **Pernas encaixadas**: os pés vão nas **pedaleiras da malha** (antes ficavam ~25 cm acima, com os joelhos dobrados e abertos para
  fora — 29 cm do meio) e os joelhos para a frente, fechados no tanque (`RIDE.moto.knee`). Scooter: clipe próprio, `ride_scooter`
  (sentado reto, pés à frente no assoalho, atrás do escudo) — o `RiderActor` escolhe pelo modelo.
- **Recorte pela moto** (`pose.occ`, `NpcGenRender._occBuf`): o piloto é desenhado POR CIMA da moto no jogo, então o que a moto
  esconde daquele ângulo não podia aparecer — a perna do outro lado atrás do tanque e do motor, o meio das coxas atrás do tanque e do
  farol (vindo de frente), os pés atrás do escudo da scooter. O gerador desenha a carroceria 3D (`generator/veiculos_occ.js`, tirada
  do `veiculos3d.js` por `tools/asset_baker/vehocc.cjs`) só na profundidade, no banco e deitada como a moto daquele quadro: ponto do
  corpo atrás dela não entra. Um clipe serve a várias motos (`ride_moto`: CG, trilha, esportiva e custom) — vale a **interseção** das
  carrocerias (só some o que todas escondem: nunca abre buraco no piloto de nenhuma) e também a de alguns rumos em volta do desenhado
  (`sweep`: a direção do sprite fica até ~0,7 passo fora do rumo da moto), com 1 subpixel de erosão na borda.
- **Subida** (`mount`): termina EXATAMENTE na pose de pilotar, no banco da moto 3D (antes o banco ficava no chão e o piloto pulava
  ~1 m para cima ao terminar), a perna passa por cima do banco por trás, e o recorte esconde o que fica atrás da moto. O jogo tira a
  moto do descanso (em pé) e desenha o jogador no rumo exato dela (`Player.startMount`, sem a histerese da direção).

**Física da moto do jogador** (`Bikes.MODELS`, `Vehicle.accelOf`, `Config.vehicle.bikeLat`/`bikeLeanIn`): arrancada pelo 0–100 do
modelo (`t100`, como nos carros — antes era `power/mass`: a moto de rua ia de 0 a 100 em ~1,7 s e a esportiva em ~1 s) e freio de no
máximo `brakeA` (~1 g; antes passava de 3 g). Na curva, a aceleração lateral (velocidade × giro) não passa de `bikeLat` (20 m/s², ~2 g,
arcade) e o giro entra e sai com `bikeLeanIn` (o tempo de deitar a moto) — antes o giro era o do guidão em qualquer velocidade (a 100 km/h,
~8 g). Com 0,9 g (o valor real) a moto ficou dura demais: a 65 km/h pedia 48 m de raio e não fazia esquina; com 2 g, 19 m (50 km/h: 11 m).

| | 0–100 km/h | máxima | freio |
|---|---|---|---|
| Rider 250 (moto) | 8,0 s | 112 km/h | 9 m/s² |
| Urban 160 (scooter) | — (0–86 em 11 s) | 86 km/h | 8 |
| Trilheira 300 | 7,9 s | 108 km/h | 8,5 |
| Furia 1000RR (esportiva) | 3,3 s | 158 km/h | 10,5 |
| Estradeira 1800 (custom) | 5,5 s | 122 km/h | 9 |
| Bicicleta | — (~1,5 m/s² pedalando) | 29 km/h | 5 |

## Golpes corpo a corpo (`Melee` / `Combat.strike`)

Soco, chute, taco e cassetete são **colisões de verdade**, casadas com a animação: durante a janela em que o punho/pé/taco está
estendido (`t0..t1`), a cada quadro uma cápsula vai do peito de quem bate até a ponta do golpe e acerta quem o corpo encostar
(com linha de visada; o taco varre um arco e pega mais de um). Quem apanha cambaleia e é **empurrado**; chute e taco **derrubam**
(Ragdoll: voa, cai, levanta). O jogador vira para o alvo mais perto à frente ao golpear (mira assistida) e também amassa carros.
Quem bate de volta: pedestres **revidam** conforme o temperamento (abaixo — `FightState`: no braço, de faca, taco ou revólver), a **PM
usa o cassetete** de perto (sem armas liberadas) e **traficantes/BOPE/Exército dão soco ou chute** colados em você — o jogador
cambaleia, é empurrado e cai com chute. Golpe de pedestre em pedestre (briga de rua, de trânsito) acerta de verdade: `Combat.strike`
com `foe` (antes, quem não era o jogador só conseguia acertar o jogador).

## Quem revida (`src/npc/Temper.js`, `Config.npc.temper`)

O sorteio é **fixo por pessoa** (o pedestre do pool + o desenho e a cor que ele veste: o mesmo pedestre reage sempre igual); a região
conta na hora da briga — **periferia** = distritos `favela`, `periferia` e `industrial` (`Empire.districtAt`).

| | revida | com quê |
|---|---|---|
| **Homens** | 60% (`men`) | atacado **a mão livre** (soco, chute): no braço. Atacado de **faca, taco ou arma de fogo**: só quem também anda **armado** — dos que revidam, 25% levam faca (`knife`) e 12% revólver (`gun`), × 1,5 na periferia. Armado e levando a pior no braço (vida < 55%) ou vendo o outro sacar, **saca** a dele |
| **Mulheres** | 10% (`women`); **40% na periferia** (`womenPeriphery`) | sempre de **faca ou taco** (55% taco: `womenBat`) |
| Idosos (vovó, senhores grisalhos) | × 0,4 (`oldK`) | |

- Faca ou taco contra **arma de fogo**: só com o atirador colado (`closeVsGun` = 4 m); mais longe, foge. Revólver encara tudo.
- O tipo de agressão vem do golpe que acertou (`NPC.takeDamage(…, kind)`: `punch`/`punchL`/`kick` = mão livre, `stab`/`swing`/`baton` =
  arma branca, `gun` = tiro); atropelamento e explosão não fazem ninguém revidar.
- **Tiro do jogador** conta como ataque com arma para quem ele mirou (a bala passa a < 2,5 m) ou que estava a ≤ 6 m dele, à vista —
  não só para quem a bala pega (um tiro de pistola deixa o pedestre com 20% da vida: ninguém revidaria). Quem anda de revólver (ou de
  faca, colado) saca e responde; o resto foge com o alerta do tiro (`Temper.onPlayerShot`, antes do `alertShot`).
- **Revólver** (`Weapons.revolver`, `owner: 'npc'`): chega até ter a linha de tiro (≤ 14 m), mira 0,45 s e atira (espalhamento × 2,4,
  dano × 0,7); 6 balas e recarrega. Quem ouve, foge (`alertShot`).
- **Desenho**: os civis ganharam `idle/walk/run/stab:knife` + `idle/walk/run/draw/aim/shoot:pistol` (homens) ou
  `idle/walk/run/stab:knife` + `idle/walk/run/swing:bat` (mulheres) — `NpcGenTypes` (`ARM_M`/`ARM_F`). Ficam em **páginas à parte**
  (`lazy` → grupo `arm` do `NpcGenBuild`): só vão para a placa de vídeo quando alguém saca (`Temper.prefetch` pede assim que ele
  decide revidar, enquanto cambaleia). Sem esses clipes no atlas, briga a mão livre.

## Briga de trânsito (`src/npc/RoadRage.js`, `Config.roadRage`)

Numa batida entre dois veículos (`Game._onCarImpact`; o piloto que voou da moto: `Game._onThrow`) com motorista da cidade de pelo
menos um lado, **45%** (`chance`) viram briga — com **moto ou bicicleta** no meio (motoboy, entregador, mototaxista, ciclista),
**80%** (`motoChance`). Só perto do jogador (`radius` = 45 m, dentro do raio em que o trânsito não remove carro largado) e no máximo 2 ao
mesmo tempo. O sorteio é feito uma vez por par de veículos (os dois carros avisam a mesma batida).

- **Quem desce**: um pedestre do pool vira o motorista (`NPCManager.borrow`: o mais longe da tela; sai do crowd e anda na pista —
  `NPC.walkFree`); o piloto que voou da moto **veste o desenho dele** (`NPC.wearLook`) e levanta da queda. Os veículos param na hora.
- **Quem puxa a briga**: o motoboy, se tiver um; com o jogador na batida, o motorista da cidade; entre dois carros, um deles. Ele
  sempre desce. O outro só desce se for de revidar (`Temper`) — senão fica no carro levando chute na porta.
- **Fases** (`RageState`, um `FightState`): `out` (abre a porta e desce) · `rag` (voou da moto) · `approach` · `argue` (encara e xinga —
  `Bubbles` —, chuta a porta do outro: amassa a lataria) · `fight` (soco e chute; armado saca quando aperta) · `back` (volta, levanta
  a moto caída, entra e o veículo segue — o pedestre volta ao pool) · `flee` (levou a pior: corre até a calçada e vira um pedestre
  assustado; o veículo fica largado).
- **Com o jogador**: dentro do carro, o motorista vem até a porta, chuta a lataria e manda descer; se o jogador sai, briga com ele;
  se arranca e passa de `giveUp` (18 m), desiste. A pé (a moto pegou o jogador, ou ele voou da própria moto), briga com ele.
- Apanhou do jogador antes da briga começar: parte para cima dele (`Temper`) ou foge. Susto (tiro por perto, polícia): foge — menos
  quem está trocando tiro. O jogador se afastou: os pedestres voltam ao pool e os veículos seguem (`_dissolve`).

## Pelada na quadra da favela (`src/npc/Pelada.js`)

De dia (8h–18h30, sem chuva forte) e com o jogador a menos de 70 m (`BUILD`; desmonta a 100 m), os meninos jogam **futsal 5 × 5** na quadra da favela
(`FavelaPlan.squares` 'quadra' — a mesma do baile, à noite): **camisa × sem camisa** (os sem camisa são `civil_banhista`), com goleiro,
fixo, dois alas e pivô. Antes era um acontecimento da rua (`StreetLife`) com sprites soltos que corriam no lugar e uma bola que
atravessava as pessoas.

- **Os meninos** são NPCs de verdade (`NPCManager`, `party`: não são reciclados) no **modo livre** (`NPC.free`: a pelada move todos
  juntos, todo quadro; desenho por `PeladaState.anim` — correr, andar, chutar). O mais perto da bola de cada time vai nela (o goleiro
  só sai na área dele); os outros ocupam a formação puxada para a bola (avançam com a posse, recuam sem ela; cada time numa faixa
  lateral, sem grudar no adversário). Na bola: **chute** a gol perto da área, **passe** para quem está mais à frente e livre, ou
  **condução** escapando da marcação. Goleiro **segura** e repõe com a mão. Juiz: **gol** (a bola na rede), lateral, tiro de meta e
  escanteio (repõe o time que não tocou por último); comemoração e saída de bola.
- **A bola** (raio 12 cm, desenhada um pouco maior): gravidade, quique amortecido, atrito de rolar, ar, as paredes dos barracos
  (`MapGeo.resolveCircle`: a normal do empurrão reflete), **traves e travessão** (rebatem), **rede** (entrou pela boca, fica e
  amortece; por fora/por cima, volta). Bate nas pernas de quem está no caminho; o **jogador** correndo nela **conduz** (sai com a
  velocidade dele); com o golpe perto dela, **chuta** (o soco é "mão na bola"); carro e moto também levam a bola.
- **Invadir irrita** (`anger`, 0–100): ficar na quadra perto do jogo (+5/s; longe da bola, +1,5/s), encostar na bola (+9), chutar (+22)
  ou mandar para longe (+18 na reposição), trombar num menino correndo (+8), entrar de carro (+40/s, e os de perto correm). Com
  **30** (`STOP`) o jogo para, todos encaram e o mais perto vem tirar satisfação (`Bubbles`); com **70** (`FIGHT`) — ou na hora, se o
  jogador bater em um — 2–3 partem para a briga (`FightState`, a mão livre) e o resto grita em volta. Fora da quadra a raiva baixa
  (−4/s; −7/s a mais de 18 m); abaixo de 12 o jogo recomeça e quem fugiu ou brigou volta (`WANDER` por perto → `PeladaState`).
- **Susto**: tiro por perto, arma de fogo na mão depois de irritar ou carro em cima — todo mundo corre (`PeladaState.onPanic` → o
  susto de um vale para a turma). **Temido** no bairro (`WorldMemory` medo ≥ 45): reclamam baixinho e, em vez de brigar, vão embora.
- Teste: `Pelada.force = true` (joga a qualquer hora); `Pelada.info()` dá o placar, a raiva e a bola.

## Antisserrilhado dos personagens (`NpcArt`, `Config.art.npcAA`)

O MSAA da cena (`render/Smooth.js`) só alisa bordas de **geometria**; o boneco 2,5D é um quad com alfa, então por dentro dele o MSAA
não faz nada. O shader do personagem faz o próprio **supersampling**: n×n amostras bilineares numa grade girada 26,6° (RGSS — bordas
quase retas também saem lisas) espalhadas pela pegada exata do pixel no atlas (`dFdx/dFdy`), com n pela redução (de longe, uma
amostra por texel: nenhum é pulado) entre 2 e `npcAA`. Com a mistura de quadros, cada amostra lê um dos dois quadros na proporção da
mistura (o custo não dobra; com 4 amostras, lê os dois). Ligado, o realce "nítido" da ampliação fica bem mais brando (× 0,3): o
miolo duro de cada texel ampliado era o que fazia o degrau no contorno.

| preset | MSAA da cena | personagens |
|---|---|---|
| Low | — | o filtro de caixa de antes (`npcAA` 1) |
| Medium | 4× | até 4 amostras por pixel (`npcAA` 2) |
| High | 4× | até **16** amostras por pixel (`npcAA` 4) |
| HD | **8×** (só com a tela ≤ 4 Mpx; acima, 4×) | até **16** |

Sem derivadas na placa (WebGL 1 sem `OES_standard_derivatives`), fica o filtro de caixa.

## Como funciona

```
tools/asset_baker/generator/NpcGenCore.js    motor: primitivas SDF → nuvem de pontos "assada" por parte do corpo; câmera; matemática
tools/asset_baker/generator/NpcGenChar.js    fichas (pele, cabelo, roupa, chapéu, colete, bolsa, corpo…), paletas (PAL) e armas/objetos
tools/asset_baker/generator/NpcGenRender.js  pixel art: z-buffer a 4×, cobertura, 5 tons, contornos, água, efeitos (clarão, cápsula…), sombra
tools/asset_baker/generator/NpcGenAnims.js   esqueleto (IK) e TODAS as animações; CLIPS = clipe do jogo ("walk:pistol") → animação
tools/asset_baker/generator/NpcGenTypes.js   tipos do jogo: clipes de cada um, arma desenhada, lugares onde aparece, regras de variação
tools/asset_baker/generator/NpcGenBuild.js   monta o atlas: 16 direções, recorte, quadros repetidos juntados, páginas
tools/asset_baker/generator/NpcGenMesh.js    corpo da malha 3D (+ malha3d.js) e o dano pintado
tools/asset_baker/armas.cjs                  folha de armas (source/armas.jpg) → generator/armas_sprites.js (material e tom por pixel)
tools/asset_baker/weapons_preview.cjs        folha de conferência: clipes escolhidos, em algumas direções, num PNG ampliado
tools/asset_baker/bake.cjs                   o BUILD: renderiza tudo no Node (worker_threads) → assets/baked (WebP + JSON + camadas de dano)
tools/asset_baker/wardrobe/worker-main.js    o Worker do guarda-roupa (vai empacotado com o gerador em assets/baked/wardrobe.worker.js)
tools/asset_baker/preview.html               prévia de qualquer tipo/variante/clipe/direção (renderiza na hora, no navegador)
tools/asset_baker/validate.html              ?atlas=<tipo>: confere os atlas assados (JSON, WebP, camadas, retângulos) e desenha um clipe
assets/baked/npc-data.json                   dados do jogo: tipos, variantes de cor, paletas, ficha/clipes do jogador, hash do gerador
assets/baked/npcs/<tipo>.json                manifesto: clipes, quadros, páginas e camadas de dano
assets/baked/npcs/<tipo>/p<i>.webp           as páginas (R = byte 0, G = byte 1), carregadas quando o jogo precisa
assets/baked/npcs/<tipo>/d<n>p<i>.webp       a camada de dano n da página i
assets/baked/npcs/protagonista_mao_<bolsa>.*  os clipes de carregar a bolsa da mão com a roupa inicial (extras do bake.cjs)
src/art/NpcData.js                           no jogo: os dados (npc-data.json) — cores de uma ficha, chave de forma, tipos
src/art/AtlasDecoder.js                      no jogo: busca e decodifica as páginas WebP num Worker (junta a camada de dano)
src/art/NpcArt.js                            no jogo: páginas → textura, paleta das variantes, shader, folhas (NpcSheet), quem é quem
src/player/PlayerLook.js                     visual do jogador: ficha a partir da roupa/bolsa → atlas prontos ou do IndexedDB
src/player/Wardrobe.js                       o guarda-roupa: desenha (Workers) um visual novo na hora, ao vivo, e o grava no IndexedDB
src/storage/LookStore.js                     o IndexedDB dos visuais: o esquema único, lido pelo jogo e gravado pelo Worker do guarda-roupa
```

- **Cor por paleta.** Cada pixel do atlas guarda o *código* da cor (material × 8 + tom) e o alfa — 2 bytes por pixel (PNG cinza+alfa
  dentro de um `.js`, para funcionar também aberto por duplo clique). A cor vem de uma linha da paleta (`NpcArt._palette`): a linha
  0 é o jogador, as outras são as variantes dos tipos. Material 0 e os tons 5–7 são cores fixas (sombra, contorno, clarão do tiro…).
- **16 direções desenhadas** (22,5° cada; o perfil leve usa só as 8 pares): o quad não gira (`SpriteActor`, clipe `npc`), escolhe o
  quadro pela direção, com histerese (só troca passando 0,68 de passo da direção atual: sem "piscar" na fronteira). O shader faz o
  bilinear à mão sobre a cor já pintada (suave de longe, nítido de perto — `NpcArt.setZoom`) e mistura o quadro seguinte (suave).
- **Mais quadros, mesma duração**: andar e correr 12 quadros por ciclo, soco 9, chute 10, morte 10, cambalhota 11… (tabela em
  `CLIPS`, `k` → `n`; o fps sobe na mesma proporção, então os pés continuam plantados nas mesmas velocidades e os tempos do jogo em
  segundos valem). Sequências escritas à mão viram `n` quadros por `resample` (interpolação suave, sem mudar o tempo de cada pose);
  ciclos são recalculados com o `n`. O jogo usa a FASE do clipe (`SpriteActor.phase` / `setPhase` / `setLean`), não o índice do quadro.
- **Ordem de desenho**: personagens 2,5D vão no grupo 1, depois dos carros e antes das copas das árvores, e entre si do norte para
  o sul (quem está ao sul fica por cima). A parte de cima do desenho testa a profundidade "em pé" (não some atrás de muro/telhado
  baixo logo ao norte). Com os pés debaixo de um toldo de loja ou de uma cobertura de posto (`MapGeo.coverAt`, altura na cor do
  vértice, `SpriteActor._updateCover`), o desenho inteiro fica abaixo dela: quem passa por baixo some sob o toldo, sem a cabeça
  furá-lo. Os toldos ficam a 3,0–3,25 m (`CityGrid.AWNING`).
- **Guarda-chuva e guarda-sol no mesmo ângulo**: `SpriteBaker.bake(..., { elev: 56 })` desenha com a câmera dos NPCs (ortográfica a
  56°, vinda do sul; ray-march de SDF), em vez de visto de cima. Usado pelo guarda-sol das calçadas/praias (`PropSprites.TILT`) e
  pelo guarda-chuva da chuva (`NPC.umbrellaMaterial`).
- **Bonecos antigos viram tipos novos sozinhos**: todo código que cria um sprite com a folha `civA/civB/police/swat/army` e uma cor
  de grupo (executivo, favela, praia…) recebe um tipo 2,5D desse lugar (`NpcArt.remap`, semente = nome do sprite). A polícia e as
  gangues escolhem o tipo pelo papel (`PoliceOfficer._build`).

## Personalização do jogador

- **Peças** (`Outfit.ITEMS`): cada uma tem `look` (forma + cor na ficha do gerador). Novas: boné aba curva, boné pra trás, touca,
  chapéu de pescador, viseira, capacete; camiseta estampada/listrada, camisa havaiana, polo, bermuda jeans, tênis de skate.
  Bolsas (`Bags`): mala transversal, mochila e mochila tática aparecem no desenho; maleta, sacola e mala de rodinhas, na mão.
- **Bolsa da mão** (maleta, bolsa de lona, mala de rodinhas): só aparece nos clipes de carregar (`*_hold`, `*_pull`), então NÃO muda a
  forma do visual (fora da chave de forma): fica num atlas à parte — o pronto da roupa inicial (`protagonista_mao_<bolsa>`, assado no
  build, com dano) ou, num visual do guarda-roupa, os clipes de carregar montados para ele (`<ck>|h:<bolsa>`; até lá, os da roupa inicial).
  Comprar ou pegar uma bolsa da mão no meio do jogo nunca pede o guarda-roupa com a roupa inicial.
- **Tingir** (de graça): Inventário → Equipamento, no detalhe da peça vestida ou na aba ✂️ Visual. Só muda a paleta: instantâneo.
- **Aparência** (de graça, aba ✂️ Visual): pele, cabelo (17 estilos — 6 novos da malha 3D), cor do cabelo, barba, corpo.
- **Forma nova = desenho novo, na hora**: o visual vem dos atlas prontos (a roupa inicial, com os níveis de dano) ou do IndexedDB
  (`dirty-money-visual`). Uma forma que ainda não está lá (roupa trocada no armário ou na boutique, o porte que mudou com a academia…) é
  desenhada pelo `Wardrobe` em segundo plano e o jogador **já a veste enquanto ela é desenhada**: cada direção de cada clipe vai para um
  atlas AO VIVO assim que fica pronta (`NpcArt.liveAtlas` / `liveAdd`: os quadros sobem direto para páginas de 2048² na GPU e a tabela
  do clipe cresce no lugar). Primeiro o clipe que ele está tocando, na direção para onde olha (depois as vizinhas; a que falta mostra a
  mais próxima já desenhada), depois parado/andar/correr e o resto do dia a dia; o clipe que ele começa a tocar e ainda não foi
  desenhado passa na frente da fila, e até lá sai do visual anterior. Workers: os núcleos − 1, até 4, com a tela de equipamento aberta
  (o jogo está pausado; abrir a tela já aquece o gerador, cuja partida a frio leva ~4 s); jogando, até 2. Cada clipe também é gravado
  no aparelho; no fim um Worker empacota as páginas e grava o atlas pronto (principal + tático + armas novas, se tiver alguma; cada
  página um PNG, que o jogo decodifica num Worker e sob demanda, como as páginas prontas — `LookStore`, `NpcArt.addStored`) e o atlas
  ao vivo sai. Depois vêm os níveis de dano daquela roupa (barra "Preparando o visual machucado"); terminou tudo fora da tela, os
  Workers são encerrados. Recarregou o jogo no meio: o que já foi gravado é reaproveitado. Recarregou com a mesma roupa: lido do
  IndexedDB, sem gerar de novo. Depois do primeiro visual
  gravado o jogo pede armazenamento persistente (`navigator.storage.persist`), para o navegador não apagar o IndexedDB por falta de espaço. A chave leva o hash do gerador
  (`npc-data.json` → `genHash`): mudou o desenho no build, os visuais guardados são montados de novo.
- **Armas novas** (pistola com silenciador, RPG, lança-foguetes, minigun, revólver e AK-47): moram num terceiro atlas, `protagonista_armas`
  (`NpcGenTypes.PLAYER_ARMS`: parado, andando, correndo, sacar, mirar, atirar, agachado, andar agachado, passo lateral e assalto com
  cada uma; `NpcSheet.armsAtlas`). Os objetos estão em `NpcGenChar.buildProps` (ogiva do RPG e feixe de canos da minigun são peças
  à parte — `SUB_PROPS` —: a ogiva some depois do disparo e os canos giram 15° por quadro no tiro em loop) e as pegadas em
  `WEAPON_HOLD` (RPG e lança-foguetes no ombro direito; minigun no quadril). Num visual do guarda-roupa esse atlas só é montado quando
  o jogador TEM uma delas; até lá o desenho delas sai do visual de sempre — menos o revólver e a AK-47, que até lá saem como a
  pistola e a SMG na roupa dele (`Player.LOOK_ALT`, `PlayerLook.drawsArms`).
- **Armas da folha** (`tools/asset_baker/source/armas.jpg`: pistola, revólver, pistola com silenciador, submetralhadora, AK-47, RPG,
  lança-foguetes, minigun, granada e molotov). `armas.cjs` escolhe uma vista de lado limpa de cada uma e grava o desenho como
  material + tom por pixel (`generator/armas_sprites.js`), com a empunhadura, o ponto da mão de apoio, a boca do cano e onde
  prendem as peças que se mexem. No gerador (`NpcGenChar`, "ARMAS DA FOLHA") o desenho vira um sólido (`SpriteSolid`): o contorno
  é a silhueta, a espessura cresce para dentro dele (tubos redondos, pistolas chapadas) e a superfície é pintada com o pixel do
  desenho. De lado ela é a folha; de qualquer outro ângulo tem volume, com a luz e o contorno do resto do personagem.
  - **Proporções**: comprimento de verdade no corpo adulto (1 u ≈ 1,9 cm: AK-47 47 u ≈ 89 cm, RPG 50 u, minigun 44 u, revólver
    18 u); pistolas, granada e garrafa ~25–30% maiores para lerem na tela. Elas não passam pelo aumento de 20% dos objetos (`ARMA_PROPS`).
  - **Quem usa**: pistola → polícia, traficantes e o jogador; revólver → civis homens que revidam armados (`guns: { pistol:
    'revolver' }`) e o jogador; submetralhadora → traficante da pistola e o jogador; AK-47 → traficantes de fuzil (`rifle:
    'rifle_ak'`) e a AK-47 do jogador (`PLAYER_GUNS`); granada e molotov → jogador. O fuzil do BOPE/Exército/jogador e a escopeta
    não estão na folha e continuam os de primitivas.
  - **Animações**: as de sempre (sacar, mirar, atirar, andar/correr armado, agachado, cobertura, assalto). O revólver tem coice
    próprio (`revolverShoot`), a ogiva do RPG some no disparo, os canos da minigun giram e o fogo do molotov aceso, preso no pano
    da garrafa, troca entre 4 desenhos da folha (`molotov_fogo0..3`). A boca do cano de cada arma do jogador é medida no
    build (`npc-data.json` → `muzzle`), então o clarão e a bala saem da ponta do desenho.
  - Mudou a folha ou os ajustes (`PICK` em `armas.cjs`): `node tools/asset_baker/armas.cjs`, confira com
    `node tools/asset_baker/weapons_preview.cjs saida.png protagonista_armas:aim:ak47 --dirs 4,8,12` e asse os tipos que desenham
    armas.
- A tela de equipamento mostra o **próprio personagem** girando (clique para girar), renderizado pelo gerador no Worker do guarda-roupa.

## Mudar ou criar personagens

1. Fichas: `ROSTER` em `NpcGenChar.js` (as do pacote) ou `MORE` em `NpcGenTypes.js`. Campos como no README do pacote
   (`skin`, `hair`, `top`, `pattern`, `bottom`, `shoes`, `head`, `vest`, `mask`, `bag`, `body`, `gender`…) e os novos:
   `hair` mohawk/dreads, `top` hoodie, `pattern` logo, `bottom` cargo, `shoes` hightop, `head` bucket/visor, `bag`
   pack2/tactical/cross, `watch`, `belt`, `zip`.
2. Tipo do jogo: `TYPES` em `NpcGenTypes.js` (regras de variação, lugares, clipes, arma desenhada).
3. Animações: funções em `NpcGenAnims.js` e a tabela `CLIPS` (nome do clipe do jogo → animação, fps, loop).
4. Gere os atlas de novo: **`npm run bake:install`** (uma vez: instala o `sharp`, o codificador WebP) e **`npm run bake`** (todos os
   tipos, um por Worker, os maiores primeiro; grava `assets/baked/npcs/<tipo>.json` + as páginas e camadas `.webp`, apaga as velhas,
   e no fim `npc-data.json` e `wardrobe.worker.js`). Só alguns tipos: `node tools/asset_baker/bake.cjs civil_vovo pm_policial`;
   `-j N` = Workers (padrão: núcleos − 1); `--no-dmg` = sem as camadas de dano; `--fast` = WebP com esforço 4 (testes);
   `--data` = só `npc-data.json` + `wardrobe.worker.js` (mudou paleta, tipo, ficha ou o Worker do guarda-roupa — sem renderizar);
   `--clips walk,idle:none --out /tmp/x` = só esses clipes, noutra pasta; `--dry` = mede sem gravar; `--list` = tipos e quadros;
   `--help`. O build confere que as cores calculadas no jogo (`NpcData.rampsFor`) batem com as do gerador. Para conferir os arquivos:
   `tools/asset_baker/validate.html?atlas=<tipo>&clip=walk:none&dmg=2`. A prévia (`http://localhost:8123/tools/asset_baker/preview.html`,
   servidor `serve.ps1`) mostra qualquer tipo/variante/clipe/direção. Tipo novo entra sozinho (o `npc-data.json` lista os manifestos).
5. Mudou o desenho do jogador? Nada a fazer: o hash do gerador muda e os visuais guardados no IndexedDB são montados de novo.

`tools/asset_baker/validate.html` (sem parâmetros) compara o porte com os PNGs originais do pacote (com `G.ADULT = null`, as proporções do pacote): copie algumas folhas de `sprites/` do pacote para
`tools/asset_baker/_ref/` como `<tipo>_<animação>.png` (ex.: `civil_trabalhador_idle.png`).

## Subindo morro (`walk_up`, `climb`)

A pé, qualquer encosta se sobe — os paredões do relevo (`WorldMap.cliffRects`, marcados `cliff`) só seguram carros
(`MapGeo.resolveCircle(..., vehicle = true)`), tiros e a visão; a navegação dos NPCs também passa por eles. Quem sobe vai devagar
(`MapGeo.slopeSpeed`: ~0,7× numa rampa de 20%, ~0,5× em 50%, ~0,35× num paredão; descida leve um pouco mais rápida, forte freia).
O desenho troca sozinho (`SpriteActor.setSlope` + `play`): quem anda informa a inclinação na direção do movimento
(`MapGeo.slopeAlong`) e, se o tipo tiver os clipes e estiver sem arma na mão, `walk`/`run` viram:
- **`walk_up`** (> 0,15): corpo inclinado, passo curto e erguido, pé pousando na rampa, braços trabalhando (passada 0,77);
- **`climb`** (> 0,6): escalando — tronco curvado, joelhos altos, mãos alternadas apoiando na encosta (passada 0,59).
O ritmo é corrigido pela passada (`SpriteActor.CLIMB`). Usado pelo jogador, pedestres (navegação e modo livre) e policiais/gangues.

## Velocidades (realistas) e ritmo das animações

| | andando | correndo |
|---|---|---|
| Jogador (`Config.player`) | 2,2 m/s (~8 km/h) | 6,8 m/s (~25 km/h) |
| Pedestres (`Config.npc`) | 1,6 m/s | trote 3,4 · pânico 5,2 |
| PM a pé (`Config.police`) | 1,5 m/s | 5,8 (com 1★, 4,6) |
| BOPE / Exército / traficantes | 1,4–1,7 m/s | 5,0–6,3 |
| Carros (`Config.traffic`) | — | cruzeiro 9–14,5 m/s |

Ninguém a pé alcança um carro andando, e todo perseguidor a pé é um pouco mais lento que o jogador correndo (fugir depende do fôlego).
Os pés não "patinam": o clipe de andar/correr toca em `velocidade ÷ Config.anim` (`walk` 1,6 e `run` 4,3 m/s = a velocidade em que os pés
ficam plantados com a passada do adulto — `STRIDE_K` em `NpcGenAnims.gait`). Mudou a passada? Recalcule `Config.anim`.

## Números

- Atlas assados (k = 1, 16 direções, páginas): 42 tipos + 3 de bolsa da mão, ~220 mil quadros, 424 páginas (1,14 Gpx) — **244 MB de
  WebP** (antes: 408 MB de `.js` com PNG em base64) **+ 107 MB das camadas de dano** (3 níveis; antes o dano era gerado no aparelho de cada
  jogador). As armas dos civis (grupo `arm`) somam ~1 300 quadros por tipo civil e só carregam quando alguém saca. Se TODAS
  as páginas estivessem na placa de vídeo seriam ~2,2 GB, mas só as páginas em uso ficam (orçamento `Config.art.vramMB`: 640 MB;
  perfil leve 256 MB e só as direções pares). As páginas assadas são idênticas, pixel a pixel, às que o gerador desenha.
- Carga: na abertura `npc-data.json` + os 34 manifestos JSON (e as páginas do protagonista); cada página é buscada e decodificada num
  Worker (`AtlasDecoder`, decodificador WebP nativo do navegador) quando alguém precisa dela. Nenhum desenho é gerado durante o jogo.
- Build (`npm run bake`, 4 núcleos): ~70 min — render ~10 ms por quadro, o WebP com esforço 6 (o mais compacto) e as camadas de dano
  (+ 82 mil quadros × 3 níveis). `--fast` (esforço 4, ~8% maior) e `--no-dmg` para testes.
- Guarda-roupa (visual de uma roupa nova, principal + tático, ~16 mil quadros): ~1–2 min com 2–4 Workers; depois ~30–40 s por nível de dano.
- Desempenho do jogo com 70 pedestres: igual ao dos bonecos antigos (o shader faz 4 leituras por pixel do sprite).
