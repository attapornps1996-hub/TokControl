(function (global) {
    'use strict';

    global.TOKCONTROL_CLOUD_DEFAULT = 'https://pandy-backend-302414976454.asia-southeast1.run.app';

    function normalizeCloudUrl(url) {
        if (!url || typeof url !== 'string') return url;
        let out = url.trim().replace(/\/$/, '');
        out = out.replace('302414978454', '302414976454');
        out = out.replace('382414976454', '302414976454');
        return out;
    }

    global.normalizeCloudUrl = normalizeCloudUrl;

    global.resolveTokControlServerUrl = function resolveTokControlServerUrl() {
        const saved = global.localStorage.getItem('pandy_cloud_url');
        if (saved && saved.trim().toLowerCase() === 'local') {
            return global.location.origin;
        }
        if (saved && saved.trim()) {
            return normalizeCloudUrl(saved);
        }
        return global.TOKCONTROL_CLOUD_DEFAULT;
    };

    const CLOUD_API_EXACT = new Set([
        '/api/profile',
        '/api/cloud/status',
        '/api/admin/verify-pin'
    ]);

    // Local-only even when friends prefix is cloud-routed (needs desktop activePanels)
    const LOCAL_ONLY_PATHS = new Set([
        '/api/friends/presence'
    ]);

    const LOCAL_ONLY_PREFIXES = [
        '/api/local-sounds'
    ];

    const CLOUD_API_PREFIXES = [
        '/api/signup',
        '/api/login',
        '/api/profiles',
        '/api/profile/',
        '/api/dm',
        '/api/config',
        '/api/assets',
        '/api/admin/overview',
        '/api/admin/grant-pro',
        '/api/admin/revoke-pro',
        '/api/admin/grant-gamecenter',
        '/api/admin/revoke-gamecenter',
        '/api/admin/achievements',
        '/api/features',
        '/api/admin/members',
        '/api/promo/redeem',
        '/api/admin/promo/generate',
        '/api/admin/promo/list',
        '/api/payments/',
        '/api/payments',
        '/api/admin/payments',
        '/api/bug-reports',
        '/api/admin/bug-reports',
        '/api/admin/announcements',
        '/api/announcements/',
        '/api/announcements/recent',
        '/api/announcements/active-popup',
        '/api/admin/ae-presets',
        '/api/ae-presets',
        '/api/auth/',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/auth/resend-verification',
        '/api/auth/bind-email',
        '/api/auth/confirm-email-code',
        '/api/friends'
    ];

    global.shouldRouteApiToCloud = function shouldRouteApiToCloud(url) {
        if (typeof url !== 'string' || !url.startsWith('/api/')) return false;
        const cloudBase = global.resolveTokControlServerUrl();
        if (!cloudBase || cloudBase === global.location.origin) return false;
        const pathOnly = url.split('?')[0];
        if (LOCAL_ONLY_PATHS.has(pathOnly)) return false;
        if (LOCAL_ONLY_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) return false;
        if (CLOUD_API_EXACT.has(pathOnly)) return true;
        return CLOUD_API_PREFIXES.some((p) => {
            if (p.endsWith('/')) return pathOnly === p.slice(0, -1) || pathOnly.startsWith(p);
            return pathOnly === p || pathOnly.startsWith(`${p}/`);
        });
    };

    global.getCloudAssetUrl = function getCloudAssetUrl(assetId) {
        const id = String(assetId || '').replace(/[^a-f0-9]/gi, '');
        if (!id) return '';
        const base = String(global.resolveTokControlServerUrl() || global.location.origin || '').replace(/\/$/, '');
        return `${base}/api/assets/${id}`;
    };

    /** <img src> cannot use the fetch interceptor — rewrite /api/assets/* to the Cloud host. */
    global.resolveMediaUrl = function resolveMediaUrl(url) {
        const raw = String(url || '').trim();
        if (!raw || raw.startsWith('blob:')) return '';
        const match = raw.match(/\/api\/assets\/([a-f0-9]+)/i);
        if (match) return global.getCloudAssetUrl(match[1]);
        return raw;
    };

    global.paymentApiUrl = function paymentApiUrl(path) {
        const p = String(path || '').startsWith('/') ? String(path) : `/${path}`;
        const base = String(global.resolveTokControlServerUrl() || global.location.origin || '').replace(/\/$/, '');
        return `${base}${p}`;
    };
})(window);
