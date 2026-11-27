# Céu, clima, nuvens e LOD do voo (novembro/2026)

O pedido: céu dinâmico com ciclo dia/noite, clima com transições (limpo, nublado, chuva, tempestade), nuvens que o avião atravessa,
névoa e luz ajustadas pelo clima e pela altitude, chuva presa à câmera, um LOD de três camadas para ver o mapa inteiro do avião sem
explodir as chamadas de desenho, física do Havok só perto do jogador, e uma estrutura de coordenadas que aguente origem flutuante.

O jogo já tinha boa parte disso, feita sob medida para a câmera dele: o céu procedural (`SkyDome`), o clima com quatro estados
(`Weather`), a chuva no 3D (`RainFx`), a luz do dia (`DayNight`), a névoa que cresce com a altitude do avião (`CompassCamera.setAir`) e
os colisores do Havok só perto do foco (`ColliderStreamer`). A decisão foi **evoluir o que existe** em vez de trocar por
`SkyMaterial` / `FOGMODE_EXP2` / `ParticleSystem`: o céu daqui tem o horizonte casado com a cor da névoa e o mar que continua além da
borda do mundo, a névoa linear medida do olho é a mesma que o céu e os carros usam, e a chuva em malha estática custa 2 chamadas de
desenho com MSAA. Trocar seria refazer esse casamento e perder o que já foi medido.

| Pedido | Como ficou |
|---|---|
| Céu procedural, sol, turbidez, Rayleigh | `render/SkyDome.js` (já existia): degradê zênite → horizonte, disco e halo do sol (a parte "Mie" do pôr do sol), lua e estrelas, o mar além da borda; cores pela hora (`DayNight`) e pelo céu fechado (`Weather.gloom`) |
| Camada alta de nuvens com ruído animado | `SkyDome` (já existia): duas camadas de ruído com o vento; agora a cobertura vem de `Weather.cover` (o nublado fecha o céu sem chover) |
| Nuvens na faixa de voo, atravessáveis | **novo** `atmosphere/CloudField.js`: impostores em uma chamada de desenho, somem macio perto do olho, a névoa fecha dentro da nuvem |
| Estados de clima com transição | `world/Weather.js`: **novo** estado `cloudy`; chuva (`k`) e cobertura (`cover`) suavizadas separadas; `gloom` e `fogMul` derivados |
| Névoa por clima e altitude | `core/camera.js`: `_vis()` (clima + dentro da nuvem) × `_chaseFar()` (altitude **e velocidade**); continua linear (casada com o céu) |
| Chuva presa à câmera | `render/RainFx.js` (já existia): caixa de gotas que dá a volta em torno do foco, ancorada no mundo, 2 chamadas |
| Luz e sombra pelo clima | `world/DayNight.js`: sol, céu e cores pelo `gloom`; **novo**: sombra some sob céu fechado (o mapa de sombras para) e é refeita com menos frequência sob céu meio fechado |
| LOD de 3 camadas no voo | **novo** `lod/AirLod.js` (orquestra), `lod/DetailCuller.js` (perto/média), `lod/FarProxy.js` (longa) |
| `maxZ` e névoa pela altitude e velocidade | `CompassCamera.setAir(k, alt, spd)`; `minZ` sobe no voo (precisão da profundidade) |
| Troca sem *pop-in* nem pisca-pisca | histerese de 8% em toda borda; o mapa de longe fica escondido DENTRO do detalhe e aparece antes de o detalhe sair |
| Havok só perto | `ColliderStreamer.hold` e `TerrainBuilder.holdColliders` no voo alto |
| Origem flutuante | análise abaixo: com o mapa de 2,5 km não é preciso; o plano para quando for |

## Pastas e módulos

```
src/world/Weather.js          clima: estados, chuva k, cobertura cover, gloom, fogMul, vento, relâmpagos, calendário
src/world/DayNight.js         dia/noite: sol (altura e azimute), luz direcional + hemisférica, cores, sombra (força e frequência)
src/render/SkyDome.js         o céu: degradê, sol, lua, estrelas, nuvens altas (ruído), o mar além da borda
src/render/RainFx.js          a chuva em volta da câmera (riscos + pingos no chão)
src/atmosphere/CloudField.js  as nuvens da faixa de voo (impostores)                                          [novo]
src/lod/AirLod.js             o que muda quando a câmera sobe: camadas, terreno, física                      [novo]
src/lod/DetailCuller.js       perto/média: tira da tela o detalhe longe (máscara de camada)                  [novo]
src/lod/FarProxy.js           longa: o mapa inteiro em caixas e relevo grosso, em pedaços                    [novo]
src/core/camera.js            névoa e alcance (altitude, velocidade, clima, nuvem), minZ no voo
src/core/ColliderStreamer.js  colisores do Havok por perto do foco; `hold` no voo
src/map/TerrainBuilder.js     terreno em pedaços; raio menor e colisores adiados no voo
```

No pedido, as pastas sugeridas eram `atmosphere/`, `weather/`, `lod/` e `world/`. Os módulos novos foram para `atmosphere/` e `lod/`;
os que já existiam ficaram onde estavam (`world/Weather.js` faz o papel de `weather/`), para não mexer em caminhos que o resto do jogo
e o empacotamento já conhecem.

## Ciclo de vida e ordem no quadro

Todos os módulos novos seguem `init` (ou criação preguiçosa na primeira vez que precisam) → `update(dt, game)` → `dispose()`.

```
Game.init       … SkyDome.init → CloudField.init (a malha das nuvens, desligada)
Game._update    weather.update(dt)          chuva e cobertura suavizadas, fogMul, relâmpagos, RainFx
                CloudField.update(dt, g)     liga no ar, cobertura, cores, ordem, "dentro da nuvem"
                AirLod.update(dt, g)         camadas pela altitude do olho, terreno, física
                dayNight.update(dt)          luz, sombra e céu pelo gloom; a névoa vai para a cor da nuvem se estiver dentro
                …
                camera.follow(…)             _vis() mudou → refaz névoa e alcance
render          CarArt3D.flush, …            (nenhum módulo novo escreve buffer por quadro)
```

As nuvens vêm antes da luz porque a luz lê `CloudField.inside`; o LOD vem antes do render porque troca máscaras e liga pedaços.

## Clima

| Estado | chuva `k` | cobertura `cover` | `gloom` | `fogMul` | sombra |
|---|---|---|---|---|---|
| `clear` | 0 | 0,12 | 0 | 1 | normal |
| `cloudy` (novo) | 0 | 0,72 | ~0,40 | ~0,95 | fraca, refeita a cada quadro a mais |
| `drizzle` | 0,34 | 0,80 | ~0,47 | ~0,77 | fraca, refeita a cada quadro a mais |
| `rain` | 0,70 | 0,90 | 0,70 | ~0,58 | some (o mapa para) |
| `storm` | 1 | 1 | 1 | ~0,42 | some (o mapa para) |

- `gloom = max(k, (cover − 0,2) / 0,8 × 0,62)`: o quanto o céu fechado apaga o sol. Lido pelo `DayNight` (sol, céu, cores, força da
  sombra) e pelo `SkyDome` (o azul vira cinza). A chuva `k` continua mandando no que é chuva (gotas, pista molhada, postes acesos).
- `fogMul = 1 − 0,5 k − 0,12 (cover − 0,3)`: quanto da distância de visão sobra. No chão pesa 60% (a rua continua dirigível); no
  voo, 100%.
- As nuvens chegam antes e vão embora depois da chuva (a cobertura muda a 0,3/s, a chuva a 0,45/s).
- O calendário: dia seco tem 35% de chance de um período nublado de 2 a 5 h; o episódio de chuva abre e fecha nublado.
- Sombra sob céu fechado: some (desvanece, depois `refreshRate = 0`) — a passada de sombra inteira sai do quadro justo quando a chuva
  e as nuvens custam mais. Mudar a **resolução** do mapa de sombras no meio do jogo foi descartado: realoca a textura e trava um quadro.

## Nuvens da faixa de voo (`atmosphere/CloudField.js`)

- 120 nuvens no mapa (com 350 m de folga além da borda), 5 a 13 bolhas cada pelo nível gráfico, base entre 185 e 300 m (acima de
  prédios e morros, no caminho dos três aviões). Tempestade baixa a base em 55 m.
- **Uma malha estática, uma chamada de desenho**: a posição da bolha, o centro da nuvem dela, o tamanho, o limiar de cobertura, o
  quanto ela está embaixo e uma semente são atributos de vértice; o shader vira o quadro para a câmera (as colunas da matriz de vista),
  anda com o vento (`mod` na área das nuvens: a que sai de um lado volta do outro) e esconde a bolha cuja nuvem não está na cobertura.
- **Cobertura sem criar nada**: cada nuvem tem um limiar; aparece devagar quando `Weather.cover` passa dele.
- **Atravessável sem corte seco**: a bolha some suave quando o olho chega a ~1,2× o tamanho dela. É a "partícula macia" feita pela
  distância ao olho, não pela profundidade: a versão clássica pede uma passada de profundidade da cena inteira (caro no celular), e
  aqui não há chão para cortar, porque as nuvens ficam acima de tudo. **Dentro** da nuvem (elipsoide achatado em volta do centro),
  `CloudField.inside` sobe: a névoa fecha (`_vis` corta 82% do alcance) e vai para a cor da nuvem (`DayNight`), o que também encurta
  o `maxZ` e barateia o quadro.
- **Ordem**: transparência pede de trás para a frente. Ordena as **nuvens** (não as bolhas), por inserção num `Int32Array` (a ordem
  do quadro anterior já está quase certa), a cada 0,25 s, e reescreve só o buffer de índices, já alocado. As nuvens fora da cobertura
  nem entram nos índices.
- Cor: topo na luz da hora (`SkyDome.cloudLit`), base na sombra (`cloudDark`), borda contra o sol mais clara (forro prateado), longe na
  cor da névoa.
- O custo de verdade é a sobreposição de transparência na tela, não os vértices: por isso o número de bolhas cai com o nível gráfico,
  e a bolha perto do olho some (não vira um quadro gigante na tela).

## LOD do voo (`lod/`)

Liga com a câmera de voo acima de `Config.lod.onAlt` (45 m) e desliga abaixo de `offAlt` (30 m). Raios do **olho** (3D: lá de cima o
que está bem embaixo também está longe), escalados pelo nível gráfico (0,75 no Low, 1,2 no HD):

| Camada | Até | O que fica na tela | Física |
|---|---|---|---|
| Perto | ~240 m | tudo: acabamento, meio-fio, vitrines, fios, postes, pontos de ônibus, brilhos | colisores só se a câmera estiver abaixo de 40 m |
| Média | ~240–950 m | as malhas mescladas por pedaço de 512 m: paredes, telhados, ruas, calçadas; vegetação e pátios até ~520 m | nenhuma |
| Longa | além de ~950 m | o mapa de longe: relevo a cada 16 m na cor do bioma, quadras, cada prédio numa caixa com a cor dele | nenhuma |

- **Esconder sem brigar com ninguém** (`DetailCuller`): cada malha estática do mundo cai numa faixa pelo nome; a escondida ganha
  `layerMask = 0` (nenhuma câmera a desenha e ela nem entra na avaliação de malhas ativas). Os donos das malhas continuam usando
  `setEnabled`/`isVisible` (os brilhos que acendem à noite, os interiores, o recorte do telhado) sem conflito. Malhas novas entram na
  próxima varredura (a cada 2 s, só se a lista da cena mudou de tamanho).
- **Sem *pop-in* duro**: o mapa de longe fica escondido **dentro** do detalhe — o chão 2,6 m abaixo do de verdade, a caixa do prédio
  0,6 m para dentro das paredes e 0,5 m abaixo do telhado. Onde o detalhe está à mostra ele cobre a caixa (sem z-fighting), onde saiu
  a caixa já estava lá. O pedaço do mapa de longe liga um pouco antes (98% do raio) de o detalhe sair. Toda borda tem histerese de 8%.
  Na distância da troca a névoa já está pela metade.
- **Montado em fatias** a partir da decolagem (`Config.lod.buildMs` = 3 ms por quadro): a carga do jogo não paga; enquanto não fica
  pronto, a camada média não sai (o raio "big" fica infinito).
- **Terreno**: acima de 150 m, os pedaços do terreno carregam em 65% do raio (o mapa de longe cobre o resto).
- **Física**: acima de 40 m o `ColliderStreamer` para de criar corpos (só descarta, devagar, os que ficaram longe) e o terreno adia os
  colisores dos paredões. O avião bate em prédio e morro pela conta dele (`Chopper.floorAt` + `Relief`), não pelo Havok; no voo
  rápido o streaming criava e destruía corpos à toa. Descendo, conta como um salto: os corpos de perto nascem na hora, o resto aos
  poucos, e os paredões pendentes são criados. O corpo que o jogador controla nunca é tocado.
- **Câmera**: `_chaseFar = (far + k (260 + 2,4 alt + 1,6 v)) × _vis()`; o `maxZ` acompanha. No voo o `minZ` sobe para 4 m (o avião fica
  a 6+ m da câmera), o que triplica a precisão da profundidade lá a 1–2 km.

## Medição

SwiftShader (o Chromium dos testes, renderização por software), gráfico padrão, 1000 × 640, o jatinho parado no ar a 55 m/s, céu
limpo, as mesmas posições antes e depois. Os milissegundos servem só para comparar uma versão com a outra nesta máquina; as chamadas
de desenho e os triângulos valem para qualquer placa.

| Onde | Chamadas de desenho | Triângulos na tela | Quadro (SwiftShader) | Pedaços de terreno |
|---|---|---|---|---|
| 120 m, saindo do aeroporto | 1.170 → **398** | 1,63 mi → **0,53 mi** | 676 → **390 ms** | 22 → 23 |
| 300 m, indo para a cidade | 1.867 → **328** | 2,48 mi → **0,61 mi** | 688 → **401 ms** | 28 → 16 |
| 550 m, o mapa inteiro | 1.569 → **229** | 2,07 mi → **0,52 mi** | 685 → **473 ms** | 25 → 14 |
| 400 m sobre o centro | 1.343 → **230** | 2,05 mi → **0,33 mi** | 653 → **554 ms** | 23 → 14 |

O que mais pesava a 400 m sobre o centro, antes: vegetação (238 chamadas), pontos de ônibus (146, um por um), paredes (96),
acabamentos (75), meio-fio (53), brilho dos sinais (50), fios (43) e as três camadas das vitrines (108). Lá do alto o mapa de longe
tem ~30 pedaços à mostra; as nuvens são 1 chamada. Os colisores do Havok, que antes continuavam nascendo no voo (57 → 128 ao subir),
agora vão a zero acima de 40 m.

## Armadilhas de desempenho e como foram evitadas

**Pausas do coletor de lixo (alocação por quadro)**
- Nenhum módulo novo aloca por quadro: vetores e cores reutilizados (`CloudField._u`, `AirLod._eye`), laços sem *closures*,
  ordenação por inserção num `Int32Array`, buffer de índices alocado uma vez, caixas das malhas guardadas na varredura (o mundo é
  estático). A varredura de malhas novas aloca, mas no máximo a cada 2 s e só se a cena mudou.
- Já existia e continua: `DayNight._weather` cria arrays com `map()` todo quadro (poucas dezenas de bytes). É o próximo candidato
  a reescrever em arrays fixos se o perfil do celular mostrar coleta frequente.
- Evitar `new BABYLON.Vector3()` dentro de `update`, `forEach` com função anônima em listas grandes e `Array.sort` com comparador
  em toda chamada (aloca e não é estável no custo).

**Picos de chamadas de desenho**
- O pico do voo eram as malhas pequenas (acabamento em pedaços de 64 m, pontos de ônibus um por um, brilhos e fios): a faixa "fina"
  tira todas além de ~240 m.
- O mapa de longe é feito em pedaços de 512 m (a mesma grade da cidade): o frustum descarta os de fora, e os inteiros perto ficam
  desligados, sem sobreposição à toa.
- Montar o mapa de longe de uma vez daria um quadro de dezenas de ms: vai em fatias com orçamento.
- Trocar a malha de faixa é por **avaliação** (a cada 0,25 s ou 20 m andados), nunca por quadro, e por malha inteira.
- Nuvens: uma chamada para o mapa todo. Chuva: 2 (o `ParticleSystem` do Babylon reescreve o buffer na CPU todo quadro).

## Roteiro de integração (a ordem que não quebra a física nem o controle do avião)

1. **Clima primeiro** (`Weather`): só dados derivados (`cover`, `gloom`, `fogMul`). Ninguém muda de comportamento até ler.
2. **Consumidores do clima**: `DayNight` (luz, sombra) e `SkyDome` (cobertura). A sombra desligada sob tempestade é só
   `refreshRate`; o gerador de sombras e a lista de quem projeta não mudam.
3. **Câmera** (`_vis`, `setAir` com a velocidade, `minZ` no voo): só números; o `Plane` passa `ch.v`.
4. **Nuvens** (`CloudField.init` depois do `SkyDome.init`; `update` antes do `dayNight.update`). Não tocam em física nem em entrada.
5. **LOD** (`AirLod.update` antes do `dayNight.update`): só máscaras de camada, `setEnabled` das malhas próprias e o raio do terreno.
   Por último, a física: `ColliderStreamer.hold` e `TerrainBuilder.holdColliders`, **depois** que o Havok já existe (`colliderStream`
   nasce no `Game.init` depois do Havok) e só acima de 40 m — abaixo disso, ou ao desligar, tudo volta antes de a câmera chegar ao chão.
   O avião não usa o Havok para colidir, e o corpo de quem está no controle nunca é tocado.

Para desligar qualquer parte: `?nuvens=0` (nuvens), `?lodvoo=0` ou `Config.lod.on = false` (LOD do voo; no ar, devolve tudo na hora),
`?ceu=0` (o domo do céu).

## Origem flutuante

**Não é preciso agora, e por que.** O mundo vai de x = −1.500 a 1.000 e de z = −1.250 a 1.250 (o avião vira 140 m antes da borda);
o voo vai até ~680 m de altura. Em ponto flutuante de 32 bits (o da GPU), o passo entre dois números perto de 1.500 é 0,12 mm; o
tremor (*jitter*) só fica visível com passos de ~1–2 mm, a partir de ~16 km da origem. O mapa está dez vezes abaixo disso. Já o
**z-fighting** não vem da origem, vem da razão entre `minZ` e `maxZ` (a precisão da profundidade). Isso foi atacado direto: `minZ`
maior no voo e o mapa de longe com folgas (2,6 m, 0,6 m, 0,5 m) bem maiores que o passo da profundidade a 2 km (~0,1 m).

**Quando for preciso** (mapa acima de ~8–10 km): um serviço `WorldOrigin` com o deslocamento `(ox, oz)`, trocado em passos de 1.024 m
quando a câmera passa de ~2 km da origem atual:
- a lógica do jogo (IA, navegação, economia) continua em coordenadas do mundo — em JavaScript são `double`, sem problema;
- o que é desenhado fica sob um nó raiz do mundo estático, que anda `−ox, −oz` na troca (descongela e recongela a matriz uma vez);
  as instâncias finas são relativas à malha delas e vão junto;
- os shaders que usam a posição do mundo para padrão (calçadão, terreno, janelas, nuvens) recebem `uOrigin` e somam de volta, para o
  desenho não "andar" na troca;
- o Havok já só tem corpos perto do foco (`ColliderStreamer`): na troca, solta todos e recria em volta do foco novo (o mesmo caminho do
  salto/respawn), e os corpos dinâmicos (carros por perto) são movidos pelo mesmo deslocamento.
