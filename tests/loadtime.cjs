#!/usr/bin/env node
// ============================================================================
// tests/loadtime.cjs — quanto o jogo demora para ABRIR numa rede limitada (CDP: banda e latência), servido com gzip como na Vercel.
//   node tests/loadtime.cjs                         o repositório (≈ 300 scripts soltos), 10 Mbit/s, 60 ms
//   node tests/loadtime.cjs dist-game 4 120         a versão publicada (node scripts/package-legacy.mjs antes), 4 Mbit/s, 120 ms
// Mede: a página carregada (todos os scripts baixados e rodados), o menu na tela, quantos pedidos e quantos MB vieram pela rede.
// (O resto da carga — física, personagens, shaders — vem depois do menu, na barra de carregamento.) Não é teste de passa/falha.
// ============================================================================
const root = require('path').resolve(__dirname, '..', process.argv[2] || '.'), mbps = +(process.argv[3] || 10), rtt = +(process.argv[4] || 60);
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), GZ = new Map();
const { playwright } = require('./lib.cjs');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
(async () => {
    const srv = http.createServer((req, res) => {
        let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        fs.readFile(path.join(root, p), (err, data) => {
            if (err) { res.writeHead(404); res.end(); return; }
            const type = MIME[path.extname(p)] || 'application/octet-stream', text = /javascript|html|json|css|manifest/.test(type);
            if (text && /gzip/.test(req.headers['accept-encoding'] || '')) { const z = GZ.get(p) || zlib.gzipSync(data, { level: 6 }); GZ.set(p, z); res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip' }); res.end(z); return; }
            res.writeHead(200, { 'Content-Type': type }); res.end(data);
        });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const { chromium } = playwright();
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: mbps * 125000, uploadThroughput: mbps * 125000 });
    let n = 0, bytes = 0, js = 0;
    cdp.on('Network.loadingFinished', (e) => { n++; bytes += e.encodedDataLength; });
    cdp.on('Network.responseReceived', (e) => { if (/\.js(\?|$)/.test(e.response.url)) js++; });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 0 });
    const tLoad = Date.now() - t0;
    await page.waitForFunction(() => window.mainMenu, null, { timeout: 0 });
    const tMenu = Date.now() - t0;
    console.log(`${root}: ${mbps} Mbit/s, ${rtt} ms — página carregada (scripts baixados e rodados) em ${(tLoad / 1000).toFixed(1)} s, menu em ${(tMenu / 1000).toFixed(1)} s · ${n} pedidos (${js} scripts), ${(bytes / 1048576).toFixed(1)} MB`);
    await browser.close(); srv.close();
})();
