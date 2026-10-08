// ============================================================================
// PropSprites — vegetação e adereços de rua como sprites pré-renderizados
// (mesmo SpriteBaker e visual do personagem): carvalho, pinheiro, palmeira,
// arbusto e guarda-sol. Todos num único atlas pequeno + paleta própria.
//
// Copas altas (árvores) ficam ACIMA dos personagens (y=3,2) e usam o shader com
// fade pontilhado em volta do jogador: dá para andar embaixo de uma árvore sem
// ela esconder o personagem. Arbustos/guarda-sóis ficam baixos (y=0,9).
// ============================================================================

const PropSprites = {
    FRAME: 120,                 // px por frame (6u): sobra margem para a copa entortar sem cortar.
    COLS: 4,
    // Slots de rampa dos props.
    SLOT: { leaf: 1, trunk: 2, accent: 3, a: 4, b: 5, pole: 6 },

    // Linhas da paleta (variantes de cor).
    ROWS: [
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 0 carvalho
        { leaf: '#6aa843', trunk: '#6b4a2a', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 1 carvalho claro
        { leaf: '#2f6b3a', trunk: '#5a3b22', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 2 pinheiro
        { leaf: '#59a63a', trunk: '#7a5230', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 3 palmeira
        { leaf: '#45913b', trunk: '#6b4a2a', accent: '#e8456a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 4 arbusto
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#9a9aa2' },   // 5 guarda-sol vermelho
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#e8c24a', a: '#2f86d0', b: '#f4f1e8', pole: '#9a9aa2' },   // 6 guarda-sol azul
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#e8c24a', a: '#e8b422', b: '#f4f1e8', pole: '#9a9aa2' },   // 7 guarda-sol amarelo
        { leaf: '#8a8780', trunk: '#6a5a48', accent: '#b4b0a6', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 8 pedra
        { leaf: '#7c9440', trunk: '#5e6a2e', accent: '#b6a24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 9 junco do pântano
        { leaf: '#a89a4e', trunk: '#7a6a3a', accent: '#d8c878', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 10 mato seco
        { leaf: '#3f7a3a', trunk: '#6b4a2a', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 11 cipreste/mangue
        { leaf: '#b9c0c8', trunk: '#7a8088', accent: '#e6eaee', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 12 silo
        { leaf: '#d6b64c', trunk: '#a8892e', accent: '#ecd47a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 13 feno
        { leaf: '#5f9a45', trunk: '#6b4a2a', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 14 pomar
        { leaf: '#2d7a3c', trunk: '#5a3b22', accent: '#d8e04a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 15 mata atlântica (copa densa)
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#f2d22e', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 16 ipê amarelo
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#ec6fb4', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 17 ipê rosa
        { leaf: '#7cc04a', trunk: '#6b4a2a', accent: '#e8d24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 18 bananeira
        { leaf: '#3f9a52', trunk: '#6b4a2a', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 19 samambaia
        { leaf: '#2a6a50', trunk: '#5a3b22', accent: '#e8c24a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 20 araucária
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#e8456a', a: '#f2d22e', b: '#ffffff', pole: '#8a8a90' },   // 21 flores
        { leaf: '#22262b', trunk: '#d4dade', accent: '#2f6fb5', a: '#9a7448', b: '#d9d2b0', pole: '#4a8a4a' },   // 22 lixo e sujeira
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#9a6fd8', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 23 jacarandá
        { leaf: '#4f9a3a', trunk: '#6b4a2a', accent: '#e8452a', a: '#d9453a', b: '#f4f1e8', pole: '#8a8a90' },   // 24 flamboyant
    ],

    // Lista de frames do atlas: { kind, row, seed }.
    FRAMES: [
        { kind: 'oak', row: 0, seed: 1 }, { kind: 'oak', row: 1, seed: 2 }, { kind: 'oak', row: 0, seed: 3 }, { kind: 'oak', row: 1, seed: 4 },
        { kind: 'pine', row: 2, seed: 1 }, { kind: 'pine', row: 2, seed: 2 }, { kind: 'pine', row: 2, seed: 3 },
        { kind: 'palm', row: 3, seed: 1 }, { kind: 'palm', row: 3, seed: 2 }, { kind: 'palm', row: 3, seed: 3 },
        { kind: 'bush', row: 4, seed: 1 }, { kind: 'bush', row: 4, seed: 2 }, { kind: 'bush', row: 4, seed: 3 },
        { kind: 'umbrella', row: 5, seed: 1 }, { kind: 'umbrella', row: 6, seed: 2 }, { kind: 'umbrella', row: 7, seed: 3 },
        { kind: 'boulder', row: 8, seed: 1 }, { kind: 'boulder', row: 8, seed: 2 }, { kind: 'boulder', row: 8, seed: 3 }, { kind: 'boulder', row: 8, seed: 4 },
        { kind: 'reed', row: 9, seed: 1 }, { kind: 'reed', row: 9, seed: 2 }, { kind: 'reed', row: 9, seed: 3 },
        { kind: 'dry', row: 10, seed: 1 }, { kind: 'dry', row: 10, seed: 2 }, { kind: 'dry', row: 10, seed: 3 },
        { kind: 'cypress', row: 11, seed: 1 }, { kind: 'cypress', row: 11, seed: 2 }, { kind: 'cypress', row: 11, seed: 3 },
        { kind: 'silo', row: 12, seed: 1 }, { kind: 'silo', row: 12, seed: 2 },
        { kind: 'hay', row: 13, seed: 1 }, { kind: 'hay', row: 13, seed: 2 }, { kind: 'hay', row: 13, seed: 3 },
        { kind: 'orchard', row: 14, seed: 1 }, { kind: 'orchard', row: 14, seed: 2 },
        // Mata atlântica e variedades.
        { kind: 'jungle', row: 15, seed: 1 }, { kind: 'jungle', row: 15, seed: 2 }, { kind: 'jungle', row: 0, seed: 3 }, { kind: 'jungle', row: 15, seed: 4 },
        { kind: 'araucaria', row: 20, seed: 1 }, { kind: 'araucaria', row: 20, seed: 2 }, { kind: 'araucaria', row: 20, seed: 3 },
        { kind: 'ipe', row: 16, seed: 1 }, { kind: 'ipe', row: 16, seed: 2 }, { kind: 'ipe', row: 17, seed: 3 }, { kind: 'ipe', row: 17, seed: 4 },
        { kind: 'ipe', row: 23, seed: 5 }, { kind: 'ipe', row: 24, seed: 6 },
        { kind: 'juca', row: 15, seed: 1 }, { kind: 'juca', row: 15, seed: 2 }, { kind: 'juca', row: 3, seed: 3 },
        { kind: 'banana', row: 18, seed: 1 }, { kind: 'banana', row: 18, seed: 2 }, { kind: 'banana', row: 18, seed: 3 },
        { kind: 'fern', row: 19, seed: 1 }, { kind: 'fern', row: 19, seed: 2 }, { kind: 'fern', row: 19, seed: 3 }, { kind: 'fern', row: 15, seed: 4 },
        { kind: 'flowers', row: 21, seed: 1 }, { kind: 'flowers', row: 21, seed: 2 }, { kind: 'flowers', row: 21, seed: 3 },
        // Sujeira (favela): sacos de lixo, entulho, manchas.
        { kind: 'trash', row: 22, seed: 1 }, { kind: 'trash', row: 22, seed: 2 }, { kind: 'trash', row: 22, seed: 3 }, { kind: 'trash', row: 22, seed: 4 },
        { kind: 'debris', row: 22, seed: 1 }, { kind: 'debris', row: 22, seed: 2 }, { kind: 'debris', row: 22, seed: 3 },
        { kind: 'stain', row: 22, seed: 1 }, { kind: 'stain', row: 22, seed: 2 },
    ],

    // Altura de desenho (y do quad) por tipo.
    // REGRA: toda vegetação (e o guarda-sol) fica ACIMA de pedestres (y 0,5), carros (y 1,5+) e personagens pulando; só rochas, fardos e sujeira ficam no chão.
    HEIGHT: { oak: 3.2, pine: 3.2, palm: 3.4, bush: 2.2, umbrella: 2.2, boulder: 0.9, reed: 2.2, dry: 2.2, cypress: 3.2, silo: 4.5, hay: 0.9, orchard: 2.6,
        jungle: 3.4, araucaria: 3.4, ipe: 3.2, juca: 3.4, banana: 2.4, fern: 2.2, flowers: 2.2, trash: 0.6, debris: 0.6, stain: 0.3 },

    // Tipos assados com a câmera inclinada dos personagens 2,5D (graus de elevação, SpriteBaker.bake `elev`): o pé fica no centro
    // do quadro e o resto sobe para o norte, no mesmo ângulo dos NPCs. Os demais seguem vistos de cima.
    TILT: { umbrella: 56 },

    // Raio da copa/volume (u, na escala 1) de cada tipo: quão longe da pista a planta precisa ficar (RoadPlan.onPavement).
    CROWN: { oak: 2.3, pine: 2.0, palm: 2.3, bush: 1.1, cypress: 1.5, orchard: 1.8, reed: 0.9, dry: 0.9, boulder: 0.8, hay: 0.8, silo: 1.6,
        jungle: 2.6, araucaria: 2.3, ipe: 2.3, juca: 2.2, banana: 1.8, fern: 1.0, flowers: 0.8 },

    // Quanto cada tipo balança ao vento (0 = rígido). Troncos grossos balançam pouco; juncos, samambaias e folhas grandes, muito.
    SWAY: { oak: 0.6, pine: 0.5, palm: 1.0, bush: 0.7, cypress: 0.6, orchard: 0.6, reed: 1.5, dry: 0.9, jungle: 0.55, araucaria: 0.45, ipe: 0.65, juca: 1.1, banana: 1.2, fern: 1.3, flowers: 1.0 },

    // ------------------------------------------------------------------ modelos
    model(kind, seed) {
        const B = SpriteBaker, S = this.SLOT;
        const r = Pixel.rng(seed * 7919 + kind.length * 131);
        const P = [];
        const TAU = Math.PI * 2;

        if (kind === 'oak') {
            P.push(B.sphere(S.leaf, [0, 3.0, 0], 1.35));
            const n = 7, off = r() * TAU;
            for (let k = 0; k < n; k++) {
                const a = off + (k / n) * TAU + (r() - 0.5) * 0.5, d = 0.95 + r() * 0.4;
                P.push(B.sphere(S.leaf, [Math.cos(a) * d, 2.55 + r() * 0.7, Math.sin(a) * d], 0.8 + r() * 0.4));
            }
            P.push(B.sphere(S.leaf, [(r() - 0.5) * 0.6, 3.7, (r() - 0.5) * 0.6], 0.75));
            P.push(B.sphere(S.trunk, [0.2, 1.2, -0.1], 0.2));   // tronco espiando (invisível sob a copa)
        } else if (kind === 'pine') {
            P.push(B.sphere(S.leaf, [0, 3.9, 0], 0.5));
            const off = r() * TAU;
            for (let k = 0; k < 11; k++) {
                const a = off + (k / 11) * TAU, R = 1.55 + r() * 0.3;
                P.push(B.capsule(S.leaf, [0, 3.7, 0], [Math.cos(a) * R, 2.2, Math.sin(a) * R], 0.32));
            }
            for (let k = 0; k < 8; k++) {
                const a = off + ((k + 0.5) / 8) * TAU, R = 0.95 + r() * 0.2;
                P.push(B.capsule(S.leaf, [0, 4.1, 0], [Math.cos(a) * R, 3.3, Math.sin(a) * R], 0.27));
            }
        } else if (kind === 'palm') {
            P.push(B.sphere(S.trunk, [0, 4.5, 0], 0.42));
            const n = 9, off = r() * TAU;
            for (let k = 0; k < n; k++) {
                const a = off + (k / n) * TAU + (r() - 0.5) * 0.3;
                const ca = Math.cos(a), sa = Math.sin(a), L = 1.0 + r() * 0.3;
                P.push(B.capsule(S.leaf, [0, 4.4, 0], [ca * 1.2, 4.7, sa * 1.2], 0.2));
                P.push(B.capsule(S.leaf, [ca * 1.2, 4.7, sa * 1.2], [ca * (1.2 + L), 3.8, sa * (1.2 + L)], 0.15));
            }
            P.push(B.sphere(S.trunk, [0.25, 4.3, 0.1], 0.2));
        } else if (kind === 'boulder') {
            // Rochedo: um bloco grande achatado com 2–3 pedras menores e lascas claras por cima.
            P.push(B.ellipsoid(S.leaf, [0, 0.55, 0], [1.05 + r() * 0.25, 0.6, 0.9 + r() * 0.25], r() * 3));
            const n = 2 + Math.floor(r() * 2), off = r() * TAU;
            for (let k = 0; k < n; k++) {
                const a = off + (k / n) * TAU, d = 0.9 + r() * 0.35;
                P.push(B.ellipsoid(S.leaf, [Math.cos(a) * d, 0.3, Math.sin(a) * d], [0.5 + r() * 0.2, 0.35, 0.45 + r() * 0.2], r() * 3));
            }
            for (let k = 0; k < 3; k++) P.push(B.sphere(S.accent, [(r() - 0.5) * 1.1, 1.0, (r() - 0.5) * 0.9], 0.16));
        } else if (kind === 'reed') {
            // Moita de junco: feixes de hastes inclinadas com espigas.
            const n = 9 + Math.floor(r() * 4);
            for (let k = 0; k < n; k++) {
                const a = r() * TAU, d = r() * 0.55, lean = 0.2 + r() * 0.35, h = 0.9 + r() * 0.8;
                const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
                P.push(B.capsule(S.leaf, [bx, 0.1, bz], [bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean], 0.07));
                if (r() < 0.45) P.push(B.sphere(S.accent, [bx + Math.cos(a) * lean, h + 0.08, bz + Math.sin(a) * lean], 0.1));
            }
        } else if (kind === 'dry') {
            // Moita seca de cerrado: pequenos tufos amarelados com gravetos.
            P.push(B.sphere(S.leaf, [0, 0.5, 0], 0.62));
            for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + r(); P.push(B.sphere(S.leaf, [Math.cos(a) * 0.55, 0.35, Math.sin(a) * 0.55], 0.38 + r() * 0.15)); }
            for (let k = 0; k < 3; k++) { const a = r() * TAU; P.push(B.capsule(S.trunk, [0, 0.3, 0], [Math.cos(a) * 0.8, 1.0 + r() * 0.3, Math.sin(a) * 0.8], 0.05)); }
        } else if (kind === 'silo') {
            // Silo de grãos visto de cima: cilindro alto de chapa com tampa cônica e anéis.
            for (let k = 0; k < 6; k++) P.push(B.sphere(S.leaf, [0, 1.0 + k * 0.75, 0], 1.55));
            P.push(B.sphere(S.accent, [0, 5.4, 0], 1.3));
            P.push(B.sphere(S.trunk, [0.3, 5.8, 0.2], 0.35));
        } else if (kind === 'hay') {
            // Fardo redondo de feno deitado.
            P.push(B.ellipsoid(S.leaf, [0, 0.55, 0], [0.95, 0.6, 0.65], r() * 3));
            P.push(B.ellipsoid(S.accent, [0, 0.9, 0], [0.7, 0.2, 0.45], 0));
        } else if (kind === 'orchard') {
            // Árvore frutífera baixa e redonda, com frutas.
            P.push(B.sphere(S.leaf, [0, 1.7, 0], 1.05));
            for (let k = 0; k < 5; k++) { const a = r() * TAU; P.push(B.sphere(S.leaf, [Math.cos(a) * 0.7, 1.5 + r() * 0.5, Math.sin(a) * 0.7], 0.6)); }
            for (let k = 0; k < 6; k++) P.push(B.sphere(S.accent, [(r() - 0.5) * 1.6, 1.9 + r() * 0.5, (r() - 0.5) * 1.6], 0.1));
            P.push(B.sphere(S.trunk, [0.15, 0.7, 0], 0.16));
        } else if (kind === 'cypress') {
            // Cipreste/mangue: copa estreita e alta, tronco aparente.
            P.push(B.sphere(S.leaf, [0, 3.3, 0], 0.85));
            for (let k = 0; k < 5; k++) P.push(B.sphere(S.leaf, [(r() - 0.5) * 0.9, 2.2 + r() * 1.7, (r() - 0.5) * 0.9], 0.62 + r() * 0.22));
            P.push(B.sphere(S.trunk, [0.1, 1.0, 0], 0.18));
        } else if (kind === 'jungle') {
            // Árvore de mata atlântica (jequitibá/figueira): copa larga e escura, epífitas (bromélias) por cima.
            P.push(B.sphere(S.leaf, [0, 3.1, 0], 1.4));
            for (let k = 0; k < 9; k++) {
                const a = (k / 9) * TAU + r() * 0.5, d = 1.0 + r() * 0.35;
                P.push(B.sphere(S.leaf, [Math.cos(a) * d, 2.6 + r() * 0.8, Math.sin(a) * d], 0.8 + r() * 0.25));
            }
            for (let k = 0; k < 4; k++) P.push(B.sphere(S.leaf, [(r() - 0.5) * 1.4, 3.8 + r() * 0.3, (r() - 0.5) * 1.4], 0.7));
            for (let k = 0; k < 6; k++) P.push(B.sphere(S.accent, [(r() - 0.5) * 2.4, 3.9 + r() * 0.3, (r() - 0.5) * 2.4], 0.13));
            P.push(B.sphere(S.trunk, [0.2, 1.2, -0.1], 0.22));
        } else if (kind === 'araucaria') {
            // Pinheiro-do-paraná: candelabro de galhos em camadas, pontas arredondadas.
            const off = r() * TAU;
            for (let t = 0; t < 3; t++) {
                const y = 3.7 - t * 0.55, R = 0.95 + t * 0.6;
                for (let k = 0; k < 9; k++) {
                    const a = off + (k / 9) * TAU + t * 0.4, ca = Math.cos(a), sa = Math.sin(a);
                    P.push(B.capsule(S.leaf, [0, y + 0.25, 0], [ca * R, y, sa * R], 0.2));
                    P.push(B.sphere(S.leaf, [ca * R, y, sa * R], 0.36 + r() * 0.1));
                }
            }
            P.push(B.sphere(S.leaf, [0, 4.1, 0], 0.5));
            P.push(B.sphere(S.trunk, [0, 3.0, 0], 0.18));
        } else if (kind === 'ipe') {
            // Árvore florida (ipê/jacarandá/flamboyant): copa de carvalho coberta de flores da cor do `accent`.
            P.push(B.sphere(S.leaf, [0, 3.0, 0], 1.25));
            for (let k = 0; k < 7; k++) {
                const a = (k / 7) * TAU + r() * 0.5, d = 0.9 + r() * 0.4;
                P.push(B.sphere(S.leaf, [Math.cos(a) * d, 2.6 + r() * 0.6, Math.sin(a) * d], 0.75 + r() * 0.3));
            }
            for (let k = 0; k < 16; k++) {
                const a = r() * TAU, d = r() * 1.7;
                P.push(B.sphere(S.accent, [Math.cos(a) * d, 3.5 + r() * 0.6, Math.sin(a) * d], 0.2 + r() * 0.1));
            }
            P.push(B.sphere(S.trunk, [0.2, 1.2, -0.1], 0.2));
        } else if (kind === 'juca') {
            // Palmito-juçara: palmeira esguia da mata, folhas finas e arqueadas.
            P.push(B.sphere(S.trunk, [0, 4.4, 0], 0.26));
            const n = 8, off = r() * TAU;
            for (let k = 0; k < n; k++) {
                const a = off + (k / n) * TAU + (r() - 0.5) * 0.3, ca = Math.cos(a), sa = Math.sin(a);
                P.push(B.capsule(S.leaf, [0, 4.5, 0], [ca * 1.4, 4.7, sa * 1.4], 0.11));
                P.push(B.capsule(S.leaf, [ca * 1.4, 4.7, sa * 1.4], [ca * 2.2, 3.7, sa * 2.2], 0.09));
            }
        } else if (kind === 'banana') {
            // Bananeira: folhas enormes caindo para fora e um cacho.
            const n = 8, off = r() * TAU;
            for (let k = 0; k < n; k++) {
                const a = off + (k / n) * TAU + (r() - 0.5) * 0.3, ca = Math.cos(a), sa = Math.sin(a);
                P.push(B.capsule(S.leaf, [0, 1.3, 0], [ca * 0.9, 1.6, sa * 0.9], 0.24));
                P.push(B.capsule(S.leaf, [ca * 0.9, 1.6, sa * 0.9], [ca * 1.8, 0.9, sa * 1.8], 0.2));
            }
            P.push(B.sphere(S.trunk, [0, 0.8, 0], 0.2));
            P.push(B.sphere(S.accent, [0.25, 0.9, 0.1], 0.16));
        } else if (kind === 'fern') {
            // Samambaia: frondes arqueadas saindo do centro.
            const n = 10, off = r() * TAU;
            for (let k = 0; k < n; k++) {
                const a = off + (k / n) * TAU + (r() - 0.5) * 0.3, ca = Math.cos(a), sa = Math.sin(a), L = 0.9 + r() * 0.4;
                P.push(B.capsule(S.leaf, [0, 0.3, 0], [ca * L * 0.5, 0.85, sa * L * 0.5], 0.1));
                P.push(B.capsule(S.leaf, [ca * L * 0.5, 0.85, sa * L * 0.5], [ca * L, 0.35, sa * L], 0.085));
            }
        } else if (kind === 'flowers') {
            P.push(B.sphere(S.leaf, [0, 0.3, 0], 0.5));
            const slots = [S.accent, S.a, S.b];
            for (let k = 0; k < 11; k++) {
                const a = r() * TAU, d = r() * 0.85;
                P.push(B.sphere(slots[Math.floor(r() * 3)], [Math.cos(a) * d, 0.5 + r() * 0.3, Math.sin(a) * d], 0.11));
            }
        } else if (kind === 'trash') {
            // Sacos de lixo jogados (pretos, brancos, azuis) com nó no topo, papelão e garrafa.
            const slots = [S.leaf, S.trunk, S.accent, S.leaf], n = 3 + Math.floor(r() * 3);
            for (let k = 0; k < n; k++) {
                const m = slots[Math.floor(r() * slots.length)], x = (r() - 0.5) * 1.1, z = (r() - 0.5) * 0.9;
                P.push(B.ellipsoid(m, [x, 0.2, z], [0.32 + r() * 0.1, 0.22, 0.28 + r() * 0.08], r() * 3));
                P.push(B.sphere(m, [x + (r() - 0.5) * 0.1, 0.46, z], 0.08));
            }
            for (let k = 0; k < 3; k++) P.push(B.box(S.a, [(r() - 0.5) * 1.6, 0.04, (r() - 0.5) * 1.4], [0.2 + r() * 0.15, 0.03, 0.14 + r() * 0.1], r() * 3, 0.02, { flat: true }));
            P.push(B.capsule(S.pole, [-0.7, 0.08, 0.5], [-0.4, 0.1, 0.62], 0.07));
        } else if (kind === 'debris') {
            // Entulho: caixas de papelão amassadas, tábuas, papéis e garrafas.
            for (let k = 0; k < 3; k++) P.push(B.box(S.a, [(r() - 0.5) * 1.4, 0.15, (r() - 0.5) * 1.2], [0.28 + r() * 0.2, 0.14, 0.22 + r() * 0.2], r() * 3, 0.03));
            for (let k = 0; k < 2; k++) { const x = (r() - 0.5) * 1.5, z = (r() - 0.5) * 1.2, a = r() * 3; P.push(B.capsule(S.trunk, [x, 0.1, z], [x + Math.cos(a) * 0.8, 0.12, z + Math.sin(a) * 0.8], 0.06)); }
            for (let k = 0; k < 5; k++) P.push(B.box(S.b, [(r() - 0.5) * 1.8, 0.03, (r() - 0.5) * 1.5], [0.12 + r() * 0.1, 0.02, 0.1 + r() * 0.08], r() * 3, 0.01, { flat: true }));
            P.push(B.capsule(S.pole, [0.5, 0.08, -0.4], [0.75, 0.1, -0.3], 0.06));
        } else if (kind === 'stain') {
            // Mancha de lama/óleo/esgoto com restos.
            P.push(B.ellipsoid(S.leaf, [0, 0.02, 0], [0.9 + r() * 0.3, 0.02, 0.6 + r() * 0.3], r() * 3, { flat: true }));
            P.push(B.ellipsoid(S.leaf, [0.5, 0.02, 0.2], [0.45, 0.02, 0.35], r() * 3, { flat: true }));
            for (let k = 0; k < 4; k++) P.push(B.box(S.b, [(r() - 0.5) * 1.6, 0.04, (r() - 0.5) * 1.1], [0.1, 0.02, 0.08], r() * 3, 0.01, { flat: true }));
        } else if (kind === 'bush') {
            P.push(B.sphere(S.leaf, [0, 0.7, 0], 0.8));
            const n = 3 + Math.floor(r() * 3), off = r() * TAU;
            for (let k = 0; k < n; k++) {
                const a = off + (k / n) * TAU, d = 0.55 + r() * 0.3;
                P.push(B.sphere(S.leaf, [Math.cos(a) * d, 0.45 + r() * 0.3, Math.sin(a) * d], 0.5 + r() * 0.2));
            }
            for (let k = 0; k < 4; k++) P.push(B.sphere(S.accent, [(r() - 0.5) * 1.3, 1.25, (r() - 0.5) * 1.3], 0.11));
        } else if (kind === 'umbrella') {
            // Assado inclinado (TILT): cúpula de 8 gomos (cor e branco) sobre o mastro, que aparece por baixo, como os NPCs a 56°.
            P.push(B.ellipsoid(S.a, [0, 2.0, 0], [1.55, 0.5, 1.55], r() * TAU, { cut: 1.98, panels: 8, mat2: S.b }));
            P.push(B.capsule(S.pole, [0, 0.0, 0], [0, 2.45, 0], 0.05));
            P.push(B.sphere(S.pole, [0, 2.55, 0], 0.08));
            P.push(B.ellipsoid(S.pole, [0, 0.03, 0], [0.24, 0.05, 0.24], 0));
            // Toalha ao lado.
            P.push(B.box(S.b, [1.9, 0.04, -1.1], [0.55, 0.04, 0.9], 0.3, 0.02, { flat: true }));
        }
        return P;
    },
    // ------------------------------------------------------------------ vento
    // Cada planta que balança tem 3 MODOS de sprites, assados com o modelo realmente entortado (nada de distorcer pixels):
    //   0 LEVE   vento normal (tempo bom)          1 FORTE   ventania (garoa/chuva forte)          2 INTENSO  tempestade (> 100 km/h)
    // Cada modo é um ciclo de ANIM_FRAMES quadros (copa que vai e volta, galhos e folhas defasados; mais inclinação a favor do
    // vento nos modos fortes). O shader escolhe o quadro pelo tempo + uma fase própria de cada planta (alfa da cor do vértice),
    // então as árvores não balançam todas em uníssono. Plantas rígidas (rochas, silos, lixo...) usam só o atlas estático.
    ANIM_FRAMES: 4,
    MODES: [
        { name: 'leve',    amp: 0.2,  lean: 0.0,  flutter: 0.2,  cps: 0.5 },     // amp/lean em unidades de mundo (× SWAY do tipo); cps = ciclos por segundo
        { name: 'forte',   amp: 0.42, lean: 0.12, flutter: 0.45, cps: 1.1 },
        { name: 'intenso', amp: 0.62, lean: 0.3,  flutter: 0.85, cps: 2.0 },
    ],

    // Entorta as primitivas de um modelo: deslocamento horizontal que cresce com a altura (a copa mexe, o pé fica), com um balanço
    // principal em fase com o quadro, um desvio por peça (folhas/galhos defasados) e a inclinação constante a favor do vento (+X).
    sway(prims, kind, mode, f) {
        const M = this.MODES[mode], k = this.SWAY[kind] || 0.6;
        let hm = 0.3;
        for (const p of prims) { const y = p.t === 'c' ? Math.max(p.a[1], p.b[1]) : p.c[1]; if (y > hm) hm = y; }
        const ph = (f / this.ANIM_FRAMES) * Math.PI * 2, A = M.amp * k, L = M.lean * k;
        const off = (pt, i) => {
            const h = Math.pow(Math.min(1, Math.max(0, pt[1]) / hm), 1.25);
            const g = Math.sin(ph + pt[0] * 0.35 + pt[2] * 0.2), fl = Math.sin(ph * 2 + i * 1.9 + pt[0]);
            return [pt[0] + (A * g + L + A * M.flutter * 0.5 * fl) * h, pt[1], pt[2] + (A * 0.45 * Math.cos(ph + 0.7 + i * 0.4) + A * M.flutter * 0.25 * fl) * h];
        };
        return prims.map((p, i) => {
            const q = Object.assign({}, p);
            if (p.t === 'c') { q.a = off(p.a, i); q.b = off(p.b, i); } else q.c = off(p.c, i);
            return q;
        });
    },

    registerSway() {
        if (this._swayRegistered) return;
        this._swayRegistered = true;
        BABYLON.Effect.ShadersStore['propSwayVertexShader'] = `
            precision highp float;
            attribute vec3 position;
            attribute vec2 uv;
            attribute vec4 color;
            uniform mat4 worldViewProjection;
            uniform mat4 world;
            varying vec2 vUV;
            varying float vVariant;
            varying float vShade;
            varying float vSway;
            varying float vPh;
            varying vec3 vWorld;
            void main(void) {
                vUV = uv;
                vVariant = color.r;
                vShade = color.g;
                vSway = color.b;
                vPh = color.a;
                vWorld = (world * vec4(position, 1.0)).xyz;
                gl_Position = worldViewProjection * vec4(position, 1.0);
            }`;
        BABYLON.Effect.ShadersStore['propSwayFragmentShader'] = `
            precision highp float;
            varying vec2 vUV;
            varying float vVariant;
            varying float vShade;
            varying float vSway;
            varying float vPh;
            varying vec3 vWorld;
            uniform sampler2D atlas;
            uniform sampler2D anim0;
            uniform sampler2D anim1;
            uniform sampler2D anim2;
            uniform sampler2D palette;
            uniform vec2 palSize;
            uniform vec3 tint;
            uniform float shadowAlpha;
            uniform vec2 focus;
            uniform float fadeR;
            uniform float useFade;
            uniform float time;
            uniform float mode;
            uniform float cps;
            uniform float animStep;
            uniform float sharp;            // gráfico suave (Smooth): px da tela por px da arte (≥ 1) | 0 = pixels duros (pixel art)
            uniform vec2 atlasSize;
            uniform vec2 animSize;
            vec4 raw(vec2 uv) {
                if (vSway < 0.01) return texture2D(atlas, uv);
                if (mode < 0.5) return texture2D(anim0, uv);
                if (mode < 1.5) return texture2D(anim1, uv);
                return texture2D(anim2, uv);
            }
            // pixel do atlas empacotado (RG8: r = rampa*5+nível, 255 = sombra; g = alfa) → cor PRÉ-MULTIPLICADA
            vec4 px(vec4 t) {
                if (t.g < 0.5) return vec4(0.0);
                float idx = floor(t.r * 255.0 + 0.5);
                if (idx > 250.0) return vec4(vec3(0.0, 0.0, 0.05) * shadowAlpha, shadowAlpha);
                vec2 puv = vec2((idx + 0.5) / palSize.x, (floor(vVariant + 0.5) + 0.5) / palSize.y);
                return vec4(texture2D(palette, puv).rgb * tint * vShade, 1.0);
            }
            void main(void) {
                vec2 uv = vUV;
                if (vSway > 0.01) uv += vec2(0.0, floor(mod(time * cps * 4.0 + vPh * 4.0, 4.0)) * animStep);
                float k = useFade > 0.5 ? clamp(length(vWorld.xz - focus) / fadeR, 0.0, 1.0) : 1.0;
                if (sharp > 0.5) {
                    // Gráfico suave: bilinear feito à mão sobre a cor JÁ pintada (o atlas tem códigos de paleta, não cores), com o miolo
                    // de cada pixel da arte nítido (sharp) — só a borda entre dois pixels é suavizada: sem serrilhado e sem borrar.
                    vec2 sz = vSway > 0.01 ? animSize : atlasSize;
                    vec2 p = uv * sz - 0.5, i = floor(p), f = clamp((p - i - 0.5) * sharp + 0.5, 0.0, 1.0);
                    vec4 c = mix(mix(px(raw((i + 0.5) / sz)), px(raw((i + vec2(1.5, 0.5)) / sz)), f.x),
                                 mix(px(raw((i + vec2(0.5, 1.5)) / sz)), px(raw((i + 1.5) / sz)), f.x), f.y);
                    if (c.a < 0.02) discard;
                    gl_FragColor = vec4(c.rgb / c.a, c.a * smoothstep(0.2, 1.0, k));
                    return;
                }
                vec4 c = px(raw(uv));
                if (c.a <= 0.0) discard;
                if (c.a < 0.999) { gl_FragColor = vec4(0.0, 0.0, 0.05, shadowAlpha); return; }
                gl_FragColor = vec4(c.rgb, smoothstep(0.2, 1.0, k));
            }`;
    },

    swayMaterial(scene, name, atlas, anims, palette, fade) {
        this.registerSway();
        const m = new BABYLON.ShaderMaterial(name, scene, { vertex: 'propSway', fragment: 'propSway' }, {
            attributes: ['position', 'uv', 'color'],
            uniforms: ['worldViewProjection', 'world', 'palSize', 'tint', 'shadowAlpha', 'focus', 'fadeR', 'useFade', 'time', 'mode', 'cps', 'animStep', 'sharp', 'atlasSize', 'animSize'],
            samplers: ['atlas', 'anim0', 'anim1', 'anim2', 'palette'],
            needAlphaBlending: true,
        });
        m.setTexture('atlas', atlas);
        anims.forEach((t, i) => m.setTexture('anim' + i, t));
        m.setTexture('palette', palette.texture);
        m.setVector2('palSize', new BABYLON.Vector2(palette.width, palette.height));
        m.setColor3('tint', SpriteMaterial.sharedTint());
        m.setFloat('shadowAlpha', 0.36);
        m.setVector2('focus', new BABYLON.Vector2(0, 0));
        m.setFloat('fadeR', 3.4);
        m.setFloat('useFade', fade ? 1 : 0);
        m.setFloat('time', 0);
        m.setFloat('mode', 0);
        m.setFloat('cps', this.MODES[0].cps);
        m.setFloat('animStep', 1 / this.ANIM_FRAMES);
        const size = (t) => { const s = t && t.getSize ? t.getSize() : { width: 1, height: 1 }; return new BABYLON.Vector2(s.width, s.height); };
        m.setVector2('atlasSize', size(atlas));
        m.setVector2('animSize', size(anims[0]));          // (os 3 atlas animados têm o mesmo tamanho)
        m.setFloat('sharp', 0);                            // (Smooth.zoom liga o caminho suave)
        m.backFaceCulling = false;
        return m;
    },

    // Rampas de 5 tons de uma linha da paleta, indexadas pelo número do slot.
    rampsFor(row) {
        const out = {};
        for (const slot of Object.keys(this.SLOT)) out[this.SLOT[slot]] = Pixel.ramp5(this.ROWS[row][slot]);
        return out;
    },

    // ------------------------------------------------------------------- atlas
    // Atlas ESTÁTICO (todos os frames, parados) + 3 atlas ANIMADOS (um por modo de vento) só com as plantas que balançam: cada um com
    // ANIM_FRAMES cópias da grade. Devolve { materials, rect(i), animRect(i), pick(kind, rnd), setWind(t, modo), setFocus }.
    create(scene) {
        const t0 = performance.now();
        const F = this.FRAME, cols = this.COLS, rows = Math.ceil(this.FRAMES.length / cols);
        const W = cols * F, H = rows * F;
        const data = new Uint8Array(W * H * 4);
        const put = (buf, bw, img, cx, cy) => { for (let y = 0; y < F; y++) buf.set(img.subarray(y * F * 4, (y + 1) * F * 4), ((cy + y) * bw + cx) * 4); };

        this.FRAMES.forEach((fr, i) => put(data, W, SpriteBaker.bake(this.model(fr.kind, fr.seed), { size: F, shadowLen: 0.5, elev: this.TILT[fr.kind] || 0 }), (i % cols) * F, Math.floor(i / cols) * F));
        const tex = (buf, w, h) => SpriteMaterial.atlasTexture(scene, buf, w, h);       // 2 bytes/pixel (metade da memória)
        const atlas = tex(data, W, H);

        // Atlas animados: j = índice entre as plantas que balançam; quadro f fica f*arows linhas abaixo (deslocamento constante no shader).
        const sw = [], jOf = new Map();
        this.FRAMES.forEach((fr, i) => { if (this.SWAY[fr.kind]) { jOf.set(i, sw.length); sw.push(i); } });
        const AC = 16, arows = Math.ceil(sw.length / AC), AW = AC * F, AH = arows * this.ANIM_FRAMES * F;
        // Só o vento LEVE (tempo bom) é assado na carga. Vento forte e tempestade (só com chuva, ~30% dos dias) são assados aos poucos
        // quando o tempo vira (bakeStep, com orçamento por quadro) e descartados depois de um tempo de céu limpo: cada atlas tem
        // 1920×1920 (≈7 MB de vídeo) e a carga ficava mais lenta com os três. Enquanto o atlas do modo não fica pronto, as plantas usam
        // o maior modo já pronto (a chuva começa em garoa: dá tempo).
        const bakeJob = (mode) => ({ mode, buf: new Uint8Array(AW * AH * 4), n: 0, total: this.ANIM_FRAMES * sw.length });
        const bakeStep = (job, budgetMs) => {
            const t1 = performance.now();
            while (job.n < job.total && performance.now() - t1 < budgetMs) {
                const f = Math.floor(job.n / sw.length), j = job.n % sw.length, fr = this.FRAMES[sw[j]];
                const prims = this.sway(this.model(fr.kind, fr.seed), fr.kind, job.mode, f);
                put(job.buf, AW, SpriteBaker.bake(prims, { size: F, shadowLen: 0.5 }), (j % AC) * F, (f * arows + Math.floor(j / AC)) * F);
                job.n++;
            }
            if (job.n < job.total) return null;
            const t = tex(job.buf, AW, AH);
            job.buf = null;
            return t;
        };
        const anims = [bakeStep(bakeJob(0), Infinity), null, null];

        // Paleta: 1 linha por variante; x = rampa*5 + nível (mesmo formato dos personagens).
        const PW = 8 * 5, PH = this.ROWS.length;
        const pdata = new Uint8Array(PW * PH * 4);
        this.ROWS.forEach((row, ri) => {
            for (const slot of Object.keys(this.SLOT)) {
                const ramp = Pixel.ramp5(row[slot]);
                for (let lv = 0; lv < 5; lv++) {
                    const o = (ri * PW + this.SLOT[slot] * 5 + lv) * 4;
                    pdata[o] = ramp[lv][0]; pdata[o + 1] = ramp[lv][1]; pdata[o + 2] = ramp[lv][2]; pdata[o + 3] = 255;
                }
            }
        });
        const ptex = BABYLON.RawTexture.CreateRGBATexture(pdata, PW, PH, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        ptex.wrapU = ptex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const palette = { texture: ptex, width: PW, height: PH };

        const bound = [anims[0], anims[0], anims[0]];      // modo sem atlas próprio usa o do vento leve
        const focusV = new BABYLON.Vector2(0, 0);
        let job = null, calm = 0;
        const api = {
            frame: F, W, H, atlas, anims,
            hiMaterial: PropSprites.swayMaterial(scene, 'propsHi', atlas, bound, palette, true),
            loMaterial: PropSprites.swayMaterial(scene, 'propsLo', atlas, bound, palette, false),
            // Retângulo UV de um frame estático (norte = linha de cima da imagem).
            rect: (i) => {
                const u0 = ((i % cols) * F) / W, v0 = (Math.floor(i / cols) * F) / H;
                return [u0, v0, u0 + F / W, v0 + F / H];
            },
            // Retângulo UV do quadro 0 do frame nos atlas animados (null se a planta não balança).
            animRect: (i) => {
                const j = jOf.get(i);
                if (j === undefined) return null;
                const u0 = ((j % AC) * F) / AW, v0 = (Math.floor(j / AC) * F) / AH;
                return [u0, v0, u0 + F / AW, v0 + F / AH];
            },
            // Escolhe um frame aleatório do tipo (rnd em 0..1).
            pick: (kind, rnd) => {
                const idx = [];
                this.FRAMES.forEach((fr, i) => { if (fr.kind === kind) idx.push(i); });
                const i = idx[Math.min(idx.length - 1, Math.floor(rnd * idx.length))];
                return { index: i, row: this.FRAMES[i].row, kind };
            },
            // t = tempo (s); mode = 0 leve | 1 forte | 2 intenso. Chamado todo quadro (WorldBuilder.update): também assa aos poucos o
            // atlas do modo pedido e solta os de vento forte depois de ~2 min de vento leve.
            setWind: (t, mode, dt = 1 / 30) => {
                if (mode > 0 && !anims[mode] && !job) job = bakeJob(mode);
                if (job) {
                    const done = bakeStep(job, 2);
                    if (done) { anims[job.mode] = done; api._bind(); job = null; }
                }
                calm = mode === 0 ? calm + dt : 0;
                if (calm > 120 && (anims[1] || anims[2])) {
                    for (const k of [1, 2]) if (anims[k]) { anims[k].dispose(); anims[k] = null; }
                    api._bind();
                }
                let use = mode;
                while (use > 0 && !anims[use]) use--;
                for (const m of [api.hiMaterial, api.loMaterial]) { m.setFloat('time', t); m.setFloat('mode', use); m.setFloat('cps', PropSprites.MODES[use].cps); }
            },
            _bind: () => {
                for (let k = 1; k < 3; k++) {
                    const tx = anims[k] || anims[0];
                    if (bound[k] === tx) continue;
                    bound[k] = tx;
                    for (const m of [api.hiMaterial, api.loMaterial]) m.setTexture('anim' + k, tx);
                }
            },
            setFocus: (x, z, r) => { focusV.set(x, z); api.hiMaterial.setVector2('focus', focusV); if (r > 0) api.hiMaterial.setFloat('fadeR', r); },
            // Gráfico suave (Smooth.zoom): px da tela por px da arte; 0 = pixels duros.
            setSharp: (s) => { if (s === api._sharp) return; api._sharp = s; for (const m of [api.hiMaterial, api.loMaterial]) m.setFloat('sharp', s); },
        };
        console.log(`[PROPS] ${this.FRAMES.length} frames + ${sw.length}×${this.ANIM_FRAMES} de vento leve em ${(performance.now() - t0).toFixed(0)} ms (atlas animado ${AW}×${AH})`);
        return api;
    },
};
