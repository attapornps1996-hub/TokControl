/**
 * Shared TikTok gift icon resolver — real image URLs only (no emoji fallbacks).
 */
(function (global) {
    'use strict';

    const PLACEHOLDER = 'https://tikfinity.zerody.one/assets/images/gift-placeholder.png';
    let catalog = [];
    let catalogPromise = null;

    function isGiftIconUrl(v) {
        const s = String(v || '').trim();
        return /^(https?:|data:|\/\/|\/)/i.test(s);
    }

    function normalizeIconUrl(icon) {
        if (!icon) return '';
        const s = String(icon).trim();
        if (!isGiftIconUrl(s)) return '';
        return s.startsWith('//') ? `https:${s}` : s;
    }

    function catalogPool(cat) {
        const pool = cat || catalog;
        return Array.isArray(pool) ? pool : [];
    }

    function findInCatalog(giftId, giftName, cat) {
        const pool = catalogPool(cat);
        if (!pool.length) return '';
        if (giftId != null && giftId !== '') {
            const byId = pool.find((g) => String(g.giftId) === String(giftId));
            const icon = byId?.icon || byId?.giftIcon;
            const url = normalizeIconUrl(icon);
            if (url) return url;
        }
        if (giftName) {
            const n = String(giftName).toLowerCase().trim();
            const byName = pool.find((g) => String(g.giftName || '').toLowerCase().trim() === n);
            const icon = byName?.icon || byName?.giftIcon;
            const url = normalizeIconUrl(icon);
            if (url) return url;
        }
        return '';
    }

    function resolveGiftIcon(item, cat) {
        const fromItem = normalizeIconUrl(item?.image || item?.giftIcon || item?.icon);
        if (fromItem) return fromItem;
        const fromCat = findInCatalog(item?.giftId, item?.giftName || item?.label, cat);
        if (fromCat) return fromCat;
        return PLACEHOLDER;
    }

    function enrichGiftItem(item, cat) {
        if (!item) return item;
        const url = resolveGiftIcon(item, cat);
        return {
            ...item,
            giftIcon: url,
            image: normalizeIconUrl(item.image) || url
        };
    }

    function enrichGiftItems(items, cat) {
        return (items || []).map((it) => enrichGiftItem(it, cat));
    }

    async function loadGiftCatalog() {
        if (catalog.length) return catalog;
        if (catalogPromise) return catalogPromise;
        catalogPromise = fetch('/api/gifts')
            .then((r) => r.json())
            .then((data) => {
                if (data?.list?.length) {
                    catalog = data.list
                        .map((g) => ({
                            giftId: g.giftId,
                            giftName: g.giftName,
                            icon: g.giftIcon || '',
                            giftIcon: g.giftIcon || '',
                            cost: g.diamondCount
                        }));
                }
                return catalog;
            })
            .catch(() => {
                catalog = [];
                return catalog;
            })
            .finally(() => {
                catalogPromise = null;
            });
        return catalogPromise;
    }

    function setCatalog(list) {
        if (!Array.isArray(list)) return;
        catalog = list
            .map((g) => ({
                giftId: g.giftId,
                giftName: g.giftName,
                icon: g.icon || g.giftIcon || '',
                giftIcon: g.giftIcon || g.icon || '',
                cost: g.cost != null ? g.cost : g.diamondCount
            }));
    }

    function pickRandomCatalogGifts(n, cat) {
        const pool = catalogPool(cat).filter((g) => isGiftIconUrl(g.icon || g.giftIcon));
        if (!pool.length) return [];
        const copy = pool.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, Math.min(n, copy.length));
    }

    function escAttr(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function giftIconImgHtml(icon, cls, size, alt) {
        const url = normalizeIconUrl(icon) || PLACEHOLDER;
        const c = cls || 'gift-icon-img';
        const sz = size || 28;
        const ph = escAttr(PLACEHOLDER);
        return `<img class="${escAttr(c)}" src="${escAttr(url)}" alt="${escAttr(alt || '')}" style="width:${sz}px;height:${sz}px;object-fit:contain;" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${ph}'">`;
    }

    global.GiftIconHelper = {
        PLACEHOLDER,
        isGiftIconUrl,
        normalizeIconUrl,
        resolveGiftIcon,
        enrichGiftItem,
        enrichGiftItems,
        loadGiftCatalog,
        setCatalog,
        getCatalog: () => catalog.slice(),
        pickRandomCatalogGifts,
        giftIconImgHtml,
        findInCatalog
    };
})(typeof window !== 'undefined' ? window : globalThis);
