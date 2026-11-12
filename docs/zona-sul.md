# Traçado da cidade — Centro, orla sul e Ilha do Almirante

Implementação: `src/map/ZonaSul.js`, chamado por `CityGrid._cityStreets` (norte e sul da cidade) e `CityGrid._islandPlan` (ilha).
Areia da orla: `WorldMap` (bioma, `ZonaSul.coastSand`). Calçadão, quiosques, postos e guarda-sóis da Av. Marítima: `Landmarks._beach`.
Nomes dos bairros no mapa: `WorldMap._regions`.

## O esquema seguido

O mapa segue o esquema de referência (Zona Sul e Centro do Rio, desenhado sobre o mapa do jogo). Nenhum bairro, rua ou marco usa o nome real: todos são nomes fictícios, sérios, no estilo dos de verdade.

| Região | Como ficou |
| --- | --- |
| **Norte da cidade** (z > 210 — Santa Helena e Vila Imperial) | Labirinto: ruas N-S onduladas e travessas curtas desencontradas entre elas, cortadas por 4 avenidas leste-oeste (Presidente Vagal, Mem de Lá, Rio Barrento, Rodrigo Alvarás) e pela via expressa em diagonal. As ruas que chegam na rua z = 210 continuam as colunas do centro quando caem perto delas. |
| **Centro** (−210..210) | A grade antiga com as diagonais em X e a praça (como era). |
| **Sul da cidade** (Enseada, Costa Azul, Praia Bonita) | A costa leste vira uma **orla em diagonal** da Beira-Mar até a praia do sul; a Av. do Contorno passa por ela (Av. Marítima, Almirante Prado, Comendador Reis) com areia larga até o mar, calçadão e quiosques. Ruas orgânicas acompanham a curva da praia, com travessas desencontradas. A ponte sul desce na Atlântica. |
| **Faixa oeste do sul** (x ≤ −168 — Recanto, o viaduto) | Em grade, com o viaduto como era. |
| **Ilha do Almirante** | Av. Litorânea em volta, avenida central de norte a sul (Estrada do Almirante) e um labirinto de ruas onduladas com travessas desencontradas; as três pontes descem em avenidas que cruzam até a central. |

## Como funciona

Cada região orgânica é uma malha **curvilínea**: uma espinha (a Beira-Mar, a orla em diagonal, o meio da ilha) e coordenadas (u ao
longo dela, v para dentro). Rua longa = v constante com ondulação própria; travessa = u = u0 + inclinação·v + curva·v². Os cruzamentos
são resolvidos em (u, v) e entram como vértice nas duas ruas, então o `RoadPlan` liga as duas exatamente ali. Um tremido suave do mundo
entorta tudo e some perto das bordas retas, para as pontas caírem exatas nelas.

**Travessas desencontradas** (`ZonaSul.bands`): cada faixa entre duas ruas longas sorteia as suas; umas atravessam 2–3 faixas. Cada rua
longa guarda os cruzamentos dela, e uma travessa nova nunca cai a menos de 14 u de outro cruzamento na mesma rua (esquina colada = trecho
curto demais e quarteirão quebrado). Nas bordas retas, a ponta de uma rua ou cai exatamente numa rua da grade vizinha (a rua continua) ou
fica a ≥ 20 u de qualquer outra ponta.

**Mão das ruas** (`RioTraffic`): as ruas longas são binários de mão única (vizinhas em sentidos opostos); as travessas e as avenidas são
de mão dupla. A conferência de conectividade devolve à mão dupla o que isolaria alguém.

Tudo é determinístico (sementes fixas). Imóveis de saves antigos são remapeados para o mais próximo do mesmo tipo (`RealEstate._migrate`).

## Fora do escopo (o esquema e o terreno do jogo divergem)

O desenho de referência põe os morros (no jogo: Morro do Vigia com o Cristo Protetor, Pedra do Farol) e uma favela em outros lugares e acrescenta uma ponte para Niterói. Esses marcos
são parte do relevo e das construções do jogo (morros, bondinho, favelas, o estádio Colosso) e continuam onde estavam; mudar isso é uma
reconstrução do terreno à parte.

## Nomes fictícios

| Referência | No jogo |
| --- | --- |
| Santa Teresa · Catete · Botafogo · Copacabana · Ipanema · Leblon | Santa Helena · Vila Imperial · Enseada · Costa Azul · Praia Bonita · Recanto |
| Ilha do Governador · Lagoa Rodrigo de Freitas | Ilha do Almirante · Lagoa da Prata |
| Maracanã · Pão de Açúcar · Corcovado · Cristo Redentor | Colosso · Pedra do Farol · Morro do Vigia · Cristo Protetor |
| Av. Atlântica · Vieira Souto · Delfim Moreira | Av. Marítima · Almirante Prado · Comendador Reis |

As ruas de cada bairro (`ZonaSul.N_*`, `S_*`, `I_*`) e as placas de esquina (`RoadArt.RUAS/AVES`) também são fictícios (os blocos de carnaval do `Calendar` idem).
