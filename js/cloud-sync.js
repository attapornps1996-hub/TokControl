/**
 * Cloud Phase 1 — Hybrid sync (login + config + assets on server, TikTok local)
 */
(function (global) {
    'use strict';

    const ASSET_PATH = '/api/assets/';
    const CACHE_DB = 'TokControlCloudCache';
    const CACHE_STORE = 'assets';

    let status = 'idle'; // idle | syncing | synced | error | offline
    let lastSyncAt = null;
    let dirty = false;
    let pushTimer = null;
    let statusEl = null;
    let pushHeld = false;
    let pushHoldCount = 0;

    function isLoggedIn() {
        return !!localStorage.getItem('pandy_token');
    }

    function serverUrl() {
        if (typeof global.resolveTokControlServerUrl === 'function') {
            return global.resolveTokControlServerUrl();
        }
        const saved = localStorage.getItem('pandy_cloud_url');
        if (saved && saved.trim()) return saved.trim().replace(/\/$/, '');
        return global.location.origin;
    }

    function isCloudBackend() {
        return serverUrl() !== global.location.origin;
    }

    function isDataUrl(v) {
        return typeof v === 'string' && v.startsWith('data:');
    }

    function isAssetRef(v) {
        return typeof v === 'string' && (v.startsWith(ASSET_PATH) || v.includes(ASSET_PATH));
    }

    function resolveAssetUrl(ref) {
        if (!ref) return ref;
        if (isDataUrl(ref)) return ref;
        if (ref.startsWith('http://') || ref.startsWith('https://')) return ref;
        if (ref.startsWith(ASSET_PATH) || ref.startsWith('/api/assets/')) {
            const pathOnly = ref.startsWith('/') ? ref : `/${ref}`;
            if (isCloudBackend()) {
                return serverUrl().replace(/\/$/, '') + pathOnly;
            }
            return pathOnly;
        }
        return ref;
    }

    function setStatus(next, detail) {
        status = next;
        if (statusEl) {
            const labels = {
                idle: '☁️ พร้อม sync',
                syncing: '⏳ กำลัง sync...',
                synced: '✅ sync แล้ว',
                error: '⚠️ sync ล้มเหลว',
                offline: '📴 offline (ใช้ cache)'
            };
            statusEl.textContent = detail || labels[next] || next;
            statusEl.dataset.state = next;
        }
    }

    function bindStatusElement(el) {
        statusEl = el;
        setStatus(status);
    }

    function markDirty() {
        dirty = true;
        if (!pushHeld) schedulePush();
    }

    function holdPush() {
        pushHoldCount += 1;
        pushHeld = true;
        if (pushTimer) {
            clearTimeout(pushTimer);
            pushTimer = null;
        }
    }

    function releasePush() {
        pushHoldCount = Math.max(0, pushHoldCount - 1);
        pushHeld = pushHoldCount > 0;
        if (!pushHeld && dirty) schedulePush();
    }

    function clearDirty() {
        dirty = false;
        if (pushTimer) {
            clearTimeout(pushTimer);
            pushTimer = null;
        }
    }

    function schedulePush() {
        if (pushHeld || !isLoggedIn()) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => pushConfig(), 2500);
    }

    function openCacheDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(CACHE_DB, 1);
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = (e) => {
                if (!e.target.result.objectStoreNames.contains(CACHE_STORE)) {
                    e.target.result.createObjectStore(CACHE_STORE);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
        });
    }

    async function cacheAsset(assetId, dataUrl) {
        try {
            const db = await openCacheDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction([CACHE_STORE], 'readwrite');
                tx.objectStore(CACHE_STORE).put(dataUrl, assetId);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) { /* ignore */ }
    }

    async function getCachedAsset(assetId) {
        try {
            const db = await openCacheDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction([CACHE_STORE], 'readonly');
                const req = tx.objectStore(CACHE_STORE).get(assetId);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            return null;
        }
    }

    function getAuthHeaders(extra = {}) {
        const token = localStorage.getItem('pandy_token');
        return {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...extra
        };
    }

    async function uploadAsset(dataUrl, mimeType) {
        const resp = await fetch('/api/assets/upload', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ dataUrl, mimeType })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.error || 'upload failed');
        await cacheAsset(data.assetId, dataUrl);
        return data.url;
    }

    async function externalizeValue(value, mimeHint) {
        if (!isDataUrl(value) || !isLoggedIn()) return value;
        try {
            const mime = mimeHint || value.slice(5, value.indexOf(';'));
            return await uploadAsset(value, mime);
        } catch (e) {
            console.warn('[CloudSync] keep inline asset:', e.message);
            return value;
        }
    }

    async function externalizeBanners(banners) {
        if (!banners || !banners.length) return banners;
        const out = JSON.parse(JSON.stringify(banners));
        for (const b of out) {
            for (const field of ['btnImg', 'coverImg', 'shadowImg']) {
                if (b[field]) b[field] = await externalizeValue(b[field]);
            }
            const tiers = ['d', 'b', 'a', 's', 'ss', 'ssr'];
            for (const tier of tiers) {
                const pool = b.pools && b.pools[tier];
                if (!pool) continue;
                for (const item of pool) {
                    if (!item.src) continue;
                    const mime = item.isVideo ? 'video/webm' : 'image/webp';
                    item.src = await externalizeValue(item.src, mime);
                }
            }
        }
        return out;
    }

    function getConfigSnapshot() {
        if (typeof global.getCloudConfigSnapshot === 'function') {
            const snap = global.getCloudConfigSnapshot();
            return { ...snap, _cloudMeta: { version: 1, savedAt: new Date().toISOString() } };
        }
        return {
            banners: global.banners,
            currentBannerIndex: global.currentBannerIndex,
            userCoins: global.userCoins,
            advConf: global.advConf,
            themes: global.themes,
            currentTheme: global.currentTheme,
            aiChatbotSettings: global.aiChatbotSettings,
            _cloudMeta: { version: 1, savedAt: new Date().toISOString() }
        };
    }

    async function buildCloudPayload() {
        const snap = getConfigSnapshot();
        snap.banners = await externalizeBanners(snap.banners);
        return snap;
    }

    async function pushConfig(force) {
        if (!isLoggedIn()) return false;
        if (!dirty && !force) return false;

        setStatus('syncing');
        try {
            const configData = await buildCloudPayload();
            const resp = await fetch('/api/config', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ configData })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data.error || 'save failed');

            dirty = false;
            lastSyncAt = new Date();
            localStorage.setItem('pandy_cloud_last_sync', lastSyncAt.toISOString());
            setStatus('synced', `✅ sync แล้ว ${lastSyncAt.toLocaleTimeString()}`);
            return true;
        } catch (e) {
            console.warn('[CloudSync] push failed:', e);
            setStatus('error', '⚠️ sync ล้มเหลว — ใช้ cache ในเครื่อง');
            return false;
        }
    }

    async function pullConfig(applyFn) {
        if (!isLoggedIn()) return null;
        holdPush();
        setStatus('syncing', '⏳ ดึง config จาก cloud...');
        try {
            const resp = await fetch('/api/config', {
                headers: getAuthHeaders()
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'load failed');
            if (data.success && data.config && typeof applyFn === 'function') {
                await applyFn(data.config);
            }
            lastSyncAt = new Date();
            localStorage.setItem('pandy_cloud_last_sync', lastSyncAt.toISOString());
            setStatus('synced', `✅ โหลดจาก cloud ${lastSyncAt.toLocaleTimeString()}`);
            dirty = false;
            return data.config || null;
        } catch (e) {
            console.warn('[CloudSync] pull failed:', e);
            setStatus('offline', '📴 offline — ใช้ข้อมูลในเครื่อง');
            return null;
        } finally {
            releasePush();
        }
    }

    async function uploadIfLoggedIn(dataUrl, mimeType) {
        if (!isLoggedIn()) return dataUrl;
        try {
            return await uploadAsset(dataUrl, mimeType);
        } catch (e) {
            console.warn('[CloudSync] upload failed:', e.message);
            return dataUrl;
        }
    }

    function init() {
        const last = localStorage.getItem('pandy_cloud_last_sync');
        if (last) {
            lastSyncAt = new Date(last);
            setStatus('synced', `✅ sync ล่าสุด ${lastSyncAt.toLocaleTimeString()}`);
        } else {
            setStatus('idle');
        }
    }

    global.CloudSync = {
        init,
        bindStatusElement,
        markDirty,
        holdPush,
        releasePush,
        clearDirty,
        schedulePush,
        pushConfig,
        pullConfig,
        uploadAsset,
        uploadIfLoggedIn,
        externalizeBanners,
        resolveAssetUrl,
        isLoggedIn,
        isCloudBackend,
        isDataUrl,
        isAssetRef,
        getStatus: () => status,
        getLastSyncAt: () => lastSyncAt
    };
})(typeof window !== 'undefined' ? window : global);
