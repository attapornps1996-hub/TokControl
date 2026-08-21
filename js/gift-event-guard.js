/**
 * Gift event coalesce + dedupe (Node + browser).
 * - Aggregate combo taps (same user + gift) into one emit with max repeatCount
 * - Wait for combo end (repeatEnd) + settle timer, or debounce window if API omits flags
 * - Deduplicate by msgId when present
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GiftEventGuard = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEFAULT_DEBOUNCE_MS = 2000;
    const DEFAULT_END_SETTLE_MS = 700;
    const DEDUPE_TTL_MS = 20000;

    function scalarMsgId(value) {
        if (value == null || value === '') return '';
        if (typeof value === 'object') {
            if (value.low != null) return String(value.low);
            try {
                if (typeof value.toString === 'function') {
                    const s = value.toString();
                    if (s && s !== '[object Object]') return s;
                }
            } catch { /* ignore */ }
            return '';
        }
        return String(value).trim();
    }

    function coerceRepeatEndFlag(value) {
        if (value === false || value === 0 || value === '0') return false;
        if (value === true || value === 1 || value === '1') return true;
        if (value != null && typeof value === 'object' && value.low != null) {
            return Number(value.low) !== 0;
        }
        if (value == null || value === '') return undefined;
        const n = Number(value);
        if (Number.isFinite(n) && (typeof value === 'number' || typeof value === 'string')) return n !== 0;
        return undefined;
    }

    function giftKey(gift) {
        const user = String(gift?.uniqueId || gift?.userId || gift?.nickname || '')
            .toLowerCase()
            .replace(/^@+/, '');
        const gname = String(gift?.giftName || '').toLowerCase().trim();
        const gid = String(gift?.giftId || '').trim();
        // Prefer gift NAME so Direct API id + browser hash id coalesce to one event
        return `${user}::${gname || gid || 'unknown'}`;
    }

    function softDedupeKey(gift) {
        const user = String(gift?.uniqueId || gift?.userId || gift?.nickname || '')
            .toLowerCase()
            .replace(/^@+/, '');
        const gname = String(gift?.giftName || '').toLowerCase().trim();
        const gid = String(gift?.giftId || '').trim();
        return `${user}::${gname || gid || 'unknown'}`;
    }

    function eventIdOf(gift) {
        const msgId = scalarMsgId(gift?.msgId || gift?.messageId || gift?.giftMsgId
            || gift?.common?.msgId || gift?.common?.messageId || '');
        if (msgId) return `m:${msgId}`;
        const user = String(gift?.uniqueId || '').toLowerCase();
        const gname = String(gift?.giftName || gift?.giftId || '').toLowerCase();
        const tsBucket = Math.floor(Date.now() / 3000);
        return `f:${user}:${gname}:${tsBucket}`;
    }

    function looksLikeStreakGift(gift, hasPending) {
        if (hasPending) return true;
        const giftType = gift?.giftType != null ? Number(gift.giftType) : null;
        const repeatEnd = coerceRepeatEndFlag(gift?.repeatEnd);
        if (giftType === 1 && repeatEnd !== true) return true;
        if (repeatEnd === false) return true;
        const rc = Math.max(1, Number(gift?.repeatCount) || 1);
        if (rc > 1 && repeatEnd !== true) return true;
        // Browser scrape / incomplete API often omit giftType or send 0 —
        // treat as comboable so x1→x10 coalesce instead of firing each step.
        // Explicit complete (repeatEnd true/1) is a one-shot — do not buffer 2s.
        if ((giftType == null || Number.isNaN(giftType) || giftType === 0) && repeatEnd !== true) return true;
        return false;
    }

    function createGiftEventGuard(options = {}) {
        const debounceMs = Math.max(400, Number(options.debounceMs) || DEFAULT_DEBOUNCE_MS);
        const endSettleMs = Math.max(200, Number(options.endSettleMs) || DEFAULT_END_SETTLE_MS);
        const dedupeTtlMs = Math.max(3000, Number(options.dedupeTtlMs) || DEDUPE_TTL_MS);
        const pending = new Map(); // key -> { gift, timer, maxRepeat, sawEnd }
        const seenIds = new Map(); // eventId -> ts
        const recentFlush = new Map(); // softKey -> { maxRepeat, at }
        const softDedupeMs = Math.max(debounceMs, Number(options.softDedupeMs) || 3500);

        function pruneSeen(now) {
            if (seenIds.size < 400 && recentFlush.size < 200) return;
            for (const [id, t] of seenIds) {
                if (now - t > dedupeTtlMs) seenIds.delete(id);
            }
            for (const [k, v] of recentFlush) {
                if (now - (v?.at || 0) > dedupeTtlMs) recentFlush.delete(k);
            }
        }

        function wasEmitted(eventId, now) {
            if (!eventId) return false;
            const prev = seenIds.get(eventId);
            return !!(prev && now - prev < dedupeTtlMs);
        }

        function markEmitted(eventId, now) {
            if (!eventId) return;
            seenIds.set(eventId, now);
            pruneSeen(now);
        }

        function mergeGift(prev, next) {
            const a = prev || {};
            const b = next || {};
            const repeatA = Math.max(1, Number(a.repeatCount) || 1);
            const repeatB = Math.max(1, Number(b.repeatCount) || 1);
            const diamond = Number(b.diamondCount != null ? b.diamondCount : a.diamondCount) || 0;
            const repeatCount = Math.max(repeatA, repeatB);
            const giftType = b.giftType != null ? b.giftType : a.giftType;
            // End wins once seen; stay mid while still tapping
            const endB = coerceRepeatEndFlag(b.repeatEnd);
            const endA = coerceRepeatEndFlag(a.repeatEnd);
            let repeatEnd;
            if (endB === false) repeatEnd = false;
            else if (endB === true || endA === true) repeatEnd = true;
            else if (endA === false) repeatEnd = false;
            else repeatEnd = true;
            return {
                ...a,
                ...b,
                giftId: b.giftId || a.giftId,
                giftName: b.giftName || a.giftName,
                giftIcon: b.giftIcon || a.giftIcon,
                uniqueId: b.uniqueId || a.uniqueId,
                nickname: b.nickname || a.nickname,
                avatar: b.avatar || a.avatar,
                diamondCount: diamond,
                repeatCount,
                giftType: giftType != null ? giftType : 1,
                repeatEnd,
                totalCoins: diamond * repeatCount,
                msgId: b.msgId || a.msgId || b.messageId || a.messageId || '',
                _coalesced: true
            };
        }

        function flushKey(key, onFlush) {
            const entry = pending.get(key);
            if (!entry) return;
            pending.delete(key);
            if (entry.timer) clearTimeout(entry.timer);
            const gift = entry.gift;
            if (!gift) return;
            gift.repeatEnd = true;
            gift.giftType = gift.giftType != null ? gift.giftType : 1;
            gift.repeatCount = Math.max(1, Number(gift.repeatCount) || entry.maxRepeat || 1);
            gift.totalCoins = (Number(gift.diamondCount) || 0) * gift.repeatCount;
            gift._coalesced = true;

            const now = Date.now();
            const softKey = softDedupeKey(gift);
            const prevFlush = recentFlush.get(softKey);
            // Same user+gift name re-flush with lower/equal count shortly after → drop (cross-source dupes)
            if (prevFlush && now - prevFlush.at < softDedupeMs && gift.repeatCount <= prevFlush.maxRepeat) {
                return;
            }
            recentFlush.set(softKey, { maxRepeat: gift.repeatCount, at: now });
            pruneSeen(now);

            const eid = eventIdOf(gift);
            if (wasEmitted(eid, now) && gift.msgId) return;
            markEmitted(eid, now);

            onFlush(gift);
        }

        /**
         * Queue a gift. onFlush(gift) called once with coalesced total when combo settles.
         */
        function enqueue(rawGift, onFlush) {
            if (!rawGift || typeof onFlush !== 'function') return false;
            const now = Date.now();
            const key = giftKey(rawGift);
            const existing = pending.get(key);
            const streak = looksLikeStreakGift(rawGift, !!existing);

            // Already coalesced upstream (server) — deliver once, don't wait another 2s
            if (rawGift._coalesced === true && coerceRepeatEndFlag(rawGift.repeatEnd) !== false) {
                const gift = { ...rawGift, repeatEnd: true };
                gift.repeatCount = Math.max(1, Number(gift.repeatCount) || 1);
                gift.totalCoins = (Number(gift.diamondCount) || 0) * gift.repeatCount;
                const softKey = softDedupeKey(gift);
                const prevFlush = recentFlush.get(softKey);
                if (prevFlush && now - prevFlush.at < softDedupeMs && gift.repeatCount <= prevFlush.maxRepeat) {
                    return false;
                }
                const eid = eventIdOf(gift);
                if (wasEmitted(eid, now) && gift.msgId) return false;
                markEmitted(eid, now);
                recentFlush.set(softKey, { maxRepeat: gift.repeatCount, at: now });
                setTimeout(() => onFlush(gift), 40);
                return true;
            }

            // Explicit one-shot gifts (non-streak, count 1, no open combo): short settle only
            if (!streak) {
                const eid = eventIdOf(rawGift);
                if (wasEmitted(eid, now)) return false;
                markEmitted(eid, now);
                const gift = mergeGift(null, rawGift);
                gift.repeatEnd = true;
                gift.repeatCount = Math.max(1, Number(gift.repeatCount) || 1);
                gift.totalCoins = (Number(gift.diamondCount) || 0) * gift.repeatCount;
                setTimeout(() => onFlush(gift), 80);
                return true;
            }

            // Streak / combo path — always buffer by user+gift
            const mid = coerceRepeatEndFlag(rawGift.repeatEnd) === false;
            if (!mid) {
                const eid = eventIdOf(rawGift);
                // Only msgId-dedupe finished ticks; synthetic ids use flush-time check
                if (rawGift.msgId && wasEmitted(eid, now) && !existing) {
                    return false;
                }
            }

            const merged = mergeGift(existing?.gift, rawGift);
            // Force streak typing so downstream mid-filters don't drop
            if (merged.giftType == null || Number(merged.giftType) === 0) merged.giftType = 1;
            const maxRepeat = Math.max(
                existing?.maxRepeat || 1,
                Number(merged.repeatCount) || 1
            );
            merged.repeatCount = maxRepeat;

            // If a higher count arrives after a recent flush, reopen (slow combo / late ticks)
            const softKey = softDedupeKey(rawGift);
            const prevFlush = recentFlush.get(softKey) || recentFlush.get(key);
            if (!existing && prevFlush && now - prevFlush.at < softDedupeMs && maxRepeat > prevFlush.maxRepeat) {
                // continue into pending below
            } else if (!existing && prevFlush && now - prevFlush.at < softDedupeMs && maxRepeat <= prevFlush.maxRepeat) {
                return false;
            }

            if (existing?.timer) clearTimeout(existing.timer);

            const sawEnd = !!(existing?.sawEnd || merged.repeatEnd === true);
            if (mid) merged.repeatEnd = false;

            // Mid taps: full debounce. Explicit end: settle briefly so late mids can merge.
            // Always reset timer on every tap so slow combos keep aggregating.
            const delay = mid || !sawEnd ? debounceMs : endSettleMs;
            const timer = setTimeout(() => flushKey(key, onFlush), delay);
            pending.set(key, { gift: merged, timer, maxRepeat, sawEnd: sawEnd && !mid });
            return true;
        }

        function reset() {
            for (const entry of pending.values()) {
                if (entry.timer) clearTimeout(entry.timer);
            }
            pending.clear();
            seenIds.clear();
            recentFlush.clear();
        }

        return {
            enqueue,
            flushKey: (key, onFlush) => flushKey(key, onFlush),
            reset,
            giftKey,
            eventIdOf,
            debounceMs,
            endSettleMs
        };
    }

    /** Strict gift id/name match — no .includes substring matching. */
    function giftsStrictMatch(trigger, gift) {
        if (!trigger || !gift) return false;
        const tid = String(trigger.giftId || '').trim();
        const gid = String(gift.giftId || '').trim();
        if (tid && gid && tid === gid) return true;

        const tn = String(trigger.giftName || '').toLowerCase().trim();
        const gn = String(gift.giftName || '').toLowerCase().trim();
        if (tn && gn && tn === gn) return true;
        return false;
    }

    /** Exact known-name map only (no substring). */
    function resolveKnownGiftIdExact(giftName, fallbackId, knownMap) {
        const name = String(giftName || '').toLowerCase().trim();
        const map = knownMap || {};
        if (name && map[name] != null) return String(map[name]);
        return String(fallbackId || '');
    }

    return {
        createGiftEventGuard,
        giftsStrictMatch,
        resolveKnownGiftIdExact,
        giftKey,
        eventIdOf,
        DEFAULT_DEBOUNCE_MS,
        DEFAULT_END_SETTLE_MS,
        DEDUPE_TTL_MS
    };
});
