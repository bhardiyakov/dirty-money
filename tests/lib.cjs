// ============================================================================
// tests/lib.cjs — o que os testes compartilham: um servidor estático da pasta do jogo (sem dependência nenhuma), o Chromium do
// Playwright (renderização por software: roda em máquina sem placa de vídeo, como o CI), iniciar um jogo novo e coletar erros.
// O Playwright é procurado em: PLAYWRIGHT_PATH, node_modules do projeto, instalação global do Node.
// ============================================================================
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary',
    '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json', '.ktx2': 'image/ktx2' };

function playwright() {
    const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', path.join(ROOT, 'node_modules/playwright')];
    try { const g = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); tries.push(path.join(g, 'playwright')); } catch (e) { /* sem npm */ }
    for (const t of tries) { if (!t) continue; try { return require(t); } catch (e) { /* próximo */ } }
    throw new Error('Playwright não encontrado. Instale com: npm i --no-save playwright && npx playwright install chromium');
}

// Servidor estático da pasta do jogo numa porta livre.
function serve() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
            fs.readFile(f, (err, data) => {
                if (err) { res.writeHead(404); res.end(); return; }
                res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
                res.end(data);
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
    });
}

// Abre o jogo, começa um jogo novo e espera a tela de carregamento sumir. opts: { touch, width, height, outside (sai do esconderijo),
// query (mais parâmetros na URL: 'gfx=high') }
async function boot(ctx, opts = {}) {
    const { chromium } = playwright();
    const browser = ctx.browser || (ctx.browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] }));
    const bctx = await browser.newContext({ viewport: { width: opts.width || 1280, height: opts.height || 720 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: 1 });
    const page = await bctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
    const q = [opts.touch ? 'touch' : '', opts.query || ''].filter(Boolean).join('&');
    await page.goto(ctx.url + '/index.html' + (q ? '?' + q : ''));
    await page.waitForFunction(() => window.mainMenu, null, { timeout: 300000 });
    await page.evaluate(() => window.mainMenu._start('new'));
    await page.waitForFunction(() => window.game && window.game._loadingHidden, null, { timeout: 300000 });
    await page.evaluate(() => { if (game.menu && game.menu.settings) game.menu.settings.hints = false; });
    if (opts.outside !== false) await leave(page);
    return { page, errors, close: () => bctx.close() };
}
async function leave(page) {
    await page.evaluate(() => { if (Interiors.active) Interiors.leave(game); });
    await page.waitForFunction(() => !Interiors.active && !Interiors.busy, null, { timeout: 60000 });
}
// Espera `ms` de tempo de JOGO (o Chromium por software roda devagar: o relógio do jogo anda menos que o da parede).
async function gameWait(page, seconds, maxReal = seconds * 6000) {
    await page.evaluate(() => { window.__gt = 0; if (!window.__gtHook) { window.__gtHook = true; const o = game._update.bind(game); game._update = (dt) => { window.__gt += dt || 0; return o(dt); }; } });
    const t0 = Date.now();
    while (Date.now() - t0 < maxReal) { const t = await page.evaluate(() => window.__gt); if (t >= seconds) return t; await page.waitForTimeout(500); }
    return page.evaluate(() => window.__gt);
}

class Check {
    constructor(name) { this.name = name; this.fails = []; this.notes = []; }
    ok(cond, msg) { if (!cond) this.fails.push(msg); return !!cond; }
    eq(a, b, msg) { return this.ok(a === b, `${msg} (esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)})`); }
    note(msg) { this.notes.push(msg); }
    noErrors(errors, where) { const E = errors.filter((e) => !/favicon|Failed to load resource|net::ERR/i.test(e)); this.ok(!E.length, `${where}: ${E.length} erro(s) de JavaScript — ${E.slice(0, 3).join(' || ')}`); errors.length = 0; }
}

module.exports = { ROOT, playwright, serve, boot, leave, gameWait, Check };
