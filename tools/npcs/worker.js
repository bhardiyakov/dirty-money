// Worker da ferramenta de NPCs: monta o atlas de UM tipo (em paralelo com os outros) e já devolve os arquivos do formato paginado
// (assets/npcs/<id>.js = manifesto, <id>/p<i>.js = páginas: PNG cinza w × 2h, comprimido pelo CompressionStream) — e o atlas cru
// (as páginas RG, para a folha de revisão). O mesmo que tools/npcs/regen.cjs faz no Node (lá com zlib 9: arquivos um pouco menores).
importScripts('../../src/art/npcgen/NpcGenCore.js', '../../src/art/npcgen/NpcGenChar.js', '../../src/art/npcgen/NpcGenRender.js',
    '../../src/art/npcgen/NpcGenAnims.js', '../../src/art/npcgen/NpcGenTypes.js', '../../src/art/npcgen/NpcGenBuild.js',
    '../../assets/npcs/malha3d.js', '../../src/art/npcgen/NpcGenMesh.js');
const G = {};
NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G);

const deflate = async (raw) => new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

onmessage = async (e) => {
    const { id, keys, k, dirs } = e.data, t0 = performance.now();          // k: resolução (padrão G.OUT_K; alta definição G.HD_K); dirs: 8 = só as pares
    try {
        const spec = G.BY_ID[id], clips = keys || G.TYPES[id].clips;
        const a = G.buildAtlas(spec, clips, { typeId: id, k: k || G.OUT_K, dirs: dirs || 0, onClip: (i, n, key) => postMessage({ id, progress: [i, n, key] }) });
        const t1 = performance.now(), files = [], pages = [];
        for (let i = 0; i < a.pages.length; i++) {
            const P = a.pages[i], png = G.pngFile(P.w, P.h * 2, 0, await deflate(G.pageRows(P.w, P.h, P.data))), file = G.pageFile(id, i);
            files.push({ path: file, text: G.pageJS(id, i, b64(png)) });
            pages.push({ w: P.w, h: P.h, g: P.g, par: P.par, file, bytes: png.length });
        }
        files.unshift({ path: id + '.js', text: G.manifestJS(id, a, spec.label, pages) });
        postMessage({ id, atlas: a, files, ms: performance.now() - t0, msPng: performance.now() - t1 }, G.atlasBuffers(a));
    } catch (err) { postMessage({ id, error: String((err && err.stack) || err) }); }
};
