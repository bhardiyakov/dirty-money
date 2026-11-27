// ============================================================================
// DetailCuller — no VOO, tira da tela o detalhe que fica longe demais para ser visto (a camada PERTO e a MÉDIA de lod/AirLod.js). No
// chão a névoa da perseguição já corta o longe e o frustum descarta o resto; lá de cima, a 300–600 m, o frustum pega a cidade inteira e
// o jogo chegava a ~1.900 chamadas de desenho por quadro — a maior parte de coisa que vira um pixel: meio-fio, acabamento, pontos de
// ônibus, fios, brilho dos sinais, vitrines, decalques, vegetação. Aqui cada malha ESTÁTICA do mundo cai numa FAIXA pelo nome:
//   fine  detalhe miúdo (acabamento, meio-fio, vitrine, fio, poste, placa, ponto de ônibus, brilho…)  some além de ~240 m
//   mid   vegetação, pátios, degradês do chão                                                    some além de ~520 m
//   big   paredes, telhados, ruas, calçadas                                       some além de ~950 m (aí entra lod/FarProxy.js)
// A distância é do OLHO até a caixa da malha (3D: lá do alto o que está bem embaixo também está longe). Esconder é pela MÁSCARA DE
// CAMADA (layerMask 0: nenhuma câmera desenha), não por setEnabled/isVisible — os donos das malhas (os brilhos que acendem à noite,
// os interiores que escondem a cidade, o recorte do telhado) continuam mexendo nelas sem briga; a malha escondida nem entra na
// avaliação de malhas ativas do quadro (a máscara é o primeiro teste). Histerese de 8% na borda de cada faixa: nada pisca.
// Malhas criadas depois (pedaços de terreno, pontos de ônibus) entram na próxima varredura (a cada 2 s, só se a lista da cena mudou).
// Sem alocação por avaliação: as caixas ficam guardadas (o mundo é estático).
// ============================================================================

class DetailCuller {
	static RULES = [
		['fine', /^world_(trim|xtrim|btrim|curb|xcurb|bcurb|shop3|shopglass|shoptext|shop|decal|signs|ao|zebra|hide_top|machtop|machside|fav_)/],
		['fine', /^(pontoOnibus|wires|signalGlow|favGlow|lamps_|signs_|shopGlow|world_fav)/],
		['mid', /^world_(veg_|open_|yard_|blend_)/],
		['mid', /^terr_.*_(vhi|vlo)$/],
		['big', /^world_(walls_|roof_|asphalt|road|sidewalk|ground)/],
	];

	constructor(scene) {
		this.scene = scene;
		this.items = [];                                  // { m, band, x0, y0, z0, x1, y1, z1, off, mask }
		this.active = false;
		this.stats = { items: 0, hidden: 0, scans: 0 };
		this._n = -1; this._scanT = 0; this._seen = new Set();
	}

	// Varre a cena atrás de malhas novas que casam com as regras (a lista da cena mudou de tamanho e já passaram 2 s).
	scan(dt = 0, force = false) {
		this._scanT -= dt;
		const M = this.scene.meshes;
		if (!force && (this._scanT > 0 || M.length === this._n)) return;
		this._scanT = 2; this._n = M.length; this.stats.scans++;
		// (as que foram descartadas saem da lista)
		for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].m.isDisposed()) { this._seen.delete(this.items[i].m); this.items[i] = this.items[this.items.length - 1]; this.items.pop(); }
		for (const m of M) {
			if (this._seen.has(m)) continue;
			this._seen.add(m);
			if (m.alwaysSelectAsActiveMesh || !m.getTotalVertices || !m.getTotalVertices()) continue;
			let band = null;
			for (const [b, re] of DetailCuller.RULES) if (re.test(m.name)) { band = b; break; }
			if (!band) continue;
			m.computeWorldMatrix(true);
			const bb = m.getBoundingInfo().boundingBox, a = bb.minimumWorld, b = bb.maximumWorld;
			this.items.push({ m, band, x0: a.x, y0: a.y, z0: a.z, x1: b.x, y1: b.y, z1: b.z, off: false, mask: 0 });
		}
		this.stats.items = this.items.length;
	}

	// Avalia todas as malhas para o olho `E` (Vector3) com os raios R = { fine, mid, big } (m). big: Infinity = nunca esconde as grandes
	// (o mapa de longe ainda não está pronto).
	update(E, R) {
		this.active = true;
		let hidden = 0;
		for (const it of this.items) {
			const dx = Math.max(it.x0 - E.x, 0, E.x - it.x1), dy = Math.max(it.y0 - E.y, 0, E.y - it.y1), dz = Math.max(it.z0 - E.z, 0, E.z - it.z1);
			const d = Math.sqrt(dx * dx + dy * dy + dz * dz), r = R[it.band];
			const off = it.off ? d > r * 0.92 : d > r;
			if (off !== it.off) {
				it.off = off;
				if (off) { it.mask = it.m.layerMask; it.m.layerMask = 0; }
				else if (it.m.layerMask === 0) it.m.layerMask = it.mask;
			}
			if (off) hidden++;
		}
		this.stats.hidden = hidden;
	}

	// Devolve tudo (a câmera desceu): a máscara de cada malha volta a ser a de antes.
	restoreAll() {
		for (const it of this.items) if (it.off) { it.off = false; if (it.m.layerMask === 0) it.m.layerMask = it.mask; }
		this.active = false; this.stats.hidden = 0;
	}

	dispose() { this.restoreAll(); this.items.length = 0; this._seen.clear(); }
}
