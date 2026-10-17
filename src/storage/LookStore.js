// ============================================================================
// LookStore — the device's store of wardrobe looks (IndexedDB 'dirty-money-visual', object store 'atlas'). The single definition of
// the schema: the main thread reads it (PlayerLook, Wardrobe) and the wardrobe Worker writes it (tools/asset_baker/bake.cjs bundles
// this file into assets/baked/wardrobe.worker.js).
//
//   <ck>, <ck>|t, <ck>|w, <ck>|h:<bag>, <ck>|d<n>   a packed atlas: { k, v, frame, clips, pages: [{ w, h, g, par, type, bytes }], gen, t }
//                                                  bytes (ArrayBuffer) of type `type`: the page as a PNG (R = byte 0, G = byte 1 of the
//                                                  2-byte pixel, B = 0, opaque), decoded off the main thread like the baked WebP pages
//                                                  (AtlasDecoder); where the Worker cannot encode PNG, the raw RG bytes (RAW_TYPE).
//                                                  Bytes, not Blobs: private windows of WebKit before Safari 17 refuse Blobs in IndexedDB
//   part|<ck>|<part>|<clip>                        a drawn clip waiting to be packed (Worker only)
//   #t, #parts                                     the Worker's bookkeeping (oldest looks and clips are dropped)
//
// Version 4 = pages as PNG bytes (2: deflated byte arrays; 3: Blobs). Any upgrade clears the store: looks are drawn again in the
// equipment screen.
// ============================================================================

const LookStore = {
	NAME: 'dirty-money-visual',
	VERSION: 4,
	STORE: 'atlas',
	RAW_TYPE: 'application/x-dm-rg8',
	_opening: null, _blocked: null,

	// The open database (shared). One open request at a time: while an older version open in another tab blocks it, callers fail at
	// once (a second request would only queue behind the first and never settle); it completes by itself when that tab lets go. A
	// failed open is forgotten: the next call tries again.
	open() {
		if (!this._opening) {
			const r = indexedDB.open(this.NAME, this.VERSION);
			this._blocked = new Promise((resolve, reject) => { r.onblocked = () => reject(new Error('IndexedDB blocked by an older version open in another tab')); });
			this._opening = new Promise((resolve, reject) => {
				r.onupgradeneeded = () => {
					const db = r.result;
					if (db.objectStoreNames.contains(this.STORE)) r.transaction.objectStore(this.STORE).clear();
					else db.createObjectStore(this.STORE);
				};
				r.onsuccess = () => {
					const db = r.result;
					db.onversionchange = () => { db.close(); this._opening = null; };      // (a newer version in another tab: let it upgrade)
					resolve(db);
				};
				r.onerror = () => { this._opening = null; reject(r.error); };
			});
			this._blocked.catch(() => {});
			this._opening.catch(() => {});
		}
		return Promise.race([this._opening, this._blocked]);
	},

	request(q) { return new Promise((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }); },

	// Runs fn(store) in one transaction and resolves with its result once the transaction has committed (fn failing aborts it).
	async transact(mode, fn) {
		const db = await this.open(), tx = db.transaction(this.STORE, mode), done = new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error || new Error('transaction aborted (device storage full?)'));
		});
		let result;
		try { result = await fn(tx.objectStore(this.STORE)); }
		catch (e) {
			done.catch(() => {});
			try { tx.abort(); } catch (ignored) { /* already finished */ }
			throw e;
		}
		await done;
		return result;
	},

	async get(key) { return (await this.transact('readonly', (st) => this.request(st.get(key)))) || null; },
	async has(key) { return (await this.transact('readonly', (st) => this.request(st.count(key)))) > 0; },
	put(key, value) { return this.transact('readwrite', (st) => { st.put(value, key); }); },
	deletePrefix(prefix) { return this.transact('readwrite', (st) => { st.delete(IDBKeyRange.bound(prefix, prefix + '￿')); }); },
	// { key: true/false } for each key, in one transaction.
	hasAll(keys) {
		return this.transact('readonly', async (st) => {
			const counts = await Promise.all(keys.map((k) => this.request(st.count(k))));
			return Object.fromEntries(keys.map((k, i) => [k, counts[i] > 0]));
		});
	},
};
