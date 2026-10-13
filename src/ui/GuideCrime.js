// ============================================================================
// GuideCrime — capítulos do GUIA (aba GUIA do menu) sobre assaltos, rastros, golpes, negócios e mecânica. Entram em GuideUI.PAGES;
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
        <li>Zerou com você lá dentro: <b>CERCO</b>. Lábia (trégua), sair com um refém de <b>escudo</b> (a polícia segura o fogo uns segundos), sair atirando (3★) ou se render.</li>
        <li>A loja assaltada fica fechada até o dia seguinte (perícia).</li></ul>`,

    traces: () => `<h2>Rastros e fuga</h2>
        <p>O que você deixa para trás num assalto vira prova (painel no canto direito, abaixo do HUD):</p><ul>
        <li><b>Descrição da roupa</b>: testemunhas e câmeras descrevem parte de cima, calça e cabeça. Por 2 dias, um policial que te veja de perto com 2 dessas 3 peças te reconhece. <b>Troque de roupa</b> longe da polícia (leve uma muda).</li>
        <li><b>Rosto</b>: sem máscara, o inquérito sobe muito. <b>Balaclava</b> esconde tudo; <b>bandana</b> esconde da câmera. <b>K</b> põe/tira a máscara — mascarado na rua a polícia estranha e aborda.</li>
        <li><b>Câmeras</b>: arranque o HD do gravador (DVR) antes de sair.</li>
        <li><b>Digitais</b>: use <b>luvas</b> (boutique ou boca).</li>
        <li><b>Placa</b>: sair dirigindo de perto da loja com testemunha acordada marca o carro. Some com <b>pintura nova</b> na oficina, <b>placa fria</b> no mecânico do morro ou largando o carro.</li>
        <li><b>Inquérito</b> (0–100%): soma tudo e cai 7% por dia. Em 100% sai o <b>mandado de prisão</b> — qualquer policial te reconhece pela cara. O <b>advogado</b> (aba CARREIRAS › Assaltante, dinheiro limpo) esfria 45%.</li>
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
});
