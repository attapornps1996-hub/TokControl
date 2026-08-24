/**
 * Extract TikTok streamer profile fields from roomInfo / owner payloads.
 */
function firstHttpUrl(val, depth) {
    if (val == null || (depth || 0) > 4) return '';
    if (typeof val === 'string') {
        const s = val.trim().replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
        return /^https?:\/\//i.test(s) ? s : '';
    }
    if (Array.isArray(val)) {
        for (const item of val) {
            const found = firstHttpUrl(item, (depth || 0) + 1);
            if (found) return found;
        }
        return '';
    }
    if (typeof val === 'object') {
        return firstHttpUrl(
            val.url_list || val.urlList || val.urls || val.url || val.uri || val.src,
            (depth || 0) + 1
        );
    }
    return '';
}

function pickAvatar(owner) {
    if (!owner || typeof owner !== 'object') return '';
    const candidates = [
        owner.avatar_larger,
        owner.avatarLarger,
        owner.avatar_large,
        owner.avatarLarge,
        owner.avatar_medium,
        owner.avatarMedium,
        owner.avatar_thumb,
        owner.avatarThumb,
        owner.profilePictureUrl,
        owner.profile_picture_url,
        owner.profilePicture,
        owner.avatar_url,
        owner.avatarUrl,
        owner.avatar,
        owner.cover,
        owner.coverUrl
    ];
    for (const c of candidates) {
        const url = firstHttpUrl(c);
        if (url) return url;
    }
    return '';
}

function extractTikTokOwnerProfile(roomInfo, fallbackUsername = '') {
    const root = roomInfo?.data && typeof roomInfo.data === 'object' ? roomInfo.data : (roomInfo || {});
    const owner = root.owner
        || root.user
        || root.anchor
        || root.owner_user_info
        || root.ownerUserInfo
        || root.anchor_info
        || root.user_info
        || {};
    const follow = owner.follow_info || owner.followInfo || {};
    const username = String(
        owner.display_id || owner.unique_id || owner.uniqueId || owner.displayId || fallbackUsername || ''
    ).replace(/^@+/, '').trim();
    const displayName = String(owner.nickname || owner.nickName || username || 'Streamer').trim();
    const followerCount = parseInt(
        follow.follower_count ?? follow.followerCount ?? owner.follower_count ?? owner.followerCount ?? 0,
        10
    ) || 0;
    const followingCount = parseInt(
        follow.following_count ?? follow.followingCount ?? owner.following_count ?? owner.followingCount ?? 0,
        10
    ) || 0;
    return {
        username,
        displayName,
        avatarUrl: pickAvatar(owner) || pickAvatar(root),
        followerCount,
        followingCount
    };
}

function isPlaceholderAvatar(url) {
    return !url || /dicebear\.com/i.test(String(url));
}

async function fillMissingAvatar(profile, username) {
    const p = profile && typeof profile === 'object' ? profile : { username };
    if (!isPlaceholderAvatar(p.avatarUrl)) return p;
    if (isPlaceholderAvatar(p.avatarUrl)) p.avatarUrl = '';
    try {
        const { scrapeTikTokPublicProfile } = require('./tiktok_room_resolve');
        const scraped = await scrapeTikTokPublicProfile(username || p.username);
        if (scraped.avatarUrl) p.avatarUrl = scraped.avatarUrl;
        if (scraped.displayName && (!p.displayName || p.displayName === username || p.displayName === p.username)) {
            p.displayName = scraped.displayName;
        }
    } catch (e) { /* ignore scrape errors */ }
    return p;
}

async function resolveStreamerProfile(username, roomInfo, existingAvatar, connection) {
    const uniqueId = String(username || '').replace(/^@+/, '').trim();
    let ri = roomInfo || null;
    let profile = extractTikTokOwnerProfile(ri, uniqueId);
    if (isPlaceholderAvatar(profile.avatarUrl) && connection && typeof connection.getRoomInfo === 'function') {
        try {
            ri = await connection.getRoomInfo();
            profile = extractTikTokOwnerProfile(ri, uniqueId);
        } catch (e) { /* scrape next */ }
    }
    const existing = String(existingAvatar || '').trim();
    if (isPlaceholderAvatar(profile.avatarUrl) && existing && !isPlaceholderAvatar(existing)) {
        profile.avatarUrl = existing;
    }
    if (!profile.username) profile.username = uniqueId;
    await fillMissingAvatar(profile, uniqueId);
    return profile;
}

module.exports = {
    extractTikTokOwnerProfile,
    pickAvatar,
    firstHttpUrl,
    fillMissingAvatar,
    resolveStreamerProfile,
    isPlaceholderAvatar
};
