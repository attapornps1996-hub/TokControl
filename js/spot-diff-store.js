/**
 * Spot-the-difference image store — IndexedDB so previews survive reload
 * without stuffing huge data URLs into localStorage.
 */
(function (global) {
    'use strict';

    const DB_NAME = 'TokControlSpotDiff';
    const DB_VER = 1;
    const STORE = 'images';
    const blobCache = new Map();

    function openDb() {
        return new Promise((resolve, reject) => {
            if (!global.indexedDB) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
        });
    }

    async function idbPut(key, blob) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(blob, key);
            tx.oncomplete = () => resolve(key);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function idbGet(key) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbDel(key) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function imageKey(levelId, side) {
        return `idb:spotdiff:${levelId}:${side === 'right' ? 'right' : 'left'}`;
    }

    function isIdbRef(ref) {
        return typeof ref === 'string' && ref.startsWith('idb:');
    }

    function revokeCached(ref) {
        const url = blobCache.get(ref);
        if (url && String(url).startsWith('blob:')) {
            try { URL.revokeObjectURL(url); } catch (e) {}
        }
        blobCache.delete(ref);
    }

    async function compressImage(file, maxW, maxH, quality) {
        const wMax = maxW || 1920;
        const hMax = maxH || 1080;
        const q = quality || 0.86;
        if (typeof createImageBitmap !== 'function') return file;
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, wMax / bmp.width, hMax / bmp.height);
        const w = Math.max(1, Math.round(bmp.width * scale));
        const h = Math.max(1, Math.round(bmp.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0, w, h);
        if (typeof bmp.close === 'function') bmp.close();
        const blob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b || file), 'image/jpeg', q);
        });
        return blob;
    }

    async function putLevelImage(levelId, side, file) {
        const blob = file instanceof Blob ? await compressImage(file) : file;
        const key = imageKey(levelId, side);
        revokeCached(key);
        await idbPut(key, blob);
        const url = URL.createObjectURL(blob);
        blobCache.set(key, url);
        return { key, url, blob };
    }

    async function resolveImageUrl(ref) {
        if (!ref) return '';
        if (blobCache.has(ref)) return blobCache.get(ref);
        if (isIdbRef(ref)) {
            try {
                const blob = await idbGet(ref);
                if (!blob) return '';
                const url = URL.createObjectURL(blob);
                blobCache.set(ref, url);
                return url;
            } catch (e) {
                return '';
            }
        }
        if (typeof ref === 'string' && ref.startsWith('data:image')) {
            try {
                const res = await fetch(ref);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                blobCache.set(ref, url);
                return url;
            } catch (e) {
                return ref;
            }
        }
        return ref;
    }

    async function hydrateLevels(levels) {
        const out = [];
        for (const lv of (levels || [])) {
            const next = { ...lv };
            if (lv.leftUrl) next.leftUrl = await resolveImageUrl(lv.leftUrl);
            if (lv.rightUrl) next.rightUrl = await resolveImageUrl(lv.rightUrl);
            out.push(next);
        }
        return out;
    }

    async function deleteLevelImages(level) {
        if (!level) return;
        for (const side of ['left', 'right']) {
            const ref = side === 'right' ? level.rightUrl : level.leftUrl;
            const key = isIdbRef(ref) ? ref : imageKey(level.id, side);
            revokeCached(key);
            try { await idbDel(key); } catch (e) {}
        }
    }

    function imageContentBox(img, relativeEl) {
        if (!img) return null;
        const ib = img.getBoundingClientRect();
        const rb = (relativeEl || img).getBoundingClientRect();
        const nw = Number(img.naturalWidth) || 0;
        const nh = Number(img.naturalHeight) || 0;
        let width = ib.width;
        let height = ib.height;
        let absLeft = ib.left;
        let absTop = ib.top;
        if (nw > 0 && nh > 0 && ib.width > 0 && ib.height > 0) {
            const scale = Math.min(ib.width / nw, ib.height / nh);
            width = nw * scale;
            height = nh * scale;
            absLeft = ib.left + (ib.width - width) / 2;
            absTop = ib.top + (ib.height - height) / 2;
        }
        return {
            left: absLeft - rb.left,
            top: absTop - rb.top,
            width,
            height,
            absLeft,
            absTop
        };
    }

    function eventToImageNorm(ev, img, relativeEl) {
        const box = imageContentBox(img, relativeEl);
        if (!box || box.width < 2 || box.height < 2) return null;
        const x = (ev.clientX - box.absLeft) / box.width;
        const y = (ev.clientY - box.absTop) / box.height;
        if (x < -0.02 || y < -0.02 || x > 1.02 || y > 1.02) return null;
        return {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y)),
            w: box.width,
            h: box.height
        };
    }

    function fitWrapToImage(wrap, img, stage) {
        if (!wrap || !img || !stage || !img.naturalWidth || !img.naturalHeight) return null;
        const pw = stage.clientWidth || stage.getBoundingClientRect().width;
        const ph = stage.clientHeight || stage.getBoundingClientRect().height;
        if (!pw || !ph) return null;
        const scale = Math.min(pw / img.naturalWidth, ph / img.naturalHeight);
        const w = Math.max(1, img.naturalWidth * scale);
        const h = Math.max(1, img.naturalHeight * scale);
        wrap.style.width = w + 'px';
        wrap.style.height = h + 'px';
        return { width: w, height: h };
    }

    global.SpotDiffStore = {
        imageKey,
        isIdbRef,
        putLevelImage,
        resolveImageUrl,
        hydrateLevels,
        deleteLevelImages,
        compressImage
    };
    global.SpotDiffGeom = {
        imageContentBox,
        eventToImageNorm,
        fitWrapToImage
    };
})(typeof window !== 'undefined' ? window : global);
