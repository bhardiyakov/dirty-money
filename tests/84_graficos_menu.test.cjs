// AJUSTES › GRÁFICOS AVANÇADOS (ui/GraphicsMenu.js) e os cortes do aparelho fraco (Low):
//   • o menu abre pela linha de Ajustes, anda pelo teclado (↑ ↓ ← → Enter, Esc volta sem fechar a pausa) e marca "na hora"/"ao reabrir";
//   • na hora: resolução (a placa desenha menos pixels), distância de visão (a névoa), brilho, vegetação rasteira, detalhe das pessoas,
//     contador de FPS na tela, qualidade automática; o "Restaurar" volta tudo ao nível;
//   • guardado: reabrindo o jogo, os ajustes valem desde a carga (Graphics._custom) — inclusive os que só valem ao reabrir;
//   • Low: o detalhe das pessoas do nível (lodBias 1,7) vale de fato; o recorte da câmera tira os escondidos da lista de candidatas.
const { boot, gameWait, leave } = require('./lib.cjs');

module.exports = {
	name: 'graficos_menu',
	async run(ctx, c) {
		const { page, errors, close } = await boot(ctx, { query: 'gfx=low' });
		page.setDefaultTimeout(0);
		await page.evaluate(() => { Tutorial.skip(); Interiors.autoEnter = () => {}; game.player.invulnerable = true; Config.time.cycleSeconds = 1e12; });
		await gameWait(page, 1, 120000);

		// ------------------------------------------------------------------ o menu
		const m = await page.evaluate(() => {
			const M = game.menu, K = PauseMenu.SET_KEYS;
			M.open('settings'); M.setRow = K.indexOf('gfxMenu'); M._setAdjust(0);
			const el = document.getElementById('pmSet'), rows = el.querySelectorAll('.pm-row').length, txt = el.textContent;
			const key = (k) => M._onKey({ key: k, shiftKey: false, preventDefault() {} });
			key('ArrowDown'); key('ArrowDown');                        // (linha 2: a resolução)
			const row = GraphicsMenu.row, opt = GraphicsMenu.OPTS[row - 1].k;
			key('ArrowLeft');                                          // (um degrau abaixo)
			const scale = Config.perf.renderScale, saved = (Store.getJSON('settings', null) || {}).gfx || {};
			key('Escape');
			const back = !M._gfxView && M.isOpen;
			return { has: K.includes('gfxMenu'), view: rows, live: (txt.match(/na hora/g) || []).length, reopen: (txt.match(/ao reabrir/g) || []).length, res: /Resolução/.test(txt) && /Distância de visão/.test(txt) && /Sombras/.test(txt) && /Antisserrilhado/.test(txt), row, opt, scale, saved: saved.scale, back };
		});
		c.ok(m.has && m.view >= 18 && m.res, `Ajustes › Gráficos avançados: ${m.view} linhas (resolução, distância, sombras, antisserrilhado…)`);
		c.ok(m.live >= 8 && m.reopen >= 1, `cada linha diz quando vale: ${m.live} na hora, ${m.reopen} ao reabrir`);
		c.ok(m.opt === 'scale' && m.scale < 0.56 && m.saved === m.scale, `pelo teclado: ↓↓ ← baixa a resolução na hora (${m.scale}) e guarda`);
		c.ok(m.back, 'Esc volta para Ajustes sem fechar a pausa');

		// ------------------------------------------------------------------ na hora
		const live = await page.evaluate(async () => {
			const g = game, eng = g.gameEngine.engine;
			GraphicsMenu.set('scale', 1, g);
			const w0 = eng.getRenderWidth();
			GraphicsMenu.set('scale', 0.5, g);
			const w1 = eng.getRenderWidth();
			GraphicsMenu.set('dist', 55, g);
			GraphicsMenu.set('bloom', true, g); const b1 = !!Lighting.bloomFx;
			GraphicsMenu.set('bloom', false, g); const b0 = !Lighting.bloomFx;
			GraphicsMenu.set('cover', false, g);
			GraphicsMenu.set('npc', 2.2, g);
			GraphicsMenu.set('showFps', true, g);
			GraphicsMenu.set('autoQ', false, g);
			GraphicsMenu.set('pom', true, g);                         // (só ao reabrir)
			return { w0, w1, far: Config.camera.chase.far, b1, b0, cover: Trees3D.coverOn, bias: Char3D.lodBias, aq: g.autoQuality.off, gfx: Store.getJSON('settings', null).gfx };
		});
		await page.evaluate(() => game.menu.close());                 // (com a pausa aberta o mundo não anda: a câmera e a névoa ficam paradas)
		await gameWait(page, 0.6, 60000);
		const after = await page.evaluate(() => { const el = document.getElementById('fpsMeter'); return { fog: Math.round(game.scene.fogEnd), meter: el && el.style.display !== 'none' ? el.textContent : '' }; });
		c.ok(live.w1 < live.w0, `resolução 50%: a placa desenha ${live.w1} px de largura (eram ${live.w0})`);
		c.ok(live.far === 55 && after.fog <= 58, `distância de visão 55 m: a névoa fecha em ${after.fog} m`);
		c.ok(live.b1 && live.b0, 'brilho das luzes liga e desliga na hora');
		c.ok(live.cover === false && live.bias === 2.2 && live.aq === true, `vegetação rasteira desligada, detalhe das pessoas no mínimo (${live.bias}), qualidade automática parada`);
		c.ok(/FPS/.test(after.meter), `contador na tela: "${after.meter}"`);

		// ------------------------------------------------------------------ distância dos detalhes (o corte do miúdo no chão — AirLod._ground)
		const det = [];
		for (const v of [0.6, 0]) {
			await page.evaluate((v) => GraphicsMenu.set('detail', v, game), v);
			await gameWait(page, 0.6, 60000);
			det.push(await page.evaluate(() => ({ on: !!AirLod._groundOn, hidden: AirLod.culler ? AirLod.culler.stats.hidden : 0, fine: Math.round(AirLod.R.fine || 0), fog: Math.round(game.scene.fogEnd) })));
		}
		c.ok(det[0].on && det[0].hidden > 0 && det[0].fine < det[0].fog && !det[1].on && det[1].hidden === 0, `distância dos detalhes: a 60% da névoa ${det[0].hidden} peças miúdas saem além de ${det[0].fine} m; "até o fim" devolve todas (${det[1].hidden})`);

		// ------------------------------------------------------------------ guardado: reabrindo o jogo
		await page.reload();
		await page.waitForFunction(() => window.mainMenu, null, { timeout: 300000 });
		await page.evaluate(() => window.mainMenu._start('new'));
		await page.waitForFunction(() => window.game && window.game._loadingHidden, null, { timeout: 300000 });
		await leave(page);
		const re = await page.evaluate(() => ({ scale: Config.perf.renderScale, far: Config.camera.chase.far, pom: !Config.perf.noPom, cover: Trees3D.coverOn, bias: Char3D.lodBias, aq: game.autoQuality.off, meter: !!document.getElementById('fpsMeter') }));
		c.ok(re.scale === 0.5 && re.far === 55 && re.pom && re.cover === false && re.bias === 2.2 && re.aq && re.meter, `reabrindo: os ajustes valem desde a carga (resolução ${re.scale}, visão ${re.far} m, relevo das fachadas ${re.pom ? 'ligado' : 'desligado'})`);

		// ------------------------------------------------------------------ restaurar
		const rs = await page.evaluate(() => {
			GraphicsMenu.reset(game);
			return { gfx: Store.getJSON('settings', null).gfx, scale: Config.perf.renderScale, far: Config.camera.chase.far, bias: Char3D.lodBias, base: Graphics.base };
		});
		c.ok(Object.keys(rs.gfx || {}).length === 0 && rs.scale === rs.base.renderScale && rs.far === rs.base.chaseFar && rs.bias === rs.base.lodBias, `restaurar: tudo de volta ao nível (resolução ${rs.scale}, visão ${rs.far} m, detalhe ${rs.bias})`);
		c.ok(rs.base.lodBias === 1.7, `Low: o detalhe das pessoas do nível vale de fato (lodBias ${rs.base.lodBias})`);

		// ------------------------------------------------------------------ recorte: escondidos fora das candidatas
		const cut = await page.evaluate(() => {
			const C = game.renderCuller, cs = game.scene.getActiveMeshCandidates();
			let hidden = 0;
			for (let i = 0; i < cs.length; i++) { const m = cs.data[i]; if (!m.isVisible || !m.isEnabled() || m.layerMask === 0) hidden++; }
			return { n: cs.length, hidden, dyn: C.dynamic.length };
		});
		c.ok(cut.hidden === 0 && cut.n < cut.dyn, `candidatas do desenho: ${cut.n} (nenhuma escondida; ${cut.dyn} malhas dinâmicas no mapa)`);
		// ------------------------------------------------------------------ qualidade automática: atrasos frequentes com a CPU no limite
		// (no rasterizador por software ela não desce nada — gpuSteps: simula uma placa de verdade; 1 quadro em 6 perde a vez, média 25 ms)
		const aq = await page.evaluate(() => {
			const q = game.autoQuality, fa = Perf.frameAvg, lv = q.cpuLevel;
			Object.assign(q, { off: false, gpuSteps: true, cool: 0, lateBad: 0, nLate: 0, acc: 0, n: 0, nSlow: 0, bad: 0 });
			const run = () => { for (let i = 0; i < 34; i++) { Perf.frameAvg = 25; q.tick(i % 6 === 0 ? 0.04 : 0.03, false); } };
			run(); run(); const two = q.cpuLevel; run();
			const out = { lv, two, three: q.cpuLevel, every: Char3D.LOD_EVERY.join(',') };
			Perf.frameAvg = fa; q.off = true;
			return out;
		});
		c.ok(aq.two === aq.lv && aq.three === aq.lv + 1 && aq.every === '1,2,4,6', `qualidade automática: 1 quadro em 6 atrasado por 3 s com a CPU no limite desce um degrau de processador (${aq.lv} → ${aq.three}; pose de longe a cada ${aq.every} quadros)`);
		c.noErrors(errors, 'gráficos avançados');
		await close();
	},
};
