/**
 * TokControl Store — subscription packs + standalone games + value packs
 */
(function (global) {
    'use strict';

    const STORE_GAME_META = {
        'fish-control': {
            name: 'Fish Control',
            title: 'FISH CONTROL',
            emoji: '🎣',
            blurb: 'ท่าเรือตกปลาบนทะเล — CATCH · BUILD · PROTECT',
            line2: 'ของขวัญ TikTok ปรับเป้าหมาย / ป่วน / บัฟ',
            cover: '/assets/fish-control-cover.png',
            badge: 'POPULAR',
            badgeTone: 'purple',
            glow: 'cyan'
        },
        minecraft: {
            name: 'Box Control',
            title: 'BOX CONTROL',
            emoji: '📦',
            blurb: 'BUILD. PROTECT. SURVIVE.',
            line2: 'ต่อบล็อก ขยายแมพ และแกล้งในเกม',
            cover: '/assets/box-control-cover.png',
            badge: 'SURVIVAL',
            badgeTone: 'green',
            glow: 'violet'
        },
        'farm-control': {
            name: 'Farm Control',
            title: 'FARM CONTROL',
            emoji: '🌾',
            blurb: 'BUILD YOUR FARM · GROW YOUR WORLD',
            line2: 'นาข้าว หอคอย และอีเวนต์จากของขวัญ',
            cover: '/assets/farm-control-cover.png',
            badge: 'NEW',
            badgeTone: 'blue',
            glow: 'gold'
        },
        pack3: {
            name: 'GAME PACK 3',
            emoji: '🎁',
            blurb: 'รวม 3 เกมยอดนิยม ในแพ็กเดียวสุดคุ้ม!',
            cover: '/assets/game-pack-3-cover.png',
            tag: 'แพ็กสุดคุ้ม'
        }
    };

    const STORE_SINGLE_ORDER = ['farm-control', 'fish-control', 'minecraft'];

    /** แคตตาล็อกหน้าร้าน — ใช้เมื่อ Cloud ยังไม่ส่งแพ็กครบ */
    const STORE_CATALOG_FALLBACK = [
        { id: 'pro30', label: 'PRO 30 วัน', days: 30, price: 9.99, currency: 'USD', productType: 'pro' },
        { id: 'pro90', label: 'PRO 90 วัน', days: 90, price: 19.99, currency: 'USD', productType: 'pro' },
        {
            id: 'game_fish_30',
            label: 'Fish Control (30 วัน)',
            days: 30,
            price: 399,
            currency: 'THB',
            priceThb: 399,
            productType: 'game',
            gameId: 'fish-control'
        },
        {
            id: 'game_box_30',
            label: 'Box Control (30 วัน)',
            days: 30,
            price: 399,
            currency: 'THB',
            priceThb: 399,
            productType: 'game',
            gameId: 'minecraft'
        },
        {
            id: 'game_farm_30',
            label: 'Farm Control (30 วัน)',
            days: 30,
            price: 399,
            currency: 'THB',
            priceThb: 399,
            productType: 'game',
            gameId: 'farm-control'
        },
        {
            id: 'game_pack3_30',
            label: 'GAME PACK 3 (30 วัน)',
            days: 30,
            price: 999,
            currency: 'THB',
            priceThb: 999,
            productType: 'game',
            gameIds: ['farm-control', 'fish-control', 'minecraft'],
            pack: true
        }
    ];

    let storeTab = 'subscription';
    let storePlansCache = null;

    function esc(s) {
        return typeof escapeHtml === 'function' ? escapeHtml(String(s || '')) : String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatStorePrice(plan) {
        if (!plan) return '—';
        if (typeof formatPlanPrice === 'function') return formatPlanPrice(plan);
        if (plan.currency === 'THB' || (plan.priceThb != null && plan.currency !== 'USD')) {
            const n = plan.currency === 'THB' ? plan.price : (plan.priceThb || plan.price);
            return `฿${Number(n).toLocaleString('th-TH')}`;
        }
        return `$${Number(plan.price).toFixed(2)}`;
    }

    function normalizeStorePlan(p) {
        if (!p || !p.id) return null;
        const out = { ...p };
        const id = String(out.id);
        if (!out.productType) {
            if (id.startsWith('game_') || out.gameId || out.gameIds) out.productType = 'game';
            else if (id.startsWith('gc_') || id.includes('early_access')) out.productType = 'gamecenter_pass';
            else out.productType = 'pro';
        }
        if (out.productType === 'game') {
            if (!Array.isArray(out.gameIds) || !out.gameIds.length) {
                if (out.gameId) out.gameIds = [out.gameId];
                else if (id.includes('pack3')) out.gameIds = ['farm-control', 'fish-control', 'minecraft'];
                else if (id.includes('fish')) out.gameIds = ['fish-control'];
                else if (id.includes('box') || id.includes('minecraft')) out.gameIds = ['minecraft'];
                else if (id.includes('farm')) out.gameIds = ['farm-control'];
            }
            if (!out.gameId && out.gameIds?.length) out.gameId = out.gameIds[0];
            out.pack = !!(out.pack || (out.gameIds && out.gameIds.length > 1));
        }
        if (out.currency === 'THB' && out.priceThb == null) out.priceThb = out.price;
        return out;
    }

    function mergeStoreCatalog(apiPlans) {
        const byId = new Map();
        for (const raw of STORE_CATALOG_FALLBACK) {
            const p = normalizeStorePlan(raw);
            if (p) byId.set(p.id, p);
        }
        for (const raw of apiPlans || []) {
            const p = normalizeStorePlan(raw);
            if (!p) continue;
            const prev = byId.get(p.id) || {};
            byId.set(p.id, { ...prev, ...p });
        }
        return [...byId.values()];
    }

    function isProActiveClient() {
        return typeof isAppPro === 'function' && isAppPro();
    }

    function gameUnlockDaysLeft(gameId) {
        const g = (typeof currentUser !== 'undefined' && currentUser.entitlements?.games?.[gameId]) || null;
        if (!g?.active) return null;
        if (!g.expireAt) return Infinity;
        return Math.max(0, Math.ceil((new Date(g.expireAt) - Date.now()) / 86400000));
    }

    function packStatus(gameIds) {
        const ids = Array.isArray(gameIds) ? gameIds : [];
        if (!ids.length) return { left: null, label: 'ยังไม่ได้ปลดล็อก' };
        const lefts = ids.map(gameUnlockDaysLeft);
        if (lefts.every((x) => x == null)) return { left: null, label: 'ยังไม่ได้ปลดล็อก — ซื้อแพ็กนี้' };
        if (lefts.every((x) => x === Infinity)) return { left: Infinity, label: 'ปลดล็อกครบทั้งแพ็กแล้ว' };
        const nums = lefts.filter((x) => x != null && x !== Infinity);
        const min = nums.length ? Math.min(...nums) : null;
        return { left: min, label: min != null ? `ปลดล็อกแล้ว · เหลืออย่างน้อย ${min} วัน` : 'ปลดล็อกบางเกมแล้ว' };
    }

    async function loadStorePlans() {
        const url = (typeof global.paymentApiUrl === 'function')
            ? global.paymentApiUrl('/api/payments/plans')
            : '/api/payments/plans';
        const res = await fetch(url, {
            headers: typeof authHeadersJson === 'function' ? authHeadersJson() : {}
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'โหลดแพ็กเกจไม่สำเร็จ');
        const merged = mergeStoreCatalog(data.plans || []);
        const out = { ...data, plans: merged };
        storePlansCache = out;
        return out;
    }

    function switchStoreTab(tab) {
        storeTab = tab === 'games' ? 'games' : 'subscription';
        document.querySelectorAll('.store-tab').forEach((el) => {
            el.classList.toggle('active', el.dataset.storeTab === storeTab);
        });
        const sub = document.getElementById('storePanelSubscription');
        const games = document.getElementById('storePanelGames');
        if (sub) sub.style.display = storeTab === 'subscription' ? '' : 'none';
        if (games) games.style.display = storeTab === 'games' ? '' : 'none';
        const heroSub = document.getElementById('storeHeroSub');
        if (heroSub) {
            heroSub.textContent = storeTab === 'games'
                ? '✧ เลือกซื้อเกม หรือซื้อแพ็กสุดคุ้ม ✧'
                : 'เลือกแพ็กเกจสมาชิกเพื่อปลดล็อก REPO · Dance Club และฟีเจอร์ PRO';
        }
    }

    function renderOwnedBanner() {
        const el = document.getElementById('storeOwnedBanner');
        if (!el) return;
        const parts = [];
        if (isProActiveClient()) {
            const exp = currentUser.proExpireAt ? new Date(currentUser.proExpireAt) : null;
            const days = exp ? Math.max(0, Math.ceil((exp - Date.now()) / 86400000)) : null;
            parts.push(days == null
                ? 'สมาชิก PRO — REPO และ Dance Club เล่นฟรี'
                : `สมาชิก PRO เหลือ ${days} วัน — REPO และ Dance Club เล่นฟรี`);
        }
        for (const id of ['farm-control', 'fish-control', 'minecraft']) {
            const left = gameUnlockDaysLeft(id);
            if (left == null) continue;
            const name = STORE_GAME_META[id].name;
            parts.push(left === Infinity
                ? `${name} ปลดล็อกถาวร`
                : `${name} เหลือ ${left} วัน`);
        }
        if (!parts.length) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        el.style.display = '';
        el.textContent = parts.join(' · ');
    }

    function renderSubscriptionCards(plans, configured) {
        const grid = document.getElementById('storeSubGrid');
        if (!grid) return;
        const preferIds = new Set(['pro30', 'pro90']);
        let subs = (plans || []).filter((p) => (p.productType || 'pro') === 'pro' && preferIds.has(p.id));
        if (!subs.length) {
            subs = (plans || []).filter((p) => (p.productType || 'pro') === 'pro');
        }
        subs = subs.slice().sort((a, b) => (a.days || 0) - (b.days || 0));
        if (!subs.length) {
            grid.innerHTML = '<div class="store-empty">ยังไม่มีแพ็กเกจสมาชิก</div>';
            return;
        }
        const featured = subs.find((p) => p.days === 90)?.id || subs[subs.length - 1]?.id;
        grid.innerHTML = subs.map((p) => {
            const owned = isProActiveClient();
            return `
            <article class="store-card${p.id === featured ? ' is-featured' : ''}">
                ${p.id === featured ? '<span class="store-card-badge">คุ้มสุด</span>' : ''}
                <div class="store-card-body">
                    <div class="store-card-kicker">สมาชิก</div>
                    <h3 class="store-card-title">${esc(p.label)}</h3>
                    <p class="store-card-desc">REPO และ Dance Club เล่นฟรี · ฟีเจอร์ PRO ทั้งหมด<br><small>Farm / Fish / Box ซื้อแยกในแท็บเกม</small></p>
                    <div class="store-card-price">${formatStorePrice(p)}</div>
                    <div class="store-card-meta">${p.days || '—'} วัน · PromptPay</div>
                    <button type="button" class="store-buy-btn" ${!configured ? 'disabled' : ''}
                        onclick="buyStorePlan('${esc(p.id)}')">
                        ${owned ? 'ต่ออายุแพ็กนี้' : 'ซื้อแพ็กเกจ'}
                    </button>
                </div>
            </article>`;
        }).join('');
    }

    function isStoreGamePlan(p) {
        if (!p) return false;
        if (p.productType === 'game') return true;
        if (p.gameId || (p.gameIds && p.gameIds.length)) return true;
        return /^game_/i.test(String(p.id || ''));
    }

    function findPlanByGameId(plans, gameId) {
        return (plans || []).find((p) => isStoreGamePlan(p) && !p.pack && p.gameId === gameId
            && !(p.gameIds && p.gameIds.length > 1));
    }

    function findPackPlan(plans) {
        return (plans || []).find((p) => isStoreGamePlan(p) && (p.pack || (p.gameIds && p.gameIds.length > 1)
            || String(p.id).includes('pack3')));
    }

    function thbNum(plan) {
        if (!plan) return 399;
        if (plan.currency === 'THB') return Number(plan.price) || 399;
        return Number(plan.priceThb || plan.price) || 399;
    }

    function renderGameCards(plans, configured) {
        const banners = document.getElementById('storeGameBanners');
        const packEl = document.getElementById('storePackCard');
        const singles = document.getElementById('storeGameSingles');
        const legacy = document.getElementById('storeGameGrid');
        if (legacy) legacy.style.display = 'none';

        if (!banners || !packEl || !singles) return;

        const packPlan = findPackPlan(plans);
        const packOwned = packPlan ? packStatus(packPlan.gameIds || []).left != null : false;
        const unit = 399;
        const packPrice = thbNum(packPlan) || 999;
        const separateTotal = unit * 3;
        const saveAmt = Math.max(0, separateTotal - packPrice);
        const savePct = separateTotal > 0 ? Math.round((saveAmt / separateTotal) * 100) : 0;

        banners.innerHTML = STORE_SINGLE_ORDER.map((gid) => {
            const meta = STORE_GAME_META[gid];
            const plan = findPlanByGameId(plans, gid);
            const planId = plan?.id || '';
            const buy = planId
                ? `onclick="buyStorePlan('${esc(planId)}')"`
                : 'disabled';
            return `
            <button type="button" class="sg-banner sg-banner--${meta.glow}" ${buy} ${!configured || !planId ? 'disabled' : ''}>
                <img src="${esc(meta.cover)}" alt="${esc(meta.name)}" loading="lazy">
                <span class="sg-banner-shade"></span>
                <span class="sg-banner-label">${esc(meta.title || meta.name)}</span>
            </button>`;
        }).join('');

        packEl.classList.add('sg-pack--premium');
        packEl.innerHTML = `
            <span class="sg-pack-glow" aria-hidden="true"></span>
            <span class="sg-pack-shine" aria-hidden="true"></span>
            <span class="sg-pack-shine sg-pack-shine--2" aria-hidden="true"></span>
            <span class="sg-pack-sparkles" aria-hidden="true"></span>
            <div class="sg-pack-ribbon"><span>👑 BEST VALUE</span></div>
            <div class="sg-pack-stars">★★★★★</div>
            <h3 class="sg-pack-title">GAME PACK 3</h3>
            <p class="sg-pack-desc">รวม 3 เกมยอดนิยม ในแพ็กเดียวสุดคุ้ม!</p>
            <div class="sg-pack-pricebox">
                <div class="sg-pack-compare">
                    <span class="sg-pack-was">ซื้อแยก ${unit} ฿ × 3 = <s>${separateTotal.toLocaleString('th-TH')} ฿</s></span>
                    <span class="sg-pack-save">ประหยัด ${saveAmt.toLocaleString('th-TH')} ฿</span>
                </div>
                <div class="sg-pack-now">${packPrice.toLocaleString('th-TH')} <small>฿</small></div>
            </div>
            <div class="sg-pack-feats">
                <div class="sg-pack-feat"><span>🎮</span><div><b>ได้ครบ 3 เกม</b><small>Farm + Fish + Box</small></div></div>
                <div class="sg-pack-feat"><span>📅</span><div><b>ใช้งานได้ 30 วัน</b><small>เต็มอิ่มทุกความสนุก</small></div></div>
                <div class="sg-pack-feat"><span>🛡</span><div><b>คุ้มค่าที่สุด!</b><small>ประหยัดกว่า ${savePct}%</small></div></div>
            </div>
            <button type="button" class="sg-pack-buy" ${!configured || !packPlan ? 'disabled' : ''}
                onclick="buyStorePlan('${esc(packPlan?.id || 'game_pack3_30')}')">
                ${packOwned ? '👑 ต่ออายุแพ็กคุ้ม »' : '👑 ซื้อแพ็กคุ้ม »'}
            </button>
            <p class="sg-pack-status">${esc(packPlan ? packStatus(packPlan.gameIds || []).label : '')}</p>
        `;

        singles.innerHTML = STORE_SINGLE_ORDER.map((gid) => {
            const meta = STORE_GAME_META[gid];
            const plan = findPlanByGameId(plans, gid);
            const price = thbNum(plan);
            const left = gameUnlockDaysLeft(gid);
            const owned = left != null;
            let status = '30 วัน';
            if (left === Infinity) status = 'ปลดล็อกแล้ว';
            else if (left != null) status = `เหลือ ${left} วัน`;
            const planId = plan?.id || '';
            return `
            <article class="sg-single">
                <div class="sg-single-media">
                    <span class="sg-single-badge sg-single-badge--${meta.badgeTone}">${esc(meta.badge)}</span>
                    <img src="${esc(meta.cover)}" alt="${esc(meta.name)}" loading="lazy">
                </div>
                <div class="sg-single-body">
                    <h3>${esc(meta.title || meta.name)}</h3>
                    <p>${esc(meta.blurb)}</p>
                    <p class="sg-single-line2">${esc(meta.line2 || '')}</p>
                    <div class="sg-single-foot">
                        <div class="sg-single-meta">
                            <span>⏱ ${esc(status)}</span>
                            <strong>${price.toLocaleString('th-TH')}฿</strong>
                        </div>
                        <button type="button" class="sg-single-buy" ${!configured || !planId ? 'disabled' : ''}
                            onclick="buyStorePlan('${esc(planId)}')">
                            ${owned ? 'ต่ออายุ' : '🛒 ซื้อเลย'}
                        </button>
                    </div>
                </div>
            </article>`;
        }).join('');
    }

    async function renderStorePage() {
        renderOwnedBanner();
        const subGrid = document.getElementById('storeSubGrid');
        const banners = document.getElementById('storeGameBanners');
        if (subGrid) subGrid.innerHTML = '<div class="store-empty">กำลังโหลด...</div>';
        if (banners) banners.innerHTML = '<div class="store-empty">กำลังโหลด...</div>';
        try {
            let data;
            try {
                data = await loadStorePlans();
            } catch (apiErr) {
                data = { configured: false, plans: mergeStoreCatalog([]) };
                console.warn('[store] plans API failed, using local catalog', apiErr);
            }
            const plans = data.plans || mergeStoreCatalog([]);
            const configured = !!data.configured;
            const hint = document.getElementById('storePayHint');
            if (hint) {
                hint.textContent = configured
                    ? 'ชำระผ่าน PromptPay ในแอป — หลังอัปโหลดสลิปสิทธิ์จะเปิดทันที'
                    : 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า PromptPay — ใช้โค้ดหรือติดต่อแอดมิน';
            }
            renderSubscriptionCards(plans, configured);
            renderGameCards(plans, configured);
            switchStoreTab(storeTab);
        } catch (err) {
            if (subGrid) subGrid.innerHTML = `<div class="store-empty store-empty--err">${esc(err.message || 'โหลดไม่สำเร็จ')}</div>`;
            if (banners) banners.innerHTML = `<div class="store-empty store-empty--err">${esc(err.message || 'โหลดไม่สำเร็จ')}</div>`;
        }
    }

    async function buyStorePlan(planId) {
        if (typeof currentUser === 'undefined' || !currentUser.isLoggedIn) {
            if (typeof showCustomMsg === 'function') showCustomMsg('warning', 'ต้องเข้าสู่ระบบ', 'กรุณาล็อกอินก่อนซื้อ');
            if (typeof openLoginModal === 'function') openLoginModal();
            return;
        }
        const id = String(planId || '').trim();
        if (!id) return;
        let productType = 'pro';
        try {
            const data = storePlansCache || await loadStorePlans();
            const plan = (data.plans || []).find((p) => p.id === id);
            if (plan?.productType) productType = plan.productType;
            else if (id.startsWith('game_')) productType = 'game';
        } catch (e) {
            if (id.startsWith('game_')) productType = 'game';
        }

        if (typeof openProCheckoutModal !== 'function') {
            if (typeof showCustomMsg === 'function') showCustomMsg('error', 'Checkout', 'ระบบชำระเงินยังไม่พร้อม');
            return;
        }
        await openProCheckoutModal(productType === 'pro' ? 'pro' : productType, {
            planId: id,
            autoPay: true
        });
    }

    global.switchStoreTab = switchStoreTab;
    global.renderStorePage = renderStorePage;
    global.buyStorePlan = buyStorePlan;
    global.initStorePage = renderStorePage;
    global.mergeStoreCatalog = mergeStoreCatalog;
})(typeof window !== 'undefined' ? window : global);
