/**
 * TokControl view lifecycle — lazy mount + tab pause/resume for scroll performance.
 */
(function () {
    'use strict';

    /** Views safe to detach (top-level, not parents of other app-views). */
    const LAZY_VIEW_IDS = [
        'win', 'randomwin', 'luckyrituals', 'timer', 'tts', 'admin', 'vote', 'songrequest',
        'credits', 'overlays', 'channelpoints', 'jar', 'airdrop', 'pngtuber',
        'soundalerts', 'soundboard', 'chatbot', 'actionsevents'
    ];

    const ALWAYS_MOUNTED = new Set(['dashboard', 'gamecenter', 'gacha', 'randomwin']);
    const detached = new Map();
    let activeView = 'dashboard';
    let mountHost = null;

    const RANDOM_WIN_SRC = '/random_win.html';
    const LUCKY_RITUALS_SRC = '/lucky_rituals.html?system=shuffle';

    function viewEl(name) {
        return document.getElementById(name + 'View');
    }

    function isLazy(name) {
        return LAZY_VIEW_IDS.includes(name) && !ALWAYS_MOUNTED.has(name);
    }

    function isMounted(name) {
        return !!viewEl(name);
    }

    function getMountHost() {
        if (mountHost && document.body.contains(mountHost)) return mountHost;
        mountHost = document.getElementById('mainContentWrapper');
        return mountHost;
    }

    function insertViewElement(el) {
        const host = getMountHost();
        if (!host || !el) return;
        const anchor = host.querySelector('#chatbotView') || null;
        if (anchor && anchor.parentNode === host) {
            host.insertBefore(el, anchor);
        } else {
            host.appendChild(el);
        }
    }

    function pauseRandomWinFrame() {
        const frame = document.getElementById('randomWinFrame');
        if (!frame) return;
        const src = frame.getAttribute('src') || '';
        if (src && src !== 'about:blank') {
            frame.dataset.savedSrc = src;
            frame.setAttribute('src', 'about:blank');
        }
    }

    function resumeRandomWinFrame() {
        const frame = document.getElementById('randomWinFrame');
        if (!frame) return;
        const cur = (frame.getAttribute('src') || '').trim();
        const target = frame.dataset.savedSrc || frame.dataset.src || RANDOM_WIN_SRC;
        if (!cur || cur === 'about:blank' || cur.endsWith('about:blank')) {
            frame.setAttribute('src', target);
        }
    }

    function ensureRandomWinFrameLoaded() {
        resumeRandomWinFrame();
        const frame = document.getElementById('randomWinFrame');
        if (!frame) return;
        const cur = (frame.getAttribute('src') || '').trim();
        if (!cur || cur === 'about:blank') {
            frame.setAttribute('src', frame.dataset.src || RANDOM_WIN_SRC);
        }
    }

    function pauseLuckyRitualsFrame() {
        const frame = document.getElementById('luckyRitualsFrame');
        if (!frame) return;
        const src = frame.getAttribute('src') || '';
        if (src && src !== 'about:blank') {
            frame.dataset.savedSrc = src;
            frame.setAttribute('src', 'about:blank');
        }
    }

    function resumeLuckyRitualsFrame() {
        const frame = document.getElementById('luckyRitualsFrame');
        if (!frame) return;
        const cur = (frame.getAttribute('src') || '').trim();
        const target = frame.dataset.savedSrc || frame.dataset.src || LUCKY_RITUALS_SRC;
        if (!cur || cur === 'about:blank' || cur.endsWith('about:blank')) {
            frame.setAttribute('src', target);
        }
    }

    function ensureLuckyRitualsFrameLoaded() {
        resumeLuckyRitualsFrame();
        const frame = document.getElementById('luckyRitualsFrame');
        if (!frame) return;
        const cur = (frame.getAttribute('src') || '').trim();
        if (!cur || cur === 'about:blank') {
            frame.setAttribute('src', frame.dataset.src || LUCKY_RITUALS_SRC);
        }
    }

    function pauseSongRequestPoll() {
        if (typeof srPollInterval !== 'undefined' && srPollInterval) {
            clearInterval(srPollInterval);
            srPollInterval = null;
        }
    }

    function resumeSongRequestPoll() {
        if (typeof srPollInterval !== 'undefined' && srPollInterval) return;
        if (typeof ensureSongRequestStore !== 'function') return;
        const s = ensureSongRequestStore();
        if (s.enabled === false) return;
        if (typeof srPollPlayback === 'function') {
            srPollInterval = setInterval(srPollPlayback, 3000);
        }
    }

    const TAB_HOOKS = {
        randomwin: {
            onEnter() { resumeRandomWinFrame(); },
            onLeave() { /* keep iframe running so gifts still spin the wheel off-tab */ }
        },
        luckyrituals: {
            onEnter() { resumeLuckyRitualsFrame(); },
            onLeave() { pauseLuckyRitualsFrame(); }
        },
        jar: {
            onLeave() {
                if (typeof jarStopPreviewEngine === 'function') jarStopPreviewEngine();
            }
        },
        pngtuber: {
            onEnter() {
                if (typeof pngtuberOnTabShown === 'function') pngtuberOnTabShown();
            },
            onLeave() {
                if (typeof pngtuberOnTabHidden === 'function') pngtuberOnTabHidden();
            }
        },
        songrequest: {
            onEnter() {
                if (typeof srEnsurePollRunning === 'function') srEnsurePollRunning();
            },
            onLeave() {
                // Do not pause YouTube playback or poll when leaving the tab.
                // Player host lives outside #songrequestView so audio keeps playing.
                if (typeof srEnsurePollRunning === 'function') srEnsurePollRunning();
            }
        },
        tts: {
            onEnter() {
                if (typeof ttsSyncRuntimeSettings === 'function') ttsSyncRuntimeSettings();
                if (typeof ttsRenderQueue === 'function') ttsRenderQueue();
                if (typeof ttsRenderLogs === 'function') ttsRenderLogs();
                if (typeof ttsRenderSpecialUsers === 'function') ttsRenderSpecialUsers();
                if (typeof ttsLoadVoices === 'function') { try { ttsLoadVoices(); } catch (e) {} }
                if (typeof ttsSetStatus === 'function') ttsSetStatus(!!(typeof ttsState !== 'undefined' && ttsState.speaking));
            },
            onLeave() {
                if (typeof saveTTSSettings === 'function') saveTTSSettings();
                if (typeof ttsSyncRuntimeSettings === 'function') ttsSyncRuntimeSettings();
            }
        }
    };

    function runHook(name, phase) {
        const hook = TAB_HOOKS[name];
        if (!hook || typeof hook[phase] !== 'function') return;
        try { hook[phase](); } catch (e) { console.warn('[view-lifecycle]', name, phase, e); }
    }

    function detachView(name) {
        if (!isLazy(name)) return;
        const el = viewEl(name);
        if (!el) return;
        if (name === 'luckyrituals') pauseLuckyRitualsFrame();
        detached.set(name, el);
        el.classList.remove('active');
        el.remove();
    }

    function attachView(name) {
        if (!isLazy(name)) return;
        if (isMounted(name)) return;
        const el = detached.get(name);
        if (!el) return;
        insertViewElement(el);
        detached.delete(name);
        if (name === 'randomwin') ensureRandomWinFrameLoaded();
        if (name === 'luckyrituals') ensureLuckyRitualsFrameLoaded();
    }

    function onTabLeave(name) {
        if (!name) return;
        runHook(name, 'onLeave');
        detachView(name);
    }

    function onTabEnter(name) {
        activeView = name;
        attachView(name);
        runHook(name, 'onEnter');
        applyActiveViewLayout();
    }

    function initLazyViews() {
        LAZY_VIEW_IDS.forEach((name) => {
            if (!isLazy(name)) return;
            const el = viewEl(name);
            if (!el) return;
            if (name === 'luckyrituals') pauseLuckyRitualsFrame();
            detached.set(name, el);
            el.remove();
        });
        activeView = 'dashboard';
        ensureRandomWinFrameLoaded();
    }

    function wrapSwitchMainTab() {
        const original = window.switchMainTab;
        if (typeof original !== 'function') return;

        window.switchMainTab = async function (viewName) {
            const prev = activeView;
            if (prev && prev !== viewName) onTabLeave(prev);
            attachView(viewName);
            activeView = viewName;
            try {
                await original(viewName);
            } catch (err) {
                console.error('[view-lifecycle] switchMainTab', viewName, err);
            }
            runHook(viewName, 'onEnter');
            applyActiveViewLayout();
        };
    }

    /** Replace CSS zoom scaling — flex layout only. */
    function applyActiveViewLayout() {
        document.querySelectorAll('.app-view').forEach((v) => {
            if (v.classList.contains('active')) {
                v.style.flex = '1';
                v.style.minHeight = '0';
                v.style.zoom = '';
            } else {
                v.style.flex = '';
                v.style.minHeight = '';
                v.style.zoom = '';
            }
        });
        const chrome = document.querySelector('.main-chrome-row');
        if (chrome) chrome.style.zoom = '';
    }

    function disableZoomScaler() {
        window.updateAppViewFitScale = applyActiveViewLayout;
        window.scheduleAppViewFitScale = applyActiveViewLayout;
        applyActiveViewLayout();
    }

    window.applyActiveViewLayout = applyActiveViewLayout;

    window.ensureRandomWinFrameLoaded = ensureRandomWinFrameLoaded;
    window.ensureLuckyRitualsFrameLoaded = ensureLuckyRitualsFrameLoaded;

    window.viewLifecycle = {
        isTabActive(name) { return activeView === name; },
        activeTab() { return activeView; },
        detachView,
        attachView,
        detachAllLazy: initLazyViews,
        applyActiveViewLayout,
        ensureRandomWinFrameLoaded,
        ensureLuckyRitualsFrameLoaded
    };

    function boot() {
        disableZoomScaler();
        wrapSwitchMainTab();
    }

    if (typeof window.switchMainTab === 'function') {
        boot();
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
