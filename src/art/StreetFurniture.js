// ============================================================================
// StreetFurniture — o desenho dos POSTES DE RUA e dos SEMÁFOROS (geometria em MeshBatch, cores por vértice).
//
//   lamp(b, x, z, hx, hz)  poste de iluminação: base de concreto, coluna afinando, braço curvo e luminária ("cabeça de cobra")
//                          com o difusor embaixo. (x, z) = pé, (hx, hz) = centro da luminária (StreetProps; o poste que tomba
//                          também é montado aqui, em coordenadas locais).
//   signal(b, p, gen)      poste de semáforo com BRAÇO PROJETADO sobre a pista: a caixa de 3 lentes pendurada no fim do braço,
//                          virada para quem chega, e as caixinhas de pedestre no poste. Cruzamento de grade: 2 braços (um sobre
//                          cada rua); nó com diagonal: 1 braço sobre a perna dele.
//   heads(p, gen)          onde ficam as lentes (as mesmas contas da geometria): TrafficSignals põe os brilhos ali, e a lente acesa
//                          sobe ou desce na caixa conforme a cor (vermelho em cima, amarelo no meio, verde embaixo).
// ============================================================================

const StreetFurniture = {
	LAMP_Y: 5.62,                                   // altura da luminária (o brilho fica logo abaixo, no difusor)
	POLE: [0.36, 0.38, 0.39], BASE: [0.5, 0.49, 0.46], HOUSING: [0.24, 0.25, 0.27], DIFFUSER: [1.0, 0.96, 0.84],
	SIG_POLE: [0.2, 0.21, 0.23], SIG_BOX: [0.07, 0.075, 0.08], SIG_PLATE: [0.86, 0.72, 0.12],
	LENS_Y: { red: 5.5, yellow: 5.22, green: 4.94 },

	lamp(b, x, z, hx, hz) {
		let ux = hx - x, uz = hz - z; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L;
		const Y = this.LAMP_Y, top = Y + 0.42;
		b.cyl(x, z, 0.2, 0, 0.42, this.BASE, 8);                                                   // base
		b.tube([x, 0.42, z], [x, top, z], 0.1, 0.065, this.POLE, 8);                               // coluna (afina)
		// braço: sobe da coluna e faz a curva até a luminária (5 gomos de uma curva de Bézier)
		const P = (t) => {
			const a = [0, top], c = [0, top + 0.5], e = [L - 0.15, Y + 0.12], s = 1 - t;
			const l = s * s * a[0] + 2 * s * t * c[0] + t * t * e[0], y = s * s * a[1] + 2 * s * t * c[1] + t * t * e[1];
			return [x + ux * l, y, z + uz * l];
		};
		b.tube([x, top - 0.25, z], P(0), 0.065, 0.06, this.POLE, 6);
		for (let k = 0; k < 5; k++) b.tube(P(k / 5), P((k + 1) / 5), 0.058, 0.05, this.POLE, 6);
		// luminária: caixa chanfrada ao longo do braço, mais larga na frente, difusor claro embaixo
		const cx = x + ux * (L + 0.12), cz = z + uz * (L + 0.12);
		b.obox(cx, cz, ux, uz, 0.48, 0.21, Y, Y + 0.16, this.HOUSING, 0.4, 0.15);
		b.obox(cx, cz, ux, uz, 0.36, 0.14, Y - 0.05, Y, this.DIFFUSER, 0.44, 0.19, true);
	},

	// Lentes de um poste de semáforo: [{ key, x, z, fx, fz, y? }] — key 'NS' | 'EW' (grade) | 'V' (nó com diagonal) | 'pNS' | 'pEW' | 'p'
	heads(p, gen) {
		const out = [];
		if (gen) {
			const ix = p.fz, iz = -p.fx, L = this._arm(p.hw || 4);                          // (para dentro da pista: o lado oposto ao da calçada)
			out.push({ key: 'V', x: p.x + ix * L + p.fx * 0.17, z: p.z + iz * L + p.fz * 0.17, fx: p.fx, fz: p.fz, bx: p.x + ix * L, bz: p.z + iz * L, ax: ix, az: iz, L });
			out.push({ key: 'p', x: p.x + p.fz * 0.24, z: p.z - p.fx * 0.24, fx: p.fz, fz: -p.fx });
			return out;
		}
		const Ln = this._arm(p.hwNS || 5), Le = this._arm(p.hwEW || 5);
		// braço sobre a rua N-S (para dentro em x), caixa virada para quem chega pela perna do poste (+sz)
		out.push({ key: 'NS', x: p.x - p.sx * Ln, z: p.z + p.sz * 0.17, fx: 0, fz: p.sz, bx: p.x - p.sx * Ln, bz: p.z, ax: -p.sx, az: 0, L: Ln });
		out.push({ key: 'EW', x: p.x + p.sx * 0.17, z: p.z - p.sz * Le, fx: p.sx, fz: 0, bx: p.x, bz: p.z - p.sz * Le, ax: 0, az: -p.sz, L: Le });
		out.push({ key: 'pNS', x: p.x - p.sx * 0.24, z: p.z, fx: -p.sx, fz: 0 });
		out.push({ key: 'pEW', x: p.x, z: p.z - p.sz * 0.24, fx: 0, fz: -p.sz });
		return out;
	},
	_arm(hw) { return Math.min(hw * 0.55, 3.4) + 0.55; },

	signal(b, p, gen) {
		const H = 6.05;
		b.cyl(p.x, p.z, 0.17, 0, 0.3, this.BASE, 8);
		b.tube([p.x, 0.3, p.z], [p.x, H + 0.1, p.z], 0.1, 0.08, this.SIG_POLE, 8);
		for (const h of this.heads(p, gen)) {
			if (h.key[0] === 'p') {                                                                    // pedestre: caixinha no poste
				const fx = h.fx || 0.0001, y = h.key === 'pEW' ? 2.25 : 2.5;      // (as duas da grade em alturas diferentes: não se encostam)
				b.obox(h.x, h.z, fx, h.fz, 0.1, 0.13, y - 0.22, y + 0.2, this.SIG_BOX);
				continue;
			}
			// braço (com a escora em diagonal) e a caixa de 3 lentes pendurada no fim dele, com a placa de contraste atrás
			b.tube([p.x, H, p.z], [h.bx + h.ax * 0.1, H, h.bz + h.az * 0.1], 0.085, 0.06, this.SIG_POLE, 6);
			b.tube([p.x, H - 0.85, p.z], [p.x + h.ax * h.L * 0.45, H - 0.02, p.z + h.az * h.L * 0.45], 0.035, 0.035, this.SIG_POLE, 5);
			b.tube([h.bx, H, h.bz], [h.bx, 5.78, h.bz], 0.03, 0.03, this.SIG_POLE, 5);
			b.obox(h.bx - h.fx * 0.02, h.bz - h.fz * 0.02, h.fx || 0.0001, h.fz, 0.03, 0.27, 4.72, 5.74, this.SIG_PLATE);
			b.obox(h.bx + h.fx * 0.06, h.bz + h.fz * 0.06, h.fx || 0.0001, h.fz, 0.11, 0.18, 4.78, 5.68, this.SIG_BOX);
		}
	},
};
