/**
 * Overlay brand watermark — disabled. Pass ?brand=1 to show.
 */
(function () {
    'use strict';

    try {
        const params = new URLSearchParams(window.location.search || '');
        const forceOn = params.get('brand') === '1' || params.get('showBrand') === '1';
        if (!forceOn) return;
    } catch (_) {
        return;
    }

    function brandName() {
        try {
            if (window.__TC_WIDGET__ && window.__TC_WIDGET__.brand) return String(window.__TC_WIDGET__.brand);
            if (window.__TC_WIDGET_BOOT__ && window.__TC_WIDGET_BOOT__.brand) return String(window.__TC_WIDGET_BOOT__.brand);
        } catch (_) { /* ignore */ }
        return 'TokControl';
    }

    function ensureCss() {
        if (document.getElementById('tc-overlay-brand-css')) return;
        const link = document.createElement('link');
        link.id = 'tc-overlay-brand-css';
        link.rel = 'stylesheet';
        link.href = '/styles/overlay-brand.css';
        (document.head || document.documentElement).appendChild(link);
    }

    function mount() {
        if (document.getElementById('tc-overlay-brand')) return;
        ensureCss();
        const el = document.createElement('div');
        el.id = 'tc-overlay-brand';
        el.className = 'tc-overlay-brand tc-overlay-brand--forced';
        el.setAttribute('aria-hidden', 'true');
        const name = brandName();
        el.innerHTML =
            '<img class="tc-overlay-brand__mark" src="/assets/tokcontrol-icon.png" alt="" width="14" height="14" decoding="async">' +
            '<span class="tc-overlay-brand__text"></span>';
        el.querySelector('.tc-overlay-brand__text').textContent = name;
        (document.body || document.documentElement).appendChild(el);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }
})();
