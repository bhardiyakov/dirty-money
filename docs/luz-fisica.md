# Luz física (etapa 2 do upgrade visual)

Duas camadas, **ligadas por padrão em todos os presets** (`render/Lighting.js`), escolhidas pelas capturas lado a lado (a opção
"B"). A oclusão de ambiente (SSAO) também foi testada e ficou de fora: o resultado não agradou e custava ~50% mais desenhos por
quadro.

| URL | O quê |
| --- | --- |
| (sem nada) | Luz do céu + gradação |
| `?luz=ceu` / `?luz=cor` | Só uma delas, para comparar |
| `?luz=0` | As duas desligadas (a luz de antes) |

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

## Custo

- **Luz do céu:** zero (só mudam as cores das luzes).
- **Gradação:** uma passada de tela cheia, no fim da cadeia.

## Testes

`tests/35_luz.test.cjs` confere:
- a gradação como último pós-processamento;
- o céu azulado e o sol quente de dia;
- a sombra mais funda e a cor fria dos personagens na sombra;
- o recuo da luz do céu no fim da tarde e a luz de sempre à noite;
- com `?luz=0`, tudo exatamente como antes.
