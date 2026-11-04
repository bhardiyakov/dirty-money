# Câmera em perspectiva (etapa 1 do upgrade visual)

A câmera 2,5D do jogo era ortográfica: tudo ficava do mesmo tamanho, perto ou longe. A etapa 1 trocou por uma versão em
**perspectiva** com o mesmo comportamento de hoje: mesmo ângulo (56°), giro de 360°, câmera atrás do veículo, adianto, zoom
automático e balanço ao dirigir. Só muda a projeção: o que está perto da câmera fica um pouco maior, e os prédios ganham
profundidade e mostram as laterais.

## Intensidade escolhida: forte (30°), o padrão

A perspectiva é a câmera padrão do jogo, com campo de visão de 30° (a "forte", escolhida pelas capturas lado a lado).

| URL | O quê |
| --- | --- |
| (sem nada) | Perspectiva forte (30°) |
| `?fov=12` / `?fov=20` | Sutil / média, para comparar |
| `?cam=ortho` | A câmera ortográfica de antes |
| `?cam=top` | A câmera de cima, antiga, em todo lugar |

No benchmark: `?bench&gfx=low&cam=ortho` ou `BENCH_QUERY='cam=ortho' node tests/bench.cjs` mede a ortográfica para comparar.

## Como funciona (`core/camera.js`)

- **Mesmo tamanho na tela.** O campo de visão é fixo (`Config.camera.perspFov`). A câmera fica à distância em que o plano do
  ponto central mostra exatamente o mesmo `view` da ortográfica: o personagem tem o mesmo tamanho na tela.
- **Nunca abaixo dos telhados.** A câmera não chega mais perto que `perspMinDist` (60 m ao longo do raio, ~50 m de altura, acima
  do prédio mais alto). Com zoom bem perto, o campo de visão fecha em vez de a câmera descer.
- **Os sprites não mudaram.** Continuam de pé, virados para a câmera. O desvio de profundidade que os mantém à frente do chão foi
  convertido para a curva de profundidade da perspectiva (`NpcArt._standSync`).
- **Corte das bordas da tela** (`EDGE_FOG`): com a perspectiva, a posição na tela é a posição na vista dividida pela profundidade.
  O shader recebe isso pela densidade da névoa negativa.
- **Chão visto** (`groundHalf`): na perspectiva ele é um trapézio, mais largo e mais longo para o alto da tela. O descarte, o
  nascimento do trânsito e dos pedestres, a janela de sombra e os carros 3D usam a caixa que contém esse trapézio.
- **Mira e conversões tela → mundo** já usavam o raio da câmera do Babylon, que funciona igual nas duas projeções.
- **Interiores** continuam com a câmera de cima de sempre.

`tests/34_perspectiva.test.cjs` confere:
- o foco no centro e o mesmo tamanho na tela;
- os cantos da tela dentro do chão visto;
- a distância mínima da câmera;
- o corte das bordas e o desvio dos sprites;
- a mira acertando o chão sob o mouse;
- os interiores com a câmera de cima.
