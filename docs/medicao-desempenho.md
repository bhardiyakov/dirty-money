# Medição de desempenho (etapa 0 do upgrade visual)

Antes de mexer nos gráficos, o jogo ganhou como medir o custo do quadro do lado da **placa de vídeo**. O lado da CPU já era
medido por sistema (`core/Perf.js`, aba INFO do modo dev, `tests/perf.cjs`). A regra das próximas etapas: cada uma roda o
benchmark antes e depois e mostra que não piorou.

## Ferramentas

| Onde | O quê |
| --- | --- |
| `?perf` na URL | Painel no canto superior esquerdo, atualizado 4 vezes por segundo (detalhes abaixo) |
| `?bench` na URL | Roda o benchmark de rota fixa sozinho depois da carga e mostra a tabela, com botão para copiar. Junte `&gfx=low` (ou `medium`, `high`, `hd`) para escolher o preset |
| Modo dev › INFO | As mesmas medidas de render, junto do custo de CPU por sistema |
| `node tests/bench.cjs` | O benchmark nos presets Low e High, no Chromium dos testes. `--out arquivo.json` salva; `--compare arquivo.json` mostra a diferença cena a cena; `BENCH_PRESETS=low,high,hd` escolhe os presets |
| `tests/33_medicao.test.cjs` | Garante que o painel e o benchmark funcionam e devolvem a configuração como estava |

O painel `?perf` mostra:
- FPS e intervalo real entre quadros;
- tempo de CPU do jogo e do render;
- tempo de **GPU**;
- desenhos por quadro (e quantos são do mapa de sombras);
- triângulos e malhas na tela;
- memória de vídeo estimada (texturas, com a fatia dos atlas de personagem, e geometria);
- resolução, MSAA e tamanho do mapa de sombras.

O tempo de GPU depende da extensão `EXT_disjoint_timer_query_webgl2`. O Chrome costuma expor; Firefox e Safari costumam
esconder, e aí o campo aparece como "—".

**O benchmark** (`tools/Bench.js`) passa por cinco cenas fixas: favela (início), centro, Lagoa, mata atlântica e centro à noite
com chuva.
- Em cada cena: teleporta, prepara o terreno em volta, aquece (shaders, carregamento) e mede.
- Durante a medição: **tira o teto de FPS** (mede a folga real, até a taxa do monitor), trava o relógio e o clima e desliga o
  `AutoQuality`. No fim, volta tudo.
- Mede o intervalo de cada quadro (mediana e p95), mais as médias de CPU, GPU, desenhos, sombra, triângulos, malhas e memória.

## Base (antes de qualquer mudança visual)

Medida no Chromium dos testes, que **renderiza por software** (sem placa de vídeo). Os tempos absolutos aqui são dezenas de vezes
piores que num computador real e só servem para comparar uma etapa com a seguinte. Os números de **desenhos, triângulos e
memória** independem disso e valem para qualquer máquina.

**Low** (960×540, sem MSAA, sem sombra):

| Cena | Desenhos | Mil triângulos | Malhas |
| --- | --- | --- | --- |
| Favela (início) | 93 | 116 | 93 |
| Centro | 111 | 67 | 111 |
| Lagoa | 98 | 45 | 98 |
| Mata atlântica | 93 | 88 | 93 |
| Centro à noite com chuva | 119 | 78 | 119 |

Memória de vídeo estimada: texturas 416 MB, sendo 281 MB dos atlas de personagem; geometria 125 MB.

**High** (1280×720, MSAA 4×, sombra 2048):

| Cena | Desenhos (sombra) | Mil triângulos | Malhas |
| --- | --- | --- | --- |
| Favela (início) | 114 (19) | 258 | 94 |
| Centro | 145 (27) | 147 | 117 |
| Lagoa | 120 (22) | 78 | 98 |
| Mata atlântica | 105 (11) | 159 | 93 |
| Centro à noite com chuva | 122 (0) | 74 | 121 |

Memória de vídeo estimada: texturas 880 MB, sendo 636 MB dos atlas de personagem; geometria 124 MB. O mapa de sombras custou
~1 ms de CPU por quadro.

## O que a base já mostra

- **Desenhos e triângulos estão baixos:** de 90 a 150 desenhos e no máximo ~260 mil triângulos por quadro. O motor já é bem
  otimizado (malhas mescladas por pedaço, descarte por grade). Há folga para geometria nova (prédios com volume, vegetação),
  desde que siga agrupada.
- **A sombra é barata:** de 11 a 27 desenhos e ~1 ms. Melhorar a qualidade dela cabe no orçamento.
- **A memória de vídeo é o ponto apertado, e quem a ocupa são os atlas dos personagens 2,5D.** No Low eles passam do orçamento
  configurado (`Config.art.vramMB` = 160 MB): as páginas só saem da placa depois de 15 s sem uso. Para a máquina mínima (vídeo
  integrado, que divide a memória com o sistema), este é o primeiro lugar a otimizar. Opções:
  - páginas em meia resolução no Low;
  - despejo mais agressivo das páginas sem uso.
  
  Isso não depende do upgrade visual e pode ser feito antes dele.
- **O heap de JavaScript oscilou entre ~500 MB e ~1 GB** de uma rodada para outra do benchmark no Chromium dos testes. Precisa ser
  conferido numa máquina real antes de virar conclusão.

## Como medir na sua máquina

1. Abra o jogo no Chrome com `?bench&gfx=low` (o preset da máquina mínima) e espere cerca de 1 minuto.
2. Clique em **Copiar resultado** e guarde o texto. Ele traz a tabela e um JSON com tudo.
3. Repita com `?bench&gfx=high` numa máquina melhor, se tiver.

Essa é a medição que vale para a meta "roda onde GTA San Andreas roda a 30 FPS". No Low, a coluna FPS sem teto mostra a folga:
acima de 30 com sobra, a máquina aguenta.

## Atualização do Babylon

Ver `docs/avaliacao-babylon.md`.
