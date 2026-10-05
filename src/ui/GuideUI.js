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
            .gd-index div { cursor: pointer; padding: 8px 11px; border-radius: var(--r-2); background: var(--glass); border: 1px solid var(--line-2); color: var(--tx-2); font-size: 13px; }
            .gd-index div:hover { border-color: rgba(255,255,255,0.3); } .gd-index div.on { border-color: var(--tx); color: #fff; background: var(--card-on); }
            .gd-index .gd-h { cursor: default; background: none; border: none; color: var(--blue); font-size: 11px; letter-spacing: 2px; padding: 8px 4px 2px; }
            .gd-body { flex: 1; min-width: 0; overflow-y: auto; background: var(--glass); border-radius: var(--r); border: 1px solid var(--line-2); padding: 16px 20px; color: var(--tx); font-size: 15px; line-height: 1.65; text-transform: none; padding: 22px 28px; }
            .gd-body h2 { margin: 0 0 12px; font: 700 26px var(--font-d); color: var(--tx); }
            .gd-body h3 { margin: 18px 0 6px; font: 700 17px var(--font-d); color: var(--gold); }
            .gd-body p { margin: 6px 0; } .gd-body ul { margin: 4px 0 8px; padding-left: 20px; } .gd-body li { margin: 3px 0; }
            .gd-body b { color: var(--gold); } .gd-body kbd { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 4px; background: rgba(255,255,255,0.14); border: 1px solid #3f5a8a; color: #fff; font: inherit; font-size: 12px; text-align: center; }
            .gd-body table { border-collapse: collapse; width: 100%; margin: 6px 0; } .gd-body td, .gd-body th { border-bottom: 1px solid var(--line); padding: 5px 6px; text-align: left; vertical-align: top; font-size: 13px; } .gd-body th { color: var(--blue); }
            .gd-tip { margin: 10px 0; padding: 8px 12px; border-left: 3px solid var(--acc); background: rgba(52,211,153,0.08); border-radius: 0 8px 8px 0; }
            @media (max-width: 900px) { #pmGuide { flex-direction: column; } .gd-index { width: auto; flex-direction: row; overflow-x: auto; } .gd-index div { white-space: nowrap; } .gd-index .gd-h { display: none; } }`;
        document.head.appendChild(st);
    }

    // Índice: [id, título] ou [null, cabeçalho de grupo].
    index() {
        const out = [[null, 'O BÁSICO'], ['start', 'Começo rápido'], ['controls', 'Controles'], ['money', 'Dinheiro sujo × limpo'], ['police', 'Polícia e procurado'], ['bags', 'Bolsas, peso e fôlego'],
            ['fail', 'Prisão, morte e Tribunal'], [null, 'O MUNDO'], ['favela', 'Favela, facção e missões'], ['shops', 'Lojas, armas e itens'], ['vehicles', 'Veículos'],
            ['home', 'Casa, imóveis e save'], ['goals', 'Metas de carreira'], [null, 'IMPÉRIO'], ['daily', 'Energia e exposição (o dia)'], ['empire', 'Soldados, galpões e lavagem'], ['influence', 'Malha de influência'], ['dominion', 'Domínio e estações'], ['banks', 'Bancos'], ['pool', 'Sinuca no bar'], [null, 'EVOLUÇÃO'], ['level', 'Nível e habilidades'], ['notoriety', 'Notoriedade (dificuldade)'], ['achievements', 'Conquistas e platina'], [null, 'CARREIRAS DO CRIME'], ['careers', 'Como as carreiras funcionam']];
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
        <tr><td><kbd>I</kbd></td><td>inventário: equipamento (roupas, bolsa, arma) e mochila — <kbd>C</kbd> alterna</td></tr><tr><td><kbd>O</kbd></td><td>carreiras do crime</td></tr><tr><td><kbd>Esc</kbd> / <kbd>P</kbd></td><td>menu (mapa e marcador, status, guia)</td></tr></table>
        <h3>Controle (Xbox / PlayStation)</h3><p>Funciona direto, no padrão de GTA e Watch Dogs: <b>RT/R2</b> ataca, <b>A/✕</b> corre (e pula grade), <b>X/□</b> interage, <b>Y/△</b> entra/sai do veículo, <b>B/○</b> recarrega, <b>LT/L2</b> mira (no teclado: botão direito do mouse), <b>LB/L1</b> troca de arma; no carro <b>RT</b> acelera e <b>LT</b> freia. <b>Start/OPTIONS</b> pausa — a lista completa está em Ajustes. As dicas na tela mostram os botões do controle conectado.</p>
        <h3>Mira</h3><p>Com arma de fogo, segure <b>LT/L2</b> (ou o botão direito do mouse) para mirar: o personagem anda devagar de frente para o alvo e o círculo mostra onde a bala pode cair — ele encolhe enquanto você fica firme e abre ao andar ou atirar em rajada. <b>Assistida</b> trava no alvo (empurre o analógico direito ou passe o mouse para trocar); <b>Manual</b> você aponta com o analógico direito ou o cursor e erra menos com a mira firme. Troque em Ajustes. As habilidades <b>Mão firme</b> e <b>Olho de águia</b> (Combate) firmam a mira mais rápido e fazem errar menos.</p>
        <h3>Celular</h3><ul><li>Abre em <b>tela cheia</b> e na <b>horizontal</b>. No iPhone, use <i>Compartilhar → Adicionar à Tela de Início</i> para jogar como app.</li>
        <li><b>Joystick flutuante</b>: encoste o dedo em qualquer lugar da metade esquerda — ele nasce ali. A pé, empurrar até a borda também corre. Dirigindo, vira um <b>volante</b> (só esquerda/direita).</li>
        <li><b>4 botões</b> à direita, que mudam com o que você está fazendo:<br>
        a pé — <b>ATACAR</b> (segure para rajada) · <b>CORRER</b> · ação do lugar (ENTRAR, ROUBAR, VASCULHAR…; sem nada por perto, CHUTE) · <b>ARMA</b> (toque troca, segure recarrega);<br>
        dirigindo — <b>ACELERAR</b> · <b>RÉ / FREIO</b> · <b>SAIR</b> · ação do lugar (ABASTECER, DESMANCHAR…) ou BUZINA;<br>
        helicóptero — <b>SUBIR</b> · <b>DESCER</b> · <b>SAIR</b> · <b>GIRAR</b>.</li>
        <li><b>✚ KIT</b> aparece com vida baixa. <b>⋯</b>: mochila, farol, furtar, pular grade, zoom. No topo: <b>II</b> (mapa/pausa) e <b>CRIME</b> (carreiras). <b>Pinça</b> = zoom.</li></ul>`,

    money: () => `<h2>Dinheiro sujo × limpo</h2>
        <p>Tudo o que vem do crime é <b>dinheiro sujo</b>. O <b>dinheiro limpo</b> é o que está "na conta" e pode ser gasto no comércio legal.</p>
        <ul><li>Compras grandes (a partir de ${brl(Laundry.CLEAN_MIN)}) <b>fora da favela</b> e imóveis fora da favela só aceitam <b>limpo</b>.</li>
        <li><b>Fachadas</b>: compre um ponto na favela (adega, padaria, lanchonete, mercadinho — exige moral 40+ com o tráfico) e lave nele. Cada fachada lava um limite por dia, com uma <b>perda</b> que cai com a habilidade <b>Contabilidade</b> (sobe lavando). Cada fachada também rende um pouco de limpo por dia.</li>
        <li>Lavar esquenta a <b>Receita/PF</b>; em 100% vem a auditoria e uma multa. Ela esfria sozinha com o tempo.</li>
        <li>Outras formas de lavar: <b>cripto</b> e <b>lavagem para facções</b> (Estelionato), <b>escola de samba</b> (Bicho: parte da renda já entra limpa e a Receita quase não sobe).</li></ul>`,

    police: () => `<h2>Polícia e procurado</h2>
        <p>Crime só vira estrela se um policial <b>vir</b> (ou ouvir o tiro). Quanto mais estrelas, maior o raio de visão e mais gente vem:</p>
        <table><tr><th>Nível</th><th>O que acontece</th></tr><tr><td>★</td><td>delito leve: só quem viu te procura (sem rádio nem viatura extra), corre menos, precisa chegar bem perto para prender e te perde rápido</td></tr><tr><td>★★</td><td>viaturas por rádio e helicóptero (enxerga por cima dos prédios)</td></tr>
        <tr><td>★★★</td><td>atiram à vista, SWAT e bloqueios</td></tr><tr><td>★★★★</td><td>SWAT com metralhadora, mais viaturas</td></tr><tr><td>★★★★★</td><td>exército e ruas fechadas</td></tr></table>
        <h3>Como fugir</h3><ul><li>Saia da visão e fique escondido o tempo da fuga (o HUD mostra "ESCAPANDO").</li><li>Policial colado em você impede a fuga, mesmo atrás de parede.</li>
        <li><b>Esconderijos</b> (<kbd>E</kbd> em caçamba, caixote, latão): se ninguém viu você entrar, some do radar.</li><li>Com procurado você não entra em lojas nem consegue aceitar trabalhos.</li></ul>`,

    bags: () => `<h2>Bolsas, peso e fôlego</h2>
        <p>A bolsa define <b>quantos espaços</b> a grade do inventário tem e <b>quanto peso</b> você carrega sem perder velocidade. Ela aparece no seu personagem.</p>
        <table><tr><th>Bolsa</th><th>Grade</th><th>Carga</th><th>Onde</th></tr>
        <tr><td>👖 Bolsos</td><td>3×2</td><td>8 kg</td><td>começo</td></tr><tr><td>👜 Mala transversal</td><td>4×3</td><td>14 kg</td><td>conveniência</td></tr>
        <tr><td>🎒 Mochila</td><td>5×4</td><td>24 kg</td><td>conveniência</td></tr><tr><td>🎒 Mochila tática</td><td>6×5</td><td>38 kg</td><td>loja de armas / boca</td></tr></table>
        <h3>Trocar, guardar e descartar</h3><ul><li>Comprou uma bolsa nova? A antiga fica de <b>reserva</b> (vai junto, vazia, e pesa o próprio peso). Troque em <kbd>I</kbd> → <b>👤 Equipamento</b>.</li>
        <li>Para não carregar a reserva, guarde no <b>baú</b> de casa ou <b>descarte</b>. A bolsa em uso só sai se o que você leva couber nos bolsos (3×2).</li>
        <li>No Equipamento também se trocam roupas e acessórios (comprados na <b>boutique</b> 👕 do mapa): cada peça mostra o que muda nos seus atributos antes de vestir.</li></ul>
        <h3>Peso</h3><ul><li>Tudo pesa: armas (pistola 1 kg … AK 4,3 kg), munição, kits, comida, joias, <b>dinheiro vivo</b> (R$ 50 mil ≈ 1 kg), eletrônicos furtados e cédulas de banco.</li>
        <li>Até metade da carga: normal. Até a carga cheia: cada vez mais lento (−30%). Acima dela: <b>sobrecarga</b> — bem lento e sem correr.</li>
        <li>O HUD mostra a bolsa e o peso (amarelo = pesado, vermelho = sobrecarga).</li></ul>
        <h3>Fôlego</h3><ul><li>Correr gasta fôlego (mais rápido com peso). Andando ou parado ele volta.</li><li>Zerou: <b>sem fôlego</b> — anda arrastado e só volta a correr com 35%.</li>
        <li><b>Condicionamento</b>: correr treina o personagem (até nível 20): mais fôlego, gasta menos e recupera mais rápido. Correr carregado treina mais.</li></ul>`,

    fail: () => `<h2>Prisão, morte e Tribunal</h2>
        <ul><li><b>Preso</b>: policial colado em você por alguns segundos (com procurado). Você paga multa, perde <b>todas as armas</b> e acorda na delegacia 12 h+ depois. <b>Com 1★</b> é delito leve: multa de 15%, você <b>fica com as armas</b> e é liberado em 3–5 h.</li>
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

    daily: () => `<h2>Energia e exposição (o dia)</h2>
        <p>Cada dia é limitado. Você acorda com <b>energia cheia</b> e <b>exposição zerada</b> (barras ⚡ e 🔥 no HUD).</p>
        <ul><li>Furtar, roubar carro, assaltar, brigar, atirar, correr e concluir trabalhos <b>gastam energia</b>. Cansado (menos de 12%) você não corre. Só o <b>sono</b> recupera.</li>
        <li>Crimes e estrelas de procurado <b>aumentam a exposição</b> (ela esfria devagar quando você está limpo). Exposição cheia = <b>ALERTA TÁTICO</b> no distrito onde você está: a polícia enxerga 60% mais longe até você dormir.</li>
        <li><b>Desmaio</b>: energia zerada. Você acorda em casa sem nada de sujo na mochila (dinheiro, joias e mercadoria são confiscados) e paga propina de hospital/advogado do dinheiro limpo.</li>
        <li>A decisão do dia: arriscar mais um roubo com a polícia nas ruas ou voltar para casa, dormir e começar limpo.</li></ul>
        <div class="gd-tip">Guarde dinheiro em casa (baú/cofre) ou lave antes de forçar a barra: sujo na mochila é o que se perde.</div>`,

    empire: () => `<h2>Soldados, galpões e lavagem</h2>
        <p>Na aba <b>IMPÉRIO</b> o trabalho manual vira gestão:</p>
        <ul><li><b>Galpões</b> (cada um abriga 4 soldados) e <b>soldados</b> (recrutamento + salário diário). Aloque cada soldado num distrito: todo dia ele faz roubos passivos — distritos ricos rendem mais. Soldado pode ser <b>preso</b> (mais em distrito com alerta tático, menos com delegado aliado).</li>
        <li>O lucro cai no <b>cofre do galpão</b>, como dinheiro sujo. Ele só vira dinheiro na mão quando você o <b>recolhe</b> (na favela ou em casa) — e sujo na mochila se perde num desmaio.</li>
        <li><b>Rotas de lavagem</b>: postos, restaurantes e boates de fachada comprados no distrito onde você está lavam o cofre todo dia, direto para dinheiro <b>limpo</b> (com perda e um pouco de Receita).</li>
        <li>Salário sem pagar = soldado larga o bonde. Facções inimigas emboscam as rotas.</li></ul>`,

    influence: () => `<h2>Malha de influência</h2>
        <p>Os "corações" aqui são puramente transacionais:</p>
        <ul><li><b>Delegados</b> de cada distrito: dê presentes de luxo (charutos, uísque, relógio) — <b>1 por dia</b>, entregue <b>no próprio distrito</b>. Com 10 ❤ as viaturas dali têm <b>metade do alcance de visão</b> e as estrelas sobem na metade da velocidade. Sem presente há 3 dias, ele esfria.</li>
        <li><b>Fornecedor do Porto</b>: não aceita presente, só serviço — <b>contratos de assassinato</b> e <b>sabotagens</b> de carregamentos rivais. Com 10 ❤, armas 40% mais baratas.</li>
        <li><b>Família Moretti</b> (rival) e <b>Milícia</b>: com relação −4 ou pior, mandam emboscadas nas suas rotas. Destruir os galpões deles piora a relação; tributo melhora. Vender armas à milícia agrada a ela e irrita o tráfico.</li>
        <li><b>Vereadores</b>: extorquidos com arma na mão, pagam e contam para o domínio do distrito.</li></ul>`,

    dominion: () => `<h2>Domínio e estações</h2>
        <h3>Domínio da cidade</h3><p>Cada distrito tem 3 <b>coleções</b> (aba IMPÉRIO): <b>LAVAGEM</b> (fachadas de luxo + imóveis de alto padrão no distrito), <b>INFLUÊNCIA</b> (vereadores extorquidos) e <b>FORÇA</b> (galpões rivais destruídos). Na favela: 3 fachadas do C.V, comunidade em 70+ e Gerente de Frente.</p>
        <ul><li>Lavagem completa: soldados rendem +25% ali. Influência: polícia vê 15% menos. Força: sem emboscadas.</li><li>As três: <b>distrito dominado</b> (mais bônus). Todos: <b>dono da cidade</b>.</li></ul>
        <h3>Estações do crime</h3><p>Eventos globais em ciclo, com aviso 2 dias antes — prepare-se:</p>
        <ul><li><b>Calmaria</b> (14 dias): normal.</li><li><b>Carnaval</b> (14): furtos rendem mais, polícia distraída, bancas do bicho faturam o dobro.</li>
        <li><b>Eleições</b> (28): presentes valem o dobro na influência, extorsão rende mais, a lavagem aperta.</li>
        <li><b>Intervenção Federal</b> (14): armas 3× mais caras, milícia some, polícia vê mais longe, soldados rendem a metade — hora do colarinho branco (golpes +50%).</li></ul>`,

    pool: () => `<h2>Sinuca no bar</h2>
        <p>Todo <b>bar</b> tem uma mesa de sinuca. Chegue perto dela e aperte <kbd>E</kbd>. Durante a partida o resto do mundo para.</p>
        <h3>Apostas e adversários</h3>
        <table><tr><th>Adversário</th><th>Aposta</th><th>Como joga</th></tr>
        ${Pool.STAKES.map((o, i) => `<tr><td>${o.emo} ${o.name}</td><td>${brl(o.bet)}</td><td>${['erra bastante', 'acerta as fáceis', 'simula a jogada e pensa na branca', 'precisão de profissional', 'quase não erra, joga posição'][i]}</td></tr>`).join('')}</table>
        <p>A aposta sai do dinheiro vivo (sujo). Ganhando, você leva o <b>dobro</b>.</p>
        <h3>Regras (bola 8)</h3>
        <ul><li>Quem encaçapa primeiro (depois da saída) fica com o grupo: <b>lisas 1–7</b> ou <b>listradas 9–15</b>.</li>
        <li>Encaçapou uma bola sua: joga de novo. Limpou o grupo: a próxima é a <b>8</b>.</li>
        <li><b>Falta</b>: branca na caçapa, não tocar em nada ou tocar primeiro bola que não é sua. O adversário ganha <b>bola na mão</b> (põe a branca onde quiser).</li>
        <li>Encaçapar a 8 antes de limpar o grupo, ou junto com uma falta, é <b>derrota</b>.</li></ul>
        <h3>Controles</h3>
        <ul><li><b>Mirar</b>: aponte no pano (mouse) ou arraste o dedo. <kbd>←</kbd> <kbd>→</kbd> e a roda do mouse fazem o ajuste fino.</li>
        <li><b>Força</b>: arraste a barra da direita e solte. No PC, também dá para segurar o botão do mouse e puxar para trás, ou segurar <kbd>ESPAÇO</kbd> e soltar.</li>
        <li>A linha de mira mostra onde a branca bate. A linha fica <b style="color:#fb7185">vermelha</b> se a bola atingida não for sua.</li></ul>
        <div class="gd-tip">Com bola na mão, arraste a branca para uma posição de tacada fácil antes de mirar.</div>`,
    banks: () => `<h2>Bancos</h2>
        <p>A cidade tem <b>3 sedes</b> (no Distrito Financeiro) e <b>7 agências</b>, de três marcas (marcadores coloridos na porta; lista na aba IMPÉRIO, com botão para marcar no mapa):</p>
        <ul><li><b style="color:#ec7000">Banco Inaú</b> — tecnologia: o melhor alvo do cibercrime (transferências rendem mais).</li>
        <li><b style="color:#cc092f">Banco Brascor</b> — varejo: muito dinheiro vivo nos caixas, alvo da força bruta.</li>
        <li><b style="color:#f6c700">Banco Nacional</b> — estatal: PM na porta, a polícia chega mais rápido e o suborno é caro.</li></ul>
        <h3>Agência (roubo rápido — Ladrão Arrombador+)</h3><ul><li>Entre no expediente (10h–16h), estoure os <b>caixas eletrônicos</b> e o <b>cofre de caixa</b> (E). O alarme dispara e a polícia chega em segundos.</li>
        <li>Ao sair: 3–4 estrelas e <b>3 minutos</b> para se afastar antes de a rua ser isolada.</li></ul>
        <h3>Sede (Especialista em Cofres)</h3><ul><li><b>Planta baixa</b> (mercado negro, só na favela): sem ela você não acha o cofre.</li>
        <li><b>Cortar a energia</b> na caixa de força do quarteirão (mini-game): desliga câmeras e laser e deixa entrar à noite. Vale até a meia-noite.</li>
        <li><b>Subornar os vigilantes</b> (na Nacional, também a PM): a perfuração não aciona o alarme e a polícia demora mais. Vale só hoje.</li>
        <li>Perfure o <b>cofre</b> parado no local — rende centenas de milhares.</li></ul>
        <h3>Negociação de reféns</h3><p>Se a polícia chega com você lá dentro, ela cerca o prédio e abre negociação: <b>Lábia</b> (pedir tempo) ou <b>Intimidar</b> (com arma). Cada acerto dá uma trégua para terminar e sair; três falhas e o BOPE invade (preso). Sair cercado, sem trégua, é ser preso na porta.</p>
        <h3>Dinheiro marcado</h3><p>O que sai do banco são cédulas com série rastreada: <b>pesam</b> (você fica lento), não vão para a mochila e somem se você desmaiar ou for preso. Guarde no <b>cofre do galpão</b> (precisa de galpão) para as fachadas lavarem.</p>
        <h3>Cibercrime (Estelionato Golpista+)</h3><p>Plugue o <b>pendrive</b> no terminal do gerente de uma agência (porta no firewall da marca por 3 dias) e faça a <b>transferência via laranjas</b> de casa ou da favela: confirme as contas certas antes do firewall fechar.</p>
        <h3>Conta e COAF</h3><p>Fale com o caixa: depositar <b>limpo</b> guarda os lucros com juros e nada se perde. Depositar <b>sujo</b> em conta de fachada enche o <b>Alerta do COAF</b> — cheio, bloqueiam a conta e levam metade.</p>`,

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
        <li><b>Trabalhos</b>: um por vez (e não junto com a missão do morro). O alvo aparece <b>marcado no mapa</b> (blip vermelho no minimapa) e com um <b>marcador brilhante</b> no chão; o andamento fica no painel do canto superior esquerdo. Falhar (prazo, prisão, morte, abandono) não dá XP e deixa os contatos quietos uns segundos.</li>
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
        <li>O <b>desmanche</b> fica na entrada da favela (aparece marcado no mapa nos trabalhos). Pagamento = valor do modelo × <b>estado da lataria</b>: cada batida custa caro.</li>
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
