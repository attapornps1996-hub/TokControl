/**
 * Unified TikTok gift picker — full catalog, progressive render, popup UI.
 */
(function (global) {
    'use strict';

    const CHUNK_SIZE = 56;
    const PLACEHOLDER = 'https://tikfinity.zerody.one/assets/images/gift-placeholder.png';

    let catalog = [];
    let catalogPromise = null;
    let modalEl = null;
    let renderToken = 0;
    let state = {
        onSelect: null,
        multi: false,
        costFilter: 'all',
        query: '',
        title: 'เลือกของขวัญ',
        selectedId: null
    };

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeGift(g) {
        const icon = g.icon || g.giftIcon || '';
        return {
            giftId: String(g.giftId),
            giftName: g.giftName || 'Gift',
            cost: parseInt(g.cost ?? g.diamondCount ?? 0, 10) || 0,
            icon: icon && /^(https?:|data:|\/\/|\/)/i.test(icon) ? icon : ''
        };
    }

    function iconHtml(g, size) {
        const sz = size || 40;
        const url = g.icon || PLACEHOLDER;
        return `<img class="gp-item-icon" src="${esc(url)}" alt="" width="${sz}" height="${sz}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${esc(PLACEHOLDER)}'">`;
    }

    async function loadCatalog() {
        if (catalog.length) return catalog;
        if (catalogPromise) return catalogPromise;

        catalogPromise = (async () => {
            try {
                if (typeof global.ensureGiftCatalogLoaded === 'function') {
                    await global.ensureGiftCatalogLoaded();
                }
                if (global.popularGifts && global.popularGifts.length) {
                    catalog = global.popularGifts.map(normalizeGift);
                    return catalog;
                }
            } catch (e) { /* fallback fetch */ }

            const res = await fetch('/api/gifts');
            const data = await res.json();
            if (res.ok && Array.isArray(data.list)) {
                catalog = data.list.map((dbGift) => normalizeGift({
                    giftId: dbGift.giftId,
                    giftName: dbGift.giftName,
                    cost: dbGift.diamondCount,
                    icon: dbGift.giftIcon || ''
                }));
                if (global.popularGifts) {
                    global.popularGifts = catalog.slice();
                }
                if (global.GiftIconHelper && typeof global.GiftIconHelper.setCatalog === 'function') {
                    global.GiftIconHelper.setCatalog(catalog);
                }
            }
            return catalog;
        })();

        try {
            return await catalogPromise;
        } finally {
            catalogPromise = null;
        }
    }

    function matchesCostFilter(cost, filter) {
        if (filter === 'all') return true;
        if (filter === '1') return cost === 1;
        if (filter === 'low') return cost >= 2 && cost <= 9;
        if (filter === 'mid') return cost >= 10 && cost <= 99;
        if (filter === 'high') return cost >= 100;
        if (filter === 'free') return cost === 0;
        return true;
    }

    function getFilteredList() {
        const q = state.query.trim().toLowerCase();
        let list = catalog.filter((g) => {
            if (!matchesCostFilter(g.cost, state.costFilter)) return false;
            if (!q) return true;
            return g.giftName.toLowerCase().includes(q)
                || String(g.giftId).includes(q)
                || String(g.cost).includes(q);
        });
        list.sort((a, b) => (a.cost - b.cost) || String(a.giftName).localeCompare(String(b.giftName)));
        return list;
    }

    function giftPayload(g) {
        const icon = g.icon || g.giftIcon || g.giftPictureUrl || '';
        return {
            giftId: String(g.giftId || ''),
            giftName: g.giftName || 'Gift',
            cost: parseInt(g.cost, 10) || 0,
            diamondCount: parseInt(g.cost, 10) || 0,
            icon,
            giftIcon: icon,
            giftPictureUrl: icon
        };
    }

    function giftItemHtml(g) {
        const active = state.selectedId && String(state.selectedId) === String(g.giftId) ? ' active' : '';
        return `<button type="button" class="gp-item${active}" data-gift-id="${esc(g.giftId)}" data-gift-name="${esc(g.giftName)}" data-gift-cost="${esc(g.cost)}" data-gift-icon="${esc(g.icon || '')}">
            ${iconHtml(g)}
            <span class="gp-item-name">${esc(g.giftName)}</span>
            <span class="gp-item-cost" data-keep-emoji>${g.cost} <span class="gp-coin-emoji">🪙</span></span>
        </button>`;
    }

    function renderProgressive(list) {
        const grid = modalEl.querySelector('.gp-grid');
        const countEl = modalEl.querySelector('.gp-count');
        if (!grid) return;

        const token = ++renderToken;
        grid.innerHTML = '<div class="gp-status">⏳ กำลังโหลด...</div>';

        let offset = 0;
        function renderChunk() {
            if (token !== renderToken) return;

            if (offset === 0) {
                if (!list.length) {
                    grid.innerHTML = '<div class="gp-status">ไม่พบของขวัญ — ลองค้นหาหรือเปลี่ยนตัวกรอง</div>';
                    if (countEl) countEl.textContent = '0 รายการ';
                    return;
                }
                grid.innerHTML = '';
            }

            const chunk = list.slice(offset, offset + CHUNK_SIZE);
            grid.insertAdjacentHTML('beforeend', chunk.map(giftItemHtml).join(''));
            offset += CHUNK_SIZE;

            if (countEl) {
                countEl.textContent = `แสดง ${Math.min(offset, list.length)} / ${list.length} รายการ`;
            }

            if (offset < list.length) {
                setTimeout(renderChunk, 0);
            }
        }

        setTimeout(renderChunk, 0);
    }

    function refreshGrid() {
        renderProgressive(getFilteredList());
    }

    function ensureModal() {
        if (modalEl) return modalEl;

        modalEl = document.createElement('div');
        modalEl.id = 'unifiedGiftPickerOverlay';
        modalEl.className = 'fullscreen-overlay gp-overlay';
        modalEl.style.display = 'none';
        modalEl.innerHTML = `
            <div class="gp-panel" role="dialog" aria-modal="true" aria-label="เลือกของขวัญ">
                <div class="gp-head">
                    <div>
                        <div class="gp-kicker">TikTok LIVE</div>
                        <h3 class="gp-title">🎁 เลือกของขวัญ</h3>
                    </div>
                    <button type="button" class="gp-close" aria-label="ปิด">×</button>
                </div>
                <div class="gp-toolbar">
                    <input type="text" class="gp-search field-ui" placeholder="ค้นหาชื่อ / ราคา / ID..." autocomplete="off">
                    <div class="gp-filters">
                        <button type="button" class="gp-filter active" data-filter="all">ทั้งหมด</button>
                        <button type="button" class="gp-filter" data-filter="free">ฟรี</button>
                        <button type="button" class="gp-filter" data-filter="1" data-keep-emoji>1 🪙</button>
                        <button type="button" class="gp-filter" data-filter="low">2–9</button>
                        <button type="button" class="gp-filter" data-filter="mid">10–99</button>
                        <button type="button" class="gp-filter" data-filter="high">100+</button>
                    </div>
                </div>
                <div class="gp-count">กำลังโหลด...</div>
                <div class="gp-grid"></div>
                <div class="gp-foot">
                    <span class="gp-hint">คลิกของขวัญเพื่อเลือก · โหลดทีละชุดเพื่อไม่ให้ค้าง</span>
                    <button type="button" class="gp-cancel admin-btn admin-btn-ghost">ปิด</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        modalEl.style.position = 'fixed';
        modalEl.style.inset = '0';
        modalEl.style.zIndex = '50000';

        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) close();
        });

        modalEl.querySelector('.gp-close').addEventListener('click', close);
        modalEl.querySelector('.gp-cancel').addEventListener('click', close);

        const panel = modalEl.querySelector('.gp-panel');
        if (panel) panel.addEventListener('click', (e) => e.stopPropagation());

        const search = modalEl.querySelector('.gp-search');
        let searchTimer = null;
        search.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.query = search.value || '';
                refreshGrid();
            }, 180);
        });

        modalEl.querySelectorAll('.gp-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                modalEl.querySelectorAll('.gp-filter').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                state.costFilter = btn.getAttribute('data-filter') || 'all';
                refreshGrid();
            });
        });

        modalEl.querySelector('.gp-grid').addEventListener('click', (e) => {
            const item = e.target.closest('.gp-item[data-gift-id]');
            if (!item) return;
            e.preventDefault();
            e.stopPropagation();
            const giftId = item.getAttribute('data-gift-id');
            const fromCatalog = catalog.find((g) => String(g.giftId) === String(giftId));
            const gift = giftPayload(fromCatalog || {
                giftId,
                giftName: item.getAttribute('data-gift-name') || 'Gift',
                cost: item.getAttribute('data-gift-cost') || 0,
                icon: item.getAttribute('data-gift-icon') || ''
            });
            if (!gift.giftId) return;
            state.selectedId = gift.giftId;
            modalEl.querySelectorAll('.gp-item').forEach((el) => el.classList.remove('active'));
            item.classList.add('active');
            try {
                if (typeof state.onSelect === 'function') state.onSelect(gift);
            } catch (err) {
                console.warn('[GiftPicker] onSelect', err);
            }
            if (!state.multi) close();
        });

        return modalEl;
    }

    function open(options) {
        const opts = options || {};
        state = {
            onSelect: opts.onSelect || null,
            multi: !!opts.multi,
            costFilter: opts.costFilter || 'all',
            query: '',
            title: opts.title || '🎁 เลือกของขวัญ',
            selectedId: opts.selectedId || null
        };

        ensureModal();
        document.body.appendChild(modalEl);
        modalEl.style.display = 'flex';
        modalEl.style.zIndex = '50000';
        modalEl.querySelector('.gp-title').textContent = state.title;

        const search = modalEl.querySelector('.gp-search');
        if (search) search.value = '';

        modalEl.querySelectorAll('.gp-filter').forEach((btn) => {
            btn.classList.toggle('active', (btn.getAttribute('data-filter') || 'all') === state.costFilter);
        });

        const grid = modalEl.querySelector('.gp-grid');
        if (grid) grid.innerHTML = '<div class="gp-status">⏳ กำลังโหลดคลังของขวัญ...</div>';

        loadCatalog().then(() => refreshGrid()).catch(() => {
            if (grid) grid.innerHTML = '<div class="gp-status" style="color:#ff6b81;">โหลดคลังไม่สำเร็จ — ลองใหม่อีกครั้ง</div>';
        });
    }

    function close() {
        renderToken++;
        if (modalEl) modalEl.style.display = 'none';
    }

    function invalidateCache() {
        catalog = [];
        catalogPromise = null;
    }

    global.GiftPicker = {
        open,
        close,
        loadCatalog,
        invalidateCache,
        getCatalog: () => catalog.slice()
    };
})(typeof window !== 'undefined' ? window : globalThis);
