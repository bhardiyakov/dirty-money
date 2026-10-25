// Ícones da interface: (1) a fonte de ícones do jogo (assets/ui/dm-icons.woff2 — tools/ui_icons) tem um desenho para TODO emoji que o
// código usa (fora dos comentários); (2) no jogo ela carrega, vem na frente das pilhas de fonte e pinta com as cores dela (a borda
// clara de adesivo e o contorno escuro); (3) as armas do HUD, da roda e dos menus são a arte pintada da folha (assets/ui/armas_hud).
const fs = require('fs'), path = require('path');
const { ROOT, boot, gameWait } = require('./lib.cjs');

// Símbolos de TEXTO nas mesmas faixas do Unicode (estrelas da procurado, naipes do truco, marcas): ficam com a fonte do texto.
const TEXT = new Set([...'★☆✔✓✕✖✚✦♪♫♣♥♠♦♡☰♂']);
const EMOJI = /(?:[\u{1F000}-\u{1FAFF}]|[⌚-⏿☀-➿⬀-⯿])️?(?:‍(?:[\u{1F000}-\u{1FAFF}]|[☀-➿])️?)*/gu;
function stripComments(s) {
    let out = '', i = 0, q = null;
    while (i < s.length) {
        const c = s[i];
        if (q) { out += c; if (c === '\\') { out += s[i + 1] || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
        if (s.startsWith('//', i)) { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j; continue; }
        if (s.startsWith('/*', i)) { const j = s.indexOf('*/', i + 2); i = j < 0 ? s.length : j + 2; continue; }
        out += c; i++;
    }
    return out;
}
function usedEmoji() {
    const found = new Map();
    const walk = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.js')) scan(p, stripComments(fs.readFileSync(p, 'utf8'))); } };
    const scan = (p, s) => { for (const m of s.match(EMOJI) || []) { const k = m.replace(/️/g, ''); if (TEXT.has(k)) continue; if (!found.has(k)) found.set(k, path.relative(ROOT, p)); } };
    walk(path.join(ROOT, 'src'));
    scan('index.html', fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, ''));
    return found;
}

module.exports = {
    name: 'icones',
    async run(ctx, c) {
        // 1) cobertura: todo emoji do código tem desenho na fonte
        const cover = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'ui', 'dm-icons.json'), 'utf8')).icons);
        const used = usedEmoji(), miss = [...used].filter(([k]) => !cover.has(k));
        c.ok(used.size > 200 && !miss.length, `${used.size} emojis no código, todos com desenho próprio${miss.length ? ' — faltam: ' + miss.map(([k, f]) => `${k} (${f})`).join(', ') + ' (desenhe em tools/ui_icons/ic_*.py e rode build_icons.py)' : ''}`);

        // 2) no jogo
        const { page, errors, close } = await boot(ctx);
        const f = await page.evaluate(() => {
            const cv = document.createElement('canvas'); cv.width = cv.height = 80;
            const x = cv.getContext('2d'); x.font = '64px "DM Icons"'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText('🚨', 40, 40);
            const d = x.getImageData(0, 0, 80, 80).data;
            let halo = 0, ink = 0, red = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 200) continue;
                const r = d[i], g = d[i + 1], b = d[i + 2];
                if (Math.abs(r - 0xcf) < 14 && Math.abs(g - 0xd5) < 14 && Math.abs(b - 0xde) < 14) halo++;
                else if (r < 30 && g < 30 && b < 40) ink++;
                else if (r > 150 && g < 90 && b < 90) red++;
            }
            return { loaded: document.fonts.check('20px "DM Icons"', '🚨'), stack: getComputedStyle(document.body).fontFamily, emo: getComputedStyle(document.documentElement).getPropertyValue('--emoji'), halo, ink, red };
        });
        c.ok(f.loaded, 'fonte de ícones (DM Icons) carregada no boot');
        c.ok(/^["']?DM Icons/.test(f.stack.trim()) && /DM Icons/.test(f.emo), `na frente das pilhas de fonte (texto: ${f.stack.slice(0, 40)}…; emoji: ${f.emo.trim().slice(0, 30)}…)`);
        c.ok(f.halo > 40 && f.ink > 40 && f.red > 40, `o emoji sai com o desenho do jogo, colorido (borda ${f.halo} px, contorno ${f.ink} px, vermelho ${f.red} px)`);

        // 3) armas: arte pintada no HUD e nos menus
        await page.evaluate(() => { Tutorial.skip(); game.inventory.give('ak47', 30); game.inventory.give('knife'); game.player.action = null; game.equipWeapon('ak47'); });
        await gameWait(page, 1);
        const w = await page.evaluate(() => {
            const keys = ['fists', 'knife', 'bat', 'pistol', 'pistol_sil', 'revolver', 'rifle', 'ak47', 'rpg', 'launcher', 'minigun', 'grenade', 'molotov'];
            const R = WeaponArt.sheet ? WeaponArt.sheet.rects : {};
            const hud = game.ui && game.ui._icons ? game.ui._icons.ak47 : null;
            const sq = Emoji.canvas('knife', 96);
            return { miss: keys.filter((k) => !R[k]), hud: !!(hud && hud.tagName === 'CANVAS' && hud === WeaponArt._cache.ak47), knifeSq: sq.width === sq.height && sq === WeaponArt._cache['knife#96'] };
        });
        c.ok(!w.miss.length, `atlas das armas pintadas com as 13 da folha${w.miss.length ? ' — faltam ' + w.miss.join(', ') : ''}`);
        c.ok(w.hud, 'HUD: a AK-47 na mão é a arte pintada');
        c.ok(w.knifeSq, 'menus: a faca (antes emoji) é a arte pintada, quadrada');

        c.noErrors(errors, 'icones');
        await close();
    },
};
