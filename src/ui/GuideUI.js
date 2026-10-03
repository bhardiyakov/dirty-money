// ============================================================================
// GuideUI — a aba GUIA do menu de pausa: como o jogo funciona, do começo ao fim. À esquerda o índice; à direita o capítulo.
// Os capítulos das CARREIRAS são montados a partir dos próprios dados das carreiras (patentes, skills, trabalhos), então o guia
// nunca fica desatualizado quando uma carreira ganha trabalho novo; o texto "como funciona" de cada uma fica em CAREER_NOTES.
// ============================================================================

class GuideUI {
    constructor(game) {
        this.g = game;
        this.sel = 'start';
        this.el = null;
        const st = document.createElement('style');
        st.textContent = `
            #pmGuide { display: flex; gap: 14px; width: 100%; min-height: 0; }
            .gd-index { width: 250px; flex: none; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
            .gd-index div { cursor: pointer; padding: 8px 11px; border-radius: 10px; background: rgba(9,14,32,0.86); border: 2px solid #1f2a4a; color: #cfd7ea; font-size: 13px; }
            .gd-index div:hover { border-color: #3a4a7a; } .gd-index div.on { border-color: #35e0ff; color: #fff; box-shadow: 0 0 12px rgba(53,224,255,0.35); }
            .gd-index .gd-h { cursor: default; background: none; border: none; color: #8fb4ff; font-size: 11px; letter-spacing: 2px; padding: 8px 4px 2px; }
            .gd-body { flex: 1; min-width: 0; overflow-y: auto; background: rgba(9,14,32,0.86); border-radius: 12px; border: 2px solid #1f2a4a; padding: 16px 20px; color: #dfe6f5; font-size: 14px; line-height: 1.55; text-transform: none; }
            .gd-body h2 { margin: 0 0 10px; font-size: 20px; color: #fff; letter-spacing: 1px; text-transform: uppercase; }
            .gd-body h3 { margin: 16px 0 6px; font-size: 15px; color: #ffe27a; text-transform: uppercase; letter-spacing: 1px; }
            .gd-body p { margin: 6px 0; } .gd-body ul { margin: 4px 0 8px; padding-left: 20px; } .gd-body li { margin: 3px 0; }
            .gd-body b { color: #ffe27a; } .gd-body kbd { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 4px; background: #1d2a4d; border: 1px solid #3f5a8a; color: #fff; font: inherit; font-size: 12px; text-align: center; }
            .gd-body table { border-collapse: collapse; width: 100%; margin: 6px 0; } .gd-body td, .gd-body th { border-bottom: 1px solid #1f2a4a; padding: 5px 6px; text-align: left; vertical-align: top; font-size: 13px; } .gd-body th { color: #8fb4ff; }
            .gd-tip { margin: 10px 0; padding: 8px 12px; border-left: 3px solid #35e0ff; background: rgba(53,224,255,0.07); border-radius: 0 8px 8px 0; }
            @media (max-width: 900px) { #pmGuide { flex-direction: column; } .gd-index { width: auto; flex-direction: row; overflow-x: auto; } .gd-index div { white-space: nowrap; } .gd-index .gd-h { display: none; } }`;
        document.head.appendChild(st);
    }

    // Índice: [id, título] ou [null, cabeçalho de grupo].
    index() {
        const out = [[null, 'O BÁSICO'], ['start', 'Começo rápido'], ['controls', 'Controles'], ['money', 'Dinheiro sujo × limpo'], ['police', 'Polícia e procurado'],
            ['fail', 'Prisão, morte e Tribunal'], [null, 'O MUNDO'], ['favela', 'Favela, facção e missões'], ['shops', 'Lojas, armas e itens'], ['vehicles', 'Veículos'],
            ['home', 'Casa, imóveis e save'], ['goals', 'Metas de carreira'], [null, 'EVOLUÇÃO'], ['level', 'Nível e habilidades'], ['notoriety', 'Notoriedade (dificuldade)'], ['achievements', 'Conquistas e platina'], [null, 'CARREIRAS DO CRIME'], ['careers', 'Como as carreiras funcionam']];
        if (this.g.careers) for (const c of this.g.careers.list) out.push(['career_' + c.id, `${c.icon} ${c.name}`]);
        out.push([null, 'MAIS'], ['tips', 'Dicas']);
        return out;
    }

    bind(el) {
        if (this.el === el) return;
        this.el = el;
        el.addEventListener('click', (e) => { const it = e.target.closest('[data-gd]'); if (it) { this.sel = it.dataset.gd; this.render(); } });
    }

    render(el = this.el) {
        if (!el) return;
        this.bind(el);
        const idx = this.index().map(([id, t]) => id ? `<div data-gd="${id}" class="${id === this.sel ? 'on' : ''}">${t}</div>` : `<div class="gd-h">${t}</div>`).join('');
        el.innerHTML = `<div class="gd-index">${idx}</div><div class="gd-body">${this.page(this.sel)}</div>`;
    }

    page(id) {
        if (id.startsWith('career_')) return this.careerPage(id.slice(7));
        const P = GuideUI.PAGES[id];
        return P ? P() : GuideUI.PAGES.start();
    }

    careerPage(cid) {
        const c = this.g.careers && this.g.careers.by[cid];
        if (!c) return '<p>Carreira não encontrada.</p>';
        const notes = GuideUI.CAREER_NOTES[cid] || '';
        let h = `<h2>${c.icon} ${c.name}</h2><p>${c.desc}</p>
            <div class="gd-tip">Você está em <b>${c.rankName}</b> com <b>${c.xp} XP</b>${c.points > 0 ? ` e <b>${c.points} ponto(s)</b> para gastar` : ''}. Abra a aba <b>CARREIRAS</b> (<kbd>O</kbd>) para aceitar trabalhos.</div>
            <h3>Patentes</h3><table><tr><th>Patente</th><th>XP</th><th>O que libera</th></tr>`;
        for (const r of c.ranks) h += `<tr><td><b>${r.name}</b></td><td>${r.xp}</td><td>${r.desc}</td></tr>`;
        h += `</table><h3>Habilidades</h3><p>1 ponto a cada ${Careers.XP_PER_POINT} XP da carreira; cada habilidade vai até o nível 5.</p><ul>`;
        for (const S of Object.values(c.skillDefs)) h += `<li><b>${S.name}</b> — ${S.desc}</li>`;
        h += `</ul><h3>Trabalhos</h3><table><tr><th>Trabalho</th><th>Patente</th><th>Paga</th><th>Como é</th></tr>`;
        for (const j of c.jobs()) h += `<tr><td><b>${j.name}</b></td><td>${c.ranks[j.rank].name}</td><td>${j.pay}</td><td>${j.desc}</td></tr>`;
        return h + `</table>${notes}`;
    }
}

GuideUI.PAGES = {
    start: () => `<h2>Começo rápido</h2>
        <p>Você acorda no seu <b>esconderijo na favela</b>, sem dinheiro e sem armas. A cidade é aberta: dá para viver do tráfico, roubar carros, invadir casas, aplicar golpes ou montar uma banca do bicho.</p>
        <h3>Primeira hora sugerida</h3><ul>
        <li><b>Furte</b> pedestres (<kbd>C</kbd>) para os primeiros trocados — discreto, mas pode dar errado.</li>
        <li>Abra a aba <b>CARREIRAS</b> (<kbd>O</kbd>) e aceite um trabalho de patente inicial: <b>Puxada</b> (desmanche), <b>Levantar a fita</b> (ladrão), <b>Catar sucata</b> (armeiro), <b>Chupa-cabra</b> (estelionato) ou <b>Abrir a banca</b> (bicho).</li>
        <li>Na <b>boca de fumo</b> da favela, peça serviço para subir no tráfico e comprar suas primeiras armas.</li>
        <li>Junte dinheiro, compre uma <b>fachada</b> para lavar e comece a investir em imóveis.</li></ul>
        <div class="gd-tip">O painel embaixo da tela mostra as <b>metas</b>: cada uma paga um prêmio na hora. O jogo <b>salva sozinho</b> a cada 2 minutos em momento calmo e quando você dorme.</div>`,

    controls: () => `<h2>Controles</h2>
        <h3>Teclado e mouse</h3><table>
        <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>andar / dirigir</td></tr><tr><td><kbd>Shift</kbd></td><td>correr</td></tr>
        <tr><td><kbd>Clique</kbd> / <kbd>Espaço</kbd></td><td>golpe ou tiro</td></tr><tr><td><kbd>J</kbd> <kbd>K</kbd></td><td>soco / chute</td></tr>
        <tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>armas (punhos, pistola, SMG, escopeta, taco, revólver, AK, fuzil, faca)</td></tr>
        <tr><td><kbd>R</kbd> · <kbd>M</kbd></td><td>recarregar · kit médico</td></tr>
        <tr><td><kbd>E</kbd></td><td>interagir: assaltar (com arma), esconder-se, entrar, falar, trabalhos das carreiras; no carro, desmanchar no desmanche</td></tr>
        <tr><td><kbd>C</kbd></td><td>furtar pedestre</td></tr><tr><td><kbd>V</kbd></td><td>pular grade/muro</td></tr>
        <tr><td><kbd>F</kbd></td><td>entrar/sair de veículo (carro estacionado: quebra o vidro, com alarme)</td></tr><tr><td><kbd>G</kbd></td><td>arrombar carro na manha (mini-game, sem alarme)</td></tr>
        <tr><td><kbd>H</kbd> · <kbd>L</kbd></td><td>buzina · faróis</td></tr><tr><td><kbd>Z</kbd> <kbd>X</kbd> / roda</td><td>zoom</td></tr>
        <tr><td><kbd>I</kbd></td><td>mochila</td></tr><tr><td><kbd>O</kbd></td><td>carreiras do crime</td></tr><tr><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>menu (mapa, GPS, status, guia)</td></tr></table>
        <h3>Controle (Xbox)</h3><p>Funciona direto: analógico move, gatilhos e botões fazem as ações, <b>D-pad</b> troca de arma e <b>Start</b> pausa.</p>
        <h3>Celular</h3><ul><li><b>Joystick</b> (esquerda): anda e dirige; empurre até a borda para <b>correr</b>.</li>
        <li><b>ATACAR</b> (botão grande): soco ou tiro — segure para rajada. No carro vira <b>SAIR</b>; no helicóptero aparecem <b>SUBIR</b> e <b>DESCER</b>.</li>
        <li><b>Botões de contexto</b>: aparecem sozinhos só quando há algo a fazer ali — ENTRAR, ROUBAR, ARROMBAR, FURTAR, ASSALTAR, PULAR, VASCULHAR, DESMANCHAR, ABASTECER…</li>
        <li><b>Arma</b> (chip): toque troca de arma, segure recarrega. <b>✚ KIT</b> aparece com vida baixa.</li>
        <li><b>⋯</b>: chute, mochila, buzina, farol, girar o helicóptero, zoom. No topo: <b>II</b> (mapa/pausa) e <b>CRIME</b> (carreiras). <b>Pinça</b> com dois dedos = zoom.</li></ul>`,

    money: () => `<h2>Dinheiro sujo × limpo</h2>
        <p>Tudo o que vem do crime é <b>dinheiro sujo</b>. O <b>dinheiro limpo</b> é o que está "na conta" e pode ser gasto no comércio legal.</p>
        <ul><li>Compras grandes (a partir de ${brl(Laundry.CLEAN_MIN)}) <b>fora da favela</b> e imóveis fora da favela só aceitam <b>limpo</b>.</li>
        <li><b>Fachadas</b>: compre um ponto na favela (adega, padaria, lanchonete, mercadinho — exige moral 40+ com o tráfico) e lave nele. Cada fachada lava um limite por dia, com uma <b>perda</b> que cai com a habilidade <b>Contabilidade</b> (sobe lavando). Cada fachada também rende um pouco de limpo por dia.</li>
        <li>Lavar esquenta a <b>Receita/PF</b>; em 100% vem a auditoria e uma multa. Ela esfria sozinha com o tempo.</li>
        <li>Outras formas de lavar: <b>cripto</b> e <b>lavagem para facções</b> (Estelionato), <b>escola de samba</b> (Bicho: parte da renda já entra limpa e a Receita quase não sobe).</li></ul>`,

    police: () => `<h2>Polícia e procurado</h2>
        <p>Crime só vira estrela se um policial <b>vir</b> (ou ouvir o tiro). Quanto mais estrelas, maior o raio de visão e mais gente vem:</p>
        <table><tr><th>Nível</th><th>O que acontece</th></tr><tr><td>★</td><td>a polícia de perto te procura</td></tr><tr><td>★★</td><td>viaturas por rádio e helicóptero (enxerga por cima dos prédios)</td></tr>
        <tr><td>★★★</td><td>atiram à vista, SWAT e bloqueios</td></tr><tr><td>★★★★</td><td>SWAT com metralhadora, mais viaturas</td></tr><tr><td>★★★★★</td><td>exército e ruas fechadas</td></tr></table>
        <h3>Como fugir</h3><ul><li>Saia da visão e fique escondido o tempo da fuga (o HUD mostra "ESCAPANDO").</li><li>Policial colado em você impede a fuga, mesmo atrás de parede.</li>
        <li><b>Esconderijos</b> (<kbd>E</kbd> em caçamba, caixote, latão): se ninguém viu você entrar, some do radar.</li><li>Com procurado você não entra em lojas nem consegue aceitar trabalhos.</li></ul>`,

    fail: () => `<h2>Prisão, morte e Tribunal</h2>
        <ul><li><b>Preso</b>: policial colado em você por alguns segundos (com procurado). Você paga multa, perde <b>todas as armas</b> e acorda na delegacia 12 h+ depois.</li>
        <li><b>Morte</b>: acorda no <b>hospital</b> 12 h+ depois e paga a conta.</li>
        <li><b>Tribunal do Crime</b>: se a vida zerar dentro da favela, o tráfico julga — pagar a multa (todo o sujo), entregar tudo (armas, kits, joias) ou tentar a lábia (falhou = execução).</li>
        <li>Trabalhos de carreira e missões em andamento falham se você for preso ou morrer.</li></ul>`,

    favela: () => `<h2>Favela, facção e missões do morro</h2>
        <p>A favela é do <b>${Standing.territories[0].name} (${Standing.territories[0].sigla})</b>. Você é morador: os traficantes são neutros enquanto a <b>moral com o tráfico</b> ficar em 30+ e a <b>moral com a comunidade</b> em 20+.</p>
        <ul><li><b>Boca de fumo</b>: compra de armas da favela (mais baratas, inclusive AK), venda de joias e <b>PEDIR SERVIÇO</b>.</li>
        <li><b>Missões do morro</b>: entrega (prazo), cobrança (com arma na mão) e defesa do morro (durante operação policial). Patentes: <b>Aviãozinho</b> → <b>Soldado</b> (3 missões, tráfico 50+) → <b>Gerente de Frente</b> (8 missões, tráfico 65+), que paga mais.</li>
        <li><b>Comunidade</b>: ajude moradores (<kbd>E</kbd> desarmado, com comida/água/kit). Assaltar e brigar na favela derruba a moral.</li>
        <li><b>Operação policial</b>: é a única hora em que a polícia entra fundo na favela. <b>Baile funk</b> (21h–5h) abafa tiros. Olheiros e fogueteiros dão o alarme.</li></ul>`,

    shops: () => `<h2>Lojas, armas e itens</h2>
        <ul><li>Entre nas lojas <b>andando pela porta</b> (só no horário e sem procurado). <kbd>E</kbd> perto do atendente abre o cardápio.</li>
        <li>Comida e bebida curam na hora; marmita e água vão para a mochila. Kit médico (<kbd>M</kbd>) cura 55.</li>
        <li>Armas: loja de armas da cidade (legal) ou boca de fumo (barata, estoque pequeno). Munição e colete também.</li>
        <li><b>Mochila</b> (<kbd>I</kbd>): grade de espaços; armas compridas ocupam mais. Joias valem dinheiro na boca.</li>
        <li>O <b>Armeiro</b> fabrica armas caseiras, recarrega munição e importa <b>silenciador</b> e <b>pente estendido</b> para as suas armas.</li></ul>`,

    vehicles: () => `<h2>Veículos</h2>
        <ul><li><kbd>F</kbd> entra/rouba (tira o motorista). Carro estacionado está <b>trancado</b>: <kbd>F</kbd> quebra o vidro (alarme) ou <kbd>G</kbd> arromba na manha (mini-game).</li>
        <li>Carro trancado roubado pede <b>ligação direta</b>: alguns segundos parado, exposto. A habilidade <b>Mecânica</b> (Desmanche) encurta.</li>
        <li>Batidas amassam; muito dano faz fumaça, fogo e explosão. Gasolina acaba: <b>segure <kbd>E</kbd></b> parado numa bomba de posto.</li>
        <li>Barcos e jet skis na marina e na orla; <b>helicóptero</b> nos helipontos (Espaço sobe, Shift desce, Q/E gira, <kbd>F</kbd> no ar = pular). Mototáxi nos pontos de mototáxi (marcados no mapa).</li>
        <li>No <b>desmanche</b> (Desmanche): <kbd>E</kbd> dentro do carro desmancha por dinheiro; a <b>oficina</b> (<kbd>O</kbd>) faz funilaria, motor, blindagem e fundo falso.</li></ul>`,

    home: () => `<h2>Casa, imóveis e save</h2>
        <ul><li>A safe house da favela é sua desde o começo: <b>cama</b> (dormir e salvar), <b>baú</b>, <b>cofre</b> e <b>geladeira</b>.</li>
        <li><b>Imóveis</b> à venda pela cidade (marcados no mapa): na favela com sujo, fora dela só com limpo. Dá para visitar, comprar, reformar, mudar a safe house e vender.</li>
        <li><b>Save</b>: dormir salva; o jogo também salva sozinho a cada 2 minutos quando você está calmo (sem procurado, sem trabalho com prazo). "Carregar jogo" no menu inicial.</li></ul>`,

    goals: () => `<h2>Metas de carreira</h2>
        <p>O painel embaixo da tela mostra a próxima meta de cada trilha — <b>Patrimônio</b>, <b>Carreiras</b>, <b>Morro</b>, <b>Lavagem</b>, <b>Imóveis</b> e <b>Fuga</b> — com barra de progresso. Cada meta batida paga na hora (dinheiro e, nas maiores, kits médicos) e libera a próxima.</p>`,

    level: () => `<h2>Nível e habilidades</h2>
        <p>Além das carreiras, o <b>personagem</b> tem um nível próprio (aba CARREIRAS › <b>HABILIDADES</b>). Todo XP conta: trabalhos, missões do morro, metas, conquistas, furtos, carros roubados e fugas da polícia (fugir de muitas estrelas vale muito).</p>
        <ul><li>O nível <b>não tem teto</b>, mas cada nível pede mais XP que o anterior (o nível 100 pede ~780 mil XP). <b>1 ponto por nível</b>.</li>
        <li>A árvore tem <b>6 ramos</b> — Físico, Combate, Sombra, Volante, Negócios e Malandragem — com 4 camadas. Cada camada pede um nível mínimo (1, 5, 12, 20) e uma habilidade anterior do ramo; camadas altas custam mais pontos por grau.</li>
        <li>As habilidades mudam o jogo de verdade: vida máxima, dano, recarga, dispersão, chance de furto, visão da polícia, tempo para despistar, aderência e velocidade do carro, preços, perda na lavagem, rendas diárias, multas, conta do hospital, pagamento e XP.</li>
        <li><b>Prestígio</b> (nível 25+): graus infinitos que somam pagamento e XP — sempre há onde gastar pontos.</li></ul>`,

    notoriety: () => `<h2>Notoriedade (dificuldade)</h2>
        <p>Quanto mais alto o seu nível, mais a cidade te conhece: <b>Desconhecido → Conhecido na área → Nome na rua → Procurado na cidade → Inimigo público → Lenda do crime → Mito</b>.</p>
        <ul><li>A polícia <b>enxerga mais longe</b> e <b>demora mais para esquecer</b> você (até +60%). As habilidades do ramo Sombra e Volante compensam.</li>
        <li>Em troca, <b>todo trabalho paga mais</b> (+1,5% por nível, sem teto). O jogo fica mais difícil e mais lucrativo para sempre.</li>
        <li>As patentes das carreiras pedem bem mais XP do que no começo do jogo e, depois da última, vem a <b>maestria</b>: níveis infinitos, cada um 25% mais caro, +3% de pagamento naquela carreira.</li></ul>`,

    achievements: () => `<h2>Conquistas e platina</h2>
        <p>Na aba CARREIRAS › <b>CONQUISTAS</b> ficam dezenas de objetivos de longo prazo, com barra de progresso: furtos, fugas de 5 estrelas, patentes e maestria 10 em cada carreira, 50 trabalhos por carreira, carros desmanchados, grandes assaltos, armas vendidas, golpes, desfiles, patrimônio de R$ 10 milhões, nível 100, árvore completa e Prestígio 10.</p>
        <p>Cada conquista dá XP de personagem. A <b>PLATINA</b> só vem quando <b>todas</b> estiverem completas — é para levar muito tempo.</p>`,

    careers: () => `<h2>Como as carreiras funcionam</h2>
        <p>Além do tráfico, você pode seguir <b>cinco carreiras</b> ao mesmo tempo. Cada uma tem:</p>
        <ul><li><b>Patentes</b> por XP — a patente libera trabalhos novos e a gestão. Depois da última patente vem a <b>maestria</b> (infinita, +3% de pagamento por nível).</li>
        <li><b>Duas habilidades</b> (0 a 5): 1 ponto a cada ${Careers.XP_PER_POINT} XP; elas mudam o jogo de verdade (tempo de ligação direta, aderência do carro, barulho dos passos, chance do golpe…).</li>
        <li><b>Trabalhos</b>: um por vez (e não junto com a missão do morro). O alvo aparece no <b>GPS</b> e com um <b>marcador brilhante</b> no chão; o andamento fica no painel do canto superior esquerdo. Falhar (prazo, prisão, morte, abandono) não dá XP e deixa os contatos quietos uns segundos.</li>
        <li><b>Gestão</b> nas patentes altas: negócios que rendem por dia — e riscos que também rodam por dia (Receita, arrego, rival, sequestro, rastreio).</li></ul>
        <div class="gd-tip">As carreiras se ajudam: o <b>fundo falso</b> do Desmanche esconde o dinheiro da rota do Bicho; a <b>escola de samba</b> do Bicho segura a Receita do Desmanche e das fachadas; o <b>silenciador</b> do Armeiro deixa qualquer trabalho mais discreto.</div>`,

    tips: () => `<h2>Dicas</h2><ul>
        <li>Faça trabalhos de noite quando eles pedem (invasão, comércio): de dia eles nem aparecem.</li>
        <li>Guarde a arma para trabalhos de discrição: arma na mão chama atenção na fita e no chupa-cabra.</li>
        <li>Carro amassado vale menos no desmanche — dirija com calma depois do roubo (ou faça funilaria).</li>
        <li>Mantenha o rastreio do Estelionato baixo com VPN antes de golpes grandes: rastreio cheio em casa = batida.</li>
        <li>Sempre tenha dinheiro sujo para o arrego do bicho; sem ele, a polícia fecha suas bancas.</li>
        <li>Vender armas para a milícia paga muito, mas o tráfico cobra — contrate seguranças.</li></ul>`,
};

// "Como funciona" de cada carreira (além do que vem dos dados: patentes, skills e trabalhos).
GuideUI.CAREER_NOTES = {
    chop: `<h3>Como funciona</h3><ul>
        <li>O <b>desmanche</b> fica na entrada da favela (aparece no GPS nos trabalhos). Pagamento = valor do modelo × <b>estado da lataria</b>: cada batida custa caro.</li>
        <li><b>Encomenda de luxo</b>: ao entrar no carro começa a contagem do <b>rastreador</b>. Zerou: 2 estrelas e a polícia recebe a posição do carro a cada poucos segundos. Na oficina, fique <b>parado</b> até a adulteração terminar (o bloqueador corta o sinal).</li>
        <li>Fora dos trabalhos: chegue dirigindo qualquer carro roubado e aperte <kbd>E</kbd> para <b>desmanchar</b> (dinheiro + 1 peça).</li>
        <li><b>Oficina</b> (aba <kbd>O</kbd> dentro do carro, no desmanche): funilaria (sujo), <b>motor preparado</b>, <b>blindagem</b> e <b>fundo falso</b> (gastam <b>peças</b>). Peça comprada sobe a <b>suspeita da Receita</b>; em 100% vem multa e fecham um desmanche seu.</li>
        <li><b>Desmanches próprios</b> (Mestre): renda diária + 2 peças por dia cada, e mais suspeita. "Maquiar a contabilidade" (limpo) baixa a suspeita.</li></ul>`,
    burglar: `<h3>Como funciona</h3><ul>
        <li><b>Fita</b>: fique perto da casa sem correr, sem arma e sem polícia por perto. O <b>disfarce</b> de companhia de luz deixa trabalhar com polícia olhando. Cada fita guardada rende +2 gavetas na próxima invasão.</li>
        <li><b>Barulho</b>: correr enche a barra e solta uma <b>onda sonora</b> que assusta pedestres e chama a polícia que estiver perto. Barulho cheio <b>arma o alarme</b>: fique parado para abafar antes que dispare (Eletrônica dá mais segundos).</li>
        <li><b>Peso</b>: eletrônicos e mercadoria pesam e deixam você mais lento até vender no <b>receptador</b> da favela (<kbd>E</kbd> lá). Joias vão para a mochila (venda na boca).</li>
        <li><b>Grande assalto</b>: (1) corte a energia na <b>caixa de força</b> (mini-game) — sem isso o laser dispara no meio do cofre (3 estrelas); (2) <b>suborne o vigia</b> na aba — sem isso ele aperta o pânico (2 estrelas); (3) fique no <b>cofre temporizado</b>; (4) <b>fuja</b> até a favela ou para longe, sem procurado, para receber.</li></ul>`,
    gunsmith: `<h3>Como funciona</h3><ul>
        <li>Toda morte de policial ou traficante vira uma <b>cena de tiroteio</b> por alguns minutos — é lá que a sucata rende mais. Polícia perto enquanto você mexe = <b>abordagem</b> (procurado).</li>
        <li><b>Bancada</b> (na favela ou em casa): receitas gastam sucata, cápsulas e dinheiro. Inteligência libera escopeta (2) e fuzil montado (4).</li>
        <li>Venda aos <b>vapores</b> (só na favela). Parte das armas pode <b>travar</b> na mão do comprador (Engenharia reduz): moral com o tráfico cai.</li>
        <li><b>Contratos</b> (Mercador): lote mínimo de R$ 3.000 em armas. C.V paga 40% a mais e dá moral; a <b>milícia</b> paga quase o dobro, mas o tráfico cobra (moral −12) e você vira <b>alvo de sequestro</b> (resgate de 25% do seu dinheiro) — <b>seguranças</b> reduzem muito a chance.</li>
        <li><b>Importados</b> (dinheiro limpo) para a arma que está na sua mão: <b>silenciador</b> (tiro quase não chama polícia) e <b>pente estendido</b> (+50%).</li></ul>`,
    scam: `<h3>Como funciona</h3><ul>
        <li><b>Dados</b> vêm do chupa-cabra (3–6 por instalação) e de celulares em furtos (<kbd>C</kbd>) em bairros ricos.</li>
        <li><b>Chupa-cabra</b>: a instalação para quando alguém olha (pedestre perto ou polícia); policial colado = flagrante. Depois de instalar, afaste-se e volte em ~40 s.</li>
        <li><b>Central de golpes</b> (em casa ou na favela): falso parente (seguro), falsa central do banco (médio), boleto/pix para empresas (alto). Cada golpe enche o <b>rastreio</b>; <b>VPN</b> esvazia; ele também cai sozinho com o tempo.</li>
        <li><b>Batida</b>: rastreio cheio estando na central = a polícia arromba a porta. Aperte <kbd>E</kbd> (ou toque) várias vezes para <b>destruir os HDs</b> antes do tempo: conseguiu = só perde os dados e sai com 1 estrela; não conseguiu = perde dados e 35% do sujo, com 3 estrelas.</li>
        <li><b>Operador de Botnet</b>: invasão corporativa → <b>dossiê</b> → chantagem paga em <b>limpo</b>; lavar para as facções = renda limpa diária com rastreio diário.</li></ul>`,
    bicho: `<h3>Como funciona</h3><ul>
        <li><b>Banca</b>: fique na banca durante o turno; polícia perto faz o <b>rapa</b> (leva metade). Depois leve o malote ao <b>QG do bicheiro</b> antes de fechar. A pé, pivetes tentam levar o malote — arma na mão ou <b>escolta</b> os espantam.</li>
        <li><b>Rota do recolhe</b>: 3 apontadores e o QG. Com muito dinheiro, <b>blitz</b> (1 estrela) — escolta e carro com <b>fundo falso</b> (Desmanche) ajudam.</li>
        <li><b>Banqueiro</b>: compre <b>pontos</b> por zona (renda diária) e pague o <b>arrego</b> diário (sai do sujo; sem dinheiro, a polícia fecha bancas). A <b>família rival</b> tem pontos em cada zona e toma os seus onde está presente.</li>
        <li><b>Guerra fria</b>: passe de apontador rival (tira 1 dela, dá 1 a você), polícia fecha bancas rivais numa zona, matador contratado ou <b>queima de arquivo</b> você mesmo (sem testemunha, sem polícia).</li>
        <li><b>Patrono</b>: a escola de samba dá <b>imunidade política</b> enquanto a <b>opinião pública</b> estiver em 40%+. Estrelas de procurado derrubam a opinião; doações e imprensa sobem. A cada 7 dias tem <b>desfile</b>: opinião 60%+ = patrocínio limpo; abaixo disso = escândalo.</li></ul>`,
};
