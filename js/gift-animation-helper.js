/**
 * Gift animation helper — animated icons for overlays.
 * Uses live CDN URLs when available + CSS motion fallback.
 */
(function (global) {
    'use strict';

    const PLACEHOLDER = 'https://tikfinity.zerody.one/assets/images/gift-placeholder.png';

    function isAnimatedUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const u = url.toLowerCase();
        return u.includes('.gif') || u.includes('aweme-') || u.includes('effect') || u.includes('lottie');
    }

    /** Try higher-quality / motion-friendly URL variants from TikTok CDN */
    function resolveGiftAnimatedUrl(iconUrl, animatedUrl) {
        if (animatedUrl && animatedUrl.trim()) return animatedUrl.trim();
        if (!iconUrl || typeof iconUrl !== 'string') return '';
        let url = iconUrl.trim();
        if (isAnimatedUrl(url)) return url;
        // Raw resource PNG (often sharper / sometimes animated webp upstream)
        if (url.includes('~tplv-obj')) {
            return url.replace(/~tplv-[^?#]+/g, '');
        }
        return url;
    }

    function giftAnimClass(opts) {
        const size = (opts && opts.size) || 'md';
        const motion = (opts && opts.motion) || 'float';
        return `gift-anim gift-anim--${size} gift-anim--${motion}`;
    }

    /**
     * Build gift icon HTML with optional animation layer.
     * @param {{ giftIcon?: string, giftIconAnimated?: string, giftName?: string, size?: string, motion?: string, className?: string }} opts
     */
    function giftAnimHtml(opts) {
        const o = opts || {};
        const src = resolveGiftAnimatedUrl(o.giftIcon, o.giftIconAnimated) || o.giftIcon || PLACEHOLDER;
        const alt = (o.giftName || 'gift').replace(/"/g, '&quot;');
        const cls = [giftAnimClass(o), o.className || ''].filter(Boolean).join(' ');
        const anim = isAnimatedUrl(src) ? 'gift-anim--native' : '';
        return `<span class="${cls} ${anim}"><img src="${src}" alt="${alt}" loading="lazy" decoding="async" onerror="this.src='${PLACEHOLDER}'"><span class="gift-anim-glow" aria-hidden="true"></span></span>`;
    }

    function enrichGiftFromEvent(gift, catalogEntry) {
        const g = { ...(gift || {}) };
        const cat = catalogEntry || {};
        g.giftIcon = g.giftIcon || cat.giftIcon || '';
        g.giftIconAnimated = resolveGiftAnimatedUrl(g.giftIcon, g.giftIconAnimated || cat.giftIconAnimated);
        g.diamondCount = g.diamondCount != null ? g.diamondCount : (cat.diamondCount || 0);
        return g;
    }

    global.GiftAnim = {
        PLACEHOLDER,
        isAnimatedUrl,
        resolveGiftAnimatedUrl,
        giftAnimHtml,
        giftAnimClass,
        enrichGiftFromEvent
    };
})(typeof window !== 'undefined' ? window : global);
