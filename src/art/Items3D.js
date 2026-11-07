// ============================================================================
// Items3D — os ITENS NO CHÃO em 3D (eram ícones em pixel art deitados: Pickups/ItemSprites): armas (pistola, revólver, SMG, fuzil,
// AK-47, escopeta, faca, taco), munição, dinheiro (maço, saco, maleta, moedas), joias, celulares, galão, mochila, módulo de hackeio,
// chave, kit médico, água, comida, loot box e colete. Montados de caixas, cilindros e esferas com cor por vértice; um modelo por tipo,
// e cada item no mapa é uma INSTÂNCIA dele (girando e flutuando, como no GTA). Um pouco maiores que o real (legíveis de longe).
//   Items3D.instance(scene, tipo)  → InstancedMesh (o Pickups posiciona, gira e descarta)
// ============================================================================

const Items3D = {
	_src: {},
	_mat: null,

	instance(scene, type) {
		const src = this._src[type] || (this._src[type] = this._build(scene, type));
		const m = src.createInstance('item3d_' + type);
		m.isPickable = false;
		return m;
	},

	_material(scene) {
		if (this._mat) return this._mat;
		const m = new BABYLON.StandardMaterial('items3d', scene);
		m.specularColor = new BABYLON.Color3(0.35, 0.35, 0.35);
		m.specularPower = 32;
		return (this._mat = m);
	},

	// peças: [forma, posição, tamanho, cor, giro (rad em x, y, z)?]
	_build(scene, type) {
		const parts = this.SHAPES(type), meshes = [];
		for (const [kind, pos, size, col, rot] of parts) {
			let m;
			if (kind === 'box') m = BABYLON.MeshBuilder.CreateBox('i', { width: size[0], height: size[1], depth: size[2] }, scene);
			else if (kind === 'cyl') m = BABYLON.MeshBuilder.CreateCylinder('i', { height: size[1], diameterTop: size[2] != null ? size[2] : size[0], diameterBottom: size[0], tessellation: 12 }, scene);
			else if (kind === 'sph') m = BABYLON.MeshBuilder.CreateSphere('i', { diameterX: size[0], diameterY: size[1], diameterZ: size[2], segments: 8 }, scene);
			else if (kind === 'tor') m = BABYLON.MeshBuilder.CreateTorus('i', { diameter: size[0], thickness: size[1], tessellation: 16 }, scene);
			else if (kind === 'oct') m = BABYLON.MeshBuilder.CreatePolyhedron('i', { type: 1, sizeX: size[0], sizeY: size[1], sizeZ: size[2] }, scene);
			m.position.set(pos[0], pos[1], pos[2]);
			if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
			const n = m.getTotalVertices(), c = new Float32Array(n * 4);
			for (let i = 0; i < n; i++) { c[i * 4] = col[0]; c[i * 4 + 1] = col[1]; c[i * 4 + 2] = col[2]; c[i * 4 + 3] = 1; }
			m.setVerticesData(BABYLON.VertexBuffer.ColorKind, c);
			meshes.push(m);
		}
		const out = BABYLON.Mesh.MergeMeshes(meshes, true, true);
		out.name = 'item3d_src_' + type;
		out.material = this._material(scene);
		out.useVertexColors = true;
		out.isPickable = false;
		out.setEnabled(false);
		return out;
	},

	// Os modelos (deitados de lado, como largados no chão; o Pickups gira em y). Medidas em m.
	SHAPES(type) {
		const DK = [0.12, 0.12, 0.13], MT = [0.3, 0.31, 0.33], WD = [0.45, 0.28, 0.14], GR = [0.2, 0.55, 0.25], GOLD = [0.95, 0.75, 0.2], SIL = [0.75, 0.76, 0.78], RED = [0.85, 0.12, 0.12], WH = [0.94, 0.94, 0.92];
		const pistol = (sil, rev) => [['box', [0, 0.06, 0], [0.32, 0.07, 0.05], DK], ['box', [-0.1, -0.03, 0], [0.07, 0.15, 0.045], WD, [0, 0, -0.25]], ['box', [0.02, -0.02, 0], [0.06, 0.035, 0.02], DK],
			...(sil ? [['cyl', [0.26, 0.065, 0], [0.04, 0.2], DK, [0, 0, Math.PI / 2]]] : []), ...(rev ? [['cyl', [0.0, 0.05, 0], [0.08, 0.07], MT, [Math.PI / 2, 0, 0]]] : [])];
		const longGun = (L, stock, mag, curved) => [['box', [0, 0.05, 0], [L * 0.45, 0.08, 0.06], DK], ['cyl', [L * 0.36, 0.06, 0], [0.025, L * 0.45], MT, [0, 0, Math.PI / 2]], ['box', [-L * 0.38, 0.03, 0], [L * 0.3, 0.09, 0.05], stock],
			['box', [-L * 0.06, -0.04, 0], [0.05, 0.12, 0.045], stock, [0, 0, -0.3]], ...(mag ? [['box', [L * 0.06, -0.06, 0], [0.06, 0.16, 0.04], DK, [0, 0, curved ? 0.35 : 0.08]]] : [])];
		switch (type) {
			case 'pistol': return pistol(false, false);
			case 'pistol_sil': return pistol(true, false);
			case 'revolver': return pistol(false, true);
			case 'smg': return longGun(0.55, DK, true, false);
			case 'rifle': return longGun(1.0, DK, true, false);
			case 'ak47': return longGun(1.0, WD, true, true);
			case 'shotgun': return [...longGun(1.05, WD, false, false), ['box', [0.18, 0.0, 0], [0.22, 0.05, 0.06], WD]];
			case 'knife': return [['box', [0.1, 0, 0], [0.24, 0.012, 0.05], SIL], ['box', [-0.09, 0, 0], [0.13, 0.03, 0.04], DK]];
			case 'bat': return [['cyl', [0, 0, 0], [0.09, 0.85, 0.035], [0.72, 0.55, 0.32], [0, 0, Math.PI / 2]]];
			case 'ammo_pistol': case 'ammo_rifle': case 'ammo_smg': case 'ammo_shotgun':
				return [['box', [0, 0.06, 0], [0.24, 0.12, 0.16], [0.3, 0.36, 0.22]], ['box', [0, 0.06, 0.081], [0.14, 0.05, 0.002], [0.9, 0.8, 0.2]],
					...[-0.06, 0, 0.06].map((x) => ['cyl', [x, 0.15, 0], [0.025, 0.07], GOLD])];
			case 'cash': case 'cash_small': return [['box', [0, 0.04, 0], [0.26, 0.08, 0.13], [0.42, 0.66, 0.4]], ['box', [0, 0.04, 0], [0.05, 0.085, 0.135], [0.95, 0.9, 0.75]], ['box', [0.05, 0.1, 0.02], [0.26, 0.04, 0.13], [0.45, 0.7, 0.43], [0, 0.3, 0]]];
			case 'cash_bag': return [['sph', [0, 0.2, 0], [0.42, 0.42, 0.38], [0.78, 0.68, 0.48]], ['cyl', [0, 0.43, 0], [0.12, 0.08, 0.05], [0.7, 0.6, 0.4]], ['box', [0, 0.24, 0.19], [0.12, 0.12, 0.01], [0.2, 0.5, 0.25]]];
			case 'cash_case': return [['box', [0, 0.16, 0], [0.5, 0.34, 0.12], [0.12, 0.12, 0.14]], ['box', [0, 0.16, 0], [0.51, 0.04, 0.125], SIL], ['tor', [0, 0.36, 0], [0.14, 0.025], SIL, [Math.PI / 2, 0, 0]]];
			case 'coins': return [0, 1, 2, 3, 4].map((k) => ['cyl', [(k % 2) * 0.03, 0.015 + k * 0.03, 0], [0.12, 0.028], GOLD]).concat([['cyl', [0.12, 0.015, 0.05], [0.12, 0.028], GOLD]]);
			case 'jewels': return [['oct', [0, 0.12, 0], [0.12, 0.16, 0.12], [0.55, 0.85, 1.0]], ['oct', [0.12, 0.07, 0.05], [0.07, 0.09, 0.07], [0.9, 0.3, 0.5]], ['tor', [-0.1, 0.03, 0], [0.18, 0.03], GOLD, [Math.PI / 2, 0, 0]]];
			case 'necklace': return [['tor', [0, 0.02, 0], [0.32, 0.03], GOLD, [Math.PI / 2, 0, 0]], ['oct', [0, 0.04, 0.17], [0.07, 0.09, 0.07], [0.6, 0.9, 1.0]]];
			case 'rings': return [['tor', [0, 0.06, 0], [0.12, 0.03], GOLD], ['oct', [0, 0.13, 0], [0.05, 0.06, 0.05], [0.7, 0.95, 1.0]], ['tor', [0.12, 0.02, 0.04], [0.11, 0.025], SIL, [Math.PI / 2, 0, 0]]];
			case 'watch': return [['cyl', [0, 0.03, 0], [0.12, 0.04], GOLD], ['cyl', [0, 0.052, 0], [0.1, 0.005], [0.1, 0.12, 0.2]], ['box', [0, 0.015, 0.12], [0.06, 0.02, 0.14], [0.2, 0.14, 0.1]], ['box', [0, 0.015, -0.12], [0.06, 0.02, 0.14], [0.2, 0.14, 0.1]]];
			case 'phone_old': return [['box', [0, 0.02, 0], [0.09, 0.03, 0.17], [0.25, 0.27, 0.3]], ['box', [0, 0.037, 0.03], [0.07, 0.003, 0.06], [0.45, 0.6, 0.45]]];
			case 'phone_new': return [['box', [0, 0.015, 0], [0.1, 0.02, 0.2], DK], ['box', [0, 0.026, 0], [0.09, 0.003, 0.18], [0.15, 0.35, 0.75]]];
			case 'jerry': return [['box', [0, 0.22, 0], [0.32, 0.44, 0.16], [0.82, 0.16, 0.12]], ['box', [-0.03, 0.47, 0], [0.18, 0.05, 0.05], [0.7, 0.12, 0.1]], ['cyl', [0.12, 0.47, 0], [0.05, 0.06], [0.2, 0.2, 0.2]]];
			case 'backpack': return [['box', [0, 0.22, 0], [0.34, 0.44, 0.18], [0.15, 0.3, 0.55]], ['box', [0, 0.14, 0.1], [0.26, 0.18, 0.06], [0.12, 0.24, 0.45]], ['tor', [0, 0.46, 0], [0.12, 0.03], DK]];
			case 'hack': return [['box', [0, 0.04, 0], [0.22, 0.06, 0.14], [0.08, 0.3, 0.15]], ['box', [0, 0.075, 0], [0.12, 0.01, 0.08], DK], ['box', [0.07, 0.075, 0.03], [0.03, 0.012, 0.03], [0.3, 1.0, 0.5]]];
			case 'carkey': return [['box', [-0.06, 0.02, 0], [0.08, 0.03, 0.06], DK], ['box', [0.06, 0.02, 0], [0.13, 0.012, 0.025], SIL], ['tor', [-0.13, 0.02, 0], [0.06, 0.012], SIL, [0, 0, Math.PI / 2]]];
			case 'medkit': return [['box', [0, 0.11, 0], [0.36, 0.22, 0.22], WH], ['box', [0, 0.11, 0.112], [0.16, 0.05, 0.004], RED], ['box', [0, 0.11, 0.112], [0.05, 0.16, 0.004], RED], ['box', [0, 0.235, 0], [0.12, 0.03, 0.05], [0.6, 0.6, 0.6]]];
			case 'water': return [['cyl', [0, 0.16, 0], [0.09, 0.3], [0.45, 0.7, 0.95]], ['cyl', [0, 0.34, 0], [0.04, 0.05], [0.15, 0.35, 0.85]], ['cyl', [0, 0.14, 0], [0.095, 0.1], [0.9, 0.95, 1.0]]];
			case 'food': return [['cyl', [0, 0.04, 0], [0.22, 0.05], [0.85, 0.62, 0.3]], ['cyl', [0, 0.085, 0], [0.23, 0.04], [0.45, 0.25, 0.12]], ['cyl', [0, 0.115, 0], [0.24, 0.02], [0.3, 0.75, 0.2]], ['sph', [0, 0.15, 0], [0.22, 0.09, 0.22], [0.9, 0.68, 0.32]]];
			case 'lootbox': return [['box', [0, 0.14, 0], [0.4, 0.28, 0.28], [0.45, 0.22, 0.65]], ['box', [0, 0.3, 0], [0.42, 0.06, 0.3], [0.55, 0.3, 0.75]], ['box', [0, 0.14, 0], [0.06, 0.29, 0.29], GOLD], ['box', [0, 0.2, 0.145], [0.08, 0.08, 0.02], GOLD]];
			case 'vest': case 'vest2': {
				const c = type === 'vest2' ? [0.18, 0.22, 0.32] : [0.22, 0.32, 0.5];
				return [['box', [0, 0.05, 0], [0.5, 0.08, 0.58], c], ['box', [0, 0.1, -0.2], [0.32, 0.04, 0.14], c.map((v) => v * 0.8)], ['box', [-0.16, 0.1, 0.2], [0.1, 0.04, 0.18], c.map((v) => v * 0.8)], ['box', [0.16, 0.1, 0.2], [0.1, 0.04, 0.18], c.map((v) => v * 0.8)],
					['box', [0, 0.1, 0.0], [0.42, 0.02, 0.06], [0.85, 0.85, 0.82]]];
			}
			default: return [['box', [0, 0.12, 0], [0.3, 0.24, 0.3], [0.6, 0.5, 0.35]], ['box', [0, 0.12, 0], [0.31, 0.04, 0.31], [0.4, 0.32, 0.2]]];
		}
	},
};
