// Gera os arquivos 3D que o jogo lê, sem o navegador: node tools/carros3d/gerar.mjs [carros] [veiculos] [hd]
//   carros   → assets/cars/carros3d.js (CAR3D)
//   veiculos → assets/cars/veiculos3d.js (VEH3D: motos, helicópteros e barcos)
//   hd       → assets/cars/hd/<modelo>.js (CAR3D_HD): cada carro em ALTA definição (detalhe 2, sem simplificar, todos os lados), um
//              arquivo por modelo — só a garagem da tunagem carrega, e só o do carro que entrou (CarArt3D.loadHD)
// Sem argumentos: carros e veiculos. Mesmas opções da página (tools/carros3d/index.html): detalhe 0,3, simplificação de 4 mm, só o que se vê de cima.
import { buildAll, buildVehicles, toScript, WHEELED } from './build.js';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const opts = { detail: 0.3, maxErr: 0.004, topOnly: true };
const want = process.argv.slice(2);
if (want.includes('hd')) {
  const hd = { detail: 2, maxErr: 0, topOnly: false }, dir = path.join(ROOT, 'assets/cars/hd');
  mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const slug of WHEELED) {
    const r = buildAll(hd, null, [slug]), out = await toScript(r, hd);
    const one = JSON.parse(out.text.slice(out.text.indexOf('var CAR3D = ') + 12, -2));
    const text = `// GERADO por tools/carros3d (node tools/carros3d/gerar.mjs hd) — ${slug} em alta definição: ${r.stats[0].tris} triângulos. Lido por CarArt3D.loadHD.\n`
      + `(window.CAR3D_HD = window.CAR3D_HD || {})[${JSON.stringify(slug)}] = ${JSON.stringify({ raw: one.raw, model: one.models[slug], z: one.z })};\n`;
    writeFileSync(path.join(dir, slug + '.js'), text);
    total += text.length;
  }
  console.log(`assets/cars/hd: ${WHEELED.length} modelos, ${(total / 1048576).toFixed(2)} MB`);
}
const jobs = [['carros', 'assets/cars/carros3d.js', buildAll, false], ['veiculos', 'assets/cars/veiculos3d.js', buildVehicles, true]];
for (const [name, file, build, vehicles] of jobs) {
  if (want.length ? !want.includes(name) : false) continue;
  const t0 = Date.now(), r = build(opts), out = await toScript(r, opts, vehicles);
  writeFileSync(path.join(ROOT, file), out.text);
  const tris = r.stats.reduce((a, b) => a + b.tris, 0);
  console.log(`${file}: ${r.stats.length} modelos, ${tris} triângulos, ${(r.bytes.length / 1048576).toFixed(2)} MB (${(out.zBytes / 1048576).toFixed(2)} MB comprimido) em ${Date.now() - t0} ms`);
  for (const s of r.stats) if (vehicles) console.log(`  ${s.slug.padEnd(16)} ${String(s.tris).padStart(6)} tri`);
}
