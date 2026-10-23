#!/usr/bin/env node
// ============================================================================
// tools/asset_baker/vehocc.cjs — grava generator/veiculos_occ.js (NPC_VEH_OCC): as carrocerias das motos e da bicicleta 3D
// (assets/cars/veiculos3d.js, VEH3D) que o gerador dos personagens usa para RECORTAR o piloto (NpcGenRender: pose.occ). No jogo o
// piloto 2,5D é desenhado POR CIMA do veículo 3D (RiderActor); com o recorte assado, o que a moto esconde daquele ângulo (a perna do
// outro lado atrás do tanque e do motor, as coxas por dentro do tanque) não é desenhado e a moto aparece ali.
//
//   node tools/asset_baker/vehocc.cjs          (rode de novo quando mudar o veículo 3D; depois, o bake dos tipos com clipes ride_*)
//
// Formato (por modelo): q (m por unidade), seat ([frente, altura] do banco, m do modelo), P (Int16 × 3 por vértice, eixos do JOGO:
// +X direita, +Y cima, +Z frente — base64) e I (Uint16, 3 por triângulo — base64). Só a carroceria: as rodas não passam na frente do piloto.
// ============================================================================
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'assets', 'cars', 'veiculos3d.js');
const OUT = path.join(__dirname, 'generator', 'veiculos_occ.js');
// moto de rua (CG) e as que pilotam como ela (tanque entre os joelhos), a scooter (pés no assoalho) e a bicicleta
const MODELS = ['moto', 'moto_trilha', 'moto_esportiva', 'moto_custom', 'moto_scooter', 'bicicleta'];

const src = fs.readFileSync(SRC, 'utf8');
const VEH3D = JSON.parse(src.match(/var VEH3D = (\{[\s\S]*?\});\s*\n/)[1]);
const bin = zlib.inflateSync(Buffer.from(VEH3D.z, 'base64'));
const al = (n) => (n + 3) & ~3;
const out = {};
for (const id of MODELS) {
	const D = VEH3D.models[id], sec = D.body, nv = sec.nv;
	if (sec.i32) throw new Error(id + ': índices de 32 bits');
	const P = Buffer.from(bin.subarray(sec.at, sec.at + nv * 6));
	const at = sec.at + al(nv * 6) + al(nv * 3) + al(nv);
	const I = Buffer.from(bin.subarray(at, at + sec.ni * 2));
	out[id] = { q: D.q, seat: [D.seat[0], D.seat[1]], P: P.toString('base64'), I: I.toString('base64') };
}
const body = Object.entries(out).map(([id, m]) => `    ${id}: { q: ${m.q}, seat: [${m.seat}], P: '${m.P}', I: '${m.I}' },`).join('\n');
fs.writeFileSync(OUT, `// ============================================================================
// GERADO por tools/asset_baker/vehocc.cjs a partir de assets/cars/veiculos3d.js — não edite à mão: rode o script de novo.
// Carrocerias 3D das motos e da bicicleta para recortar o piloto (NpcGenRender: pose.occ, G.vehOcc; NpcGenAnims: RIDE, rideOcc).
// ============================================================================
var NPC_VEH_OCC = {
${body}
};
`);
console.log(`${path.relative(ROOT, OUT)}: ${MODELS.length} modelos, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
