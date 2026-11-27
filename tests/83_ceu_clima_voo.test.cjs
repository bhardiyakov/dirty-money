// CÉU, CLIMA, NUVENS E LOD DO VOO (world/Weather.js, world/DayNight.js, render/SkyDome.js, atmosphere/CloudField.js, lod/*.js):
//   • clima: o NUBLADO (céu fechado sem chuva), a cobertura separada da chuva, a névoa que encurta com o clima, as sombras que somem
//     sob o céu fechado (a passada de sombra sai do quadro) e voltam com o sol;
//   • voo: lá no alto o detalhe miúdo sai da tela (máscara de camada), o mapa de longe entra, o terreno carrega num raio menor e o Havok
//     para de ganhar colisores; as chamadas de desenho caem; descendo, tudo volta;
//   • nuvens: uma chamada de desenho, a cobertura pelo clima, e DENTRO de uma nuvem a névoa fecha (e abre ao sair).
const { boot, gameWait } = require('./lib.cjs');

module.exports = {
	name: 'ceu_clima_voo',
	async run(ctx, c) {
		const { page, errors, close } = await boot(ctx);
		page.setDefaultTimeout(0);
		await page.evaluate(() => {
			Tutorial.skip(); Interiors.autoEnter = () => {}; game.player.invulnerable = true; CrimeExposure._witnessSees = () => false;
			Config.time.cycleSeconds = 1e12; game.dayNight.hour = 12; game.dayNight.apply(); Weather.cur.set('clear', true, true); Weather.cur.override = 1e9;
			// (a qualidade automática desliga as sombras no SwiftShader, lento: aqui quem manda nelas é o clima)
			if (game.autoQuality) game.autoQuality.off = true;
			game.dayNight.forceNoShadows = false; game.dayNight._shadowRate = null;
			const dc = game.gameEngine.engine._drawCalls; let d0 = 0; window.__dc = 0;
			game.scene.onBeforeRenderObservable.add(() => { d0 = dc.current; });
			game.scene.onAfterRenderObservable.add(() => { window.__dc = dc.current - d0; });
		});
		await gameWait(page, 1.5, 200000);

		// ------------------------------------------------------------------ clima: nublado, tempestade, sol
		const w = {};
		for (const st of ['cloudy', 'storm', 'clear']) {
			await page.evaluate((st) => { Weather.cur.set(st, true, true); }, st);
			await gameWait(page, 0.4, 100000);
			w[st] = await page.evaluate(() => {
				const W = Weather.cur, sm = game.gameEngine.shadowGenerator.getShadowMap();
				return { k: W.k, cover: W.cover, gloom: +W.gloom.toFixed(2), fog: +W.fogMul.toFixed(2), vis: +game.camera._vis().toFixed(2), sky: +SkyDome.cover.toFixed(2), rate: sm.refreshRate, sun: +game.gameEngine.sun.intensity.toFixed(2) };
			});
		}
		c.ok(w.cloudy.k === 0 && w.cloudy.cover > 0.6 && w.cloudy.gloom > 0.3 && w.cloudy.sky > 0.6, `nublado: céu fechado sem chuva (chuva ${w.cloudy.k}, cobertura ${w.cloudy.cover}, céu ${w.cloudy.sky}, sol apagado ${w.cloudy.gloom})`);
		c.ok(w.storm.rate === 0 && w.clear.rate > 0, `sombras: somem sob a tempestade (mapa parado: ${w.storm.rate}) e voltam com o sol (a cada ${w.clear.rate} quadro)`);
		c.ok(w.storm.fog < 0.5 && w.storm.vis < w.clear.vis && w.storm.sun < w.clear.sun, `a tempestade encurta a névoa (sobra ${w.storm.fog} da visão; câmera ${w.storm.vis} × ${w.clear.vis}) e apaga o sol (${w.storm.sun} × ${w.clear.sun})`);

		// ------------------------------------------------------------------ voo: o jatinho a 400 m sobre a cidade
		await page.evaluate(() => {
			const p = game.choppers.find((q) => q.isPlane && q.M.id === 'jato');
			p.home = { x: Airport.RUNWAY.x0 + 8, z: Airport.RUNWAY.z, heading: Math.PI / 2, model: 'jato' }; p.revive(); p.rented = true;
			game.player.teleport(new BABYLON.Vector3(p.position.x, 0, p.position.z + 4)); game.player.action = null; game._boardChopper(p);
			window.__p = p; window.__fly = (alt, x, z, hd) => { p.position.x = x; p.position.z = z; p.heading = hd; p.onGround = false; p.state = 'flying'; p.y = Relief.at(x, z) + alt; p.vy = 0; p.pitch = 0; p.bank = 0; p.v = 55; window.__alt = alt; };
			window.__hold = () => { const q = window.__p; q.y = Relief.at(q.position.x, q.position.z) + window.__alt; q.vy = 0; q.pitch = 0; q.v = 55; game.input.keys.w = true; };
			window.__fly(400, 0, -300, 0);
		});
		const hold = async (secs) => { for (let i = 0; i < secs * 2; i++) { await page.evaluate(() => window.__hold()); await gameWait(page, 0.5, 100000); } };
		await hold(2);
		const v0 = await page.evaluate(() => { if (AirLod.proxy) AirLod.proxy.pump(Infinity); AirLod._evalT = 0; AirLod._lastEye && AirLod._lastEye.set(1e9, 0, 0); return { cs: game.colliderStream.active.length }; });
		await hold(1);
		const sampleDC = () => page.evaluate(() => { const sc = game.scene; sc.render(); sc.render(); return window.__dc; });
		const on = await page.evaluate(() => Object.assign({}, AirLod.stats, { R: AirLod.R, clouds: CloudField.on, draws: CloudField.mesh ? 1 : 0, alt: Math.round(window.__p.alt) }));
		const dcOn = await sampleDC();
		await page.evaluate(() => { Config.lod.on = false; }); await hold(0.5);
		const dcOff = await sampleDC();
		await page.evaluate(() => { Config.lod.on = true; AirLod._evalT = 0; AirLod._lastEye && AirLod._lastEye.set(1e9, 0, 0); }); await hold(1);
		c.ok(on.active && on.hidden > 100 && on.proxyReady && on.proxyOn > 0, `no alto (${on.alt} m) o LOD do voo liga: ${on.hidden} malhas de detalhe fora da tela de ${on.items}, mapa de longe com ${on.proxyOn} pedaços à mostra`);
		c.ok(dcOn < dcOff * 0.7, `as chamadas de desenho caem: ${dcOff} → ${dcOn}`);
		c.ok(on.physicsHold && on.terrainMul < 1, `lá em cima o Havok não ganha colisores e o terreno carrega num raio menor (×${on.terrainMul})`);
		// voa 700 m: nenhum colisor novo
		const cs0 = await page.evaluate(() => game.colliderStream.active.length);
		await page.evaluate(() => window.__fly(400, 450, -150, 1.2)); await hold(1.5);
		const cs1 = await page.evaluate(() => game.colliderStream.active.length);
		c.ok(cs1 <= cs0, `voando por cima da cidade o streaming não cria corpos (${v0.cs} → ${cs0} → ${cs1})`);

		// ------------------------------------------------------------------ nuvens: cobertura e dentro da nuvem
		const cl = {};
		for (const st of ['clear', 'storm']) {
			await page.evaluate((st) => { Weather.cur.set(st, true, true); CloudField._sortT = 0; }, st);
			await hold(0.5);
			cl[st] = await page.evaluate(() => ({ on: CloudField.on, shown: CloudField.stats.shown, total: CloudField.stats.puffs }));
		}
		c.ok(cl.clear.on && cl.storm.shown > cl.clear.shown * 2, `nuvens da faixa de voo numa malha: céu limpo ${cl.clear.shown} bolhas, tempestade ${cl.storm.shown} de ${cl.storm.total}`);
		// dentro da nuvem maior que está à mostra
		await page.evaluate(() => {
			const q = CloudField._cl.filter((n) => n.vis > 0.9).sort((a, b) => b.R - a.R)[0], wr = CloudField._wrap, dx = CloudField.DRIFT_DIR[0] * CloudField._drift, dz = CloudField.DRIFT_DIR[1] * CloudField._drift;
			const cx = wr.x + CloudField._mod(q.x + dx - wr.x, wr.z), cz = wr.y + CloudField._mod(q.z + dz - wr.y, wr.w), cy = q.y - 55 * Weather.cur.k + q.H * 0.5;
			window.__in = { cx, cz, cy };
			// (a câmera de perseguição fica atrás e acima do avião: o avião um pouco à frente e abaixo do meio da nuvem)
			window.__fly(cy - Relief.at(cx, cz) - 4, cx, cz - 14, 0); window.__drift = CloudField._drift;
		});
		let ins = 0;
		for (let i = 0; i < 4 && ins < 0.5; i++) { await page.evaluate(() => { const I = window.__in; CloudField._drift = window.__drift; window.__p.position.x = I.cx; window.__p.position.z = I.cz - 14; window.__hold(); }); await gameWait(page, 0.5, 100000); ins = await page.evaluate(() => CloudField.inside); }
		const inV = await page.evaluate(() => ({ ins: +CloudField.inside.toFixed(2), vis: +game.camera._vis().toFixed(2), far: Math.round(game.scene.fogEnd) }));
		await page.evaluate(() => window.__fly(420, 0, -300, 0)); await hold(1.5);
		const outV = await page.evaluate(() => ({ ins: +CloudField.inside.toFixed(2), far: Math.round(game.scene.fogEnd) }));
		c.ok(inV.ins > 0.5 && inV.vis < 0.5 && outV.ins < 0.2 && outV.far > inV.far * 1.5, `dentro da nuvem a névoa fecha (dentro ${inV.ins}, fim da névoa ${inV.far} m) e abre ao sair (${outV.ins}, ${outV.far} m)`);

		// ------------------------------------------------------------------ descendo: tudo volta
		await page.evaluate(() => { Weather.cur.set('clear', true, true); game.camera.setAir(0); window.__fly(10, 0, -300, 0); });
		await page.evaluate(() => { const p = window.__p; p.y = Relief.at(p.position.x, p.position.z) + 10; });
		for (let i = 0; i < 3; i++) { await page.evaluate(() => { const p = window.__p; p.y = Relief.at(p.position.x, p.position.z) + 10; p.vy = 0; game.camera.setAir(0); }); await gameWait(page, 0.4, 100000); }
		const off = await page.evaluate(() => Object.assign({}, AirLod.stats, { masked: game.scene.meshes.filter((m) => m.layerMask === 0 && /^world_(trim|curb|walls_)/.test(m.name)).length, clouds: CloudField.on }));
		c.ok(!off.active && off.hidden === 0 && off.proxyOn === 0 && !off.physicsHold && off.terrainMul === 1 && off.masked === 0, `perto do chão o LOD do voo desliga e devolve tudo (escondidas ${off.hidden}, mapa de longe ${off.proxyOn}, Havok ${off.physicsHold ? 'parado' : 'normal'})`);
		c.noErrors(errors, 'céu, clima e voo');
		await close();
	},
};
