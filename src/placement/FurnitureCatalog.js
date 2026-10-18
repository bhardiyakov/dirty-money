// ============================================================================
// FurnitureCatalog — the furniture the player can buy and place at home (HomeDecor), as GridManager definitions on the MICRO layer
// (cells of 0.5 u), plus the 3D template mesh of each piece for the InstancedRenderer.
//
// Interiors are painted for the top-down camera with flat, unlit colours, so the furniture is unlit too: each piece is a few
// boxes and octagonal prisms whose shading is BAKED into the vertex colours (top lit, the sides darker by direction). One shared
// material for every piece; the template is built once and cloned per (chunk, piece) batch.
//
// Definition: { numericId, key, name, icon, price, layer: 'micro', width, depth, walkable?, use?, parts(widthU, depthU) → part[] }
//   use: the piece WORKS like the painted one (Interiors.homeUse): 'bed' sleeps and saves, 'fridge' / 'safe' / 'chest' open the
//   stash, 'desk' opens the property's sheet — what makes a home bought without furniture livable.
//   numericId is what the saves store: never renumber a piece, only append new ones.
//   part: ['box', x0, y0, z0, x1, y1, z1, colorHex] | ['round', centerX, centerZ, radius, y0, y1, colorHex]
//   (local units, footprint centred on the origin, front of the piece = −z)
// ============================================================================

class FurnitureCatalog {
    static MATERIAL_NAME = 'furnitureVertexColorMaterial';
    static FACE_SHADES = { top: 1.0, rim: 0.7, front: 0.84, back: 0.66, side: 0.76 };
    static RIM_WIDTH = 0.07;                              // darker border on top faces: reads like the painted rooms' outlines
    static ROUND_SEGMENTS = 8;

    static DEFINITIONS = [
        {
            numericId: 1, key: 'chair', name: 'Cadeira', icon: '🪑', price: 180, width: 2, depth: 2,
            parts: (w, d) => [
                ['box', -0.42, 0, -0.42, 0.42, 0.55, 0.42, '#8a5a34'],
                ['box', -0.42, 0.55, 0.24, 0.42, 1.25, 0.42, '#6e4526'],
            ],
        },
        {
            numericId: 2, key: 'diningTable', name: 'Mesa de jantar', icon: '🍽️', price: 650, width: 5, depth: 3,
            parts: (w, d) => [
                ...FurnitureCatalog.legs(w / 2 - 0.15, d / 2 - 0.15, 0.95, 0.12, '#5c3a20'),
                ['box', -w / 2 + 0.05, 0.95, -d / 2 + 0.05, w / 2 - 0.05, 1.08, d / 2 - 0.05, '#9a6a3e'],
                ['box', -0.5, 1.08, -0.2, 0.5, 1.1, 0.2, '#e8e2d4'],
            ],
        },
        {
            numericId: 3, key: 'sofa', name: 'Sofá', icon: '🛋️', price: 1800, width: 8, depth: 3,
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 0.5, d / 2 - 0.05, '#3f5f8a'],
                ['box', -w / 2 + 0.05, 0.5, d / 2 - 0.45, w / 2 - 0.05, 1.25, d / 2 - 0.05, '#34507a'],
                ['box', -w / 2 + 0.05, 0.5, -d / 2 + 0.05, -w / 2 + 0.4, 0.85, d / 2 - 0.45, '#34507a'],
                ['box', w / 2 - 0.4, 0.5, -d / 2 + 0.05, w / 2 - 0.05, 0.85, d / 2 - 0.45, '#34507a'],
                ['box', -w / 2 + 0.45, 0.5, -d / 2 + 0.1, -0.03, 0.62, d / 2 - 0.5, '#4d70a0'],
                ['box', 0.03, 0.5, -d / 2 + 0.1, w / 2 - 0.45, 0.62, d / 2 - 0.5, '#4d70a0'],
            ],
        },
        {
            numericId: 4, key: 'armchair', name: 'Poltrona', icon: '💺', price: 900, width: 3, depth: 3,
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 0.5, d / 2 - 0.05, '#8a3a34'],
                ['box', -w / 2 + 0.05, 0.5, d / 2 - 0.4, w / 2 - 0.05, 1.2, d / 2 - 0.05, '#74302a'],
                ['box', -w / 2 + 0.05, 0.5, -d / 2 + 0.05, -w / 2 + 0.32, 0.82, d / 2 - 0.4, '#74302a'],
                ['box', w / 2 - 0.32, 0.5, -d / 2 + 0.05, w / 2 - 0.05, 0.82, d / 2 - 0.4, '#74302a'],
            ],
        },
        {
            numericId: 5, key: 'coffeeTable', name: 'Mesa de centro', icon: '☕', price: 350, width: 4, depth: 3,
            parts: (w, d) => [
                ...FurnitureCatalog.legs(w / 2 - 0.15, d / 2 - 0.15, 0.45, 0.1, '#2e2a28'),
                ['box', -w / 2 + 0.05, 0.45, -d / 2 + 0.05, w / 2 - 0.05, 0.55, d / 2 - 0.05, '#c8d4dc'],
                ['round', 0.3, 0, 0.18, 0.55, 0.62, '#c0392b'],
            ],
        },
        {
            numericId: 6, key: 'doubleBed', name: 'Cama de casal', icon: '🛏️', price: 2500, width: 7, depth: 10, use: 'bed',
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 0.45, d / 2 - 0.05, '#6e4526'],
                ['box', -w / 2 + 0.05, 0.45, d / 2 - 0.3, w / 2 - 0.05, 1.3, d / 2 - 0.05, '#5c3a20'],
                ['box', -w / 2 + 0.15, 0.45, -d / 2 + 0.15, w / 2 - 0.15, 0.75, d / 2 - 0.3, '#f0ece4'],
                ['box', -w / 2 + 0.15, 0.75, -d / 2 + 0.15, w / 2 - 0.15, 0.82, d / 2 - 1.6, '#3f6a8a'],
                ['box', -w / 2 + 0.35, 0.75, d / 2 - 1.3, -0.12, 0.95, d / 2 - 0.45, '#ffffff'],
                ['box', 0.12, 0.75, d / 2 - 1.3, w / 2 - 0.35, 0.95, d / 2 - 0.45, '#ffffff'],
            ],
        },
        {
            numericId: 7, key: 'bookshelf', name: 'Estante', icon: '📚', price: 700, width: 5, depth: 2,
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 2.2, d / 2 - 0.05, '#7a5030'],
                ['box', -w / 2 + 0.2, 2.2, -d / 2 + 0.15, -0.6, 2.32, d / 2 - 0.15, '#c0392b'],
                ['box', -0.5, 2.2, -d / 2 + 0.15, 0.3, 2.28, d / 2 - 0.15, '#2f6f9a'],
                ['box', 0.4, 2.2, -d / 2 + 0.15, w / 2 - 0.2, 2.36, d / 2 - 0.15, '#d4a02a'],
            ],
        },
        {
            numericId: 8, key: 'tvRack', name: 'Rack com TV', icon: '📺', price: 3200, width: 6, depth: 2,
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 0.6, d / 2 - 0.05, '#2e2a28'],
                ['box', -w / 2 + 0.35, 0.6, 0.15, w / 2 - 0.35, 1.9, 0.3, '#16181c'],
                ['box', -w / 2 + 0.45, 0.7, 0.1, w / 2 - 0.45, 1.8, 0.15, '#34506a'],
            ],
        },
        {
            numericId: 9, key: 'plant', name: 'Planta', icon: '🪴', price: 120, width: 2, depth: 2,
            parts: (w, d) => [
                ['round', 0, 0, 0.36, 0, 0.6, '#a0522d'],
                ['round', 0, 0, 0.5, 0.6, 1.2, '#3c8a3c'],
                ['round', 0.05, -0.05, 0.34, 1.2, 1.6, '#4caa44'],
            ],
        },
        {
            numericId: 10, key: 'floorLamp', name: 'Luminária', icon: '💡', price: 260, width: 2, depth: 2,
            parts: (w, d) => [
                ['round', 0, 0, 0.3, 0, 0.08, '#2e2a28'],
                ['box', -0.05, 0.08, -0.05, 0.05, 1.7, 0.05, '#2e2a28'],
                ['round', 0, 0, 0.42, 1.7, 2.15, '#f6e2a8'],
            ],
        },
        {
            numericId: 11, key: 'rug', name: 'Tapete', icon: '🟥', price: 400, width: 8, depth: 6, walkable: true,
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 0.03, d / 2 - 0.05, '#8a2a3a'],
                ['box', -w / 2 + 0.4, 0.03, -d / 2 + 0.4, w / 2 - 0.4, 0.04, d / 2 - 0.4, '#c8a050'],
                ['box', -w / 2 + 0.6, 0.04, -d / 2 + 0.6, w / 2 - 0.6, 0.05, d / 2 - 0.6, '#8a2a3a'],
            ],
        },
        {
            numericId: 12, key: 'gunRack', name: 'Expositor de armas', icon: '🔫', price: 1500, width: 6, depth: 2,
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 2.0, d / 2 - 0.05, '#3a3632'],
                ['box', -w / 2 + 0.3, 2.0, -0.12, -0.3, 2.08, 0.12, '#1c1c1e'],
                ['box', 0.3, 2.0, -0.12, w / 2 - 0.3, 2.08, 0.12, '#1c1c1e'],
                ['box', -0.2, 2.0, -0.3, 0.2, 2.1, 0.3, '#6e4526'],
            ],
        },
        {
            numericId: 13, key: 'moneyStack', name: 'Pilha de dinheiro', icon: '💵', price: 5000, width: 2, depth: 2,
            parts: (w, d) => [
                ['box', -0.4, 0, -0.3, 0.4, 0.3, 0.3, '#3f8a4a'],
                ['box', -0.3, 0.3, -0.25, 0.35, 0.55, 0.25, '#4caa5a'],
                ['box', -0.2, 0.55, -0.2, 0.25, 0.75, 0.2, '#3f8a4a'],
            ],
        },
        {
            numericId: 14, key: 'singleBed', name: 'Cama de solteiro', icon: '🛌', price: 900, width: 4, depth: 8, use: 'bed',
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 0.4, d / 2 - 0.05, '#8a6a44'],
                ['box', -w / 2 + 0.05, 0.4, d / 2 - 0.25, w / 2 - 0.05, 1.1, d / 2 - 0.05, '#6e4526'],
                ['box', -w / 2 + 0.12, 0.4, -d / 2 + 0.12, w / 2 - 0.12, 0.68, d / 2 - 0.25, '#e8e2d4'],
                ['box', -w / 2 + 0.12, 0.68, -d / 2 + 0.12, w / 2 - 0.12, 0.74, d / 2 - 1.3, '#5a8a5a'],
                ['box', -w / 2 + 0.3, 0.68, d / 2 - 1.1, w / 2 - 0.3, 0.86, d / 2 - 0.35, '#ffffff'],
            ],
        },
        {
            numericId: 15, key: 'fridge', name: 'Geladeira', icon: '🧊', price: 1400, width: 2, depth: 2, use: 'fridge',
            parts: (w, d) => [
                ['box', -w / 2 + 0.04, 0, -d / 2 + 0.04, w / 2 - 0.04, 1.95, d / 2 - 0.04, '#e8ecef'],
                ['box', w / 2 - 0.2, 1.95, -d / 2 + 0.1, w / 2 - 0.12, 1.97, d / 2 - 0.1, '#8a9096'],
            ],
        },
        {
            numericId: 16, key: 'chest', name: 'Baú', icon: '🧰', price: 600, width: 3, depth: 2, use: 'chest',
            parts: (w, d) => [
                ['box', -w / 2 + 0.05, 0, -d / 2 + 0.05, w / 2 - 0.05, 0.7, d / 2 - 0.05, '#8a5a30'],
                ['box', -w / 2 + 0.2, 0.7, -d / 2 + 0.05, -w / 2 + 0.32, 0.72, d / 2 - 0.05, '#3a3d44'],
                ['box', w / 2 - 0.32, 0.7, -d / 2 + 0.05, w / 2 - 0.2, 0.72, d / 2 - 0.05, '#3a3d44'],
                ['box', -0.1, 0.7, -d / 2 + 0.05, 0.1, 0.73, -d / 2 + 0.3, '#d9b030'],
            ],
        },
        {
            numericId: 17, key: 'safe', name: 'Cofre', icon: '🔐', price: 2200, width: 2, depth: 2, use: 'safe',
            parts: (w, d) => [
                ['box', -w / 2 + 0.06, 0, -d / 2 + 0.06, w / 2 - 0.06, 0.95, d / 2 - 0.06, '#3a4048'],
                ['round', 0, -0.05, 0.18, 0.95, 0.98, '#6a727c'],
                ['round', 0, -0.05, 0.06, 0.98, 1.0, '#d9b030'],
            ],
        },
        {
            numericId: 18, key: 'desk', name: 'Escrivaninha com notebook', icon: '💻', price: 1600, width: 4, depth: 2, use: 'desk',
            parts: (w, d) => [
                ...FurnitureCatalog.legs(w / 2 - 0.12, d / 2 - 0.12, 0.8, 0.1, '#5a3e24'),
                ['box', -w / 2 + 0.05, 0.8, -d / 2 + 0.05, w / 2 - 0.05, 0.9, d / 2 - 0.05, '#7a5a3a'],
                ['box', -0.45, 0.9, -0.3, 0.45, 0.94, 0.25, '#2a2c32'],
                ['box', -0.38, 0.94, -0.22, 0.38, 0.95, 0.18, '#6ac0e8'],
            ],
        },
    ];

    // Four table legs at (±halfX, ±halfZ).
    static legs(halfX, halfZ, height, thickness, colorHex) {
        const half = thickness / 2;
        return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([signX, signZ]) => (
            ['box', signX * halfX - half, 0, signZ * halfZ - half, signX * halfX + half, height, signZ * halfZ + half, colorHex]
        ));
    }

    static registry() {
        return new Map(FurnitureCatalog.DEFINITIONS.map((definition) => [definition.numericId, Object.assign({ layer: 'micro' }, definition)]));
    }

    static sharedMaterial(scene) {
        const existingMaterial = scene.getMaterialByName(FurnitureCatalog.MATERIAL_NAME);
        if (existingMaterial) return existingMaterial;
        const material = new BABYLON.StandardMaterial(FurnitureCatalog.MATERIAL_NAME, scene);
        material.disableLighting = true;
        material.diffuseColor = BABYLON.Color3.Black();
        material.specularColor = BABYLON.Color3.Black();
        material.emissiveColor = BABYLON.Color3.White();
        material.backFaceCulling = false;
        return material;
    }

    // The piece's template mesh: every part merged into one geometry, shading in the vertex colours.
    static createTemplateMesh(definition, scene) {
        const cellSize = GridManager.cellSizeOf(definition.layer);
        const geometry = { positions: [], normals: [], colors: [], indices: [] };
        for (const part of definition.parts(definition.width * cellSize, definition.depth * cellSize)) {
            if (part[0] === 'box') FurnitureCatalog.appendBox(geometry, part);
            else FurnitureCatalog.appendRound(geometry, part);
        }
        const mesh = new BABYLON.Mesh(`furniture_${definition.key}`, scene);
        const vertexData = new BABYLON.VertexData();
        Object.assign(vertexData, geometry);
        vertexData.applyToMesh(mesh, false);
        mesh.material = FurnitureCatalog.sharedMaterial(scene);
        return mesh;
    }

    static appendQuad(geometry, corners, normal, rgb) {
        const firstVertex = geometry.positions.length / 3;
        for (const corner of corners) {
            geometry.positions.push(corner[0], corner[1], corner[2]);
            geometry.normals.push(normal[0], normal[1], normal[2]);
            geometry.colors.push(rgb[0], rgb[1], rgb[2], 1);
        }
        geometry.indices.push(firstVertex, firstVertex + 1, firstVertex + 2, firstVertex, firstVertex + 2, firstVertex + 3);
    }

    static shaded(colorHex, shade) {
        const color = BABYLON.Color3.FromHexString(colorHex);
        return [color.r * shade, color.g * shade, color.b * shade];
    }

    // Five faces (no bottom), wound clockwise seen from outside (Babylon's left-handed default).
    static appendBox(geometry, [, x0, y0, z0, x1, y1, z1, colorHex]) {
        const shades = FurnitureCatalog.FACE_SHADES;
        FurnitureCatalog.appendTop(geometry, x0, z0, x1, z1, y1, colorHex);
        FurnitureCatalog.appendQuad(geometry, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], FurnitureCatalog.shaded(colorHex, shades.front));
        FurnitureCatalog.appendQuad(geometry, [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [0, 0, 1], FurnitureCatalog.shaded(colorHex, shades.back));
        FurnitureCatalog.appendQuad(geometry, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0], FurnitureCatalog.shaded(colorHex, shades.side));
        FurnitureCatalog.appendQuad(geometry, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], FurnitureCatalog.shaded(colorHex, shades.side));
    }

    // The top face; wide enough tops get a darker rim around a lit centre (seen from above, that rim is the piece's outline).
    static appendTop(geometry, x0, z0, x1, z1, y, colorHex) {
        const shades = FurnitureCatalog.FACE_SHADES, rim = FurnitureCatalog.RIM_WIDTH, up = [0, 1, 0];
        const quad = (a0, b0, a1, b1, shade) => FurnitureCatalog.appendQuad(geometry, [[a0, y, b0], [a0, y, b1], [a1, y, b1], [a1, y, b0]], up, FurnitureCatalog.shaded(colorHex, shade));
        if (x1 - x0 < rim * 4 || z1 - z0 < rim * 4) { quad(x0, z0, x1, z1, shades.top); return; }
        quad(x0 + rim, z0 + rim, x1 - rim, z1 - rim, shades.top);
        quad(x0, z0, x1, z0 + rim, shades.rim);
        quad(x0, z1 - rim, x1, z1, shades.rim);
        quad(x0, z0 + rim, x0 + rim, z1 - rim, shades.rim);
        quad(x1 - rim, z0 + rim, x1, z1 - rim, shades.rim);
    }

    // Octagonal prism: the sides shaded by how much they face the front, plus a top fan.
    static appendRound(geometry, [, centerX, centerZ, radius, y0, y1, colorHex]) {
        const segmentCount = FurnitureCatalog.ROUND_SEGMENTS, shades = FurnitureCatalog.FACE_SHADES;
        const pointAt = (index, y) => {
            const angle = (index / segmentCount) * Math.PI * 2;
            return [centerX + Math.cos(angle) * radius, y, centerZ + Math.sin(angle) * radius];
        };
        for (let index = 0; index < segmentCount; index++) {
            const middleAngle = ((index + 0.5) / segmentCount) * Math.PI * 2;
            const normal = [Math.cos(middleAngle), 0, Math.sin(middleAngle)];
            const facingFront = -normal[2];
            const shade = shades.side + (facingFront > 0 ? (shades.front - shades.side) * facingFront : (shades.side - shades.back) * facingFront);
            FurnitureCatalog.appendQuad(geometry, [pointAt(index + 1, y0), pointAt(index + 1, y1), pointAt(index, y1), pointAt(index, y0)], normal, FurnitureCatalog.shaded(colorHex, shade));
        }
        const topColor = FurnitureCatalog.shaded(colorHex, shades.top);
        const centerVertex = geometry.positions.length / 3;
        geometry.positions.push(centerX, y1, centerZ);
        geometry.normals.push(0, 1, 0);
        geometry.colors.push(topColor[0], topColor[1], topColor[2], 1);
        for (let index = 0; index < segmentCount; index++) {
            const rimPoint = pointAt(index, y1);
            geometry.positions.push(rimPoint[0], rimPoint[1], rimPoint[2]);
            geometry.normals.push(0, 1, 0);
            geometry.colors.push(topColor[0], topColor[1], topColor[2], 1);
        }
        for (let index = 0; index < segmentCount; index++) {
            geometry.indices.push(centerVertex, centerVertex + 1 + ((index + 1) % segmentCount), centerVertex + 1 + index);
        }
    }
}
