/**
 * Media Guard — ป้องกัน UI ค้างเมื่ออัปโหลดรูป/เสียงจำนวนมาก (กาชา + วงล้อ)
 */
(function (global) {
    'use strict';

    const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    const LIMITS = {
        gachaMaxPerTier: 300,
        gachaMaxFileMB: 15,
        gachaPreviewPage: 40,
        gachaUploadBatchMax: 25,
        wheelMaxPerItem: 30,
        wheelMaxTotal: 500,
        wheelMaxFileMB: 8,
        wheelThumbMaxPx: 250
    };

    function debounce(fn, ms) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    function estimateDataUrlBytes(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return 0;
        const comma = dataUrl.indexOf(',');
        if (comma < 0) return dataUrl.length;
        const b64 = dataUrl.slice(comma + 1);
        return Math.floor(b64.length * 0.75);
    }

    function formatMB(bytes) {
        return (bytes / (1024 * 1024)).toFixed(1);
    }

    /** ประมวลผลไฟล์ทีละรายการ ลด memory spike */
    async function processSequential(items, processor, onProgress) {
        const results = [];
        for (let i = 0; i < items.length; i++) {
            const r = await processor(items[i], i);
            results.push(r);
            if (onProgress) onProgress(i + 1, items.length);
        }
        return results;
    }

    // ── Lazy image observer (shared singleton) ──
    let _lazyObserver = null;
    function getLazyObserver() {
        if (_lazyObserver) return _lazyObserver;
        _lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const src = el.dataset.lazySrc;
                if (!src) return;
                if (el.tagName === 'IMG') el.src = src;
                else if (el.tagName === 'VIDEO') { el.src = src; el.load(); }
                el.removeAttribute('data-lazy-src');
                _lazyObserver.unobserve(el);
            });
        }, { rootMargin: '200px' });
        return _lazyObserver;
    }

    function observeLazy(container) {
        if (!container) return;
        const obs = getLazyObserver();
        container.querySelectorAll('[data-lazy-src]').forEach((el) => obs.observe(el));
    }

    function unobserveLazy(container) {
        if (!container || !_lazyObserver) return;
        container.querySelectorAll('[data-lazy-src]').forEach((el) => _lazyObserver.unobserve(el));
    }

    function lazyImgTag(src, extraClass, extraStyle) {
        const cls = extraClass || 'preview-media';
        const sty = extraStyle || 'background:#111;';
        return `<img data-lazy-src="${src}" class="${cls}" loading="lazy" style="${sty}" src="${PLACEHOLDER}">`;
    }

    function lazyThumbTag(src, size) {
        const px = size || 40;
        return `<img data-lazy-src="${src}" loading="lazy" src="${PLACEHOLDER}" style="width:${px}px;height:${px}px;object-fit:cover;border-radius:6px;border:1px solid #444;">`;
    }

    // ── Wheel IndexedDB storage (แทน localStorage ที่จำกัด ~5MB) ──
    const WHEEL_DB = 'tokcontrol_wheel_db';
    const WHEEL_STORE = 'data';
    const WHEEL_KEY = 'gacha_v8_profiles';
    const WHEEL_ACTIVE_KEY = 'gacha_v8_active_profile';
    const LS_PROFILES = 'gacha_v8_profiles';
    const LS_ACTIVE = 'gacha_v8_active_profile';

    function openWheelDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(WHEEL_DB, 1);
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = (e) => {
                if (!e.target.result.objectStoreNames.contains(WHEEL_STORE)) {
                    e.target.result.createObjectStore(WHEEL_STORE);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
        });
    }

    async function idbGet(db, key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([WHEEL_STORE], 'readonly');
            const req = tx.objectStore(WHEEL_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbSet(db, key, value) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction([WHEEL_STORE], 'readwrite');
            tx.objectStore(WHEEL_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function wheelLoad() {
        let profiles = null;
        let activeProfileId = null;
        try {
            const db = await openWheelDB();
            profiles = await idbGet(db, WHEEL_KEY);
            activeProfileId = await idbGet(db, WHEEL_ACTIVE_KEY);
        } catch (e) {
            console.warn('[MediaGuard] IndexedDB load failed', e);
        }
        if (!profiles) {
            try {
                const raw = localStorage.getItem(LS_PROFILES);
                if (raw) {
                    profiles = JSON.parse(raw);
                    activeProfileId = localStorage.getItem(LS_ACTIVE);
                }
            } catch (e) { /* ignore */ }
        }
        return { profiles, activeProfileId };
    }

    async function wheelSave(profiles, activeProfileId) {
        try {
            const db = await openWheelDB();
            await idbSet(db, WHEEL_KEY, profiles);
            await idbSet(db, WHEEL_ACTIVE_KEY, activeProfileId);
            try {
                localStorage.removeItem(LS_PROFILES);
                localStorage.removeItem(LS_ACTIVE);
            } catch (e) { /* ignore */ }
            return true;
        } catch (e) {
            console.warn('[MediaGuard] IndexedDB save failed, fallback localStorage', e);
            try {
                localStorage.setItem(LS_PROFILES, JSON.stringify(profiles));
                localStorage.setItem(LS_ACTIVE, activeProfileId);
                return true;
            } catch (e2) {
                return false;
            }
        }
    }

    function countWheelImages(profiles) {
        let total = 0;
        if (!profiles) return 0;
        profiles.forEach((p) => {
            (p.wheels || []).forEach((w) => {
                (w.items || []).forEach((it) => {
                    const imgs = it.images || (it.image ? [it.image] : []);
                    total += imgs.length;
                });
            });
        });
        return total;
    }

    global.MediaGuard = {
        LIMITS,
        PLACEHOLDER,
        debounce,
        estimateDataUrlBytes,
        formatMB,
        processSequential,
        getLazyObserver,
        observeLazy,
        unobserveLazy,
        lazyImgTag,
        lazyThumbTag,
        wheelLoad,
        wheelSave,
        countWheelImages
    };
})(typeof window !== 'undefined' ? window : global);
