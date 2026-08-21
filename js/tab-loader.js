/**
 * TokControl — dynamic tab script loader (Phase 1 modularization)
 */
(function () {
    'use strict';

    /** Tab id → script path. Add modules here as they are split out of index.html */
    const TAB_SCRIPTS = {
        credits: '/js/tabs/credits.js',
        camera: '/js/tabs/camera-studio.js',
        actionsevents: '/js/tabs/actions-events.js',
        soundboard: '/js/tabs/soundboard.js',
        store: '/js/store-page.js'
    };

    const loaded = new Set();
    const loading = new Map();

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-tab-src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === '1') resolve();
                else existing.addEventListener('load', () => resolve(), { once: true });
                return;
            }
            const el = document.createElement('script');
            el.src = src;
            el.dataset.tabSrc = src;
            el.onload = () => {
                el.dataset.loaded = '1';
                resolve();
            };
            el.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(el);
        });
    }

    function ensure(tabId) {
        const src = TAB_SCRIPTS[tabId];
        if (!src) return Promise.resolve();
        if (loaded.has(tabId)) return Promise.resolve();
        if (loading.has(tabId)) return loading.get(tabId);

        const p = loadScript(src).then(() => {
            loaded.add(tabId);
            loading.delete(tabId);
        }).catch((err) => {
            loading.delete(tabId);
            console.error('[TabLoader]', tabId, err);
            throw err;
        });
        loading.set(tabId, p);
        return p;
    }

    function preload(tabIds) {
        return Promise.all((tabIds || []).map((id) => ensure(id).catch(() => {})));
    }

    function isLoaded(tabId) {
        return loaded.has(tabId);
    }

    window.TabLoader = { ensure, preload, isLoaded, TAB_SCRIPTS };
})();
