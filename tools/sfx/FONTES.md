# Fontes dos efeitos sonoros (como refazer `assets/sfx`)

Todas as gravações são **CC0 1.0 / domínio público** (créditos em `assets/sfx/CREDITOS.md`). Os originais não ficam no repositório:
baixe-os numa pasta (ex.: `/tmp/sfx_raw`) com os nomes abaixo e rode

    python3 tools/sfx/build_sfx.py /tmp/sfx_raw assets/sfx

(precisa de `ffmpeg` e `numpy`). O script recorta, filtra, monta os loops, normaliza, grava os MP3, o `assets/sfx/sfx.json` (grupos de
variações que o jogo lê) e `tools/sfx/origem.json` (de onde saiu cada arquivo: gravação e instante do recorte).

## BigSoundBank (Joseph SARDIN) — CC0 1.0

Arquivo `bsb_NNNN.ogg` = `https://bigsoundbank.com/UPLOAD/ogg/NNNN.ogg` (página: `https://bigsoundbank.com/detail-NNNN.html`).
Números usados: 0275 1042 0260 0698 0850 0969 1111 1398 1446 1513 1519 1521 1529 1530 1531 1532 1533 1534 2059 2063 2361 2542 2721 3438 3506 0105 0137 0148 0165 0166 0187 0208 0258 0373 0376 0397 0437 0438 0444 0495 0510 0514 0532 0534 0655 0675 0690 0771
0806 0872 0884 1023 1145 1253 1254 1318 1355 1356 1357 1359 1773 1776 1778 1806 1807 1808 1984 1985 1988 1989 2368 2369 2459 2728
2853 2854 3202 3515 3594.

## OpenGameArt.org — CC0

- `oga_qubodup-crash.ogg` — "Crash Collision", qubodup: https://opengameart.org/sites/default/files/qubodup-crash.ogg
  (página https://opengameart.org/content/crash-collision).
- `oga_some/` — "Some sounds", Ziph: `all-in-one_0.zip` de https://opengameart.org/node/166538, descompactado. Só as gravações feitas
  dentro de um carro (gear01, gear04, gear07, gear10, handbrake); os `motorseamless*` desse pacote são sintetizados e NÃO são usados.

- `oga2/` — gritos (todos CC0): `female_scream_1.ogg` (https://opengameart.org/content/female-scream-1, Nocturnal_Vanguard),
  `high_pitch_scream.mp3` (https://opengameart.org/content/high-pitch-scream-sounds2, pauliuw), `screams_0.ogg`
  (https://opengameart.org/content/female-high-pitched-scream-sfx, WuxiaScrub) e `yell/yelling sounds/*.wav` (o zip
  `yelling sounds.zip` de https://opengameart.org/content/male-gruntyelling-sounds, HaelDB — CC0 ou OGA-BY, usado como CC0).

## muted.io — CC0

- `muted_sirens_preview.mp3` — prévia do "Sirens & Emergency Sound Pack":
  https://muted.io/sounds/2021-04-07-sirens-pack-preview/sirens-pack-preview.mp3 (página https://muted.io/sirens/). O lamento (wail)
  sai de 58,15 s e o "yelp" de 13 s.

## O que ficou de fora

Freesound e Kenney (bloqueados no ambiente onde o pacote foi montado), Wikimedia Commons (limite de pedidos). Rotor de helicóptero, chuva, fogos, alarme e buzina presa continuam sintetizados no jogo.
