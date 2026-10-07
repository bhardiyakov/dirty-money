// ============================================================================
// Service worker do Dirty Money: depois da 1ª visita o jogo abre rápido e funciona offline (como app instalado).
//   • Bibliotecas de CDN (Babylon com versão fixa, Havok, fontes): CACHE PRIMEIRO — ~7 MB que não precisam ser baixados de novo a
//     cada abertura. Também "congela" o Havok: a URL da CDN não tem versão (muda sozinha); o aparelho fica com a que já funcionou.
//   • Arquivos do jogo (mesma origem): REDE PRIMEIRO — o que acabou de ser editado aparece no próximo recarregar; sem rede, ou com a
//     rede travada por mais de 4 s, vale o que está no cache.
// Só funciona servido por http(s) (localhost incluso); aberto por duplo clique (file://) o jogo segue como antes, sem cache.
// Para forçar todos a baixarem de novo as bibliotecas, troque LIB_CACHE.
// ============================================================================

const LIB_CACHE = 'dm-lib-v1';
const APP_CACHE = 'dm-app-v1';
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdn.babylonjs.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) if (k !== LIB_CACHE && k !== APP_CACHE) await caches.delete(k);
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
    else if (LIB_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
    const cache = await caches.open(LIB_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
}

async function networkFirst(req) {
    const cache = await caches.open(APP_CACHE);
    const net = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
    });
    net.catch(() => {});                                           // (se o cache respondeu antes, a falha da rede não é erro)
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000, null));
    try {
        const res = await Promise.race([net, timeout]);
        if (res) return res;
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || await net;                                   // rede lenta e nada no cache: espera a rede mesmo
    } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        throw err;
    }
}
