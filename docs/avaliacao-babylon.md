# Avaliação: atualizar o Babylon.js (6.40 → 9.x)

Etapa 0 do upgrade visual. A pergunta é se vale trocar a versão do motor antes de mexer nos gráficos, e o que isso custa.
Levantamento feito em novembro de 2026.

## Onde estamos

- O jogo usa o **Babylon 6.40** num único arquivo UMD (`vendor/babylon.min.js`, ~5 MB), mais o Havok em WASM embutido
  (`vendor/HavokPhysics*.js`).
- A versão mais recente no npm é a **9.33.x**; o pacote do Havok está na 1.3.14. O Babylon solta uma versão menor por semana e
  só quebra API pública na troca de versão maior.

## O que as versões novas trazem para o nosso plano

| Versão | Novidade | Por que interessa |
| --- | --- | --- |
| 8.0 (mar/2025) | Shaders do núcleo também em WGSL (o WebGPU deixa de baixar a camada de conversão de mais de 3 MB); luzes de área; sombras de IBL; Node Render Graph (alfa) | Abre o caminho do WebGPU |
| 9.0 (mar/2026) | **Clustered lighting**, que funciona em WebGL 2 e WebGPU: cada pixel só calcula as luzes que o atingem | Viabiliza a etapa da noite: postes, faróis e vitrines iluminando de verdade |
| 9.0 | **Frame Graph v1**: o motor reaproveita as texturas das passadas (o anúncio fala em 40% ou mais de memória de GPU economizada em alguns casos) | Mais pós e sombras no mesmo orçamento de memória |
| 9.0 | Luz volumétrica (raios de luz na neblina), com WebGL 2 "com fallbacks" e melhor no WebGPU | Opcional, para o High/HD |

## O que pode quebrar aqui

Cruzei a página oficial de mudanças incompatíveis (7.0 a 9.15) com o código do jogo.

**Não afeta o jogo:**
- **7.0:** `thinInstanceSetBuffer` passou a usar `staticBuffer = true` por padrão. Os três usos do jogo (`CarArt3D`,
  `ShadowBoxBatch`, `InstancedRenderer`) passam `false` explicitamente, então não mudam.
- **7.52:** o motor de áudio antigo do Babylon deixou de ser criado por padrão. O jogo não usa o áudio do Babylon (zero usos de
  `BABYLON.Sound`).
- **9.15:** decorators novos (o jogo não usa) e o UMD passou a ES2015 (todo navegador atual roda).
- **8.10.1:** rotação de câmeras em cena destra. A cena do jogo é canhota, padrão.

**Precisa conferir:**
- **7.47.3:** `transparencyMode` não nulo passa a valer sempre. São 6 usos no jogo, para conferir um a um.
- **7.31:** instâncias passam a herdar o pai da malha de origem. Conferir os poucos `createInstance` com pai.

**Risco real** (não aparece em lista de mudanças, porque são partes internas do Babylon):
- **Shaders próprios:** 18 `ShaderMaterial` e 58 shaders registrados no `ShadersStore`, todos em GLSL. No WebGL 2 continuam
  funcionando. No WebGPU, o Babylon precisaria converter cada um (a camada de conversão volta a ser baixada).
- **Include de névoa:** o jogo **substitui** um include interno (`fogFragmentDeclaration`, em `core/camera.js`) para fazer o
  corte das bordas da tela. Se o Babylon mudou esse include ou as variáveis dele, a substituição quebra em silêncio.
- **Plugins de material:** 5 plugins (`WaterPlugin`, `GroundBlend`, `RoofCut`, `WindowLights`, `TerrainSplat`) injetam código em
  pontos do shader do `StandardMaterial` (`CUSTOM_FRAGMENT_UPDATE_DIFFUSE`, `BEFORE_FOG`, `BEFORE_FRAGCOLOR`) e usam variáveis
  internas dele (`baseColor`, `color`, `vDiffuseUV`). No WebGL 2 tendem a continuar; no WebGPU, desde a 7.19 o
  `StandardMaterial` gera WGSL puro, e um plugin em GLSL precisa forçar o caminho GLSL.
- **Partes internas do motor e do Havok:**
  - `engine._drawCalls`, `engine._features` e `camera._postProcesses`;
  - a otimização de física em `core/physics.js`, que lê a memória do Havok direto (`_hknp`, `_bodyBuffer`, `_pluginData`) e
    substitui o `plugin.sync`. É a parte mais frágil: depende do formato interno do plugin **e** da versão do WASM, que precisam
    ser atualizados juntos.

## Recomendação

1. **Atualizar, mas como uma etapa própria e isolada**, antes da etapa de iluminação. O ganho que importa ao plano é o
   clustered lighting (9.0), que é o que permite a noite com luzes de verdade sem estourar o desempenho. O Frame Graph é um bônus
   de memória.
2. **Ficar no WebGL 2.** O WebGPU é melhor em teoria, mas exigiria converter os 58 shaders e os 5 plugins, e não é o gargalo
   hoje. Fica para depois, se a medição pedir.
3. **Procedimento proposto** (numa branch, sem mudar nada visual):
   - trocar `vendor/babylon.min.js` e o Havok pela mesma versão do npm;
   - conferir os itens acima, sobretudo o include de névoa e o `physics.js`;
   - rodar a suíte inteira e o benchmark (`tests/bench.cjs --compare`);
   - comparar capturas pixel a pixel nos mesmos pontos (dia, fim de tarde, noite, chuva), como foi feito na varredura de
     otimização. A meta é imagem idêntica e desempenho igual ou melhor.
4. **Tamanho:** o UMD da 9.x tende a ser maior que os ~5 MB atuais. Medir na troca; o service worker já guarda a biblioteca
   em cache depois da primeira visita.

Esforço estimado: médio. A maior parte é conferir o `physics.js` e o include de névoa; o resto tende a funcionar sem mudança.

## Fontes

- [Mudanças incompatíveis por versão (documentação oficial)](https://doc.babylonjs.com/breaking-changes)
- [Notas da versão 7.0.0](https://github.com/BabylonJS/Babylon.js/releases/tag/7.0.0)
- [Anúncio do Babylon.js 8.0](https://blogs.windows.com/windowsdeveloper/2025/03/27/announcing-babylon-js-8-0/)
- [Anúncio do Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)
- Versões atuais: registro do npm (`babylonjs` e `@babylonjs/havok`)
