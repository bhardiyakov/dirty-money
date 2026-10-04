# Otimização — varredura de desempenho (outubro/2026)

Medições feitas com Chromium headless (GPU por software), comparando a versão anterior e a atual nas mesmas condições.
Os números absolutos de um celular serão maiores; as **proporções** valem.

## Resultado

| Métrica | Antes | Depois |
|---|---|---|
| Tempo de CPU por quadro (jogo rodando) | 23–58 ms | **11–12 ms** |
| Lixo de memória gerado por quadro | 1.254 KB | **518 KB** |
| Heap JS no início | 196 MB | **151 MB** |
| Memória de vídeo no início | ~166 MB | **~106 MB** |
| Memória de vídeo em sessão longa (24 bairros, portas, batidas) | 315 MB e não voltava | pico ~180 MB, **volta a ~140 MB** em repouso |
| Vértices por quadro (tela) — centro da cidade | 697 mil | **~116 mil** |
| Vértices por quadro (mapa de sombra) — centro | 491 mil | **~62 mil** |
| Draw calls no centro da cidade | 190 | **130** (média de 8 pontos do mapa: 92 → 89) |
| Travadas ao repor o trânsito / chegar a SWAT / sacar arma de novo | sim (assar sprites na hora) | **não** |

Visual: comparação pixel a pixel antes/depois (dia, entardecer, noite, favela, chuva) — idêntico, exceto carros com
32 direções (pedido).

## O que foi encontrado e corrigido

### CPU e coletor de lixo
- **Havok sincronizava os ~750 colisores estáticos** (prédios, muros) a cada passo de física (2 por quadro): 1.500
  chamadas ao WASM e ~300 KB de lixo por quadro. Estáticos agora pulam a sincronização (`core/physics.js`).
- **`Math.hypot` do V8 é ~18× mais lento que `sqrt` e aloca a cada chamada**; o jogo o usava em 296 lugares,
  muitos por quadro. Trocado por `hypot()` (em `config.js`).
- **Getters estáticos recriavam tabelas inteiras a cada leitura** (`Pickups.TYPES`, `CarSheet.MODELS`,
  `Birds.SPECIES`…, 65 no total), lidos em laços por quadro. `memoStatics()` monta cada tabela uma vez.
- `Vehicle.velocity/speed` liam o WASM e criavam um vetor novo a cada leitura (dezenas por carro por quadro): agora
  uma leitura por passo de física; o movimento dos carros reaproveita vetores.
- Atropelamento testava **todos os carros × todas as pessoas** (~7 mil testes/quadro): agora grade espacial.
- Dicas de interação (12 buscas por quadro, varrendo todos os muros e esconderijos do mundo): grade espacial e
  recálculo a ~10 Hz.
- Água: mexer no `uOffset` e trocar a textura faziam o Babylon **varrer todos os ~270 materiais** a cada quadro.
  Agora os pixels de uma única textura são reescritos (~4×/s, 25 KB).
- Chuva: até ~9 mil `fillRect` de 1 pixel por quadro → uma risca pronta por gota (`drawImage`).
- Faróis de carros fora de alcance eram reapagados todo quadro; filtro de projetores de sombra com cache.

### GPU, vértices e bateria
- Malhas da cidade mescladas em pedaços de 512 u: um único pedaço de acabamentos (`trim`: platibandas, fios do
  "gato", postes de madeira) tinha **154 mil vértices**, processados mesmo fora da tela — e de novo no mapa de sombra.
  Camadas densas agora usam pedaços de 128 u (`Config.world.detailChunk`); as demais continuam em 512 u, com a grade
  deslocada para o centro da cidade não cair na quina de 4 pedaços (`meshChunkOffset`).
- Lotes de brilho **do mapa inteiro** desenhados sempre (semáforos 51 mil vértices, postes 56 mil, fogos 12,8 mil
  mesmo sem fogos): brilhos fixos agora em lotes por região (`GlowGrid`), fogos escondidos quando ociosos.
- `GlowBatch` reenviava o buffer **inteiro** à GPU a cada mudança (1,5 MB no entardecer): agora só a faixa alterada;
  postes e lojas acendem por um *uniform* de intensidade.
- Mapa de sombra: alvo de cor RGBA half-float (32 MB) que o PCF nem lê + profundidade float32 (16 MB) → canal único +
  profundidade 16 bits: **48 → 16 MB**, mesma sombra.

### Memória de vídeo e travadas
- Folhas de **portas (5 MB por modelo)** e **amassados** nunca eram liberadas: agora saem da GPU após 90 s sem uso e
  voltam em segundo plano (`CarLibrary.sweep`).
- SWAT/exército eram assados na carga, descartados 60 s depois e **re-assados na hora no meio da perseguição**:
  agora são preparados aos poucos quando o procurado chega a 2★/4★.
- Clipes do jogador eram descartados após 60 s e re-assados na hora (150–400 ms num celular ao sacar a arma de novo):
  folhas do dia a dia (jogador, civis, polícia, motos) ficam residentes.
- Carro de modelo novo era assado (64 direções) **na hora** ao repor o trânsito: agora entra numa fila e o carro
  nasce com outro modelo já pronto da mesma classe.
- Orçamento de "assar" em segundo plano agora usa só o tempo que **sobra** no quadro (antes: 9 ms fixos).
- Vegetação: atlas de vento forte/tempestade (2 × 7 MB) só são preparados quando chove.
- Carros e portas com **32 direções** (antes 64): metade da memória e do preparo.

### Robustez
- `AutoQuality` (degrau 1) quebrava as sombras PCF ao reduzir o mapa (`resize` recriava o alvo sem a textura de
  profundidade). Corrigido (`GameEngine.setShadowSize`).
- Sem física (Havok não carregou: sem internet / CDN fora), o jogo travava a cada quadro. Agora segue sem física.
- O Havok vem de uma URL **sem versão** (muda sozinha na CDN; última mudança 2 dias antes desta análise): o cache
  offline congela no aparelho a versão que funcionou.
- `index.html` tinha dois "`` `n ``" literais (resto de edição no PowerShell).

### Carregamento e offline
- **Service worker** (`sw.js`): depois da 1ª visita, Babylon + Havok + fontes (~7 MB) saem do aparelho e o jogo
  abre **offline**. Arquivos do jogo: rede primeiro (edições aparecem no recarregar). Não atua em `file://`.
- Checagem O(n²) de sobreposição ao gerar quintais (0,4 s na carga) → pré-filtro por quarteirão.

## Arte em PNG

Infraestrutura pronta para trocar a arte procedural por PNG indexado, folha por folha — ver
[`sprites-png.md`](sprites-png.md). Com os moldes exportados na pasta, o jogo carrega ~24% mais rápido mesmo no PC
(no celular, onde desenhar por código custa ~5×, o ganho é maior).

## Próximos passos recomendados

1. **Pool de veículos** no trânsito: hoje cada reposição (3×/s) destrói e recria malhas + corpo físico + sprite
   (~1 ms no PC, ~6–8 ms no celular).
2. **Sprites em lote (instancing)** quando a arte em PNG chegar: juntar os clipes de cada tipo num atlas único e
   desenhar todos os atores do mesmo tipo numa chamada.
3. **Acessórios em camada** (mochilas) em vez de uma cópia inteira das animações do jogador por bolsa.
4. **Fixar a versão do Havok** numa URL versionada compatível com o Babylon 6.40.
5. **Geração do mundo fora da thread principal ou pré-calculada** (a semente é fixa: dá para gerar uma vez e
   distribuir como dados) — hoje são 4–7 s de CPU antes do menu.
6. **Empacotar/minificar para produção** (ex.: esbuild): 116 arquivos e 2,2 MB de código → um arquivo de ~700 KB.
7. **Atlas de fachadas e telhados**: hoje cada variante de parede/telhado é um material (≈20), e cada um vira uma
   draw call por pedaço visível. Um atlas com repetição no shader juntaria tudo em 1–2 chamadas por pedaço (o maior
   ganho restante de CPU no render, principalmente no celular).
8. Dividir o `game.js` (2.300 linhas) em sistemas com interface comum de `update` — facilita perfil e LOD por sistema.
9. Ligar o `SpriteIO` nas demais artes procedurais (vegetação, barcos, helicópteros, pássaros, itens, interiores,
   texturas do chão) — lista em `sprites-png.md`.

## Como medir

Painel DEV → aba INFO (capacidade, custo por sistema, draw calls, memória). Teste de carga em MUNDO.
