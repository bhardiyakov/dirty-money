// tools/ui_icons/shot_preview.cjs — fotografa a folha de conferência dos ícones (preview.html) no Chromium do Playwright: confere a
// fonte colorida como o jogo a desenha.   node tools/ui_icons/shot_preview.cjs saida.png [largura]
const path = require('path'), http = require('http'), fs = require('fs');
const { playwright } = require(path.join(__dirname, '..', '..', 'tests', 'lib.cjs'));
const ROOT = path.join(__dirname, '..', '..'), out = process.argv[2] || 'preview.png', W = +(process.argv[3] || 1240);
const srv = http.createServer((req, res) => {
	const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); res.end(d); });
}).listen(0, async () => {
	const { chromium } = playwright();
	const b = await chromium.launch(), p = await b.newPage({ viewport: { width: W, height: 800 } });
	await p.goto(`http://127.0.0.1:${srv.address().port}/tools/ui_icons/preview.html`);
	await p.evaluate(() => document.fonts.ready);
	await p.waitForTimeout(300);
	await p.screenshot({ path: out, fullPage: true });
	await b.close(); srv.close();
	console.log(out);
});
