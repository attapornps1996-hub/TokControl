/**
 * TokControl — apply window.__TC_WIDGET__ bootstrap (server-injected)
 * Must load before overlay mode/token init scripts.
 */
(function (global) {
    'use strict';

    function paramsFromSearch() {
        try {
            return new URLSearchParams(global.location.search || '');
        } catch (_) {
            return new URLSearchParams();
        }
    }

    function mergeDefaultsIntoSearch(defaults, query) {
        const params = paramsFromSearch();
        const apply = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            Object.keys(obj).forEach((k) => {
                const v = obj[k];
                if (v === undefined || v === null || v === '') return;
                if (!params.has(k)) params.set(k, String(v));
            });
        };
        apply(defaults);
        apply(query);
        return params;
    }

    function applyWidgetBootstrap() {
        const W = global.__TC_WIDGET__ && typeof global.__TC_WIDGET__ === 'object'
            ? global.__TC_WIDGET__
            : null;

        const urlParams = paramsFromSearch();
        const cid = (W && W.cid) || urlParams.get('cid') || urlParams.get('token') || '';
        const modeFromBoot = W && W.mode ? String(W.mode) : '';
        const modeFromUrl = urlParams.get('mode') || '';
        const mode = modeFromBoot || modeFromUrl || '';

        const mergedParams = W
            ? mergeDefaultsIntoSearch(W.defaults, W.query)
            : urlParams;

        if (cid && !mergedParams.get('cid')) mergedParams.set('cid', cid);
        if (cid && !mergedParams.get('token')) mergedParams.set('token', cid);
        if (mode && !mergedParams.get('mode')) mergedParams.set('mode', mode);

        // Expose helpers for overlay pages
        global.__TC_WIDGET_BOOT__ = {
            raw: W,
            cid: cid || '',
            token: cid || '',
            mode: mode || '',
            brand: (W && W.brand) || 'TokControl',
            settings: (W && W.settings) || {},
            params: mergedParams,
            get: (key, fallback) => {
                if (mergedParams.has(key)) return mergedParams.get(key);
                return fallback;
            }
        };

        // Patch URLSearchParams used by pages that read location.search once —
        // also rewrite history so subsequent URLSearchParams(location.search) see merges.
        try {
            if (W && typeof history !== 'undefined' && history.replaceState) {
                const next = mergedParams.toString();
                const cur = (global.location.search || '').replace(/^\?/, '');
                if (next && next !== cur) {
                    const path = global.location.pathname + (next ? '?' + next : '') + (global.location.hash || '');
                    history.replaceState(null, '', path);
                }
            }
        } catch (_) { /* ignore */ }

        return global.__TC_WIDGET_BOOT__;
    }

    const boot = applyWidgetBootstrap();
    global.getTokControlWidgetBoot = function getTokControlWidgetBoot() {
        return global.__TC_WIDGET_BOOT__ || boot || applyWidgetBootstrap();
    };
})(typeof window !== 'undefined' ? window : globalThis);
