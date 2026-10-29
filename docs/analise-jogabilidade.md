# Dirty Money — análise de jogabilidade e "viciabilidade" (fase atual)

Leitura do código (sistemas, números e fluxos), não de testes com jogadores. As notas são estimativas de design.

## O que já existe (muito, para um MVP)

| Sistema | Onde | Observação |
|---|---|---|
| Procurado 0–5★ com polícia a pé, viaturas, helicóptero, SWAT, Exército, bloqueios | `police/*`, `WantedSystem` | Escala de ameaça clara; fugir (sumir de vista) é uma mecânica. |
| Facções, territórios, moral do tráfico × comunidade, Tribunal do Crime | `Standing`, `GangManager`, `TribunalUI` | Cria consequências sociais (raro em sandbox). |
| Economia suja/limpa, fachadas, auditoria da Receita | `Laundry`, `Economy` | Loop "ganhar → lavar → gastar" com risco (taxHeat). |
| Imóveis (comprar, reformar, dormir, baú, cofre) | `RealEstate`, `HomeStyles` | Sumidouro de dinheiro e âncora de progresso. |
| Missões do morro com patentes (Aviãozinho → Soldado → Gerente) | `Missions` | 3 tipos; prazo e moral em jogo. |
| Eventos de mundo: operação policial, baile funk, pelada na quadra, olheiros, barricadas | `PoliceOperation`, `Baile`, `Pelada`, `FavelaWatch` | Dão "histórias" emergentes. |
| Veículos (carros, motos, bikes, barcos, helicóptero), lojas, armas | `vehicle/*`, `Interiors` | Variedade de brinquedos grande. |

## Onde o ciclo de vício ainda falha

1. **Sem direção de longo prazo.** Nada dizia "o que fazer a seguir". O jogador novo cai numa favela sem objetivo visível; o jogador veterano não vê o fim da escada. *(Corrigido em parte: ver "Metas de Carreira" abaixo.)*
2. **Progresso podia ser perdido.** Só dormir salvava. Fechar a aba, travar ou morrer após 1 h de jogo perdia tudo — é o maior motivo de abandono em jogos de navegador. *(Corrigido: autosave a cada 2 min em momento calmo.)*
3. **Variedade de missões baixa.** Só entrega, cobrança e defesa, todas na favela. Depois de ~10 missões vira repetição. Sugestões em "Próximos passos".
4. **Recompensa sem "suco".** Ganhar dinheiro/subir de patente é um aviso de texto. Falta feedback forte (número flutuante `+R$`, fanfarra, tela de promoção).
5. **Falha cara demais cedo.** Ser preso cobra multa, confisca TODAS as armas e pula 12 h+ (`Game._busted`); o Tribunal do Crime pode levar tudo. Para um jogador novo, perder o arsenal na 1ª hora, sem aviso, desmotiva. Vale um "seguro" ou penalidade progressiva nas primeiras horas.
6. **Sem metas diárias/semanais** para dar motivo de voltar amanhã (o relógio do jogo vira o dia, mas nada muda para o jogador além de preços e fachadas).

## O que foi feito nesta rodada

- **Metas de Carreira** (`src/player/Goals.js`): 5 trilhas (Patrimônio, Morro, Lavagem, Imóveis, Fuga) com degraus crescentes, painel de progresso discreto na base da tela e recompensa em dinheiro/kit médico ao bater cada meta, com aviso e som. Salvo no save; saves antigos recebem as metas já cumpridas sem chuva de prêmios.
- **Autosave** a cada 2 min (só sem procurado/preso/morto/dormindo/missão com prazo).

## Carreiras do crime (`src/careers/`)

Base genérica (`CareerCore.js`): cada carreira tem patentes por XP, 2 skills (0–5, 1 ponto a cada 250 XP), trabalhos (um por vez, nunca junto com a missão do morro) e um painel de gestão. Tela: aba **CARREIRAS** do menu (tecla **O**; no celular, botão CRIME). Tudo entra no save e na trilha "Carreiras" das metas.

| Carreira | Trabalhos | Gestão / sistemas | Skills (efeito real) |
|---|---|---|---|
| Desmanche | Puxada, Encomenda de luxo (rastreador → polícia na coordenada; adulteração parada), Frota do tráfico | Desmanchar qualquer carro roubado (E no desmanche); oficina: funilaria, motor preparado, blindagem, fundo falso; peças sobem a suspeita da Receita; desmanches próprios (renda + peças) | Mecânica (ligação direta, arrombamento, adulteração), Direção (aderência e giro) |
| Ladrão | Levantar a fita (disfarce), Invasão noturna, Arrombar comércio (mini-game), Grande assalto (caixa de força, vigia, cofre temporizado, fuga) | Ruído com onda sonora (pedestres e polícia), alarme abafável, peso da carga, receptador | Furtividade (ruído), Eletrônica (alarme, fechaduras, cofre) |
| Armeiro | Catar sucata (cenas reais de tiroteio), Contrato C.V, Contrato milícia | Bancada (5 receitas), venda com chance de travar, munição para a própria arma, silenciador e pente estendido importados, sequestro × seguranças | Engenharia (material, falhas), Inteligência (receitas) |
| Estelionato | Chupa-cabra, Invasão corporativa | Celulares em furtos ricos, 3 tipos de golpe, rastreio + VPN, batida com destruição de HDs, chantagem (limpo), cripto, lavagem diária para facções | TI (rastreio, instalação, download), Lábia (chance e lucro) |
| Jogo do Bicho | Banca, Rota do recolhe, Queima de arquivo | Escolta, pontos e arrego por zona, família rival por zona (passe, polícia fecha rival, matador), escola de samba com opinião pública, imunidade e desfile | Influência (arrego, rival), Segurança (assaltos e blitz) |

A aba **GUIA** do menu explica o jogo inteiro e cada carreira (os capítulos das carreiras são gerados dos próprios dados, então não desatualizam).

## Progressão longa e "platina"

- **Nível do personagem** sem teto (`src/player/SkillTree.js`): todo XP conta; curva 200 × (nível−1)^1,8 — o nível 100 pede ~780 mil XP. 1 ponto por nível.
- **Árvore de habilidades**: 6 ramos × 6 habilidades em 4 camadas (nível mínimo 1/5/12/20, pré-requisitos, custo crescente), com efeitos reais em ~30 sistemas. **Prestígio** infinito a partir do nível 25.
- **Notoriedade**: o nível deixa a polícia mais atenta (até +60% de visão e memória) e os pagamentos maiores (+1,5% por nível, sem teto).
- **Carreiras mais longas**: patentes pedem ~2,5× mais XP; depois do topo, **maestria** infinita (+25% de XP por nível, +3% de pagamento).
- **Conquistas** (`src/player/Achievements.js`): 42 objetivos de longo prazo; a **platina** exige todos (nível 100, maestria 10 em todas as carreiras, árvore completa, Prestígio 10, R$ 10 milhões…).

## Controles de celular

Joystick (pouco inclinado = andar; inclinado = trote, o passo padrão) + **câmera 360°** (torcer dois dedos na tela, como num mapa — um dedo não gira; botão de bússola ao lado do radar volta o norte para cima; no PC, botão direito arrastando — o do meio com arma de fogo na mão; no controle, analógico direito) + **SPRINT** (como no GTA San Andreas: cada toque soma impulso, segurar mantém um sprint médio; gasta fôlego; também no nado e na bicicleta; some nos interiores, onde só se anda — menos em assalto/missão/fuga) + ATACAR + até 2 botões de contexto que aparecem sozinhos (lidos da dica de interação) + chip da arma (toque troca, segurar recarrega) + ✚ KIT com vida baixa + menu ⋯ com as ações raras; topo: pausa e carreiras; pinça = zoom.

## Império (`src/empire/`, aba IMPÉRIO)

- **Ciclo diário**: energia (gasta com ações; só o sono recupera) × exposição (crimes e estrelas). Exposição cheia = alerta tático no distrito (polícia +60% de visão até dormir). Energia zerada ou acordado depois das 2h = desmaio: confisco do sujo da mochila + propina do limpo.
- **Automação**: galpões e soldados alocados por distrito → cofre sujo diário; rotas de lavagem (posto, restaurante, boate) lavam o cofre para limpo; salários, prisões e emboscadas.
- **Malha de influência**: delegados por distrito (presentes diários, decaimento; 10 ❤ = metade da visão e estrelas mais lentas), Fornecedor do Porto (contratos/sabotagem; armas −40%), rival e milícia (emboscadas), vereadores (extorsão).
- **Domínio**: 3 coleções por distrito (lavagem, influência, força) com bônus; distrito dominado; dono da cidade.
- **Estações do crime**: Calmaria, Carnaval, Eleições (28 dias) e Intervenção Federal, com aviso 2 dias antes e efeitos em polícia, preços de armas, golpes, bicho, soldados e lavagem.

## Bancos (`src/banks/Banks.js`, `src/art/BankStyles.js`)

- **Rede**: 3 sedes no Distrito Financeiro + 7 agências espalhadas. Marcas Inaú (laranja/azul, forte no cibernético), Brascor (vermelho/branco, mais dinheiro físico) e Nacional (amarelo/azul, polícia chega mais rápido). Interiores modulares: um layout de agência recolorido por marca e um layout de sede.
- **Agência (roubo rápido)**: caixas eletrônicos e cofre de caixa disparam o alarme; a polícia cerca o prédio em segundos (varia por marca). Ao sair: estrelas e 3 min para escapar do quarteirão antes do isolamento.
- **Sede (planejada)**: planta baixa no mercado negro da favela, corte de energia (trabalho na caixa de força) e propina dos vigilantes — valem só no dia. Sem energia o laser apaga; o cofre da sede leva 25–60 s.
- **Reféns**: cercado lá dentro, negociação por Lábia, Intimidação (com arma) ou rendição; falhar = invasão e prisão.
- **Dinheiro marcado**: pesa na mochila e precisa ir para o cofre do galpão (8% de troca) antes de ser lavado.
- **Conta e COAF**: depósitos limpos rendem 0,15%/dia; depósitos sujos sobem o alerta do COAF; 100% = metade apreendida e Receita no máximo.
- **Cibernético**: pendrive no terminal do gerente (Estelionato) abre uma porta no firewall por 3 dias; de casa, a transferência via laranjas é um mini-jogo de confirmar contas.
- Ao entrar em qualquer interior, as malhas da cidade são ocultadas e restauradas na saída.

## Assaltos, golpes, negócios, mecânica e corridas

### Assalto a lojas (`src/crime/Robbery.js`, carreira ASSALTANTE em `src/careers/CareerRobber.js`)

- Dentro de qualquer loja assaltável, com arma de fogo na mão no balcão: **E** anuncia o assalto. O atendente levanta as mãos e os fregueses viram **reféns** (deitados).
- **Porte × patente**: Pé-de-chinelo (conveniência, padaria, lanchonete, farmácia, saladas) → Assaltante (bar, pizzaria, boutique, academia) → Profissional (restaurantes finos, loja de armas, vitrines de joalheria) → Mestre do Golpe (a Maison do centro). Sem a patente, o assalto não sai.
- **Medo** (atendente, segurança e reféns) sobe com você perto e de frente com a arma, com o grito (**G**) e com o tiro de aviso (ataque). Medo baixo = alarme silencioso, refém levantando e correndo para a porta (chama a polícia e descreve você), balconista/segurança armado sacando a arma.
- **Fazer a limpa** nos pontos marcados no chão: caixa (o atendente esvazia), cofre e gravador das câmeras (todo interior de loja ganhou um escritório nos fundos — `ShopCtx._backOffice`), prateleiras (mercadoria para o receptador), carteiras dos reféns, vitrines. Abraçadeiras amarram reféns; a furadeira corta o tempo do cofre.
- **Polícia**: só depois do chamado começa a contagem (porte, policiamento do distrito, noite, Sangue-frio). Zerou lá dentro: **cerco** (Lábia, escudo humano, sair atirando, render-se). A loja fica fechada até o dia seguinte.
- **A resposta tem o tamanho da loja** (`Robbery.HEAT`). Antes, qualquer assalto era `armed_robbery` (gravidade 4): com a polícia na porta davam 2★, e com 2★ ela já atira (`Config.police.shootFromStars`). Saindo atirando, eram 3★ e 30 s de tiro livre. Uma padaria custava o mesmo que um restaurante de luxo. Agora:

  | Porte | Crime na ficha | Viatura chega em | Polícia na porta | Saindo atirando | Alerta / busca |
  |---|---|---|---|---|---|
  | 1 — padaria, conveniência, lanchonete, farmácia, saladas | `petty_robbery` (2) | 110 s | 1★ (não atira se você não atirar) | 2★, sem tiro livre extra | 160 m / 100 s × 110 m |
  | 2 — bar, pizzaria, boutique, academia | `robbery` (3) | 80 s | 2★ | 3★, 15 s de tiro livre | 220 m / 150 s × 140 m |
  | 3 — restaurantes finos, loja de armas | `armed_robbery` (4) | 55 s | 2★ | 3★, 30 s de tiro livre | 260 m / 180 s × 170 m |
  | 4 — joalheria | `armed_robbery` (4) | 40 s | 2★ | 3★, 30 s de tiro livre | 300 m / 200 s × 190 m |

  - O tempo da viatura ainda se divide pelo policiamento do distrito e cresce de noite e com Sangue-frio. As testemunhas da padaria demoram 1,6× mais para ligar (as do porte 2, 1,2×).
  - No cerco de uma loja pequena há uma tentativa a mais de negociar.
  - Na ficha, quatro padarias somam a gravidade de duas lojas grandes. O mandado sai em 8.
  - `tests/23_assalto` faz o assalto inteiro e sai com a polícia chegando. Na padaria: 1★, a polícia segura o fogo, gravidade 2 na ficha e busca de 110 m; saindo atirando, 2★ sem tiro livre. No restaurante de luxo: 2★ com a polícia atirando; saindo atirando, 3★ e 30 s de tiro livre. Com a arma na mão à vista dela, a polícia atira em qualquer porte (`PoliceManager.notifyGunDrawn`).

### Flagrante, ficha e condicional (`src/police/HeatStateMachine.js`, `CrimeExposure.js`, `CrimeRecord.js`)

Tudo depende da **exposição do jogador no instante do crime**. O jogo não rastreia arma nem carro abandonado.

```
IDLE ─crime─▶ CRIME_COMMITTED ─alguém viu─▶ WANTED ─fugiu─▶ INVESTIGATION (nome na ficha) │ IDLE (mascarado / delegado comprado)
                    │ ninguém viu               │ preso, ou morto durante a perseguição
                    ▼                           ▼
              estado anterior               ARRESTED ─▶ PAROLE ─cumpriu─▶ IDLE
```

- **Quem viu** (`CrimeExposure.evaluate`, só quando o crime acontece). Uma rajada do mesmo crime reaproveita a mesma avaliação.
  - **Polícia**: lida direto da percepção que o `PoliceManager` já calcula a cada quadro (cone + linha de visada, helicóptero, esconderijo, cobertura). Não custa nenhum raio extra.
  - **Câmeras**: zonas de CFTV nas fachadas de banco, joalheria, loja de armas, farmácia e conveniência, empacotadas num `Float32Array`. Dentro das lojas, o próprio interior conta como zona: o DVR ou o sistema do banco. Sem energia, o banco não filma.
  - **Testemunhas**: pedestres com cone de ±60°, ou a até 4 u mesmo de costas. O alcance cai agachado, à noite e com chuva. Na favela vale a lei do silêncio, a não ser que a moral da comunidade esteja baixa.
- **Linha de visada**: um raio 2D sobre a grade estática de prédios (`MapGeo.hasLineOfSight`), não um raycast do Havok. O Havok só tem os colisores próximos da câmera (`ColliderStreamer`), então um raio longo atravessaria prédios não carregados. A grade cobre o mapa inteiro e não aloca nada. São no máximo 6 raios por avaliação, e a busca para na primeira testemunha confirmada.
- **WANTED**:
  - Visto ao vivo pela polícia: estrelas pela gravidade (1–2 → 1★, 3–4 → 2★, 5 → 3★).
  - Só câmera ou testemunha: 1★, como se alguém tivesse ligado para o 190.
  - Na condicional: no mínimo 3★.
  - As estrelas e o cronômetro de fuga, que só corre fora da vista de todos, seguem no `WantedSystem`.
- **Máscara**: sem máscara, o crime vai para a ficha. Mascarado, vai para uma lista anônima, que só entra na ficha se um policial vir seu rosto durante a mesma perseguição. Fugiu, a lista some e não há inquérito.
- **Ficha** (`CrimeRecord`): `{ type, severity, timestamp }`, em hora absoluta de jogo.
  - O mesmo crime em seguida vira uma entrada só.
  - A ficha guarda no máximo 24 crimes; cheia, sai o mais leve.
  - Prescrição: gravidade × 2 dias.
  - Com gravidade total 8 ou mais sai **mandado**: o policial que vê seu rosto de perto inicia uma prisão de 1★, sem atirar.
- **Drenos de dinheiro**:
  - **Hacker** apaga a ficha por Σ(base × gravidade) × multiplicador de frequência (um `reduce`). O multiplicador cai com meia-vida de 24 h desde o último crime.
  - **Advogado** contratado: R$ 3.500 limpos por 7 dias. Corta a fiança pela metade e livra as armas do confisco.
  - **Delegado comprado**: 5+ corações do delegado do distrito engavetam o crime que a polícia não viu ao vivo. A perseguição continua, mas nunca vira INVESTIGATION.
- **ARRESTED**: fiança (base + por estrela + pela gravidade da ficha) e confisco de armas, joias, módulos de hack, chaves e ferramentas. Zera a ficha e as estrelas e põe o jogador em **condicional** de 48 h.

### Rastros e fuga (`src/crime/Traces.js`)

- Descrição da roupa: dura 2 dias e quebra trocando 2 de 3 peças longe da polícia.
- Testemunhas ligam depois que você sai (mais medo = mais demora) e abrem a **área de busca** (círculo amarelo no radar).
- Mascarado na rua, a polícia estranha (tecla **K** põe/tira).

### Joalherias e golpes (`src/crime/Heists.js`, `src/art/JewelryStyles.js`)

- 5 joalherias (4 de bairro + Maison do centro), interior próprio com vitrines. Quadro do golpe no estilo GTA V: alvo → reconhecimento (fotografar vitrines, câmeras e cofre) → abordagem furtiva (gás + janela do hacker) ou agressiva → preparativos (gás no porto, uniformes, armamento, carro de fuga) → equipe (hacker, motorista, atirador: ★ e corte; ganham experiência) → execução, carro de fuga, ponto de entrega e divisão (receptador 85%, cortes, azar da equipe ruim).

### Negócios próprios (`src/economy/Business.js`, aba 🏪 NEGÓCIOS em `src/ui/BusinessUI.js`)

- Compra legal (dinheiro limpo) de quase toda loja da cidade. Lucro diário no caixa (insumos, salários, aluguel, eventos), lavagem proporcional ao faturamento (perda 3,5–8%; acima de 50% do faturamento a Receita estranha), melhorias (reforma, equipamento, gerente, segurança, contador, marketing). Gráfico de lucro dos últimos 7 dias.

### Mecânica (`src/vehicle/CarCare.js`, `src/economy/Mechanic.js`, itens em `src/player/Items.js`)

- Motor, arrefecimento, óleo (com vazamento), bateria, freios, pneus e suspensão gastam e mudam a direção (falha, superaquecimento, partida que falha, freio longo, derrapagem, carro puxando). Painel com luzes de aviso. Capô para trocar peças você mesmo; oficinas Pay n Pay (orçamento, retífica, funilaria, pintura), borracharia nos postos, mecânico do morro (sujo, placa fria). Porta-malas por carro (salvo nos carros da garagem; revistado na prisão, menos com fundo falso).

### Corridas (`src/racing/StreetRacing.js`, `RaceCar.js`, `Speedway.js`, `RaceHUD.js`)

Referências: Need for Speed Underground 2 (rachas, reputação no meio, carros tunados, racha valendo o documento) e Burnout
(takedowns, capotamento e explosão em batida forte).

- **Onde**: pontos de racha na rua em frente a até 5 postos espalhados (anel aceso; 🏁 no mapa) e o **Autódromo Arena Sul**
  (🏎️), um oval de ~500 m (2 retas de 130 m, curvas de raio 38 m, pista de 15 m) com muros com colisão, arquibancada coberta com
  torcida, placar, torres de luz acesas à noite e o logo no gramado. Chegue de carro e aperte **E**: as provas do dia (mudam a cada
  6 h do jogo e com o seu nível).
- **Modalidades**: *racha 1×1* (reta de até 402 m achada no grafo das ruas, pela perna mais reta de cada cruzamento),
  *corrida de rua* (do A ao B pela rota do GPS, com o trânsito e **checkpoints** a cada ~150 m como no GTA V: cilindro, seta para o
  seguinte e o marcador no radar; vale passar pelo cilindro ou já adiante dele no traçado), *circuito* (retângulo em volta de
  quarteirões montado no grafo — reto, vira, reto, vira… até voltar por trás da largada; rotas de GPS de ida e volta foram
  descartadas porque repetiam as mesmas ruas e os carros rodavam em círculo), *autódromo* (3 a 8 voltas, até 8 carros) e o *racha
  valendo o documento* (nível Lenda do asfalto, só com carro seu).
- **Largada**: semáforo de 4 luzes; acelerar no VAI! dá nitro de graça (largada perfeita); acelerar no fim da contagem queima a
  largada (o carro fica segurado 0,8 s). **Nitro**: Shift / A do controle / botão NITRO no celular (`Vehicle.NOS_ACC` / `NOS_TOP`),
  uma carga por corrida, takedown enche 35%.
- **Rivais** (`RaceCar`, um `TrafficCar` com outro piloto): seguem o traçado por perseguição pura; a velocidade-alvo é o mínimo
  entre a máxima do carro × habilidade × elástico, as curvas à frente (v = √(μg·R), μg ≈ 20 m/s², freando a tempo) e quem está
  no caminho (trânsito e outros corredores: troca de lado para ultrapassar). Mantêm a faixa do grid (todos mirando o meio se
  espremiam e travavam na largada) e somam 2 m/s² à aceleração pedida (o atrito do chão comia metade dela). Presos, dão ré; muito
  tempo presos fora da tela, voltam para a pista. Carros por dificuldade: populares envenenados → esportivos → superesportivos,
  com neon, aerofólio e bodykit (Tuning).
- **Prêmios e reputação**: rua paga sujo (+25% à noite), autódromo paga limpo; 2º leva 40% e 3º 15% (no 1×1, só o vencedor).
  Reputação por colocação + 25 por takedown + 10 pela largada perfeita; 7 níveis (Desconhecido → Rei das ruas) liberam as provas
  maiores. Polícia a menos de 55 m de um racha na rua = 1★. Reputação, estatísticas e recordes vão no save (`racing`).
- **Burnout** (`Game._burnout`, `Game._crashPair`, `Vehicle.rollover`, `Config.crash`): a força da batida é a queda brusca de
  velocidade (dv) contra muro e poste e, carro contra carro, a velocidade com que os dois se aproximavam antes da pancada (o dv medido
  fica em 13–16 m/s mesmo a 140 km/h: o choque divide o impulso e a física espalha a pancada; e carro estacionado atingido nem
  registra batida própria — antes disso, batida entre carros nunca capotava). Pancada **de lado** acima de `rollDv` faz rolar (sempre
  acima de `rollAlways`, ≈ 85 km/h na porta de outro carro); **de frente ou de trás**, só acima de `flipDv`, e dá cambalhota (≈ muro de
  frente acima de 100–110 km/h); acima de `explodeDv` explode (o do jogador, só 8 m/s acima). Valem os dois carros da batida, cada um
  uma vez; com o carro do jogador, câmera lenta e tremor. Capotou de teto para baixo = carro perdido.

## Polícia: fuga possível a partir de 3★ (`src/police/*`, `Config.wanted` / `Config.heli`)

Antes, de 3★ para cima era impossível fugir (medido com um robô dirigindo pelas ruas, sem renderizar: 0 fugas em 6 tentativas,
até de esportivo): o helicóptero via a 100 u através dos prédios voando a 24 m/s (mais rápido que quase todo carro), os reforços
nasciam em volta da posição VERDADEIRA do jogador mesmo sem ninguém saber dela, qualquer policial a 32 u zerava a fuga atrás de
parede e as viaturas prensavam o carro do jogador contra a parede. Agora (estilo GTA V):

- **Cone de visão** (`fovCos`, ~70° para cada lado) com linha de visada; de perto (`nearSense`, 11 u) a polícia percebe em volta. O
  radar desenha os cones (vermelho = te vendo).
- **Área de busca**: perdeu de vista, as estrelas piscam e cada unidade varre um ponto do círculo onde te viram por último (puxado
  pelo rumo que você levava). Fora do círculo a fuga anda 1,8×; policial colado só PAUSA a contagem. Reforços nascem em volta da
  área, longe de você, e param de vir quando a pista esfria; bloqueios só de 4★ e em volta da área.
- **Helicóptero** (3★+, chega depois de 16 s): 18 m/s, segura você até 48 u (menos num alvo rápido), não vê debaixo de viaduto,
  ponte, túnel, toldo ou cobertura de posto e só te reacha no holofote; varre a área em espiral; autonomia de 70 s (3★) / 95 s (4★),
  depois vai abastecer por 35 s.
- **Viaturas** seguem o carro na cola e só às vezes tentam a batida (PIT); com o carro parado, freiam (dá para empurrar) e descem.
- Atirar num carro em movimento erra mais (`movingSpread`). **Pintura express** na oficina (sem ninguém vendo) zera as estrelas.
- Resultado no mesmo robô: a 3★ com polícia em cima, foge em boa parte das tentativas (esportivo ~3/4, mesmo com o helicóptero
  colado desde o início); sedã comum foge quando quebra a visão cedo — o helicóptero continua sendo o grande perigo.

## Interiores (`src/art/ShopArt.js` — `ShopCtx._polish`)

Todo interior (lojas, casas, bancos, joalherias) ganha um acabamento antes da luz: objetos de canto e de parede por tipo de lugar
(lixeira, planta, placa de piso molhado, cestas, caixas, engradados, bebedouro, cabideiro, porta-guarda-chuva, banco, pedestais com
corda; relógio, quadros, ar-condicionado, TV, neon, arandela, placa de saída, extintor, calendário), sombra de contato no piso junto
às paredes e móveis, piso encerado refletindo móveis e luzes (calhas fluorescentes no mercado), sujeira leve e marcas de sola na
entrada, rodapé, e luz com mais contraste e "temperatura" (quente em restaurante, bar e casa; fria em mercado e farmácia). Nada fecha
passagem: cada objeto testa folga e que a sala inteira continua alcançável a pé da porta. (O mesmo teste corrigiu o cofre das
pizzarias, que ficava num canto da cozinha sem acesso.)

## Interiores em alta definição (`src/art/InteriorHD*.js`, `src/art/ShopPieces.js`)

Os interiores eram pixel art a 20 px/u ampliada na tela. Agora são repintados em alta definição, no estilo de uma ilustração: luz
quente, sombras macias e materiais com textura.

- **Como funciona.** Os layouts continuam no motor de pixel art (`ShopStyles`, `HomeStyles`, `BankStyles`, `JewelryStyles`). É ele
  que decide móveis, sólidos, usos e enfeites, então nada muda no jogo. Enquanto pinta, o `ShopCtx` grava cada chamada:
  - as peças de cena (piso, casca da sala, balcão, mesa, cadeira…) viram operações com os seus parâmetros;
  - os traços soltos viram traços.

  No `finish`, a gravação é repintada num canvas Q vezes maior, na mesma ordem e no mesmo lugar. A textura sai desse canvas.
- **Resolução** (`InteriorHD.q`): Q = 2, 3, 4 ou 5 px de textura por px da arte, conforme o nível de gráfico (Low, Medium, High, HD).
  Ou seja, de 40 a 100 px por metro. O maior lado fica abaixo de 2048 (Low), 3072 (Medium/High) ou 4096 (HD), e do que a placa aceita.
- **Peças** (`InteriorHDArt.js` e `InteriorHDPieces.js`):
  - pisos: lajota com rejunte, bisel, lascas e manchas; xadrez encerado; tábuas com veio e nós; mármore com veios suaves; cimento
    queimado com rachaduras;
  - paredes: tijolo à vista, madeira, azulejo, papel de parede com lambri, bambu, painel perfurado, concreto, reboco;
  - móveis com degradê, contorno e sombra macia para sudeste;
  - itens de balcão: caixa registradora, bandeja, bolo, massa de pizza, espremedor…;
  - geladeiras de porta de vidro com as bebidas, máquinas de salgadinho e caixas eletrônicos;
  - prateleiras com produtos por tipo de loja: pão na padaria, remédio na farmácia, tênis na boutique.
- **Peças próprias de cada loja** (`ShopPieces.js`). O que os layouts desenhavam à mão virou peça com nome, a mesma pixel art e um
  pintor HD:
  - cozinha da lanchonete, forno a lenha e lenha da pizzaria;
  - araras, manequins e sacolas da boutique; aparelhos da academia;
  - prateleira de bebidas, sinuca e jukebox do bar; caixotes de fruta;
  - adega do italiano; tatame, balcão de sushi e lanternas do japonês;
  - painel e vitrines de armas; grafite e mesa da boca;
  - piano da mansão; letreiros, cofre, elevador, laser e porta do cofre do banco.
- **Parede do fundo alta.** A parede sobe para o espaço vazio acima dela, como no corte de uma casa de bonecas. Quadros, janelas,
  relógios, letreiros, espelhos, prateleiras de bebida e câmeras sobem junto e são pintados antes dos móveis, que os cobrem. As
  laterais viram vigas na altura toda.
- **Luz** (`HDPainter.post`): ambiente um pouco escuro com as poças das lâmpadas por multiplicação, brilho colorido somado (o fogo do
  forno esparrama mais), a "temperatura" do lugar, vinheta e um toque de saturação e contraste.
- **Esconderijo** (`InteriorHDHome.js`): o barraco tem pintor próprio, com contrapiso rachado, zinco e bloco sem reboco, colchão nos
  paletes, armário de porta empenada, fogareiro, geladeira amassada, balde da goteira, varal e lâmpada pelada.
- **Custo.** Só se pinta ao entrar, durante o escurecimento, e as quatro salas mais recentes ficam guardadas. Medido num ambiente sem
  placa de vídeo, no gráfico alto: 0,1 a 0,4 s por sala; na pixel art eram cerca de 0,15 s.
  - O canvas é rasterizado na CPU (`InteriorHD.CTX`). No canvas acelerado a pintura ficava enfileirada e era toda feita na primeira
    cópia entre canvases; com o navegador ocupado, isso chegou a 17 s numa sala.
  - Os canvases de apoio (máscara e mapa de luz) são reaproveitados. O mapa de luz é feito na resolução da arte.
  - O canvas da sala é liberado quando a textura sai do cache. Os ladrilhos de ruído são três, compartilhados.
  - `tests/24_interiores` repinta todas as salas e confere que sólidos, usos, entrada e assentos saem iguais com e sem o HD.
- **Volta à pixel art:** `Config.art.interiorHD = false` ou `?pixel` na URL.

## Cidade em alta definição (`src/art/CityHD*.js`)

As texturas da cidade (antes pixel art a 20 px/u do `TileFactory`) são repintadas no mesmo estilo dos interiores: material de verdade,
degradês, contorno fino e sombra macia, com luz do noroeste.

- **Mesmo desenho.** Cada ladrilho tem o tamanho do de antes no mundo e as mesmas coisas no mesmo lugar: rua de 8 × 10 u com as
  linhas de bordo e o tracejado amarelo, faixa de pedestres de 10 × 3 u, calçada de placas de 1 u, telhados de 8 u, fachadas de 6 u
  (2 baias × 2 andares). O `WorldBuilder` não muda as UVs dos pisos e telhados. Os pintores desenham nas coordenadas da arte, num
  canvas Q vezes maior.
- **Resolução** (`CityHD.Q`): Q = 2 no Low e no Medium, 3 no High e 4 no HD (40, 60 e 80 px por metro). Memória de vídeo das
  texturas da cidade: cerca de 44 MB (Q = 2), 99 MB (Q = 3) e 176 MB (Q = 4); na pixel art eram 11 MB.
- **Sem emenda.** O ruído é periódico no ladrilho (`CityHD.vn`/`fbm`), o que cruza a borda é desenhado também do outro lado
  (`CityTile.wrap`), e as juntas que caem na divisa (concreto, chapa) ficam inteiras dos dois lados.
- **Pisos** (`CityHD.js`): asfalto com brita, mosqueado, trincas seladas com piche e remendos; rua com trilhas de pneu, fio de óleo,
  sarjeta, tinta gasta e tachões; faixa de pedestres gasta onde os pneus passam; calçada de placas com junta e quina, chiclete e
  trincas; grama com folhas, trevos e florzinhas; areia com ondulações; concreto com marca de régua e juntas; praça de granito;
  terra da favela com remendo de cimento e cacos de tijolo; terra batida, pedra com estratos e musgo.
- **Telhados** (`CityHDRoofs.js`): manta e laje com emendas, poças secas, ralo, ar-condicionado com ventilador e cano de cobre e
  respiros; telha colonial em fiadas com sombra e cumeeira; chapa com junta em pé e claraboia; zinco ondulado com ferrugem
  escorrendo, pregos, pneus e pedras; lona com rugas e cordas; laje crua com ferro de espera, varal e parabólica; laje pintada do
  Mirante com vasos, ombrelones, cadeiras de plástico e varal de lâmpadas; telhado verde. As casas de máquinas no alto dos prédios
  (antes caixas cinza lisas) ganham tampa de chapa com grelha e laterais de veneziana com portinhola.
- **Fachadas e lojas** (`CityHDFacades.js`): tijolo com argamassa, reboco com umidade e escorridos, enxaimel, pedra, galpão de chapa,
  concreto com furos de tirante e pele de vidro; janelas com vidro refletindo o céu, caixilho, peitoril, verga, venezianas e
  floreiras. As vitrines das lojas têm letreiro com o nome escrito, ícone, prateleiras com produtos e porta de vidro.
- **O barraco do protagonista por fora** (`CityHD.house`, usado pelo `HouseView`): tijolo com o reboco caído, zinco com ferrugem,
  tábua pintada descascando, porta turquesa, janela com cortina e o telhado de zinco com pneus, pedras, ripas, remendo e caixa-d'água.
- **Custo.** Pintado uma vez, na carga: 0,7 s com Q = 2 e 1,3 s com Q = 3 num ambiente sem placa de vídeo (a pixel art levava
  0,35 s). Os canvases são liberados assim que a textura vai para a placa.
- **Fica em pixel art:** o mar animado (`TileFactory.water` + `WaterPlugin`). O chão do mundo grande também é HD (ver abaixo).
- **Volta à pixel art:** `Config.art.cityHD = false` ou `?pixel` na URL.

### Janelas acesas à noite (`src/render/WindowLights.js`)

As janelas não acendiam: a luz era o `emissiveTexture` da fachada, com o nível mudando à noite, e os materiais do mundo são
congelados depois da carga (`Game._freezeStaticMaterials`). Com o material congelado, o Babylon não reenviava o nível.

- Agora a luz é um plugin de material, como o `RevealPlugin`: o uniform vai a cada desenho, então funciona com o material congelado.
- O ladrilho de luz de cada fachada tem todas as janelas acesas. Cada uma tem o que se vê da sala: abajur, cortina com pregas,
  persiana, voal, o vulto de uma planta ou do sofá; nos escritórios, luminárias, persiana meio baixada, divisórias e monitores. A luz
  vaza um pouco na parede em volta.
- **Uma a uma.** Cada janela ocupa sozinha uma célula da grade do estilo (`CityHD.GRID`). O shader sorteia a célula: acesa ou não,
  luz quente, neutra ou fria, e algumas com a TV ligada (azul, piscando). Cada prédio e cada lado têm um deslocamento inteiro nas UVs
  da parede: o desenho é o mesmo, mas nenhum prédio repete o sorteio do vizinho.
- **Pela hora** (`WindowLights.HOME`, `OFFICE`): as casas acendem ao escurecer (cerca de 70% às 19h30) e vão apagando madrugada
  adentro (12% às 4h); alguns acordam cedo. Escritórios e galpões ficam acesos no fim do expediente e esvaziam à noite. Com chuva
  forte de dia, as janelas também acendem.
- Letreiros e vitrines das lojas acendem inteiros.
- `tests/26_cidade_hd` confere a resolução, ladrilhos sem emenda, cada janela dentro da sua célula, a fração pela hora, o quadro
  mais claro com as janelas acesas na favela à noite e a volta à pixel art.

## Sprites do mapa em alta definição (`src/art/SpriteHD.js`)

Árvores, arbustos, palmeiras, guarda-sóis, pedras, tufos de grama, pássaros e os bichos da roça continuam os mesmos modelos do
`SpriteBaker` (esferas, elipsoides, cápsulas e caixas), mas o assado é outro.

- **Resolução** (`SpriteHD.Q`): 1,5 px de textura por px da arte no Low, 2 no Medium e no High, 3 no HD.
- **Cor de verdade** (RGBA pré-multiplicado, sem a paleta de 5 tons): luz contínua do noroeste, sombra que esfria e luz que
  esquenta, como a rampa da pixel art, sem os degraus.
- **Detalhe por material**, calculado no ponto 3D atingido: folhas (cada folha com a sua inclinação e o vão escuro entre elas),
  agulhas, casca, pedra (relevo, fendas, musgo e líquen), tecido, penas, pelo, palha, plástico e metal.
- **Oclusão de ambiente** (o miolo da copa, a base das pedras), contorno fino na silhueta, borda suavizada e **sombra projetada
  macia** no chão, no sentido da luz do mundo.
- **Vento sem quadros de animação** (`PropSprites.createHD`): cada quadro leva um mapa de altura; o shader das plantas entorta a
  copa pelo vento vezes a altura (o pé fica parado). Intensidades suavizadas: amplitude, inclinação, tremor das folhas e ritmo.
- **Tufos de grama** (`PropSprites` linhas 25 e 26): moitas de 34 a 46 folhas, verdes ou secas, espalhadas nos quarteirões de grama
  (`CityGrid._fillProps`) e nos biomas do mundo grande (campo, mata, cerrado e roça — `TerrainBuilder`).
- **Pássaros** (`Birds._atlasHD`): penas com sombra macia em blob. **Bichos da roça** (`Livestock._hdInit`): três variantes de
  pelagem por espécie, assados aos poucos durante o jogo (~4 ms por quadro), porque só existem na Vila da Roça.
- **Chão em relevo** (`CityHD`): a grama ganhou relevo (domos e folhas com sombra e brilho), a pedra profundidade (estratos, fendas
  e oclusão), e o chão do mundo grande (`TerrainSplat`) passa a ser HD: mata (serrapilheira), cerrado, brejo e três roças, com um
  atlas de perto e outro com a metade da resolução para longe (troca pela distância, em WebGL2).
- **Custo** (sem placa de vídeo): props ~1 s, pássaros ~0,4 s na carga; bichos ~1 s espalhado no jogo.
- **Volta à pixel art:** `Config.art.spriteHD = false` ou `?pixel` na URL.

### Rastro de pneu na grama e na areia (`src/world/TireTracks.js`)

Carro, moto e bicicleta deixam a marca das rodas por onde passam fora do asfalto (as rodas de trás; a moto e a bicicleta, uma).

- **Areia:** o sulco afundado com o desenho da banda (blocos em V do carro, cravos da moto, pontinhos da bicicleta) e a areia
  empurrada para os lados num montinho mais claro. O relevo é calculado no shader e iluminado pelo sol do mundo: a parede do sulco
  do lado do sol fica na sombra, a do outro lado clareia.
- **Grama:** a faixa amassada (folhas deitadas, mais clara e amarelada) com terra arrancada pelos blocos da banda. Na chuva, e no
  brejo, vira lama escura.
- **Derrapando ou arrancando forte** no chão mole o rastro alarga e levanta poeira (areia ou terra) — e não fica a marca preta de
  borracha do asfalto (`SkidMarks`).
- **Some aos poucos:** grama ~45 s (a grama levanta), areia ~70 s (o montinho assenta).
- **Onde:** quarteirões abertos de grama e praia (parque, mata, praia) e os biomas de campo, mata, cerrado, roça, areia e brejo do
  mundo grande; nunca em asfalto, calçada, estrada de terra, ponte ou água (`TireTracks.surface`, com cache por 0,5 m).
- **Um desenho só:** anel de 2400 trechos numa malha; os trechos de cada roda são emendados (sem fresta nem sobreposição nas
  curvas). A cor é **modulada** (2 × origem × destino): o rastro escurece e clareia o chão que já está lá, então combina com
  qualquer grama ou areia, de dia, de noite e na chuva.
- `tests/27_sprites_hd` confere os sprites HD (borda macia, vento pelo shader, tufos, pássaros, bichos), os pisos novos sem emenda,
  o chão do rastro (grama e areia sim; asfalto e água não), um carro de verdade deixando rastro na areia e o quadro mudando onde ele
  passou.

## Personagens (`tools/asset_baker/generator/*` no build, `src/art/NpcArt.js` no jogo)

Braços soltos ao lado do corpo (sem o ar de "gorila"), cabeça um pouco maior (rosto e cabelo mais legíveis de cima), silhueta
feminina de verdade (ombros mais estreitos, braços finos, quadril), luz principal mais marcada com recorte nas bordas e dobras mais
fundas; os atlas foram gerados de novo. No jogo, de longe (dirigindo, celular, tela pequena) o boneco passa a ser filtrado (média
sobre a pegada do pixel) em vez de serrilhar e "ferver" andando. Depois, o visual passou a ser o de um render 3D: sem o contorno preto
em volta, silhueta com borda suavizada (cobertura do pixel guardada no atlas), sombra no chão em degradê e ampliação lisa de perto.

## Armas especiais (`src/combat/Combat.js` → `Weapons`, `src/combat/Rockets.js`)

- **Pistola com silenciador** (`pistol_sil`, tecla 2 duas vezes): `silenced` — só quem está a < 8 u e vê percebe; não chama a polícia
  de longe (o mesmo caminho do silenciador do Armeiro: `CareerCore.silenced`).
- **RPG** (`rpg`) e **lança-foguetes** (`launcher`), tecla `=`: disparam foguetes (`Rockets`), em 3D de verdade, com chama, fumaça,
  arma depois de 4 m. No chão a explosão é a de carro (`CarDamage.boomAt`); no ar, uma bola de fogo que só fere quem voa. Acerto direto
  no helicóptero da polícia (`Config.heli.hp` 380) derruba: RPG 520, lança-foguetes 400. O RPG é livre (mirado no helicóptero, sobe
  até ele com espoleta de proximidade); o lança-foguetes trava no alvo à frente (helicóptero > viatura > carro, anel vermelho) e
  persegue com até 3,2 rad/s.
- **Minigun** (`minigun`): gira os canos por 0,5 s (`spinUp`) e atira a cada 0,05 s; o clipe de tiro fica em loop enquanto atira.
- As três pesadas deixam o personagem mais lento (`heavy`, fator da velocidade a pé) e recarregam devagar (`reload`). Só a boca de
  fumo vende (estoque garantido, caras); munição: `ammo_rpg`, `ammo_rk`, `ammo_belt`.

## Roda de armas (`src/ui/WeaponWheel.js`)

Como a do GTA V: segurar **Tab** (teclado), **LB/L1** (controle) ou tocar o botão **ARMA** (celular) abre uma roda com 8 categorias
(corpo a corpo, pistolas, submetralhadoras, fuzis, metralhadora, pesadas, arremessáveis, escopetas). O mouse (direção do cursor), o
analógico direito ou o dedo escolhem a fatia; roda do mouse, ←/→ do direcional ou as setas ‹ › trocam dentro da categoria; soltar
equipa (`Game.equipWeapon`). O centro mostra nome, munição e barras de dano/cadência/precisão/alcance. Aberta, o tempo corre a 30%
e o ataque não sai. Toque rápido: Tab volta à arma anterior, LB passa para a próxima. No celular a roda fica aberta depois do toque
(tocar na fatia equipa, no centro recarrega, fora fecha) ou segue o dedo arrastado a partir do ARMA; o tamanho acompanha o menor lado
da tela (até 94%).

## Peso e espaço (`src/player/Bags.js`, `Inventory.body`)

- Até **3 armas no corpo** (bandoleira, cinto, coldre — sempre as 3 maiores): não ocupam a grade da mochila e pesam metade. Com os
  bolsos (3×2) dá para levar pistola, escopeta e fuzil e ainda ter espaço para munição e kit.
- Carga confortável maior em todas as bolsas (bolsos 12 kg … mochila tática 46 kg). Até 70% da carga não há perda; até 100%, −12%;
  acima disso a velocidade cai aos poucos e só acima de 125% (`Bags.OVER`) é sobrecarga (sem correr). O limite para pegar mais coisa
  é 2× a carga (`Bags.HARD`). Correr com peso cansa menos.

## Interface (`src/ui/Theme.js`)

Interface moderna em HD, separada do mundo em pixel art: tokens de cor/raio/sombra em `:root`, fontes Inter (texto) e Outfit (títulos/números), cartões de vidro desfocado, botões arredondados. Ícones próprios do jogo no lugar dos emojis: a fonte **DM Icons** (`assets/ui/dm-icons.woff2`, gerada por `tools/ui_icons`) tem um desenho para cada emoji que a interface usa — adesivo com borda clara, contorno escuro grosso e faixas de sombra e luz, como as armas pintadas — e vem na frente das pilhas de fonte, então texto, HTML e canvas saem com ela sem mudar os textos. As armas (HUD, roda, inventário, lojas) são a arte pintada da folha `tools/ui_icons/source/armas_hud.jpg` (`WeaponArt.load`); a SMG, a escopeta e o foguete, que não estão na folha, seguem com o desenho vetorial (`WeaponArt.VGrid`).

## Próximos passos recomendados (por impacto × custo)

| # | Ideia | Custo | Efeito no retorno do jogador |
|---|---|---|---|
| 1 | Tutorial guiado de 3 min (1º assalto → 1º negócio → 1ª fuga) e seta de objetivo no GPS | médio | Reduz abandono nos primeiros 5 min |
| 2 | "Juice" de ganho: `+R$` flutuante, shake leve, som de caixa, tela de promoção de patente | baixo | Torna cada ganho gratificante |
| 3 | Mais tipos de missão fora da favela (roubo de carro sob encomenda, fuga com passageiro, entrega de risco pela cidade) | médio | Quebra a repetição |
| 4 | Missão/evento diário ("hoje o chefe quer X") com recompensa dobrada no 1º cumprimento do dia | baixo | Motivo para voltar |
| 5 | Seguro da prisão/morte nas primeiras horas (perde só parte do dinheiro) | baixo | Evita o "perdi tudo" |
| 6 | Estatísticas de carreira na tela de pausa (total roubado, fugas, tempo de jogo) | baixo | Sensação de investimento |
| 7 | Rivalidade entre facções com mapa de território disputável (o jogador muda de dono) | alto | Meta de endgame |

## Nota sobre balanceamento (a validar com testes de jogo)

- Primeira arma barata (`pistol` ≈ R$ 450) × ganho das primeiras missões (≈ R$ 140–230 por entrega) → ~2–3 missões para armar-se; ritmo bom.
- Fachada mais barata (R$ 3.200) × capacidade de lavagem (R$ 1.500/dia/fachada, perda 32%→12%) → o "meio do jogo" depende de missões de alto valor; confira se o dinheiro sujo não trava antes da 1ª fachada.
- Imóveis e reformas devem escalar com o patrimônio (as metas acima vão até R$ 1 milhão para mostrar o teto).
