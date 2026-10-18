// ============================================================================
// Carros: catálogo, pinturas e a biblioteca de modelos. O DESENHO vem do atlas pronto (CarArt / assets/cars/carros-atlas.js,
// gerado por tools/carros): 36 modelos vistos de cima, cada um repintável em qualquer linha de PAINTS e com 3 fases de amassado.
//
//   CarSheet.MODELS  catálogo: dimensões (do desenho), física e desempenho de cada modelo
//   CarSheet         "folha" de UM modelo: o que o Vehicle precisa saber dele (spec, modelId) — sem textura própria
//   DoorSheet        medidas da porta de cada modelo (dobradiça, comprimento) — a porta aberta é desenhada pelo CarDoors
//   CarLibrary       paleta (barcos e helicóptero ainda são procedurais e usam as mesmas pinturas) + modelos por classe
//
// O corpo 3D do carro continua existindo por baixo (física e sombra no chão); o sprite é um quad do lote único do CarArt.
// ============================================================================

class CarSheet {
    // Slots de rampa da paleta procedural (barcos e helicóptero): pintura, pintura 2, vidro, escuro/pneus, cromado, farol, lanterna, letreiro.
    static get SLOT() { return { paint: 1, paint2: 2, glass: 3, dark: 4, chrome: 5, head: 6, tail: 7, sign: 8, seat: 9, trim: 10 }; }

    // Pinturas (linha da tabela de pinturas). paint2 = detalhe (faixas, teto de outra cor). burnt: carcaça carbonizada | worn: desbotada.
    static get PAINTS() {
        const old = { glass: '#2f3a42', chrome: '#8d9296', head: '#d8cc98', tail: '#6a2a2a', worn: true };
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
            { name: 'carbonizado', paint: '#27221f', paint2: '#2d2824', seat: '#1d1a18', trim: '#2a2522', glass: '#0b0b0e', chrome: '#4a433e', head: '#2d2a27', tail: '#2d2723', sign: '#3a3530', burnt: true },
            // 13..18: carros VELHOS (tinta desbotada) — favela e estradas de terra. O trânsito sorteia estas por lugar.
            Object.assign({ name: 'ferrugem', paint: '#8a5a3a', paint2: '#8a5a3a' }, old),
            Object.assign({ name: 'vermelho velho', paint: '#a8453c', paint2: '#a8453c' }, old),
            Object.assign({ name: 'azul fosco', paint: '#4a6a98', paint2: '#4a6a98' }, old),
            Object.assign({ name: 'verde musgo', paint: '#5a7a58', paint2: '#5a7a58' }, old),
            Object.assign({ name: 'bege', paint: '#b9a98a', paint2: '#b9a98a' }, old),
            Object.assign({ name: 'cinza chapa', paint: '#7c8085', paint2: '#7c8085' }, old),
            // 19..39: cores de fábrica novas (metálicas, pérola, vivas). paint2 = detalhe (teto/listras).
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
            // Só da loja de TUNAGEM (Tuning): fx = acabamento no carro 3D — 1 fosco (sem verniz), 2 cromado (espelho), 3 perolizado
            // (muda de cor com o ângulo: de `paint` para `paint2`).
            { name: 'preto fosco', paint: '#1d1e21', paint2: '#1d1e21', fx: 1 },
            { name: 'grafite fosco', paint: '#4f535a', paint2: '#4f535a', fx: 1 },
            { name: 'verde oliva fosco', paint: '#4c5a3a', paint2: '#4c5a3a', fx: 1 },
            { name: 'azul petróleo fosco', paint: '#24465a', paint2: '#24465a', fx: 1 },
            { name: 'areia fosco', paint: '#b7a27a', paint2: '#b7a27a', fx: 1 },
            { name: 'cromado', paint: '#c9ced6', paint2: '#c9ced6', fx: 2 },
            { name: 'cromado dourado', paint: '#d4af37', paint2: '#d4af37', fx: 2 },
            { name: 'cromado rosé', paint: '#c98f86', paint2: '#c98f86', fx: 2 },
            { name: 'perolizado azul-roxo', paint: '#2448c8', paint2: '#8a2be2', fx: 3 },
            { name: 'perolizado verde-dourado', paint: '#1d7a52', paint2: '#c9a52c', fx: 3 },
            { name: 'candy vermelho', paint: '#8e0816', paint2: '#ff4040', fx: 3 },
            { name: 'perolizado branco-rosa', paint: '#f2efe8', paint2: '#e3a9c8', fx: 3 },
            { name: 'camaleão', paint: '#1aa39a', paint2: '#b0249c', fx: 3 },
        ];
    }

    // Catálogo de modelos (ids = os do atlas). len/wid (≈ metros) vêm do DESENHO; power/mass dão o freio (a arrancada vem de t100, abaixo); maxSpeed (m/s) e
    // turn (rad/s) são do modelo; cruise = fator da velocidade de cruzeiro da IA; weight = frequência dentro da classe; hp = resistência
    // (amassa em 3 fases e, a 0, pega fogo e explode); tank = litros. Nomes fictícios inspirados em carros reais.
    static get MODELS() {
        const S = (name, model, cls, mass, power, maxSpeed, turn, cruise, weight, hp, tank) => ({ name, model, cls, mass, power, maxSpeed, turn, cruise, weight, hp, tank });
        const M = {
            // populares (compactos)
            hatch_moderno:        S('Compacto', 'Órbita 1.0 Turbo',      'hatch',  760,  9800, 25, 2.3, 1.05, 24, 85, 44),
            hatch_moderno2:       S('Compacto', 'Brisa Vision 1.0',      'hatch',  740,  9500, 25, 2.3, 1.05, 22, 85, 50),
            compacto_aventureiro: S('Compacto', 'Kiwi Outsider',         'hatch',  680,  8200, 23, 2.4, 1.0,  14, 80, 38),
            quadradinho:          S('Compacto', 'Unno Mille Fire',       'hatch',  640,  7600, 22, 2.5, 1.0,  18, 75, 48),
            hatch_esportivo:      S('Compacto', 'Urbano GTI',            'hatch',  860, 13000, 29, 2.45, 1.12, 7, 85, 50),
            mini_eletrico:        S('Compacto', 'Volt Mini EV',          'hatch',  800,  9000, 24, 2.5, 1.0,   8, 80, 40),
            // antigos (favela, estradas de terra e os bairros)
            besouro:              S('Clássico', 'Besouro 1300',          'old',    720,  6200, 20, 2.2, 0.85, 16, 70, 40),
            seda_classico:        S('Sedã', 'Chevy 1.6 SL',              'old',    800,  7000, 21, 2.1, 0.88, 14, 80, 45),
            hatch_90:             S('Compacto', 'Bola 1000',             'old',    760,  7400, 22, 2.3, 0.9,  16, 75, 47),
            hatch_80:             S('Compacto', 'Quadrado CL 1.6',       'old',    780,  7600, 22, 2.25, 0.9, 16, 75, 47),
            sedan_70:             S('Sedã', 'Opalão Comodoro 4.1',       'old',   1150, 11500, 26, 1.9, 0.95,  7, 105, 84),
            brasilia:             S('Perua', 'Brasa 1600',               'old',    790,  6800, 21, 2.2, 0.85, 10, 75, 40),
            perua_antiga:         S('Perua', 'Caravela Diplomata',       'old',   1100, 10000, 24, 1.9, 0.9,   8, 100, 65),
            // SUVs e jipe
            suv_compacto:         S('SUV', 'Kreta Limited',              'suv',   1250, 11500, 25, 1.95, 0.98, 16, 120, 50),
            suv_cupe:             S('SUV', 'Horizon Touring',            'suv',   1220, 11800, 26, 2.0, 1.0,  14, 115, 50),
            suv_quadrado:         S('SUV', 'Renegado Trailhawk',         'suv',   1350, 12000, 24, 1.85, 0.95, 12, 130, 55),
            suv_grande:           S('SUV', 'Montanha SRX 7L',            'suv',   1900, 16000, 27, 1.65, 0.98, 8, 150, 80),
            jipe_offroad:         S('Jipe', 'Trilha T4 4x4',             'suv',   1450, 12500, 23, 1.8, 0.92,  6, 140, 70),
            // sedãs
            sedan_popular:        S('Sedã', 'Prismo Joy 1.4',            'sedan',  880,  9500, 25, 2.1, 1.0,  24, 95, 54),
            sedan_medio:          S('Sedã', 'Corona XEi 2.0',            'sedan', 1050, 11500, 27, 2.0, 1.02, 20, 105, 50),
            sedan_luxo:           S('Sedã', 'Imperial E300 Luxo',        'sedan', 1500, 16500, 30, 1.8, 1.02,  8, 130, 70),
            // esportivos e superesportivos
            esportivo:            S('Esportivo', 'Bavária M-Sport',      'sports', 1150, 21000, 36, 2.3, 1.18, 6, 85, 60),
            muscle:               S('Esportivo', 'Mustango V8 GT',       'sports', 1350, 23000, 37, 2.1, 1.18, 5, 95, 61),
            super:                S('Superesportivo', 'Maranello Stallion', 'super', 1300, 30000, 44, 2.1, 1.3, 2, 75, 80),
            super2:               S('Superesportivo', "Sant'Agata Toro", 'super', 1350, 32000, 46, 2.0, 1.35, 2, 75, 85),
            // picapes
            picape_pequena:       S('Picape', 'Estrada Working 1.4',     'pickup',  900,  9000, 24, 2.1, 0.95, 14, 100, 55),
            picape_media:         S('Picape', 'Hilo SRV 4x4',            'pickup', 1700, 14000, 27, 1.7, 0.95, 10, 140, 80),
            picape_grande:        S('Picape', 'Rancher V8 Super Duty',   'pickup', 2100, 16500, 26, 1.55, 0.92, 5, 160, 110),
            // vans
            van_furgao:           S('Van', 'Cargo Express 415',          'van',   1800, 11500, 22, 1.5, 0.82, 10, 150, 75),
            kombi:                S('Van', 'Kombi Brisa',                'van',   1100,  7500, 19, 1.7, 0.8,   6, 100, 45),
            minivan:              S('Van', 'Spina Família 7L',           'van',   1250, 10000, 24, 1.8, 0.92, 10, 115, 53),
            // táxis (pintura própria)
            taxi_sp:              S('Táxi', 'City Cab Paulista',         'taxi',   950, 10500, 27, 2.0, 1.1,   6, 100, 50),
            taxi_rio:             S('Táxi', 'City Cab Carioca',          'taxi',   950, 10500, 27, 2.0, 1.1,   6, 100, 50),
            // forças (pintura própria; o trânsito nunca sorteia — weight 0)
            viatura:              S('Viatura', 'Patrulha Corona 2.0',    'police',  900, 10000, 26, 2.0, 1.0,  0, 100, 50),
            swat_van:             S('Blindado', 'Tático Blindado',       'swat',  1700, 11000, 21, 1.5, 0.82,  0, 150, 90),
            militar:              S('Jipe', 'Marruá AM2 Militar',        'army',  1300, 12500, 26, 1.8, 0.95,  0, 130, 80),
        };
        // Arrancada: 0–100 km/h (s) do carro real em que o modelo se inspira — a aceleração vem DAQUI (Vehicle.drive), proporcional à
        // potência de verdade: popular 1.0 ~16 s, sedã médio ~10 s, esportivo ~4,5 s, superesportivo ~3 s. Quem tem máxima abaixo de
        // 100 km/h acelera no mesmo ritmo até o teto dele.
        const T100 = {
            hatch_moderno: 11.5, hatch_moderno2: 14, compacto_aventureiro: 15, quadradinho: 16, hatch_esportivo: 7.5, mini_eletrico: 10,
            besouro: 22, seda_classico: 15, hatch_90: 16, hatch_80: 13, sedan_70: 11, brasilia: 20, perua_antiga: 13,
            suv_compacto: 11.5, suv_cupe: 10.5, suv_quadrado: 11, suv_grande: 9, jipe_offroad: 13,
            sedan_popular: 13, sedan_medio: 10, sedan_luxo: 6.5,
            esportivo: 4.5, muscle: 4.8, super: 3.0, super2: 2.9,
            picape_pequena: 14, picape_media: 11, picape_grande: 9.5,
            van_furgao: 18, kombi: 22, minivan: 14,
            taxi_sp: 10, taxi_rio: 10, viatura: 10, swat_van: 16, militar: 14,
        };
        for (const id of Object.keys(M)) M[id].t100 = T100[id] || 13;
        // Medidas do desenho (atlas): comprimento e largura da carroceria, luzes, giroflex.
        for (const id of Object.keys(M)) {
            const a = CarArt.available() ? CarArt.model(id) : null;
            if (!a) { console.warn(`[CARROS] modelo ${id} não está no atlas (assets/cars/carros-atlas.js)`); M[id].len = 4.4; M[id].wid = 2.0; continue; }
            M[id].len = a.len; M[id].wid = a.wid; M[id].lamps = a.lamps;
            if (a.siren) M[id].siren = a.siren;
            if (a.fixed) M[id].fixedPaint = true;
        }
        return M;
    }

    // Classes de trânsito: o TrafficManager sorteia a classe pelo lugar e a CarLibrary escolhe um dos modelos dela (pelo `weight`).
    static get CLASSES() {
        const out = {};
        for (const [id, m] of Object.entries(CarSheet.MODELS)) (out[m.cls] || (out[m.cls] = [])).push(id);
        return out;
    }

    // Cores de fábrica de cada modelo (linhas de PAINTS). Variedade: cada carro nasce com uma cor sorteada daqui.
    static get POOLS() {
        const compact = [0, 1, 3, 4, 5, 7, 8, 9, 20, 21, 19, 23, 24, 26, 38];
        return {
            hatch_moderno: compact, hatch_moderno2: [4, 8, 19, 0, 1, 20, 26, 24, 5], compacto_aventureiro: [7, 4, 8, 0, 24, 3, 19, 23],
            quadradinho: [4, 0, 1, 8, 5, 19, 9, 3, 7], hatch_esportivo: [29, 4, 5, 26, 32, 19, 31, 33], mini_eletrico: [36, 4, 34, 23, 22, 26, 8, 37],
            besouro: [35, 36, 37, 38, 4, 0, 23, 39, 16, 13], seda_classico: [13, 17, 14, 39, 18, 37, 5, 8], hatch_90: [3, 14, 15, 18, 4, 0, 8, 1],
            hatch_80: [24, 17, 14, 13, 4, 0, 15, 18], sedan_70: [36, 37, 35, 38, 39, 22, 25, 5, 13, 16], brasilia: [24, 37, 16, 13, 4, 3, 35, 17],
            perua_antiga: [9, 17, 13, 22, 4, 8, 15, 39],
            suv_compacto: [8, 4, 5, 19, 20, 26, 38, 1], suv_cupe: [20, 1, 4, 5, 8, 19, 9, 27], suv_quadrado: [21, 3, 7, 24, 4, 36, 38, 5, 19],
            suv_grande: [5, 19, 4, 26, 8, 20, 27, 22], jipe_offroad: [21, 7, 3, 24, 5, 4, 36, 38],
            sedan_popular: [4, 8, 19, 5, 0, 1, 20, 9, 26], sedan_medio: [4, 26, 8, 5, 19, 20, 22, 27, 9], sedan_luxo: [5, 27, 19, 20, 26, 39, 8, 22],
            esportivo: [33, 28, 4, 5, 0, 24, 31, 26], muscle: [25, 29, 30, 31, 28, 0, 5, 33, 32],
            super: [32, 32, 29, 31, 5, 4, 27, 26, 28], super2: [30, 29, 31, 27, 4, 26, 28, 33],
            picape_pequena: [4, 8, 0, 5, 19, 1, 7, 3], picape_media: [8, 4, 5, 19, 20, 21, 26, 38], picape_grande: [9, 5, 4, 19, 20, 21, 38, 0, 27],
            van_furgao: [4, 4, 4, 8, 26, 19, 1, 0], kombi: [36, 35, 37, 34, 24, 0, 4, 23], minivan: [9, 4, 8, 19, 5, 20, 26, 1],
        };
    }

    // Rampas de 5 tons de uma pintura, indexadas pelo número do slot (paleta procedural de barcos e helicóptero).
    static rampsFor(row) {
        const S = CarSheet.SLOT;
        const common = { glass: '#27384d', dark: '#1a1b20', chrome: '#c9d0d8', head: '#fff2b0', tail: '#8a1c1c', sign: '#fff7c8', seat: '#3a404e', trim: '#6b7386' };
        const cols = Object.assign({}, common, CarSheet.PAINTS[row]);
        const out = {};
        for (const slot of Object.keys(S)) out[S[slot]] = Pixel.ramp5(cols[slot]);
        return out;
    }

    // Imagem do modelo para o HUD: vista de CIMA, nariz para a direita, na pintura `paintRow`, com contorno claro. <canvas> a 20 px/m.
    static preview(modelId, paintRow = 0) { return CarArt.preview(modelId, paintRow); }

    // Textura de paleta procedural (barcos, helicóptero): 1 linha por pintura (16 rampas por linha).
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

    // "Folha" de UM modelo: só os dados (o desenho é o atlas compartilhado). Sempre pronta.
    constructor(lib, modelId) {
        this.lib = lib;
        this.modelId = modelId;
        this.spec = Object.assign({ id: modelId }, CarSheet.MODELS[modelId]);
        this.art = true;                 // o Vehicle cria um CarActor (CarArt), não um SpriteActor
        this.ready = true;
        this.name = modelId;
    }

    getClip() { return null; }

    // Posição das lanternas/faróis (coordenadas do modelo) para o sistema de luzes: x = meia-distância lateral; zF/zR = frente/trás.
    static lamps(id) {
        const M = CarSheet.MODELS[id];
        return M.lamps || { x: M.wid / 2 - 0.31, zF: M.len / 2 - 0.05, zR: -M.len / 2 + 0.05 };
    }
}

// ----------------------------------------------------------------------------
// DoorSheet — medidas da porta da frente de cada modelo (do desenho): dobradiça (frente da porta) e comprimento. A porta aberta é a
// lâmina do atlas girando em volta da dobradiça (CarDoors); fechada, ela já faz parte do sprite do carro.
// ----------------------------------------------------------------------------
class DoorSheet {
    static get MAX_ANGLE() { return (70 * Math.PI) / 180; } // abertura máxima

    // { h: z da dobradiça (+ = frente), len: comprimento da porta, x: distância da linha da porta ao centro } por modelo.
    static get SPEC() {
        const out = {};
        for (const id of Object.keys(CarSheet.MODELS)) {
            const a = CarArt.available() && CarArt.model(id);
            out[id] = a ? { h: a.door.hingeZ, len: Math.max(0.6, a.door.len - 0.06), x: a.door.hingeX } : { h: 0.86, len: 1.05, x: 0.95 };
        }
        return out;
    }

    // Posição da dobradiça no carro (coordenadas do modelo): sign -1 = esquerda, +1 = direita.
    static hinge(modelId, sign) {
        const D = DoorSheet.SPEC[modelId];
        return { x: sign * D.x, z: D.h };
    }
}

// ----------------------------------------------------------------------------
// CarLibrary — paleta procedural (barcos, helicóptero) + modelos de carro por classe. Os modelos não têm mais "assar": todos estão no
// atlas, prontos desde a carga (sheet/peek devolvem na hora).
// ----------------------------------------------------------------------------
class CarLibrary {
    constructor(scene) {
        this.scene = scene;
        this.palette = CarSheet.createPalette(scene);
        this.sheets = {};
        CarArt.scene = scene;            // (o atlas sobe para a GPU na carga do jogo: Game._initPhysics espera CarArt.ready e chama init)
    }

    // Modelo `modelId` (sempre pronto).
    sheet(modelId) {
        if (!CarSheet.MODELS[modelId]) modelId = 'sedan_medio';
        return this.sheets[modelId] || (this.sheets[modelId] = new CarSheet(this, modelId));
    }

    peek(modelId) { return this.sheet(modelId); }
    readyOf(cls) { return this.sheet(this.variantOf(cls)); }

    // Nada a liberar nem a assar: o atlas é único e fica na GPU (~10 MB com mipmaps, todos os modelos, cores e amassados).
    sweep() { return 0; }
    pump() { return false; }

    // Um modelo da classe de trânsito (ex.: 'sedan' -> sedan_popular, sedan_medio ou sedan_luxo), pelo peso de cada um.
    // Id de modelo específico volta igual.
    variantOf(cls) {
        const list = CarSheet.CLASSES[cls];
        if (!list) return cls;
        const M = CarSheet.MODELS;
        let r = Math.random() * list.reduce((s, k) => s + (M[k].weight || 1), 0);
        for (const k of list) { r -= M[k].weight || 1; if (r <= 0) return k; }
        return list[0];
    }

    // Cor de fábrica sorteada do modelo (linha de PAINTS), para a variedade.
    randomPaint(modelId) {
        const pool = CarSheet.POOLS[modelId] || CarSheet.POOLS.sedan_medio;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // Modelo aleatório pelos pesos do catálogo.
    randomModel() {
        const M = CarSheet.MODELS;
        const keys = Object.keys(M);
        let r = Math.random() * keys.reduce((s, k) => s + M[k].weight, 0);
        for (const k of keys) { r -= M[k].weight; if (r <= 0) return k; }
        return 'sedan_medio';
    }
}
memoStatics(CarSheet, 'SLOT', 'PAINTS', 'CLASSES', 'POOLS', 'MODELS');
memoStatics(DoorSheet, 'SPEC');
