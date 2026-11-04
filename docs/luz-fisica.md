# Luz física (etapa 2 do upgrade visual)

Três camadas, cada uma com a sua chave (`render/Lighting.js`). Por enquanto **todas desligadas por padrão**: a escolha do que vai
para cada preset é feita pelas capturas lado a lado.

| URL | O quê |
| --- | --- |
| `?luz=ceu` | A: luz do céu |
| `?luz=ceu,cor` | B: luz do céu + gradação |
| `?luz=ceu,cor,ao` | C: luz do céu + gradação + oclusão de ambiente |
| `?luz=0` | Tudo desligado (como antes) |

## As camadas

**Luz do céu** (`ceu`, custo zero). Com o sol alto:
- a luz que vem de cima fica azulada, como o céu, e a que volta do chão fica quente;
- o sol fica mais quente, e a sombra um pouco mais funda.

A sombra deixa de ser só "mais escura" e fica fria, como na realidade: o que está na sombra é iluminado só pelo céu. Os
personagens na sombra de um prédio passam a ter a cor dessa sombra, e não mais um cinza fixo. É a razão entre a luz na sombra e a
luz ao sol, cor a cor (`Lighting.shadeColor`, uniform `shadeC` do `NpcArt`). O efeito acompanha a altura do sol: some no fim da
tarde, para a luz dourada ficar como está, e à noite.

**Gradação** (`cor`, uma passada de tela cheia). Um pouco de contraste e de saturação no fim da cadeia, inclusive sobre os
sprites. Com os ajustes neutros, a imagem sai idêntica. Ficaram de fora duas coisas que pioravam a arte pintada do jogo:
- a curva de tone mapping (ACES), que desbotava as copas das árvores e escurecia o asfalto;
- o `ImageProcessingPostProcess` do Babylon, que converte a imagem entre linear e sRGB e não voltava à original.

**Oclusão de ambiente** (`ao`, SSAO2 do Babylon). Escurece onde as superfícies se encontram:
- pé das paredes;
- vãos entre os barracos;
- debaixo de beirais e carros.

Funciona porque a câmera agora é em perspectiva. Roda em meia resolução, com o desfoque que respeita as bordas. Os sprites são
transparentes e não entram nela, então não ganham halo.

## Custo (benchmark no High, `?luz=0` × `?luz=ceu,cor,ao`)

- **Luz do céu:** custo zero (só mudam as cores das luzes).
- **Gradação:** uma passada de tela cheia.
- **Oclusão:** é a parte cara. Ela desenha a geometria mais uma vez, para montar o buffer de profundidade e normais:
  - **desenhos:** +47% a +58% por quadro (por exemplo, 119 → 180 na favela);
  - **memória de vídeo:** +45 MB;
  - **resolução:** a passada da oclusão roda em meia resolução.

  Por isso a proposta é deixá-la só para High e HD. Os tempos do renderizador por software variam ±30% entre rodadas e não servem
  para julgar.

## Testes

`tests/35_luz.test.cjs` confere:
- a ordem da cadeia: oclusão e, por último, a gradação;
- o céu azulado e o sol quente de dia;
- a sombra mais funda e a cor fria dos personagens na sombra;
- o recuo da luz do céu no fim da tarde e a luz de sempre à noite;
- com `?luz=0`, tudo exatamente como antes.
