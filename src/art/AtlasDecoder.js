// ============================================================================
// AtlasDecoder — decodifica as páginas WebP dos atlas 2,5D prontos (assets/baked/npcs, tools/asset_baker/bake.cjs) FORA da thread
// principal: Worker (de um Blob — só decodificação, nada do gerador) → fetch → createImageBitmap (decodificador nativo do navegador)
// → OffscreenCanvas → pixels RGBA → os 2 bytes por pixel do atlas (R = byte 0, G = byte 1). Com uma camada de dano (ov), junta as duas
// aqui mesmo: pixel da camada ≠ (0, 0) = o pixel machucado. Devolve { w, h, data } (RG intercalado, w × h × 2) já transferido.
//   • Sem cor gerenciada nem alfa pré-multiplicado (colorSpaceConversion/premultiplyAlpha 'none'; as páginas são RGB sem perfil):
//     os bytes saem exatamente como foram gravados.
//   • Sem OffscreenCanvas/createImageBitmap no Worker (Safari < 16.4) ou com o Worker falhando: o mesmo na thread principal.
// ============================================================================

const AtlasDecoder = {
	WORKERS: 2,
	_w: null, _jobs: new Map(), _seq: 0, _off: false,

	// url / ov: endereços (relativos à página) da página base e da camada de dano (ou null).
	rg(url, ov = null) {
		const abs = (u) => (u ? new URL(u, location.href).href : null);
		const ws = this._off ? null : this._pool();
		if (!ws) return this._mainRG(abs(url), abs(ov));
		return new Promise((ok, fail) => {
			const job = ++this._seq, w = ws.reduce((a, b) => (b._n < a._n ? b : a));
			w._n++;
			this._jobs.set(job, { ok, fail, url: abs(url), ov: abs(ov), w });
			w.postMessage({ job, url: abs(url), ov: abs(ov) });
		});
	},
	_pool() {
		if (this._w) return this._w.length ? this._w : null;
		this._w = [];
		if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') return null;
		try {
			const url = URL.createObjectURL(new Blob(['(' + this._worker + ')();'], { type: 'text/javascript' }));
			for (let i = 0; i < this.WORKERS; i++) {
				const w = new Worker(url);
				w._n = 0;
				w.onmessage = (e) => this._done(w, e.data);
				w.onerror = (e) => { e.preventDefault(); for (const [job, J] of this._jobs) if (J.w === w) this._done(w, { job, error: e.message || 'erro no Worker', broken: true }); };
				this._w.push(w);
			}
		} catch (e) { this._w = []; return null; }
		return this._w;
	},
	_done(w, m) {
		const J = this._jobs.get(m.job);
		if (!J) return;
		this._jobs.delete(m.job); w._n--;
		if (!m.error) { J.ok({ w: m.w, h: m.h, data: m.data }); return; }
		if (m.http) { J.fail(new Error(m.error)); return; }             // (arquivo que não veio: tentar aqui não adianta)
		// falhou no Worker: tenta aqui (se aqui der certo, o problema era o Worker — os próximos já vêm direto para cá)
		this._mainRG(J.url, J.ov).then((img) => { if (!this._off) console.warn('[ATLAS] Worker de decodificação falhou (' + m.error + ') — decodificando na thread principal'); this._off = true; J.ok(img); }, J.fail);
	},

	// O mesmo na thread principal (o fallback).
	async _mainRG(url, ov) {
		const a = await this._pixels(url), out = this._rg(a);
		if (ov) this._merge(out, a, await this._pixels(ov));
		return { w: a.w, h: a.h, data: out };
	},
	async _pixels(url) {
		const r = await fetch(url);
		if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
		const blob = await r.blob();
		let src, w, h;
		if (typeof createImageBitmap === 'function') { src = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); w = src.width; h = src.height; }
		else { src = new Image(); src.src = URL.createObjectURL(blob); await src.decode(); w = src.naturalWidth; h = src.naturalHeight; URL.revokeObjectURL(src.src); }
		const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
		const cx = cv.getContext('2d', { willReadFrequently: true });
		cx.drawImage(src, 0, 0);
		if (src.close) src.close();
		return { w, h, px: cx.getImageData(0, 0, w, h).data };
	},
	_rg(a) { const n = a.w * a.h, out = new Uint8Array(n * 2), px = a.px; for (let i = 0, j = 0; i < n; i++, j += 4) { out[i * 2] = px[j]; out[i * 2 + 1] = px[j + 1]; } return out; },
	_merge(out, a, b) {
		if (b.w !== a.w || b.h !== a.h) throw new Error(`camada de dano ${b.w}×${b.h}, página ${a.w}×${a.h}`);
		const n = a.w * a.h, q = b.px;
		for (let i = 0, j = 0; i < n; i++, j += 4) { const r = q[j], g = q[j + 1]; if (r | g) { out[i * 2] = r; out[i * 2 + 1] = g; } }
	},

	// Código do Worker (vai como texto: não enxerga nada da página).
	_worker: function () {
		let cv = null, cx = null;
		const pixels = async (url) => {
			const r = await fetch(url);
			if (!r.ok) { const e = new Error(url + ': HTTP ' + r.status); e.http = true; throw e; }
			const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }), w = bmp.width, h = bmp.height;
			if (!cv || cv.width < w || cv.height < h) { cv = new OffscreenCanvas(Math.max(w, cv ? cv.width : 0), Math.max(h, cv ? cv.height : 0)); cx = cv.getContext('2d', { willReadFrequently: true }); }
			cx.clearRect(0, 0, w, h);
			cx.drawImage(bmp, 0, 0);
			bmp.close();
			return { w, h, px: cx.getImageData(0, 0, w, h).data };
		};
		self.onmessage = async (e) => {
			const { job, url, ov } = e.data;
			try {
				const a = await pixels(url), n = a.w * a.h, out = new Uint8Array(n * 2);
				let px = a.px;
				for (let i = 0, j = 0; i < n; i++, j += 4) { out[i * 2] = px[j]; out[i * 2 + 1] = px[j + 1]; }
				if (ov) {
					const b = await pixels(ov);
					if (b.w !== a.w || b.h !== a.h) throw new Error(`camada de dano ${b.w}×${b.h}, página ${a.w}×${a.h}`);
					px = b.px;
					for (let i = 0, j = 0; i < n; i++, j += 4) { const r = px[j], g = px[j + 1]; if (r | g) { out[i * 2] = r; out[i * 2 + 1] = g; } }
				}
				self.postMessage({ job, w: a.w, h: a.h, data: out }, [out.buffer]);
			} catch (err) { self.postMessage({ job, error: String((err && err.message) || err), http: !!(err && err.http) }); }
		};
	},
};
