# tools/asset_baker — build-time asset baking dos personagens 2,5D

O gerador procedural dos personagens (malha 3D, roupas, ~100 animações, sombreado, efeitos e o dano pintado) roda **aqui, no build**,
e grava arquivos estáticos que o jogo só carrega. Nada disso roda na thread principal do jogo.

```
npm run bake:install        # uma vez: instala o sharp (codificador WebP)
npm run bake                # todos os tipos (~1 h com 4 núcleos); --help para as opções
node tools/asset_baker/bake.cjs civil_vovo pm_policial      # só alguns tipos
node tools/asset_baker/bake.cjs --data                      # só npc-data.json + wardrobe.worker.js (sem renderizar)
node tools/asset_baker/bake.cjs --props                     # só os props (o guarda-chuva dos pedestres), em ~1 s
node tools/asset_baker/armas.cjs                            # folha de armas (source/armas.jpg) → generator/armas_sprites.js
node tools/asset_baker/weapons_preview.cjs a.png protagonista_armas:aim:rpg --dirs 4,8   # conferir armas na mão (PNG)
```

| Entrada | Saída (`assets/baked/`) |
|---|---|
| `generator/` (o gerador + `malha3d.js` + `armas_sprites.js`, a folha de armas convertida por `armas.cjs`) | `npcs/<tipo>.json` (manifesto) · `npcs/<tipo>/p<i>.webp` (páginas) · `npcs/<tipo>/d<n>p<i>.webp` (camadas de dano 1–3) |
| tipos, variantes, paletas, ficha do jogador | `npc-data.json` (lido por `src/art/NpcData.js`) |
| `props/umbrella.cjs` (o `SpriteBaker` do jogo) | `props/umbrella.webp` — o guarda-chuva dos pedestres, uma célula por cor (lido por `src/npc/NPC.js`) |
| `generator/` + `src/storage/LookStore.js` + `wardrobe/worker-main.js` | `wardrobe.worker.js` — o gerador num Worker, carregado **só** pela tela de equipamento (`src/player/Wardrobe.js`) |

- Páginas: WebP sem perdas, R = byte 0 e G = byte 1 do pixel de 2 bytes do atlas (material × 8 + água / luz + cobertura), B = 0.
- Camada de dano: mesmo tamanho e layout da página base; pixel ≠ (0, 0) = o pixel machucado. O jogo junta base + camada ao decodificar.
- O build confere que `NpcData.rampsFor` (as cores calculadas no jogo) bate com o gerador e falha se não bater.
- `preview.html` / `validate.html`: prévia do gerador e conferência dos arquivos assados (abrir pelo `serve.ps1`).

Detalhes: [`docs/npcs.md`](../../docs/npcs.md).
