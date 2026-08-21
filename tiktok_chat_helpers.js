/**
 * TikTok chat helpers — Fan Club / Heart Me detection
 * Compatible with tiktok-live-connector v2.4+ (nested protobuf user objects)
 */

const fs = require('fs');
const path = require('path');

const HEART_ME_GIFT_IDS = new Set(['7934', 7934]);
// NOTE: TikTok Rose gift id is 5655 — do NOT treat it as Heart Me.
/** Fan club / orange-heart badge scenes (varies by TikTok API version) */
const TEAM_MEMBER_BADGE_SCENES = new Set([1, 7, 10]);
const TEAM_MEMBER_DISPLAY_TYPES = new Set([1]);
/** TikTok live subscribe / super-fan badge scenes (varies by API version) */
const SUBSCRIBE_BADGE_SCENES = new Set([4, 8, 11, 12]);

function normalizeTikTokId(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'object') {
        if (value.low != null) return String(value.low);
        if (typeof value.toString === 'function' && value.constructor?.name === 'Long') {
            return String(value.toString());
        }
    }
    return String(value).trim();
}

/** Read a property from plain objects or protobuf message instances (spread loses getters). */
function readProp(obj, key) {
    if (obj == null) return undefined;
    try {
        const v = obj[key];
        if (v !== undefined) return v;
    } catch { /* ignore */ }
    try {
        if (typeof obj.toJSON === 'function') {
            const j = obj.toJSON();
            if (j && j[key] !== undefined) return j[key];
        }
    } catch { /* ignore */ }
    return undefined;
}

function getField(obj, ...keys) {
    if (!obj) return '';
    for (const key of keys) {
        const v = readProp(obj, key);
        if (v == null || v === '') continue;
        const normalized = normalizeTikTokId(v);
        if (normalized) return normalized;
    }
    return '';
}

function getUserSources(user, data) {
    const sources = [];
    if (user) sources.push(user);
    const nested = readProp(data, 'user');
    if (nested) sources.push(nested);
    if (data) sources.push(data);
    const identity = readProp(data, 'userIdentity') || readProp(data, 'user_identity');
    if (identity) sources.push(identity);
    return sources;
}

/** v2.4 keeps user nested; do not rely on object spread of protobuf instances. */
function connectorRoot(user, data) {
    const out = {};
    const sources = getUserSources(user, data);
    const keys = [
        'uniqueId', 'displayId', 'unique_id', 'display_id',
        'nickname', 'nickName', 'nick_name',
        'userId', 'user_id', 'id', 'idStr',
        'profilePictureUrl', 'avatarThumb', 'avatarMedium', 'avatar',
        'userBadges', 'badges', 'badgeList', 'newUserBadges',
        'teamMemberLevel', 'isSubscriber', 'fansClub', 'fanClub',
        'followRole', 'followInfo'
    ];
    for (const src of sources) {
        for (const key of keys) {
            if (out[key] !== undefined && out[key] !== null && out[key] !== '') continue;
            const v = readProp(src, key);
            if (v !== undefined && v !== null && v !== '') out[key] = v;
        }
    }
    return out;
}

function collectUserBadges(user, data) {
    const sources = getUserSources(user, data);
    const lists = [];
    const seen = new Set();
    const pushBadge = (b) => {
        if (!b || typeof b !== 'object') return;
        const key = JSON.stringify(b);
        if (seen.has(key)) return;
        seen.add(key);
        lists.push(b);
    };
    for (const src of sources) {
        for (const key of ['userBadges', 'badges', 'badgeList', 'newUserBadges']) {
            const list = readProp(src, key);
            if (Array.isArray(list)) list.filter(Boolean).forEach(pushBadge);
        }
    }
    // Chat events may attach badgeList on the event root, not only on user.
    if (data) {
        for (const key of ['badgeList', 'badges', 'userBadges', 'newUserBadges']) {
            const list = readProp(data, key);
            if (Array.isArray(list)) list.filter(Boolean).forEach(pushBadge);
        }
    }
    return lists;
}

function badgeTypeLooksLikeTeam(badge) {
    const typeStr = String(
        readProp(badge, 'type') || readProp(badge, 'badgeDisplayType') || readProp(badge, 'displayType') ||
        readProp(badge, 'badgeScene') || readProp(badge, 'badgeType') || ''
    ).toLowerCase();
    return /fan|team|subscribe|member|vip|superfan|fansclub|heart/.test(typeStr);
}

function isTeamMemberBadge(badge) {
    if (!badge) return false;
    const scene = parseInt(readProp(badge, 'badgeSceneType'), 10) || 0;
    const displayType = parseInt(readProp(badge, 'badgeDisplayType') || readProp(badge, 'displayType'), 10) || 0;
    if (TEAM_MEMBER_BADGE_SCENES.has(scene)) return true;
    if (TEAM_MEMBER_DISPLAY_TYPES.has(displayType)) return true;
    if (parseInt(readProp(badge, 'teamMemberLevel'), 10) > 0) return true;
    if (readProp(badge, 'fanClub') || readProp(badge, 'subscribeBadge') || readProp(badge, 'isSubscribe')) return true;
    if (badgeTypeLooksLikeTeam(badge)) return true;
    if (badgeImageLooksLikeFanClub(badge)) return true;
    return false;
}

function extractChatIdentity(user, data) {
    const sources = getUserSources(user, data);
    let uniqueId = '';
    let nickname = '';
    let userId = '';
    let avatar = '';

    for (const s of sources) {
        if (!uniqueId) uniqueId = getField(s, 'uniqueId', 'displayId', 'unique_id', 'display_id');
        if (!nickname) nickname = getField(s, 'nickname', 'nickName', 'nick_name');
        if (!userId) userId = getField(s, 'userId', 'user_id', 'idStr', 'id');
        if (!avatar) {
            try {
                avatar = readProp(s, 'profilePictureUrl')
                    || readProp(s, 'avatarThumb')?.urlList?.[0]
                    || readProp(s, 'avatarMedium')?.urlList?.[0]
                    || readProp(s, 'avatar')
                    || '';
            } catch { /* ignore */ }
        }
    }

    uniqueId = String(uniqueId || '').replace(/^@/, '').trim();
    nickname = String(nickname || '').trim();
    if (!uniqueId && nickname) uniqueId = nickname;
    if (!nickname && uniqueId) nickname = uniqueId;

    return {
        uniqueId,
        nickname,
        userId: normalizeTikTokId(userId),
        avatar: String(avatar || '')
    };
}

function badgeImageLooksLikeFanClub(badge) {
    if (!badge) return false;
    const urls = [];
    const pushUrl = (v) => {
        if (!v) return;
        if (typeof v === 'string') urls.push(v);
        else if (Array.isArray(v)) v.forEach(pushUrl);
        else if (typeof v === 'object') {
            if (v.url) pushUrl(v.url);
            if (v.urlList) pushUrl(v.urlList);
            if (v.uri) pushUrl(v.uri);
        }
    };
    pushUrl(readProp(badge, 'url'));
    pushUrl(readProp(badge, 'icon'));
    pushUrl(readProp(badge, 'image'));
    pushUrl(readProp(badge, 'badgeImageUrl'));
    pushUrl(readProp(badge, 'iconUrl'));
    const blob = urls.join(' ').toLowerCase();
    return /fan|team|subscribe|superfan|fansclub|heart_me|heartme|privilege\/fan|privilege\/subscribe/.test(blob);
}

function levelFromTeamBadges(badges) {
    let maxLevel = 0;
    let hasTeamBadge = false;
    for (const b of badges) {
        if (!b) continue;
        if (isTeamMemberBadge(b)) {
            hasTeamBadge = true;
            const lvl = parseInt(
                readProp(b, 'teamMemberLevel') || readProp(b, 'fanClubLevel') || readProp(b, 'level') || 0,
                10
            ) || 0;
            maxLevel = Math.max(maxLevel, lvl > 0 ? lvl : 1);
        }
    }
    if (hasTeamBadge && maxLevel < 1) maxLevel = 1;
    return maxLevel;
}

function chatUserHasFanClubBadge(user, data) {
    const r = connectorRoot(user, data);
    const badges = collectUserBadges(user, data);

    if (parseInt(r.teamMemberLevel, 10) > 0) return true;
    if (levelFromTeamBadges(badges) > 0) return true;

    const fansClub = r.fansClub || r.fanClub;
    if (fansClub) {
        const level = fansClub.level ?? fansClub.data?.level ?? fansClub.fansLevel ?? fansClub.fanClubLevel;
        if (level > 0 || fansClub.data || fansClub.fanClubName || fansClub.clubName) return true;
    }

    // tiktok-live-connector userIdentity flags
    const identity = readProp(data, 'userIdentity') || readProp(user, 'userIdentity') || readProp(r, 'userIdentity');
    if (identity) {
        if (readProp(identity, 'isFanOfAnchor') || readProp(identity, 'isFanClubMemberOfAnchor')
            || readProp(identity, 'isMemberOfFanClub') || readProp(identity, 'fanClubMember')) {
            return true;
        }
    }
    if (data?.isFanClub || data?.hasFanClubBadge || user?.isFanClub || user?.hasFanClubBadge) return true;

    for (const b of badges) {
        if (isTeamMemberBadge(b)) return true;
    }

    return false;
}

function extractTeamMemberLevel(user, data) {
    const r = connectorRoot(user, data);
    const badges = collectUserBadges(user, data);
    let maxLevel = parseInt(r.teamMemberLevel, 10) || 0;
    maxLevel = Math.max(maxLevel, levelFromTeamBadges(badges));
    maxLevel = Math.max(
        maxLevel,
        parseInt(readProp(data, 'teamLevel') || readProp(data, 'teamMemberLevel'), 10) || 0
    );

    const fansClub = r.fansClub || r.fanClub;
    if (fansClub) {
        const level = fansClub.level ?? fansClub.data?.level ?? fansClub.fansLevel ?? fansClub.fanClubLevel ?? 0;
        maxLevel = Math.max(maxLevel, parseInt(level, 10) || 0);
    }

    const hasBadge = chatUserHasFanClubBadge(user, data);
    if (hasBadge && maxLevel < 1) maxLevel = 1;
    if (maxLevel > 0) return maxLevel;
    if (hasBadge || data?.isFanClub) return 1;
    return 0;
}

function extractSubscriberFlag(user, data) {
    const r = connectorRoot(user, data);
    if (r.isSubscriber || data?.isSubscriber) return true;
    return levelFromSubscribeBadges(collectUserBadges(user, data)).isSubscriber;
}

function levelFromSubscribeBadges(badges) {
    let maxLevel = 0;
    let isSubscriber = false;
    for (const b of badges) {
        if (!b) continue;
        const scene = parseInt(readProp(b, 'badgeSceneType'), 10) || 0;
        const typeStr = String(
            readProp(b, 'type') || readProp(b, 'badgeType') || readProp(b, 'badgeDisplayType') || ''
        ).toLowerCase();
        const isSubscribeBadge = SUBSCRIBE_BADGE_SCENES.has(scene)
            || !!readProp(b, 'subscribeBadge')
            || !!readProp(b, 'isSubscribe')
            || /subscribe|subscriber|superfan/.test(typeStr);
        if (!isSubscribeBadge) continue;
        isSubscriber = true;
        const lvl = parseInt(
            readProp(b, 'level') || readProp(b, 'subscribeLevel') || readProp(b, 'subscriberLevel') || 1,
            10
        ) || 1;
        maxLevel = Math.max(maxLevel, lvl);
    }
    return { isSubscriber, level: maxLevel };
}

function extractSubscriberLevel(user, data) {
    const r = connectorRoot(user, data);
    const badges = collectUserBadges(user, data);
    const fromBadges = levelFromSubscribeBadges(badges);
    let level = fromBadges.level;
    if (extractSubscriberFlag(user, data)) {
        level = Math.max(
            level,
            parseInt(r.subscribeLevel || r.subscriberLevel || r.subLevel || 1, 10) || 1
        );
    }
    return level;
}

function extractFollowerFlag(user, data) {
    const r = connectorRoot(user, data);
    const role = parseInt(
        r.followRole ?? r.followInfo?.followStatus ?? data?.followRole ?? 0,
        10
    );
    return role === 1 || role === 2;
}

function isHeartMeGift(giftId, giftName) {
    const id = String(giftId || '');
    if (id === '5655') return false; // Rose
    if (HEART_ME_GIFT_IDS.has(giftId) || HEART_ME_GIFT_IDS.has(id)) return true;
    const name = String(giftName || '').toLowerCase();
    if (name.includes('rose') || name.includes('กุหลาบ') || name.includes('rosa')) return false;
    return name.includes('heart me') || name.includes('heartme') || (name.includes('ใจ') && !name.includes('กุหลาบ'));
}

function createFanClubRegistry(options = {}) {
    const cachePath = options.cachePath || path.join(__dirname, 'data', 'team_members_cache.json');
    /** @type {Map<string, { members: Set<string>, levels: Map<string, number> }>} */
    const map = new Map();
    let persistTimer = null;

    function key(streamUserId) {
        return String(streamUserId || 'default');
    }

    function ttKey(tiktokUsername) {
        const u = String(tiktokUsername || '').trim().replace(/^@+/, '').toLowerCase();
        return u ? `tt:${u}` : '';
    }

    function ensureBucket(k) {
        if (!map.has(k)) map.set(k, { members: new Set(), levels: new Map() });
        return map.get(k);
    }

    function loadCache() {
        try {
            if (!fs.existsSync(cachePath)) return;
            const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            for (const [streamUserId, entry] of Object.entries(raw || {})) {
                const bucket = ensureBucket(key(streamUserId));
                // Legacy: array of member ids
                if (Array.isArray(entry)) {
                    entry.forEach((v) => {
                        const s = String(v || '').trim().toLowerCase();
                        if (s && s !== '0') bucket.members.add(s);
                    });
                    continue;
                }
                if (entry && typeof entry === 'object') {
                    const members = Array.isArray(entry.members) ? entry.members : [];
                    members.forEach((v) => {
                        const s = String(v || '').trim().toLowerCase();
                        if (s && s !== '0') bucket.members.add(s);
                    });
                    const levels = entry.levels && typeof entry.levels === 'object' ? entry.levels : {};
                    Object.entries(levels).forEach(([id, lv]) => {
                        const s = String(id || '').trim().toLowerCase();
                        const n = parseInt(lv, 10) || 0;
                        if (s && n > 0) bucket.levels.set(s, n);
                    });
                }
            }
            console.log(`[team_members_cache] loaded ${map.size} stream bucket(s) from disk`);
        } catch (err) {
            console.warn('[team_members_cache] load failed:', err.message);
        }
    }

    function schedulePersist() {
        if (persistTimer) return;
        persistTimer = setTimeout(() => {
            persistTimer = null;
            try {
                const out = {};
                for (const [streamUserId, bucket] of map.entries()) {
                    out[streamUserId] = {
                        members: [...bucket.members],
                        levels: Object.fromEntries(bucket.levels)
                    };
                }
                fs.mkdirSync(path.dirname(cachePath), { recursive: true });
                fs.writeFileSync(cachePath, JSON.stringify(out, null, 2), 'utf8');
            } catch (err) {
                console.warn('[team_members_cache] save failed:', err.message);
            }
        }, 400);
    }

    loadCache();

    function resolveBuckets(streamUserId, tiktokUsername) {
        const keys = [key(streamUserId)];
        const tk = ttKey(tiktokUsername);
        if (tk) keys.push(tk);
        return keys.map(ensureBucket);
    }

    function mark(streamUserId, identity, opts = {}) {
        const buckets = resolveBuckets(streamUserId, opts.tiktokUsername);
        let changed = false;
        const level = Math.max(1, parseInt(opts.level, 10) || 1);
        [identity?.uniqueId, identity?.userId, identity?.nickname].forEach((v) => {
            const s = String(v || '').trim().toLowerCase().replace(/^@/, '');
            if (!s || s === '0') return;
            for (const bucket of buckets) {
                if (!bucket.members.has(s)) {
                    bucket.members.add(s);
                    changed = true;
                }
                const prev = bucket.levels.get(s) || 0;
                if (level > prev) {
                    bucket.levels.set(s, level);
                    changed = true;
                }
            }
        });
        if (changed) schedulePersist();
        return changed;
    }

    function has(streamUserId, identity, opts = {}) {
        const buckets = resolveBuckets(streamUserId, opts.tiktokUsername);
        return [identity?.uniqueId, identity?.userId, identity?.nickname].some((v) => {
            const s = String(v || '').trim().toLowerCase().replace(/^@/, '');
            if (!s || s === '0') return false;
            return buckets.some((b) => b.members.has(s));
        });
    }

    function getLevel(streamUserId, identity, opts = {}) {
        const buckets = resolveBuckets(streamUserId, opts.tiktokUsername);
        let max = 0;
        [identity?.uniqueId, identity?.userId, identity?.nickname].forEach((v) => {
            const s = String(v || '').trim().toLowerCase().replace(/^@/, '');
            if (!s) return;
            for (const b of buckets) {
                max = Math.max(max, b.levels.get(s) || 0);
            }
        });
        return max;
    }

    /** Snapshot for client hydrate (union of app-user + tiktok-username buckets) */
    function snapshot(streamUserId, tiktokUsername) {
        const buckets = resolveBuckets(streamUserId, tiktokUsername);
        const members = new Set();
        const levels = {};
        for (const b of buckets) {
            b.members.forEach((m) => members.add(m));
            for (const [id, lv] of b.levels) {
                levels[id] = Math.max(levels[id] || 0, lv);
            }
        }
        return { members: [...members], levels };
    }

    return { mark, has, getLevel, snapshot, cachePath };
}

function resolveChatUser(user, data) {
    return user || readProp(data, 'user') || data;
}

function buildChatPayload(user, data, streamUserId, fanClubRegistry, opts = {}) {
    const chatUser = resolveChatUser(user, data);
    const identity = extractChatIdentity(chatUser, data);
    const comment = data?.comment || data?.content || '';
    const regOpts = { tiktokUsername: opts.tiktokUsername || '' };
    const badgeFan = chatUserHasFanClubBadge(chatUser, data) || !!data?.isFanClub || !!data?.hasFanClubBadge;
    const registryFan = fanClubRegistry ? fanClubRegistry.has(streamUserId, identity, regOpts) : false;
    const isFanClub = badgeFan || registryFan;
    let teamMemberLevel = extractTeamMemberLevel(chatUser, data);
    if (fanClubRegistry) {
        teamMemberLevel = Math.max(teamMemberLevel, fanClubRegistry.getLevel(streamUserId, identity, regOpts) || 0);
    }
    if (isFanClub && teamMemberLevel < 1) teamMemberLevel = 1;

    if (isFanClub) {
        if (fanClubRegistry) fanClubRegistry.mark(streamUserId, identity, { ...regOpts, level: teamMemberLevel });
    }

    return {
        uniqueId: identity.uniqueId,
        nickname: identity.nickname,
        userId: identity.userId,
        comment,
        avatar: identity.avatar,
        isFanClub,
        hasFanClubBadge: badgeFan,
        teamMemberLevel,
        isSubscriber: extractSubscriberFlag(user, data),
        subscriberLevel: extractSubscriberLevel(user, data),
        isFollower: extractFollowerFlag(user, data),
        emotes: Array.isArray(opts.emotes) ? opts.emotes : []
    };
}

function analyzeChatTeamStatus(user, data, streamUserId, fanClubRegistry, opts = {}) {
    const chatUser = resolveChatUser(user, data);
    const identity = extractChatIdentity(chatUser, data);
    const regOpts = { tiktokUsername: opts.tiktokUsername || '' };
    const hasTeamBadge = chatUserHasFanClubBadge(chatUser, data) || !!data?.isFanClub || !!data?.hasFanClubBadge;
    const registryHit = fanClubRegistry ? fanClubRegistry.has(streamUserId, identity, regOpts) : false;
    let teamLevel = extractTeamMemberLevel(chatUser, data);
    if (fanClubRegistry) {
        teamLevel = Math.max(teamLevel, fanClubRegistry.getLevel(streamUserId, identity, regOpts) || 0);
    }
    if ((hasTeamBadge || registryHit) && teamLevel < 1) teamLevel = 1;
    const passed = hasTeamBadge || registryHit || teamLevel > 0;
    return { identity, hasTeamBadge, registryHit, teamLevel, passed };
}

function scalarGiftId(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'object') {
        if (value.low != null) return String(value.low);
        try {
            if (typeof value.toNumber === 'function') {
                const n = value.toNumber();
                if (Number.isFinite(n)) return String(n);
            }
        } catch { /* ignore */ }
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

function extractTotalLikeCount(data) {
    if (!data || typeof data !== 'object') return 0;
    const n = readGiftNumber(data, 'totalLikeCount', 'totalLike', 'totalLikes', 'likeCountTotal');
    if (n != null && n > 0) return n;
    const nested = data.common || data.like || null;
    if (nested && typeof nested === 'object') {
        const n2 = readGiftNumber(nested, 'totalLikeCount', 'totalLike', 'totalLikes');
        if (n2 != null && n2 > 0) return n2;
    }
    return 0;
}

function readGiftNumber(obj, ...keys) {
    for (const key of keys) {
        const v = obj == null ? undefined : (typeof obj === 'object' ? readProp(obj, key) : undefined);
        if (v == null || v === '') continue;
        if (typeof v === 'object') {
            try {
                if (typeof v.toNumber === 'function') {
                    const n = v.toNumber();
                    if (Number.isFinite(n)) return n;
                }
            } catch { /* ignore */ }
            if (v.low != null) {
                const n = Number(v.low);
                if (Number.isFinite(n)) return n;
            }
        }
        const n = Number(v);
        if (Number.isFinite(n)) return n;
        const parsed = parseInt(String(v), 10);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function coerceGiftRepeatEnd(value, comboHint) {
    if (value === false || value === 0 || value === '0') return false;
    if (value === true || value === 1 || value === '1') return true;
    if (value != null && typeof value === 'object') {
        try {
            if (typeof value.toNumber === 'function') return value.toNumber() !== 0;
        } catch { /* ignore */ }
        if (value.low != null) return Number(value.low) !== 0;
    }
    if (value != null && value !== '') {
        const n = Number(value);
        if (Number.isFinite(n)) return n !== 0;
    }
    // Missing flag: combo gifts stay open so debounce can merge; one-shots complete.
    return !comboHint;
}

function pickGiftName(giftObj, data) {
    return String(
        readProp(data, 'giftName') || readProp(data, 'gift_name')
        || readProp(giftObj, 'name') || readProp(giftObj, 'giftName')
        || readProp(giftObj, 'gift_name') || readProp(giftObj, 'describe')
        || ''
    ).trim();
}

/**
 * Flatten tiktok-live-connector v2.4+ WebcastGiftMessage (protobuf) into a plain payload.
 */
function normalizeWebcastGift(data) {
    if (!data || typeof data !== 'object') {
        return {
            uniqueId: '', nickname: '', userId: '', avatar: '',
            giftId: '', giftName: '', diamondCount: 0, repeatCount: 1,
            totalCoins: 0, giftType: 0, repeatEnd: true, combo: false, msgId: ''
        };
    }
    const giftObj = readProp(data, 'gift')
        || readProp(data, 'giftDetails')
        || readProp(data, 'extendedGiftInfo')
        || {};
    const identity = extractChatIdentity(readProp(data, 'user') || data.user, data);
    const giftId = scalarGiftId(
        readProp(data, 'giftId') || readProp(data, 'gift_id')
        || readProp(giftObj, 'id') || readProp(giftObj, 'giftId') || readProp(giftObj, 'gift_id')
    );
    const giftName = pickGiftName(giftObj, data);
    const repeatCount = Math.max(
        1,
        readGiftNumber(data, 'repeatCount', 'comboCount', 'groupCount', 'repeat_count')
        || readGiftNumber(giftObj, 'repeatCount')
        || 1
    );
    const diamondCount = Math.max(
        0,
        readGiftNumber(giftObj, 'diamondCount', 'diamond_count', 'cost', 'diamond_count')
        || readGiftNumber(data, 'diamondCount', 'diamond_count', 'diamondCount')
        || readGiftNumber(readProp(data, 'extendedGiftInfo'), 'diamond_count', 'diamondCount', 'cost')
        || 0
    );
    const nestedType = readGiftNumber(giftObj, 'type', 'giftType');
    const combo = !!(
        readProp(giftObj, 'combo') || readProp(giftObj, 'isCombo')
        || nestedType === 1
        || readGiftNumber(data, 'giftType') === 1
    );
    const repeatEnd = coerceGiftRepeatEnd(
        readProp(data, 'repeatEnd') != null ? readProp(data, 'repeatEnd') : data.repeatEnd,
        combo || repeatCount > 1
    );
    const giftType = combo || repeatEnd === false || repeatCount > 1
        ? 1
        : (readGiftNumber(data, 'giftType') != null
            ? readGiftNumber(data, 'giftType')
            : (nestedType != null ? nestedType : 0));
    const common = readProp(data, 'common') || {};
    const msgId = scalarGiftId(
        readProp(data, 'msgId') || readProp(data, 'messageId') || readProp(data, 'logId')
        || readProp(common, 'msgId') || readProp(common, 'messageId')
    );
    return {
        uniqueId: identity.uniqueId || '',
        nickname: identity.nickname || identity.uniqueId || '',
        userId: identity.userId || '',
        avatar: identity.avatar || '',
        giftId,
        giftName,
        diamondCount,
        repeatCount,
        totalCoins: diamondCount * repeatCount,
        giftType,
        repeatEnd,
        combo,
        msgId
    };
}

module.exports = {
    HEART_ME_GIFT_IDS,
    normalizeTikTokId,
    extractChatIdentity,
    chatUserHasFanClubBadge,
    extractTeamMemberLevel,
    extractSubscriberFlag,
    extractSubscriberLevel,
    extractFollowerFlag,
    isHeartMeGift,
    isTeamMemberBadge,
    createFanClubRegistry,
    buildChatPayload,
    analyzeChatTeamStatus,
    collectUserBadges,
    normalizeWebcastGift,
    coerceGiftRepeatEnd,
    scalarGiftId,
    extractTotalLikeCount
};
