// ============================================================================
// SpriteExport — exporta a arte atual (desenhada por código) como PNGs no formato que o jogo lê (SpriteIO): são os MOLDES para o
// artista. Cada PNG sai com o tamanho, o layout de direções/quadros e a paleta exatos; basta redesenhar por cima, mantendo o modo
// INDEXADO e a paleta (ver docs/sprites-png.md). O manifest.json lista tudo o que o jogo deve ler de arquivo.
//
//   Modo dev → MUNDO → ARTE EM PNG → Exportar   (ou, com ?debug: await SpriteExport.run(game))
//
// No Chrome/Edge de computador pede uma pasta e grava direto nela (escolha assets/sprites do projeto); nos outros navegadores baixa
// um .zip com a mesma estrutura. Exportar de novo com PNGs já carregados regrava os mesmos arquivos (ida e volta sem perda).
// ============================================================================

const SpriteExport = {
    // Variante (linha da paleta) usada como CORES DE REFERÊNCIA no PNG de cada folha — só para o artista enxergar; o jogo pinta com a
    // paleta de cada personagem/carro.
    REF: { player: 0, police: 1, civA: 2, civB: 3, rider: 2, swat: CharacterRig.VARIANT_SWAT, army: CharacterRig.VARIANT_ARMY, courier: CharacterRig.VARIANT_COURIER },

    // Pede a pasta de destino (Chrome/Edge de computador). Chame DENTRO do clique: o navegador só abre o seletor durante um gesto do
    // usuário, e a exportação leva dezenas de segundos. null = sem suporte (vai baixar .zip) ou cancelado (lança AbortError).
    async pickDir() {
        if (!window.showDirectoryPicker) return null;
        return window.showDirectoryPicker({ id: 'dm-sprites', mode: 'readwrite' });
    },

    async run(game, { onProgress = () => {}, dir = null } = {}) {
        const t0 = performance.now(), files = new Map(), entries = {};
        const put = (key, png, meta) => { const file = key + '.png'; files.set(file, png); entries[key] = Object.assign({ file }, meta); };
        const tick = () => new Promise((r) => setTimeout(r, 0));

        // ---- paletas (RGB comum; largura = rampas × 5, uma linha por variante)
        const palChar = await this._rgba(game.sprites.palette.texture), palCar = await this._rgba(game.carLib.palette.texture);
        const pcw = game.sprites.palette.width, pch = game.sprites.palette.height, pkw = game.carLib.palette.width, pkh = game.carLib.palette.height;
        put('pal/char', await PNG.encodeRGBA(pcw, pch, palChar), { w: pcw, h: pch, kind: 'palette', note: 'linhas = variantes (0 jogador, 1 policial, civis…); colunas = rampa*5 + nível' });
        put('pal/car', await PNG.encodeRGBA(pkw, pkh, palCar), { w: pkw, h: pkh, kind: 'palette', rows: CarSheet.PAINTS.map((p) => p.name) });

        // ---- personagens: todos os clipes que o jogo usa (CharacterSheet.sets) + os que já existirem nesta sessão
        const lib = game.sprites, sets = CharacterSheet.sets();
        const sheets = Object.keys(lib.sheets).filter((k) => !k.startsWith('player_'));
        for (const id of Object.keys(Bags.DEFS)) if (Bags.DEFS[id].look) { Bags.sheetFor(lib, id); sheets.push('player_' + id); }
        const jobs = [];
        for (const name of sheets) {
            const sh = lib.sheets[name], base = name.startsWith('player') ? 'player' : name, seen = new Set();
            const list = (sets[base] || []).concat(Object.values(sh.clips).map((c) => [c.name, c.weapon]));
            for (const [n, w] of list) {
                const r = sh._resolve(n, w || 'none');
                if (!r || seen.has(r.key)) continue;
                seen.add(r.key);
                jobs.push({ sh, name, base, clip: n, weapon: r.w });
            }
        }
        const total = jobs.length;
        let done = 0;
        for (const j of jobs) {
            const c = j.sh.getClip(j.clip, j.weapon);
            if (c.vector) { done++; continue; }                                  // (atlas vetorial: não há molde indexado — ver tools/personagens)
            const ref = this.REF[j.base] !== undefined ? this.REF[j.base] : 2;
            put(CharacterSheet.fileKey(j.name, j.clip, j.weapon), await this._indexed(c.texture, c.W, c.H, palChar, pcw, ref),
                { w: c.W, h: c.H, kind: 'clip', sheet: j.name, clip: j.clip, weapon: j.weapon, dirs: c.dirs, frames: c.frames, frame: c.frame, fps: c.fps, loop: c.loop, ref });
            if (++done % 6 === 0) { onProgress(done / total, `personagens ${done}/${jobs.length}`); await tick(); }
        }

        // (carros: não entram — vêm do atlas vetorial pronto, assets/cars/carros-atlas.js, gerado por tools/carros)

        // folhas de mochila criadas só para exportar (não é a que o jogador está usando): solta da GPU
        for (const name of sheets) if (name.startsWith('player_') && lib.sheets[name] !== game.player.actor.sheet) { lib.sheets[name].disposeClips(); delete lib.sheets[name]; }

        const manifest = {
            version: 1,
            generated: new Date().toISOString(),
            format: 'PNG indexado 8 bits. Índice = rampa*5 + nível (0 contorno, 1 sombra, 2 base, 3 luz, 4 brilho); 254 = transparente; 255 = sombra projetada. As cores da paleta embutida são só referência: o jogo pinta com pal/*.png. Ver docs/sprites-png.md.',
            entries,
        };
        files.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 1)));
        onProgress(1, 'gravando…');
        const where = await this._save(files, dir);
        const mb = [...files.values()].reduce((a, b) => a + b.length, 0) / 1048576;
        console.log(`[EXPORTAR] ${files.size} arquivos (${mb.toFixed(1)} MB) em ${((performance.now() - t0) / 1000).toFixed(1)} s → ${where}`);
        return { files: files.size, mb: +mb.toFixed(1), where };
    },

    // Pixels RGBA de uma textura (lidos da GPU).
    async _rgba(tex) { const p = await tex.readPixels(); return new Uint8Array(p.buffer, p.byteOffset, p.byteLength); },

    // PNG indexado de um atlas de sprites (RG8: R = índice, G = cobertura) com as cores da variante `ref` da paleta como referência.
    async _indexed(tex, W, H, pal, palW, ref) {
        const px = await this._rgba(tex), n = W * H, idx = new Uint8Array(n);
        for (let i = 0; i < n; i++) idx[i] = px[i * 4 + 1] < 128 ? 254 : px[i * 4];
        const plte = new Uint8Array(768), alpha = new Uint8Array(256).fill(255);
        for (let i = 0; i < palW && i < 254; i++) { const o = (ref * palW + i) * 4; plte[i * 3] = pal[o]; plte[i * 3 + 1] = pal[o + 1]; plte[i * 3 + 2] = pal[o + 2]; }
        plte[255 * 3 + 2] = 13; alpha[254] = 0; alpha[255] = 92;
        return PNG.encodeIndexed(W, H, idx, plte, alpha);
    },

    // Grava numa pasta (File System Access API: Chrome/Edge de computador) ou baixa um .zip.
    async _save(files, root = null) {
        if (root) {
            try {
                for (const [path, data] of files) {
                    const parts = path.split('/'), name = parts.pop();
                    let dir = root;
                    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
                    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
                    await w.write(data); await w.close();
                }
                return 'pasta ' + root.name;
            } catch (e) {
                if (e && e.name === 'AbortError') throw e;
                console.warn('[EXPORTAR] sem acesso à pasta, baixando .zip:', e);
            }
        }
        const blob = new Blob([this._zip(files)], { type: 'application/zip' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'dirty-money-sprites.zip';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
        return 'dirty-money-sprites.zip';
    },

    // ZIP sem compressão (os PNGs já são comprimidos): cabeçalhos locais + diretório central.
    _zip(files) {
        const enc = new TextEncoder(), parts = [], central = [];
        let off = 0;
        for (const [path, data] of files) {
            const name = enc.encode(path), crc = PNG.crc32(data);
            const h = new Uint8Array(30 + name.length), dv = new DataView(h.buffer);
            dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(8, 0, true);
            dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true);
            h.set(name, 30);
            const c = new Uint8Array(46 + name.length), cv = new DataView(c.buffer);
            cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
            cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
            cv.setUint32(42, off, true);
            c.set(name, 46);
            parts.push(h, data); central.push(c);
            off += h.length + data.length;
        }
        let csz = 0; for (const c of central) csz += c.length;
        const end = new Uint8Array(22), ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.size, true); ev.setUint16(10, files.size, true);
        ev.setUint32(12, csz, true); ev.setUint32(16, off, true);
        const all = [...parts, ...central, end];
        let n = 0; for (const p of all) n += p.length;
        const out = new Uint8Array(n); n = 0;
        for (const p of all) { out.set(p, n); n += p.length; }
        return out;
    },
};
