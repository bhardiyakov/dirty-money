# Licença e créditos

## Licença dos modelos

Os arquivos `.glb`, as texturas e os dados deste pacote foram gerados a partir de assets do **MakeHuman**, que o
projeto lançou sob **Creative Commons CC0 1.0 Universal** (domínio público) a partir da versão 1.2 (2020):

- malha base `hm08`, targets de forma do corpo (incluindo os `bodyshapes` de Elvaerwyn, CC0 desde 2021),
  pesos do rig "mixamo" do MPFB2 e malha dos olhos;
- cabelos do conjunto padrão do MakeHuman: `short01`, `short02`, `short03`, `short04`, `afro01`, `bob01`, `bob02`,
  `long01`, `ponytail01`, `braid01`;
- roupas `male_casualsuit04` e `female_casualsuit01`, tênis `shoes06`, sobrancelhas `eyebrow001`/`eyebrow006`,
  cílios `Eyelashes01`/`eyelashes02`, texturas de pele `young_lightskinned_*`.

CC0 significa uso livre, inclusive comercial e em jogos de código fechado, sem obrigação de atribuição. Na
interpretação do próprio projeto MakeHuman, o resultado exportado pertence a quem o gera.

Alterações feitas para este pacote: ajuste do corpo aos 4 portes, conversão para T-pose com nomes de ossos Mixamo,
camiseta retexturizada em cinza neutro (cor por material), remoção de logos (camiseta e tênis), tênis escurecido,
tons de pele, cabelos convertidos para tingimento por material, couro cabeludo procedural, corte "Raspado"
procedural, morphs e clipes de exemplo.

Fontes: [MakeHuman](https://github.com/makehumancommunity/makehuman) (LICENSE.ASSETS.md: CC0),
[MPFB2](https://github.com/makehumancommunity/mpfb2) (LICENSE.ASSETS.md: CC0) e
[FAQ sobre a mudança de licença em 2020](https://static.makehumancommunity.org/oldsite/faq/what_changed_regarding_the_license_in_2020.html).

## Código

Os scripts em `exemplos/`, `ferramentas/` e `fonte_build/` foram escritos para este pacote e podem ser usados e
modificados livremente. A ferramenta de sprites usa [three.js](https://threejs.org) (MIT) e
[Playwright](https://playwright.dev) (Apache-2.0), instalados via `npm install`.

## Créditos (não obrigatórios)

Equipe MakeHuman (Manuel Bastioni, Jonas Hauquier, Joel Palmius, Thomas Larsson e colaboradores) e Elvaerwyn.
