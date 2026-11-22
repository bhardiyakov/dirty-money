// ============================================================================
// GuideCrime — capítulos do GUIA (aba GUIA do menu) sobre assaltos, rastros, golpes, negócios, mecânica e corridas. Entram em GuideUI.PAGES;
// o índice fica em ui/GuideUI.js (grupo "ASSALTOS, NEGÓCIOS E CARROS").
// ============================================================================

Object.assign(GuideUI.PAGES, {
    robbery: () => `<h2>Assalto a lojas</h2>
        <p>Carreira <b>ASSALTANTE</b> (aba CARREIRAS). Entre numa loja aberta com <b>arma de fogo na mão</b> e, no balcão, aperte <b>E</b> para anunciar o assalto. Guarde a arma (1) para comprar normalmente.</p>
        <h3>Porte da loja e patente</h3><ul>
        <li><b>Pé-de-chinelo</b>: conveniência, padaria, lanchonete, farmácia, saladas.</li>
        <li><b>Assaltante</b>: bar, pizzaria, boutique, academia.</li>
        <li><b>Profissional</b>: restaurantes finos, loja de armas (o balconista é armado) e as vitrines das joalherias.</li>
        <li><b>Mestre do Golpe</b>: o grande golpe na joalheria do centro.</li></ul>
        <h3>Controlar a loja</h3><ul>
        <li>Atendente e reféns têm <b>medo</b>: sobe com você perto e de frente com a arma; cai sozinho.</li>
        <li><b>G</b> grita (todo mundo no chão). <b>Atacar</b> dá um tiro de aviso no teto: todos gelam, mas o tiro pode ser ouvido lá fora.</li>
        <li>Com medo baixo, o atendente aperta o <b>alarme silencioso</b>, um refém <b>levanta e corre</b> para a porta (se sair, chama a polícia) e o segurança ou o balconista armado <b>saca a arma</b> — grite antes que ele atire.</li>
        <li><b>Abraçadeiras</b> (boca de fumo) amarram um refém: esse não foge mais.</li></ul>
        <h3>Fazer a limpa (pontos brilhando no chão)</h3><ul>
        <li><b>Caixa</b>: o atendente esvazia — só anda com ele com medo e você perto.</li>
        <li><b>Cofre</b> do escritório: o gerente abre com medo alto (depois do caixa); senão você arromba (a <b>furadeira</b> corta o tempo pela metade).</li>
        <li><b>Prateleiras</b>: mercadoria pesada, vendida no receptador da favela. <b>Reféns</b>: carteira e celular. <b>Vitrines</b> da joalheria: joias (o sensor do vidro dispara o alarme).</li>
        <li><b>Gravador (DVR)</b>: arrancar o HD apaga as câmeras.</li></ul>
        <h3>A polícia</h3><ul>
        <li>Enquanto ninguém chama, não há cronômetro (mas um pedestre pode ver pela vitrine). Chamaram: <b>contagem regressiva</b> — mais curta em loja grande, no centro e na ilha; mais longa de noite e com a skill <b>Sangue-frio</b>.</li>
        <li>Zerou com você lá dentro: <b>CERCO</b>. Lábia (trégua), sair com um refém de <b>escudo</b> (a polícia segura o fogo uns segundos), sair atirando ou se render.</li>
        <li><b>A resposta tem o tamanho da loja.</b> Padaria, conveniência, farmácia: uma viatura que demora, <b>1★</b> se ela te pegar na porta (não atiram se você não atirar), crime leve na ficha e busca curta; saindo atirando, 2★. Bar, pizzaria, roupas, academia: 2★ na porta, 3★ atirando. Restaurante de luxo, loja de armas e joalheria: polícia rápida, 2★ na porta, 3★ atirando e área de busca grande — vá com estrutura (Sangue-frio, máscara, carro de fuga, golpe com equipe).</li>
        <li>A loja assaltada fica fechada até o dia seguinte (perícia).</li></ul>`,

    burglary: () => `<h2>Roubo furtivo e invasão de casas</h2>
        <p>Sem arma, sem refém, sem atendente: entrar onde <b>não tem ninguém acordado</b>, levar o que der e sair sem deixar pista. Rende XP na carreira <b>LADRÃO</b>; a mercadoria vai para o receptador da favela.</p>
        <h3>A energia do quarteirão</h3><ul>
        <li>Todo quarteirão com loja ou casa tem uma <b>caixa de força</b> cinza na fachada (placa amarela). <b>E</b> sabota (uns 3 s, com faíscas): o quarteirão apaga por <b>4 a 7 horas</b> — postes e vitrines escuros, <b>alarmes e câmeras desligados</b> (as da fachada e as de dentro), e as lojas <b>fecham</b> ("sem energia"), até as abertas.</li>
        <li>Derrubar um <b>poste</b> com o carro também apaga os quarteirões em volta.</li>
        <li>Sabotar é delito leve: só conta se a polícia te pegar no ato. Sem luvas, você deixa digitais na caixa.</li></ul>
        <h3>Loja fechada</h3><ul>
        <li>Na porta de uma loja fechada (de madrugada, ou sem energia): <b>E arrombar a porta</b> — o mini-game da fechadura (o <b>kit de gazuas</b>, vendido na boca, e a skill <b>Eletrônica</b> facilitam). Errou demais: a porta vai no tranco — barulho e marca de arrombamento.</li>
        <li>Lá dentro é <b>escuro</b> (a lanterna do celular acende sozinha). Pontos no chão: a <b>gaveta do caixa</b> (o troco da noite), o <b>cofre</b> (o apurado do dia dorme nele: o grande prêmio — furadeira corta o tempo, mas faz barulho), as <b>prateleiras</b> (mercadoria; na <b>loja de armas</b>, armas e munição sem registro), as <b>vitrines</b> da joalheria e o <b>gravador</b> das câmeras.</li>
        <li><b>Com energia</b>: o sensor de presença dispara o alarme em uns segundos — corra até a <b>central do alarme</b> ao lado da porta e desligue (E). As câmeras gravam até você arrancar o HD.</li></ul>
        <h3>Casas e apartamentos</h3><ul>
        <li>Parado (ou agachado) na porta de uma casa ou prédio: <b>E arrombar</b>. O padrão do bairro decide o interior e o que tem: <b>casa de família</b>, <b>kitnet</b>, <b>casa da vovó</b>, apartamento, cobertura, mansão. Alarme a partir do apartamento médio; <b>câmera Wi-Fi</b> nas de alto padrão (grava na nuvem — só cortando a energia).</li>
        <li><b>Quem está em casa</b>: de madrugada, todo mundo <b>dormindo</b> (dá para entrar — <b>agachado</b> perto da cama, ande devagar: barulho acorda, a pessoa grita, liga 190 e vê seu rosto); dia útil à tarde, a maioria <b>trabalhando</b> (a vovó quase nunca sai); fim de semana de sol, na praia; à noite, todos acordados (não dá).</li>
        <li>O que levar: embaixo do <b>colchão</b>, as <b>gavetas</b> (dinheiro e joias), o <b>guarda-roupa</b> (relógio, bolsa de grife), a <b>TV</b> e o videogame (8 kg), o <b>notebook</b>, o <b>cofre</b> (às vezes com um revólver), a <b>prataria</b> da cristaleira e o <b>porta-joias</b>.</li></ul>
        <h3>Pistas e a perícia</h3><ul>
        <li><b>Digitais</b>: sem <b>luvas</b>, tudo o que você toca fica marcado — dá para <b>limpar</b> perto da porta antes de sair (E, uns 6 s).</li>
        <li><b>Vídeo</b>: câmeras gravando (energia ligada e HD no lugar). De <b>balaclava</b>, só mostra um mascarado.</li>
        <li><b>Testemunhas</b>: alguém na rua vendo você entrar ou sair; o morador que acordou. <b>Barulho</b> alto: alguém lá fora ouve e liga 190.</li>
        <li>A polícia só investiga quando <b>descobrem</b>: na hora (alarme, vizinho, morador), quando a loja <b>abre</b>, quando o morador <b>acorda</b> (6h30) ou <b>volta</b> do trabalho (18h30). Duas horas depois chega a <b>perícia</b> (o chip no canto da tela avisa): digitais → seu nome na ficha (inquérito); vídeo ou morador → a ficha e a descrição da roupa. Sem nada: <b>caso arquivado</b>.</li>
        <li>A mesma loja ou casa não dá para arrombar de novo por 3 dias (fechadura nova).</li></ul>`,

    traces: () => `<h2>Rastros e fuga</h2>
        <p>O que você deixa para trás num assalto vira prova (painel no canto direito, abaixo do HUD):</p><ul>
        <li><b>Descrição da roupa</b>: testemunhas e câmeras descrevem parte de cima, calça e cabeça. Por 2 dias, um policial que te veja de perto com 2 dessas 3 peças te reconhece. <b>Troque de roupa</b> longe da polícia (leve uma muda).</li>
        <li><b>Flagrante</b>: só conta quem te viu NA HORA do crime — policial (cone de visão), câmera de fachada ou da loja, ou pedestre olhando. Ninguém viu = crime perfeito, nada na ficha. Visto pela polícia: estrelas pela gravidade; só câmera/testemunha: 1★.</li>
        <li><b>Máscara</b>: sem máscara, o flagrante vai para a sua <b>ficha</b>. Mascarado, a polícia te persegue mas não sabe quem é — fuja e tire a máscara longe dela. Tirar na frente de um policial durante a perseguição te identifica. <b>K</b> põe/tira — mascarado na rua a polícia estranha e aborda.</li>
        <li><b>Câmeras</b>: arranque o HD do gravador (DVR) — ou corte a energia do banco — antes de agir.</li>
        <li><b>Ficha</b>: com crimes na ficha você fica <b>sob investigação</b> (a polícia não atira à primeira vista). Crimes graves somados dão <b>mandado</b>: o policial que vê seu rosto de perto tenta te prender. Os crimes prescrevem com os dias (os leves antes).</li>
        <li><b>Hacker</b> apaga a ficha (dinheiro sujo; fica mais barato quanto mais tempo desde o último crime). <b>Advogado</b> contratado (7 dias, dinheiro limpo) corta a fiança pela metade e livra as armas se você for preso. <b>Delegado comprado</b> (5♥ no Império) engaveta o que a polícia não viu ao vivo no distrito dele. Aba CARREIRAS › Assaltante.</li>
        <li><b>Preso</b>: fiança, armas e itens ilícitos confiscados, ficha zerada e <b>condicional de 48 h</b> — qualquer flagrante nela já vem com 3★.</li>
        <li><b>Área de busca</b>: quando as testemunhas ligam depois que você saiu, o radar mostra um círculo <b style="color:#f5be28">amarelo</b> onde as viaturas procuram. Saia dele, não corra perto da polícia e se esconda se precisar.</li></ul>`,

    heists: () => `<h2>Joalherias e golpes</h2>
        <p>A cidade tem <b>5 joalherias</b> (💎 no mapa): 4 de bairro e a <b>Maison Diamante</b> no Distrito Financeiro. Como Profissional dá para quebrar as vitrines sozinho; o dinheiro grande está no <b>golpe planejado</b> (aba CARREIRAS › Assaltante › <b>Abrir o quadro do golpe</b>):</p><ol>
        <li><b>Alvo</b>: escolha a joalheria (a Maison pede Mestre do Golpe).</li>
        <li><b>Reconhecimento</b>: entre sem arma, no horário, e fotografe vitrines, câmeras e cofre (E).</li>
        <li><b>Abordagem</b>: <b>furtiva</b> (gás pelo duto: todos dormem e o hacker desliga alarme e câmeras por um tempo) ou <b>agressiva</b> (invasão armada: alarme na hora, 3★ na saída; o atirador segura os reféns e o hacker atrasa a polícia).</li>
        <li><b>Preparação</b>: furtiva — gás (porto) e uniformes; agressiva — armamento da equipe. As duas: carro de fuga opcional (um carro rápido roubado deixado perto da loja).</li>
        <li><b>Equipe</b>: hacker, motorista e atirador — cada um com ★ e um <b>corte</b> do bruto. Os bons custam mais; os baratos erram (atirador baleado perde a bolsa, motorista bate, hacker deixa rastro). Quem participa ganha experiência (+1★ a cada 2 golpes).</li>
        <li><b>Executar</b>: entre de máscara, faça a limpa no tempo, entre no carro de fuga e leve o malote ao <b>ponto de entrega</b> na favela sem estrelas. O receptador paga 85% e a equipe recebe os cortes.</li></ol>`,

    business: () => `<h2>Negócios próprios</h2>
        <p>Quase toda loja da cidade com interior está à venda: no balcão, <b>COMPRAR O NEGÓCIO</b> (dinheiro <b>limpo</b>). Gerencie na aba <b>🏪 NEGÓCIOS</b>.</p><ul>
        <li>Todo dia: faturamento − insumos − salários − aluguel = <b>lucro limpo</b> no caixa da loja. Recolha lá (ou contrate um <b>gerente</b>, que deposita para você toda noite e busca o sujo onde você estiver).</li>
        <li><b>Lavagem</b>: deixe dinheiro sujo no cofre; à noite ele entra no faturamento até um limite proporcional ao que a loja fatura de verdade, com perda pequena. Lavar mais que metade do faturamento faz a Receita estranhar.</li>
        <li><b>Melhorias</b>: reforma e equipamento (faturam mais), segurança (assaltos ao seu negócio), contador (menos perda, mais limite, sem multa), campanha de marketing (+35% por 5 dias).</li>
        <li>Eventos: dia de movimento, fiscalização, funcionário desviando, taxa da milícia, assaltos. No seu negócio, você paga preço de custo.</li>
        <li>Lojas da favela continuam sendo <b>fachadas do C.V</b> (comprar o ponto).</li></ul>`,

    mechanic: () => `<h2>Mecânica e porta-malas</h2>
        <p>Todo carro e moto que você usa tem peças com desgaste. O <b>painel</b> (canto inferior direito, dirigindo) mostra velocidade, gasolina, temperatura e as luzes de aviso.</p><ul>
        <li><b>Motor</b> fraco falha e morre; <b>radiador</b> ruim esquenta (pare para esfriar); <b>óleo</b> baixo funde o motor; <b>bateria</b> fraca não dá partida (acelere de novo); <b>freio</b> gasto para longe; <b>pneu</b> careca escorrega e estoura; <b>suspensão</b> desalinhada puxa para um lado. Batidas de frente pegam o radiador, de lado a suspensão; batida forte faz vazar óleo.</li>
        <li><b>Capô</b>: a pé, na frente do carro, <b>E</b> — diagnóstico e troca de peças por você (peças no balcão de peças; pneu e suspensão pedem macaco; freio, radiador e ignição, a caixa de ferramentas). Galão e auxiliar de partida também se usam ali.</li>
        <li><b>Oficinas Pay n Pay</b> (🔧 no mapa): chegue dirigindo e aperte E — orçamento por peça, retífica, vazamento, funilaria e <b>pintura</b> (some com a placa anotada). <b>Borracharia</b> nos postos (pneu, óleo, bateria). <b>Mecânico do morro</b> no desmanche: mais barato, aceita sujo, faz placa fria.</li>
        <li><b>Porta-malas</b>: a pé, atrás do carro, <b>E</b> (na moto, o baú). Guarde armas, dinheiro, joias e peças; o espaço depende do carro. Carro seu guarda tudo no save. Preso perto do carro, a polícia revista — o <b>fundo falso</b> do desmanche esconde.</li></ul>`,

    racing: () => `<h2>Corridas: rachas e autódromo</h2>
        <p>Pare o carro no <b>anel aceso</b> de um <b>ponto de racha</b> (🏁 no mapa, na rua em frente a alguns postos) ou no portão do <b>Autódromo Arena Sul</b> (🏎️) e aperte <b>E</b>: a lista das corridas do dia (muda a cada 6 horas).</p><ul>
        <li><b>Racha 1×1</b>: arrancada numa reta de até 400 m — quem cruzar primeiro leva tudo. <b>Corrida de rua</b>: do ponto A ao B pela cidade, com o trânsito, seguindo os <b>checkpoints</b> (o cilindro amarelo, a seta para o próximo e o marcador no radar). <b>Circuito</b>: voltas em torno dos quarteirões. <b>Autódromo</b>: oval fechado, várias voltas, até 8 carros e nenhum trânsito.</li>
        <li><b>Largada</b>: o semáforo acende 3 · 2 · 1 · VAI!. Acelere no VAI! = <b>largada perfeita</b> (nitro de graça); acelerar antes = <b>queimou a largada</b> (o motor engasga).</li>
        <li><b>Nitro</b>: <kbd>Shift</kbd>, <kbd>A</kbd> no controle ou o botão <b>NITRO</b> no celular. A carga dura uma corrida; cada <b>takedown</b> enche um pouco.</li>
        <li><b>Takedown</b> (como no Burnout): jogue um rival no muro ou no trânsito até ele capotar ou explodir. <b>Capotamento</b>: pancada de lado forte faz o carro rolar (bater na porta de outro a ~85 km/h); de frente, só bem forte, e ele dá cambalhota (muro de frente acima de ~100 km/h, ou de frente com quem vem na contramão). Batida fortíssima explode — vale para o seu carro também, e aí você está fora.</li>
        <li><b>Prêmios</b>: racha de rua paga <b>dinheiro sujo</b> (à noite, 25% a mais); o autódromo paga <b>limpo</b>. 2º e 3º levam uma parte (no 1×1, o vencedor leva tudo). As provas mais caras cobram inscrição.</li>
        <li><b>Reputação no meio</b>: de <b>Desconhecido</b> a <b>Rei das ruas</b>. Sobe com a colocação, os takedowns e a largada perfeita, e libera as corridas maiores. Lenda do asfalto libera o <b>racha valendo o documento</b>: só com carro seu — quem ganha leva o carro do outro.</li>
        <li>Racha na rua com viatura por perto vira <b>procurado</b>. Sair do carro, ser preso ou se afastar do percurso desclassifica.</li></ul>`,
});
