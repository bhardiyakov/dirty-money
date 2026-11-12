# Zona Sul — Copacabana e Ipanema/Leblon

Implementação: `src/map/ZonaSul.js`, chamado por `CityGrid._islandPlan` (Copacabana) e `CityGrid._cityStreets` (Ipanema/Leblon).
Areia de Copacabana: `WorldMap` (bioma). Calçadão, quiosques, postos e guarda-sóis da Atlântica: `Landmarks._beach`.

## O que se quis copiar

- **Copacabana**: uma faixa estreita entre a praia e os morros. A Av. Atlântica acompanha a curva da praia; atrás dela, as paralelas
  (N. S. de Copacabana, Barata Ribeiro, Tonelero, Pompeu Loureiro) seguem a mesma curva; as transversais descem do morro para o mar em
  espaçamentos desiguais, umas mais tortas, umas que morrem numa paralela. Prédios altos de frente para o mar, comércio no miolo.
- **Ipanema/Leblon**: a orla quase reta (Vieira Souto / Delfim Moreira), as paralelas (Prudente de Morais, Visconde de Pirajá —
  a principal —, Barão da Torre), as transversais do mar para a Lagoa. A ponta oeste acaba no morro: o Morro do Mirante faz o papel do
  Vidigal, e a Av. da Orla do Mirante sobe contornando a encosta como a Av. Niemeyer.
- **Cara de cidade não planejada**: nada de régua — espaçamentos sorteados, ruas levemente tortas e curvas, paralelas interrompidas,
  travessas curtas, e o encontro de duas malhas (Ipanema com a grade de cima) com esquinas desencontradas.

## Como funciona

Cada bairro é uma malha **curvilínea**: uma espinha (a curva da praia) e coordenadas (u ao longo dela, v para dentro). Paralela = v
constante com uma ondulação própria; transversal = u = u0 + inclinação·v + curva·v². Os cruzamentos são resolvidos em (u, v) e entram
como vértice nas duas linhas, então o `RoadPlan` liga as ruas exatamente ali. As inclinações são sorteadas de modo que duas transversais
vizinhas nunca se cruzem. Tudo é recortado pelo contorno do bairro, e os quarteirões saem das faces do grafo (`CityGrid._faceBlocks`).

- **Ilha**: o contorno passa a ser o mínimo entre o de antes e a curva da Atlântica (100 u da água, alisada). As três pontes descem em
  transversais largas de mão dupla (Av. Princesa Isabel, R. Figueiredo de Magalhães, R. Francisco Sá) que cruzam até a praia.
- **Sul da cidade**: o viaduto agora termina em z = −732; abaixo dele a grade torta deu lugar a Ipanema. A orla do Contorno ficou quase
  reta. As linhas N-S da grade de cima descem até a Barão da Torre; transversal de Ipanema que chega perto de uma delas emenda e vira a
  mesma rua (o mesmo nome e a mesma mão).
- **Mão das ruas** (`RioTraffic`): cada linha leva o sentido dela (`line.dir`): as paralelas alternam, como os binários de verdade;
  Atlântica, Visconde de Pirajá e as transversais das pontes são de mão dupla.

Tudo é determinístico (sementes fixas): o mapa é o mesmo em toda partida. Imóveis de saves antigos são remapeados para o mais próximo
do mesmo tipo (`RealEstate._migrate`).
