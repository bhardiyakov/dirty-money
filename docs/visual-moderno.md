# Visual moderno

O mundo aberto ganhou uma camada de renderização "moderna" por cima da arte existente. Ela liga pelo preset de gráficos
(`src/core/Graphics.js`) e é configurada em `Config.render` (`src/config.js`).

| Preset | O que liga |
| --- | --- |
| Low | nada (visual clássico: StandardMaterial, sombra PCF, sem pós) |
| Medium | PBR, árvores 3D, bloom, tone mapping; sombra PCF nítida |
| High / HD | tudo: sombra macia ESM, SSAO, glow layer |

Para testar: `?look=classic` força o visual antigo, `?look=modern` força o novo (mesmo no Low).

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
