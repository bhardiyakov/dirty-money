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
| Eventos de mundo: operação policial, baile funk, olheiros, barricadas | `PoliceOperation`, `Baile`, `FavelaWatch` | Dão "histórias" emergentes. |
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

Joystick (borda = correr) + ATACAR + até 2 botões de contexto que aparecem sozinhos (lidos da dica de interação) + chip da arma (toque troca, segurar recarrega) + ✚ KIT com vida baixa + menu ⋯ com as ações raras; topo: pausa e carreiras; pinça = zoom.

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

## Assaltos, golpes, negócios e mecânica

### Assalto a lojas (`src/crime/Robbery.js`, carreira ASSALTANTE em `src/careers/CareerRobber.js`)

- Dentro de qualquer loja assaltável, com arma de fogo na mão no balcão: **E** anuncia o assalto. O atendente levanta as mãos e os fregueses viram **reféns** (deitados).
- **Porte × patente**: Pé-de-chinelo (conveniência, padaria, lanchonete, farmácia, saladas) → Assaltante (bar, pizzaria, boutique, academia) → Profissional (restaurantes finos, loja de armas, vitrines de joalheria) → Mestre do Golpe (a Maison do centro). Sem a patente, o assalto não sai.
- **Medo** (atendente, segurança e reféns) sobe com você perto e de frente com a arma, com o grito (**G**) e com o tiro de aviso (ataque). Medo baixo = alarme silencioso, refém levantando e correndo para a porta (chama a polícia e descreve você), balconista/segurança armado sacando a arma.
- **Fazer a limpa** nos pontos marcados no chão: caixa (o atendente esvazia), cofre e gravador das câmeras (todo interior de loja ganhou um escritório nos fundos — `ShopCtx._backOffice`), prateleiras (mercadoria para o receptador), carteiras dos reféns, vitrines. Abraçadeiras amarram reféns; a furadeira corta o tempo do cofre.
- **Polícia**: só depois do chamado começa a contagem (porte, policiamento do distrito, noite, Sangue-frio). Zerou lá dentro: **cerco** (Lábia, escudo humano, sair atirando, render-se). A loja fica fechada até o dia seguinte.

### Rastros e fuga (`src/crime/Traces.js`)

- Descrição da roupa (2 dias, quebra trocando 2 de 3 peças longe da polícia), rosto (sem balaclava), câmeras (DVR), digitais (luvas), placa anotada (quem foge de carro de perto da cena), **inquérito** 0–100% com **mandado de prisão** em 100% e advogado para esfriar.
- Testemunhas ligam depois que você sai (mais medo = mais demora) e abre a **área de busca** (círculo amarelo no radar). Mascarado na rua a polícia estranha (tecla **K** põe/tira).

### Joalherias e golpes (`src/crime/Heists.js`, `src/art/JewelryStyles.js`)

- 5 joalherias (4 de bairro + Maison do centro), interior próprio com vitrines. Quadro do golpe no estilo GTA V: alvo → reconhecimento (fotografar vitrines, câmeras e cofre) → abordagem furtiva (gás + janela do hacker) ou agressiva → preparativos (gás no porto, uniformes, armamento, carro de fuga) → equipe (hacker, motorista, atirador: ★ e corte; ganham experiência) → execução, carro de fuga, ponto de entrega e divisão (receptador 85%, cortes, azar da equipe ruim).

### Negócios próprios (`src/economy/Business.js`, aba 🏪 NEGÓCIOS em `src/ui/BusinessUI.js`)

- Compra legal (dinheiro limpo) de quase toda loja da cidade. Lucro diário no caixa (insumos, salários, aluguel, eventos), lavagem proporcional ao faturamento (perda 3,5–8%; acima de 50% do faturamento a Receita estranha), melhorias (reforma, equipamento, gerente, segurança, contador, marketing). Gráfico de lucro dos últimos 7 dias.

### Mecânica (`src/vehicle/CarCare.js`, `src/economy/Mechanic.js`, itens em `src/player/Items.js`)

- Motor, arrefecimento, óleo (com vazamento), bateria, freios, pneus e suspensão gastam e mudam a direção (falha, superaquecimento, partida que falha, freio longo, derrapagem, carro puxando). Painel com luzes de aviso. Capô para trocar peças você mesmo; oficinas Pay n Pay (orçamento, retífica, funilaria, pintura), borracharia nos postos, mecânico do morro (sujo, placa fria). Porta-malas por carro (salvo nos carros da garagem; revistado na prisão, menos com fundo falso).

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

## Personagens (`src/art/npcgen/*`, `src/art/NpcArt.js`)

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

Interface moderna em HD, separada do mundo em pixel art: tokens de cor/raio/sombra em `:root`, fontes Inter (texto) e Outfit (títulos/números), cartões de vidro desfocado, botões arredondados. Ícones no estilo emoji (Noto Color Emoji, igual em todo aparelho); armas de fogo e munição são arte vetorial HD (`WeaponArt.VGrid`) no mesmo estilo.

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
