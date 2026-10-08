// Folhas de comparação (geométrico × malha 3D) gravadas em assets/_shots/<nome>.png pelo servidor de desenvolvimento — conferência
// visual do encaixe. No console da ferramenta:  await vista('a', [[G0, ficha], [G1, ficha]], { elev: 56, dirs: [4, 2], k: 1 })
window.vista = async function (name, specs, { k = 1, zoom = 4, elev = 56, dirs = [4, 2], key = 'idle:none', frame = 0, crop = 0.75 } = {}) {
    const tiles = [];
    for (const [G, spec] of specs) {
        const R0 = G.rendererFor(spec, { k });
        const R = elev === 56 ? R0 : new G.Renderer(R0.baked, new G.Camera(elev), { W: R0.W, H: R0.H, pivot: [R0.px, R0.py], ss: R0.ss, charScale: (G.fullSpec(spec).scale * k) / 1.04 });
        G.setRig(G.rigFor(G.fullSpec(spec)));
        const ramps = G.rampsFor(spec), [cn, w0] = key.split(':'), poses = G.CLIPS[cn].fn(w0 || 'none', { hand: 'briefcase' });
        const fr0 = Array.isArray(frame) ? frame : [frame];
        for (const f of fr0) for (const d of dirs) { const fr = R.render(poses[Math.min(f, poses.length - 1)], -45 * d); tiles.push({ W: fr.W, H: fr.H, px: G.colorize(fr, ramps) }); }
    }
    const W = tiles[0].W, H = tiles[0].H, c = document.createElement('canvas');
    c.width = W * tiles.length * zoom; c.height = Math.round(H * zoom * crop);
    const x = c.getContext('2d'); x.fillStyle = '#6b7280'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingEnabled = false;
    tiles.forEach((f, i) => { const t = document.createElement('canvas'); t.width = f.W; t.height = f.H; t.getContext('2d').putImageData(new ImageData(f.px, f.W, f.H), 0, 0); x.drawImage(t, i * W * zoom, -H * zoom * (1 - crop) * 0.4, W * zoom, H * zoom); });
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await fetch('/__save/assets/_shots/' + name + '.png', { method: 'PUT', body: blob });
    return c.width + 'x' + c.height;
};
