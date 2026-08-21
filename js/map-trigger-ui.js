/**
 * Shared REPO-style trigger modal for Game Center maps
 * (Box / Farm / Fish / Tower — same add-trigger UX)
 */
(function (global) {
    'use strict';

    const RANDOM_ACTION = '__random__';

    const TRIGGER_TYPES = [
        { value: 'gift', icon: '🎁', label: 'Gift' },
        { value: 'coins', icon: '🪙', label: 'Coins' },
        { value: 'random', icon: '🎲', label: 'Random' },
        { value: 'like', icon: '❤️', label: 'Like' },
        { value: 'globallikes', icon: '💖', label: 'Global Likes' },
        { value: 'follow', icon: '👤', label: 'Follow' },
        { value: 'subscribe', icon: '⭐', label: 'Subscribe' },
        { value: 'share', icon: '🔗', label: 'Share' },
        { value: 'join', icon: '🚪', label: 'Join' }
    ];

    const TYPE_LABELS = {
        gift: 'ของขวัญ',
        coins: 'เหรียญ',
        random: 'สุ่ม',
        like: 'ไลค์',
        globallikes: 'ไลค์รวม',
        follow: 'ติดตาม',
        subscribe: 'สมาชิก',
        share: 'แชร์',
        join: 'เข้าห้อง'
    };

    let session = null;
    let draft = defaultDraft();

    function defaultDraft(action) {
        return {
            type: 'gift',
            giftName: '',
            giftId: '',
            giftIcon: '',
            action: action || '',
            randomActions: [],
            threshold: 100,
            giftThreshold: 1,
            minCoins: 1,
            maxCoins: 999999,
            chance: 50,
            seconds: 10,
            amount: 1
        };
    }

    function allowedActionValues(actions) {
        return visibleActions(actions || [])
            .map((a) => a.value)
            .filter((v) => v && v !== RANDOM_ACTION);
    }

    function allPoolValues() {
        return session ? allowedActionValues(session.actions) : [];
    }

    function randomPoolFor(tr, actions) {
        const allowed = allowedActionValues(actions);
        if (Array.isArray(tr && tr.randomActions) && tr.randomActions.length) {
            const picked = tr.randomActions.filter((v) => allowed.includes(v));
            if (picked.length) return picked;
        }
        return allowed;
    }

    function toggleRandomPool(tr, value, actions) {
        if (!tr || !value || value === RANDOM_ACTION) return tr;
        const allowed = allowedActionValues(actions);
        if (!allowed.includes(value)) return tr;
        let pool = randomPoolFor(tr, actions).slice();
        if (pool.includes(value)) {
            if (pool.length <= 1) return tr;
            pool = pool.filter((v) => v !== value);
        } else {
            pool.push(value);
        }
        tr.randomActions = pool;
        tr.action = RANDOM_ACTION;
        return tr;
    }

    function applyActionPick(tr, value, actions) {
        if (!tr) return tr;
        if (tr.type === 'random') return toggleRandomPool(tr, value, actions);
        tr.action = value;
        return tr;
    }

    function withRandomAction(actions) {
        const list = visibleActions(actions || []);
        if (list.some((a) => a.value === RANDOM_ACTION)) return list;
        return [{ value: RANDOM_ACTION, label: '🎲 สุ่มแอคชัน' }, ...list];
    }

    function resolveTriggerAction(tr, actions) {
        const t = Object.assign({}, tr || {});
        const isRandom = t.type === 'random' || t.action === RANDOM_ACTION;
        if (!isRandom) return t;
        const pool = randomPoolFor(t, actions);
        if (!pool.length) return t;
        t.action = pool[Math.floor(Math.random() * pool.length)];
        return t;
    }

    function syncPoolUi() {
        const isRandom = !!(session && draft.type === 'random');
        const hint = document.getElementById('mapTrigPoolHint');
        const bar = document.getElementById('mapTrigPoolBar');
        const label = document.getElementById('mapTrigActionLabel');
        if (hint) hint.style.display = isRandom ? '' : 'none';
        if (bar) bar.style.display = isRandom ? 'flex' : 'none';
        if (label) {
            label.textContent = isRandom ? 'สุ่มจากแอคชันที่เลือก' : 'แอ็กชันในเกม';
        }
    }

    function selectAllPool() {
        if (!session || draft.type !== 'random') return;
        draft.randomActions = allPoolValues();
        draft.action = RANDOM_ACTION;
        renderActionGrid();
    }

    function clearPoolKeepOne() {
        if (!session || draft.type !== 'random') return;
        const all = allPoolValues();
        draft.randomActions = all.length ? [all[0]] : [];
        draft.action = RANDOM_ACTION;
        renderActionGrid();
    }

    function rollRandomChance(tr) {
        const chance = Math.max(1, Math.min(100, parseInt(tr && tr.chance, 10) || 100));
        return (Math.random() * 100) < chance;
    }

    function esc(s) {
        return String(s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function open(opts) {
        if (!opts || !Array.isArray(opts.actions) || !opts.actions.length) return;
        session = {
            title: opts.title || 'ทริกเกอร์',
            actions: visibleActions(opts.actions || []),
            defaultAction: opts.defaultAction || (opts.actions && opts.actions[0] && opts.actions[0].value) || '',
            showSecondsFor: opts.showSecondsFor || [],
            showWinAmountFor: opts.showWinAmountFor || [],
            amountLabel: opts.amountLabel || '',
            defaultAmount: opts.defaultAmount != null ? opts.defaultAmount : 1,
            onSave: typeof opts.onSave === 'function' ? opts.onSave : null
        };
        if (!session.actions.length) return;
        if (!session.actions.some((a) => a.value === session.defaultAction)) {
            session.defaultAction = session.actions[0].value;
        }
        draft = defaultDraft(session.defaultAction);
        const modal = document.getElementById('gcMapTriggerModal');
        const titleEl = document.getElementById('mapTrigTitle');
        if (titleEl) titleEl.textContent = session.title;
        if (!modal) return;
        modal.style.display = 'flex';
        selectType('gift');
        renderActionGrid();
        updateGiftChip();
        const amt = document.getElementById('mapTrigWinAmount');
        if (amt) {
            amt.value = String(session.defaultAmount || 1);
            delete amt.dataset.touched;
            amt.oninput = () => { amt.dataset.touched = '1'; };
        }
        const thr = document.getElementById('mapTrigThreshold');
        if (thr) thr.value = '100';
        const gthr = document.getElementById('mapTrigGiftThreshold');
        if (gthr) gthr.value = '1';
        const minC = document.getElementById('mapTrigMinCoins');
        if (minC) minC.value = '1';
        const maxC = document.getElementById('mapTrigMaxCoins');
        if (maxC) maxC.value = '999999';
        const chanceEl = document.getElementById('mapTrigChance');
        if (chanceEl) chanceEl.value = '50';
        const sec = document.getElementById('mapTrigSeconds');
        if (sec) sec.value = draft.action === 'fc_wall' ? '15' : '10';
        updateExtraRows();
    }

    function close() {
        const modal = document.getElementById('gcMapTriggerModal');
        if (modal) modal.style.display = 'none';
        session = null;
    }

    function selectType(type) {
        draft.type = type || 'gift';
        document.querySelectorAll('#mapTrigTypeGrid .trigger-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-map-type') === draft.type);
        });
        const isGift = draft.type === 'gift';
        const isCoins = draft.type === 'coins';
        const isRandom = draft.type === 'random';
        const isLike = draft.type === 'like' || draft.type === 'globallikes';
        const giftSec = document.getElementById('mapTrigGiftSection');
        const giftRow = document.getElementById('mapTrigGiftThresholdRow');
        const likeRow = document.getElementById('mapTrigLikeRow');
        const coinsRow = document.getElementById('mapTrigCoinsRow');
        const randomRow = document.getElementById('mapTrigRandomRow');
        const title = document.getElementById('mapTrigConfigTitle');
        if (giftSec) giftSec.style.display = (isGift || isRandom) ? '' : 'none';
        if (giftRow) giftRow.style.display = (isGift || isRandom) ? 'flex' : 'none';
        if (likeRow) likeRow.style.display = isLike ? 'flex' : 'none';
        if (coinsRow) coinsRow.style.display = (isCoins || (isRandom && !draft.giftId && !draft.giftName)) ? '' : 'none';
        if (randomRow) randomRow.style.display = isRandom ? 'flex' : 'none';
        if (title) title.textContent = `กำหนดเงื่อนไข: ${TYPE_LABELS[draft.type] || draft.type}`;
        if (isRandom) {
            draft.action = RANDOM_ACTION;
            if (!Array.isArray(draft.randomActions) || !draft.randomActions.length) {
                draft.randomActions = allPoolValues();
            }
        } else if (draft.action === RANDOM_ACTION) {
            draft.action = session.defaultAction;
        }
        syncPoolUi();
        renderActionGrid();
        const likeLabel = document.getElementById('mapTrigLikeLabel');
        if (likeLabel) {
            likeLabel.textContent = draft.type === 'globallikes'
                ? 'ไลค์รวมทั้งห้องถึงค่านี้'
                : 'ไลค์จากผู้ชมคนเดียวสะสม';
        }
        updateExtraRows();
    }

    function updateExtraRows() {
        const showSec = !!(session && session.showSecondsFor.includes(draft.action));
        const showWin = !!(session && session.showWinAmountFor.includes(draft.action));
        const secRow = document.getElementById('mapTrigSecondsRow');
        const winRow = document.getElementById('mapTrigWinAmountRow');
        if (secRow) secRow.style.display = showSec ? 'flex' : 'none';
        if (winRow) winRow.style.display = showWin ? 'flex' : 'none';
        const winLabel = winRow && winRow.querySelector('span');
        if (winLabel) {
            if (draft.action === 'fc_plus_win' || draft.action === 'fc_minus_win'
                || draft.action === 'mc_plus_win' || draft.action === 'mc_minus_win') {
                winLabel.textContent = 'จำนวนวินที่บวก / ลบ';
            } else if (draft.action === 'fc_increase_fish' || draft.action === 'fc_decrease_fish') {
                winLabel.textContent = 'จำนวนปลาที่เพิ่ม / ลด';
            } else if (draft.action === 'fc_spawn_zombie' || draft.action === 'fc_spawn_golem'
                || draft.action === 'fc_villager_help') {
                winLabel.textContent = 'จำนวนที่เสก';
            } else {
                winLabel.textContent = (session && session.amountLabel) || 'จำนวน';
            }
        }
        const amountInput = document.getElementById('mapTrigWinAmount');
        if (amountInput && showWin && session && session.defaultAmount != null) {
            if (!amountInput.dataset.touched) {
                amountInput.value = String(session.defaultAmount);
            }
        }
    }

    function renderActionGrid() {
        const grid = document.getElementById('mapTrigActionGrid');
        if (!grid || !session) return;
        const isRandom = draft.type === 'random';
        const list = isRandom
            ? visibleActions(session.actions).filter((a) => a.value !== RANDOM_ACTION)
            : withRandomAction(session.actions);
        const pool = new Set(isRandom ? randomPoolFor(draft, session.actions) : []);
        grid.innerHTML = list.map((a) => {
            const on = isRandom ? pool.has(a.value) : draft.action === a.value;
            return `<button type="button" class="mc-pill${on ? ' is-active' : ''}"
                data-map-action="${esc(a.value)}">${esc(a.label)}</button>`;
        }).join('');
        syncPoolUi();
        if (!grid._mapActionBound) {
            grid._mapActionBound = true;
            grid.addEventListener('click', (ev) => {
                const btn = ev.target.closest('[data-map-action]');
                if (!btn) return;
                const value = btn.getAttribute('data-map-action');
                if (draft.type === 'random') {
                    toggleRandomPool(draft, value, session.actions);
                } else {
                    draft.action = value;
                }
                renderActionGrid();
                const sec = document.getElementById('mapTrigSeconds');
                if (sec && !sec.dataset.touched) {
                    if (draft.action === 'fc_wall') sec.value = '15';
                    else if (draft.action === 'fc_auto_fish') sec.value = '10';
                }
                updateExtraRows();
            });
        }
    }

    function updateGiftChip() {
        const chip = document.getElementById('mapTrigSelectedGiftChip');
        if (!chip) return;
        if (!draft.giftName) {
            chip.style.display = 'none';
            chip.innerHTML = '';
            return;
        }
        chip.style.display = 'flex';
        const icon = draft.giftIcon
            ? `<img src="${esc(draft.giftIcon)}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:6px;">`
            : '🎁';
        chip.innerHTML = `${icon}<span>${esc(draft.giftName)}</span>`;
        if (draft.type === 'random') {
            const coinsRow = document.getElementById('mapTrigCoinsRow');
            if (coinsRow) coinsRow.style.display = 'none';
        }
    }

    function openGiftPicker() {
        if (!global.GiftPicker) return;
        GiftPicker.open({
            title: '🎁 เลือกของขวัญสำหรับทริกเกอร์',
            onSelect: (gift) => {
                draft.giftName = gift.giftName || '';
                draft.giftId = String(gift.giftId || '');
                draft.giftIcon = gift.giftPictureUrl || gift.giftIcon || '';
                updateGiftChip();
            }
        });
    }

    function save() {
        if (!session) return;
        const type = draft.type || 'gift';
        if (type === 'gift' && !draft.giftName && !draft.giftId) {
            if (typeof showCustomMsg === 'function') {
                showCustomMsg('error', 'เลือกของขวัญ', 'กรุณาเลือกของขวัญก่อนบันทึก');
            }
            return;
        }
        let action = (type === 'random' && !draft.action) ? RANDOM_ACTION : (draft.action || session.defaultAction);
        let randomActions;
        if (type === 'random') {
            const pool = randomPoolFor({ randomActions: draft.randomActions }, session.actions);
            if (!pool.length) {
                if (typeof showCustomMsg === 'function') {
                    showCustomMsg('error', 'สุ่มแอคชัน', 'เลือกอย่างน้อย 1 แอคชันที่จะสุ่มออก');
                }
                return;
            }
            action = RANDOM_ACTION;
            randomActions = pool;
        }
        const payload = {
            id: Date.now(),
            enabled: true,
            type,
            giftName: draft.giftName || '',
            giftId: draft.giftId || '',
            giftIcon: draft.giftIcon || '',
            action,
            randomActions,
            threshold: parseInt(document.getElementById('mapTrigThreshold')?.value, 10) || 100,
            giftThreshold: parseInt(document.getElementById('mapTrigGiftThreshold')?.value, 10) || 1,
            minCoins: parseInt(document.getElementById('mapTrigMinCoins')?.value, 10) || 1,
            maxCoins: parseInt(document.getElementById('mapTrigMaxCoins')?.value, 10) || 999999,
            chance: Math.max(1, Math.min(100, parseInt(document.getElementById('mapTrigChance')?.value, 10) || 50)),
            seconds: parseInt(document.getElementById('mapTrigSeconds')?.value, 10) || 10,
            amount: Math.max(1, parseInt(document.getElementById('mapTrigWinAmount')?.value, 10) || 1)
        };
        const actionsForLabel = session.actions;
        if (session.onSave) session.onSave(payload);
        close();
        if (typeof showCustomMsg === 'function') {
            showCustomMsg('success', 'เพิ่มทริกเกอร์แล้ว', formatLabel(payload, actionsForLabel));
        }
    }

    function formatLabel(tr, actions) {
        const t = tr || {};
        const meta = TRIGGER_TYPES.find((x) => x.value === t.type) || { icon: '⚡', label: t.type };
        const actionMeta = withRandomAction(actions || []).find((a) => a.value === t.action);
        let actionLabel = actionMeta?.label || t.action;
        let src = `${meta.icon} ${meta.label}`;
        if (t.type === 'gift') {
            src = `${meta.icon} ${t.giftName || 'ของขวัญ'}${t.giftThreshold > 1 ? ` ×${t.giftThreshold}` : ''}`;
        } else if (t.type === 'coins') {
            src = `${meta.icon} ${t.minCoins}–${t.maxCoins} 🪙`;
        } else if (t.type === 'random') {
            const n = randomPoolFor(t, actions).length;
            if (t.giftName || t.giftId) {
                src = `${meta.icon} ${t.giftName || 'ของขวัญ'} · สุ่ม ${t.chance || 50}% · ${n} แอคชัน`;
            } else {
                src = `${meta.icon} สุ่ม ${t.chance || 50}% · ${t.minCoins || 1}+ 🪙 · ${n} แอคชัน`;
            }
            actionLabel = `🎲 ${n} แอคชัน`;
        } else if (t.type === 'like' || t.type === 'globallikes') {
            src = `${meta.icon} ทุก ${t.threshold || 100} ไลค์`;
        }
        let extra = '';
        if (Array.isArray(session?.showWinAmountFor) && session.showWinAmountFor.includes(t.action)
            && Number(t.amount) > 1) {
            extra = ` ×${t.amount}`;
        } else if ((t.action === 'fc_increase_fish' || t.action === 'fc_decrease_fish'
            || t.action === 'fc_plus_win' || t.action === 'fc_minus_win'
            || t.action === 'fc_spawn_zombie' || t.action === 'fc_spawn_golem'
            || t.action === 'fc_villager_help')
            && Number(t.amount) > 1) {
            extra = ` ×${t.amount}`;
        }
        return `${src} → ${actionLabel}${extra}`;
    }

    /**
     * Shared live-event matching for map games that store Box-style triggers.
     * fireFn(tr, user) should run the action.
     */
    function matchLiveEvent(triggers, eventType, data, fireFn, counters, actions) {
        if (!Array.isArray(triggers) || typeof fireFn !== 'function') return false;
        const bag = counters || {};
        const user = data?.uniqueId || data?.nickname || 'viewer';
        const run = (tr) => fireFn(resolveTriggerAction(tr, actions), user);
        let fired = false;
        for (const tr of triggers) {
            if (!tr || tr.enabled === false) continue;
            if (tr.type === 'random' && eventType !== 'like' && eventType !== 'globallikes') {
                if (!rollRandomChance(tr)) continue;
                run(tr);
                fired = true;
                continue;
            }
            if ((tr.type || 'gift') !== eventType) continue;
            if (eventType === 'like' || eventType === 'globallikes') {
                const thr = Math.max(1, parseInt(tr.threshold, 10) || 100);
                const inc = Math.max(1, parseInt(data?.likeCount || data?.count || 1, 10) || 1);
                const key = `${tr.id}:${eventType === 'like' ? user : 'global'}`;
                bag[key] = (bag[key] || 0) + inc;
                const times = Math.floor(bag[key] / thr);
                if (times <= 0) continue;
                bag[key] %= thr;
                for (let i = 0; i < times; i++) {
                    run(tr);
                    fired = true;
                }
                continue;
            }
            run(tr);
            fired = true;
        }
        return fired;
    }

    function matchGiftTriggers(triggers, gift, fireFn, counters, actions) {
        if (!Array.isArray(triggers) || typeof fireFn !== 'function') return { fired: false, matched: false };
        const bag = counters || {};
        const user = gift?.uniqueId || gift?.nickname || 'viewer';
        const coins = parseInt(gift?.diamondCount || gift?.diamond_count || 0, 10) || 0;
        const giftQty = Math.max(1, parseInt(gift?.repeatCount || gift?.giftCount || gift?.repeat_count || 1, 10) || 1);
        const run = (tr, qty) => fireFn(resolveTriggerAction(tr, actions), user, qty);
        let fired = false;
        let matched = false;

        for (const tr of triggers) {
            if (!tr || tr.enabled === false) continue;
            const type = tr.type || 'gift';

            if (type === 'coins') {
                const min = parseInt(tr.minCoins, 10) || 1;
                const max = parseInt(tr.maxCoins, 10) || 999999;
                if (coins < min || coins > max) continue;
                run(tr, 1);
                fired = true;
                matched = true;
                continue;
            }

            if (type === 'random') {
                const hasGift = !!(tr.giftId || tr.giftName);
                if (hasGift) {
                    const matchId = tr.giftId && String(tr.giftId) === String(gift.giftId);
                    const matchName = tr.giftName && String(gift.giftName || '').toLowerCase().trim() === String(tr.giftName).toLowerCase().trim();
                    if (!matchId && !matchName) continue;
                    matched = true;
                    if (!rollRandomChance(tr)) continue;
                    const thr = Math.max(1, parseInt(tr.giftThreshold, 10) || 1);
                    if (thr > 1) {
                        const key = `gift:${tr.id}:${user}`;
                        bag[key] = (bag[key] || 0) + giftQty;
                        const times = Math.floor(bag[key] / thr);
                        if (times <= 0) continue;
                        bag[key] %= thr;
                        for (let i = 0; i < times; i++) run(tr, 1);
                    } else {
                        run(tr, giftQty);
                    }
                    fired = true;
                    continue;
                }
                if (coins > 0) {
                    const min = parseInt(tr.minCoins, 10) || 1;
                    const max = parseInt(tr.maxCoins, 10) || 999999;
                    if (coins < min || coins > max) continue;
                }
                if (!rollRandomChance(tr)) continue;
                run(tr, giftQty);
                fired = true;
                matched = true;
                continue;
            }

            if (type !== 'gift') continue;
            const matchId = tr.giftId && String(tr.giftId) === String(gift.giftId);
            const matchName = tr.giftName && String(gift.giftName || '').toLowerCase().trim() === String(tr.giftName).toLowerCase().trim();
            if (!matchId && !matchName) continue;
            matched = true;
            const thr = Math.max(1, parseInt(tr.giftThreshold, 10) || 1);
            if (thr > 1) {
                const key = `gift:${tr.id}:${user}`;
                bag[key] = (bag[key] || 0) + giftQty;
                const times = Math.floor(bag[key] / thr);
                if (times <= 0) continue;
                bag[key] %= thr;
                for (let i = 0; i < times; i++) run(tr, 1);
            } else {
                run(tr, giftQty);
            }
            fired = true;
        }
        return { fired, matched };
    }

    function isAdmin() {
        try {
            if (typeof global.isAppAdmin === 'function') return !!global.isAppAdmin();
            if (typeof isAppAdmin === 'function') return !!isAppAdmin();
        } catch (e) {}
        return false;
    }

    function visibleActions(actions) {
        const list = Array.isArray(actions) ? actions : [];
        if (isAdmin()) return list;
        return list.filter((a) => !a.adminOnly);
    }

    /**
     * Long trigger row like Farm screenshot:
     * [gift img / event badge] | action pills | ▶ ✕
     */
    function renderTriggerRowHtml(tr, actions, opts) {
        const o = opts || {};
        const id = tr.id;
        const type = tr.type || 'gift';
        const isRandom = type === 'random';
        const acts = isRandom
            ? visibleActions(actions).filter((a) => a.value !== RANDOM_ACTION)
            : withRandomAction(actions);
        const typeMeta = TRIGGER_TYPES.find((x) => x.value === type) || { icon: '⚡', label: type };
        const thrNote = (type === 'like' || type === 'globallikes') && tr.threshold
            ? ` · ทุก ${tr.threshold}`
            : (type === 'gift' && tr.giftThreshold > 1 ? ` ×${tr.giftThreshold}` : '');
        const coinsNote = type === 'coins' ? ` ${tr.minCoins || 1}–${tr.maxCoins || 999999}` : '';
        const poolCount = isRandom ? randomPoolFor(tr, actions).length : 0;
        const hasRandomGift = isRandom && !!(tr.giftId || tr.giftName);
        const randomNote = isRandom
            ? (hasRandomGift
                ? ` ${tr.chance || 50}% · ${esc(tr.giftName || 'ของขวัญ')} · ${poolCount} แอคชัน`
                : ` ${tr.chance || 50}% · ${tr.minCoins || 1}+ 🪙 · ${poolCount} แอคชัน`)
            : '';

        let srcHtml;
        if (type === 'gift' || hasRandomGift || isRandom) {
            const icon = tr.giftIcon
                ? `<img class="rp-trigger-gift-img" src="${esc(tr.giftIcon)}" alt="">`
                : `<span class="rp-trigger-gift-fallback">${isRandom ? '🎲' : '🎁'}</span>`;
            const name = esc(tr.giftName || (isRandom ? 'กำหนดของขวัญ' : 'เลือกของขวัญ'));
            const pickAttr = o.giftCmd
                ? ` type="button" data-${o.prefix}-cmd="${o.giftCmd}" data-id="${id}"`
                : ` type="button"`;
            const onclick = o.giftOnclick ? ` onclick="${o.giftOnclick}"` : '';
            srcHtml = `<button class="rp-trigger-src rp-trigger-src--gift"${pickAttr}${onclick} title="เลือกของขวัญ">${icon}<span class="rp-trigger-src-name">${name}</span></button>`;
            if (isRandom && !hasRandomGift) {
                srcHtml = `<div class="rp-trigger-src rp-trigger-src--event" title="${esc(typeMeta.label)}">
                <span class="rp-trigger-src-ico">${typeMeta.icon}</span>
                <span class="rp-trigger-src-meta">
                    <strong>${esc(typeMeta.label)}</strong>
                    <small>${esc(TYPE_LABELS[type] || type)}${esc(randomNote)}</small>
                </span>
            </div>` + srcHtml;
            }
        } else {
            srcHtml = `<div class="rp-trigger-src rp-trigger-src--event" title="${esc(typeMeta.label)}">
                <span class="rp-trigger-src-ico">${typeMeta.icon}</span>
                <span class="rp-trigger-src-meta">
                    <strong>${esc(typeMeta.label)}</strong>
                    <small>${esc(TYPE_LABELS[type] || type)}${esc(thrNote || coinsNote || randomNote)}</small>
                </span>
            </div>`;
        }

        const poolSet = isRandom ? new Set(randomPoolFor(tr, actions)) : null;
        const pills = acts.map((a) => {
            const active = (isRandom ? poolSet.has(a.value) : tr.action === a.value) ? ' is-active' : '';
            if (o.actionCmd) {
                return `<button type="button" class="mc-pill${active}" data-${o.prefix}-cmd="${o.actionCmd}" data-id="${id}" data-value="${esc(a.value)}">${esc(a.label)}</button>`;
            }
            const onclick = o.actionOnclick
                ? ` onclick="${o.actionOnclick.replace('{id}', id).replace('{value}', a.value)}"`
                : '';
            return `<button type="button" class="mc-pill${active}"${onclick}>${esc(a.label)}</button>`;
        }).join('');

        const testAttr = o.testCmd
            ? ` data-${o.prefix}-cmd="${o.testCmd}" data-id="${id}"`
            : '';
        const testOnclick = o.testOnclick ? ` onclick="${o.testOnclick}"` : '';
        const removeAttr = o.removeCmd
            ? ` data-${o.prefix}-cmd="${o.removeCmd}" data-id="${id}"`
            : '';
        const removeOnclick = o.removeOnclick ? ` onclick="${o.removeOnclick}"` : '';

        const showAmt = Array.isArray(o.showAmountFor) && o.showAmountFor.includes(tr.action);
        const amtVal = Math.max(1, Math.min(99, parseInt(tr.amount, 10) || 1));
        const amtLabel = esc(o.amountLabel || 'จำนวน');
        const amtOnchange = o.amountOnchange || '';
        const amtHtml = showAmt
            ? `<label class="rp-trigger-amount" title="${amtLabel}">
                <span>${amtLabel}</span>
                <input type="number" min="1" max="99" value="${amtVal}"${amtOnchange ? ` onchange="${amtOnchange}" oninput="${amtOnchange}"` : ''}>
               </label>`
            : '';

        return `<div class="rp-trigger-chip mc-trigger-chip rp-trigger-chip--row" data-id="${id}">
            ${srcHtml}
            <div class="rp-trigger-actions-rail mc-pill-grid">${pills}</div>
            ${amtHtml}
            <div class="mc-trigger-chip-actions">
                <button type="button" class="gp-btn-primary mc-test-btn mc-admin-only"${testAttr}${testOnclick} title="ทดสอบ">▶</button>
                <button type="button" class="mc-remove-btn"${removeAttr}${removeOnclick} title="ลบ">✕</button>
            </div>
        </div>`;
    }

    global.MapTriggerUI = {
        open,
        close,
        selectType,
        openGiftPicker,
        save,
        formatLabel,
        matchLiveEvent,
        matchGiftTriggers,
        renderTriggerRowHtml,
        resolveTriggerAction,
        applyActionPick,
        toggleRandomPool,
        randomPoolFor,
        selectAllPool,
        clearPoolKeepOne,
        visibleActions,
        isAdmin,
        TRIGGER_TYPES,
        TYPE_LABELS,
        RANDOM_ACTION
    };
    global.openMapTriggerModal = open;
    global.closeMapTriggerModal = close;
    global.selectMapTriggerType = selectType;
    global.openMapTriggerGiftPicker = openGiftPicker;
    global.saveMapTriggerFromModal = save;
})(typeof window !== 'undefined' ? window : global);
