// ============================================================================
// Service worker do Dirty Money: o jogo INSTALADO no aparelho (PC ou celular, "Instalar app" / "Adicionar à tela inicial").
//
// VERSÃO PUBLICADA (o pacote de scripts/package-legacy.mjs preenche DM_MANIFEST: a lista de todos os arquivos com a impressão digital
// de cada um e a versão do conjunto):
//   • PRIMEIRA VISITA: baixa o jogo de uma vez (código, bibliotecas, carros, texturas — `pre`, ~35 MB) e guarda no aparelho. Daí em
//     diante o jogo abre direto do aparelho, sem esperar a rede, e funciona OFFLINE.
//   • Os arquivos GRANDES (os personagens: centenas de MB) não entram nesse pacote: ficam guardados à medida que aparecem no jogo
//     (cache por impressão digital — sobrevivem às atualizações se não mudaram).
//   • VERSÃO NOVA: o navegador percebe que este arquivo mudou e baixa a versão nova EM SEGUNDO PLANO — só os arquivos que mudaram (os
//     iguais são copiados da versão anterior). Tudo ou nada: se um arquivo falhar, fica a versão de antes, inteira (nunca metade nova e
//     metade velha). Pronta, a página mostra o aviso (src/main.js); ela entra ao reabrir o jogo, ou na hora, se o jogador pedir.
// SEM DM_MANIFEST (o repositório servido direto, sem o pacote): rede primeiro, como antes.
// Em localhost (ou com ?dev) a página nem registra este arquivo e apaga o que houver: a versão de TESTE vem sempre do disco.
// ============================================================================

self.DM_MANIFEST = null;      // (DM_MANIFEST: preenchido no pacote — não mude esta linha, o script procura por ela)

const M = self.DM_MANIFEST;
const LIB_CACHE = 'dm-lib-v1';
const APP_CACHE = M ? 'dm-app-' + M.v : 'dm-app-v3';
const ASSET_CACHE = 'dm-assets';                      // os grandes, por impressão digital (entre versões)
const MANIFEST_KEY = '__dm_manifest.json';            // a lista da versão guardada junto do pacote (para reaproveitar na próxima)
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdn.babylonjs.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const BASE = new URL('./', self.location).href;
const PRE = M ? new Set(M.pre) : null;

// ------------------------------------------------------------------ instalação: o pacote inteiro, ou nada
self.addEventListener('install', (e) => {
    if (!M) { self.skipWaiting(); return; }
    e.waitUntil((async () => {
        await precache();
        if (!self.registration.active) await self.skipWaiting();      // (primeira instalação: entra já; atualização: espera o jogador)
    })());
});

async function precache() {
    const cache = await caches.open(APP_CACHE);
    const old = await previous();                       // { path: [hash, Response promise] } da versão guardada antes
    const list = M.pre.slice(), total = list.length;
    let done = 0, last = 0;
    const one = async (path) => {
        const url = BASE + path, h = M.files[path];
        if (await cache.match(url)) { done++; return; }                                      // (instalação retomada)
        let res = old && old[path] && old[path][0] === h ? await old[path][1]() : null;      // igual à versão anterior: copia
        if (!res) {
            res = await fetch(url, { cache: 'reload' });
            if (!res.ok) throw new Error(`${path}: ${res.status}`);
        }
        await cache.put(url, res);
        done++;
        const now = Date.now();
        if (now - last > 400 || done === total) { last = now; progress(done, total); }
    };
    const queue = list.slice();
    const worker = async () => { while (queue.length) await one(queue.shift()); };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    await cache.put(BASE + MANIFEST_KEY, new Response(JSON.stringify(M), { headers: { 'content-type': 'application/json' } }));
}

// A versão guardada mais recente (para copiar o que não mudou em vez de baixar de novo).
async function previous() {
    const out = {};
    for (const k of await caches.keys()) {
        if (!k.startsWith('dm-app-') || k === APP_CACHE) continue;
        const c = await caches.open(k), r = await c.match(BASE + MANIFEST_KEY);
        if (!r) continue;
        try {
            const P = await r.json();
            for (const [path, h] of Object.entries(P.files || {})) if (!out[path]) out[path] = [h, () => c.match(BASE + path)];
        } catch (err) { /* (lista estragada: baixa tudo) */ }
    }
    return out;
}

async function progress(done, total) {
    for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage({ type: 'dm-sw-progress', done, total, version: M.v });
}

// ------------------------------------------------------------------ ativação: apaga o que ficou velho
self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) {
            if (k === LIB_CACHE || k === APP_CACHE || k === ASSET_CACHE) continue;
            if (k.startsWith('dm-')) await caches.delete(k);
        }
        if (M) {                                                        // grandes que não existem mais nesta versão
            const ac = await caches.open(ASSET_CACHE);
            for (const req of await ac.keys()) {
                const u = new URL(req.url), path = decodeURIComponent(u.pathname.slice(new URL(BASE).pathname.length)), h = u.searchParams.get('h');
                if (M.files[path] !== h) await ac.delete(req);
            }
        }
        await self.clients.claim();
    })());
});

self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'dm-sw-update') self.skipWaiting();          // o jogador pediu: a versão nova entra agora
});

// ------------------------------------------------------------------ pedidos
self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        if (!M) { e.respondWith(networkFirst(req)); return; }
        let path = url.href.startsWith(BASE) ? decodeURIComponent(url.pathname.slice(new URL(BASE).pathname.length)) : null;
        if (path === null || path === 'sw.js') return;
        if (path === '' || path.endsWith('/')) path += 'index.html';
        const h = M.files[path];
        if (h === undefined) return;                                     // (fora do pacote: a rede, como sempre)
        e.respondWith(PRE.has(path) ? fromApp(path) : fromAssets(path, h));
    } else if (LIB_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
});

// Do pacote instalado (na falta — instalação ainda em curso —, da rede, e guarda).
async function fromApp(path) {
    const cache = await caches.open(APP_CACHE), url = BASE + path;
    const hit = await cache.match(url);
    if (hit) return hit;
    const res = await fetch(url);
    if (res.ok) cache.put(url, res.clone());
    return res;
}

// Arquivo grande: guardado pela impressão digital (a mesma versão do arquivo, entre atualizações do jogo).
async function fromAssets(path, h) {
    const cache = await caches.open(ASSET_CACHE), key = BASE + path + '?h=' + h;
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await fetch(BASE + path);
    if (res.ok) cache.put(key, res.clone());
    return res;
}

async function cacheFirst(req) {
    const cache = await caches.open(LIB_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
}

// (sem o pacote) rede primeiro; sem rede, ou com ela travada por mais de 4 s, o que estiver guardado.
async function networkFirst(req) {
    const cache = await caches.open(APP_CACHE);
    const net = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
    });
    net.catch(() => {});
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000, null));
    try {
        const res = await Promise.race([net, timeout]);
        if (res) return res;
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || await net;
    } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
    }
}
