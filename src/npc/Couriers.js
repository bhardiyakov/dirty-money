// ============================================================================
// Couriers — entregadores de aplicativo ("iFome"): motos com piloto de capacete e BAÚ VERMELHO nas costas, correndo pela
// cidade inteira de restaurante em restaurante.
//   ciclo: vai a um restaurante (lanchonete, pizzaria, japonês…) → para em fila dupla e pega o pedido → corre até o cliente
//   (um prédio/casa a algumas quadras) → para, entrega → próximo restaurante.
//   "Como loucos": velocidade de cruzeiro bem acima do trânsito, arrancada forte, furam o sinal vermelho, passam no corredor entre
//   os carros, ULTRAPASSAM quem vai devagar e desviam de pedestres em cima da hora (TrafficCar.impatient), buzinam por qualquer coisa.
//   Batida mais firme derruba: o entregador levanta, volta para a moto e segue (Casualty.remount → onRemount).
//   Usam a IA de trânsito normal (TrafficCar) com `route.goal` — a mesma navegação gulosa da perseguição.
// O trânsito só existe perto do jogador (o mundo é grande), então os trajetos são curtos (algumas quadras): o ciclo inteiro
// acontece à vista, e onde quer que o jogador esteja sempre há entregadores circulando.
// São veículos comuns: dá para derrubar o entregador e roubar a moto; o pedido cai no chão (comida).
// ============================================================================

const Couriers = {
    FOOD: ['burger', 'pizza', 'japanese', 'italian', 'fit', 'bakery', 'bar'],

    // Transforma uma moto do trânsito em entregador.
    make(bike) {
        bike.courier = { state: 'toShop', t: 0, stop: 0, goal: null, deliveries: 0 };
        bike.setRider(CharacterRig.VARIANT_COURIER + (bike.id % CharacterRig.COURIERS));
        bike.frameVariant = CharacterRig.VARIANT_COURIER;                 // moto vermelha quando largada
        bike.cruise *= 1.5 + Math.random() * 0.3;
        bike.accelMul = 1.8; bike.turnMul = 1.1;
        bike.runsReds = true;                                            // sinal, preferencial, saída de cruzamento: não espera nada
        bike.squeeze = 0.6;
        bike.honker = true;
        bike.impatient = true;
        bike._cruise0 = bike.cruise;
        this._next(bike);
    },

    // Escolhe o próximo destino: um restaurante perto (pegar) ou um cliente a algumas quadras (entregar).
    _next(bike) {
        const c = bike.courier, p = bike.position, f = bike.traffic ? bike.traffic.focus() : p;
        const inZone = (x, z, lo, hi) => { const k = hypot(x - p.x, z - p.z); return k > lo && k < hi && hypot(x - f.x, z - f.z) < 165; };   // destino dentro da área viva (perto do jogador)
        let goal = null;
        if (c.state === 'toShop') {
            const doors = (Interiors._doors || []).filter((d) => this.FOOD.includes(d.style));
            const near = doors.filter((d) => inZone(d.x, d.z, 30, 220));
            const pick = near[Math.floor(Math.random() * near.length)];
            if (pick) goal = { x: pick.x, z: pick.z, name: pick.name };
            else c.retry = true;                                         // lojas ainda não indexadas (início do jogo): tenta de novo
        } else {
            const homes = (typeof RealEstate !== 'undefined' ? RealEstate.list : []).filter((q) => inZone(q.x, q.z, 50, 200));
            const h = homes[Math.floor(Math.random() * homes.length)];
            if (h) goal = { x: h.x, z: h.z, name: 'cliente' };
        }
        if (!goal) { const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 110; goal = { x: f.x + Math.cos(a) * r, z: f.z + Math.sin(a) * r, name: 'cliente' }; }
        if (goal && goal.name !== 'cliente') c.retry = false;
        c.goal = goal; c.t = 0;
        if (bike.route) { bike.route.goal = goal; bike.route.replanAhead(); }
    },

    // Por quadro (antes da IA de trânsito): chegada, parada em fila dupla e troca de destino.
    update(bike, dt) {
        const c = bike.courier;
        if (!c || bike.controlled || bike.wrecked || bike.riderVariant == null || bike.mode !== 'drive') return;
        c.t += dt;
        if (bike.route && bike.route.goal !== c.goal) { bike.route.goal = c.goal; bike.route.replanAhead(); }      // (rota refeita pelo trânsito)
        if (c.stop > 0) {                                                // parado: pegando ou entregando o pedido
            c.stop -= dt;
            bike.cruise = 0;
            if (c.stop <= 0) {
                bike.cruise = bike._cruise0;
                if (c.state === 'pickup') c.state = 'toCustomer';
                else { c.state = 'toShop'; c.deliveries++; }
                this._next(bike);
            }
            return;
        }
        const p = bike.position, g = c.goal;
        const d = g ? hypot(g.x - p.x, g.z - p.z) : 0;
        if (g && d < 20) {                                               // chegou: encosta (na pista mesmo) por alguns segundos
            c.stop = c.state === 'toShop' ? 3 + Math.random() * 3 : 2.5 + Math.random() * 2;
            c.state = c.state === 'toShop' ? 'pickup' : 'deliver';
            return;
        }
        if (c.t > 160 || (c.retry && c.t > 2 && Interiors._doors && Interiors._doors.length)) this._next(bike);                                 // rodou em círculos demais: outro pedido
    },

    // Caiu numa batida, levantou e subiu de novo (Casualty.remount): xinga, buzina e volta à corrida — com o pedido, mais apressado.
    onRemount(bike) {
        const c = bike.courier; if (!c) return;
        c.stop = 0; c.t = 0;
        if (c.state === 'pickup') c.state = 'toCustomer'; else if (c.state === 'deliver') c.state = 'toShop';
        bike.cruise = bike._cruise0;
        bike.honks = 0; bike.honkCd = 0;
        if (bike.honk) bike.honk('bloqueio', { v: 0 });
        this._next(bike);
    },

    // O entregador foi derrubado: o lanche cai na rua (dá para pegar).
    onThrown(game, bike) {
        const p = bike.position;
        if (game.pickups && bike.courier && bike.courier.state !== 'toShop') {
            game.pickups.drop('food', new BABYLON.Vector3(p.x + 0.8, 0, p.z + 0.4));
            game._flash('O pedido do entregador caiu no chão');
        }
        bike.courier = null;                                              // a moto vira uma moto comum (sem baú)
        if (game.traffic) game.traffic._spawnCourier({ x: p.x, z: p.z, r: 90 });    // outro entregador entra na cidade, longe daqui
    },
};
