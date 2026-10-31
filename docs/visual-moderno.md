# Visual moderno

O mundo aberto ganhou uma camada de renderização "moderna" por cima da arte existente. Ela liga pelo preset de gráficos
(`src/core/Graphics.js`) e é configurada em `Config.render` (`src/config.js`).

| Preset | O que liga |
| --- | --- |
| Low | nada (visual clássico: StandardMaterial, sombra PCF, sem pós) |
| Medium | PBR, árvores 3D, tone mapping; sombra PCF |
| High / HD | tudo: SSAO e glow layer (sombra ESM só no estilo real) |

Há dois estilos modernos (`Config.render.style`):

- **`diorama` (padrão): maquete / city builder.** O mapa é construído pela fábrica de materiais do `src/render/Diorama.js`.
- **`real`:** PBR com mapas de normais e as texturas pintadas (`src/render/PBRWorld.js`) e sombra macia ESM.

Para testar: `?look=diorama`, `?look=modern` (o real) ou `?look=classic` (o visual antigo, mesmo no Low).

## Maquete: como o mapa é construído

O `Diorama` é a camada de visual do mapa. A câmera do jogo continua a `CompassCamera` (ortográfica, presa ao personagem). Por
isso o AO do jogo é o `OrthoSSAO`: o `SSAO2` do Babylon só funciona em perspectiva, e fica com a cena autônoma (`diorama.html`).

- **`Diorama.surface(scene, name, tex, opts)`** é o material de toda superfície do mapa. Quem chama: `WorldBuilder._mat`
  (ruas, calçadas, gramados, telhados, fachadas, água), o terreno (`TerrainSplat`), as árvores 3D, o morro do Corcovado, o Pão de
  Açúcar, o gramado do Maracanã e a casa do protagonista. É um PBR fosco (metallic 0; rugosidade 0,88, telhados 0,7, água 0,1),
  sem mapa de normais nem variação ruidosa.
- **Cor sólida:** vem de `Diorama.SURFACE` (ruas, calçadas, grama, areia, terra, água) ou, para telhados e fachadas, da **cor média
  da própria textura** avivada. Essa média é calculada quando a textura é pintada (`tex._dmAvg`, em `Pixel.toTexture` e
  `CityTile.toTexture`). Assim cada telhado continua laranja, azul ou de zinco, só que liso. A textura fica ligada só pelas UVs.
- **Detalhes que ficam** (são informação, não ruído): faixas de pedestre, lojas, o gramado do Maracanã, vidro e porta da casa
  (`Diorama.KEEP`); as janelas das fachadas, que viram vidro escuro de dia e acendem à noite; a espuma da orla e as divisas dos
  biomas.
- **Terreno:** `Diorama.TERRAIN` tem uma cor por bioma. As curvas de nível saem e as divisas em degradê ficam.
- **Árvores:** cores de `Diorama.TREES`, com cada triângulo na sua própria normal (low-poly facetado).
- **Luz:** as luzes da cena seguem o `DayNight`, calibradas para os sprites. Os materiais da maquete multiplicam a luz direta por
  `Diorama.GAME.direct` (`directIntensity`), com o mesmo balanço céu/sol da cena autônoma. `Diorama.grade` deixa de dia o céu
  azul-claro, o rebote do chão esverdeado e o sol quente. Na sombra sobra quase só o céu (`GAME.shadowBase`).
- **Sombra:** PCF de qualidade alta. **Pós:** `Diorama.imageProcessing` (ACES, contraste 1,18, saturação). A borda da tela some
  no céu claro (`CompassCamera.EDGE_K`).

## Onde está cada coisa

- **`src/render/Atmosphere.js`**: luz ambiente da cena, `DefaultRenderingPipeline` (tone mapping ACES, exposição, contraste,
  gradação de cor por `ColorCurves`, bloom, sharpen, FXAA), `GlowLayer` das luzes (`GlowBatch` do tipo `glow`), as cores da hora
  (`DayNight.apply` chama `grade` e `dayNight`) e o **SSAO ortográfico** (`OrthoSSAO`). O SSAO do Babylon só reconstrói a posição
  para câmera em perspectiva, e a do jogo é ortográfica e inclinada.
- **Névoa**: `CompassCamera.EDGE_FOG` / `FOG_MIX` (`src/core/camera.js`). Com o visual moderno a cena usa `FOGMODE_EXP2`: neblina
  de distância com a cor do céu, mais o mesmo corte nas bordas da tela de antes.
- **Sombra macia**: `GameEngine._createLights` (`src/core/engine.js`) com `useBlurExponentialShadowMap`. Os "fantasmas" de
  sombra dos prédios (`WorldBuilder._flush`) escrevem cor, porque o ESM guarda a profundidade no alvo de cor.
- **`src/render/PBRWorld.js`**: os materiais do mundo (`WorldBuilder._mat`, `TerrainSplat`) viram `PBRMaterial`. Cada superfície
  tem rugosidade própria, mapa de normais procedural ladrilhável e variação de tom em manchas. A água recebe ondas animadas no
  shader, o reflexo do céu com fresnel e a rugosidade baixa só onde é água. `PBRWorld.adapt` adapta os plugins de material
  escritos para o StandardMaterial (WaterPlugin, GroundBlend, RoofCut, WindowLights, TerrainSplat).
- **`src/render/Trees3D.js`**: árvores, palmeiras, ipês, araucárias, bananeiras e arbustos em malhas low-poly com thin
  instances, agrupadas por célula de 64 u. Cada planta tem escala, giro e tom próprios, e há balanço do vento no vertex shader.
  As outras plantas rasteiras continuam em sprite. Cada malha tem geometria própria: clones que dividem geometria dividem também o
  VAO do Babylon, e aí todos desenhariam as instâncias do primeiro.
- **Relevo**: no PBR, o terreno usa a altura do `WorldMap` como mapa de normais, e as encostas respondem ao sol da hora. Os
  **paredões** sobem até ~3,4 u de verdade (`TerrainBuilder._lift`), só no miolo das células de paredão. Ali já ficam os colisores
  Havok de 4 u e os obstáculos do `CityGrid`, então física, navegação e o chão onde se anda continuam como antes.

## Limites conhecidos

- Personagens, NPCs e efeitos continuam sendo sprites 2,5D (`ShaderMaterial`). Eles recebem o tone mapping do pós, mas não o PBR
  nem a névoa.
- O relevo físico vale só nos paredões. Subir o chão onde se anda e dirige exigiria que jogador, NPCs, trânsito e navegação
  seguissem a altura do terreno (hoje todos andam em y = 0).
- Carros 3D, postes, píeres, barcos (com balanço e física de onda) e pedalinhos da Lagoa já existiam e foram mantidos.
- Os testes automáticos rodam no Chromium com renderização por software. Ali o visual moderno é lento, e o desempenho real
  precisa ser medido numa GPU.
