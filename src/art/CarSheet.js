// ============================================================================
// Carros como sprites pré-renderizados vistos de cima (mesmo baker e mesmo visual do
// personagem), em 32 direções e várias pinturas (paleta).
//
//   CarSheet.MODELS  catálogo: dimensões, física e desempenho de cada modelo
//   CarSheet         folha de sprites de UM modelo (interface igual à CharacterSheet:
//                    frame, dirs, getClip) — funciona com o SpriteActor
//   CarLibrary       paleta + folhas de todos os modelos (bake preguiçoso por modelo)
//
// O corpo 3D do carro continua existindo por baixo (física, sombra do mapa e
// laterais visíveis pela perspectiva); o sprite desenha a "pele" pixel art por cima.
// ============================================================================

class CarSheet {
    // Slots de rampa: pintura, pintura 2 (detalhe), vidro, escuro/pneus, cromado, farol, lanterna, letreiro.
    static get SLOT() { return { paint: 1, paint2: 2, glass: 3, dark: 4, chrome: 5, head: 6, tail: 7, sign: 8, seat: 9, trim: 10 }; }

    // Pinturas (linha da paleta). paint2 = detalhe (faixa branca nas viaturas).
    static get PAINTS() {
        return [
            { name: 'vermelho', paint: '#d93a30', paint2: '#d93a30' },
            { name: 'azul', paint: '#2f6fd0', paint2: '#2f6fd0' },
            { name: 'taxi', paint: '#f0c020', paint2: '#f0c020' },
            { name: 'verde', paint: '#2f9a5a', paint2: '#2f9a5a' },
            { name: 'branco', paint: '#e8eaf0', paint2: '#e8eaf0' },
            { name: 'preto', paint: '#2a2c33', paint2: '#2a2c33' },
            { name: 'viatura', paint: '#1d2748', paint2: '#eef0f6' },
            { name: 'laranja', paint: '#e8742c', paint2: '#e8742c' },
            { name: 'prata', paint: '#aeb4bd', paint2: '#aeb4bd' },
            { name: 'bordo', paint: '#7a1f36', paint2: '#7a1f36' },
            // Só das forças especiais (o trânsito civil nunca sorteia estas): 10 = SWAT, 11 = exército.
            { name: 'swat', paint: '#181a20', paint2: '#c8ced8' },
            { name: 'militar', paint: '#566338', paint2: '#3d4726' },
            // 12 = carcaça carbonizada (depois da explosão): tudo preto/cinza, vidros e faróis apagados.
            { name: 'carbonizado', paint: '#27221f', paint2: '#2d2824', seat: '#1d1a18', trim: '#2a2522', glass: '#0b0b0e', chrome: '#4a433e', head: '#2d2a27', tail: '#2d2723', sign: '#3a3530' },
            // 13..18: carros VELHOS (tinta desbotada, vidro sujo, cromado fosco) — favela e estradas de terra. O trânsito sorteia estas por lugar.
            { name: 'ferrugem', paint: '#8a5a3a', paint2: '#8a5a3a', glass: '#2f3a42', chrome: '#8d9296', head: '#d8cc98', tail: '#6a2a2a' },
            { name: 'vermelho velho', paint: '#a8453c', paint2: '#a8453c', glass: '#2f3a42', chrome: '#8d9296', head: '#d8cc98', tail: '#6a2a2a' },
            { name: 'azul fosco', paint: '#4a6a98', paint2: '#4a6a98', glass: '#2f3a42', chrome: '#8d9296', head: '#d8cc98', tail: '#6a2a2a' },
            { name: 'verde musgo', paint: '#5a7a58', paint2: '#5a7a58', glass: '#2f3a42', chrome: '#8d9296', head: '#d8cc98', tail: '#6a2a2a' },
            { name: 'bege', paint: '#b9a98a', paint2: '#b9a98a', glass: '#2f3a42', chrome: '#8d9296', head: '#d8cc98', tail: '#6a2a2a' },
            { name: 'cinza chapa', paint: '#7c8085', paint2: '#7c8085', glass: '#2f3a42', chrome: '#8d9296', head: '#d8cc98', tail: '#6a2a2a' },
            // 19..39: cores de fÃ¡brica novas (metÃ¡licas, perola, vivas) para a variedade dos 22 modelos. paint2 = detalhe (teto/listras).
            { name: 'grafite', paint: '#4c5058', paint2: '#33363c' },
            { name: 'azul marinho', paint: '#1c2f5e', paint2: '#14203f' },
            { name: 'verde floresta', paint: '#1f5a3a', paint2: '#163f29' },
            { name: 'champanhe', paint: '#c8b68e', paint2: '#a8966d' },
            { name: 'azul ceu', paint: '#5ea8dc', paint2: '#3d86bd' },
            { name: 'amarelo', paint: '#f0cf2a', paint2: '#2a2a2a' },
            { name: 'roxo', paint: '#5b3b8c', paint2: '#3f2766' },
            { name: 'branco perola', paint: '#f6f3ec', paint2: '#cfcabd' },
            { name: 'preto brilhante', paint: '#15161a', paint2: '#c0262d' },
            { name: 'vermelho italiano', paint: '#d7141a', paint2: '#f4f1e8' },
            { name: 'amarelo touro', paint: '#f7d600', paint2: '#16161a' },
            { name: 'verde acido', paint: '#5fd02a', paint2: '#16161a' },
            { name: 'laranja solar', paint: '#ff7a00', paint2: '#16161a' },
            { name: 'azul eletrico', paint: '#1e56c8', paint2: '#f4f1e8' },
            { name: 'prata gelo', paint: '#b9bec6', paint2: '#7d838d' },
            { name: 'rosa retro', paint: '#e8508f', paint2: '#f6f3ec' },
            { name: 'turquesa retro', paint: '#2cb5a8', paint2: '#f6f3ec' },
            { name: 'bege retro', paint: '#d9cba3', paint2: '#f6f3ec' },
            { name: 'verde retro', paint: '#6e9a7a', paint2: '#f6f3ec' },
            { name: 'cobre', paint: '#b5651d', paint2: '#8a4a12' },
            { name: 'vinho perolado', paint: '#5c1230', paint2: '#3f0b20' },
        ];
    }

    // Pontos de referência de cada modelo para colocar os amassados (z: eixo do carro, + = frente):
    // topY altura do capô/porta-malas | hood/trunk/roof/ws/rw = [z0, z1] de capô, porta-malas, teto, para-brisa,
    // vidro traseiro | roofY altura do teto | glassY altura do vidro | lampY altura dos faróis.
    // Os 7 modelos originais têm zonas explícitas; os novos derivam de `ZONES` (ver zones()).
    static get PARTS() {
        if (CarSheet._parts) return CarSheet._parts;
        const sedan = { topY: 1.0, hood: [1.0, 2.12], trunk: [-2.12, -1.4], roofY: 1.42, roof: [-0.85, 0.45], ws: [0.52, 0.92], rw: [-1.22, -0.92], glassY: 1.31, lampY: 0.8 };
        const out = {
            sedan, taxi: sedan,
            hatch:  { topY: 0.94, hood: [1.1, 1.8], trunk: [-1.8, -1.42], roofY: 1.38, roof: [-1.0, 0.68], ws: [0.7, 1.08], rw: [-1.32, -1.0], glassY: 1.27, lampY: 0.8 },
            suv:    { topY: 1.1, hood: [1.25, 2.3], trunk: [-2.3, -1.65], roofY: 1.64, roof: [-1.25, 0.75], ws: [0.77, 1.2], rw: [-1.6, -1.27], glassY: 1.47, lampY: 0.9 },
            pickup: { topY: 1.06, hood: [1.2, 2.45], trunk: null, roofY: 1.5, roof: [0.0, 1.0], ws: [1.02, 1.17], rw: null, glassY: 1.41, lampY: 0.82 },
            van:    { topY: 1.17, hood: [2.25, 2.55], trunk: null, roofY: 1.95, roof: [-2.3, 1.6], ws: [1.62, 2.18], rw: null, glassY: 1.46, lampY: 0.9 },
            sports: { topY: 0.76, hood: [0.55, 2.1], trunk: [-2.1, -1.2], roofY: 1.17, roof: [-0.88, 0.12], ws: [0.14, 0.45], rw: [-1.15, -0.9], glassY: 1.07, lampY: 0.62 },
        };
        // Novos: topY, roofY, lampY + wsEnd (fim do para-brisa, junto ao capô), wsLen, roofLen, rwLen; sem rwLen = picape (cabine sem vidro traseiro).
        const Z = {
            hatch2:  { topY: 0.95, roofY: 1.42, lampY: 0.8, wsEnd: 0.85, wsLen: 0.42, roofLen: 1.0, rwLen: 0.28 },
            hatch3:  { topY: 0.93, roofY: 1.36, lampY: 0.78, wsEnd: 0.95, wsLen: 0.45, roofLen: 1.05, rwLen: 0.3 },
            sedan2:  { topY: 0.98, roofY: 1.4, lampY: 0.8, wsEnd: 0.9, wsLen: 0.4, roofLen: 1.2, rwLen: 0.32 },
            sedan3:  { topY: 1.02, roofY: 1.45, lampY: 0.84, wsEnd: 1.05, wsLen: 0.45, roofLen: 1.5, rwLen: 0.34 },
            sedan4:  { topY: 0.97, roofY: 1.38, lampY: 0.78, wsEnd: 0.92, wsLen: 0.4, roofLen: 1.15, rwLen: 0.3 },
            suv2:    { topY: 1.05, roofY: 1.58, lampY: 0.86, wsEnd: 0.98, wsLen: 0.42, roofLen: 1.25, rwLen: 0.3 },
            suv3:    { topY: 1.15, roofY: 1.7, lampY: 0.94, wsEnd: 1.15, wsLen: 0.48, roofLen: 1.7, rwLen: 0.32 },
            suv4:    { topY: 1.15, roofY: 1.72, lampY: 0.94, wsEnd: 1.0, wsLen: 0.35, roofLen: 1.45, rwLen: 0.2 },
            sports2: { topY: 0.8, roofY: 1.2, lampY: 0.64, wsEnd: 0.5, wsLen: 0.45, roofLen: 0.85, rwLen: 0.6 },
            super1:  { topY: 0.6, roofY: 0.98, lampY: 0.5, wsEnd: 0.65, wsLen: 0.5, roofLen: 0.55, rwLen: 0.3 },
            super2:  { topY: 0.55, roofY: 0.93, lampY: 0.46, wsEnd: 0.75, wsLen: 0.55, roofLen: 0.5, rwLen: 0.28 },
            van2:    { topY: 1.05, roofY: 1.7, lampY: 0.84, wsEnd: 1.35, wsLen: 0.6, roofLen: 2.2, rwLen: 0.3 },
            van3:    { topY: 1.0, roofY: 1.7, lampY: 0.84, wsEnd: 1.55, wsLen: 0.35, roofLen: 2.2, rwLen: 0.1 },
        };
        for (const id of Object.keys(Z)) {
            const z = Z[id], hl = CarSheet.MODELS[id].len / 2;
            const ws = [z.wsEnd - z.wsLen, z.wsEnd], roof = [ws[0] - z.roofLen, ws[0]], rw = [roof[0] - z.rwLen, roof[0]];
            out[id] = { topY: z.topY, hood: [z.wsEnd + 0.08, hl - 0.08], trunk: [-hl + 0.08, rw[0] - 0.18], roofY: z.roofY, roof, ws, rw, glassY: z.roofY - 0.11, lampY: z.lampY };
        }
        out.pickup2 = { topY: 1.05, hood: [1.28, 2.52], trunk: null, roofY: 1.52, roof: [0.0, 1.0], ws: [1.0, 1.2], rw: null, glassY: 1.41, lampY: 0.84 };
        out.pickup3 = { topY: 1.1, hood: [1.28, 2.47], trunk: null, roofY: 1.56, roof: [0.0, 1.0], ws: [1.0, 1.2], rw: null, glassY: 1.45, lampY: 0.88 };
        return (CarSheet._parts = out);
    }

    // Aparência de cada modelo (o resto vem de PARTS/MODELS). hy = meia-altura da carroceria | wz = recuo das rodas | flare = bojo dos
    // para-lamas | nose = estreitamento do nariz | bev = arredondado | grille/lamps/roof = estilos | extras = peças opcionais.
    static get STYLE() {
        if (CarSheet._style) return CarSheet._style;
        const T = { hy: 0.45, wz: 0.75, flare: 0.18, nose: 0.15, bev: 0.42, grille: 'plain', lamps: 'std', roof: 'solid', extras: [] };
        const S = (o) => Object.assign({}, T, o);
        return (CarSheet._style = {
            sedan:   S({ extras: ['trunkLip', 'sideStripe'] }),
            taxi:    S({ extras: ['taxiSign'] }),
            hatch:   S({ hy: 0.42, wz: 0.62, extras: ['roofLip'] }),
            hatch2:  S({ hy: 0.43, wz: 0.55, flare: 0.14, nose: 0.1, bev: 0.5, lamps: 'round', extras: [] }),
            hatch3:  S({ hy: 0.41, wz: 0.64, flare: 0.2, lamps: 'slim', grille: 'wide', extras: ['roofLip', 'spoilerSmall', 'hoodVents'] }),
            sedan2:  S({ hy: 0.43, wz: 0.72, lamps: 'slim', extras: ['trunkLip', 'chromeSide'] }),
            sedan3:  S({ hy: 0.46, wz: 0.85, flare: 0.16, nose: 0.12, grille: 'chromeBig', lamps: 'quad', roof: 'pano', extras: ['trunkLip', 'chromeSide'] }),
            sedan4:  S({ hy: 0.42, wz: 0.74, flare: 0.22, grille: 'wide', lamps: 'slim', extras: ['spoilerBig', 'hoodScoop', 'hoodVents'] }),
            suv:     S({ hy: 0.5, wz: 0.8, extras: ['rails'] }),
            suv2:    S({ hy: 0.47, wz: 0.7, flare: 0.17, lamps: 'slim', extras: ['rails', 'roofLip'] }),
            suv3:    S({ hy: 0.52, wz: 0.9, flare: 0.16, nose: 0.12, grille: 'chromeBig', lamps: 'quad', roof: 'pano', extras: ['rails', 'chromeSide'] }),
            suv4:    S({ hy: 0.52, wz: 0.7, flare: 0.2, nose: 0.05, bev: 0.3, grille: 'slots', lamps: 'round', extras: ['rails', 'spare', 'snorkel'] }),
            sports:  S({ hy: 0.34, wz: 0.7, flare: 0.24, nose: 0.2, grille: 'kidney', lamps: 'slim', extras: ['stripes', 'spoilerBig', 'hoodVents'] }),
            sports2: S({ hy: 0.36, wz: 0.64, flare: 0.25, nose: 0.22, bev: 0.5, lamps: 'round', roof: 'fast', extras: ['ducktail', 'engineLid'] }),
            super1:  S({ hy: 0.3, wz: 0.8, flare: 0.28, nose: 0.34, bev: 0.5, grille: 'wide', lamps: 'slim', roof: 'fast', extras: ['engineDeck', 'sideIntake', 'spoilerBig'] }),
            super2:  S({ hy: 0.28, wz: 0.82, flare: 0.3, nose: 0.4, bev: 0.18, grille: 'wide', lamps: 'wy', roof: 'fast', extras: ['engineDeck', 'sideIntake', 'hex', 'spoilerBig'] }),
            pickup:  { base: 'pickup', hy: 0.48, wz: 0.8, flare: 0.14, nose: 0.12, bev: 0.4, grille: 'chromeBig', lamps: 'std', roof: 'solid', extras: ['hoodScoop'] },
            pickup2: { base: 'pickup', hy: 0.48, wz: 0.8, flare: 0.16, nose: 0.12, bev: 0.4, grille: 'plain', lamps: 'slim', roof: 'solid', extras: ['bedCover'] },
            pickup3: { base: 'pickup', hy: 0.5, wz: 0.8, flare: 0.22, nose: 0.1, bev: 0.35, grille: 'slots', lamps: 'round', roof: 'solid', extras: ['lightbar', 'bullbar', 'hoodVents', 'rollbar'] },
            van:     { base: 'van', hy: 0.55, wz: 0.85, flare: 0.14, nose: 0.12, bev: 0.5, grille: 'plain', lamps: 'std', roof: 'solid', extras: [] },
            van2:    S({ hy: 0.45, wz: 0.9, flare: 0.14, nose: 0.15, bev: 0.5, lamps: 'slim', roof: 'pano', extras: ['sliding', 'rails'] }),
            van3:    S({ hy: 0.5, wz: 0.75, flare: 0.12, nose: 0.28, bev: 0.5, grille: 'vee', lamps: 'round', roof: 'twoTone', extras: ['sliding'] }),
        });
    }

    // Classes de trânsito: o TrafficManager sorteia a classe pelo lugar e a CarLibrary escolhe um dos modelos dela.
    static get CLASSES() {
        return {
            hatch: ['hatch', 'hatch2', 'hatch3'], sedan: ['sedan', 'sedan2', 'sedan3', 'sedan4'], suv: ['suv', 'suv2', 'suv3', 'suv4'],
            sports: ['sports', 'sports2'], super: ['super1', 'super2'], van: ['van', 'van2', 'van3'], pickup: ['pickup', 'pickup2', 'pickup3'], taxi: ['taxi'],
        };
    }

    // Cores de fábrica de cada modelo (linhas de PAINTS). Variedade: cada carro nasce com uma cor sorteada daqui.
    static get POOLS() {
        const compact = [0, 1, 3, 4, 5, 7, 8, 9, 20, 21, 19, 23, 24, 26, 38];
        const sedan = [4, 5, 8, 26, 19, 20, 22, 27, 0, 1, 9, 39, 21];
        const suv = [4, 5, 8, 19, 20, 21, 26, 27, 22, 9, 38, 1];
        const sport = [0, 24, 32, 31, 4, 5, 26, 19, 8, 27];
        const sup = [28, 28, 29, 30, 31, 27, 26, 32, 5];
        const van = [4, 8, 26, 19, 1, 3, 20, 24, 0];
        const pick = [4, 5, 8, 19, 20, 21, 38, 27, 0, 7, 22];
        return {
            hatch: compact, hatch2: [0, 24, 3, 4, 23, 34, 35, 7, 20], hatch3: [0, 4, 5, 26, 20, 19, 31, 24],
            sedan, sedan2: sedan, sedan3: [5, 27, 4, 19, 20, 39, 26, 8], sedan4: [1, 32, 4, 0, 5, 24],
            suv, suv2: [4, 0, 3, 7, 8, 19, 20, 26, 23], suv3: [5, 27, 4, 19, 22, 21, 26], suv4: [21, 3, 7, 24, 4, 36, 38],
            sports: sport, sports2: [28, 24, 32, 4, 5, 26, 22, 19, 31], super1: [28, 28, 28, 24, 5, 4, 26, 27], super2: [29, 30, 31, 27, 4, 26, 28],
            van, van2: [4, 8, 26, 19, 20, 22, 21, 27, 23], van3: [35, 36, 37, 34, 24, 0, 4, 23],
            pickup: pick, pickup2: [4, 5, 8, 19, 20, 21, 26, 0], pickup3: [21, 38, 27, 4, 7, 24, 5, 3],
        };
    }

    // Peças EXTRAS do amassado de fase `lvl` (1..3, cumulativas) por cima do modelo limpo. Vistas de cima só
    // contam capô, teto, porta-malas, vidros e a silhueta dos para-choques: arranhões e vincos (1), capô torcido,
    // faróis estourados e vidro quebrado (2), frente esmagada, teto afundado e vidros destruídos (3).
    static damage(id, lvl) {
        const B = SpriteBaker, S = CarSheet.SLOT, M = CarSheet.MODELS[id], p = CarSheet.PARTS[id];
        const hw = M.wid / 2, hl = M.len / 2, P = [];
        const mid = (r) => (r[0] + r[1]) / 2, half = (r) => (r[1] - r[0]) / 2;
        const patch = (mat, x, y, z, hx, hz, rot = 0, hy = 0.02) => P.push(B.box(mat, [x, y, z], [hx, hy, hz], rot, 0.01));
        const lamp = (side, front) => P.push(B.box(S.dark, [side * (hw - (front ? 0.32 : 0.3)), p.lampY + 0.02, front ? hl - 0.08 : -hl + 0.08], [0.27, 0.1, 0.08], 0, 0.02));
        const hood = p.hood, tr = p.trunk;

        if (lvl >= 1) {
            patch(S.dark, -hw * 0.38, p.topY + 0.02, mid(hood), 0.2, Math.min(0.3, half(hood) * 0.6), 0.18);          // raspão no capô
            patch(S.chrome, hw * 0.3, p.topY + 0.03, mid(hood) + 0.05, 0.016, half(hood) * 0.7, -0.25, 0.01);          // arranhão (metal aparente)
            if (p.ws) for (const k of [-1, 1]) patch(S.chrome, k * 0.2, p.glassY + 0.015, mid(p.ws), 0.012, half(p.ws) * 0.95, k * 0.55, 0.01);   // trincas
            if (tr) patch(S.dark, hw * 0.35, p.topY + 0.02, mid(tr), 0.17, Math.min(0.2, half(tr) * 0.6), -0.2);
        }
        if (lvl >= 2) {
            patch(S.paint, 0.05, p.topY + 0.08, mid(hood) + half(hood) * 0.25, hw * 0.46, half(hood) * 0.28, 0.22, 0.07);   // onda no capô
            patch(S.dark, 0, p.topY + 0.025, mid(hood) - half(hood) * 0.3, hw * 0.52, 0.05, -0.1);                          // vinco
            patch(S.dark, -hw * 0.36, 0.5, hl + 0.01, 0.34, 0.08, 0.3, 0.1);                                               // para-choque entortado
            if (p.ws) patch(S.dark, -hw * 0.25, p.glassY + 0.02, mid(p.ws), hw * 0.34, half(p.ws) * 0.9, 0.1);              // vidro quebrado
            lamp(-1, true); lamp(1, false);                                                                                  // farol esquerdo e lanterna direita estourados
            if (tr) patch(S.paint, -0.1, p.topY + 0.06, mid(tr), hw * 0.4, half(tr) * 0.5, -0.2, 0.06);
        }
        if (lvl >= 3) {
            const fz = hood[1] - half(hood) * 0.55;
            patch(S.dark, 0, p.topY + 0.035, fz, hw - 0.12, half(hood) * 0.55, 0, 0.03);                                     // frente esmagada
            for (const [x, dz, r, h] of [[-0.45, 0.1, 0.35, 0.12], [0.35, -0.05, -0.3, 0.15], [0.0, 0.25, 0.15, 0.2]]) {
                patch(S.paint, x, p.topY + 0.06 + h * 0.5, fz + dz, 0.35, 0.16, r, h * 0.5);                                 // amassados empilhados
            }
            patch(S.paint, 0.15, p.topY + 0.22, mid(hood) - half(hood) * 0.2, hw * 0.5, 0.05, 0.45, 0.05);                  // capô levantado
            if (p.ws) patch(S.dark, 0, p.glassY + 0.03, mid(p.ws), hw - 0.18, half(p.ws), 0, 0.02);                          // vidros destruídos
            if (p.rw) patch(S.dark, 0, p.glassY + 0.03, mid(p.rw), hw - 0.18, half(p.rw), 0, 0.02);
            patch(S.dark, 0, p.roofY + 0.035, mid(p.roof), hw * 0.5, half(p.roof) * 0.6, 0.12, 0.03);                        // teto afundado
            patch(S.paint, -0.2, p.roofY + 0.09, mid(p.roof), hw * 0.4, 0.07, -0.35, 0.05);
            if (tr) patch(S.dark, 0, p.topY + 0.03, mid(tr), hw * 0.6, half(tr) * 0.8, 0, 0.03);
            lamp(1, true); lamp(-1, false);
            patch(S.dark, hw * 0.35, 0.5, hl + 0.01, 0.34, 0.08, -0.3, 0.1);
            patch(S.dark, 0, 0.5, -hl - 0.01, hw * 0.7, 0.07, 0.18, 0.1);
        }
        return P;
    }

    // Catálogo de modelos. len/wid em unidades (≈ metros); power/mass dão a aceleração;
    // maxSpeed (m/s) e turn (rad/s) são do modelo; cruise = fator da velocidade de cruzeiro da IA.
    static get MODELS() {
        return {
            // hp = resistência (o carro amassa em 3 fases e, a 0, pega fogo e explode).
            sedan:  { name: 'Sedã', model: 'Marquis Executivo',      len: 4.4, wid: 2.0,  mass: 900,  power: 10000, maxSpeed: 26, turn: 2.0, cruise: 1.0,  weight: 30, hp: 100 },
            hatch:  { name: 'Compacto', model: 'Kompakt GT',  len: 3.7, wid: 1.85, mass: 700,  power: 9500,  maxSpeed: 25, turn: 2.3, cruise: 1.05, weight: 20, hp: 85 },
            suv:    { name: 'SUV', model: 'Titan 4x4',       len: 4.7, wid: 2.1,  mass: 1300, power: 12500, maxSpeed: 26, turn: 1.8, cruise: 0.95, weight: 15, hp: 130 },
            pickup: { name: 'Picape', model: 'Rancher V8',    len: 5.0, wid: 2.1,  mass: 1400, power: 12500, maxSpeed: 25, turn: 1.7, cruise: 0.92, weight: 10, hp: 120 },
            van:    { name: 'Van', model: 'Cargo Express',       len: 5.2, wid: 2.1,  mass: 1700, power: 11000, maxSpeed: 21, turn: 1.5, cruise: 0.82, weight: 10, hp: 150 },
            sports: { name: 'Esportivo', model: 'Bavária M-Sport', len: 4.3, wid: 1.95, mass: 1100, power: 21000, maxSpeed: 36, turn: 2.3, cruise: 1.18, weight: 8,  hp: 80 },
            taxi:   { name: 'Táxi', model: 'City Cab',      len: 4.4, wid: 2.0,  mass: 900,  power: 10500, maxSpeed: 27, turn: 2.0, cruise: 1.1,  weight: 7,  hp: 100 },
            // ---- Modelos novos (nomes fictícios inspirados em carros reais). `cls` = classe de trânsito (ver CLASSES).
            hatch2:  { name: 'Compacto', model: 'Pulga 1.0',            cls: 'hatch',  len: 3.4,  wid: 1.75, mass: 600,  power: 8000,  maxSpeed: 22, turn: 2.5, cruise: 1.0,  weight: 20, hp: 70,  tank: 32 },
            hatch3:  { name: 'Compacto', model: 'Urbano GTI',           cls: 'hatch',  len: 3.95, wid: 1.86, mass: 800,  power: 12500, maxSpeed: 28, turn: 2.4, cruise: 1.1,  weight: 10, hp: 85,  tank: 45 },
            sedan2:  { name: 'Sedã', model: 'Corona 2.0',               cls: 'sedan',  len: 4.3,  wid: 1.9,  mass: 950,  power: 10500, maxSpeed: 26, turn: 2.0, cruise: 1.0,  weight: 25, hp: 100, tank: 50 },
            sedan3:  { name: 'Sedã', model: 'Imperial V12 Luxo',        cls: 'sedan',  len: 4.95, wid: 2.02, mass: 1500, power: 14500, maxSpeed: 29, turn: 1.7, cruise: 1.0,  weight: 10, hp: 130, tank: 70 },
            sedan4:  { name: 'Sedã', model: 'Rally STX Turbo',          cls: 'sedan',  len: 4.4,  wid: 1.97, mass: 1150, power: 17000, maxSpeed: 32, turn: 2.3, cruise: 1.12, weight: 6,  hp: 95,  tank: 55 },
            suv2:    { name: 'SUV', model: 'Cross Urban',               cls: 'suv',    len: 4.2,  wid: 1.92, mass: 1100, power: 11000, maxSpeed: 25, turn: 1.95, cruise: 1.0, weight: 16, hp: 115, tank: 50 },
            suv3:    { name: 'SUV', model: 'Executive X7',              cls: 'suv',    len: 5.0,  wid: 2.15, mass: 1900, power: 16000, maxSpeed: 28, turn: 1.6, cruise: 1.0,  weight: 8,  hp: 150, tank: 85 },
            suv4:    { name: 'SUV', model: 'Trail Rubicón 4x4',         cls: 'suv',    len: 4.2,  wid: 1.95, mass: 1350, power: 12500, maxSpeed: 24, turn: 1.8, cruise: 0.95, weight: 8,  hp: 135, tank: 60 },
            sports2: { name: 'Esportivo', model: 'Stuttgart Carrera',   cls: 'sports', len: 4.2,  wid: 1.95, mass: 1250, power: 23000, maxSpeed: 37, turn: 2.3, cruise: 1.2,  weight: 5,  hp: 85,  tank: 64 },
            super1:  { name: 'Superesportivo', model: 'Maranello Stallion', cls: 'super', len: 4.55, wid: 2.0, mass: 1300, power: 30000, maxSpeed: 44, turn: 2.1, cruise: 1.3, weight: 2, hp: 75, tank: 80 },
            super2:  { name: 'Superesportivo', model: "Sant'Agata Toro",    cls: 'super', len: 4.6,  wid: 2.05, mass: 1350, power: 32000, maxSpeed: 46, turn: 2.0, cruise: 1.35, weight: 2, hp: 75, tank: 85 },
            van2:    { name: 'Van', model: 'Minivan Família',           cls: 'van',    len: 4.9,  wid: 2.0,  mass: 1600, power: 11500, maxSpeed: 24, turn: 1.7, cruise: 0.92, weight: 12, hp: 120, tank: 70 },
            van3:    { name: 'Van', model: 'Kombi Brisa',               cls: 'van',    len: 4.5,  wid: 1.8,  mass: 1100, power: 7500,  maxSpeed: 19, turn: 1.7, cruise: 0.8,  weight: 6,  hp: 100, tank: 40 },
            pickup2: { name: 'Picape', model: 'Hilo SRV 4x4',           cls: 'pickup', len: 5.2,  wid: 1.95, mass: 1700, power: 14000, maxSpeed: 27, turn: 1.7, cruise: 0.95, weight: 10, hp: 140, tank: 80 },
            pickup3: { name: 'Picape', model: 'Patrulha Raptor 4x4',    cls: 'pickup', len: 5.1,  wid: 2.05, mass: 1900, power: 16000, maxSpeed: 29, turn: 1.7, cruise: 1.0,  weight: 6,  hp: 155, tank: 85 },
        };
    }

    // Rampas de 5 tons de uma pintura, indexadas pelo número do slot.
    static rampsFor(row) {
        const S = CarSheet.SLOT;
        const common = { glass: '#27384d', dark: '#1a1b20', chrome: '#c9d0d8', head: '#fff2b0', tail: '#8a1c1c', sign: '#fff7c8', seat: '#3a404e', trim: '#6b7386' };
        const cols = Object.assign({}, common, CarSheet.PAINTS[row]);
        const out = {};
        for (const slot of Object.keys(S)) out[S[slot]] = Pixel.ramp5(cols[slot]);
        return out;
    }

    // Imagem do modelo para o HUD: visto de CIMA, de lado para a direita (nariz à direita), na pintura `paintRow`, já
    // colorida e recortada, com contorno claro de 1 px. Retorna um <canvas> (pixels de arte, sem ampliar).
    static preview(modelId, paintRow = 0) {
        const F = 112, img = SpriteBaker.bake(CarSheet.model(modelId, 0), { size: F, heading: Math.PI / 2, shadow: false });
        const ramps = CarSheet.rampsFor(paintRow);
        let x0 = F, y0 = F, x1 = 0, y1 = 0;
        for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
            if (img[(y * F + x) * 4 + 3] < 128) continue;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        const pad = 2, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d'), out = ctx.createImageData(w, h);
        const solid = new Uint8Array(w * h);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const i = (y * F + x) * 4;
            if (img[i + 3] < 128) continue;
            const col = ramps[img[i]] ? ramps[img[i]][img[i + 1]] : [255, 0, 255];
            const o = ((y - y0 + pad) * w + (x - x0 + pad)) * 4;
            out.data[o] = col[0]; out.data[o + 1] = col[1]; out.data[o + 2] = col[2]; out.data[o + 3] = 255;
            solid[(y - y0 + pad) * w + (x - x0 + pad)] = 1;
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {                 // contorno claro (lê bem no painel escuro)
            if (solid[y * w + x]) continue;
            const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx];
            if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) {
                const o = (y * w + x) * 4;
                out.data[o] = 238; out.data[o + 1] = 240; out.data[o + 2] = 246; out.data[o + 3] = 255;
            }
        }
        ctx.putImageData(out, 0, 0);
        return c;
    }

    // Textura de paleta compartilhada: 1 linha por pintura (16 rampas por linha).
    static createPalette(scene) {
        const PW = 16 * 5, PH = CarSheet.PAINTS.length;
        const pdata = new Uint8Array(PW * PH * 4);
        CarSheet.PAINTS.forEach((p, row) => {
            const ramps = CarSheet.rampsFor(row);
            for (const idx of Object.keys(ramps)) {
                for (let lv = 0; lv < 5; lv++) {
                    const o = (row * PW + idx * 5 + lv) * 4;
                    pdata[o] = ramps[idx][lv][0]; pdata[o + 1] = ramps[idx][lv][1]; pdata[o + 2] = ramps[idx][lv][2]; pdata[o + 3] = 255;
                }
            }
        });
        SpriteIO.paletteOverlay('pal/car', pdata, PW, PH);              // cores editadas em assets/sprites/pal/car.png (se houver)
        const ptex = BABYLON.RawTexture.CreateRGBATexture(pdata, PW, PH, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        ptex.wrapU = ptex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        return { texture: ptex, width: PW, height: PH };
    }

    // Folha de UM modelo. `palette` é compartilhada (CarLibrary).
    // dent: fase de amassado (0 = limpo, 1..3). lazy: não assa agora — use bake(ms) aos poucos (variantes amassadas).
    constructor(scene, modelId = 'sedan', palette = null, { dirs = 32, frame = 112, dent = 0, lazy = false } = {}) {      // 32 direções (11,25°): metade da memória e do preparo das 64 de antes
        this.scene = scene;
        this.modelId = modelId;
        this.dent = dent;
        this.spec = Object.assign({ id: modelId }, CarSheet.MODELS[modelId]);
        this.dirs = dirs;
        this.frame = frame;
        this.name = modelId + (dent ? '#' + dent : '');
        this.palette = palette || CarSheet.createPalette(scene);
        this.lib = null;                 // CarLibrary dona desta folha (para achar as variantes amassadas)
        this.ready = false;
        this._clip = null;
        this._ms = 0;

        // PNG pronto (assets/sprites/car/<modelo>[-dent<n>].png, uma linha com as direções): nada a desenhar.
        const idx = SpriteIO.manifest ? SpriteIO.indices(CarSheet.fileKey(modelId, dent), dirs * frame, frame) : null;
        if (idx) { this._finishTex(SpriteMaterial.indexTexture(scene, idx, dirs * frame, frame)); return; }

        this._data = new Uint8Array(dirs * frame * frame * 4);
        this._prims = CarSheet.model(modelId, dent);
        this._d = 0;                     // próxima direção a assar
        if (!lazy) this.bake(Infinity);
    }

    static fileKey(modelId, dent = 0) { return 'car/' + modelId + (dent ? '-dent' + dent : ''); }

    // Assa direções por até `budgetMs`. Retorna true quando a folha ficou pronta.
    bake(budgetMs) {
        if (this.ready) return true;
        const t0 = performance.now(), F = this.frame, W = this.dirs * F;
        while (this._d < this.dirs && performance.now() - t0 < budgetMs) {
            const d = this._d++;
            const img = SpriteBaker.bake(this._prims, { size: F, heading: (d * Math.PI * 2) / this.dirs, shadow: false });
            for (let y = 0; y < F; y++) this._data.set(img.subarray(y * F * 4, (y + 1) * F * 4), (y * W + d * F) * 4);
        }
        this._ms += performance.now() - t0;
        if (this._d >= this.dirs) this._finish();
        return this.ready;
    }

    _finish() {
        this._finishTex(SpriteMaterial.atlasTexture(this.scene, this._data, this.dirs * this.frame, this.frame));
        console.log(`[CARROS] ${this.name}: ${this.dirs} direções em ${this._ms.toFixed(0)} ms`);
    }

    _finishTex(tex) {
        const F = this.frame, W = this.dirs * F;
        const material = SpriteMaterial.create(this.scene, 'car_' + this.name, tex, this.palette);
        this._clip = { name: 'static', weapon: 'none', frames: 1, dirs: this.dirs, fps: 1, loop: true, texture: tex, material, frame: F, W, H: F };
        this._data = null; this._prims = null;
        this.ready = true;
    }

    // Interface do SpriteActor: só existe um clipe estático (null enquanto a variante ainda está sendo assada).
    getClip() { return this._clip; }

    // ------------------------------------------------------------- modelos 3D
    // Primitivas comuns: rodas, faróis, lanternas, para-choques e espelhos.
    static _fittings(L, W, o = {}) {
        const B = SpriteBaker, S = CarSheet.SLOT, P = [];
        const hl = L / 2, hw = W / 2;
        const wz = o.wheelZ !== undefined ? o.wheelZ : hl - 0.75;
        for (const sx of [-1, 1]) {
            P.push(B.box(S.dark, [sx * (hw + 0.0), 0.36, wz], [0.13, 0.36, 0.42], 0, 0.1));                 // rodas
            P.push(B.box(S.dark, [sx * (hw + 0.0), 0.36, -wz], [0.13, 0.36, 0.42], 0, 0.1));
            P.push(B.box(S.head, [sx * (hw - 0.32), o.lampY || 0.8, hl - 0.08], [0.24, 0.09, 0.07], 0, 0.04));   // faróis
            P.push(B.box(S.tail, [sx * (hw - 0.3), o.lampY || 0.8, -hl + 0.08], [0.26, 0.09, 0.07], 0, 0.04));   // lanternas
            if (o.mirrors !== false) P.push(B.box(S.paint, [sx * (hw + 0.08), o.mirrorY || 0.96, o.mirrorZ || 0.6], [0.1, 0.06, 0.15], 0, 0.04));
        }
        if (o.bumpers !== false) {
            P.push(B.box(S.chrome, [0, 0.45, hl + 0.02], [hw - 0.3, 0.1, 0.05], 0, 0.04));
            P.push(B.box(S.chrome, [0, 0.45, -hl - 0.02], [hw - 0.3, 0.1, 0.05], 0, 0.04));
        }
        return P;
    }

    // Modelo `id` visto de cima, olhando para +Z, com os amassados da fase `dent` (0 = limpo).
    static model(id, dent = 0) {
        const P = CarSheet._cleanModel(id);
        if (dent > 0) P.push(...CarSheet.damage(id, dent));
        return P;
    }

    // Modelo limpo (olhando para +Z, visto de cima). Estilo "simulação 3D pixelada" de uma foto de cima: carroceria arredondada com
    // bojo de para-lamas, capô vincado, faróis/lanternas de vários formatos, grade, para-choques, retrovisores, vidros em volta de um
    // teto menor e o INTERIOR visto pelo vidro (painel, volante à esquerda, bancos). Cada modelo tem proporções e peças próprias (STYLE).
    // As zonas (capô, para-brisa, teto, vidro traseiro, porta-malas) vêm de PARTS, as mesmas dos amassados.
    static _cleanModel(id) {
        const B = SpriteBaker, S = CarSheet.SLOT, M = CarSheet.MODELS[id], p = CarSheet.PARTS[id], st = CarSheet.STYLE[id];
        const L = M.len, W = M.wid, hl = L / 2, hw = W / 2, P = [];
        const ex = new Set(st.extras || []);
        const mid = (r) => (r[0] + r[1]) / 2, half = (r) => (r[1] - r[0]) / 2;
        const box = (m, c, h, rot = 0, bev = 0.04, o) => P.push(B.box(m, c, h, rot, bev, o));
        const ell = (m, c, r, rot = 0) => P.push(B.ellipsoid(m, c, r, rot));
        const ball = (m, c, r) => P.push(B.sphere(m, c, r));
        const pick = st.base === 'pickup', van = st.base === 'van';
        const topY = p.topY, roofY = p.roofY, glassY = p.glassY, lampY = p.lampY, hy = st.hy, flare = st.flare;
        const wz = hl - st.wz;
        const low = topY < 0.7;                                                                           // super-esportivo: tudo mais baixo e largo
        const taper = st.nose;

        // ---- Carroceria (cantos arredondados) e afinamento do nariz e da traseira.
        if (pick) {
            const cb = -0.3;                                                                               // fundo da cabine
            box(S.paint, [0, topY - hy, (cb + hl) / 2], [hw - 0.02, hy, (hl - cb) / 2], 0, st.bev);        // capô + cabine
        } else {
            box(S.paint, [0, topY - hy, 0], [hw - 0.02, hy, hl - 0.6], 0, st.bev);
            for (const sg of [1, -1]) {                                                                      // nariz e traseira em dois degraus (cunha)
                const t = sg > 0 ? taper : taper * 0.7;
                box(S.paint, [0, topY - hy - 0.02, sg * (hl - 1.0)], [hw - 0.02 - t * 0.45, hy - 0.02, 0.55], 0, st.bev * 0.85);
                box(S.paint, [0, topY - hy - 0.04, sg * (hl - 0.34)], [hw - 0.02 - t, hy - 0.04, 0.36], 0, st.bev * 0.7);
            }
        }
        // Bojo dos para-lamas sobre as quatro rodas e os pneus aparecendo embaixo.
        for (const sx of [-1, 1]) for (const z of [wz, -wz]) {
            ell(S.paint, [sx * (hw - 0.04), topY - 0.34, z], [flare, 0.2, low ? 0.58 : 0.5]);
            box(S.dark, [sx * (hw + 0.05), 0.34, z], [low ? 0.15 : 0.12, 0.34, low ? 0.46 : 0.4], 0, 0.1);
            box(S.chrome, [sx * (hw + 0.1), 0.5, z], [0.02, 0.1, 0.1], 0, 0.01);
        }

        // ---- Frente: capô, para-choque, grade e faróis.
        const hood = p.hood;
        box(S.paint, [0, topY + 0.02, mid(hood)], [hw * (low ? 0.38 : 0.5), 0.045, half(hood) * 0.92], 0, 0.04);
        for (const sx of [-1, 1]) {
            box(S.dark, [sx * hw * 0.62, topY + 0.015, mid(hood) + half(hood) * 0.1], [0.012, 0.012, half(hood) * 0.7], 0, 0.005);
            if (!van && ex.has('hoodVents')) box(S.dark, [sx * hw * 0.3, topY + 0.07, mid(hood) - half(hood) * 0.15], [0.05, 0.015, half(hood) * 0.3], 0, 0.01);
        }
        if (ex.has('hoodScoop')) { box(S.dark, [0, topY + 0.09, mid(hood) - 0.1], [hw * 0.24, 0.025, half(hood) * 0.36], 0, 0.02); box(S.chrome, [0, topY + 0.115, mid(hood) + half(hood) * 0.2], [hw * 0.2, 0.012, 0.02], 0, 0.01); }
        box(S.dark, [0, low ? 0.3 : 0.42, hl + 0.01], [hw - 0.22 - taper * 0.5, low ? 0.1 : 0.12, 0.08], 0, 0.05);       // para-choque inferior
        if (!low) box(S.chrome, [0, 0.58, hl + 0.025], [hw - 0.34, 0.035, 0.035], 0, 0.02);
        const gy = topY - (low ? 0.12 : 0.2);
        switch (st.grille) {
            case 'kidney':                                                                                  // duas narinas (rim duplo)
                for (const sx of [-1, 1]) { box(S.chrome, [sx * 0.2, gy, hl - 0.03], [0.17, 0.11, 0.05], 0, 0.04); box(S.dark, [sx * 0.2, gy + 0.01, hl - 0.02], [0.14, 0.09, 0.05], 0, 0.03); }
                break;
            case 'chromeBig':                                                                               // grade cromada grande
                box(S.chrome, [0, gy, hl - 0.03], [hw * 0.6, 0.13, 0.05], 0, 0.04);
                for (let k = -2; k <= 2; k++) box(S.dark, [k * hw * 0.2, gy, hl - 0.015], [0.015, 0.1, 0.04], 0, 0.005);
                break;
            case 'wide':                                                                                    // boca larga e baixa + entradas laterais
                box(S.dark, [0, low ? gy - 0.04 : gy, hl - 0.04], [hw * 0.62, low ? 0.07 : 0.09, 0.06], 0, 0.04);
                for (const sx of [-1, 1]) box(S.dark, [sx * (hw - 0.34), low ? gy - 0.04 : gy - 0.02, hl - 0.04], [0.16, 0.07, 0.06], 0, 0.03);
                break;
            case 'slots':                                                                                   // 7 frestas verticais (estilo off-road)
                box(S.dark, [0, gy, hl - 0.03], [hw * 0.46, 0.11, 0.05], 0, 0.03);
                for (let k = -3; k <= 3; k++) box(S.paint2, [k * hw * 0.12, gy + 0.005, hl - 0.005], [0.022, 0.09, 0.03], 0, 0.005);
                break;
            case 'vee':                                                                                     // Kombi: nariz plano com friso em V
                box(S.paint2, [0, topY - 0.16, hl - 0.05], [hw * 0.55, 0.05, 0.05], 0, 0.02);
                box(S.paint2, [0, topY - 0.16, hl - 0.2], [0.04, 0.05, 0.16], 0, 0.02);
                break;
            default:
                box(S.dark, [0, gy, hl - 0.03], [hw * 0.46, 0.1, 0.06], 0, 0.04);
                box(S.chrome, [0, gy + 0.06, hl - 0.005], [hw * 0.4, 0.02, 0.02], 0, 0.01);
        }
        for (const sx of [-1, 1]) {                                                                          // faróis
            const lx = sx * (hw - 0.31 + (low ? 0.06 : 0));
            switch (st.lamps) {
                case 'slim':
                    ell(S.dark, [lx, lampY, hl - 0.12], [0.34, 0.09, 0.12]);
                    box(S.head, [lx, lampY + 0.04, hl - 0.06], [0.28, 0.04, 0.045], 0, 0.03);
                    break;
                case 'round':
                    ell(S.dark, [lx, lampY, hl - 0.13], [0.22, 0.1, 0.18]);
                    ball(S.head, [lx, lampY + 0.07, hl - 0.1], 0.14);
                    ball(S.chrome, [lx, lampY + 0.12, hl - 0.1], 0.05);
                    break;
                case 'quad':
                    ell(S.dark, [lx, lampY, hl - 0.13], [0.3, 0.1, 0.15]);
                    for (const dz of [-0.07, 0.06]) box(S.head, [lx - sx * 0.06, lampY + 0.045, hl - 0.07 + dz * 0.2], [0.11, 0.05, 0.055], 0, 0.03);
                    box(S.head, [lx + sx * 0.12, lampY + 0.045, hl - 0.075], [0.08, 0.05, 0.055], 0, 0.03);
                    break;
                case 'wy':                                                                                  // faróis em Y angulosos
                    box(S.dark, [lx, lampY, hl - 0.14], [0.3, 0.08, 0.13], sx * 0.12, 0.02);
                    box(S.head, [lx - sx * 0.04, lampY + 0.045, hl - 0.09], [0.2, 0.04, 0.035], sx * 0.45, 0.01);
                    box(S.head, [lx + sx * 0.1, lampY + 0.045, hl - 0.11], [0.12, 0.04, 0.035], -sx * 0.45, 0.01);
                    break;
                default:
                    ell(S.dark, [lx, lampY, hl - 0.13], [0.3, 0.1, 0.15]);
                    box(S.head, [lx, lampY + 0.04, hl - 0.07], [0.2, 0.06, 0.07], 0, 0.04);
                    ball(S.chrome, [lx - sx * 0.09, lampY + 0.08, hl - 0.1], 0.045);
            }
        }

        // ---- Traseira.
        for (const sx of [-1, 1]) {
            const lx = sx * (hw - 0.3 + (low ? 0.05 : 0));
            ell(S.dark, [lx, lampY, -hl + 0.12], [0.3, 0.1, 0.13]);
            if (ex.has('engineDeck') || st.lamps === 'round' && !pick) { ball(S.tail, [lx - sx * 0.1, lampY + 0.05, -hl + 0.07], 0.09); ball(S.tail, [lx + sx * 0.08, lampY + 0.05, -hl + 0.07], 0.09); }
            else box(S.tail, [lx, lampY + 0.02, -hl + 0.07], [0.26, 0.09, 0.07], 0, 0.04);
            ball(S.chrome, [sx * (low ? 0.5 : 0.36), 0.28, -hl - 0.02], low ? 0.09 : 0.06);                  // escapamento
        }
        if (!ex.has('engineDeck')) box(S.tail, [0, lampY + 0.02, -hl + 0.06], [hw - 0.62, 0.03, 0.03], 0, 0.01);   // barra de luz
        box(S.dark, [0, low ? 0.3 : 0.42, -hl - 0.01], [hw - 0.22, 0.1, 0.07], 0, 0.05);
        if (!low) box(S.chrome, [0, 0.58, -hl - 0.025], [hw - 0.5, 0.03, 0.03], 0, 0.02);
        if (ex.has('bullbar')) { box(S.chrome, [0, 0.55, hl + 0.12], [hw - 0.2, 0.035, 0.035], 0, 0.02); for (const sx of [-1, 1]) box(S.chrome, [sx * (hw - 0.2), 0.55, hl + 0.06], [0.03, 0.035, 0.07], 0, 0.01); }
        if (ex.has('spare')) { ell(S.dark, [0, 0.9, -hl - 0.2], [0.42, 0.42, 0.2]); ell(S.chrome, [0, 0.92, -hl - 0.24], [0.17, 0.17, 0.06]); }

        // ---- Retrovisores.
        const mz = pick ? 1.05 : p.ws[0] + 0.12, my = glassY - 0.14;
        for (const sx of [-1, 1]) {
            box(S.paint, [sx * (hw + 0.1), my, mz], [0.1, 0.06, 0.15], 0, 0.04);
            box(S.dark, [sx * (hw + 0.14), my + 0.02, mz], [0.035, 0.05, 0.11], 0, 0.02);
        }

        // ---- Cabine.
        if (van) {
            box(S.paint, [0, 1.5, -0.35], [hw - 0.06, 0.45, hl - 0.65], 0, 0.3);
            for (const z of [-1.3, -0.5, 0.3]) box(S.dark, [0, 1.96, z], [hw - 0.4, 0.015, 0.03], 0, 0.01);
            box(S.dark, [0, 1.97, -1.7], [0.28, 0.02, 0.2], 0, 0.02);
            box(S.glass, [0, 1.2, hl - 0.8], [hw - 0.2, 0.25, 0.4], 0, 0.2);
            box(S.dark, [0, 1.46, hl - 0.52], [hw - 0.34, 0.02, 0.07], 0, 0.02);
            box(S.dark, [-0.45, 1.47, hl - 0.8], [0.17, 0.03, 0.12], 0, 0.03);
            box(S.seat, [-0.45, 1.46, hl - 1.05], [0.26, 0.03, 0.22], 0, 0.03);
            box(S.seat, [0.45, 1.46, hl - 1.05], [0.26, 0.03, 0.22], 0, 0.03);
            return P;
        }
        const ws = p.ws, rw = p.rw, roof = p.roof;
        if (pick) {
            const cb = -0.3, bedC = (-hl + cb + 0.1) / 2, bedH = (cb + 0.1 + hl) / 2;
            box(S.dark, [0, 0.74, bedC], [hw - 0.16, 0.16, bedH], 0, 0.06);                                // piso da caçamba
            for (const sx of [-1, 1]) box(S.paint, [sx * (hw - 0.08), 0.98, bedC], [0.08, 0.26, bedH], 0, 0.04);
            box(S.paint, [0, 0.98, -hl + 0.06], [hw - 0.04, 0.26, 0.08], 0, 0.04);
            box(S.paint, [0, 0.98, cb + 0.1], [hw - 0.04, 0.26, 0.08], 0, 0.04);
            for (let z = cb - 0.4; z > -hl + 0.2; z -= 0.5) box(S.dark, [0, 0.9, z], [hw - 0.2, 0.012, 0.025], 0, 0.005);
            box(S.chrome, [0, 1.0, -hl + 0.02], [0.2, 0.02, 0.02], 0, 0.01);
            if (ex.has('bedCover')) {                                                                        // capota marítima sobre a caçamba
                box(S.paint, [0, 1.08, bedC + 0.1], [hw - 0.12, 0.05, bedH - 0.35], 0, 0.06);
                for (const z of [bedC - 0.4, bedC + 0.5]) box(S.dark, [0, 1.14, z], [hw - 0.3, 0.012, 0.02], 0, 0.005);
            }
            if (ex.has('rollbar')) { box(S.dark, [0, 1.35, cb - 0.1], [hw - 0.15, 0.035, 0.035], 0, 0.02); for (const sx of [-1, 1]) box(S.dark, [sx * (hw - 0.15), 1.2, cb - 0.1], [0.03, 0.15, 0.03], 0, 0.01); }
        }
        // vidros (casa de vidro) e teto por cima
        const z0 = rw ? rw[0] : roof[0] - 0.05, z1 = ws[1];
        box(S.glass, [0, glassY - 0.17, (z0 + z1) / 2], [hw - 0.2 - (low ? 0.06 : 0), 0.17, (z1 - z0) / 2], 0, 0.14);
        const fast = st.roof === 'fast', pano = st.roof === 'pano', two = st.roof === 'twoTone';
        const rwid = low ? hw - 0.6 : (fast ? hw - 0.58 : hw - 0.4);
        const rl = (roof[1] - roof[0]) * (fast ? 0.5 : 0.62), rz0 = roof[0] + (fast ? 0.05 : 0);
        if (pano) {                                                                                          // teto panorâmico: moldura + vidro no meio
            box(S.paint, [0, roofY - 0.06, mid(roof)], [rwid, 0.06, half(roof) * 0.92], 0, 0.05);
            box(S.glass, [0, roofY + 0.005, mid(roof)], [rwid - 0.16, 0.012, half(roof) * 0.92 - 0.12], 0, 0.01);
            box(S.paint, [0, roofY + 0.01, mid(roof)], [rwid - 0.1, 0.012, 0.025], 0, 0.005);
        } else if (two) {
            box(S.paint2, [0, roofY - 0.06, mid(roof)], [rwid + 0.1, 0.06, half(roof) * 0.95], 0, 0.06);       // teto de outra cor (Kombi)
            for (const z of [mid(roof) - 0.5, mid(roof) + 0.4]) box(S.paint, [0, roofY + 0.005, z], [rwid + 0.05, 0.012, 0.02], 0, 0.005);
        } else {
            box(S.paint, [0, roofY - 0.06, rz0 + rl / 2], [rwid, 0.06, rl / 2], 0, 0.05);
        }
        box(S.paint, [0, glassY + 0.005, ws[0] + 0.02], [hw - 0.2, 0.03, 0.045], 0, 0.02);                    // coluna A
        if (rw) box(S.paint, [0, glassY + 0.005, rw[0] + 0.04], [hw - 0.2, 0.03, 0.05], 0, 0.02);             // coluna C
        for (const sx of [-1, 1]) box(S.paint, [sx * (hw - 0.22), glassY + 0.01, mid(roof) + 0.05], [0.035, 0.025, 0.04], 0, 0.01);

        // interior visto pelo vidro
        const iy = glassY + 0.03;
        box(S.dark, [0, iy, ws[1] - 0.07], [hw - 0.3, 0.02, 0.07], 0, 0.02);                                     // painel
        box(S.trim, [0.38, iy + 0.01, ws[1] - 0.07], [0.12, 0.012, 0.03], 0, 0.01);
        ell(S.dark, [-0.42, iy + 0.02, ws[0] + 0.15], [0.17, 0.025, 0.12]);                                      // volante
        ell(S.trim, [-0.42, iy + 0.04, ws[0] + 0.15], [0.09, 0.02, 0.06]);
        for (const sx of [-1, 1]) {
            box(S.seat, [sx * 0.4, iy, roof[1] - 0.14], [0.24, 0.035, 0.2], 0, 0.04);
            box(S.trim, [sx * 0.4, iy + 0.04, roof[1] - 0.04], [0.11, 0.03, 0.05], 0, 0.03);
        }
        if (rw) {
            box(S.seat, [0, iy, mid(rw)], [hw - 0.34, 0.025, half(rw) * 0.85], 0, 0.03);
            for (const sx of [-1, 0, 1]) box(S.trim, [sx * 0.42, iy + 0.035, mid(rw) + 0.05], [0.1, 0.03, 0.04], 0, 0.03);
        }

        // ---- Peças opcionais de cada modelo.
        const tr = p.trunk;
        if (ex.has('taxiSign')) {
            box(S.sign, [0, roofY + 0.14, mid(roof)], [0.34, 0.1, 0.17], 0, 0.04);
            for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) box(k % 2 ? S.paint2 : S.dark, [sx * (hw - 0.06), topY + 0.03, -0.5 + k * 0.28], [0.06, 0.012, 0.14], 0, 0.005);
        }
        if (ex.has('sideStripe')) for (const sx of [-1, 1]) box(S.paint2, [sx * 0.64, topY - 0.03, 0.05], [0.3, 0.05, 0.9], 0, 0.05);       // faixa lateral (viaturas)
        if (ex.has('chromeSide')) for (const sx of [-1, 1]) box(S.chrome, [sx * (hw - 0.03), topY - 0.15, mid(roof)], [0.015, 0.02, half(roof) + 0.4], 0, 0.01);
        if (ex.has('trunkLip') && tr) box(S.paint, [0, topY + 0.04, tr[0] + 0.1], [hw - 0.3, 0.04, 0.12], 0, 0.03);
        if (ex.has('roofLip') && rw) { box(S.paint, [0, roofY + 0.01, rw[0] - 0.05], [hw - 0.35, 0.05, 0.1], 0, 0.04); }
        if (ex.has('rails')) {
            for (const sx of [-1, 1]) box(S.chrome, [sx * (hw - 0.4), roofY + 0.1, mid(roof)], [0.04, 0.04, half(roof) + 0.05], 0, 0.02);
            for (const dz of [-0.3, 0.3]) box(S.chrome, [0, roofY + 0.1, mid(roof) + dz], [hw - 0.4, 0.025, 0.025], 0, 0.01);
        }
        if (ex.has('snorkel')) box(S.dark, [hw - 0.12, glassY + 0.2, ws[0] - 0.05], [0.05, 0.3, 0.05], 0, 0.03);
        if (ex.has('lightbar')) { box(S.dark, [0, roofY + 0.08, ws[0] + 0.1], [hw - 0.35, 0.05, 0.07], 0, 0.03); for (let k = -3; k <= 3; k++) box(S.head, [k * 0.17, roofY + 0.13, ws[0] + 0.13], [0.06, 0.03, 0.03], 0, 0.01); }
        if (ex.has('spoilerSmall') && tr) box(S.dark, [0, topY + 0.1, tr[0] + 0.12], [hw - 0.2, 0.025, 0.1], 0, 0.02);
        if (ex.has('spoilerBig') && tr) {
            for (const sx of [-1, 1]) box(S.paint2, [sx * (hw - 0.45), topY + 0.14, -hl + 0.22], [0.04, 0.14, 0.05], 0, 0.02);
            box(S.dark, [0, topY + 0.29, -hl + 0.22], [hw - 0.05, 0.03, 0.17], 0, 0.03);
            for (const sx of [-1, 1]) box(S.paint2, [sx * (hw - 0.05), topY + 0.29, -hl + 0.22], [0.025, 0.07, 0.17], 0, 0.02);
        }
        if (ex.has('stripes')) for (const sx of [-1, 1]) {
            box(S.paint2, [sx * 0.26, topY + 0.045, mid(hood) - 0.1], [0.1, 0.03, half(hood) + 0.1], 0, 0.02);
            if (tr) box(S.paint2, [sx * 0.26, topY + 0.045, mid(tr)], [0.1, 0.03, half(tr)], 0, 0.02);
        }
        if (ex.has('ducktail') && tr) {                                                                      // 911: motor atrás, tampa com abertura e "rabo de pato"
            box(S.dark, [0, topY + 0.045, mid(tr) + 0.05], [hw * 0.45, 0.012, half(tr) * 0.6], 0, 0.01);
            for (let k = 0; k < 4; k++) box(S.dark, [0, topY + 0.058, tr[0] + 0.15 + k * 0.1], [hw * 0.42, 0.008, 0.012], 0, 0.004);
            box(S.paint, [0, topY + 0.1, tr[0] + 0.07], [hw - 0.15, 0.04, 0.12], 0, 0.04);
        }
        if (ex.has('engineLid') && tr) for (const sx of [-1, 1]) box(S.dark, [sx * (hw - 0.4), topY + 0.04, mid(tr)], [0.08, 0.01, half(tr) * 0.7], 0, 0.005);
        if (ex.has('engineDeck') && tr) {                                                                    // motor central: tampa de vidro com colmeia e saídas
            box(S.paint, [0, topY + 0.03, mid(tr)], [hw - 0.2, 0.05, half(tr)], 0, 0.06);
            box(S.glass, [0, topY + 0.07, mid(tr)], [hw * 0.55, 0.02, half(tr) * 0.82], 0, 0.02);
            for (let k = 0; k < 7; k++) box(S.dark, [0, topY + 0.085, tr[0] + 0.12 + k * (2 * half(tr) - 0.24) / 6], [hw * 0.5, 0.01, 0.018], 0, 0.004);
            for (const sx of [-1, 1]) ball(S.chrome, [sx * 0.18, topY + 0.1, tr[0] + 0.1], 0.04);
            if (ex.has('hex')) for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) box(S.dark, [sx * (hw - 0.3), topY + 0.065, tr[0] + 0.28 + k * 0.22], [0.1, 0.012, 0.1], 0.785, 0.004);
        }
        if (ex.has('sideIntake') && rw) for (const sx of [-1, 1]) {
            box(S.dark, [sx * (hw - 0.07), topY - 0.04, rw[0] + 0.12], [0.1, 0.08, 0.34], 0, 0.04);          // entrada de ar lateral
            box(S.paint2, [sx * (hw - 0.07), topY + 0.02, rw[0] + 0.12], [0.1, 0.012, 0.36], 0, 0.01);
        }
        if (ex.has('sliding')) for (const sx of [-1, 1]) box(S.dark, [sx * (hw - 0.02), topY - 0.1, mid(roof)], [0.012, 0.18, half(roof) * 0.7], 0, 0.005);   // porta de correr
        return P;
    }

    // Tamanho de lanternas/faróis (em coordenadas do modelo) para o sistema de luzes.
    // x = meia-distância lateral; zF/zR = posição z dos faróis/lanternas.
    static lamps(id) {
        const M = CarSheet.MODELS[id];
        return { x: M.wid / 2 - 0.31, zF: M.len / 2 - 0.05, zR: -M.len / 2 + 0.05 };
    }
}

// ----------------------------------------------------------------------------
// DoorSheet — a PORTA da frente de um modelo, abrindo, como sprite à parte desenhado por cima do carro.
// O quadro é pequeno e centrado na DOBRADIÇA (a porta gira em torno dela), em 32 direções como o carro:
// o jogo põe o quadro na posição da dobradiça do carro e usa o mesmo heading. 10 quadros = 2 lados × 5 ângulos
// (0–4: porta esquerda, 5–9: direita). Fechada, a porta já faz parte do sprite do carro (não há overlay).
// Mesma interface de folha do SpriteActor (getClip), assada aos poucos como as variantes amassadas.
// ----------------------------------------------------------------------------
class DoorSheet {
    static get ANGLES() { return 5; }                       // quadros de abertura por lado
    static get MAX_ANGLE() { return (78 * Math.PI) / 180; } // abertura máxima

    // Dobradiça (frente da porta) e comprimento da porta do motorista/passageiro, por modelo (z + = frente do carro).
    static get SPEC() {
        if (DoorSheet._spec) return DoorSheet._spec;
        const sedan = { h: 0.86, len: 1.05 };
        const out = {
            sedan, taxi: sedan,
            hatch: { h: 0.82, len: 1.0 },
            suv: { h: 0.98, len: 1.15 },
            pickup: { h: 1.2, len: 1.0 },
            van: { h: 1.55, len: 1.1 },
            sports: { h: 0.52, len: 0.95 },
        };
        for (const id of Object.keys(CarSheet.MODELS)) {                       // modelos novos: dobradiça junto ao fim do para-brisa
            if (out[id]) continue;
            const p = CarSheet.PARTS[id];
            out[id] = { h: Math.round((p.ws[1] - 0.05) * 100) / 100, len: Math.max(0.9, Math.min(1.2, (p.roof[1] - p.roof[0]) * 0.85)) };
        }
        return (DoorSheet._spec = out);
    }

    // Posição da dobradiça no carro (coordenadas do modelo) e da vaga "ao lado da porta" para o personagem.
    static hinge(modelId, sign) {
        const M = CarSheet.MODELS[modelId], D = DoorSheet.SPEC[modelId];
        return { x: sign * (M.wid / 2 - 0.05), z: D.h };
    }

    // Primitivas da porta `sign` (-1 esquerda / +1 direita) aberta em `ang` rad, com a origem na dobradiça.
    static prims(modelId, sign, ang) {
        const B = SpriteBaker, S = CarSheet.SLOT, D = DoorSheet.SPEC[modelId];
        const sn = Math.sin(ang), cs = Math.cos(ang);
        const dx = sign * sn, dz = -cs;                       // da dobradiça para a ponta livre da porta
        const a = Math.atan2(dx, dz), cx = dx * D.len / 2, cz = dz * D.len / 2;
        return [
            B.box(S.dark, [-sign * 0.06, 1.0, -D.len / 2], [0.07, 0.015, D.len / 2 - 0.02], 0, 0.01),            // vão da porta (fica no carro)
            B.box(S.paint, [cx, 0.68, cz], [0.11, 0.32, D.len / 2], a, 0.06),                                     // chapa da porta
            B.box(S.glass, [cx, 1.08, cz], [0.06, 0.08, D.len / 2 - 0.13], a, 0.03),                              // vidro da janela
            B.box(S.chrome, [dx * D.len * 0.8, 1.0, dz * D.len * 0.8], [0.075, 0.03, 0.07], a, 0.02),            // maçaneta
        ];
    }

    constructor(scene, modelId, palette, { frame = 64, dirs = 32 } = {}) {
        this.scene = scene;
        this.modelId = modelId;
        this.spec = Object.assign({ id: modelId }, CarSheet.MODELS[modelId]);
        this.dirs = dirs;
        this.frame = frame;
        this.palette = palette;
        this.name = 'door_' + modelId;
        this.ready = false;
        this._clip = null;
        this.frames = DoorSheet.ANGLES * 2;
        this._ms = 0;
        // PNG pronto (assets/sprites/door/<modelo>.png: colunas = direções, linhas = abertura da porta esquerda e depois da direita).
        const idx = SpriteIO.manifest ? SpriteIO.indices(DoorSheet.fileKey(modelId), dirs * frame, this.frames * frame) : null;
        if (idx) { this._finishTex(SpriteMaterial.indexTexture(scene, idx, dirs * frame, this.frames * frame)); return; }
        this._data = new Uint8Array(dirs * frame * this.frames * frame * 4);
        this._prims = [];
        for (const sign of [-1, 1]) {
            for (let k = 0; k < DoorSheet.ANGLES; k++) this._prims.push(DoorSheet.prims(modelId, sign, DoorSheet.MAX_ANGLE * (k + 1) / DoorSheet.ANGLES));
        }
        this._n = 0;                     // próximo (quadro × direção) a assar
        this._ms = 0;
    }

    // Assa por até `budgetMs`. Retorna true quando a folha ficou pronta.
    bake(budgetMs) {
        if (this.ready) return true;
        const t0 = performance.now(), F = this.frame, W = this.dirs * F, total = this.frames * this.dirs;
        while (this._n < total && performance.now() - t0 < budgetMs) {
            const f = Math.floor(this._n / this.dirs), d = this._n % this.dirs;
            this._n++;
            const img = SpriteBaker.bake(this._prims[f], { size: F, heading: (d * Math.PI * 2) / this.dirs, shadow: false });
            for (let y = 0; y < F; y++) this._data.set(img.subarray(y * F * 4, (y + 1) * F * 4), ((f * F + y) * W + d * F) * 4);
        }
        this._ms += performance.now() - t0;
        if (this._n >= total) this._finish();
        return this.ready;
    }

    static fileKey(modelId) { return 'door/' + modelId; }

    _finish() {
        this._finishTex(SpriteMaterial.atlasTexture(this.scene, this._data, this.dirs * this.frame, this.frames * this.frame));
        console.log(`[PORTAS] ${this.modelId}: ${this.frames} quadros × ${this.dirs} direções em ${this._ms.toFixed(0)} ms`);
    }

    _finishTex(tex) {
        const F = this.frame, W = this.dirs * F, H = this.frames * F;
        const material = SpriteMaterial.create(this.scene, this.name, tex, this.palette);
        this._clip = { name: 'static', weapon: 'none', frames: this.frames, dirs: this.dirs, fps: 1, loop: true, texture: tex, material, frame: F, W, H };
        this._data = null; this._prims = null;
        this.ready = true;
    }

    getClip() { return this._clip; }
}

// ----------------------------------------------------------------------------
// CarLibrary — paleta + folhas de todos os modelos (assadas na primeira vez que o
// modelo é pedido).
// ----------------------------------------------------------------------------
class CarLibrary {
    constructor(scene) {
        this.scene = scene;
        this.palette = CarSheet.createPalette(scene);
        this.sheets = {};
        this.dents = {};         // 'modelo#fase' -> CarSheet amassado (assado aos poucos)
        this.doors = {};         // 'modelo' -> DoorSheet (porta abrindo, assada aos poucos)
        this._jobs = [];
    }

    // Folha da porta do modelo (pode ainda estar sendo assada: confira `.ready`; já fica enfileirada).
    doorSheet(modelId) {
        let s = this.doors[modelId];
        if (!s) { s = this.doors[modelId] = new DoorSheet(this.scene, modelId, this.palette); this._jobs.push(s); }
        return s;
    }

    // Folha PRONTA do modelo (assa agora, de uma vez, se preciso: use na carga ou quando não dá para esperar).
    sheet(modelId) {
        let s = this.sheets[modelId];
        if (!s) { s = this.sheets[modelId] = new CarSheet(this.scene, modelId, this.palette); s.lib = this; }
        else if (!s.ready) s.bake(Infinity);                 // estava na fila (peek): termina já
        return s;
    }

    // Folha do modelo SE já estiver pronta; senão põe na fila (assada aos poucos por pump, sem travar o quadro) e devolve null.
    // O trânsito usa isto ao repor carros durante o jogo: assar todas as direções de um modelo novo de uma vez custava um engasgo visível.
    peek(modelId) {
        const s = this.sheets[modelId];
        if (s) return s.ready ? s : null;
        const n = this.sheets[modelId] = new CarSheet(this.scene, modelId, this.palette, { lazy: true });
        n.lib = this;
        this._jobs.push(n);
        return null;
    }

    // Alguma folha pronta de um modelo da classe `cls` (ex.: 'sedan' → sedan, sedan2…); senão de qualquer modelo. null se nenhuma.
    readyOf(cls) {
        for (const id of CarSheet.CLASSES[cls] || [cls]) { const s = this.sheets[id]; if (s && s.ready) return s; }
        for (const id of Object.keys(this.sheets)) { const s = this.sheets[id]; if (s.ready && !s.spec.bike) return s; }
        return null;
    }

    // Folha do modelo com amassado de fase `dent` (0 = limpo). null se ainda está sendo assada (já enfileirada).
    dentSheet(modelId, dent) {
        if (dent <= 0) return this.sheet(modelId);
        const key = modelId + '#' + dent;
        let s = this.dents[key];
        if (!s) {
            s = this.dents[key] = new CarSheet(this.scene, modelId, this.palette, { dent, lazy: true });
            s.lib = this;
            this._jobs.push(s);
        }
        return s.ready ? s : null;
    }

    // Libera da memória de vídeo as folhas que nenhum carro usa há um tempo (marcadas com _used pela varredura do Game): amassados e
    // portas (5 MB por modelo!) depois de 90 s, modelos limpos depois de 4 min. Sem isto elas só se acumulavam — numa sessão longa,
    // centenas de MB. Tudo volta sob demanda e em segundo plano (amassado: o carro mostra a fase pronta; porta: pré-assada ao chegar
    // perto; modelo: o trânsito usa outro já pronto). `keep`: folhas que nunca saem (viatura, SWAT, exército).
    sweep(now, keep) {
        let n = 0;
        const drop = (map, idle) => {
            for (const k of Object.keys(map)) {
                const s = map[k];
                if (!s.ready || keep.has(s)) continue;                       // (na fila de bake: deixa terminar)
                if (s._used === undefined) { s._used = now; continue; }
                if (now - s._used < idle) continue;
                const c = s.getClip();
                c.material.dispose(); c.texture.dispose();
                delete map[k];
                n++;
            }
        };
        drop(this.dents, 90);
        drop(this.doors, 90);
        drop(this.sheets, 240);
        return n;
    }

    // Assa as variantes amassadas pendentes, usando até `budgetMs` por frame. Retorna true se ainda há trabalho.
    pump(budgetMs = 5) {
        const t0 = performance.now();
        while (this._jobs.length && performance.now() - t0 < budgetMs) {
            const s = this._jobs[0];
            if (s.bake(Math.max(0.5, budgetMs - (performance.now() - t0)))) this._jobs.shift();
        }
        return this._jobs.length > 0;
    }

    // Folha do helicóptero da polícia (mesma paleta de pinturas dos carros).
    heliSheet() {
        return this._heli || (this._heli = new HeliSheet(this.scene, this.palette));
    }

    // Um modelo da classe de trânsito (ex.: 'sedan' -> sedan, sedan2, sedan3 ou sedan4). Id de modelo específico volta igual.
    variantOf(cls) {
        const list = CarSheet.CLASSES[cls];
        if (!list) return cls;
        return list[Math.floor(Math.random() * list.length)];
    }

    // Cor de fábrica sorteada do modelo (linha de PAINTS), para a variedade.
    randomPaint(modelId) {
        const pool = CarSheet.POOLS[modelId] || CarSheet.POOLS.sedan;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // Modelo aleatório pelos pesos do catálogo.
    randomModel() {
        const M = CarSheet.MODELS;
        const keys = Object.keys(M);
        let r = Math.random() * keys.reduce((s, k) => s + M[k].weight, 0);
        for (const k of keys) { r -= M[k].weight; if (r <= 0) return k; }
        return 'sedan';
    }
}
memoStatics(CarSheet, 'SLOT', 'PAINTS', 'STYLE', 'CLASSES', 'POOLS', 'MODELS');
memoStatics(DoorSheet, 'SPEC');
