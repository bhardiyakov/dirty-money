// Câmera em PERSPECTIVA (etapa 1 do upgrade visual, `?cam=persp`; CompassCamera): a mesma câmera 2,5D — ângulo, giro, adianto, zoom —
// com projeção em perspectiva. No centro da tela ela enquadra o mesmo `view` da ortográfica (o jogador não muda de tamanho), nunca
// chega mais perto que perspMinDist, o chão visto (groundHalf) cobre a tela, a mira acha o chão sob o mouse, os interiores continuam
// com a câmera de cima e a volta é de novo em perspectiva.
const { boot, gameWait, leave } = require('./lib.cjs');

module.exports = {
    name: 'perspectiva',
    async run(ctx, c) {
        const { page, errors, close } = await boot(ctx, { query: 'cam=persp&fov=20', outside: false });
        const inside = await page.evaluate(() => ({ flat: game.camera.flat, mode: game.camera.camera.mode, persp: game.camera.persp }));
        c.ok(inside.flat && !inside.persp, 'nos interiores, a câmera de cima de sempre');
        await leave(page);
        await gameWait(page, 1);
        const r = await page.evaluate(() => {
            const C = game.camera, cam = C.camera, eng = game.gameEngine.engine, asp = eng.getAspectRatio(cam), W = eng.getRenderWidth(), H = eng.getRenderHeight();
            const proj = (x, y, z) => BABYLON.Vector3.Project(new BABYLON.Vector3(x, y, z), BABYLON.Matrix.IdentityReadOnly, cam.getTransformationMatrix(), new BABYLON.Viewport(0, 0, W, H));
            // 1 m na tela no foco, na direção que a câmera vê como "cima" (giro yaw): metade da altura da tela = view
            const f = C.focus, s = Math.sin(C.yaw), k = Math.cos(C.yaw);
            const a = proj(f.x, 0, f.z), b = proj(f.x + k, 0, f.z - s);
            const pxPerM = Math.hypot(b.x - a.x, b.y - a.y);
            // os 4 cantos da tela no chão: dentro do retângulo de groundHalf em volta do foco
            const g = C.groundHalf(), out = [];
            const cv = eng.getRenderingCanvas(), cw = cv.clientWidth, ch = cv.clientHeight;       // (o raio do Babylon recebe px da página)
            for (const [u, v] of [[0, 0], [cw, 0], [0, ch], [cw, ch]]) {
                const ray = game.scene.createPickingRay(u, v, BABYLON.Matrix.Identity(), cam), t = -ray.origin.y / ray.direction.y;
                const x = ray.origin.x + ray.direction.x * t - f.x, z = ray.origin.z + ray.direction.z * t - f.z;
                const lx = x * k - z * s, lz = x * s + z * k;          // (no referencial da câmera girada)
                out.push(Math.abs(lx) <= g.x + 0.5 && Math.abs(lz) <= g.z + 0.5);
            }
            // zoom bem perto: a câmera não desce abaixo de perspMinDist (o campo de visão fecha)
            const v0 = C.viewHalf; C.viewHalf = Config.camera.minView; C._applyFov(); const dNear = C.dist, fovNear = cam.fov; C.viewHalf = v0; C._applyFov();
            const hCam = cam.position.y;
            return { mode: cam.mode, persp: C.persp, center: [a.x / W, a.y / H], pxPerM, want: H / (2 * C.view), corners: out, dNear, min: Config.camera.perspMinDist, fovNear: fovNear * 57.3, fov: cam.fov * 57.3, hCam, tallest: Config.camera.tallest, fogD: game.scene.fogDensity, asp, stand: NpcArt._stand.y };
        });
        c.ok(r.persp && r.mode === 0, 'lá fora, a câmera 2,5D em perspectiva');
        c.ok(Math.abs(r.center[0] - 0.5) < 0.01 && Math.abs(r.center[1] - 0.5) < 0.01, `o foco no centro da tela (${r.center.map((v) => v.toFixed(3))})`);
        c.ok(Math.abs(r.pxPerM / r.want - 1) < 0.02, `no foco, o mesmo tamanho da ortográfica: ${r.pxPerM.toFixed(1)} px por metro (esperado ${r.want.toFixed(1)})`);
        c.ok(r.corners.every(Boolean), `os 4 cantos da tela caem dentro do chão visto (groundHalf): ${r.corners}`);
        c.ok(r.dNear >= r.min - 1e-6 && r.fovNear < r.fov, `zoom perto: a câmera fica a ${r.dNear.toFixed(0)} m (mínimo ${r.min}) e o campo de visão fecha (${r.fovNear.toFixed(1)}° < ${r.fov.toFixed(1)}°)`);
        c.ok(r.hCam > r.tallest, `a câmera fica acima do prédio mais alto (${r.hCam.toFixed(0)} m)`);
        c.ok(r.fogD < 0 && Math.abs(-r.fogD - r.asp) < 1e-3, 'corte das bordas no modo perspectiva (densidade = −aspecto)');
        c.ok(r.stand > 0, 'personagens de pé com o desvio de profundidade da perspectiva');
        // a mira acha o ponto do chão sob o mouse (o raio da perspectiva sai da câmera, não paralelo)
        const aim = await page.evaluate(() => {
            const C = game.camera, cam = C.camera, eng = game.gameEngine.engine, W = eng.getRenderWidth(), H = eng.getRenderHeight();
            const cv = eng.getRenderingCanvas(), cw = cv.clientWidth, ch = cv.clientHeight;
            const ray = game.scene.createPickingRay(cw * 0.8, ch * 0.25, BABYLON.Matrix.Identity(), cam), t = -ray.origin.y / ray.direction.y;
            const x = ray.origin.x + ray.direction.x * t, z = ray.origin.z + ray.direction.z * t;
            const p = BABYLON.Vector3.Project(new BABYLON.Vector3(x, 0, z), BABYLON.Matrix.IdentityReadOnly, cam.getTransformationMatrix(), new BABYLON.Viewport(0, 0, W, H));
            return { dx: p.x - W * 0.8, dy: p.y - H * 0.25 };
        });
        c.ok(Math.hypot(aim.dx, aim.dy) < 1.5, `o chão sob o mouse volta ao mesmo pixel (${aim.dx.toFixed(2)}, ${aim.dy.toFixed(2)})`);
        c.noErrors(errors, 'perspectiva');
        await close();
    },
};
