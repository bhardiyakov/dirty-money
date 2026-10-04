// ============================================================================
// EndScreen — telas de fim ("DETIDO" ao ser preso, "FIM DA LINHA" ao morrer), em HD.
// O jogo fica parado atrás de um blur forte com vinheta; o título é tipografia grande com gradiente e brilho, as linhas de
// informação entram em sequência e o aviso para continuar pulsa embaixo.
// ============================================================================

class EndScreen {
    constructor() {
        const css = document.createElement('style');
        css.textContent = `
            #endscreen { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3vh;
                opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.6s ease, visibility 0s linear 0.6s; font-family: var(--font); color: var(--tx); text-align: center; padding: 24px;
                -webkit-backdrop-filter: blur(22px) brightness(0.45) saturate(0.7); backdrop-filter: blur(22px) brightness(0.45) saturate(0.7);
                background: radial-gradient(ellipse at center, rgba(40,0,8,0.15) 20%, rgba(0,0,0,0.85) 100%); }
            #endscreen.show { opacity: 1; visibility: visible; transition: opacity 0.6s ease; }
            #endscreen .es-title { font: 800 clamp(56px, 14vmin, 150px)/0.95 var(--font-d); letter-spacing: -0.02em;
                background: linear-gradient(180deg, #ffd0d6 0%, #fb7185 35%, #e11d48 70%, #881337 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
                filter: drop-shadow(0 6px 30px rgba(225,29,72,0.55)); animation: esIn .7s cubic-bezier(.2,.9,.3,1.2) both; }
            #endscreen .es-lines { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: min(460px, 90vw); }
            #endscreen .es-line { font: 600 clamp(14px, 2.2vmin, 19px) var(--font); padding: 10px 18px; border-radius: 12px; background: rgba(255,255,255,0.06);
                border: 1px solid var(--line); width: 100%; animation: esUp .5s ease both; }
            #endscreen .es-press { margin-top: 2vh; font: 600 13px var(--font); letter-spacing: 0.14em; text-transform: uppercase; color: var(--tx-2); animation: esPulse 1.6s ease-in-out infinite; }
            @keyframes esIn { from { opacity: 0; transform: scale(1.25); } to { opacity: 1; transform: scale(1); } }
            @keyframes esUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
            @keyframes esPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }`;
        document.head.appendChild(css);

        const el = this.el = document.createElement('div');
        el.id = 'endscreen';
        el.innerHTML = '<div class="es-title"></div><div class="es-lines"></div><div class="es-press"></div>';
        document.body.appendChild(el);
        this.titleEl = el.querySelector('.es-title');
        this.linesEl = el.querySelector('.es-lines');
        this.pressEl = el.querySelector('.es-press');
        this.visible = false;
    }

    // title: texto grande | lines: [{ text, color? }] | prompt: texto piscando embaixo.
    show({ title, lines = [], prompt = 'Pressione qualquer botão para continuar' }) {
        this.titleEl.textContent = title;
        this.titleEl.style.animation = 'none'; void this.titleEl.offsetWidth; this.titleEl.style.animation = '';
        this.linesEl.replaceChildren(...lines.map((l, i) => {
            const d = document.createElement('div');
            d.className = 'es-line'; d.textContent = l.text; d.style.animationDelay = (0.35 + i * 0.12) + 's';
            if (l.color) d.style.color = l.color;
            return d;
        }));
        this.pressEl.textContent = prompt;
        this.visible = true;
        this.el.classList.add('show');
    }

    hide() {
        this.visible = false;
        this.el.classList.remove('show');
    }
}
