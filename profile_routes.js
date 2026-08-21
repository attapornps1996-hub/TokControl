'use strict';

const VISIBILITY = new Set(['public', 'friends', 'private']);
const DM_PERMISSION = new Set(['public', 'friends', 'private']);
const RELATIONSHIP = Object.freeze({
    NONE: 'NONE',
    REQUEST_SENT: 'REQUEST_SENT',
    REQUEST_RECEIVED: 'REQUEST_RECEIVED',
    FRIENDS: 'FRIENDS',
    BLOCKED: 'BLOCKED'
});

function cleanText(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanUrl(value, max = 2000) {
    const url = cleanText(value, max);
    if (!url) return '';
    // relative asset paths from /api/assets/upload
    if (/^\/api\/assets\/[a-f0-9]+$/i.test(url)) return url;
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        return parsed.toString();
    } catch (_) {
        // allow protocol-relative or www. without scheme by normalizing
        if (/^(www\.|tiktok\.com|discord\.|youtube\.|youtu\.be|twitch\.tv)/i.test(url)) {
            try {
                return new URL(`https://${url.replace(/^\/\//, '')}`).toString();
            } catch (__) {
                return null;
            }
        }
        return null;
    }
}

function isProUser(user) {
    if (!(user?.isPro === 1 || user?.isPro === true)) return false;
    return !user.proExpireAt || Date.parse(user.proExpireAt) > Date.now();
}

function visibilityAllows(value, own, friends) {
    if (own) return true;
    if (value === 'public') return true;
    return value === 'friends' && friends;
}

function safeBaseUser(user) {
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatarUrl: user.avatarUrl || '',
        isPro: isProUser(user),
        role: user.role || (isProUser(user) ? 'pro' : 'free'),
        createdAt: user.createdAt || null
    };
}

async function relationshipState(db, viewer, target) {
    if (String(viewer.id) === String(target.id)) return RELATIONSHIP.NONE;
    if (await db.getBlockBetween(viewer.id, target.id)) return RELATIONSHIP.BLOCKED;
    if (await db.areProfileFriends(viewer.id, target.id)) return RELATIONSHIP.FRIENDS;
    const pending = await db.getPendingFriendRequest(viewer.id, target.id);
    if (!pending) return RELATIONSHIP.NONE;
    return String(pending.fromUserId) === String(viewer.id)
        ? RELATIONSHIP.REQUEST_SENT
        : RELATIONSHIP.REQUEST_RECEIVED;
}

/**
 * Privacy-safe public profile builder. This is an explicit allowlist: it never
 * spreads a users document and therefore cannot expose auth/OAuth/token fields.
 */
async function getPublicProfile(db, target, viewer, getPresence = null) {
    const own = String(target.id) === String(viewer.id);
    const block = own ? null : await db.getBlockBetween(viewer.id, target.id);
    const friends = own ? false : await db.areProfileFriends(viewer.id, target.id);
    const privacy = await db.getProfilePrivacy(target.id);
    const relationship = own
        ? RELATIONSHIP.NONE
        : block
            ? RELATIONSHIP.BLOCKED
            : friends
                ? RELATIONSHIP.FRIENDS
                : await relationshipState(db, viewer, target);

    if (block || !visibilityAllows(privacy.profileVisibility, own, friends)) {
        return {
            visible: false,
            relationship,
            user: safeBaseUser(target)
        };
    }

    const profile = await db.getSocialProfile(target.id);
    const payload = {
        visible: true,
        relationship,
        user: safeBaseUser(target),
        profile: {
            coverUrl: profile.coverUrl || '',
            bio: profile.bio || '',
            level: Number(profile.level) || 1,
            xp: Number(profile.xp) || 0,
            rank: profile.rank || '',
            lastActive: profile.lastActive || null,
            country: profile.country || '',
            province: profile.province || '',
            languages: profile.languages || '',
            contentTypes: profile.contentTypes || '',
            streamGear: profile.streamGear || '',
            counters: {
                followers: Number(profile.followersCount) || 0,
                following: Number(profile.followingCount) || 0,
                friends: Number(profile.friendsCount) || 0,
                achievements: Number(profile.achievementsCount) || 0,
                streams: Number(profile.streamsCount) || 0
            }
        },
        visibility: {
            social: visibilityAllows(privacy.socialVisibility, own, friends),
            achievements: visibilityAllows(privacy.achievementsVisibility, own, friends),
            streams: visibilityAllows(privacy.streamsVisibility, own, friends),
            activity: visibilityAllows(privacy.activityVisibility, own, friends)
        }
    };
    if (typeof getPresence === 'function') {
        const presence = await getPresence(target);
        payload.presence = {
            online: !!presence?.online,
            isLive: !!presence?.isLive,
            tiktokUsername: cleanText(presence?.tiktokUsername, 64)
        };
    }
    if (payload.visibility.social) {
        const connections = await db.listSocialConnections(target.id);
        payload.connections = connections.map((item) => ({
            platform: item.platform,
            handle: item.handle || '',
            url: item.url || ''
        }));
    }
    if (own) payload.privacy = privacy;
    return payload;
}

function registerProfileRoutes(app, options) {
    const { db, getAuthUser, getPresence, rateLimit } = options;
    if (!app || !db || typeof getAuthUser !== 'function') {
        throw new Error('registerProfileRoutes requires app, db, and getAuthUser');
    }

    const auth = async (req, res, next) => {
        try {
            const user = await getAuthUser(req);
            if (!user) return res.status(401).json({ error: 'Authentication required' });
            req.profileUser = user;
            await db.updateSocialProfile(user.id, { lastActive: new Date().toISOString() })
                .catch((error) => console.warn('[profile lastActive]', error.message));
            next();
        } catch (_) {
            res.status(401).json({ error: 'Invalid token' });
        }
    };
    const limited = (scope) => typeof rateLimit === 'function' ? rateLimit(scope) : (_req, _res, next) => next();

    async function targetByUsername(req, res) {
        const username = cleanText(req.params.username, 64);
        if (!username) {
            res.status(400).json({ error: 'Username is required' });
            return null;
        }
        const target = await db.getUser(username);
        if (!target) {
            res.status(404).json({ error: 'User not found' });
            return null;
        }
        return target;
    }

    async function visibilityContext(viewer, target, field) {
        const own = String(viewer.id) === String(target.id);
        const blocked = own ? null : await db.getBlockBetween(viewer.id, target.id);
        if (blocked) return { allowed: false, blocked: true };
        const friends = own ? false : await db.areProfileFriends(viewer.id, target.id);
        const privacy = await db.getProfilePrivacy(target.id);
        return { allowed: visibilityAllows(privacy[field], own, friends), privacy, friends, own };
    }

    app.get('/api/profile/extended', auth, async (req, res) => {
        try {
            const profile = await getPublicProfile(db, req.profileUser, req.profileUser, getPresence);
            res.json({ success: true, ...profile });
        } catch (error) {
            console.error('[profile extended GET]', error);
            res.status(500).json({ error: 'Unable to load profile' });
        }
    });

    app.patch('/api/profile/extended', auth, async (req, res) => {
        try {
            const body = req.body || {};
            const patch = {};
            if (body.coverUrl !== undefined) {
                const value = cleanUrl(body.coverUrl);
                if (value === null) return res.status(400).json({ error: 'coverUrl must be an HTTP(S) URL' });
                patch.coverUrl = value;
            }
            if (body.bio !== undefined) patch.bio = cleanText(body.bio, 500);
            if (body.rank !== undefined) patch.rank = cleanText(body.rank, 40);
            if (body.country !== undefined) patch.country = cleanText(body.country, 80);
            if (body.province !== undefined) patch.province = cleanText(body.province, 80);
            if (body.languages !== undefined) patch.languages = cleanText(body.languages, 120);
            if (body.contentTypes !== undefined) patch.contentTypes = cleanText(body.contentTypes, 120);
            if (body.streamGear !== undefined) patch.streamGear = cleanText(body.streamGear, 160);
            // level/xp are server-managed — ignore client attempts to self-inflate
            if (!Object.keys(patch).length) return res.status(400).json({ error: 'No supported fields supplied' });
            patch.lastActive = new Date().toISOString();
            await db.updateSocialProfile(req.profileUser.id, patch);
            const profile = await getPublicProfile(db, req.profileUser, req.profileUser, getPresence);
            res.json({ success: true, ...profile });
        } catch (error) {
            console.error('[profile extended PATCH]', error);
            res.status(500).json({ error: 'Unable to update profile' });
        }
    });

    const publicLookup = async (req, res) => {
        try {
            const target = await targetByUsername(req, res);
            if (!target) return;
            const profile = await getPublicProfile(db, target, req.profileUser, getPresence);
            if (!profile.visible) {
                return res.status(profile.relationship === RELATIONSHIP.BLOCKED ? 403 : 404).json({
                    error: profile.relationship === RELATIONSHIP.BLOCKED ? 'Profile unavailable' : 'Profile is private',
                    relationship: profile.relationship
                });
            }
            res.json({ success: true, ...profile });
        } catch (error) {
            console.error('[public profile GET]', error);
            res.status(500).json({ error: 'Unable to load profile' });
        }
    };
    app.get('/api/profiles/:username', auth, publicLookup);
    app.get('/api/profile/public/:username', auth, publicLookup);

    app.get('/api/profile/search/users', auth, async (req, res) => {
        try {
            const query = cleanText(req.query.q, 64);
            if (query.length < 2) return res.status(400).json({ error: 'Search requires at least 2 characters' });
            const candidates = await db.searchProfileUsers(query, req.query.limit);
            const list = [];
            for (const candidate of candidates) {
                if (String(candidate.id) === String(req.profileUser.id)) continue;
                const privacy = await db.getProfilePrivacy(candidate.id);
                if (privacy.profileVisibility !== 'public') continue;
                if (await db.getBlockBetween(req.profileUser.id, candidate.id)) continue;
                list.push(safeBaseUser(candidate));
            }
            res.json({ success: true, list });
        } catch (error) {
            console.error('[profile search]', error);
            res.status(500).json({ error: 'Unable to search users' });
        }
    });

    app.get('/api/profile/privacy', auth, async (req, res) => {
        try {
            res.json({ success: true, privacy: await db.getProfilePrivacy(req.profileUser.id) });
        } catch (error) {
            res.status(500).json({ error: 'Unable to load privacy settings' });
        }
    });
    app.put('/api/profile/privacy', auth, async (req, res) => {
        try {
            const patch = {};
            ['profileVisibility', 'socialVisibility', 'achievementsVisibility', 'streamsVisibility', 'activityVisibility']
                .forEach((key) => {
                    if (req.body?.[key] !== undefined && VISIBILITY.has(req.body[key])) patch[key] = req.body[key];
                });
            if (req.body?.dmPermission !== undefined && DM_PERMISSION.has(req.body.dmPermission)) {
                patch.dmPermission = req.body.dmPermission;
            }
            const supplied = Object.keys(req.body || {}).filter((key) => (
                key === 'dmPermission' || key.endsWith('Visibility')
            ));
            if (!Object.keys(patch).length || supplied.length !== Object.keys(patch).length) {
                return res.status(400).json({ error: 'Invalid privacy settings' });
            }
            res.json({ success: true, privacy: await db.updateProfilePrivacy(req.profileUser.id, patch) });
        } catch (error) {
            res.status(500).json({ error: 'Unable to update privacy settings' });
        }
    });

    app.get('/api/profile/connections', auth, async (req, res) => {
        try {
            res.json({ success: true, list: await db.listSocialConnections(req.profileUser.id) });
        } catch (error) {
            res.status(500).json({ error: 'Unable to load connections' });
        }
    });
    app.put('/api/profile/connections/:platform', auth, async (req, res) => {
        try {
            const platform = cleanText(req.params.platform, 30).toLowerCase();
            if (!/^[a-z0-9_-]{2,30}$/.test(platform)) return res.status(400).json({ error: 'Invalid platform' });
            const url = cleanUrl(req.body?.url);
            if (url === null) return res.status(400).json({ error: 'url must be an HTTP(S) URL' });
            const connection = await db.upsertSocialConnection(req.profileUser.id, {
                platform, handle: cleanText(req.body?.handle, 100), url
            });
            res.json({ success: true, connection });
        } catch (error) {
            res.status(500).json({ error: 'Unable to save connection' });
        }
    });
    app.delete('/api/profile/connections/:platform', auth, async (req, res) => {
        try {
            const removed = await db.deleteSocialConnection(req.profileUser.id, cleanText(req.params.platform, 30).toLowerCase());
            res.status(removed ? 200 : 404).json(removed ? { success: true } : { error: 'Connection not found' });
        } catch (error) {
            res.status(500).json({ error: 'Unable to remove connection' });
        }
    });

    app.get('/api/profile/relationship/:username', auth, async (req, res) => {
        try {
            const target = await targetByUsername(req, res);
            if (!target) return;
            const state = await relationshipState(db, req.profileUser, target);
            const mutualFriends = state === RELATIONSHIP.BLOCKED
                ? []
                : await db.listMutualFriends(req.profileUser.id, target.id, 20);
            res.json({ success: true, state, mutualCount: mutualFriends.length, mutualFriends });
        } catch (error) {
            res.status(500).json({ error: 'Unable to load relationship' });
        }
    });

    app.get('/api/profile/blocks', auth, async (req, res) => {
        try {
            res.json({ success: true, list: await db.listUserBlocks(req.profileUser.id) });
        } catch (error) {
            res.status(500).json({ error: 'Unable to load blocked users' });
        }
    });
    app.post('/api/profile/block/:username', auth, async (req, res) => {
        try {
            const target = await targetByUsername(req, res);
            if (!target) return;
            if (String(target.id) === String(req.profileUser.id)) return res.status(400).json({ error: 'Cannot block yourself' });
            await db.blockUser(req.profileUser.id, target.id);
            res.json({ success: true, state: RELATIONSHIP.BLOCKED });
        } catch (error) {
            console.error('[profile block]', error);
            res.status(500).json({ error: 'Unable to block user' });
        }
    });
    app.delete('/api/profile/block/:username', auth, async (req, res) => {
        try {
            const target = await targetByUsername(req, res);
            if (!target) return;
            const removed = await db.unblockUser(req.profileUser.id, target.id);
            res.status(removed ? 200 : 404).json(removed ? { success: true, state: RELATIONSHIP.NONE } : { error: 'User is not blocked' });
        } catch (error) {
            res.status(500).json({ error: 'Unable to unblock user' });
        }
    });

    app.post('/api/profile/report-user', auth, limited('profile-report'), async (req, res) => {
        try {
            const target = await db.getUser(cleanText(req.body?.username, 64));
            if (!target) return res.status(404).json({ error: 'User not found' });
            if (String(target.id) === String(req.profileUser.id)) return res.status(400).json({ error: 'Cannot report yourself' });
            const reason = cleanText(req.body?.reason, 80);
            const details = cleanText(req.body?.details, 2000);
            if (reason.length < 3) return res.status(400).json({ error: 'A report reason is required' });
            const report = await db.createUserReport({
                reporterId: req.profileUser.id, reportedId: target.id, reason, details
            });
            res.status(201).json({ success: true, reportId: report.id });
        } catch (error) {
            console.error('[profile report]', error);
            res.status(500).json({ error: 'Unable to submit report' });
        }
    });

    async function listVisible(req, res, field, loader, key) {
        try {
            const target = await targetByUsername(req, res);
            if (!target) return;
            const context = await visibilityContext(req.profileUser, target, field);
            if (!context.allowed) return res.status(context.blocked ? 403 : 404).json({ error: 'This section is private' });
            const list = await loader(target.id, req.query.limit, req.query.before || null);
            res.json({ success: true, [key]: list });
        } catch (error) {
            console.error(`[profile ${key}]`, error);
            res.status(500).json({ error: `Unable to load ${key}` });
        }
    }
    app.get('/api/profile/:username/achievements', auth, (req, res) => (
        listVisible(
            req,
            res,
            'achievementsVisibility',
            (typeof db.listProfileAchievementCatalog === 'function'
                ? db.listProfileAchievementCatalog.bind(db)
                : db.listUserAchievements.bind(db)),
            'achievements'
        )
    ));
    app.get('/api/profile/:username/activity', auth, (req, res) => (
        listVisible(req, res, 'activityVisibility', db.listProfileActivity.bind(db), 'activity')
    ));
    app.get('/api/profile/:username/streams', auth, (req, res) => (
        listVisible(req, res, 'streamsVisibility', db.listStreamSummaries.bind(db), 'streams')
    ));

    async function assertConversationAccess(req, res) {
        const conversation = await db.getDmConversation(req.params.id);
        if (!conversation) {
            res.status(404).json({ error: 'Conversation not found' });
            return null;
        }
        const uid = String(req.profileUser.id);
        if (String(conversation.participantA) !== uid && String(conversation.participantB) !== uid) {
            res.status(403).json({ error: 'Conversation access denied' });
            return null;
        }
        const otherId = String(conversation.participantA) === uid
            ? conversation.participantB
            : conversation.participantA;
        if (await db.getBlockBetween(uid, otherId)) {
            res.status(403).json({ error: 'Messaging is unavailable' });
            return null;
        }
        return { conversation, otherId };
    }

    app.get('/api/dm/conversations', auth, async (req, res) => {
        try {
            res.json({ success: true, conversations: await db.listDmConversations(req.profileUser.id, req.query.limit) });
        } catch (error) {
            res.status(500).json({ error: 'Unable to load conversations' });
        }
    });
    app.get('/api/dm/conversations/:id/messages', auth, async (req, res) => {
        try {
            if (!(await assertConversationAccess(req, res))) return;
            const messages = await db.listDmMessages(req.params.id, req.query.limit, req.query.before || null);
            res.json({ success: true, messages });
        } catch (error) {
            res.status(500).json({ error: 'Unable to load messages' });
        }
    });
    app.post('/api/dm/send', auth, limited('profile-dm'), async (req, res) => {
        try {
            const target = await db.getUser(cleanText(req.body?.username, 64));
            if (!target) return res.status(404).json({ error: 'User not found' });
            if (String(target.id) === String(req.profileUser.id)) return res.status(400).json({ error: 'Cannot message yourself' });
            const body = cleanText(req.body?.message, 2000);
            if (!body) return res.status(400).json({ error: 'Message is required' });
            if (await db.getBlockBetween(req.profileUser.id, target.id)) {
                return res.status(403).json({ error: 'Messaging is unavailable' });
            }
            const privacy = await db.getProfilePrivacy(target.id);
            const friends = await db.areProfileFriends(req.profileUser.id, target.id);
            if (privacy.dmPermission === 'private' || (privacy.dmPermission === 'friends' && !friends)) {
                return res.status(403).json({ error: 'This user only accepts permitted messages' });
            }
            const conversation = await db.ensureDmConversation(req.profileUser.id, target.id);
            const message = await db.createDmMessage(conversation.id, req.profileUser.id, body);
            res.status(201).json({ success: true, conversationId: conversation.id, message });
        } catch (error) {
            console.error('[dm send]', error);
            res.status(500).json({ error: 'Unable to send message' });
        }
    });
    app.post('/api/dm/conversations/:id/messages', auth, limited('profile-dm'), async (req, res) => {
        try {
            if (!(await assertConversationAccess(req, res))) return;
            const body = cleanText(req.body?.message, 2000);
            if (!body) return res.status(400).json({ error: 'Message is required' });
            const message = await db.createDmMessage(req.params.id, req.profileUser.id, body);
            res.status(201).json({ success: true, message });
        } catch (error) {
            res.status(500).json({ error: 'Unable to send message' });
        }
    });
    app.post('/api/dm/conversations/:id/read', auth, async (req, res) => {
        try {
            if (!(await assertConversationAccess(req, res))) return;
            const marked = await db.markDmRead(req.params.id, req.profileUser.id);
            res.json({ success: true, marked });
        } catch (error) {
            res.status(500).json({ error: 'Unable to mark messages read' });
        }
    });
}

module.exports = { registerProfileRoutes, getPublicProfile, RELATIONSHIP };
