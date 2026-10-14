# NPCs 2,5D — o pacote de personagens no jogo

Pedestres, Polícia Militar, BOPE, Exército, traficantes **e o protagonista** usam agora os personagens do pacote de NPCs
("GTA 2,5D": vistos do alto a 56°, 8 direções desenhadas, contorno escuro e sombreamento em 5 tons). O pacote veio com 17 fichas
renderizadas por um gerador em Python; o gerador foi **portado para JavaScript** (`src/art/npcgen/`) e roda no navegador — dá o
mesmo resultado pixel a pixel (conferido contra os PNGs do pacote) e é com ele que o jogo ganhou animações novas, mais tipos de
NPC, variações de cor e a personalização do jogador.

## O que tem

| | |
|---|---|
| **Tipos** (`NpcGenTypes.TYPES`) | 17 civis (os 10 do pacote + banhista, corredora, executivo, vovó, skatista, "mano", motoboy), PM e PM feminina, BOPE de capacete e de touca ninja, soldado do Exército, 3 traficantes e o protagonista |
| **Variações** | cada tipo tem 5–10 variantes de cor (pele, cabelo, roupa, calçado, boné). Farda não muda de cor. Mesma forma, outra linha da paleta: não custa memória |
| **Animações** | as do pacote (parado, andando, correndo, soco, chute, armas, cassetete, granada, apanhar, morrer, levantar, mãos ao alto, nadar) e as novas para o que o jogo já fazia: **roubar carro** (puxa o motorista), **abrir a porta**, **entrar no carro**, **assalto** (sacar, anunciar com a arma), **render-se e ajoelhar**, **furto** (carteirada), **arrombar** fechadura, **pular grade**, **pânico** (correr com as mãos pra cima), **cambalhota**, **arremessado no ar**, caído, morto **com poça de sangue**, correr armado (pistola / submetralhadora / escopeta / fuzil / taco), mexer na bolsa, carregar maleta/sacola, puxar mala de rodinhas, andar sobrecarregado, boiar parado |
| **Crime de rua** (`src/npc/StreetCrime.js`) | de tempos em tempos, perto do jogador, um pedestre vira assaltante (visual de traficante), rende outro pedestre (que ergue as mãos e ajoelha) e foge correndo armado. Quem vê foge; derrubar o assaltante liberta a vítima |
| **Jogador** | o protagonista 2,5D. Roupa, boné/chapéu, bolsa e aparência mudam o desenho (ver abaixo) |
| **Golpes** | soco, chute, taco e cassetete com colisão de verdade (ver abaixo); pedestres brigões revidam, a PM usa o cassetete |
| **Pilotando** | moto, bicicleta (pedalando), jet ski e lancha (no timão), em **16 direções**; moto e jet ski inclinam na curva. O jogador **sobe na moto/bicicleta** passando a perna por cima (dos dois lados). Entregadores: o tipo **motoboy** (capacete, baú vermelho). Quem cai da moto mantém o visual |
| **Proporções de adulto** | o pacote é "chibi" (~3,3 cabeças: parecia criança). As poses continuam escritas no esqueleto do pacote e são **redirecionadas** para um esqueleto adulto na hora de desenhar (`G.ADULT`: pernas ×1,7, tronco ×1,35, braços ×1,38, cabeça ×0,6 → ~5,3 cabeças); armas e objetos 20% maiores |

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
  andando, correndo — sem o ar de "gorila"); `ADULT.head = 0,66` (era 0,6: de cima, o rosto e o cabelo dizem quem é quem); corpo
  feminino com ombros 0,84, braços 0,8 e quadril 1,08 (`bodyFactors`) e, na malha, braços 20% mais finos (`fitFor('f')`).
- **Visual 3D, sem contorno** (outubro/2026, `G.LINES = false`, o padrão): o renderizador não desenha mais o contorno preto em volta
  do boneco nem os traços onde uma parte passa na frente da outra (viram sombra de contato macia); a sombra no chão sai em degradê
  (alfa); e o pixel de borda guarda a fração coberta (dos 2×2 subpixels) nos 2 bits baixos da luz — o shader vira isso em alfa, então a
  silhueta sai suavizada, como um render 3D. De perto, a ampliação fica lisa (`sharp` até 1,6, sem os "quadradinhos" de pixel art).
  `G.LINES = true` volta ao desenho cartunesco com traços.
- **Redução no jogo** (`NpcArt`, uniform `mini`): com o boneco menor que o atlas (texels por pixel > 1,3 — dirigindo, celular), o
  shader tira a média de n×n amostras sobre a pegada do pixel (até 4×4) em vez do bilinear de 4 amostras, que serrilhava e tremia.

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
- **Alta definição** (Ajustes → 🖥️ Alta definição; ligada por padrão no PC, desligada no celular/aparelho fraco; `?hd=0`/`?hd=1`):
  a tela passa a ser desenhada na resolução real (sem o pixelado) e cada tipo ganha um atlas com o **dobro da resolução** (`HD_K` = 1:
  52 px por metro), gerado no próprio jogo em Workers (até 4 ao mesmo tempo) quando o tipo aparece pela primeira vez, em DUAS FASES:
  (1) parado/andando/correndo/assustado de todos os tipos que apareceram (poucos segundos cada) → camada `<tipo>#hd`, que `NpcArt.clip`
  consulta antes do atlas pronto; (2) depois, o atlas inteiro, que substitui o pronto, sai da camada e fica guardado no aparelho
  (IndexedDB `dirty-money-hd`, comprimido) — das próximas vezes é só carregar. Enquanto o visual do jogador é gerado, a fila espera
  (o jogador tem a CPU primeiro). O visual do jogador também é gerado em alta. Mudou o desenho? Suba `NpcArt.HD_VERSION` (e `PlayerLook.VERSION`).
  Se o PC não aguentar, o modo econômico (AutoQuality) volta a tela ao pixelado (os personagens em alta ficam).
- **Limite do atlas: 4096 px de lado.** O jogo endereça cada quadro como x·4096 + y (exato em float); o empacotamento (`pack`) alarga
  o atlas para 4096 quando ele passaria de 4096 de altura (o jogador em alta: 4096×3308). Passou disso, `NpcArt.clip` avisa no console.

## Pilotando (`ride_*`, `mount`)

O veículo é o desenho do atlas dos carros (visto de cima, "achatado"); o piloto 2,5D vai por cima com a origem no **banco** e os
quadris rente ao chão — o tronco sobe e as pernas descem em volta do veículo. Mãos e pés vão nas manoplas, pedaleiras, pedais e timão
do desenho: `RIDE` em NpcGenAnims (medidas em m no jogo, já com `Config.vehicle.scale` × `Bikes.SCALE`), e os bancos em
`Bikes.SEAT` / `BoatSheet.SEATS`. Mudou a escala de um veículo ou o `npcPpu`? Ajuste `RIDE` e gere os atlas de novo.
As folhas antigas `rider`/`courier` viram tipos 2,5D sozinhas (`NpcArt.attach`); variante 0 = o jogador (a folha dele).

## Golpes corpo a corpo (`Melee` / `Combat.strike`)

Soco, chute, taco e cassetete são **colisões de verdade**, casadas com a animação: durante a janela em que o punho/pé/taco está
estendido (`t0..t1`), a cada quadro uma cápsula vai do peito de quem bate até a ponta do golpe e acerta quem o corpo encostar
(com linha de visada; o taco varre um arco e pega mais de um). Quem apanha cambaleia e é **empurrado**; chute e taco **derrubam**
(Ragdoll: voa, cai, levanta). O jogador vira para o alvo mais perto à frente ao golpear (mira assistida) e também amassa carros.
Quem bate de volta: pedestres "brigões" (alguns tipos, ~45% deles) **revidam** (`FightState`: socos e chutes até cansar ou apanhar
demais; fogem se você puxar uma arma de fogo), a **PM usa o cassetete** de perto (sem armas liberadas) e **traficantes/BOPE/Exército
dão soco ou chute** colados em você — o jogador cambaleia, é empurrado e cai com chute.

## Como funciona

```
src/art/npcgen/NpcGenCore.js     motor: primitivas SDF → nuvem de pontos "assada" por parte do corpo; câmera; matemática
src/art/npcgen/NpcGenChar.js     fichas (pele, cabelo, roupa, chapéu, colete, bolsa, corpo…), paletas (PAL) e armas/objetos
src/art/npcgen/NpcGenRender.js   pixel art: z-buffer a 4×, cobertura, 5 tons, contornos, água, efeitos (clarão, cápsula…), sombra
src/art/npcgen/NpcGenAnims.js    esqueleto (IK) e TODAS as animações; CLIPS = clipe do jogo ("walk:pistol") → animação
src/art/npcgen/NpcGenTypes.js    tipos do jogo: clipes de cada um, arma desenhada, lugares onde aparece, regras de variação
src/art/npcgen/NpcGenBuild.js    monta o atlas: 8 direções, recorte, quadros repetidos juntados, empacotamento
src/art/NpcArt.js                no jogo: atlas → textura, paleta das variantes, shader, folhas (NpcSheet), quem é quem
src/player/PlayerLook.js         visual do jogador: ficha a partir da roupa/bolsa; gera o atlas novo em Workers; cache
assets/npcs/<tipo>.js            atlas prontos (gerados por tools/npcs)
tools/npcs/index.html            prévia de qualquer tipo/variante/clipe e "Gerar e salvar todos"
```

- **Cor por paleta.** Cada pixel do atlas guarda o *código* da cor (material × 8 + tom) e o alfa — 2 bytes por pixel (PNG cinza+alfa
  dentro de um `.js`, para funcionar também aberto por duplo clique). A cor vem de uma linha da paleta (`NpcArt._palette`): a linha
  0 é o jogador, as outras são as variantes dos tipos. Material 0 e os tons 5–7 são cores fixas (sombra, contorno, clarão do tiro…).
- **8 direções desenhadas**: o quad não gira (`SpriteActor`, clipe `npc`), escolhe o quadro pela direção. O shader faz o
  bilinear à mão sobre a cor já pintada (suave de longe, nítido de perto — `NpcArt.setZoom`).
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
- **Tingir** (de graça): Inventário → Equipamento, no detalhe da peça vestida ou na aba ✂️ Visual. Só muda a paleta: instantâneo.
- **Aparência** (de graça, aba ✂️ Visual): pele, cabelo (17 estilos — 6 novos da malha 3D), cor do cabelo, barba, corpo.
- **Forma nova = desenho novo**: `PlayerLook` gera o atlas do jogador em Workers paralelos (montados a partir do texto das
  funções do gerador — funciona em `file://`), até 6, puxando de uma fila 2 clipes por vez na ordem do que mais aparece. O visual
  troca quando parado/andando/correndo (com a arma da mão) estão TODOS prontos — nunca metade de um e metade de outro nesses — e vai
  sendo completado a cada ~1,5 s (golpes, carro, tático, nadar, pilotar…; o companheiro tático entra inteiro). O que ainda falta sai do
  visual anterior só durante a geração. Cada visual gerado fica no IndexedDB: voltar a ele é imediato.
- **Armas novas** (pistola com silenciador, RPG, lança-foguetes, minigun): moram num terceiro atlas, `protagonista_armas`
  (`NpcGenTypes.PLAYER_ARMS`: parado, andando, correndo, sacar, mirar, atirar, agachado, andar agachado, passo lateral e assalto com
  cada uma; `NpcSheet.armsAtlas`). Os objetos estão em `NpcGenChar.buildProps` (ogiva do RPG e feixe de canos da minigun são peças
  à parte — `SUB_PROPS` —: a ogiva some depois do disparo e os canos giram 15° por quadro no tiro em loop) e as pegadas em
  `WEAPON_HOLD` (RPG e lança-foguetes no ombro direito; minigun no quadril). Num visual gerado esse atlas só é gerado quando o jogador
  TEM uma delas (`PlayerLook.wantArms`, "hero:N:w", guardado no IndexedDB); até lá o desenho delas sai do visual de sempre.
- A tela de equipamento mostra o **próprio personagem** girando (clique para girar), renderizado pelo gerador.

## Mudar ou criar personagens

1. Fichas: `ROSTER` em `NpcGenChar.js` (as do pacote) ou `MORE` em `NpcGenTypes.js`. Campos como no README do pacote
   (`skin`, `hair`, `top`, `pattern`, `bottom`, `shoes`, `head`, `vest`, `mask`, `bag`, `body`, `gender`…) e os novos:
   `hair` mohawk/dreads, `top` hoodie, `pattern` logo, `bottom` cargo, `shoes` hightop, `head` bucket/visor, `bag`
   pack2/tactical/cross, `watch`, `belt`, `zip`.
2. Tipo do jogo: `TYPES` em `NpcGenTypes.js` (regras de variação, lugares, clipes, arma desenhada).
3. Animações: funções em `NpcGenAnims.js` e a tabela `CLIPS` (nome do clipe do jogo → animação, fps, loop).
4. Abra `http://localhost:8123/tools/npcs/` (servidor `serve.ps1`): a prévia mostra qualquer tipo/variante/clipe; **Gerar e salvar
   todos** monta os atlas em Workers paralelos (~4 min no PC) e grava em `assets/npcs/`. Tipo novo: acrescente o
   `<script src="./assets/npcs/<tipo>.js">` no `index.html`.
5. Mudou o desenho do jogador? Suba `PlayerLook.VERSION` (invalida os visuais guardados no IndexedDB).

`tools/npcs/validate.html` compara o porte com os PNGs originais do pacote (com `G.ADULT = null`, as proporções do pacote): copie algumas folhas de `sprites/` do pacote para
`tools/npcs/_ref/` como `<tipo>_<animação>.png` (ex.: `civil_trabalhador_idle.png`).

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

- Atlas prontos (formato 2, resolução padrão): ~0,8–1,3 MB por tipo (`.js`; o protagonista, 2,5 MB), ~3 MB de textura cada, criada só quando o tipo aparece. 26 tipos ≈ 29 MB de arquivos. Gerar todos: ~3 min.
- Alta definição: ~35 s por tipo na primeira vez (até 3 ao mesmo tempo, em segundo plano), depois carrega do aparelho em segundos; ~10 MB de textura por tipo. A tela em resolução real custa mais à placa de vídeo que o pixelado.
- Decodificação de todos os atlas na carga: ~0,75 s, em segundo plano.
- Renderizar um quadro no tamanho do jogo: ~10–15 ms (Worker). Visual novo do jogador: primeira parte em ~12 s, completo em ~28 s.
- Desempenho do jogo com 70 pedestres: igual ao dos bonecos antigos (o shader faz 4 leituras por pixel do sprite).
