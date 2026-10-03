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
