# Trânsito do Rio de Janeiro — estudo e como entrou no jogo

Implementação: `src/world/RioTraffic.js` (regras e rotas), `src/world/RoadNet.js` (manobras e viagens), `src/world/StreetDetail.js` e
`src/art/RoadArt.js` (sinalização), `src/map/MapRenderer.js` (setas no mapa), `src/world/Gps.js`. Teste: `tests/53_transito_rio.test.cjs`.
Desliga com `Config.traffic.rio = false`.

## O problema

Antes, toda rua era de mão dupla com uma faixa por sentido, havia semáforo em 817 dos 836 cruzamentos e cada carro **sorteava**
reta (60%), direita (20%) ou esquerda (20%) em cada esquina. O resultado era um enxame sem direção: carros dando voltas no mesmo
quarteirão, sem fluxo nas avenidas, sem diferença entre manhã e noite.

## Como o trânsito do Rio funciona (o que importa para o jogo)

1. **Hierarquia viária.** O grosso do fluxo anda em poucas vias: as expressas (Av. Brasil, Linha Vermelha, Linha Amarela) e as
   avenidas arteriais de mão dupla com canteiro central (Presidente Vargas, Rio Branco, Atlântica, Aterro). A Av. Brasil sozinha
   levava ~260 mil veículos/dia no trecho inicial, o dobro da Linha Vermelha. As ruas locais distribuem o tráfego no fim da viagem.
2. **Binários de mão única.** Nos bairros densos em grade (Copacabana, Tijuca, Centro, Botafogo) as ruas locais são de **mão única**,
   em pares de ruas paralelas vizinhas em sentidos opostos — Barata Ribeiro × Nossa Senhora de Copacabana é o exemplo clássico, com as
   transversais (Figueiredo de Magalhães, Siqueira Campos…) alternando. A rua de mão única tem duas faixas no mesmo sentido.
3. **Sem conversão à esquerda nas avenidas de canteiro.** Quem vem por uma avenida arterial normalmente não pode virar à esquerda
   (placa R-4a); faz a "quadra": vira à direita e contorna o quarteirão, ou usa um **retorno** no canteiro.
4. **Semáforo nas esquinas da grade.** Copacabana e o Centro têm sinal em quase toda esquina; no interior vale a preferencial e o PARE.
5. **Pico pendular.** De manhã o fluxo vai dos bairros (Zona Norte, Oeste, Niterói pela ponte) para o **Centro**; no fim da tarde, o
   inverso. De madrugada as ruas esvaziam.
6. **Sinalização.** Tracejado **amarelo** separa sentidos opostos; **branco** separa faixas do mesmo sentido. Na boca de uma rua de mão
   única por onde não se entra fica a placa R-3 **sentido proibido** (círculo vermelho com a barra branca). Setas no chão indicam as
   manobras permitidas de cada faixa.

Fontes consultadas: [Observatório da Bicicleta — vias principais de Copacabana](https://observatoriodabicicleta.org.br/acervo/a-bicicleta-como-meio-de-transporte-estudo-de-caso-copenhagen/avaliacao-sistema-cicloviario-copacabana-gc-e-ms),
[JB — BRS na Barata Ribeiro](https://www.jb.com.br/rio/noticias/2011/04/09/amp/prefeitura-do-rio-implanta-sistema-brs-barata-ribeiro.html),
[Sesc SP — volume da Av. Brasil × Linhas Vermelha e Amarela](https://portal.sescsp.org.br/online/artigo/compartilhar/7227_ELA+COMANDA+O+TRANSITO+NO+RIO),
[Correio da Manhã — agulhas da Av. Brasil (2026)](https://www.correiodamanha.com.br/rio-de-janeiro/2026/11/334056-novas-agulhas-na-av-brasil-melhoram-o-trafego.html),
[gov.br — placas R-4a/R-4b não proíbem o retorno](https://www.gov.br/participamaisbrasil/blob/baixar/16580),
[CET-Rio — retorno na Av. Dom João VI](https://en.prefeitura.rio/cet-rio/cet-rio-interdita-retorno-na-avenida-dom-joao-vi-para-obras-do-novo-terminal-mato-alto-do-brt/).
As fontes públicas não trazem o sentido oficial de cada rua; o jogo usa o **padrão** (binários alternados), não um mapa rua a rua.

## O que o jogo faz agora

| Regra do Rio | No jogo |
| --- | --- |
| Hierarquia | Avenidas (`ave`), Beira-Mar, diagonais, via expressa, pontes e rodovias: mão dupla e mais rápidas. Ruas locais da grade (`city`, `isl`): mão única. Favela e estradas: mão dupla. |
| Binários | Cada linha da grade da cidade e da ilha tem um sentido; linhas vizinhas são opostas (par = norte/leste, ímpar = sul/oeste). |
| Sem esquerda da avenida | Saindo de `ave` não se vira à esquerda para rua local (avenida × avenida pode). Os carros contornam a quadra. |
| Viagens | Cada carro civil tem um destino e segue a rota de **menor tempo** (Dijkstra sobre os estados trecho+sentido, com as manobras permitidas): avenida rende 1,6×, rodovia 1,8×, favela 0,55×; esquerda custa mais que direita. |
| Pico pendular | 6h30–10h: 65% das viagens vão para o Centro. 16h30–20h: 65% voltam para os bairros e a ilha. Madrugada: 0,35× o trânsito. |
| Ninguém preso | Depois de dar a mão às ruas, a malha é conferida como grafo de estados: todo estado precisa alcançar todos os outros (componente fortemente conexa). Rua que isolaria alguém volta a ser mão dupla. |
| Polícia | Patrulha obedece; em perseguição a viatura pode entrar na contramão. |
| GPS | Não manda o jogador pela contramão. |
| Sinalização | Tracejado central branco nas ruas de mão única, setas nas duas faixas no começo da quadra, setas de manobra só com as manobras permitidas, retenção na largura toda, placa de sentido proibido. Setas de sentido no mapa e no minimapa. |

## Próximos passos possíveis

- Duas faixas de verdade nas ruas de mão única e nas avenidas (troca de faixa, ultrapassagem pela esquerda).
- Ônibus com linhas e pontos (os pontos já existem: `StreetDetail.busStops`) e motos andando no corredor.
- Faixas reversíveis no pico e a orla fechada para lazer aos domingos.
