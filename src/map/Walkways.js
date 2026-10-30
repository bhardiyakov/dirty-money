// ============================================================================
// Walkways — CAMINHOS ELEVADOS a pé: escadarias, rampas, passarelas, patamares e mirantes acima do chão (o Corcovado: Corcovado.js).
// O mundo é plano: "estar lá em cima" é o mesmo estado do viaduto e do heliponto (Player.onDeck / deckH, ver Player._updateLevel) —
// a altura decide o desenho do personagem, o que bate nele e a câmera. Uma REDE é um conjunto de peças andáveis, cada uma com a sua
// altura:
//   { seg: true, a: [x, z, h], b: [x, z, h], w }   lance (escada ou rampa) de a até b, largura w; a altura sobe de a até b (e LAP u
//                                                  além de cada ponta, na altura dela: as peças se sobrepõem nas junções)
//   { disc: true, x, z, r, h }                     plataforma redonda (o mirante)
//   { rect: [x0, z0, x1, z1], h }                  patamar / terraço retangular
// Lances com `entry` começam no chão (h de a = 0): ANDANDO para dentro deles pelo pé, o jogador entra na rede; preso a ela
// (clamp: desliza pelas bordas, que têm corrimão), sai descendo de volta pelo pé de um deles. Onde duas peças se encontram (o patamar
// de um lance com o próximo) a altura casa; se duas peças passam uma por cima da outra, vale a da altura em que ele já está.
//   add(net)               registra (Corcovado.build); net = { name, parts }
//   entry(x, z, vx, vz)    no chão, andando para o pé de um lance de entrada → { net, h }
//   clamp(net, st, p, r)   prende o círculo p (raio r) à rede; st = { x, z, h } (último lugar válido, atualizado); false = saiu pelo pé
//   at(net, x, z, h)       altura do caminho em (x, z) perto da altura h (null: fora)
// ============================================================================

const Walkways = {
    LAP: 0.6,                // o lance avança isto além das pontas (na altura da ponta): a junção com o patamar seguinte não tem fresta
    nets: [],
    reset() { this.nets = []; },
    add(net) {
        for (const q of net.parts) if (q.seg) {
            const dx = q.b[0] - q.a[0], dz = q.b[1] - q.a[1], L = Math.hypot(dx, dz) || 1;
            q.L = L; q.ux = dx / L; q.uz = dz / L;
        }
        this.nets.push(net);
        return net;
    },

    // Altura da peça em (x, z), com a folga m para dentro das bordas; null = fora. `u` (do lance) vai em out.u.
    _h(q, x, z, m, out) {
        if (q.seg) {
            const rx = x - q.a[0], rz = z - q.a[1], u = rx * q.ux + rz * q.uz, v = -rx * q.uz + rz * q.ux;
            if (out) out.u = u;
            if (u < -this.LAP || u > q.L + this.LAP || Math.abs(v) > q.w / 2 - m) return null;
            return q.a[2] + (q.b[2] - q.a[2]) * (Math.max(0, Math.min(q.L, u)) / q.L);
        }
        if (q.disc) return Math.hypot(x - q.x, z - q.z) <= q.r - m ? q.h : null;
        const R = q.rect;
        return x >= R[0] + m && x <= R[2] - m && z >= R[1] + m && z <= R[3] - m ? q.h : null;
    },

    // Altura do caminho em (x, z) entre as peças que o contêm, a mais perto de h (que não esteja mais de 1,5 u acima ou abaixo).
    at(net, x, z, h, m = 0) {
        let best = null, bd = 1.5;
        for (const q of net.parts) {
            const y = this._h(q, x, z, m);
            if (y === null) continue;
            const d = Math.abs(y - h);
            if (d <= bd) { bd = d; best = y; }
        }
        return best;
    },

    entry(x, z, vx, vz) {
        const o = {};
        for (const net of this.nets) for (const q of net.parts) {
            if (!q.entry || this._h(q, x, z, 0, o) === null) continue;
            if (o.u < 1.3 && vx * q.ux + vz * q.uz > 0.2) return { net, h: q.a[2] + (q.b[2] - q.a[2]) * (o.u / q.L) };
        }
        return null;
    },

    clamp(net, st, p, r) {
        const m = Math.min(r, 0.5);
        let h = this.at(net, p.x, p.z, st.h, m);
        if (h !== null) { st.x = p.x; st.z = p.z; st.h = h; return true; }
        // fora: no pé de um lance de entrada, descendo → voltou ao chão
        if (st.h < 0.7) {
            const o = {};
            for (const q of net.parts) if (q.entry && this._h(q, st.x, st.z, 0, o) !== null && o.u < 2) return false;
        }
        // senão desliza ao longo da borda (corrimão) ou fica onde estava
        if ((h = this.at(net, p.x, st.z, st.h, m)) !== null) p.z = st.z;
        else if ((h = this.at(net, st.x, p.z, st.h, m)) !== null) p.x = st.x;
        else { p.x = st.x; p.z = st.z; h = st.h; }
        st.x = p.x; st.z = p.z; st.h = h;
        return true;
    },
};
