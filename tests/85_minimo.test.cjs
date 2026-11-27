// NÍVEL MÍNIMO (celular de entrada — core/Graphics.js, MIN) e o Low que já abre leve:
//   • Mínimo = o Low com os cortes de processador já ligados: metade da gente e do trânsito do Low, névoa a 50 m, 3D das pessoas até 32 m,
//     fachadas só com molduras e ar-condicionado, sem peças nos telhados nem pássaros, vida da cidade baixa, terreno em raio de 130 m;
//     Graphics.level continua 'low' (as tabelas por nível valem) e Graphics.minimal marca o corte;
//   • Low: desde a abertura, a pose de meia distância para longe a cada 2, 3 e 4 quadros e a lógica de longe a partir de 15 m;
//   • automático: a qualidade automática que esgota a escada de processador no Low deixa o aviso gfxMinNext — a próxima abertura vem
//     no Mínimo; escolher o nível à mão apaga o aviso.
const { boot, gameWait, leave } = require('./lib.cjs');

const perfil = () => {
	const P = Config.perf, W = Walls3D, R = Roofs3D;
	let peças = 0, molduras = 0, props = 0;
	for (const [kd, m] of Object.entries((W._built && W._built.meshes) || {})) { const n = (m && m.thinInstanceCount) | 0; if (kd === 'frame' || kd === 'ac') molduras += n; else peças += n; }
	for (const K of (R._built && R._built.parts) || []) if (K.meshes[0]) props += K.meshes[0].thinInstanceCount | 0;
	return {
		level: Graphics.level, minimal: !!Graphics.minimal, name: Graphics.levelName(), pm: !!P.minimal, every: Char3D.LOD_EVERY.join(','), hR: P.halfFarR, half: !!P.halfFar,
		far: Config.camera.chase.far, npc: Config.npc.count, cars: Config.traffic.count, load: Config.world.loadRadius, life: Life.level(),
		birds: game.birds ? game.birds.birds.length : 0, cover: Trees3D.coverOn, peças, molduras, props,
	};
};

module.exports = {
	name: 'minimo',
	async run(ctx, c) {
		// ------------------------------------------------------------------ Low: já abre com os cortes discretos
		{
			const { page, errors, close } = await boot(ctx, { query: 'gfx=low' });
			page.setDefaultTimeout(0);
			await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; if (game.autoQuality) game.autoQuality.off = true; });
			await gameWait(page, 1, 120000);
			const lo = await page.evaluate(perfil);
			c.ok(lo.level === 'low' && !lo.minimal && lo.name === 'Low' && lo.half && lo.every === '1,2,3,4' && lo.hR === 15, `Low abre leve: pose de longe a cada ${lo.every} quadros, lógica de longe além de ${lo.hR} m`);
			globalThis.__low = lo;
			// (a escada de processador esgotada no Low automático deixa o aviso para a próxima abertura)
			const aviso = await page.evaluate(() => {
				const q = game.autoQuality, s = Store.getJSON('settings', null) || {}; delete s.graphics; Store.setJSON('settings', s); Store.remove('gfxMinNext');
				const ch = Graphics.choice; Graphics.choice = 'auto'; q.gpuSteps = true;
				while (q.cpuLevel < AutoQuality.CPU_STEPS.length) q._cpuDown();
				const set = !!Store.getJSON('gfxMinNext', null); Graphics.choice = ch;
				return { set, every: Char3D.LOD_EVERY.join(','), hR: Config.perf.halfFarR };
			});
			c.ok(aviso.set && aviso.every === '1,2,4,6' && aviso.hR === 12, `escada de processador esgotada no Low automático: a próxima abertura vem no Mínimo (pose ${aviso.every}, longe além de ${aviso.hR} m)`);
			c.noErrors(errors, 'Low');
			await close();
		}
		// ------------------------------------------------------------------ Mínimo
		const { page, errors, close } = await boot(ctx, { touch: true, width: 915, height: 412, query: 'gfx=min&celular' });
		page.setDefaultTimeout(0);
		await page.evaluate(() => { Tutorial.skip(); game.player.invulnerable = true; if (game.autoQuality) game.autoQuality.off = true; Config.time.cycleSeconds = 1e12; game.dayNight.hour = 14; game.dayNight.apply(); });
		await leave(page);
		await gameWait(page, 3, 120000);
		const mn = await page.evaluate(perfil), lo = globalThis.__low;
		c.ok(mn.level === 'low' && mn.minimal && mn.pm && mn.name === 'Mínimo', `?gfx=min: Mínimo (Graphics.level ${mn.level}, minimal)`);
		c.ok(mn.far <= 50 && mn.load <= 130 && mn.hR === 12 && mn.every === '1,2,3,4', `névoa a ${mn.far} m, terreno em ${mn.load} m, lógica de longe além de ${mn.hR} m`);
		c.ok(mn.npc < lo.npc && mn.cars <= lo.cars, `menos gente e trânsito: ${mn.npc} pedestres e ${mn.cars} carros (Low: ${lo.npc} e ${lo.cars})`);
		c.ok(mn.peças === 0 && mn.molduras > 0 && mn.props === 0 && mn.birds === 0 && !mn.cover && mn.life === 'baixa', `sem peças miúdas (${mn.molduras} molduras/ar-condicionado ficam), sem peças nos telhados, pássaros nem rasteiras; vida da cidade ${mn.life}`);
		const lbl = await page.evaluate(() => ({ l: Graphics.label('min'), ch: Graphics.CHOICES.includes('min') }));
		c.ok(lbl.ch && lbl.l === 'Mínimo', 'Ajustes › Gráficos oferece o Mínimo');
		c.noErrors(errors, 'Mínimo');
		await close();
	},
};
