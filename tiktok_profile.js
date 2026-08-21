/**
 * Extract TikTok streamer profile fields from roomInfo / owner payloads.
 */
function pickAvatar(owner) {
    if (!owner || typeof owner !== 'object') return '';
    const candidates = [
        owner.avatar_large?.url_list?.[0],
        owner.avatar_medium?.url_list?.[0],
        owner.avatar_thumb?.url_list?.[0],
        owner.avatarLarge,
        owner.avatarMedium,
        owner.avatarThumb,
        owner.profilePictureUrl,
        owner.avatar
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c) return c;
        if (c && typeof c === 'object' && Array.isArray(c.url_list) && c.url_list[0]) return c.url_list[0];
    }
    return '';
}

function extractTikTokOwnerProfile(roomInfo, fallbackUsername = '') {
    const root = roomInfo?.data && typeof roomInfo.data === 'object' ? roomInfo.data : (roomInfo || {});
    const owner = root.owner || root.user || root.anchor || {};
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
        avatarUrl: pickAvatar(owner),
        followerCount,
        followingCount
    };
}

module.exports = {
    extractTikTokOwnerProfile,
    pickAvatar
};
