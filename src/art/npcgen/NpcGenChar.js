// ============================================================================
// NpcGenChar — o modelo do personagem a partir de uma FICHA (porte de character.py + npcs.py do gerador original): pele, cabelo,
// roupa, chapéu, colete, tipo de corpo e acessórios. Todos usam o mesmo esqueleto, então toda animação serve para toda ficha.
// As partes do corpo são primitivas SDF no espaço do osso; os materiais indexam rampas de 5 tons por personagem (escuro → claro).
//
// Fichas novas além das do pacote original: soldado do exército, banhista, corredora, executivo e os elementos que o jogador veste
// (chapéu de pescador, bolsa transversal, mochila tática, viseira).
// ============================================================================

function NpcGenChar(G) {
    'use strict';
    const { Sphere, Ellipsoid, RoundCone, RoundBox, CapCone, Part, bake, Rx, Ry, Rz, deg, nrm, V, mm3, fromCols } = G;
    const sqrt = Math.sqrt, abs = Math.abs, floor = Math.floor, sin = Math.sin;
    const pmod = (a, b) => ((a % b) + b) % b;          // % do Python (sinal do divisor)

    // ------------------------------------------------------------------ materiais (slots da paleta: 0 = cores fixas, 1..31)
    const M = { skin: 1, hair: 2, shirt: 3, jeans: 4, shoe: 5, sole: 6, lace: 7, bag: 8, strap: 9, metal: 10, wood: 11, eye: 12, eyew: 13,
        mouth: 14, green: 15, batwood: 16, chrome: 17, brow: 18, tape: 19, vest: 20, hat: 21, accent: 22, beard: 23, gold: 24, lens: 25,
        glove: 26, sock: 27, visor: 28, accent2: 29, cargo: 30, flesh: 31 };

    // ------------------------------------------------------------------ cores (5 tons cada, escuro → claro)
    const PAL = {
        // pele
        pele_clara: ['#7d4a3e', '#b8786a', '#daa08a', '#f0c3aa', '#fbdfcb'],
        pele_pessego: ['#7a3836', '#b25a4c', '#d87b62', '#eea07b', '#fcc497'],
        pele_morena: ['#5a2f24', '#8a4b34', '#b06a48', '#cc8a60', '#e2aa7e'],
        pele_parda: ['#43221a', '#6b3a27', '#8d5435', '#ab6e46', '#c58a5d'],
        pele_negra: ['#22120e', '#3b2118', '#573224', '#734531', '#905c43'],
        // cabelo
        castanho: ['#381c16', '#572f22', '#74432e', '#925a3a', '#b07444'],
        preto: ['#0d0a0c', '#1a1417', '#292024', '#3a2e31', '#4f4143'],
        loiro: ['#5c4120', '#8d6831', '#b78d44', '#d6b05d', '#eed083'],
        grisalho: ['#3c3b40', '#5e5d64', '#84838a', '#acabb1', '#d2d1d6'],
        ruivo: ['#481e12', '#78331b', '#a34a25', '#c76533', '#e2864a'],
        // tecido
        roupa_preta: ['#141219', '#201e28', '#2b2934', '#383642', '#4a4855'],
        branco: ['#7c808a', '#a6aab3', '#c8cbd2', '#e1e3e8', '#f5f6f8'],
        vermelho: ['#3d0f14', '#6a1a20', '#96262b', '#bc3a36', '#da5a47'],
        azul: ['#101c3d', '#1c2f63', '#2a4689', '#3c62ac', '#5a82c8'],
        azul_claro: ['#3c536e', '#597794', '#7b9bb8', '#9fbed5', '#c3dbeb'],
        verde: ['#0f2a1a', '#1a4429', '#27613a', '#367f4b', '#4d9c5f'],
        amarelo: ['#5a4110', '#8b6917', '#ba931f', '#dcb42e', '#f2d355'],
        laranja: ['#592410', '#8d3a16', '#bf561e', '#df762c', '#f29a48'],
        cinza: ['#2b2d33', '#43464e', '#5e626b', '#7c8089', '#9da1a9'],
        bege: ['#493e2b', '#6e5f42', '#94815f', '#b4a07b', '#d1be99'],
        rosa: ['#591f35', '#893152', '#b34a6f', '#d36a8c', '#eb90aa'],
        roxo: ['#23123a', '#391f5b', '#52307e', '#6b459f', '#8962bc'],
        vinho: ['#2a0c14', '#45131f', '#621c2c', '#7f283a', '#9b3a4b'],
        jeans: ['#121630', '#1d2846', '#283a5c', '#355074', '#4c6887'],
        jeans_escuro: ['#0c1022', '#151c36', '#1f2a4b', '#2b3a61', '#3b4d78'],
        jeans_claro: ['#27375a', '#3b507a', '#53699a', '#6f86b4', '#91a7cd'],
        pm_camisa: ['#1c2632', '#2e3c4e', '#42556b', '#5a7088', '#7a90a7'],
        pm_calca: ['#0d1220', '#161e33', '#212b47', '#2d3a5c', '#3d4c73'],
        tatico: ['#111317', '#1d2027', '#2b2f38', '#3c414c', '#535966'],
        oliva: ['#1d2313', '#2e371f', '#424e2d', '#57663d', '#718151'],
        // cores a mais (variações de NPC e roupas do jogador)
        turquesa: ['#0c3a3a', '#145a58', '#1f7d78', '#2fa39a', '#55c4b8'],
        marrom: ['#2a1a10', '#45291a', '#5f3a25', '#7a4e33', '#966645'],
        mostarda: ['#4a3a10', '#735a18', '#9a7a22', '#bf9a33', '#dcbb55'],
        marinho: ['#0a0f22', '#121a38', '#1b2650', '#263468', '#384a84'],
        caqui: ['#3a3522', '#5a5236', '#7a714c', '#9a9064', '#b8af82'],
        lilas: ['#3a2a4a', '#58426e', '#78609a', '#9a82bc', '#bca8da'],
        coral: ['#5a2018', '#8a3426', '#b84c38', '#da6a50', '#f08e72'],
        camuflado: ['#1e2412', '#323b1e', '#47522b', '#5e6b3a', '#7a8850'],
        // calçados
        tenis_creme: ['#5b5c55', '#8b8d84', '#b3b4a7', '#d1cfbb', '#e9e6cf'],
        sola_creme: ['#77766b', '#a6a596', '#cbc9b5', '#e3e0c9', '#f3f0da'],
        tenis_preto: ['#121216', '#1e1e24', '#2d2d35', '#40404a', '#575762'],
        tenis_branco: ['#6e727c', '#9b9fa8', '#c3c6cd', '#dfe1e6', '#f4f5f7'],
        tenis_vermelho: ['#3d0f14', '#6a1a20', '#96262b', '#bc3a36', '#da5a47'],
        tenis_verde: ['#0f3a1e', '#1a5a30', '#278444', '#36a85a', '#58c878'],
        tenis_azul: ['#0e1e48', '#1a3274', '#2a4ea2', '#3e6ec8', '#6292e4'],
        couro_preto: ['#0e0d0f', '#1a181b', '#272429', '#363238', '#49444c'],
        couro_marrom: ['#29170e', '#422617', '#5d3720', '#794a2c', '#945f3b'],
        sola_escura: ['#141317', '#222026', '#302d35', '#413e47', '#55515c'],
        cadarco: ['#121117', '#1f1e26', '#2e2d36', '#403f4a', '#55545f'],
        // diversos
        mochila: ['#30251d', '#48392a', '#614d37', '#7a6446', '#937c58'],
        alca: ['#271e17', '#3b2e23', '#524131', '#6a573f', '#806b52'],
        metal: ['#16171c', '#2a2c34', '#434650', '#62666f', '#8b909b'],
        madeira: ['#381f14', '#57301d', '#774628', '#965e33', '#b07740'],
        olho: ['#0d0716', '#140c1e', '#1c1328', '#261b33', '#30243e'],
        olho_branco: ['#bdbac8', '#d6d3df', '#eceaf2', '#f6f5fa', '#ffffff'],
        boca: ['#4a1e26', '#5e2730', '#72313a', '#863c44', '#9a4a50'],
        batom: ['#5a1424', '#7a1c30', '#9a263c', '#b8344a', '#d0485c'],
        granada: ['#1b2414', '#2c3a1e', '#3f5129', '#566a36', '#708546'],
        taco: ['#5a3a1f', '#82562e', '#a8743f', '#c99252', '#e0ae6b'],
        cromo: ['#4b4e57', '#757984', '#a2a6b0', '#c9ccd3', '#eef0f4'],
        sobrancelha: ['#21110f', '#2e1813', '#3b2017', '#48281c', '#553021'],
        fita: ['#111014', '#1d1b22', '#2a2830', '#38363f', '#48464f'],
        dourado: ['#5a3c0c', '#8c6114', '#bf8a1e', '#e0b23a', '#f8dc74'],
        lente: ['#07070a', '#101016', '#191a22', '#2a2c38', '#5c6070'],
        carne: ['#4a1414', '#6e1e1e', '#8e2a26', '#ad3c32', '#c85a48'],
    };

    const OUTLINE = '#0c0718';
    const SHADOW_RGBA = [10, 8, 26, 92];

    // grupos de contorno (linhas internas entre grupos diferentes)
    const GR = { face: 1, hair: 2, chest: 3, pelvis: 4, armR: 5, armL: 6, legR: 7, legL: 8, footR: 9, footL: 10, bag: 11, weapon: 12, prop: 13, pump: 14, hat: 15, vest: 16 };

    // ------------------------------------------------------------------ esqueleto em repouso (deslocamentos no espaço do pai)
    const SKEL = {
        pelvis: ['root', [0, 0, 31.4]], chest: ['pelvis', [0, 0, 5.0]], head: ['chest', [0, 0, 21.0]],
        uarm_R: ['chest', [16.6, 0, 15.6]], farm_R: ['uarm_R', [0, 0, -13.0]], hand_R: ['farm_R', [0, 0, -11.5]],
        uarm_L: ['chest', [-16.6, 0, 15.6]], farm_L: ['uarm_L', [0, 0, -13.0]], hand_L: ['farm_L', [0, 0, -11.5]],
        thigh_R: ['pelvis', [7.4, 0, -3.0]], shin_R: ['thigh_R', [0, 0, -12.0]], foot_R: ['shin_R', [0, 0, -11.4]],
        thigh_L: ['pelvis', [-7.4, 0, -3.0]], shin_L: ['thigh_L', [0, 0, -12.0]], foot_L: ['shin_L', [0, 0, -11.4]],
    };
    const UPPER = 13.0, LOWER = 11.5, FIST = [0.0, 0.6, -3.5], THIGH = 12.0, SHIN = 11.4, ANKLE_H = 5.7;

    // ------------------------------------------------------------------ proporções de ADULTO
    // O pacote desenha bonecos "chibi" (~3,3 cabeças de altura: cabeça enorme, pernas e braços curtos) — no jogo pareciam crianças.
    // As poses continuam escritas no esqueleto do pacote (SKEL); na hora de desenhar, os ÂNGULOS das juntas passam para um esqueleto
    // adulto (NpcGenAnims: Pose.adult) e cada parte assada é esticada no comprimento do osso (shapeFor). Resultado: ~5,3 cabeças.
    // ADULT = null volta ao desenho original do pacote (validate.html compara com os PNGs dele).
    const ADULT = { leg: 1.7, torso: 1.35, arm: 1.38, head: 0.6, hand: 0.85, neck: 2.0, width: 0.9 };
    // Escala [x, y, z] de uma parte no espaço do osso (z = ao longo do osso). null = sem mudança.
    function shapeFor(bone) {
        const A = G.ADULT;
        if (!A) return null;
        if (bone === 'head') return [A.head, A.head, A.head];
        if (bone === 'chest') return [A.width || 1, 1, A.torso];
        if (/^(uarm|farm)_/.test(bone)) return [1, 1, A.arm];
        if (/^hand_/.test(bone)) return [A.hand, A.hand, A.hand];
        if (/^(thigh|shin)_/.test(bone)) return [1, 1, A.leg];
        return null;
    }
    // Estica uma parte assada (posições e normais) — in place.
    function reshape(b, s) {
        const P = b.pos, N = b.nrm;
        for (let i = 0; i < b.n; i++) {
            const o = i * 3;
            P[o] *= s[0]; P[o + 1] *= s[1]; P[o + 2] *= s[2];
            const nx = N[o] / s[0], ny = N[o + 1] / s[1], nz = N[o + 2] / s[2], l = Math.hypot(nx, ny, nz) || 1;
            N[o] = nx / l; N[o + 1] = ny / l; N[o + 2] = nz / l;
        }
        return b;
    }

    // ------------------------------------------------------------------ o protagonista (ficha padrão); as fichas sobrescrevem
    const DEFAULT = {
        id: 'protagonista', label: 'Protagonista', group: 'Protagonista',
        skin: 'pele_pessego', hair: 'spiky', hair_color: 'castanho', eyes: 'angry',
        top: 'tshirt', top_color: 'roupa_preta', pattern: null, accent: 'branco', accent2: 'amarelo',
        bottom: 'jeans', bottom_color: 'jeans',
        shoes: 'sneaker', shoe_color: 'tenis_creme', sole_color: 'sola_creme', lace_color: 'cadarco',
        head: null, hat_color: 'roupa_preta', vest: null, vest_color: 'tatico',
        bag: 'backpack', bag_color: 'mochila', strap_color: 'alca', body: 'muscular', gender: 'm', beard: null, glasses: false,
        gloves: false, chain: false, mask: null, scale: 1.0, rifle: 'rifle', melee: 'bat', watch: false,
    };

    const BODY = {
        muscular: { tw: 1.0, td: 1.0, arm: 1.0, leg: 1.0, belly: 0.0, hip: 1.0 },
        normal: { tw: 0.93, td: 0.95, arm: 0.86, leg: 0.94, belly: 0.0, hip: 0.98 },
        slim: { tw: 0.86, td: 0.88, arm: 0.77, leg: 0.86, belly: 0.0, hip: 0.95 },
        heavy: { tw: 1.05, td: 1.14, arm: 0.96, leg: 1.05, belly: 1.0, hip: 1.06 },
    };

    const fullSpec = (spec) => Object.assign({}, DEFAULT, spec || {});

    function bodyFactors(s) {
        const b = Object.assign({}, BODY[s.body] || BODY.normal);
        if (s.gender === 'f') { b.tw *= 0.9; b.arm *= 0.86; b.hip *= 1.04; b.leg *= 0.97; }
        return b;
    }

    // Esqueleto com ombros/quadris ajustados ao tipo de corpo.
    function rigFor(spec) {
        const s = fullSpec(spec), b = bodyFactors(s), rig = Object.assign({}, SKEL);
        for (const [sd, sg] of [['R', 1], ['L', -1]]) {
            rig['uarm_' + sd] = ['chest', [sg * 16.6 * (0.35 + 0.65 * b.tw), 0, 15.6]];
            rig['thigh_' + sd] = ['pelvis', [sg * 7.4 * b.hip, 0, -3.0]];
        }
        return rig;
    }

    const darker = (r) => [r[0], r[0], r[1], r[2], r[3]];
    const pal = (name, fb) => PAL[name] || PAL[fb] || PAL.cinza;

    // Rampas de cor (material → 5 cores) de uma ficha.
    function rampsFor(spec) {
        const s = fullSpec(spec), R = {};
        R[M.skin] = pal(s.skin, 'pele_parda'); R[M.hair] = pal(s.hair_color, 'preto'); R[M.shirt] = pal(s.top_color, 'branco');
        R[M.jeans] = pal(s.bottom_color, 'jeans'); R[M.shoe] = pal(s.shoe_color, 'tenis_preto'); R[M.sole] = pal(s.sole_color, 'sola_escura');
        R[M.lace] = pal(s.lace_color, 'cadarco'); R[M.bag] = pal(s.bag_color, 'mochila'); R[M.strap] = pal(s.strap_color, 'alca');
        R[M.metal] = PAL.metal; R[M.wood] = PAL.madeira; R[M.eye] = PAL.olho; R[M.eyew] = PAL.olho_branco;
        R[M.mouth] = PAL[s.gender === 'f' ? 'batom' : 'boca']; R[M.green] = PAL.granada; R[M.batwood] = PAL.taco; R[M.chrome] = PAL.cromo;
        R[M.brow] = s.hair_color === 'castanho' ? PAL.sobrancelha : darker(pal(s.hair_color, 'preto'));
        R[M.tape] = PAL.fita; R[M.vest] = pal(s.vest_color, 'tatico'); R[M.hat] = pal(s.hat_color, 'roupa_preta');
        R[M.accent] = pal(s.accent, 'branco'); R[M.accent2] = pal(s.accent2, 'amarelo');
        R[M.beard] = darker(pal(s.hair_color, 'preto')); R[M.gold] = PAL.dourado; R[M.lens] = PAL.lente;
        R[M.glove] = PAL.tatico; R[M.sock] = PAL.branco; R[M.visor] = PAL.lente;
        R[M.cargo] = pal(s.cargo_color || s.bag_color, 'mochila'); R[M.flesh] = PAL.carne;
        return R;
    }

    // ------------------------------------------------------------------ texturas procedurais (sobre a nuvem de pontos)
    // Assinatura: (P, N, mat, pid, d1, d2, n) → tons (Int16Array); `mat` pode ser alterado no lugar.
    function makeTexHead(s) {
        const angry = s.eyes === 'angry', female = s.gender === 'f';
        return (P, N, mat, pid, d1, d2, n) => {
            const tone = new Int16Array(n);
            const ex = 5.4, ez = 10.2, rx = 3.0, rz = angry ? 2.0 : 1.8, slope = angry ? 0.42 : 0.1;
            for (let i = 0; i < n; i++) {
                const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], front = N[i * 3 + 1] > 0.25, skin = mat[i] === M.skin, ax = abs(x);
                const inside = ((ax - ex) / rx) ** 2 + ((z - ez) / rz) ** 2 < 1.0;
                const lid = z < ez + 0.95 + slope * (ax - ex);
                const eye = skin && front && inside && lid && y > 6;
                if (eye) mat[i] = M.eye;
                if (eye && ax - ex > 0.55 && z > ez - 0.9) mat[i] = M.eyew;
                const bz = ez + (angry ? 2.45 : 2.9) + slope * (ax - ex), bw = female ? 0.42 : 0.55;
                if (skin && front && abs(z - bz) < bw && ax > 2.2 && ax < 7.8 && y > 6) mat[i] = M.brow;
                const mouth = skin && front && ax < (female ? 1.6 : 1.8) && abs(z - 3.4) < 0.5 && y > 6;
                if (mouth) mat[i] = M.mouth;
                if (skin && front && ax < 1.3 && z > 5.3 && z < 6.2 && y > 9) tone[i] -= 1;
                if (s.beard === 'beard' || s.beard === 'goatee') {
                    let jaw = skin && z < 6.6 && y > -1.5 && !mouth;
                    if (s.beard === 'goatee') jaw = jaw && ax < 3.2 && z < 3.0;
                    else jaw = jaw && !(ax < 2.4 && z > 3.9);
                    if (jaw) mat[i] = M.beard;
                }
                if (s.beard === 'beard' || s.beard === 'mustache') {
                    if (skin && front && ax < 3.0 && z > 3.9 && z < 5.1 && y > 8) mat[i] = M.beard;
                }
                if (s.glasses) {
                    const band = front && abs(z - (ez + 0.3)) < 1.75 && ax < 8.8 && y > 5 && mat[i] !== M.hair;
                    if (band) { mat[i] = M.lens; if (x < -5.0 && x > -6.4 && z > ez + 0.6) tone[i] += 3; }
                }
                if (s.mask === 'balaclava') {
                    const hole = front && abs(z - ez) < 2.6 && ax < 8.8 && y > 4;
                    if (!hole && (mat[i] === M.skin || mat[i] === M.mouth || mat[i] === M.brow)) mat[i] = M.hat;
                } else if (s.mask === 'bandana') {
                    const low = z < 6.4 && y > -3.0 && mat[i] !== M.eye && mat[i] !== M.eyew;
                    if (low && (mat[i] === M.skin || mat[i] === M.mouth || mat[i] === M.beard)) mat[i] = M.accent;
                }
            }
            return tone;
        };
    }

    const texHair = (P, N, mat, pid, d1, d2, n) => {
        const tone = new Int16Array(n);
        for (let i = 0; i < n; i++) { const g = d2[i] - d1[i]; if (g < 0.55) tone[i] -= 1; if (g < 0.22) tone[i] -= 1; }
        return tone;
    };
    const texCurls = (P, N, mat, pid, d1, d2, n) => {
        const tone = new Int16Array(n);
        for (let i = 0; i < n; i++) {
            const c = sin(P[i * 3] * 1.25 + 0.3) + sin(P[i * 3 + 1] * 1.3 + 1.1) + sin(P[i * 3 + 2] * 1.2 + 2.0);
            if (c > 1.25) tone[i] -= 1;
            if (c < -1.9) tone[i] += 1;
        }
        return tone;
    };
    const texShortHair = (P, N, mat, pid, d1, d2, n) => {
        const tone = new Int16Array(n);
        for (let i = 0; i < n; i++) { const st = sin(Math.atan2(P[i * 3], -P[i * 3 + 1]) * 9.0 + P[i * 3 + 2] * 0.4); if (st > 0.82) tone[i] -= 1; }
        return tone;
    };

    function makeTexChest(s) {
        const pattern = s.pattern, top = s.top;
        return (P, N, mat, pid, d1, d2, n) => {
            const tone = new Int16Array(n);
            for (let i = 0; i < n; i++) {
                const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ny = N[i * 3 + 1], ax = abs(x);
                const shirt0 = mat[i] === M.shirt, r = sqrt(x * x + (y - 0.5) ** 2);
                if (top === 'tank' && shirt0 && ((ax > 9.0 && z > 15.0) || (y > 1.5 && ax < 5.2 && z > 16.8) || (y < -1.5 && ax < 5.6 && z > 18.5))) mat[i] = M.skin;
                if (top === 'hoodie' && shirt0 && y < -6.5 && z > 15.5 && ax < 10.5) tone[i] -= 1;                       // o capuz caído nas costas
                if (mat[i] === M.shirt && z > 15.5 && r < 8.2) tone[i] -= 1;
                if (top === 'polo' || top === 'social' || top === 'uniform' || top === 'uniform_long') {
                    if (mat[i] === M.shirt && z > 15.0 && r < 9.4 && r > 6.2) tone[i] += 1;
                    if (mat[i] === M.shirt && ny > 0.6 && abs(x - 0.4) < 0.45 && z < 14.5 && abs(pmod(z + 30, 3.2) - 1.6) < 0.5) mat[i] = top === 'polo' || top === 'social' ? M.accent : M.chrome;
                }
                if (top === 'uniform' || top === 'uniform_long') {
                    const pk = mat[i] === M.shirt && ny > 0.55 && abs(ax - 6.2) < 2.4 && z > 8.0 && z < 12.5;
                    if (pk && (abs(ax - 6.2) > 1.7 || z > 11.7)) tone[i] -= 1;
                }
                if (top === 'hoodie' || s.zip) {                                                                         // zíper
                    if (mat[i] === M.shirt && ny > 0.6 && abs(x - 0.3) < 0.4 && z < 16.0) mat[i] = M.chrome;
                }
                if (mat[i] === M.shirt && ny > 0.3 && abs(z - (1.5 + 0.18 * ax)) < 0.45 && ax < 11) tone[i] -= 1;
                if (mat[i] === M.shirt && d2[i] - d1[i] < 0.35) tone[i] -= 1;
                const shirt = mat[i] === M.shirt;
                if (pattern === 'stripes_h') { if (shirt && pmod(floor((z + 40.0) / 3.0), 2) === 0) mat[i] = M.accent; }
                else if (pattern === 'stripes_v') { if (shirt && pmod(floor((x + 40.0) / 3.2), 2) === 0) mat[i] = M.accent; }
                else if (pattern === 'floral') {
                    let h = sin(floor(x / 2.6) * 12.9898 + floor(z / 2.6) * 78.233 + floor(y / 2.6) * 37.719) * 43758.5453;
                    h -= floor(h);
                    if (shirt && h > 0.72) mat[i] = M.accent;
                    if (shirt && h < 0.12) mat[i] = M.accent2;
                } else if (pattern === 'jersey') {
                    if (shirt && (ax > 11.0 || z > 16.5)) mat[i] = M.accent;
                    if (shirt && ny < -0.6 && ax < 3.2 && z > 2.5 && z < 11.5 && !(ax < 1.2 && z > 4.5 && z < 9.5)) mat[i] = M.accent2;
                } else if (pattern === 'logo') {                                                                         // estampa no peito
                    if (shirt && ny > 0.5 && ((x - 0.5) ** 2) / 20 + ((z - 9.5) ** 2) / 9 < 1) mat[i] = M.accent;
                }
                if (s.chain) {
                    if (abs(z - (17.4 - 0.065 * x * x)) < 0.55 && y > 0 && ax < 7.5 && (mat[i] === M.shirt || mat[i] === M.skin || mat[i] === M.accent)) mat[i] = M.gold;
                }
            }
            return tone;
        };
    }

    const texPelvis = (P, N, mat, pid, d1, d2, n) => {
        const tone = new Int16Array(n);
        for (let i = 0; i < n; i++) if (abs(P[i * 3] - 0.6) < 0.38 && N[i * 3 + 1] > 0.5 && P[i * 3 + 2] < 0) tone[i] -= 1;
        return tone;
    };
    function makeTexLeg(s) {
        const jeans = s.bottom === 'jeans';
        return (P, N, mat, pid, d1, d2, n) => {
            const tone = new Int16Array(n);
            if (jeans) for (let i = 0; i < n; i++) { const z = P[i * 3 + 2]; if (N[i * 3 + 1] > 0.55 && z < -1.5 && z > -7.5 && mat[i] === M.jeans) tone[i] += 1; }
            return tone;
        };
    }
    function makeTexFoot(s) {
        const shoes = s.shoes;
        return (P, N, mat, pid, d1, d2, n) => {
            const tone = new Int16Array(n);
            for (let i = 0; i < n; i++) {
                const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], shoe = mat[i] === M.shoe;
                if (shoes === 'sneaker' || shoes === 'hightop') {
                    const top = shoe && N[i * 3 + 2] > 0.35 && y > 2.6 && y < 9.4 && abs(x) < 2.4;
                    const lace = top && pmod(floor((y + 0.4) / 1.6), 2) === 0 && abs(x) < 1.9;
                    if (top) { mat[i] = M.lace; tone[i] += 1; }
                    if (lace) tone[i] += 1;
                    if (shoe && z < -3.0) tone[i] -= 1;
                    if (shoes === 'hightop' && shoe && abs(z - 1.2) < 0.5) tone[i] += 1;                                // faixa do cano
                } else if (shoes === 'boots') {
                    const top = shoe && N[i * 3 + 1] > 0.3 && y > 0.5 && z > -1.0 && abs(x) < 1.8;
                    if (top && pmod(floor((z + 9.0) / 1.5), 2) === 0) tone[i] += 2;
                }
            }
            return tone;
        };
    }
    const texHand = (P, N, mat, pid, d1, d2, n) => {
        const tone = new Int16Array(n);
        for (let i = 0; i < n; i++) if (N[i * 3 + 1] > 0.5 && P[i * 3 + 2] < -2.2 && abs(pmod(P[i * 3] + 0.0, 1.7) - 0.85) < 0.22) tone[i] -= 1;
        return tone;
    };
    const texBag = (P, N, mat, pid, d1, d2, n) => {
        const tone = new Int16Array(n);
        for (let i = 0; i < n; i++) if (d2[i] - d1[i] < 0.45) tone[i] -= 1;
        return tone;
    };
    const texVest = (P, N, mat, pid, d1, d2, n) => {
        const tone = new Int16Array(n);
        for (let i = 0; i < n; i++) { if (d2[i] - d1[i] < 0.4) tone[i] -= 1; if (abs(P[i * 3 + 2] - 0.2) < 0.6 && mat[i] === M.vest) tone[i] -= 1; }
        return tone;
    };
    const texBat = (P, N, mat, pid, d1, d2, n) => {
        for (let i = 0; i < n; i++) if (P[i * 3 + 1] < 4.6 && mat[i] === M.batwood) mat[i] = M.tape;
        return new Int16Array(n);
    };

    // ------------------------------------------------------------------ cabelo
    const HAIR_C = [0.0, -2.0, 16.8], HAIR_R = [15.6, 16.0, 14.6], CROWN = [180.0, 72.0];

    function capPoint(az, el, off = 0.0) {
        const a = deg(az), e = deg(el), d = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
        const t = 1.0 / sqrt((d[0] / HAIR_R[0]) ** 2 + (d[1] / HAIR_R[1]) ** 2 + (d[2] / HAIR_R[2]) ** 2);
        return V.add(HAIR_C, V.mul(d, t + off));
    }

    // Gerador pseudoaleatório com semente (mulberry32 + Box-Muller): o original usava o do numpy.
    function rng(seed) {
        let a = seed >>> 0;
        const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        return {
            uniform: (lo, hi) => lo + (hi - lo) * u(),
            normal: (mu, sd) => { const r = sqrt(-2 * Math.log(u() + 1e-12)), th = 2 * Math.PI * u(); return mu + sd * r * Math.cos(th); },
        };
    }

    function hairLocks() {
        const R = rng(5);
        const spec = [
            [0, 40, 2.5, 6.0, 0], [32, 38, 4.0, 5.8, 12], [-32, 38, 4.0, 5.8, -12],
            [68, 32, 9.5, 5.8, 14], [-68, 32, 9.5, 5.8, -14],
            [104, 28, 9.5, 5.6, 10], [-104, 28, 9.5, 5.6, -10],
            [140, 20, 7.5, 5.6, 8], [-140, 20, 7.5, 5.6, -8], [180, 14, 5.5, 5.6, 0],
            [130, -10, 1.6, 5.2, 4], [-130, -10, 1.6, 5.2, -4], [160, -16, 1.6, 5.2, 3], [-160, -16, 1.6, 5.2, -3],
            [15, 58, 6.5, 5.2, 18], [-35, 56, 7.0, 5.2, -16], [80, 54, 7.5, 5.0, 18],
            [-85, 52, 7.5, 5.0, -18], [130, 52, 6.5, 5.0, 12], [-135, 52, 6.5, 5.0, -12],
        ];
        const prims = [];
        spec.forEach(([az, e1, lift, r, sw], i) => {
            az += R.uniform(-5, 5);
            let S = capPoint(az, 78 + R.uniform(-3, 3), -2.6);
            S = V.add(V.mul(S, 0.6), V.mul(capPoint(CROWN[0], CROWN[1], -2.6), 0.4));
            const em = (78 + e1) / 2, Mid = capPoint(az + sw * 0.35, em, 1.0), E = capPoint(az + sw, e1, lift);
            prims.push(new RoundCone(S, Mid, r, r * 0.86, M.hair, { clump: 100 + i, tone: -1 }));
            prims.push(new RoundCone(Mid, E, r * 0.86, 0.55, M.hair, { clump: 100 + i, tone: -1 }));
        });
        const tops = [[5, 74, 11.5, 5.4, [0.15, 0.35]], [-40, 70, 13.0, 5.4, [-0.75, 0.25]], [48, 70, 12.5, 5.2, [0.85, 0.15]],
            [115, 66, 10.0, 5.0, [0.85, -0.45]], [-120, 66, 10.0, 5.0, [-0.85, -0.45]], [178, 70, 9.0, 5.0, [0.0, -0.9]]];
        tops.forEach(([az, el, L, r, [sx, sy]], j) => {
            const base = capPoint(az, el, -2.6);
            const d = nrm([sx + R.normal(0, 0.06), sy + R.normal(0, 0.06), 1.0 + R.normal(0, 0.06)]);
            prims.push(new RoundCone(base, V.add(base, V.mul(d, L + 2.6)), r, 0.55, M.hair, { clump: 300 + j, tone: -1 }));
        });
        return prims;
    }

    const HAT_CUT = { cap: 16.2, cap_back: 16.2, police_cap: 16.2, beret: 18.6, helmet: 11.2, beanie: 15.0, bucket: 16.6, visor: 99 };

    function hairPart(s) {
        const p = _hairPart(s);
        if (p && s.head in HAT_CUT && HAT_CUT[s.head] < 90) p.prims.push(new RoundBox([0, 0, HAT_CUT[s.head] + 60.0], [80, 80, 60], 0.0, M.hair, { sub: true }));       // corta o cabelo que furaria o chapéu
        return p;
    }

    function _hairPart(s) {
        const style = s.hair, H = M.hair;
        if (!style || style === 'bald' || s.mask === 'balaclava') return null;
        if (style === 'spiky') {
            let prims = [new Ellipsoid(HAIR_C, HAIR_R, H, { clump: 0, tone: -1 }), new Ellipsoid([0, -6.5, 9.0], [14.0, 11.0, 9.8], H, { blend: 3.0, clump: 0, tone: -1 })];
            prims = prims.concat(hairLocks());
            const fringe = [[[0.6, 8.2, 25.0], [1.2, 14.4, 13.8], 5.0], [[-5.4, 8.0, 24.4], [-6.0, 13.9, 13.0], 4.6],
                [[5.8, 8.0, 24.4], [6.0, 13.9, 13.4], 4.6], [[-10.2, 6.4, 22.5], [-12.2, 10.6, 12.0], 4.2],
                [[10.4, 6.4, 22.5], [12.4, 10.4, 12.4], 4.2], [[-12.6, 3.0, 18.0], [-14.0, 6.0, 8.2], 3.3],
                [[12.6, 3.0, 18.0], [14.0, 6.0, 8.4], 3.3]];
            fringe.forEach(([a, b, r], i) => prims.push(new RoundCone(a, b, r, 0.65, H, { clump: 200 + i, tone: -1 })));
            return new Part('hair', 'head', GR.hair, prims, texHair);
        }
        if (style === 'short' || style === 'buzz') {
            const k = style === 'short' ? 0.0 : -0.35;
            const prims = [new Ellipsoid([0, -2.2, 15.2], [13.6 + k, 13.6 + k, 13.4 + k], H, { tone: style === 'buzz' ? -1 : 0 })];
            if (style === 'short') prims.push(new Ellipsoid([0, 2.0, 22.5], [11.0, 9.5, 5.5], H, { blend: 2.0 }));
            return new Part('hair', 'head', GR.hair, prims, texShortHair);
        }
        if (style === 'afro') return new Part('hair', 'head', GR.hair, [new Ellipsoid([0, -3.5, 19.0], [16.6, 15.6, 14.2], H)], texCurls);
        if (style === 'curly') {
            return new Part('hair', 'head', GR.hair, [new Ellipsoid([0, -2.8, 17.6], [14.8, 14.6, 12.8], H), new Ellipsoid([0, 3.5, 23.5], [11.5, 9.0, 6.0], H, { blend: 2.0 })], texCurls);
        }
        if (style === 'mohawk') {                                                                                         // moicano: lados raspados, crista no meio
            const prims = [new Ellipsoid([0, -2.2, 15.0], [13.3, 13.3, 13.1], H, { tone: -1 })];
            for (let i = 0; i < 5; i++) { const y = 8 - i * 5; prims.push(new Ellipsoid([0, y, 25.5 - abs(y + 2) * 0.12], [2.8, 4.2, 5.2], H, { blend: 1.5, clump: 40 + i })); }
            return new Part('hair', 'head', GR.hair, prims, texHair);
        }
        if (style === 'dreads') {                                                                                         // dreads / tranças caindo
            const prims = [new Ellipsoid([0, -2.4, 15.6], [14.0, 14.0, 13.8], H)];
            for (let i = 0; i < 9; i++) {
                const a = deg(-120 + i * 30), x = Math.sin(a) * 13.0, y = -Math.cos(a) * 12.0 - 2.0;
                prims.push(new RoundCone([x, y, 18.0], [x * 1.08, y * 1.1 - 1.0, 2.0 + (i % 2) * 1.5], 2.4, 1.9, H, { clump: 60 + i, tone: i % 2 ? 0 : -1 }));
            }
            return new Part('hair', 'head', GR.hair, prims, texCurls);
        }
        if (style === 'long' || style === 'ponytail' || style === 'bun') {
            let prims = [new Ellipsoid([0, -2.2, 15.4], [13.9, 13.9, 13.7], H), new Ellipsoid([0, 3.0, 23.0], [10.5, 9.0, 5.2], H, { blend: 2.0 })];
            if (style === 'long') {
                prims = prims.concat([new RoundBox([0, -6.0, 3.5], [13.0, 6.2, 12.0], 5.5, H, { blend: 2.5 }),
                    new RoundCone([12.3, 1.5, 14.0], [12.0, 0.5, -2.5], 3.4, 2.6, H, { blend: 1.5 }),
                    new RoundCone([-12.3, 1.5, 14.0], [-12.0, 0.5, -2.5], 3.4, 2.6, H, { blend: 1.5 })]);
            } else if (style === 'ponytail') {
                prims = prims.concat([new Sphere([0, -14.0, 15.0], 2.6, M.accent2, { blend: 0.5 }), new RoundCone([0, -15.2, 14.5], [0, -18.6, 0.5], 3.6, 1.9, H, { blend: 0.8 })]);
            } else prims.push(new Sphere([0, -11.0, 23.5], 5.4, H, { blend: 1.5 }));
            return new Part('hair', 'head', GR.hair, prims, texShortHair);
        }
        if (G.MESH_HAIR && G.MESH_HAIR[style]) return _hairPart(Object.assign({}, s, { hair: 'short' }));      // estilo que só a malha 3D tem: sem ela, curto
        throw new Error('estilo de cabelo ' + style);
    }

    function hatPart(s) {
        const kind = s.head, Hm = M.hat;
        const below = (z) => new RoundBox([0, 0, z - 60.0], [80, 80, 60], 0.0, Hm, { sub: true });
        if (!kind || kind === 'none') return null;
        let prims;
        if (kind === 'cap' || kind === 'cap_back') {
            const b = kind === 'cap' ? 1 : -1;
            prims = [new Ellipsoid([0, -0.6, 17.2], [14.2, 14.4, 11.4], Hm), below(15.8),
                new Ellipsoid([0, 13.6 * b, 16.6], [8.8, 7.8, 1.15], Hm, { R: Rx(deg(-10 * b)), tone: -1 }),
                new Sphere([0, -0.6, 28.4], 1.1, Hm)];
            if (s.hat_logo) prims.push(new Ellipsoid([0, 12.0 * b, 21.0], [3.4, 2.0, 2.4], M.sock, { blend: 0.3 }));       // logo branco na frente
        } else if (kind === 'police_cap') {
            prims = [new CapCone([0, -0.4, 15.8], [0, -0.4, 25.6], 14.1, 14.9, Hm, { rround: 1.3 }),
                new CapCone([0, -0.4, 15.8], [0, -0.4, 18.6], 14.3, 14.35, M.lace, { rround: 0.5 }),
                new Ellipsoid([0, 12.6, 16.6], [9.4, 6.4, 1.05], M.visor, { R: Rx(deg(-14)) }),
                new RoundBox([0, 14.6, 21.6], [1.7, 0.6, 1.9], 0.4, M.gold)];
        } else if (kind === 'beret') {
            prims = [new Ellipsoid([2.8, -0.8, 23.4], [14.2, 13.8, 4.8], Hm, { R: Ry(deg(-12)) }),
                new CapCone([0, -0.6, 18.0], [0, -0.6, 21.0], 13.9, 14.0, Hm, { rround: 0.6, tone: -1 }),
                new RoundBox([-6.5, 12.6, 21.0], [1.4, 0.5, 1.6], 0.3, M.gold)];
        } else if (kind === 'helmet') {
            prims = [new Ellipsoid([0, -1.0, 16.8], [15.8, 16.2, 14.4], Hm), below(10.5),
                new Ellipsoid([0, 15.0, 7.5], [13.5, 9.0, 9.5], Hm, { sub: true }),
                new RoundBox([0, 14.2, 22.5], [2.6, 1.5, 2.0], 0.6, M.metal),
                new RoundBox([15.0, -1.0, 17.0], [1.2, 6.0, 1.4], 0.5, M.metal),
                new RoundBox([-15.0, -1.0, 17.0], [1.2, 6.0, 1.4], 0.5, M.metal)];
        } else if (kind === 'beanie') {
            prims = [new Ellipsoid([0, -1.0, 16.4], [14.4, 14.6, 13.0], Hm), below(14.6),
                new CapCone([0, -1.0, 14.6], [0, -1.0, 17.8], 14.5, 14.2, Hm, { rround: 0.8, tone: -1 })];
        } else if (kind === 'bucket') {                                                                                  // chapéu de pescador (bucket hat)
            prims = [new CapCone([0, -1.2, 16.4], [0, -1.2, 26.4], 14.2, 12.0, Hm, { rround: 2.4 }),
                new CapCone([0, -1.2, 15.6], [0, -1.2, 16.9], 17.6, 16.4, Hm, { rround: 0.6, tone: -1 }),
                new CapCone([0, -1.2, 17.4], [0, -1.2, 19.0], 14.5, 14.3, M.lace, { rround: 0.5 })];      // faixa
        } else if (kind === 'visor') {                                                                                   // viseira: aba e faixa, sem copa
            prims = [new CapCone([0, -0.6, 15.4], [0, -0.6, 19.2], 14.3, 14.0, Hm, { rround: 0.8 }),
                new Ellipsoid([0, 13.6, 16.6], [8.8, 7.8, 1.15], Hm, { R: Rx(deg(-10)), tone: -1 })];
        } else throw new Error('chapéu ' + kind);
        return new Part('hat', 'head', GR.hat, prims);
    }

    // ------------------------------------------------------------------ corpo
    function torsoPrims(b, female, mat) {
        const tw = b.tw, td = b.td;
        const prims = [
            new Ellipsoid([0, 0.4, 10.8], [16.2 * tw, 10.4 * td, 10.6], mat),
            new Ellipsoid([0, 0.0, 15.2], [17.0 * tw, 9.4 * td, 6.4], mat, { blend: 4.0 }),
            new Sphere([15.2 * tw, 0, 15.0], 6.4 * (0.5 + 0.5 * b.arm), mat, { blend: 3.0, clump: 1 }),
            new Sphere([-15.2 * tw, 0, 15.0], 6.4 * (0.5 + 0.5 * b.arm), mat, { blend: 3.0, clump: 2 }),
            new Ellipsoid([0, 0.9, 2.6], [14.8 * tw, 9.8 * td, 7.8], mat, { blend: 4.0 }),
            new CapCone([0, 0.6, -5.0], [0, 0.6, 1.0], 14.6 * tw, 14.8 * tw, mat, { rround: 1.4, blend: 2.0 }),
        ];
        if (b.belly > 0) prims.push(new Ellipsoid([0, 4.6 * td, 2.6], [13.0 * tw, 9.4, 8.6], mat, { blend: 4.5 }));
        if (female) {
            prims.push(new Ellipsoid([4.6, 7.4 * td, 11.0], [4.4, 3.6, 3.8], mat, { blend: 2.5 }));
            prims.push(new Ellipsoid([-4.6, 7.4 * td, 11.0], [4.4, 3.6, 3.8], mat, { blend: 2.5 }));
        }
        return prims;
    }

    // Partes do corpo de uma ficha, NA ORDEM do original (a ordem importa: desempate do z-buffer e amostra da sombra).
    function buildParts(spec) {
        const s = fullSpec(spec), b = bodyFactors(s), female = s.gender === 'f', S = M, parts = {};
        // ---------------- cabeça
        const head = [
            new RoundCone([0, 0.6, -4.0], [0, 0.9, 5.0], 5.2, 5.0, S.skin),
            new Ellipsoid([0, 0.6, 12.0], [13.0, 12.4, 13.4], S.skin, { blend: 2.5 }),
            new Ellipsoid([0, 3.6, 5.8], [female ? 10.0 : 10.8, 9.4, 7.4], S.skin, { blend: 3.0 }),
            new Ellipsoid([0, 6.4, 3.4], [female ? 5.4 : 6.2, 5.8, 4.4], S.skin, { blend: 2.5 }),
            new Ellipsoid([12.7, 0.2, 9.6], [2.1, 3.0, 3.6], S.skin, { blend: 1.0 }),
            new Ellipsoid([-12.7, 0.2, 9.6], [2.1, 3.0, 3.6], S.skin, { blend: 1.0 }),
            new Ellipsoid([0, 12.7, 7.2], [1.6, 1.7, 2.0], S.skin, { blend: 0.8 }),
        ];
        if (s.beard === 'beard') head.push(new Ellipsoid([0, 5.2, 3.6], [9.4, 8.2, 5.0], S.skin, { blend: 2.0 }));
        parts.head = new Part('head', 'head', GR.face, head, makeTexHead(s));
        const hp = hairPart(s);
        if (hp) parts.hair = hp;
        const hat = hatPart(s);
        if (hat) parts.hat = hat;

        // ---------------- tronco
        const chest = torsoPrims(b, female, S.shirt);
        if (s.top === 'hoodie') {                                                                                         // capuz caído nas costas
            chest.push(new Ellipsoid([0, -9.6 * b.td, 17.6], [10.5 * b.tw, 4.6, 4.2], S.shirt, { blend: 2.0, clump: 5 }));
        }
        parts.chest = new Part('chest', 'chest', GR.chest, chest, makeTexChest(s));

        // ---------------- colete
        if (s.vest) {
            const tw = b.tw, td = b.td;
            const vp = [
                new Ellipsoid([0, 0.4, 10.4], [16.2 * tw + 1.5, 10.4 * td + 1.6, 10.6 + 1.0], S.vest),
                new Ellipsoid([0, 0.9, 2.6], [14.8 * tw + 1.6, 9.8 * td + 1.6, 7.8 + 1.0], S.vest, { blend: 4.0 }),
            ];
            if (b.belly > 0) vp.push(new Ellipsoid([0, 4.6 * td, 2.6], [13.0 * tw + 1.5, 9.4 + 1.5, 8.6 + 1.0], S.vest, { blend: 4.5 }));
            vp.push(new RoundBox([0, 0, 18.0 + 30.0], [60, 60, 30], 0.0, S.vest, { sub: true }),
                new RoundBox([0, 0, -2.6 - 30.0], [60, 60, 30], 0.0, S.vest, { sub: true }),
                new RoundBox([9.5 * tw, 0.0, 17.2], [3.0, 10.6 * td, 1.7], 1.2, S.vest),
                new RoundBox([-9.5 * tw, 0.0, 17.2], [3.0, 10.6 * td, 1.7], 1.2, S.vest));
            const fy = 11.6 * td + 0.8;
            for (const px of [-5.4, 0.0, 5.4]) vp.push(new RoundBox([px * tw, fy, 2.4], [2.3, 1.5, 2.9], 0.8, S.vest, { tone: -1, clump: 10 }));
            if (s.vest === 'police') {
                vp.push(new RoundBox([-8.6 * tw, fy - 0.6, 11.0], [1.8, 1.4, 3.2], 0.6, S.lace));       // rádio
                vp.push(new RoundBox([6.8 * tw, fy - 0.8, 11.6], [2.4, 0.6, 1.4], 0.3, S.gold));        // distintivo
            } else {
                vp.push(new RoundBox([-8.0 * tw, fy - 0.6, 10.5], [2.0, 1.4, 3.2], 0.6, S.vest, { tone: -1, clump: 11 }));
                vp.push(new RoundBox([8.0 * tw, fy - 0.6, 10.5], [2.0, 1.4, 3.2], 0.6, S.vest, { tone: -1, clump: 12 }));
            }
            parts.vest = new Part('vest', 'chest', GR.vest, vp, texVest);
        }

        // ---------------- quadril
        const hip = b.hip;
        const pelvis = [
            new Ellipsoid([0, 0.2, -0.8], [13.6 * hip, 9.0 * b.td ** 0.5, 6.6], S.jeans),
            new Ellipsoid([0, 0.6, -4.0], [9.2 * hip, 7.2, 5.2], S.jeans, { blend: 2.0 }),
        ];
        if (s.vest) {
            pelvis.push(new CapCone([0, 0.2, 0.6], [0, 0.2, 3.0], 14.0 * hip, 14.2 * hip, S.lace, { rround: 0.6 }));       // cinto de guarnição
            pelvis.push(new RoundBox([10.5 * hip, 4.5, -0.4], [1.6, 2.4, 2.8], 0.6, S.lace));                             // coldre
        } else if (s.belt) pelvis.push(new CapCone([0, 0.2, 0.4], [0, 0.2, 2.2], 13.9 * hip, 14.1 * hip, S.lace, { rround: 0.5 }));
        parts.pelvis = new Part('pelvis', 'pelvis', GR.pelvis, pelvis, texPelvis);

        // ---------------- pernas
        const lg = b.leg, bottom = s.bottom, shoes = s.shoes;
        for (const [sd, gl, gf] of [['R', GR.legR, GR.footR], ['L', GR.legL, GR.footL]]) {
            const sg = sd === 'R' ? 1 : -1;
            const thigh = [new RoundCone([0, 0, 1.5], [0, 0, -12.0], 6.1 * lg, 5.5 * lg, S.jeans)];
            if (bottom === 'shorts') thigh.push(new CapCone([0, 0, -8.0], [0, 0, -13.2], 5.9 * lg, 6.2 * lg, S.jeans, { rround: 0.9, blend: 1.0 }));
            if (bottom === 'pants' || bottom === 'cargo') thigh.push(new RoundBox([sg * 5.6 * lg, 0.6, -6.5], [1.4, 3.0, 3.0], 0.8, bottom === 'cargo' ? S.jeans : S.jeans, { tone: -1 }));
            if (bottom === 'cargo') thigh.push(new RoundBox([sg * 5.9 * lg, 0.4, -6.0], [1.0, 3.4, 3.6], 0.8, S.jeans, { tone: -1, clump: 7 }));
            parts['thigh_' + sd] = new Part('thigh_' + sd, 'thigh_' + sd, gl, thigh, makeTexLeg(s));
            let shin;
            if (bottom === 'shorts') {
                shin = [new RoundCone([0, 0, -0.5], [0, 0, -10.5], 4.5 * lg, 3.6 * lg, S.skin), new Ellipsoid([0, -1.2, -3.6], [4.5 * lg, 4.9 * lg, 4.6], S.skin, { blend: 1.5 })];
                if (shoes === 'sneaker' || shoes === 'boots' || shoes === 'dress' || shoes === 'hightop') shin.push(new CapCone([0, 0, -8.4], [0, 0, -11.2], 4.0 * lg, 3.9 * lg, S.sock, { rround: 0.6 }));
            } else if (shoes === 'boots') shin = [new RoundCone([0, 0, 0.0], [0, 0, -8.0], 5.4 * lg, 4.7 * lg, S.jeans)];
            else {
                shin = [new RoundCone([0, 0, 0.0], [0, 0, -8.8], 5.4 * lg, 4.9 * lg, S.jeans), new CapCone([0, 0, -6.8], [0, 0, -9.8], 5.0 * lg, 5.2 * lg, S.jeans, { rround: 1.0, blend: 1.0 })];
            }
            parts['shin_' + sd] = new Part('shin_' + sd, 'shin_' + sd, gl, shin, makeTexLeg(s));
            let foot;
            if (shoes === 'sneaker' || shoes === 'hightop') {
                foot = [new Ellipsoid([0, 4.6, -2.1], [4.4, 7.8, 3.4], S.shoe), new Ellipsoid([0, 0.0, 0.2], [4.0, 4.2, 2.8], S.shoe, { blend: 2.0 }),
                    new RoundBox([0, 4.4, -4.6], [4.8, 7.9, 1.05], 0.85, S.sole)];
                if (shoes === 'hightop') foot.push(new CapCone([0, -0.2, -2.0], [0, -0.2, 3.4], 4.6, 4.4, S.shoe, { rround: 1.0, blend: 1.2 }));
            } else if (shoes === 'boots') {
                foot = [new Ellipsoid([0, 4.4, -2.0], [4.6, 7.6, 3.5], S.shoe), new CapCone([0, -0.3, -3.0], [0, -0.3, 7.0], 4.9, 4.7, S.shoe, { rround: 1.0, blend: 1.5 }),
                    new RoundBox([0, 4.2, -4.6], [5.0, 7.9, 1.1], 0.7, S.sole)];
            } else if (shoes === 'dress') {
                foot = [new Ellipsoid([0, 4.6, -2.4], [4.1, 7.8, 3.0], S.shoe), new Ellipsoid([0, 0.0, -0.2], [3.8, 4.0, 2.6], S.shoe, { blend: 2.0 }),
                    new RoundBox([0, 4.4, -4.7], [4.4, 7.9, 0.8], 0.6, S.sole)];
            } else if (shoes === 'flipflop') {
                foot = [new RoundCone([0, -0.5, 1.5], [0, 0.0, -3.0], 3.6, 3.3, S.skin), new Ellipsoid([0, 4.6, -3.4], [3.9, 7.4, 1.9], S.skin, { blend: 1.5 }),
                    new RoundBox([0, 4.4, -5.0], [4.4, 8.0, 0.6], 0.5, S.sole),
                    new RoundCone([0, 9.2, -3.3], [3.6, 3.6, -3.2], 0.55, 0.55, S.shoe), new RoundCone([0, 9.2, -3.3], [-3.6, 3.6, -3.2], 0.55, 0.55, S.shoe)];
            } else throw new Error('calçado ' + shoes);
            parts['foot_' + sd] = new Part('foot_' + sd, 'foot_' + sd, gf, foot, makeTexFoot(s));
        }

        // ---------------- braços
        const ak = b.arm, top = s.top;
        const longSleeve = top === 'longsleeve' || top === 'social' || top === 'uniform_long' || top === 'jacket' || top === 'hoodie';
        const inSleeve = longSleeve && !!G.ADULT;            // (músculo dentro da manga menor: em alta resolução ele vazava em anéis cor de pele)
        for (const [sd, ga] of [['R', GR.armR], ['L', GR.armL]]) {
            const ua = [];
            if (top === 'tshirt' || top === 'polo' || top === 'uniform' || top === 'jersey') {
                const L = top !== 'uniform' ? -7.0 : -8.2;
                ua.push(new CapCone([0, 0, 3.0], [0, 0, L], 7.1 * (0.55 + 0.45 * ak), 7.4 * (0.55 + 0.45 * ak), S.shirt, { rround: 1.3 }));
            } else if (longSleeve) {
                ua.push(new CapCone([0, 0, 3.0], [0, 0, -13.6], 7.0 * (0.55 + 0.45 * ak), 6.0 * (0.5 + 0.5 * ak), S.shirt, { rround: 1.3 }));
            }
            ua.push(new RoundCone([0, 0, top !== 'tank' ? -3.2 : 0.5], [0, 0, -12.6], 5.9 * ak, 5.0 * ak, S.skin),
                new Ellipsoid([0, 1.0 * ak, -8.6], inSleeve ? [4.3 * ak, 4.6 * ak, 4.4] : [5.2 * ak, 5.6 * ak, 4.8], S.skin, { blend: 1.5 }));
            if (top === 'tank') ua.push(new Sphere([0, 0, 0.5], 6.0 * (0.6 + 0.4 * ak), S.skin, { blend: 2.0 }));
            parts['uarm_' + sd] = new Part('uarm_' + sd, 'uarm_' + sd, ga, ua);
            const fa = [new RoundCone([0, 0, 0.0], [0, 0, -10.8], 5.2 * ak, 4.2 * ak, S.skin), new Ellipsoid([0, 0.4, -3.3], inSleeve ? [4.4 * ak, 4.5 * ak, 4.4] : [5.5 * ak, 5.6 * ak, 5.0], S.skin, { blend: 1.5 })];
            if (longSleeve) fa.push(new CapCone([0, 0, 1.0], [0, 0, -10.9], 6.0 * (0.5 + 0.5 * ak), 5.0 * (0.5 + 0.5 * ak), S.shirt, { rround: 1.0 }));
            if (s.watch && sd === 'L') fa.push(new CapCone([0, 0, -8.2], [0, 0, -10.0], 5.0 * ak, 4.7 * ak, S.gold, { rround: 0.5 }));
            parts['farm_' + sd] = new Part('farm_' + sd, 'farm_' + sd, ga, fa);
            const sx = sd === 'R' ? -1.0 : 1.0, hm = s.gloves ? S.glove : S.skin, hk = 0.55 + 0.45 * ak;
            const hd = [new RoundBox([0, 0.6, -3.6], [3.7 * hk, 4.1 * hk, 4.2 * hk], 2.2 * hk, hm), new Ellipsoid([sx * 1.8 * hk, 3.4 * hk, -1.6], [1.6, 1.8, 2.2], hm, { blend: 0.8 })];
            parts['hand_' + sd] = new Part('hand_' + sd, 'hand_' + sd, ga, hd, texHand);
        }

        // ---------------- mochila / bolsa + alça
        if (s.bag === 'backpack') {
            const R = mm3(Ry(deg(-8)), Rz(deg(-18)));
            parts.bag = new Part('bag', 'chest', GR.bag, [
                new RoundBox([12.4, -13.4, 9.0], [8.6, 5.6, 12.2], 3.4, S.bag, { R }),
                new RoundBox([14.4, -18.8, 4.6], [6.0, 1.7, 5.6], 1.4, S.bag, { R }),
                new RoundBox([12.6, -12.8, 21.8], [3.0, 1.0, 1.4], 0.8, S.strap),
            ], texBag);
            parts.strap = new Part('strap', 'chest', GR.bag, strapPrims(chest, STRAP_R));
        } else if (s.bag === 'pack2') {                                                                                    // mochila nas duas costas, centralizada
            parts.bag = new Part('bag', 'chest', GR.bag, [
                new RoundBox([0, -13.6 * b.td, 9.6], [11.0, 5.4, 12.6], 3.8, S.bag),
                new RoundBox([0, -19.0 * b.td, 5.2], [7.6, 1.8, 6.0], 1.6, S.cargo),
                new RoundBox([0, -13.0 * b.td, 22.4], [3.6, 1.2, 1.6], 0.8, S.strap),
            ], texBag);
            parts.strap = new Part('strap', 'chest', GR.bag, strapPrims(chest, STRAP_R).concat(strapPrims(chest, STRAP_R.map(([x, y, z]) => [-x, y, z]))));
        } else if (s.bag === 'tactical') {                                                                                // mochila tática: grande, com bolsos
            parts.bag = new Part('bag', 'chest', GR.bag, [
                new RoundBox([0, -14.6 * b.td, 9.0], [12.6, 6.6, 14.0], 3.0, S.bag),
                new RoundBox([0, -21.4 * b.td, 5.0], [8.4, 1.8, 6.6], 1.2, S.cargo, { tone: -1 }),
                new RoundBox([13.2, -14.6 * b.td, 5.0], [1.8, 4.8, 6.0], 1.0, S.cargo, { tone: -1, clump: 3 }),
                new RoundBox([-13.2, -14.6 * b.td, 5.0], [1.8, 4.8, 6.0], 1.0, S.cargo, { tone: -1, clump: 4 }),
                new RoundBox([0, -13.4 * b.td, 23.6], [4.0, 1.4, 1.8], 0.8, S.strap),
            ], texBag);
            parts.strap = new Part('strap', 'chest', GR.bag, strapPrims(chest, STRAP_R).concat(strapPrims(chest, STRAP_R.map(([x, y, z]) => [-x, y, z]))));
        } else if (s.bag === 'bau') {                                                                                      // baú de entregador (motoboy): caixa térmica nas costas
            parts.bag = new Part('bag', 'chest', GR.bag, [
                new RoundBox([0, -19.5 * b.td, 12.0], [14.5, 10.0, 13.5], 1.6, S.bag),
                new RoundBox([0, -19.5 * b.td, 25.6], [14.9, 10.4, 0.9], 0.6, S.cargo, { tone: -1 }),                  // tampa
                new RoundBox([0, -29.7 * b.td, 13.0], [8.0, 0.6, 5.0], 0.4, S.cargo, { clump: 5 }),                  // logo atrás
                new RoundBox([0, -11.0 * b.td, 23.0], [4.0, 1.4, 1.6], 0.8, S.strap),
            ], texBag);
            parts.strap = new Part('strap', 'chest', GR.bag, strapPrims(chest, STRAP_R).concat(strapPrims(chest, STRAP_R.map(([x, y, z]) => [-x, y, z]))));
        } else if (s.bag === 'cross') {                                                                                    // bolsa transversal (pochete no peito/quadril)
            parts.bag = new Part('bag', 'chest', GR.bag, [
                new RoundBox([-10.4, 9.4 * b.td, -1.6], [6.4, 3.0, 4.6], 2.2, S.bag, { R: Rz(deg(16)) }),
                new RoundBox([-10.6, 12.0 * b.td, -0.4], [4.0, 0.7, 1.8], 0.5, S.cargo),
            ], texBag);
            parts.strap = new Part('strap', 'chest', GR.bag, strapPrims(chest, CROSS_R));
        }
        // Chave da textura procedural (o que da ficha muda o desenho além das primitivas) — para o cache de partes assadas.
        const tk = { head: [s.eyes, s.gender, s.beard, s.glasses, s.mask], hair: [s.hair], chest: [s.top, s.pattern, s.chain, s.zip], thigh: [s.bottom], shin: [s.bottom], foot: [s.shoes] };
        for (const p of Object.values(parts)) { const k = tk[p.name.replace(/_[RL]$/, "")]; p.texKey = k ? k.join(",") : ""; }
        return parts;
    }

    // Alça sobre o ombro direito, colada na camisa (caminho de pontos projetado na superfície do tronco).
    const STRAP_R = [[11.5, -9.0, 19.0], [12.2, -3.5, 22.0], [12.0, 4.0, 21.2], [11.6, 9.6, 14.5], [11.2, 10.6, 6.5], [11.4, 10.2, -1.5], [15.0, 6.0, -3.5], [16.6, -2.0, -3.0], [15.4, -8.5, -1.0]];
    // Alça transversal: do ombro direito, cruzando o peito até o quadril esquerdo.
    const CROSS_R = [[11.5, -9.0, 19.0], [12.2, -3.5, 22.0], [10.0, 6.0, 20.0], [5.0, 10.6, 14.0], [-1.0, 11.4, 8.0], [-6.5, 11.0, 2.6], [-9.0, 10.4, 0.6]];

    function strapPrims(chestPrims, path) {
        const tmp = new Part('tmp', 'chest', 0, chestPrims), o = {};
        const project = (p, off) => {
            p = p.slice();
            let g = [0, 0, 1];
            for (let it = 0; it < 12; it++) {
                const d = tmp.eval(p[0], p[1], p[2], o);
                g = [0, 0, 0];
                for (let a = 0; a < 3; a++) {
                    const pp = p.slice(), pm = p.slice();
                    pp[a] += 0.05; pm[a] -= 0.05;
                    g[a] = (tmp.eval(pp[0], pp[1], pp[2], o) - tmp.eval(pm[0], pm[1], pm[2], o)) / 0.1;
                }
                g = nrm(g);
                p = V.sub(p, V.mul(g, d - off));
            }
            return [p, g];
        };
        const pts = [], nrms = [];
        for (const p of path) { const [q, g] = project(p, 1.15); pts.push(q); nrms.push(g); }
        const prims = [];
        const seg = (i) => {
            const a = pts[i], b = pts[i + 1], ax = nrm(V.sub(b, a));
            let out = nrm(V.add(nrms[i], nrms[i + 1]));
            out = nrm(V.sub(out, V.mul(ax, V.dot(out, ax))));
            const side = V.cross(ax, out);
            return { a, b, ax, out, R: fromCols(side, ax, out) };
        };
        for (let i = 0; i < pts.length - 1; i++) {
            const { a, b, R } = seg(i);
            prims.push(new RoundBox(V.mul(V.add(a, b), 0.5), [1.9, V.len(V.sub(b, a)) / 2 + 0.9, 0.75], 0.55, M.strap, { R }));
        }
        if (pts.length > 5) {
            const { a, b, out, R } = seg(4), mid = V.add(V.mul(a, 0.55), V.mul(b, 0.45));
            prims.push(new RoundBox(V.add(mid, V.mul(out, 0.6)), [2.3, 1.2, 0.6], 0.4, M.chrome, { R }));                 // fivela
        }
        return prims;
    }

    // ------------------------------------------------------------------ armas e objetos (empunhadura na origem, cano em +y, cima +z)
    function buildProps() {
        const S = M, props = {};
        props.pistol = new Part('pistol', 'weapon', GR.weapon, [
            new RoundBox([0, 4.8, 3.15], [1.95, 7.05, 2.2], 0.75, S.metal, { tone: 1 }),
            new RoundBox([0, 3.0, 0.6], [1.7, 4.0, 1.4], 0.6, S.metal),
            new RoundBox([0, -0.75, -2.4], [1.8, 2.0, 3.9], 0.75, S.metal, { R: Rx(deg(-14)) }),
        ]);
        props.smg = new Part('smg', 'weapon', GR.weapon, [
            new RoundBox([0, 3.6, 1.5], [2.0, 7.8, 2.5], 0.7, S.metal),
            new RoundCone([0, 11.0, 2.4], [0, 19.5, 2.4], 1.1, 1.05, S.metal, { tone: 1 }),
            new RoundBox([0, 12.0, 1.4], [2.2, 3.6, 2.0], 1.0, S.wood),
            new RoundBox([0, 18.2, 3.8], [0.7, 0.7, 1.2], 0.4, S.metal),
            new RoundBox([0, 6.8, -3.2], [1.6, 2.2, 3.5], 0.7, S.metal, { R: Rx(deg(18)) }),
            new RoundBox([0, 8.6, -7.4], [1.6, 2.1, 2.6], 0.7, S.metal, { R: Rx(deg(36)) }),
            new RoundBox([0, -0.2, -2.6], [1.6, 1.6, 3.2], 0.7, S.wood, { R: Rx(deg(-16)) }),
            new RoundBox([0, -6.5, 0.6], [1.8, 4.5, 2.2], 1.0, S.wood, { R: Rx(deg(7)) }),
        ]);
        props.rifle = new Part('rifle', 'weapon', GR.weapon, [                       // fuzil preto (estilo AR)
            new RoundBox([0, 3.0, 1.6], [1.95, 7.5, 2.4], 0.6, S.metal),
            new RoundCone([0, 15.0, 2.2], [0, 26.0, 2.2], 0.95, 0.9, S.metal, { tone: 1 }),
            new RoundBox([0, 14.2, 1.9], [2.2, 4.8, 2.2], 0.9, S.metal, { tone: -1 }),
            new RoundBox([0, 3.0, 4.7], [0.9, 3.2, 0.9], 0.4, S.metal),
            new RoundBox([0, 19.4, 4.3], [0.6, 0.6, 1.4], 0.3, S.metal),
            new RoundBox([0, 6.8, -3.6], [1.5, 2.0, 3.9], 0.6, S.metal, { R: Rx(deg(10)) }),
            new RoundBox([0, -0.2, -2.6], [1.5, 1.5, 3.1], 0.6, S.metal, { R: Rx(deg(-16)) }),
            new RoundBox([0, -7.4, 0.9], [1.7, 4.2, 2.3], 0.9, S.metal, { R: Rx(deg(5)) }),
        ]);
        props.rifle_ak = new Part('rifle_ak', 'weapon', GR.weapon, [                 // fuzil com coronha de madeira (estilo AK)
            new RoundBox([0, 3.6, 1.5], [2.0, 8.2, 2.5], 0.7, S.metal),
            new RoundCone([0, 11.5, 2.4], [0, 25.4, 2.4], 1.0, 0.95, S.metal, { tone: 1 }),
            new RoundBox([0, 13.2, 1.4], [2.2, 4.4, 2.0], 1.0, S.wood),
            new RoundBox([0, 23.6, 3.8], [0.6, 0.6, 1.3], 0.3, S.metal),
            new RoundBox([0, 7.0, -3.3], [1.6, 2.2, 3.6], 0.7, S.metal, { R: Rx(deg(18)) }),
            new RoundBox([0, 8.9, -7.6], [1.6, 2.1, 2.7], 0.7, S.metal, { R: Rx(deg(36)) }),
            new RoundBox([0, -0.2, -2.6], [1.6, 1.6, 3.2], 0.7, S.wood, { R: Rx(deg(-16)) }),
            new RoundBox([0, -8.0, 0.2], [1.8, 5.4, 2.2], 1.0, S.wood, { R: Rx(deg(8)) }),
        ]);
        props.shotgun = new Part('shotgun', 'weapon', GR.weapon, [
            new RoundBox([0, 2.2, 1.5], [2.0, 5.0, 2.45], 0.7, S.metal),
            new RoundCone([0, 6.3, 2.7], [0, 25.0, 2.7], 1.2, 1.2, S.metal, { tone: 1 }),
            new RoundCone([0, 6.3, 0.6], [0, 20.5, 0.6], 1.05, 1.05, S.metal),
            new RoundBox([0, -0.6, -2.2], [1.7, 1.7, 3.1], 0.7, S.wood, { R: Rx(deg(-18)) }),
            new RoundBox([0, -6.6, -0.2], [1.95, 5.0, 2.4], 1.1, S.wood, { R: Rx(deg(9)) }),
        ]);
        props.pump = new Part('pump', 'weapon', GR.pump, [new RoundBox([0, 0.0, 0.0], [2.2, 3.9, 1.75], 0.85, S.wood)]);
        props.bat = new Part('bat', 'weapon', GR.weapon, [
            new RoundCone([0, -3.5, 0], [0, 24.7, 0], 1.25, 2.5, S.batwood),
            new Sphere([0, -4.1, 0], 1.7, S.batwood, { blend: 0.4 }),
        ], texBat);
        props.knife = new Part('knife', 'weapon', GR.weapon, [                        // faca: cabo na mão (origem), lâmina para +y
            new RoundBox([0, -2.2, 0], [0.75, 2.7, 0.95], 0.55, S.tape),
            new RoundBox([0, 0.75, 0], [0.55, 0.38, 1.8], 0.22, S.metal),
            new RoundBox([0, 6.2, -0.2], [0.22, 5.2, 1.15], 0.15, S.chrome),
            new RoundCone([0, 11.0, -0.2], [0, 12.9, 0.5], 0.7, 0.15, S.chrome),
        ]);
        props.baton = new Part('baton', 'weapon', GR.weapon, [                        // cassetete
            new RoundCone([0, -3.6, 0], [0, 17.5, 0], 1.25, 1.15, S.tape),
            new CapCone([0, 3.6, 0], [0, 4.8, 0], 1.6, 1.6, S.metal, { rround: 0.3 }),
            new Sphere([0, -4.0, 0], 1.6, S.tape, { blend: 0.3 }),
        ]);
        props.grenade = new Part('grenade', 'prop', GR.prop, [
            new Ellipsoid([0, 0, 0], [2.8, 2.8, 3.4], S.green),
            new RoundBox([0, 0, 3.5], [1.1, 1.1, 1.1], 0.4, S.metal),
            new RoundBox([0.0, -1.5, 2.2], [0.7, 0.8, 2.2], 0.35, S.chrome, { R: Rx(deg(-15)) }),
        ]);
        // ---- objetos novos (animações do jogo)
        props.knife = new Part('knife', 'weapon', GR.weapon, [                        // faca (assalto de rua)
            new RoundBox([0, -0.2, 0], [1.3, 2.6, 1.6], 0.6, S.tape),
            new RoundBox([0, 2.8, 0], [1.9, 0.5, 1.9], 0.3, S.metal),
            new RoundBox([0, 7.0, 0.2], [0.4, 4.0, 1.3], 0.3, S.chrome, { tone: 1 }),
        ]);
        props.wallet = new Part('wallet', 'prop', GR.prop, [new RoundBox([0, 0, 0], [3.0, 0.9, 2.2], 0.6, S.batwood)]);
        props.phone = new Part('phone', 'prop', GR.prop, [new RoundBox([0, 0, 0], [1.8, 0.6, 3.4], 0.5, S.tape), new RoundBox([0, 0.5, 0.2], [1.4, 0.2, 2.8], 0.2, S.lens)]);
        props.pick = new Part('pick', 'prop', GR.prop, [new RoundCone([0, -1.5, 0], [0, 5.5, 0], 0.4, 0.3, S.chrome), new RoundBox([0, -2.4, 0], [1.0, 1.0, 1.0], 0.4, S.tape)]);
        props.briefcase = new Part('briefcase', 'prop', GR.prop, [                    // maleta (alça em cima)
            new RoundBox([0, 0, -6.6], [2.6, 9.0, 6.0], 1.0, S.cargo),
            new RoundBox([0, 0, -0.4], [0.7, 2.8, 0.9], 0.4, S.cargo),
            new RoundBox([0, 3.2, -1.2], [2.8, 0.7, 0.7], 0.3, S.gold),
        ]);
        props.duffel = new Part('duffel', 'prop', GR.prop, [                          // bolsa de academia / sacola
            new RoundCone([0, -9.0, -6.6], [0, 9.0, -6.6], 5.2, 5.2, S.cargo),
            new RoundBox([0, 0, -0.6], [0.8, 4.6, 1.0], 0.5, S.strap),
            new RoundCone([0, -9.2, -6.6], [0, -9.8, -6.6], 3.2, 3.2, S.strap),
        ], texBag);
        props.suitcase = new Part('suitcase', 'prop', GR.prop, [                      // mala de rodinhas (puxada)
            new RoundBox([0, 0, -10.0], [4.4, 10.0, 13.0], 1.8, S.cargo),
            new RoundCone([0, -9.0, 0.0], [0, -9.0, 4.0], 0.5, 0.5, S.metal), new RoundCone([0, 9.0, 0.0], [0, 9.0, 4.0], 0.5, 0.5, S.metal),
            new RoundCone([0, -9.0, 4.0], [0, 9.0, 4.0], 0.7, 0.7, S.tape),
            new Sphere([2.2, -8.6, -23.4], 1.4, S.tape), new Sphere([2.2, 8.6, -23.4], 1.4, S.tape),
        ]);
        props.sack = new Part('sack', 'prop', GR.prop, [                              // carga pesada nas costas (fardo)
            new Ellipsoid([0, 0, 0], [15.0, 9.5, 13.0], S.cargo),
            new Ellipsoid([0, 0, 10.5], [6.0, 4.2, 4.0], S.strap, { blend: 2.0 }),
        ], texBag);
        props.umbrella = new Part('umbrella', 'prop', GR.prop, [
            new RoundCone([0, 0, -14.0], [0, 0, 22.0], 0.5, 0.5, S.metal),
            new Ellipsoid([0, 0, 22.0], [24.0, 24.0, 7.5], S.accent2),
            new Ellipsoid([0, 0, 19.5], [24.2, 24.2, 6.0], S.accent2, { sub: true, blend: 0.5 }),
            new RoundCone([0, 0, -14.0], [0, 3.0, -16.5], 0.6, 0.6, S.tape),
        ]);
        props.blood = new Part('blood', 'prop', GR.prop, [new Ellipsoid([0, 0, 0], [22.0, 17.0, 0.5], S.flesh), new Ellipsoid([16.0, 10.0, 0], [9.0, 6.0, 0.5], S.flesh, { blend: 2.0 }), new Ellipsoid([-14.0, -12.0, 0], [7.0, 5.0, 0.5], S.flesh, { blend: 2.0 })]);
        return props;
    }

    const PROP_MUZZLE = { pistol: [0, 12.0, 3.15], smg: [0, 20.2, 2.4], shotgun: [0, 25.8, 2.7], rifle: [0, 26.8, 2.2], rifle_ak: [0, 26.2, 2.4] };
    // empunhadura (centro do punho direito) e apoio (punho esquerdo)
    const PROP_GRIP = {
        pistol: [[0, -0.3, -1.2], [-3.4, 0.6, -1.6]],
        smg: [[0, 0.0, -1.4], [0, 12.0, -0.9]],
        rifle: [[0, 0.0, -1.4], [0, 14.2, -0.9]],
        rifle_ak: [[0, 0.0, -1.4], [0, 13.2, -0.9]],
        shotgun: [[0, -0.3, -1.1], [0, 13.3, -1.2]],
        bat: [[0, 0.7, 0], [0, -2.8, 0]],
        baton: [[0, 0.0, 0], [0, -2.8, 0]],
        knife: [[0, 0.0, 0], [0, 0, 0]],
    };
    const PUMP_Y = 13.3, PUMP_TRAVEL = 4.5;

    // ------------------------------------------------------------------ fichas dos NPCs (npcs.py) + as novas
    const CIVIL = { bag: null, eyes: 'neutral', body: 'normal', group: 'Civis' };
    const ROSTER = [
        // ---- civis
        Object.assign({}, CIVIL, { id: 'civil_trabalhador', label: 'Trabalhador', skin: 'pele_parda', hair: 'short', hair_color: 'preto', top: 'tshirt', top_color: 'laranja', bottom: 'jeans', bottom_color: 'jeans', shoes: 'boots', shoe_color: 'couro_marrom', sole_color: 'sola_escura', beard: 'mustache', scale: 1.0 }),
        Object.assign({}, CIVIL, { id: 'civil_senhor', label: 'Senhor de camisa social', skin: 'pele_clara', hair: 'bald', hair_color: 'grisalho', top: 'social', top_color: 'azul_claro', accent: 'branco', bottom: 'pants', bottom_color: 'bege', shoes: 'dress', shoe_color: 'couro_marrom', sole_color: 'sola_escura', body: 'heavy', beard: 'mustache', scale: 0.97 }),
        Object.assign({}, CIVIL, { id: 'civil_praia', label: 'Garota da praia', gender: 'f', skin: 'pele_morena', hair: 'long', hair_color: 'castanho', top: 'tank', top_color: 'amarelo', bottom: 'shorts', bottom_color: 'jeans_claro', shoes: 'flipflop', shoe_color: 'rosa', sole_color: 'verde', body: 'slim', scale: 0.95 }),
        Object.assign({}, CIVIL, { id: 'civil_executiva', label: 'Executiva', gender: 'f', skin: 'pele_negra', hair: 'bun', hair_color: 'preto', top: 'social', top_color: 'branco', accent: 'branco', bottom: 'pants', bottom_color: 'roupa_preta', shoes: 'dress', shoe_color: 'couro_preto', sole_color: 'sola_escura', body: 'slim', scale: 0.96 }),
        Object.assign({}, CIVIL, { id: 'civil_turista', label: 'Turista', skin: 'pele_clara', hair: 'short', hair_color: 'loiro', head: 'cap', hat_color: 'azul', glasses: true, top: 'tshirt', top_color: 'azul_claro', pattern: 'floral', accent: 'vermelho', accent2: 'amarelo', bottom: 'shorts', bottom_color: 'bege', shoes: 'sneaker', shoe_color: 'tenis_branco', sole_color: 'tenis_branco', body: 'heavy', scale: 1.0 }),
        Object.assign({}, CIVIL, { id: 'civil_estudante', label: 'Estudante', skin: 'pele_parda', hair: 'curly', hair_color: 'preto', top: 'tshirt', top_color: 'verde', bottom: 'jeans', bottom_color: 'jeans', shoes: 'sneaker', shoe_color: 'tenis_vermelho', sole_color: 'tenis_branco', bag: 'backpack', body: 'slim', scale: 0.97 }),
        Object.assign({}, CIVIL, { id: 'civil_ambulante', label: 'Ambulante', skin: 'pele_negra', hair: 'short', hair_color: 'preto', head: 'cap', hat_color: 'vermelho', top: 'tshirt', top_color: 'amarelo', bottom: 'shorts', bottom_color: 'jeans', shoes: 'flipflop', shoe_color: 'azul', sole_color: 'azul_claro', beard: 'goatee', scale: 1.0 }),
        Object.assign({}, CIVIL, { id: 'civil_black_power', label: 'Moça black power', gender: 'f', skin: 'pele_negra', hair: 'afro', hair_color: 'preto', top: 'tshirt', top_color: 'vermelho', bottom: 'jeans', bottom_color: 'jeans_escuro', shoes: 'sneaker', shoe_color: 'tenis_branco', sole_color: 'tenis_branco', scale: 0.96 }),
        Object.assign({}, CIVIL, { id: 'civil_entregador', label: 'Entregador', skin: 'pele_morena', hair: 'short', hair_color: 'preto', head: 'beanie', hat_color: 'cinza', top: 'jacket', top_color: 'vermelho', bottom: 'jeans', bottom_color: 'jeans_escuro', shoes: 'sneaker', shoe_color: 'tenis_preto', sole_color: 'tenis_branco', beard: 'beard', scale: 1.01 }),
        Object.assign({}, CIVIL, { id: 'civil_torcedor', label: 'Torcedor', skin: 'pele_pessego', hair: 'short', hair_color: 'castanho', top: 'tshirt', top_color: 'verde', pattern: 'stripes_v', accent: 'branco', bottom: 'shorts', bottom_color: 'roupa_preta', shoes: 'flipflop', shoe_color: 'branco', sole_color: 'roupa_preta', body: 'heavy', beard: 'beard', scale: 1.02 }),
        // ---- civis novos (lugares do jogo: praia, corrida, escritório)
        Object.assign({}, CIVIL, { id: 'civil_banhista', label: 'Banhista', skin: 'pele_morena', hair: 'buzz', hair_color: 'preto', top: 'tank', top_color: 'pele_morena', bottom: 'shorts', bottom_color: 'azul', shoes: 'flipflop', shoe_color: 'amarelo', sole_color: 'azul', body: 'muscular', scale: 1.0 }),
        Object.assign({}, CIVIL, { id: 'civil_corredora', label: 'Corredora', gender: 'f', skin: 'pele_clara', hair: 'ponytail', hair_color: 'ruivo', accent2: 'turquesa', top: 'tank', top_color: 'turquesa', bottom: 'shorts', bottom_color: 'roupa_preta', shoes: 'sneaker', shoe_color: 'tenis_branco', sole_color: 'tenis_branco', body: 'slim', scale: 0.95 }),
        Object.assign({}, CIVIL, { id: 'civil_executivo', label: 'Executivo', skin: 'pele_parda', hair: 'short', hair_color: 'preto', top: 'jacket', top_color: 'marinho', bottom: 'pants', bottom_color: 'marinho', shoes: 'dress', shoe_color: 'couro_preto', sole_color: 'sola_escura', glasses: false, belt: true, body: 'normal', scale: 1.01 }),
        // ---- polícia
        { id: 'pm_policial', label: 'Policial militar', group: 'Polícia', skin: 'pele_negra', hair: 'buzz', hair_color: 'preto', eyes: 'neutral', head: 'police_cap', hat_color: 'pm_calca', top: 'uniform', top_color: 'pm_camisa', bottom: 'pants', bottom_color: 'pm_calca', shoes: 'boots', shoe_color: 'couro_preto', sole_color: 'sola_escura', vest: 'police', vest_color: 'tatico', bag: null, body: 'muscular', scale: 1.03 },
        { id: 'pm_policial_f', label: 'Policial militar (fem.)', group: 'Polícia', gender: 'f', skin: 'pele_parda', hair: 'ponytail', hair_color: 'preto', accent2: 'roupa_preta', eyes: 'neutral', head: 'cap', hat_color: 'pm_calca', top: 'uniform', top_color: 'pm_camisa', bottom: 'pants', bottom_color: 'pm_calca', shoes: 'boots', shoe_color: 'couro_preto', sole_color: 'sola_escura', vest: 'police', vest_color: 'tatico', bag: null, body: 'normal', scale: 0.98 },
        // ---- BOPE
        { id: 'bope_capacete', label: 'BOPE (capacete)', group: 'BOPE', skin: 'pele_morena', hair: 'buzz', hair_color: 'preto', eyes: 'angry', head: 'helmet', hat_color: 'tatico', glasses: true, top: 'uniform_long', top_color: 'tatico', bottom: 'pants', bottom_color: 'tatico', shoes: 'boots', shoe_color: 'couro_preto', sole_color: 'sola_escura', vest: 'tactical', vest_color: 'roupa_preta', gloves: true, bag: null, body: 'muscular', rifle: 'rifle', scale: 1.04 },
        { id: 'bope_touca', label: 'BOPE (touca ninja)', group: 'BOPE', skin: 'pele_clara', hair: 'bald', eyes: 'angry', mask: 'balaclava', head: 'beret', hat_color: 'roupa_preta', top: 'uniform_long', top_color: 'tatico', bottom: 'pants', bottom_color: 'tatico', shoes: 'boots', shoe_color: 'couro_preto', sole_color: 'sola_escura', vest: 'tactical', vest_color: 'roupa_preta', gloves: true, bag: null, body: 'muscular', rifle: 'rifle', scale: 1.03 },
        // ---- Exército (novo)
        { id: 'exercito', label: 'Soldado do Exército', group: 'Exército', skin: 'pele_parda', hair: 'buzz', hair_color: 'preto', eyes: 'angry', head: 'helmet', hat_color: 'camuflado', top: 'uniform_long', top_color: 'camuflado', bottom: 'pants', bottom_color: 'camuflado', shoes: 'boots', shoe_color: 'couro_preto', sole_color: 'sola_escura', vest: 'tactical', vest_color: 'oliva', gloves: true, bag: null, body: 'muscular', rifle: 'rifle', scale: 1.03 },
        // ---- traficantes
        { id: 'trafic_fuzil', label: 'Traficante (fuzil)', group: 'Traficantes', skin: 'pele_parda', hair: 'short', hair_color: 'preto', eyes: 'angry', head: 'cap_back', hat_color: 'roupa_preta', top: 'tank', top_color: 'branco', chain: true, bottom: 'shorts', bottom_color: 'jeans', shoes: 'flipflop', shoe_color: 'branco', sole_color: 'roupa_preta', bag: null, body: 'slim', rifle: 'rifle_ak', scale: 1.0 },
        { id: 'trafic_pistola', label: 'Traficante (pistola)', group: 'Traficantes', skin: 'pele_clara', hair: 'buzz', hair_color: 'loiro', eyes: 'angry', glasses: true, top: 'jersey', top_color: 'azul', pattern: 'jersey', accent: 'amarelo', accent2: 'branco', chain: true, bottom: 'shorts', bottom_color: 'roupa_preta', shoes: 'sneaker', shoe_color: 'tenis_vermelho', sole_color: 'tenis_branco', bag: null, body: 'normal', scale: 0.99 },
        { id: 'trafic_mascarado', label: 'Traficante (mascarado)', group: 'Traficantes', skin: 'pele_negra', hair: 'short', hair_color: 'preto', eyes: 'angry', head: 'cap', hat_color: 'verde', mask: 'bandana', accent: 'vermelho', top: 'tshirt', top_color: 'roupa_preta', bottom: 'jeans', bottom_color: 'jeans_escuro', shoes: 'sneaker', shoe_color: 'tenis_preto', sole_color: 'tenis_branco', bag: null, body: 'muscular', rifle: 'rifle_ak', scale: 1.02 },
    ];
    const BY_ID = {};
    for (const r of ROSTER) BY_ID[r.id] = r;

    // ------------------------------------------------------------------ assar personagem + objetos (com cache por ficha/espaçamento)
    const _propCache = new Map();
    // Objetos maiores no corpo adulto (as armas do pacote eram do tamanho do boneco chibi): escala em volta da empunhadura.
    const propK = (name) => (G.ADULT ? (name === 'blood' ? 1.35 : 1.2) : 1);
    const propPivot = (name) => (PROP_GRIP[name] ? PROP_GRIP[name][0] : [0, 0, 0]);
    function bakeProps(spacing) {
        const k = spacing.toFixed(4) + '|' + propK('x');
        if (!_propCache.has(k)) {
            const out = {};
            for (const [name, p] of Object.entries(buildProps())) {
                const s = propK(name);
                if (s === 1) { out[name] = bake(p, spacing); continue; }
                const b = bake(p, spacing / s), g = propPivot(name);
                for (let i = 0; i < b.n * 3; i++) b.pos[i] = g[i % 3] + (b.pos[i] - g[i % 3]) * s;
                out[name] = b;
            }
            _propCache.set(k, out);
        }
        return _propCache.get(k);
    }
    // Parte já assada com as mesmas primitivas e textura = reaproveitada (trocar o tênis do jogador só refaz os pés).
    const _partCache = new Map();
    function bakeCached(part, spacing) {
        const sh = shapeFor(part.bone);
        const sig = part.name + "|" + spacing.toFixed(4) + "|" + (part.texKey || "") + "|" + (sh ? sh.join(",") : "") + "|" + JSON.stringify(part.prims, (k, v) => (k === "_prep" ? undefined : v));
        let b = _partCache.get(sig);
        if (b) return b;
        // (esticada: assa mais denso ao longo do osso para não abrir buracos; encolhida: menos denso — sai na mesma densidade)
        b = sh ? reshape(bake(part, spacing / Math.max(sh[0], sh[1], sh[2])), sh) : bake(part, spacing);
        _partCache.set(sig, b);
        if (_partCache.size > 160) _partCache.delete(_partCache.keys().next().value);
        return b;
    }
    // spacing: 0,2 na escala 1,04 (PNGs originais). Os objetos usam 80% dele (0,16 no original).
    // Com a malha 3D (NpcGenMesh): o corpo (e o cabelo, nos estilos que ela tem) vem dela; chapéu, colete, bolsa e os cabelos que
    // só existem geométricos continuam assados das formas.
    function loadBaked(spec, spacing = 0.2) {
        const s = fullSpec(spec), body = {};
        const mp = G.meshUsable && G.meshUsable(s) ? G.meshParts(s, spacing) : null;
        for (const [k, p] of Object.entries(buildParts(s))) {
            if (mp && (G.MESH_REPLACED.has(k) || (k === 'hair' && mp.hairMesh))) { if (mp.parts[k]) body[k] = mp.parts[k]; continue; }
            body[k] = bakeCached(p, spacing);
            if (k === 'hair' && (s.dmg | 0) >= 3 && G.paintHairBlood) {               // muito machucado: sangue no cabelo (numa cópia: o assado fica no cache)
                const h = body[k], c = Object.assign({}, h, { mat: new Int16Array(h.mat), tone: new Int8Array(h.tone) });
                G.paintHairBlood(s, c.pos, c.nrm, c.mat, c.tone, c.n);
                body[k] = c;
            }
        }
        if (mp) for (const k of Object.keys(mp.parts)) if (!body[k]) body[k] = mp.parts[k];
        return { body, props: bakeProps(spacing * 0.8) };
    }

    Object.assign(G, {
        M, PAL, OUTLINE, SHADOW_RGBA, GR, SKEL, UPPER, LOWER, FIST, THIGH, SHIN, ANKLE_H, ADULT, shapeFor, DEFAULT, BODY, fullSpec, bodyFactors, rigFor, rampsFor,
        buildParts, buildProps, PROP_MUZZLE, PROP_GRIP, PUMP_Y, PUMP_TRAVEL, ROSTER, BY_ID, loadBaked, bakeProps, propK, propPivot, HAT_CUT,
    });
    return G;
}
