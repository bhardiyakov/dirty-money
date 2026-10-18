// Gera os arquivos 3D que o jogo lê, sem o navegador: node tools/carros3d/gerar.mjs [carros] [veiculos]
//   carros   → assets/cars/carros3d.js (CAR3D)
//   veiculos → assets/cars/veiculos3d.js (VEH3D: motos, helicópteros e barcos)
// Sem argumentos: os dois. Mesmas opções da página (tools/carros3d/index.html): detalhe 0,3, simplificação de 4 mm, só o que se vê de cima.
import { buildAll, buildVehicles, toScript } from './build.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const opts = { detail: 0.3, maxErr: 0.004, topOnly: true };
const want = process.argv.slice(2);
const jobs = [['carros', 'assets/cars/carros3d.js', buildAll, false], ['veiculos', 'assets/cars/veiculos3d.js', buildVehicles, true]];
for (const [name, file, build, vehicles] of jobs) {
  if (want.length && !want.includes(name)) continue;
  const t0 = Date.now(), r = build(opts), out = await toScript(r, opts, vehicles);
  writeFileSync(path.join(ROOT, file), out.text);
  const tris = r.stats.reduce((a, b) => a + b.tris, 0);
  console.log(`${file}: ${r.stats.length} modelos, ${tris} triângulos, ${(r.bytes.length / 1048576).toFixed(2)} MB (${(out.zBytes / 1048576).toFixed(2)} MB comprimido) em ${Date.now() - t0} ms`);
  for (const s of r.stats) if (vehicles) console.log(`  ${s.slug.padEnd(16)} ${String(s.tris).padStart(6)} tri`);
}
