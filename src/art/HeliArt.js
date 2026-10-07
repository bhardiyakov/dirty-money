// ============================================================================
// HeliArt — helicópteros ilustrados (vetor em canvas, alta resolução), no lugar do antigo sprite em pixel art (HeliSheet).
//
// Visto de cima, nariz para o norte (+Z), mastro do rotor no centro do quadro. Estilo de quadrinho, como os carros do atlas:
// contorno escuro, pintura com sombreado (luz vindo de cima/esquerda), painéis rebitados, cockpit de vidro com reflexo, grade e
// escapamentos do motor, esquis, viga de cauda com estabilizador, deriva e rotor de cauda borrado. A pintura vem de
// CarSheet.PAINTS (6 = polícia: azul-marinho com faixa branca e "POLÍCIA" na viga).
//
// HeliVisual = o que o Chopper (pilotável) e o Helicopter (polícia) desenham:
//   • corpo: um quad que gira no ângulo exato (sem direções fixas);
//   • rotor: dois quads — as pás NÍTIDAS (parado/girando devagar) e o DISCO BORRADO (em rotação) — que se revezam pela rotação;
//   • sombra: a silhueta do helicóptero (corpo + disco do rotor), desfocada, no chão, deslocada pelo sol e pela altura.
// Texturas e materiais são criados uma vez por pintura e compartilhados (alguns poucos MB no total).
// ============================================================================

const HeliArt = {
    PX: 768,               // lado da textura (px) — o quadro cobre SIZE m: ~60 px/m
    SIZE: 12.8,            // lado do quadro (m) — o mesmo tamanho do sprite antigo (rotor de ~11 m, ~9 m de nariz a cauda)
    R: 5.5,                // raio do rotor principal (m)
    _mats: {},

    // ------------------------------------------------------------------ desenho
    _ctx() {
        const c = document.createElement('canvas');
        c.width = c.height = this.PX;
        const g = c.getContext('2d');
        const k = this.PX / this.SIZE;
        g.setTransform(k, 0, 0, k, this.PX / 2, this.PX / 2);               // metros, +Y = norte (nariz), origem no mastro (o topo do canvas vira o SUL do quad)
        g.lineJoin = 'round'; g.lineCap = 'round';
        return { c, g, k };
    },
    _shade(hex, f) {                                                         // clareia (f > 0) / escurece (f < 0) uma cor
        const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
        const t = f > 0 ? 255 : 0, a = Math.abs(f);
        const m = (v) => Math.round(v + (t - v) * a);
        return `rgb(${m(r)},${m(gg)},${m(b)})`;
    },

    // Silhueta da fuselagem (gota alongada): nariz em y = 3,05, traseira em y = -1,95.
    _fuselage(g) {
        g.beginPath();
        g.moveTo(0, 3.05);
        g.bezierCurveTo(0.62, 3.02, 0.98, 2.35, 1.0, 1.2);
        g.bezierCurveTo(1.02, 0.2, 0.98, -0.9, 0.78, -1.5);
        g.bezierCurveTo(0.62, -1.85, 0.36, -1.97, 0, -1.97);
        g.bezierCurveTo(-0.36, -1.97, -0.62, -1.85, -0.78, -1.5);
        g.bezierCurveTo(-0.98, -0.9, -1.02, 0.2, -1.0, 1.2);
        g.bezierCurveTo(-0.98, 2.35, -0.62, 3.02, 0, 3.05);
        g.closePath();
    },
    _boom(g) {                                                               // viga de cauda (afina para trás)
        g.beginPath();
        g.moveTo(-0.34, -1.6); g.lineTo(-0.17, -5.95); g.quadraticCurveTo(0, -6.1, 0.17, -5.95); g.lineTo(0.34, -1.6); g.closePath();
    },
    _rrect(g, x0, y0, x1, y1, r) {
        g.beginPath();
        g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.quadraticCurveTo(x1, y0, x1, y0 + r); g.lineTo(x1, y1 - r);
        g.quadraticCurveTo(x1, y1, x1 - r, y1); g.lineTo(x0 + r, y1); g.quadraticCurveTo(x0, y1, x0, y1 - r); g.lineTo(x0, y0 + r);
        g.quadraticCurveTo(x0, y0, x0 + r, y0); g.closePath();
    },

    // Corpo inteiro (sem o rotor principal). P = { paint, paint2 } (CarSheet.PAINTS); police: faixa e letreiro.
    _drawBody(g, P, police, silhouette = false) {
        const INK = silhouette ? '#000' : '#0b0e16', LW = 0.075;
        const base = P.paint, accent = police ? '#eef0f6' : P.paint2 && P.paint2 !== P.paint ? P.paint2 : this._shade(P.paint, -0.35);
        const fill = (style) => { g.fillStyle = silhouette ? '#000' : style; g.fill(); };
        const ink = (w = LW) => { if (silhouette) return; g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };
        const grad = (x0, x1, light) => {
            if (silhouette) return '#000';
            const gr = g.createLinearGradient(x0, 0, x1, 0);
            gr.addColorStop(0, this._shade(light, -0.38)); gr.addColorStop(0.3, this._shade(light, 0.18));
            gr.addColorStop(0.55, light); gr.addColorStop(1, this._shade(light, -0.45));
            return gr;
        };

        // ---- esquis (por baixo de tudo): tubos com a ponta da frente curvada e as travessas
        for (const sx of [-1, 1]) {
            g.beginPath(); g.moveTo(sx * 1.18, -1.45); g.lineTo(sx * 1.18, 2.05); g.quadraticCurveTo(sx * 1.18, 2.45, sx * 1.02, 2.5);
            g.lineWidth = 0.2; g.strokeStyle = INK; g.stroke();
            if (!silhouette) { g.lineWidth = 0.11; g.strokeStyle = '#5b6170'; g.stroke(); g.lineWidth = 0.035; g.strokeStyle = '#a7aebb'; g.stroke(); }
            for (const y of [1.25, -0.75]) {
                g.beginPath(); g.moveTo(sx * 1.18, y); g.lineTo(sx * 0.7, y + 0.08);
                g.lineWidth = 0.16; g.strokeStyle = INK; g.stroke();
                if (!silhouette) { g.lineWidth = 0.08; g.strokeStyle = '#4c5260'; g.stroke(); }
            }
        }

        // ---- viga de cauda, estabilizador, deriva e rotor de cauda
        this._boom(g); fill(grad(-0.34, 0.34, base)); ink();
        if (!silhouette) {                                                   // faixa / letreiro na viga
            g.save(); this._boom(g); g.clip();
            g.fillStyle = accent; g.fillRect(-0.07, -5.6, 0.14, 3.7);
            if (police) {
                g.scale(1, -1); g.rotate(Math.PI / 2);                        // (texto ao longo da viga, do mastro para a cauda)
                g.fillStyle = '#1d2748'; g.font = '700 0.21px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
                g.fillText('POLÍCIA', 3.65, 0.01);
            }
            g.restore();
            g.lineWidth = 0.025; g.strokeStyle = this._shade(base, -0.5);       // juntas da viga
            for (const y of [-2.6, -3.6, -4.6]) { g.beginPath(); g.moveTo(-0.3 + (2 + y) * -0.04, y); g.lineTo(0.3 - (2 + y) * -0.04, y); g.stroke(); }
        }
        this._rrect(g, -1.0, -5.32, 1.0, -4.92, 0.12); fill(grad(-1, 1, base)); ink();          // estabilizador horizontal
        for (const sx of [-1, 1]) { this._rrect(g, sx * 1.0 - 0.09, -5.45, sx * 1.0 + 0.09, -4.78, 0.05); fill(accent); ink(0.05); }   // placas da ponta
        this._rrect(g, -0.1, -6.35, 0.1, -5.55, 0.06); fill(grad(-0.1, 0.1, this._shade(base, -0.15))); ink(0.06);   // deriva
        // rotor de cauda (vertical, no lado direito): visto de cima é um traço borrado
        if (!silhouette) {
            g.beginPath(); g.ellipse(0.28, -5.95, 0.09, 0.62, 0, 0, Math.PI * 2);
            g.fillStyle = 'rgba(30,34,44,0.35)'; g.fill();
            g.lineWidth = 0.03; g.strokeStyle = 'rgba(200,206,220,0.55)'; g.stroke();
            g.beginPath(); g.arc(0.25, -5.95, 0.07, 0, Math.PI * 2); g.fillStyle = '#9aa2b0'; g.fill(); ink(0.03);
        }

        // ---- fuselagem: pintura com sombreado
        this._fuselage(g); fill(grad(-1, 1, base)); ink(0.09);
        if (silhouette) return;
        g.save(); this._fuselage(g); g.clip();
        // luz de cima (reflexo comprido no dorso) e sombra na barriga traseira
        let gr = g.createRadialGradient(-0.35, 0.6, 0.1, -0.2, 0.3, 2.2);
        gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(-1.2, -2.2, 2.4, 5.4);
        // faixa lateral (polícia: branca; civis: a 2ª cor)
        g.fillStyle = accent;
        for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 1.05, 1.3); g.lineTo(sx * 0.82, 1.3); g.lineTo(sx * 0.7, -1.6); g.lineTo(sx * 1.05, -1.6); g.closePath(); g.fill(); }
        // painéis e rebites
        g.strokeStyle = this._shade(base, -0.55); g.lineWidth = 0.022;
        const panels = [[[-0.92, 1.15], [0.92, 1.15]], [[-0.98, -0.05], [-0.62, -0.05]], [[0.62, -0.05], [0.98, -0.05]], [[-0.62, 1.15], [-0.62, -1.75]], [[0.62, 1.15], [0.62, -1.75]]];
        for (const [[x0, y0], [x1, y1]] of panels) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
        g.fillStyle = this._shade(base, -0.6);
        for (const sx of [-0.62, 0.62]) for (let y = 1.0; y > -1.7; y -= 0.22) { g.beginPath(); g.arc(sx + 0.06, y, 0.018, 0, Math.PI * 2); g.fill(); }
        for (let x = -0.85; x <= 0.86; x += 0.17) { g.beginPath(); g.arc(x, 1.08, 0.018, 0, Math.PI * 2); g.fill(); }
        g.restore();

        // ---- portas laterais com janela (vidro escuro)
        for (const sx of [-1, 1]) {
            g.beginPath(); g.moveTo(sx * 0.98, 1.05); g.lineTo(sx * 0.72, 1.05); g.lineTo(sx * 0.68, 0.05); g.lineTo(sx * 0.98, 0.05); g.closePath();
            const wg = g.createLinearGradient(sx * 0.7, 1, sx * 0.98, 0); wg.addColorStop(0, '#2b3a52'); wg.addColorStop(1, '#0f1622');
            g.fillStyle = wg; g.fill(); ink(0.04);
            g.beginPath(); g.moveTo(sx * 0.77, 0.95); g.lineTo(sx * 0.9, 0.95); g.lineTo(sx * 0.75, 0.5);
            g.lineWidth = 0.035; g.strokeStyle = 'rgba(190,220,255,0.45)'; g.stroke();
        }

        // ---- cockpit: bolha de vidro na frente, com a moldura do meio e o reflexo
        g.beginPath();
        g.moveTo(0, 3.0); g.bezierCurveTo(0.55, 2.97, 0.86, 2.35, 0.88, 1.35); g.lineTo(-0.88, 1.35); g.bezierCurveTo(-0.86, 2.35, -0.55, 2.97, 0, 3.0); g.closePath();
        gr = g.createLinearGradient(-0.6, 2.9, 0.7, 1.35);
        gr.addColorStop(0, '#5f85a8'); gr.addColorStop(0.35, '#2c4563'); gr.addColorStop(1, '#101a2a');
        g.fillStyle = gr; g.fill(); ink(0.07);
        g.save(); g.clip();
        g.beginPath(); g.moveTo(-0.62, 2.45); g.quadraticCurveTo(-0.3, 2.9, 0.18, 2.86); g.lineTo(0.05, 2.7); g.quadraticCurveTo(-0.32, 2.7, -0.5, 2.3); g.closePath();
        g.fillStyle = 'rgba(235,245,255,0.55)'; g.fill();                                                // reflexo
        g.beginPath(); g.ellipse(0.42, 1.75, 0.16, 0.38, 0.2, 0, Math.PI * 2); g.fillStyle = 'rgba(160,200,240,0.18)'; g.fill();
        // bancos/painel vistos através do vidro (sombras)
        g.fillStyle = 'rgba(5,8,14,0.45)'; for (const sx of [-0.36, 0.36]) { this._rrect(g, sx - 0.2, 1.4, sx + 0.2, 1.85, 0.08); g.fill(); }
        g.restore();
        g.beginPath(); g.moveTo(0, 3.0); g.lineTo(0, 1.35); g.lineWidth = 0.06; g.strokeStyle = INK; g.stroke();     // moldura
        g.beginPath(); g.moveTo(-0.86, 1.95); g.quadraticCurveTo(0, 2.12, 0.86, 1.95); g.lineWidth = 0.05; g.stroke();

        // ---- carenagem do motor (corcunda) com grades e escapamentos
        this._rrect(g, -0.56, -1.7, 0.56, 0.62, 0.32);
        fill(grad(-0.56, 0.56, this._shade(base, -0.12))); ink(0.07);
        g.strokeStyle = '#0b0e16'; g.lineWidth = 0.035;
        for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const y = -0.55 - i * 0.14; g.beginPath(); g.moveTo(sx * 0.2, y); g.lineTo(sx * 0.46, y); g.stroke(); }
        for (const sx of [-1, 1]) {                                          // escapamentos
            g.beginPath(); g.ellipse(sx * 0.28, -1.62, 0.12, 0.09, 0, 0, Math.PI * 2); g.fillStyle = '#2a2d35'; g.fill(); ink(0.035);
            g.beginPath(); g.ellipse(sx * 0.28, -1.63, 0.07, 0.05, 0, 0, Math.PI * 2); g.fillStyle = '#07080b'; g.fill();
        }
        // antena e farol de busca (ponto claro no nariz, à direita)
        g.beginPath(); g.moveTo(-0.25, 0.75); g.lineTo(-0.32, 1.05); g.lineWidth = 0.03; g.strokeStyle = INK; g.stroke();
        g.beginPath(); g.arc(0.5, 2.62, 0.1, 0, Math.PI * 2); g.fillStyle = '#fff4c8'; g.fill(); ink(0.03);
        if (police) for (const [sx, col] of [[-0.18, '#ff4040'], [0.18, '#4a7dff']]) {                     // giroflex
            g.beginPath(); g.ellipse(sx, 0.92, 0.13, 0.07, 0, 0, Math.PI * 2); g.fillStyle = col; g.fill(); ink(0.03);
        }
    },

    // Rotor principal. blur: disco em rotação (pás arrastadas + disco translúcido); senão as 4 pás nítidas paradas.
    _drawRotor(g, blur) {
        const R = this.R;
        if (blur) {
            let gr = g.createRadialGradient(0, 0, 0.4, 0, 0, R);
            gr.addColorStop(0, 'rgba(210,216,228,0.10)'); gr.addColorStop(0.85, 'rgba(210,216,228,0.16)'); gr.addColorStop(1, 'rgba(235,240,250,0.28)');
            g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
            g.lineWidth = 0.05; g.strokeStyle = 'rgba(240,244,252,0.35)'; g.stroke();
            for (let b = 0; b < 4; b++) {                                    // cada pá deixa um rastro de ~50° (mais escuro na frente)
                for (let i = 0; i < 26; i++) {
                    const a = b * Math.PI / 2 - i * 0.034, t = 1 - i / 26;
                    g.save(); g.rotate(a);
                    g.beginPath(); g.moveTo(0.35, -0.08); g.lineTo(R - 0.1, -0.1); g.lineTo(R - 0.1, 0.1); g.lineTo(0.35, 0.08); g.closePath();
                    g.fillStyle = `rgba(20,22,30,${0.05 + 0.13 * t * t})`; g.fill();
                    g.restore();
                }
            }
            for (const rr of [R * 0.72, R * 0.93]) {                         // anéis de "velocidade"
                g.beginPath(); g.arc(0, 0, rr, 0.4, 1.6); g.lineWidth = 0.06; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.stroke();
                g.beginPath(); g.arc(0, 0, rr, 3.6, 4.7); g.stroke();
            }
        } else {
            for (let b = 0; b < 4; b++) {
                g.save(); g.rotate(b * Math.PI / 2);
                g.beginPath(); g.moveTo(0.3, -0.13); g.lineTo(R - 0.25, -0.14); g.quadraticCurveTo(R, -0.13, R, 0); g.quadraticCurveTo(R, 0.13, R - 0.25, 0.14); g.lineTo(0.3, 0.13); g.closePath();
                const gr = g.createLinearGradient(0, -0.14, 0, 0.14); gr.addColorStop(0, '#5a606d'); gr.addColorStop(0.45, '#2a2e38'); gr.addColorStop(1, '#14161c');
                g.fillStyle = gr; g.fill(); g.lineWidth = 0.05; g.strokeStyle = '#07080c'; g.stroke();
                g.fillStyle = '#d8b030'; g.fillRect(R - 0.45, -0.13, 0.18, 0.26);      // ponta pintada
                g.restore();
            }
        }
        // cubo do rotor
        let gr = g.createRadialGradient(-0.08, 0.08, 0.02, 0, 0, 0.32);
        gr.addColorStop(0, '#d5dae3'); gr.addColorStop(0.5, '#6d7480'); gr.addColorStop(1, '#262a33');
        g.beginPath(); g.arc(0, 0, 0.32, 0, Math.PI * 2); g.fillStyle = gr; g.fill(); g.lineWidth = 0.05; g.strokeStyle = '#07080c'; g.stroke();
        g.beginPath(); g.arc(0, 0, 0.11, 0, Math.PI * 2); g.fillStyle = '#1b1e25'; g.fill();
    },

    // ------------------------------------------------------------------ GPU
    _material(scene, name, canvas, alpha = 1) {
        const tex = new BABYLON.DynamicTexture(name, canvas, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        tex.hasAlpha = true; tex.update(false);
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const m = new BABYLON.StandardMaterial(name + 'Mat', scene);
        m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; m.alpha = alpha;
        m.disableLighting = true; m.emissiveColor = SpriteMaterial.sharedTint();      // escurece à noite como os sprites
        m.specularColor = BABYLON.Color3.Black(); m.backFaceCulling = false;
        return m;
    },
    body(scene, variant) {
        const key = 'b' + variant;
        if (this._mats[key] && this._mats[key].getScene() === scene) return this._mats[key];
        const P = CarSheet.PAINTS[variant] || CarSheet.PAINTS[4], { c, g } = this._ctx();
        this._drawBody(g, P, variant === 6);
        return (this._mats[key] = this._material(scene, 'heliBody' + variant, c));
    },
    rotor(scene, blur) {
        const key = blur ? 'rb' : 'rs';
        if (this._mats[key] && this._mats[key].getScene() === scene) return this._mats[key];
        const { c, g } = this._ctx();
        this._drawRotor(g, blur);
        return (this._mats[key] = this._material(scene, blur ? 'heliRotorBlur' : 'heliRotorBlades', c));
    },
    shadow(scene) {
        if (this._mats.sh && this._mats.sh.getScene() === scene) return this._mats.sh;
        const { c, g, k } = this._ctx();
        g.filter = `blur(${Math.round(k * 0.12)}px)`;
        g.globalAlpha = 1; this._drawBody(g, { paint: '#000000' }, false, true);
        g.globalAlpha = 0.35; g.beginPath(); g.arc(0, 0, this.R, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill();   // disco do rotor
        const m = this._material(scene, 'heliShadow', c);
        m.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.04);
        m.disableDepthWrite = true;
        return (this._mats.sh = m);
    },
};

// O desenho de um helicóptero no mundo (ver o topo). y = altura do corpo; o rotor fica 0,45 m acima.
class HeliVisual {
    constructor(scene, variant, name = 'heli') {
        const S = HeliArt.SIZE;
        const quad = (n, mat, group) => {
            const q = BABYLON.MeshBuilder.CreateGround(n, { width: S, height: S }, scene);
            q.material = mat; q.renderingGroupId = group; q.isPickable = false; q.alwaysSelectAsActiveMesh = true;
            return q;
        };
        this.body = quad(name + 'Body', HeliArt.body(scene, variant), 2);
        this.blades = quad(name + 'Blades', HeliArt.rotor(scene, false), 2);
        this.blur = quad(name + 'RotorBlur', HeliArt.rotor(scene, true), 2);
        this.shadow = quad(name + 'Shadow', HeliArt.shadow(scene), 0);
        this.shadow.alphaIndex = -98;                                          // logo depois das marcas de chão
        this._rot = 0;
        this.visible = true;
    }

    // rpm 0..1 (rotação do rotor); spinRate: rad/s a mais (pane); dt para girar.
    place(x, y, z, heading, rpm, dt, spinExtra = 0) {
        this.body.position.set(x, y, z); this.body.rotation.y = heading;
        this._rot += (rpm * 30 + spinExtra) * dt;
        const blurA = Math.min(1, Math.max(0, (rpm - 0.25) / 0.45)), bladeA = Math.max(0, 1 - blurA * 1.15);
        this.blades.position.set(x, y + 0.45, z); this.blades.rotation.y = heading + this._rot;
        this.blur.position.set(x, y + 0.46, z); this.blur.rotation.y = heading + this._rot * 0.12;       // o borrão "gira" devagar
        this.blades.visibility = bladeA; this.blur.visibility = blurA;
        this.blades.setEnabled(this.visible && bladeA > 0.02); this.blur.setEnabled(this.visible && blurA > 0.02);
    }

    // Sombra no chão em (x, z), com a mesma direção; scale cresce com a altura; alpha 0 = sem sombra (noite).
    placeShadow(x, z, heading, alpha, scale = 1) {
        const on = this.visible && alpha > 0.02;
        this.shadow.setEnabled(on);
        if (!on) return;
        this.shadow.position.set(x, 0.22, z); this.shadow.rotation.y = heading;
        this.shadow.scaling.x = this.shadow.scaling.z = scale;
        this.shadow.visibility = alpha;
    }

    setVisible(v) {
        this.visible = v;
        this.body.setEnabled(v);
        if (!v) { this.blades.setEnabled(false); this.blur.setEnabled(false); this.shadow.setEnabled(false); }
    }
    dispose() { this.body.dispose(); this.blades.dispose(); this.blur.dispose(); this.shadow.dispose(); }
}
