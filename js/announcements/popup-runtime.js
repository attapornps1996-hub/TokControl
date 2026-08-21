/**
 * Frontend popup runtime — targeting, dismiss, queue, analytics.
 * Consumes existing /api/announcements plus active-popup.
 */
(function (global) {
    'use strict';

    const Cfg = global.TcAnnouncementPopup;
    const Render = global.TcPopupRenderer;
    const STORAGE_KEY = 'tc_popup_announcement_state_v1';
    const hostId = 'tcPopupAnnouncementHost';

    const runtime = {
        queue: [],
        active: null,
        closeTimer: null,
        closeLockedUntil: 0,
        testMode: false
    };

    function isAdminUser() {
        try { return typeof global.isCurrentUserAdmin === 'function' && !!global.isCurrentUserAdmin(); } catch (_) { return false; }
    }

    function now() { return Date.now(); }

    function loadState() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) { return {}; }
    }
    function saveState(state) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    }

    function userContext() {
        let role = 'free';
        try {
            if (typeof global.isCurrentUserAdmin === 'function' && global.isCurrentUserAdmin()) role = 'admin';
            else if (typeof global.isAppPro === 'function' && global.isAppPro()) role = 'pro';
        } catch (_) {}
        let version = '';
        try { version = String(global.APP_VERSION || document.getElementById('splashBrandVersion')?.textContent || ''); } catch (_) {}
        const firstLogin = !localStorage.getItem('pandy_token_seen');
        return {
            role,
            locale: document.documentElement.lang || 'th',
            platform: window.innerWidth < 760 ? 'mobile' : 'desktop',
            version,
            firstLogin,
            route: (typeof global.viewLifecycle?.activeTab === 'function' && global.viewLifecycle.activeTab()) || 'dashboard',
            userId: localStorage.getItem('pandy_user_id') || ''
        };
    }

    function matchesAudience(item, ctx) {
        const audience = item.audience || item.popupConfig?.targeting?.audienceType || 'all';
        if (audience === 'all') return true;
        if (audience === 'pro') return ctx.role === 'pro' || ctx.role === 'admin';
        if (audience === 'free') return ctx.role === 'free';
        if (audience === 'custom' || audience === 'group') {
            const ids = String(item.audienceConfig || '').split(',').map((x) => x.trim()).filter(Boolean);
            return ids.includes(String(ctx.userId));
        }
        return true;
    }

    function matchesTargeting(item, ctx) {
        const t = item.popupConfig?.targeting || {};
        if (t.platform && t.platform !== 'all' && t.platform !== ctx.platform) return false;
        if (t.firstLogin && !ctx.firstLogin) return false;
        if (t.appVersionMin && ctx.version && String(ctx.version) < String(t.appVersionMin)) return false;
        if (Array.isArray(t.locales) && t.locales.length && !t.locales.includes(ctx.locale) && t.locales.indexOf('th') === -1) {
            /* keep th-default permissive */
        }
        const rules = item.popupConfig?.rules || {};
        if (rules.showOnDashboard === false && ctx.route === 'dashboard') return false;
        if (Array.isArray(rules.routes) && rules.routes.length && !rules.routes.includes(ctx.route)) return false;
        return true;
    }

    function isDismissed(item) {
        const state = loadState();
        const rec = state[String(item.id)];
        if (!rec) return false;
        const rules = item.popupConfig?.rules || {};
        if (rec.acknowledged && rules.requireAcknowledgement) return true;
        if (rules.showOnce && rec.dismissedAt) return true;
        if (rules.showOncePerVersion) {
            const ver = userContext().version || '0';
            if (rec.versionSeen === ver) return true;
        }
        if (rules.showOncePerDay && rec.dismissedAt) {
            const day = new Date(rec.dismissedAt).toDateString();
            if (day === new Date().toDateString()) return true;
        }
        if (rules.showAgainAfterHours > 0 && rec.dismissedAt) {
            const wait = Number(rules.showAgainAfterHours) * 3600 * 1000;
            if (now() - rec.dismissedAt < wait) return true;
        }
        if (rules.maxImpressions > 0 && Number(rec.impressions || 0) >= rules.maxImpressions) return true;
        return false;
    }

    function mark(item, patch) {
        if (runtime.testMode) return;
        const state = loadState();
        const id = String(item.id);
        state[id] = Object.assign({ impressions: 0 }, state[id] || {}, patch);
        saveState(state);
    }

    function ensureHost() {
        let host = document.getElementById(hostId);
        if (host) return host;
        host = document.createElement('div');
        host.id = hostId;
        document.body.appendChild(host);
        return host;
    }

    function track(item, eventType, extra) {
        if (runtime.testMode) return;
        const token = localStorage.getItem('pandy_token');
        if (!token || !item || item.id == null) return;
        const payload = {
            eventType,
            popup_id: item.id,
            popup_type: item.announcementType || item.category,
            display_type: item.displayType || 'popup',
            audience_type: item.audience || 'all',
            route: userContext().route,
            timestamp: new Date().toISOString(),
            meta: extra || {}
        };
        fetch(`/api/announcements/${encodeURIComponent(item.id)}/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(payload)
        }).catch(() => {});
        try {
            document.dispatchEvent(new CustomEvent('tc-popup-' + eventType, { detail: payload }));
        } catch (_) {}
    }

    function hide() {
        const wasTest = runtime.testMode;
        const host = document.getElementById(hostId);
        if (host) host.innerHTML = '';
        runtime.active = null;
        runtime.testMode = false;
        if (runtime.closeTimer) clearTimeout(runtime.closeTimer);
        document.removeEventListener('keydown', onEsc);
        if (!wasTest) showNext();
    }

    function onEsc(e) {
        if (e.key !== 'Escape') return;
        const item = runtime.active;
        if (!item) return;
        const rules = item.popupConfig?.rules || {};
        if (rules.escCloses === false || rules.requireAcknowledgement) return;
        if (Date.now() < runtime.closeLockedUntil) return;
        dismiss(item, 'esc');
    }

    function runCta(item, actionType, actionValue, ctaKind) {
        track(item, ctaKind === 'secondary' ? 'secondary_click' : 'cta_click', { actionType, actionValue });
        if (actionType === 'acknowledge') {
            mark(item, { acknowledged: true, dismissedAt: now() });
            track(item, 'acknowledged');
            hide();
            return;
        }
        if (actionType === 'close') {
            dismiss(item, 'cta');
            return;
        }
        if (actionType === 'open_url' && actionValue) {
            try { window.open(actionValue, '_blank', 'noopener'); } catch (_) {}
        }
        if (actionType === 'open_route' && actionValue && typeof global.switchMainTab === 'function') {
            global.switchMainTab(actionValue);
        }
        if (actionType === 'open_feature' && typeof global.switchMainTab === 'function') {
            global.switchMainTab(actionValue || 'gamecenter');
        }
        if (item.popupConfig?.rules?.requireAcknowledgement) {
            mark(item, { acknowledged: true, dismissedAt: now() });
        }
        hide();
    }

    function dismiss(item, reason) {
        mark(item, { dismissedAt: now(), versionSeen: userContext().version || '0' });
        track(item, 'dismissed', { reason });
        hide();
    }

    function bindRoot(root, item) {
        const rules = item.popupConfig?.rules || {};
        const delay = Number(rules.delayBeforeClose || item.popupConfig?.close?.delaySeconds || 0) * 1000;
        runtime.closeLockedUntil = delay ? Date.now() + delay : 0;
        root.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('[data-tc-pop-close]');
            if (closeBtn) {
                if (Date.now() < runtime.closeLockedUntil) return;
                if (rules.requireAcknowledgement) return;
                dismiss(item, 'close');
                return;
            }
            const backdrop = e.target.closest('[data-tc-pop-backdrop]');
            if (backdrop && root.dataset.overlayClick === '1' && !rules.requireAcknowledgement && Date.now() >= runtime.closeLockedUntil) {
                dismiss(item, 'backdrop');
                return;
            }
            const link = e.target.closest('[data-tc-pop-link]');
            if (link && link.dataset.tcPopLink) {
                try { window.open(link.dataset.tcPopLink, '_blank', 'noopener'); } catch (_) {}
                return;
            }
            const cta = e.target.closest('[data-tc-pop-cta]');
            if (cta) {
                const kind = cta.classList.contains('is-secondary') ? 'secondary' : 'primary';
                runCta(item, cta.dataset.action, cta.dataset.value, kind);
            }
        });
        document.addEventListener('keydown', onEsc);
    }

    function showItem(item, opts) {
        if (!Render) return;
        runtime.testMode = !!(opts && opts.test);
        runtime.active = item;
        const host = ensureHost();
        host.innerHTML = Render.renderPopup(item, {});
        const root = host.querySelector('.tc-pop-root');
        if (root) {
            bindRoot(root, item);
            if (runtime.testMode) root.classList.add('is-admin-test');
        }
        if (!runtime.testMode) {
            const rec = loadState()[String(item.id)] || { impressions: 0 };
            mark(item, { impressions: Number(rec.impressions || 0) + 1, lastViewedAt: now() });
            track(item, 'impression');
            track(item, 'view');
        }
    }

    function showNext() {
        while (runtime.queue.length) {
            const next = runtime.queue.shift();
            if (!isDismissed(next)) {
                showItem(next);
                return;
            }
        }
    }

    function rank(list) {
        return list.slice().sort((a, b) => {
            const ar = a.popupConfig?.rules || {};
            const br = b.popupConfig?.rules || {};
            const ac = ar.blocking || ar.requireAcknowledgement ? 1 : 0;
            const bc = br.blocking || br.requireAcknowledgement ? 1 : 0;
            if (bc !== ac) return bc - ac;
            const ap = Number(a.priority || ar.queuePriority || 0);
            const bp = Number(b.priority || br.queuePriority || 0);
            return bp - ap;
        });
    }

    function ingest(list) {
        const ctx = userContext();
        const eligible = (list || [])
            .map((row) => Cfg.hydrateAnnouncement(row))
            .filter((item) => item && (item.displayType === 'popup' || item.showPopup || item.popupConfig))
            .filter((item) => item.status === 'published' || !item.status)
            .filter((item) => matchesAudience(item, ctx) && matchesTargeting(item, ctx))
            .filter((item) => !isDismissed(item));
        runtime.queue = rank(eligible);
        if (!runtime.active) showNext();
    }

    async function fetchAndShow() {
        const token = localStorage.getItem('pandy_token');
        if (!token) return;
        try {
            const res = await fetch('/api/announcements/active-popup', {
                headers: { Authorization: 'Bearer ' + token }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const queue = Array.isArray(data.queue) ? data.queue : (data.popup ? [data.popup] : []);
            ingest(queue);
        } catch (err) {
            console.warn('[popup-runtime]', err);
        }
    }

    function previewDemo(kind) {
        const type = ['maintenance', 'alert', 'update', 'feature'].includes(kind) ? kind : 'feature';
        const demo = {
            id: 'demo-' + type,
            title: Cfg.TEMPLATES[type].title,
            message: Cfg.TEMPLATES[type].previewHint,
            displayType: 'popup',
            announcementType: type,
            status: 'published',
            audience: 'all',
            popupConfig: Cfg.defaultPopupConfig(type)
        };
        previewLive(demo);
    }

    function previewLive(announcement) {
        if (!isAdminUser()) return;
        if (!announcement) return;
        const item = Cfg.hydrateAnnouncement(announcement);
        item.id = item.id || ('test-' + Date.now());
        item.displayType = 'popup';
        showItem(item, { test: true });
    }

    function mountAdminTestFab() {
        const existing = document.getElementById('tcAdminPopupTestFab');
        if (!isAdminUser()) {
            if (existing) existing.remove();
            return;
        }
        if (existing) return;
        const btn = document.createElement('button');
        btn.id = 'tcAdminPopupTestFab';
        btn.type = 'button';
        btn.className = 'tc-pop-admin-test-fab';
        btn.innerHTML = '<span class="material-symbols-outlined">campaign</span><span>ทดสอบป๊อปอัป</span>';
        btn.title = 'แอดมินเท่านั้น — แสดงป๊อปอัปจริงทับหน้าจอแอป';
        btn.addEventListener('click', async () => {
            const editor = global.TcPopupEditor;
            const editorOpen = document.querySelector('#adm2PopupEditorHost .tc-poped');
            if (editorOpen && editor && typeof editor.current === 'function') {
                const draft = editor.current();
                if (draft && draft.popupConfig) {
                    previewLive(draft);
                    return;
                }
            }
            try {
                const token = localStorage.getItem('pandy_token');
                const res = await fetch('/api/announcements/active-popup', {
                    headers: token ? { Authorization: 'Bearer ' + token } : {}
                });
                const data = await res.json().catch(() => ({}));
                const queue = Array.isArray(data.queue) ? data.queue : (data.popup ? [data.popup] : []);
                if (queue[0]) previewLive(queue[0]);
                else previewDemo('alert');
            } catch (_) {
                previewDemo('alert');
            }
        });
        document.body.appendChild(btn);
    }

    function boot() {
        if (runtime._booted) return;
        runtime._booted = true;
        fetchAndShow();
        mountAdminTestFab();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                fetchAndShow();
                mountAdminTestFab();
            }
        });
    }

    global.TcPopupRuntime = {
        boot,
        ingest,
        fetchAndShow,
        previewDemo,
        previewLive,
        hide,
        isDismissed,
        ensureAdminTestFab: mountAdminTestFab
    };
})(typeof window !== 'undefined' ? window : globalThis);
