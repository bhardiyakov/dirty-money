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

| Carreira | Jogável agora | Skills (efeito real no jogo) | Em breve |
|---|---|---|---|
| Desmanche | Puxada (popular → desmanche; amassado derruba o pagamento), Encomenda de luxo (rastreador com timer → polícia na coordenada; adulteração parada na oficina), Frota do tráfico, gestão de desmanches (renda × suspeita da Receita) | Mecânica: ligação direta (nova, para todo carro trancado) e arrombamento; Direção: aderência e giro do carro que você dirige | peças compradas, blindagem/fundo falso como itens |
| Ladrão | Levantar a fita (sem correr/arma/polícia; disfarce), Invasão noturna (ruído, alarme com tempo para abafar, peso que deixa você lento, receptador) | Furtividade: ruído; Eletrônica: segundos antes do alarme | transportadora/banco com planejamento |
| Armeiro | Catar sucata (cenas de tiroteio reais e zonas de conflito), bancada (5 receitas), venda aos vapores com chance de travar | Engenharia: material e falhas; Inteligência: receitas | contratos com facções, sequestro |
| Estelionato | Chupa-cabra (instalar sem ninguém olhando), celulares em furtos em bairro rico, central de golpes com rastreio e VPN, lavagem via cripto | TI: rastreio e instalação; Lábia: chance e lucro | botnet, defesa dos servidores |
| Jogo do Bicho | Banca (turno, rapa, malote com pivetes), Rota do recolhe (blitz), Banqueiro (pontos por zona, arrego, rival, matador), Patrono (escola de samba → imunidade política) | Influência: arrego; Segurança: assaltos e blitz | eventos de carnaval, opinião pública |

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
