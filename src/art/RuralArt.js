// ============================================================================
// RuralArt — o desenho da ROÇA (referência: a folha da roça), em MeshBatch com cor por vértice. As peças vêm do Bairros (sítios e roças:
// `pieces` dos quarteirões) e são desenhadas pelo WorldBuilder._pieces:
//   crops        canteiro de TERRA VERMELHA em leiras, com a planta da cultura: milho (colmo, folhas compridas, pendão e espiga), couve
//                (rosetas de folhas), tomate (estaca e pé com os tomates), mandioca (hastes com a copa no alto) ou alface
//   tractor      trator velho (rodas grandes atrás, capô, escapamento, banco e volante) · cart: carroça de madeira com duas rodas
//   wheelbarrow  carrinho de mão · harvest: sacos de colheita (café, milho, feijão) e caixotes de verdura · firewood: pilha de lenha
//   oven         forno de barro sobre a base de tijolo, com a boca acesa · hives: colmeias · shed: curral coberto com o cocho
// ============================================================================

const RuralArt = {
	SOIL: [0.56, 0.27, 0.15], SOIL_D: [0.42, 0.19, 0.1],

	piece(W, t, p, rng) {
		const fn = this['_' + p.kind];
		if (!fn) return false;
		const x = p.x !== undefined ? p.x : (p.x0 + p.x1) / 2, z = p.z !== undefined ? p.z : (p.z0 + p.z1) / 2;
		if (p.kind !== 'crops') MeshBatch.anchor = typeof Relief !== 'undefined' && Relief.on ? { h: Relief.at(x, z) } : null;      // (rígido no chão do morro)
		fn.call(this, t, p, rng, W);
		MeshBatch.anchor = null;
		return true;
	},

	// ------------------------------------------------------------------ plantações
	_crops(t, p, rng) {
		const crop = p.crop === 'corn' ? 'corn' : p.crop === 'veg' ? ['couve', 'tomate', 'alface', 'mandioca'][Math.floor(rng() * 4)] : p.crop;
		const alongX = p.rows === 'x', gap = crop === 'corn' || crop === 'mandioca' ? 1.3 : 1.0;
		t.solid(p.x0, p.z0, p.x1, p.z1, 0, 0.04, this.SOIL_D);
		const a0 = alongX ? p.z0 : p.x0, a1 = alongX ? p.z1 : p.x1, b0 = alongX ? p.x0 : p.z0, b1 = alongX ? p.x1 : p.z1;
		const step = { corn: 0.75, mandioca: 0.9, couve: 0.6, alface: 0.45, tomate: 0.7 }[crop];
		for (let s = a0 + 0.55; s < a1 - 0.3; s += gap) {
			// leira: o camalhão de terra vermelha da fileira
			if (alongX) t.obox((b0 + b1) / 2, s, 1, 0, (b1 - b0) / 2 - 0.2, 0.32, 0.04, 0.16, this.SOIL, (b1 - b0) / 2 - 0.25, 0.18);
			else t.obox(s, (b0 + b1) / 2, 0, 1, (b1 - b0) / 2 - 0.2, 0.32, 0.04, 0.16, this.SOIL, (b1 - b0) / 2 - 0.25, 0.18);
			for (let u = b0 + 0.45; u < b1 - 0.3; u += step * (0.85 + rng() * 0.3)) {
				const [qx, qz] = alongX ? [u, s] : [s, u];
				this['_' + crop](t, qx, 0.14, qz, rng);
			}
		}
	},
	_leaf(t, x, y, z, a, len, up, w, col) {                                     // folha: lâmina fina, inclinada para fora
		const dx = Math.cos(a), dz = Math.sin(a), ex = x + dx * len, ez = z + dz * len, ey = y + up;
		t.tube([x, y, z], [ex, ey, ez], w, 0.01, col, 3);
	},
	_corn(t, x, y, z, rng) {
		const h = 1.5 + rng() * 0.5, G = [0.34 + rng() * 0.08, 0.56 + rng() * 0.1, 0.2];
		t.tube([x, y, z], [x + (rng() - 0.5) * 0.08, y + h, z], 0.035, 0.02, [0.42, 0.55, 0.22], 4);
		for (let k = 0; k < 5; k++) { const yy = y + 0.3 + k * h * 0.16, a = rng() * 6.28; this._leaf(t, x, yy, z, a, 0.45 + rng() * 0.25, -0.05 + rng() * 0.25, 0.05, G); }
		t.tube([x, y + h, z], [x, y + h + 0.22, z], 0.03, 0.005, [0.86, 0.74, 0.36], 3);              // pendão
		if (rng() < 0.6) { const yy = y + h * 0.5; t.tube([x + 0.04, yy, z], [x + 0.09, yy + 0.25, z + 0.03], 0.045, 0.03, rng() < 0.5 ? [0.92, 0.8, 0.3] : [0.6, 0.7, 0.32], 4); }      // espiga
	},
	_mandioca(t, x, y, z, rng) {
		const h = 1.3 + rng() * 0.4;
		for (let k = 0; k < 3; k++) { const ox = (rng() - 0.5) * 0.3, oz = (rng() - 0.5) * 0.3; t.tube([x, y, z], [x + ox, y + h, z + oz], 0.02, 0.015, [0.5, 0.34, 0.24], 3); for (let j = 0; j < 4; j++) { const a = j / 4 * 6.28 + rng(); this._leaf(t, x + ox, y + h, z + oz, a, 0.3, -0.12, 0.06, [0.24, 0.5, 0.2]); } }
	},
	_couve(t, x, y, z, rng) {
		const G = [[0.22, 0.48, 0.24], [0.3, 0.58, 0.3], [0.38, 0.62, 0.34]];
		t.tube([x, y, z], [x, y + 0.35, z], 0.025, 0.025, [0.5, 0.62, 0.4], 3);
		for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + rng() * 0.4, yy = y + 0.15 + rng() * 0.2; this._leaf(t, x, yy, z, a, 0.28 + rng() * 0.08, 0.12, 0.09, G[k % 3]); }
	},
	_alface(t, x, y, z, rng) {
		const g = 0.55 + rng() * 0.15;
		t.tube([x, y, z], [x, y + 0.14, z], 0.15, 0.1, [0.42, g, 0.28], 6);
		t.tube([x, y + 0.14, z], [x, y + 0.2, z], 0.1, 0.03, [0.5, g + 0.1, 0.32], 6);
	},
	_tomate(t, x, y, z, rng) {
		t.tube([x, y, z], [x, y + 1.25, z], 0.018, 0.018, [0.62, 0.5, 0.34], 3);                    // estaca
		for (let k = 0; k < 6; k++) { const a = rng() * 6.28, yy = y + 0.2 + k * 0.17; this._leaf(t, x, yy, z, a, 0.22, 0.08, 0.07, [0.24, 0.48, 0.2]); }
		for (let k = 0; k < 4; k++) { const a = rng() * 6.28, r = 0.12, yy = y + 0.35 + rng() * 0.6; t.tube([x + Math.cos(a) * r, yy, z + Math.sin(a) * r], [x + Math.cos(a) * r, yy + 0.07, z + Math.sin(a) * r], 0.045, 0.035, rng() < 0.7 ? [0.86, 0.18, 0.12] : [0.9, 0.55, 0.15], 5); }
	},

	// ------------------------------------------------------------------ máquinas e carroças
	_wheel(t, cx, cy, cz, ax, az, r, w, col = [0.1, 0.1, 0.1], hub = [0.7, 0.62, 0.2]) {
		t.tube([cx - ax * w / 2, cy, cz - az * w / 2], [cx + ax * w / 2, cy, cz + az * w / 2], r, r, col, 10);
		for (const s of [-1, 1]) {                                                    // calotas (faces)
			const c = [cx + ax * w / 2 * s, cy, cz + az * w / 2 * s];
			FavelaDetail.disc(t, c, [ax * s, 0, az * s], r * 0.98, col, 10);
			FavelaDetail.disc(t, [c[0] + ax * s * 0.01, cy, c[2] + az * s * 0.01], [ax * s, 0, az * s], r * 0.45, hub, 8);
		}
	},
	_tractor(t, p) {
		const x = p.x, z = p.z, fx = p.fx || 0, fz = p.fz || 1, rx = fz, rz = -fx, red = p.color ? p.color : [0.72, 0.14, 0.1], dark = [0.16, 0.16, 0.17];
		const P = (l, s) => [x + fx * l + rx * s, z + fz * l + rz * s];
		let q = P(0.3, 0); t.obox(q[0], q[1], fx, fz, 1.15, 0.42, 0.55, 1.3, red, 1.05, 0.36);           // capô e motor
		q = P(1.48, 0); t.obox(q[0], q[1], fx, fz, 0.06, 0.38, 0.6, 1.2, [0.5, 0.5, 0.52]);                // grade da frente
		q = P(-1.05, 0); t.obox(q[0], q[1], fx, fz, 0.45, 0.55, 0.65, 0.95, red);                            // corpo traseiro
		q = P(-1.15, 0); t.obox(q[0], q[1], fx, fz, 0.22, 0.25, 0.95, 1.35, dark);                           // banco
		q = P(-0.75, 0); t.tube([q[0], 0.95, q[1]], [q[0] + fx * 0.2, 1.5, q[1] + fz * 0.2], 0.02, 0.02, dark, 3);       // coluna do volante
		FavelaDetail.disc(t, [q[0] + fx * 0.2, 1.5, q[1] + fz * 0.2], [-fx * 0.3, 1, -fz * 0.3], 0.2, dark, 8);
		q = P(0.75, 0.22); t.tube([q[0], 1.3, q[1]], [q[0], 2.1, q[1]], 0.045, 0.045, [0.22, 0.22, 0.22], 5);           // escapamento
		for (const s of [-1, 1]) {
			q = P(-1.05, s * 0.88); this._wheel(t, q[0], 0.78, q[1], rx, rz, 0.78, 0.42, dark, [0.85, 0.7, 0.15]);       // rodas traseiras
			q = P(-1.05, s * 0.66); t.obox(q[0], q[1], fx, fz, 0.7, 0.08, 1.3, 1.36, red);                                // para-lamas
			q = P(1.0, s * 0.6); this._wheel(t, q[0], 0.42, q[1], rx, rz, 0.42, 0.24, dark, [0.85, 0.7, 0.15]);          // rodas dianteiras
		}
		q = P(1.36, 0); t.obox(q[0], q[1], rx, rz, 0.08, 0.04, 1.0, 1.08, [0.95, 0.92, 0.7]);                         // faróis
	},
	_cart(t, p) {
		const x = p.x, z = p.z, fx = p.fx || 0, fz = p.fz || 1, rx = fz, rz = -fx, wood = [0.55, 0.38, 0.22], woodD = [0.38, 0.26, 0.15];
		const P = (l, s) => [x + fx * l + rx * s, z + fz * l + rz * s];
		let q = P(0, 0); t.obox(q[0], q[1], fx, fz, 1.2, 0.75, 0.75, 0.85, wood);                                     // assoalho
		for (const s of [-1, 1]) { q = P(0, s * 0.72); t.obox(q[0], q[1], fx, fz, 1.2, 0.04, 0.85, 1.25, woodD); for (let l = -1.0; l <= 1.0; l += 0.5) { const c = P(l, s * 0.72); t.obox(c[0], c[1], fx, fz, 0.04, 0.05, 0.85, 1.3, woodD); } }
		for (const l of [-1.2, 1.2]) { q = P(l, 0); t.obox(q[0], q[1], rx, rz, 0.75, 0.04, 0.85, 1.2, woodD); }
		for (const s of [-1, 1]) { q = P(-0.1, s * 0.95); this._wheel(t, q[0], 0.62, q[1], rx, rz, 0.62, 0.1, [0.42, 0.3, 0.18], [0.3, 0.3, 0.32]); }
		for (const s of [-0.3, 0.3]) { q = P(1.2, s); const e = P(2.8, s * 0.5); t.tube([q[0], 0.8, q[1]], [e[0], 0.5, e[1]], 0.04, 0.035, woodD, 4); }      // varais
		if (p.load) { q = P(0, 0); for (let k = 0; k < 5; k++) { const c = P(-0.8 + k * 0.4, (k % 2 - 0.5) * 0.5); t.tube([c[0], 0.85, c[1]], [c[0], 1.35, c[1]], 0.18, 0.2, [0.72, 0.62, 0.44], 6); } }
	},
	_wheelbarrow(t, p) {
		const x = p.x, z = p.z, fx = p.fx || 1, fz = p.fz || 0, rx = fz, rz = -fx;
		t.obox(x, z, fx, fz, 0.5, 0.32, 0.35, 0.62, [0.62, 0.66, 0.6], 0.6, 0.4);
		this._wheel(t, x + fx * 0.7, 0.18, z + fz * 0.7, rx, rz, 0.18, 0.08);
		for (const s of [-1, 1]) t.tube([x + rx * s * 0.25, 0.45, z + rz * s * 0.25], [x - fx * 0.95 + rx * s * 0.3, 0.55, z - fz * 0.95 + rz * s * 0.3], 0.02, 0.02, [0.45, 0.32, 0.2], 3);
	},

	// ------------------------------------------------------------------ colheita, lenha, forno, colmeias, curral
	_harvest(t, p, rng) {
		const x = p.x, z = p.z, sack = [[0.78, 0.68, 0.48], [0.72, 0.62, 0.42], [0.82, 0.74, 0.56]];
		for (let k = 0; k < (p.n || 5); k++) {                                        // sacos de estopa amarrados
			const sx = x + (k % 3) * 0.55 - 0.55, sz = z + Math.floor(k / 3) * 0.55, c = sack[k % 3], y0 = k >= 6 ? 0.55 : 0;
			t.tube([sx, y0, sz], [sx, y0 + 0.45, sz], 0.22, 0.25, c, 7);
			t.tube([sx, y0 + 0.45, sz], [sx, y0 + 0.62, sz], 0.25, 0.06, c, 7);
		}
		const V = [[0.86, 0.2, 0.14], [0.95, 0.55, 0.12], [0.3, 0.6, 0.25], [0.95, 0.85, 0.2], [0.5, 0.3, 0.55]];
		for (let k = 0; k < 3; k++) {                                                 // caixotes de verdura e fruta
			const cx = x + 1.5 + (k % 2) * 0.7, cz = z + Math.floor(k / 2) * 0.62, y0 = 0;
			t.solid(cx - 0.3, cz - 0.24, cx + 0.3, cz + 0.24, y0, y0 + 0.32, [0.68, 0.5, 0.3]);
			const c = V[Math.floor(rng() * V.length)];
			for (let j = 0; j < 6; j++) { const ox = ((j % 3) - 1) * 0.17, oz = (Math.floor(j / 3) - 0.5) * 0.2; t.tube([cx + ox, y0 + 0.3, cz + oz], [cx + ox, y0 + 0.4, cz + oz], 0.08, 0.05, c, 5); }
		}
	},
	_firewood(t, p, rng) {
		const x = p.x, z = p.z, fx = p.fx || 1, fz = p.fz || 0, rx = fz, rz = -fx;
		for (let row = 0; row < 4; row++) for (let k = 0; k < 6 - row; k++) {
			const s = (k - (5 - row) / 2) * 0.24, y = 0.12 + row * 0.21, cx = x + rx * s, cz = z + rz * s, c = [0.5 + rng() * 0.12, 0.34 + rng() * 0.08, 0.2];
			t.tube([cx - fx * 0.55, y, cz - fz * 0.55], [cx + fx * 0.55, y, cz + fz * 0.55], 0.11, 0.11, c, 6);
			FavelaDetail.disc(t, [cx + fx * 0.552, y, cz + fz * 0.552], [fx, 0, fz], 0.1, [0.82, 0.68, 0.46], 6);
		}
		t.tube([x + rx * 0.9, 0, z + rz * 0.9], [x + rx * 0.9, 0.95, z + rz * 0.9], 0.05, 0.05, [0.35, 0.24, 0.14], 4);
		t.tube([x - rx * 0.9, 0, z - rz * 0.9], [x - rx * 0.9, 0.95, z - rz * 0.9], 0.05, 0.05, [0.35, 0.24, 0.14], 4);
	},
	_oven(t, p) {
		const x = p.x, z = p.z, fx = p.fx || 0, fz = p.fz || -1, brick = [0.72, 0.36, 0.2], clay = [0.72, 0.5, 0.32];
		t.solid(x - 0.85, z - 0.85, x + 0.85, z + 0.85, 0, 0.75, brick);
		for (let y = 0.15; y < 0.75; y += 0.15) t.solid(x - 0.86, z - 0.86, x + 0.86, z + 0.86, y, y + 0.02, [0.62, 0.55, 0.48]);       // juntas
		t.tube([x, 0.75, z], [x, 1.15, z], 0.78, 0.7, clay, 10);                                                      // cúpula
		t.tube([x, 1.15, z], [x, 1.45, z], 0.7, 0.42, clay, 10);
		t.tube([x, 1.45, z], [x, 1.55, z], 0.42, 0.05, clay, 10);
		t.tube([x - fx * 0.2, 1.4, z - fz * 0.2], [x - fx * 0.2, 1.75, z - fz * 0.2], 0.08, 0.07, [0.6, 0.42, 0.28], 6);      // chaminé
		FavelaDetail.disc(t, [x + fx * 0.7, 1.05, z + fz * 0.7], [fx, 0.25, fz], 0.22, [0.98, 0.45, 0.1], 8);                 // a boca acesa
		FavelaDetail.disc(t, [x + fx * 0.71, 1.05, z + fz * 0.71], [fx, 0.25, fz], 0.12, [1, 0.8, 0.3], 8);
		for (let k = 0; k < 3; k++) t.tube([x + fx * 1.0 - fz * (k - 1) * 0.15, 0.06, z + fz * 1.0 + fx * (k - 1) * 0.15], [x + fx * 1.45 - fz * (k - 1) * 0.18, 0.06, z + fz * 1.45 + fx * (k - 1) * 0.18], 0.06, 0.06, [0.45, 0.3, 0.18], 5);
	},
	_hives(t, p) {
		for (let k = 0; k < (p.n || 3); k++) {
			const x = p.x + k * 0.9, z = p.z, h = 0.5 + (k % 2) * 0.25;
			t.solid(x - 0.06, z - 0.06, x + 0.06, z + 0.06, 0, 0.35, [0.4, 0.3, 0.2]);
			for (let j = 0; j < (k % 2 ? 3 : 2); j++) t.solid(x - 0.3, z - 0.25, x + 0.3, z + 0.25, 0.35 + j * 0.22, 0.55 + j * 0.22, j % 2 ? [0.9, 0.76, 0.42] : [0.86, 0.7, 0.36]);
			t.obox(x, z, 1, 0, 0.36, 0.3, 0.35 + h + 0.05, 0.35 + h + 0.2, [0.72, 0.52, 0.3], 0.3, 0.05);        // tampa em telhadinho
		}
	},
	_shed(t, p) {                                                                       // curral coberto: esteios, telhado de telha e o cocho
		const { x0, z0, x1, z1 } = p, h = p.h || 2.6, wood = [0.42, 0.29, 0.17], roof = [0.66, 0.32, 0.2];
		for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, z0], [(x0 + x1) / 2, z1]]) t.solid(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12, 0, h, wood);
		t.obox((x0 + x1) / 2, (z0 + z1) / 2, 1, 0, (x1 - x0) / 2 + 0.4, (z1 - z0) / 2 + 0.4, h, h + 0.12, roof, (x1 - x0) / 2 + 0.4, (z1 - z0) / 2 + 0.4);
		t.obox((x0 + x1) / 2, (z0 + z1) / 2, 1, 0, (x1 - x0) / 2 + 0.3, (z1 - z0) / 2 + 0.3, h + 0.12, h + 0.55, roof, (x1 - x0) / 2 + 0.3, 0.05);      // cumeeira
		const cz = (z0 + z1) / 2;
		t.solid(x0 + 0.5, cz - 0.3, x1 - 0.5, cz + 0.3, 0, 0.5, [0.36, 0.25, 0.15]);                              // cocho
		t.solid(x0 + 0.6, cz - 0.22, x1 - 0.6, cz + 0.22, 0.46, 0.5, [0.78, 0.68, 0.36]);                         // milho no cocho
	},
};
