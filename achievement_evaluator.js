'use strict';

/**
 * Evaluate achievement unlock progress for a user.
 * Trigger types: manual, live_hours, friends_count, gifts_received, pro_subscriptions, account_age
 */

function daysBetween(fromIso, toDate = new Date()) {
    const t = Date.parse(fromIso);
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, (toDate.getTime() - t) / (24 * 60 * 60 * 1000));
}

function accountAgeValue(createdAt, unit) {
    const days = daysBetween(createdAt);
    if (unit === 'year') return days / 365;
    if (unit === 'month') return days / 30;
    return days;
}

async function safeCount(db, fn, fallback = 0) {
    try {
        const value = await fn();
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    } catch (_) {
        return fallback;
    }
}

async function collectUserMetrics(db, user) {
    const userId = String(user.id);
    const friends = await safeCount(db, async () => {
        if (typeof db.listFriends === 'function') {
            const list = await db.listFriends(userId);
            return Array.isArray(list) ? list.length : 0;
        }
        if (typeof db.all === 'function') {
            const rows = await db.all('SELECT COUNT(*) as c FROM user_friends WHERE ownerId = ?', [userId]);
            return rows?.[0]?.c || 0;
        }
        return 0;
    });

    const liveHours = await safeCount(db, async () => {
        if (typeof db.listStreamSummaries === 'function') {
            const streams = await db.listStreamSummaries(userId, 500);
            const seconds = (streams || []).reduce((sum, row) => sum + (Number(row.durationSeconds) || 0), 0);
            return seconds / 3600;
        }
        if (typeof db.all === 'function') {
            const rows = await db.all(
                'SELECT COALESCE(SUM(durationSeconds), 0) as s FROM stream_summaries WHERE userId = ?',
                [userId]
            );
            return (Number(rows?.[0]?.s) || 0) / 3600;
        }
        return Number(user.totalLiveHours) || 0;
    });

    const giftsReceived = await safeCount(db, async () => {
        if (typeof db.all === 'function') {
            const rows = await db.all(
                `SELECT COALESCE(SUM(json_extract(metadata, '$.giftCount')), COUNT(*)) as c
                 FROM profile_activity WHERE userId = ? AND type IN ('gift', 'gift_received')`,
                [userId]
            ).catch(() => null);
            if (rows) return Number(rows[0]?.c) || 0;
        }
        return Number(user.giftsReceived) || 0;
    });

    const proSubscriptions = await safeCount(db, async () => {
        if (user.isPro === 1 || user.isPro === true) return Math.max(1, Number(user.proSubscriptionCount) || 1);
        return Number(user.proSubscriptionCount) || 0;
    });

    return {
        friends_count: friends,
        live_hours: liveHours,
        gifts_received: giftsReceived,
        pro_subscriptions: proSubscriptions,
        account_age_days: daysBetween(user.createdAt),
        createdAt: user.createdAt
    };
}

function progressForTrigger(def, metrics) {
    const type = String(def.triggerType || 'manual');
    const target = Math.max(0, Number(def.triggerValue) || 0);
    if (type === 'manual' || target <= 0) return { progress: 0, current: 0, target };
    let current = 0;
    if (type === 'live_hours') current = metrics.live_hours;
    else if (type === 'friends_count') current = metrics.friends_count;
    else if (type === 'gifts_received') current = metrics.gifts_received;
    else if (type === 'pro_subscriptions') current = metrics.pro_subscriptions;
    else if (type === 'account_age') {
        current = accountAgeValue(metrics.createdAt, def.triggerUnit || 'day');
    } else {
        return { progress: 0, current: 0, target };
    }
    const progress = Math.min(100, Math.floor((current / target) * 100));
    return { progress, current, target };
}

async function evaluateUserAchievements(db, user, options = {}) {
    if (!user?.id || typeof db.listAchievementDefinitions !== 'function') {
        return { evaluated: 0, unlocked: [], updated: [] };
    }
    const defs = await db.listAchievementDefinitions({ includeInactive: !!options.includeInactive });
    const active = (defs || []).filter((d) => d.active !== 0 && d.active !== false && d.triggerType !== 'manual');
    if (!active.length) return { evaluated: 0, unlocked: [], updated: [] };

    const metrics = await collectUserMetrics(db, user);
    const unlocked = [];
    const updated = [];

    for (const def of active) {
        const { progress } = progressForTrigger(def, metrics);
        if (progress <= 0 && !options.forceWrite) continue;
        const before = typeof db.listUserAchievements === 'function'
            ? (await db.listUserAchievements(user.id, 500)).find((row) => String(row.id) === String(def.id))
            : null;
        const alreadyUnlocked = !!(before?.unlockedAt);
        if (alreadyUnlocked && progress < 100) continue;

        await db.upsertUserAchievement(user.id, def.id, {
            progress: alreadyUnlocked ? Math.max(100, progress) : progress,
            unlockedAt: alreadyUnlocked || progress >= 100 ? (before?.unlockedAt || new Date().toISOString()) : null
        });

        updated.push({ id: def.id, name: def.name, progress });
        if (!alreadyUnlocked && progress >= 100) {
            unlocked.push({ id: def.id, name: def.name });
            try {
                if (typeof db.createProfileActivity === 'function') {
                    await db.createProfileActivity(user.id, {
                        type: 'achievement',
                        title: `ปลดล็อก: ${def.name}`,
                        details: def.description || '',
                        metadata: { achievementId: def.id }
                    });
                }
            } catch (_) {}
        }
    }

    if (unlocked.length && typeof db.updateSocialProfile === 'function') {
        try {
            const owned = await db.listUserAchievements(user.id, 500);
            const count = (owned || []).filter((row) => row.unlockedAt).length;
            await db.updateSocialProfile(user.id, { achievementsCount: count, lastActive: new Date().toISOString() });
        } catch (_) {}
    }

    return { evaluated: active.length, unlocked, updated, metrics };
}

module.exports = {
    evaluateUserAchievements,
    progressForTrigger,
    collectUserMetrics
};
