// Catálogo de veículos (slug -> especificação)
import * as hatches from './veiculos/hatches.js';
import * as antigos from './veiculos/antigos.js';
import * as suvs from './veiculos/suvs.js';
import * as sedans from './veiculos/sedans.js';
import * as esportivos from './veiculos/esportivos.js';
import * as picapes from './veiculos/picapes.js';
import * as vans from './veiculos/vans.js';
import * as policia from './veiculos/policia.js';
import * as taxis from './veiculos/taxis.js';
import * as barcos from './veiculos/barcos.js';

export const SPECS = {};
for (const mod of [hatches, antigos, suvs, sedans, esportivos, picapes, vans, policia, taxis, barcos]) for (const [k, v] of Object.entries(mod)) if (v && typeof v === 'object' && v.slug) SPECS[v.slug] = v;
