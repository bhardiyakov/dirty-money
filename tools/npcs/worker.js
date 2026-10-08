// Worker da ferramenta de NPCs: monta o atlas de UM tipo (em paralelo com os outros).
importScripts('../../src/art/npcgen/NpcGenCore.js', '../../src/art/npcgen/NpcGenChar.js', '../../src/art/npcgen/NpcGenRender.js',
    '../../src/art/npcgen/NpcGenAnims.js', '../../src/art/npcgen/NpcGenTypes.js', '../../src/art/npcgen/NpcGenBuild.js',
    '../../assets/npcs/malha3d.js', '../../src/art/npcgen/NpcGenMesh.js');
const G = {};
NpcGenCore(G); NpcGenChar(G); NpcGenRender(G); NpcGenAnims(G); NpcGenTypes(G); NpcGenBuild(G); NpcGenMesh(G);

onmessage = (e) => {
    const { id, keys, k } = e.data, t0 = performance.now();          // k: resolução (padrão G.OUT_K; alta definição G.HD_K)
    try {
        const spec = G.BY_ID[id], clips = keys || G.TYPES[id].clips;
        const a = G.buildAtlas(spec, clips, { typeId: id, k: k || G.OUT_K, onClip: (i, n, key) => postMessage({ id, progress: [i, n, key] }) });
        postMessage({ id, atlas: { w: a.w, h: a.h, data: a.data, clips: a.clips, pieces: a.pieces, k: a.k, v: a.v, frame: a.frame }, ms: performance.now() - t0 }, [a.data.buffer]);
    } catch (err) { postMessage({ id, error: String(err && err.stack || err) }); }
};
