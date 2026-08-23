/**
 * TikTok Live bridge for Gallery Overlays (Goal / Last X / Effects / Showcase)
 */
(function (global) {
    const GIFTER_LEVEL_THRESHOLDS = [0, 100, 500, 1000, 5000, 10000];

    const state = {
        likes: 0,
        follows: 0,
        shares: 0,
        coins: 0,
        subscribers: 0,
        heartMe: 0,
        joins: 0,
        viewerCount: 0,
        connected: false,
        gifterMap: {},
        giftMap: {},
        likerMap: {},
        giftFeed: [],
        chatFeed: [],
        emoteFeed: [],
        lastFollower: null,
        lastGifter: null,
        lastSubscriber: null,
        lastSharer: null,
        lastLiker: null,
        subLevels: {},
        gifterLevels: {},
        pendingLevelUps: []
    };

    let bound = false;
    let socketRef = null;
    let configRef = null;
    let listeners = [];
    const recentGiftDedup = new Set();
    const currentOverlayId = (() => {
        try {
            return new URLSearchParams(global.location?.search || '').get('ovId') || '';
        } catch (_) {
            return '';
        }
    })();

    function acceptsScopedTest(data) {
        const target = String(data?.testOverlayId || '').trim();
        return !data?.isTest || !target || target === currentOverlayId;
    }

    function giftEventDedupKey(gift) {
        if (!gift) return '';
        return `${gift.uniqueId || ''}:${gift.giftId || gift.giftName || ''}:${gift.repeatCount || 1}:${gift.repeatEnd === false ? 'm' : 'e'}`;
    }

    function shouldProcessGiftEvent(gift) {
        if (!gift) return false;
        const giftType = gift.giftType != null ? Number(gift.giftType) : 0;
        if (giftType === 1 && gift.repeatEnd === false) return false;
        const key = giftEventDedupKey(gift);
        if (!key) return false;
        if (recentGiftDedup.has(key)) return false;
        recentGiftDedup.add(key);
        setTimeout(() => recentGiftDedup.delete(key), 3500);
        return true;
    }

    const testTracker = {
        gifterKeys: new Set(),
        likerKeys: new Set(),
        giftCoins: {},
        coins: 0,
        likes: 0,
        follows: 0,
        shares: 0,
        joins: 0,
        heartMe: 0,
        subscribers: 0,
        viewerCountBefore: null
    };

    function isTestPayload(d) {
        if (!d) return false;
        if (d.isTest) return true;
        const uid = String(d.uniqueId || d.nickname || '');
        return uid.startsWith('Test_User') || uid === 'Test_User';
    }

    function avatarOf(d) {
        return d?.avatar || d?.profilePictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(d?.uniqueId || d?.nickname || 'viewer')}&backgroundColor=bc13fe`;
    }

    function nameOf(d) {
        return d?.nickname || d?.uniqueId || 'Viewer';
    }

    function gifterLevelFromCoins(coins) {
        let lv = 1;
        for (let i = GIFTER_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
            if (coins >= GIFTER_LEVEL_THRESHOLDS[i]) { lv = i + 1; break; }
        }
        return Math.min(5, lv);
    }

    function giftKeyOf(gift) {
        const id = gift?.giftId;
        if (id != null && String(id).trim() !== '') return 'id:' + String(id);
        return 'name:' + String(gift?.giftName || 'gift').toLowerCase().trim();
    }

    function giftImageOf(gift) {
            const candidates = [
                gift?.giftImage, gift?.imageUrl, gift?.giftPictureUrl, gift?.giftPictureUrl,
                gift?.pictureUrl, gift?.giftIcon, gift?.icon
            ];
        for (const raw of candidates) {
            if (!raw || typeof raw !== 'string') continue;
            const url = raw.trim();
            if (/^(https?:|data:image\/|\/\/)/i.test(url)) {
                return url.startsWith('//') ? 'https:' + url : url;
            }
        }
        return '';
    }

    function bumpGift(gift) {
        const key = giftKeyOf(gift);
        const addCoins = gift.totalCoins || (gift.diamondCount || 0) * (gift.repeatCount || 1) || 0;
        const unit = gift.diamondCount || (gift.repeatCount ? Math.round(addCoins / (gift.repeatCount || 1)) : addCoins) || 0;
        const prev = state.giftMap[key] || {
            giftId: gift.giftId,
            giftName: gift.giftName || 'Gift',
            giftIcon: gift.giftIcon || '🎁',
            giftImage: giftImageOf(gift),
            coins: 0,
            count: 0,
            unitCoins: unit
        };
        prev.coins += addCoins;
        prev.count += gift.repeatCount || 1;
        prev.unitCoins = Math.max(prev.unitCoins || 0, unit);
        prev.giftName = gift.giftName || prev.giftName;
        if (gift.giftIcon && !/^(https?:|data:|\/\/)/i.test(String(gift.giftIcon).trim())) {
            prev.giftIcon = gift.giftIcon;
        }
        const img = giftImageOf(gift);
        if (img) prev.giftImage = img;
        state.giftMap[key] = prev;
        return prev;
    }

    function bumpGifter(gift) {
        const uid = gift.uniqueId || gift.nickname || 'unknown';
        const prev = state.gifterMap[uid] || { uniqueId: uid, nickname: nameOf(gift), avatar: avatarOf(gift), coins: 0, gifts: 0 };
        const add = gift.totalCoins || (gift.diamondCount || 0) * (gift.repeatCount || 1) || 0;
        prev.coins += add;
        prev.gifts += gift.repeatCount || 1;
        prev.nickname = nameOf(gift);
        prev.avatar = avatarOf(gift);
        state.gifterMap[uid] = prev;

        const oldLv = state.gifterLevels[uid] || 1;
        const newLv = gifterLevelFromCoins(prev.coins);
        state.gifterLevels[uid] = newLv;
        if (newLv > oldLv) {
            state.pendingLevelUps.push({
                type: 'gifter',
                uniqueId: uid,
                nickname: prev.nickname,
                avatar: prev.avatar,
                level: newLv,
                coins: prev.coins
            });
        }
        return prev;
    }

    function bumpLiker(data) {
        const uid = data.uniqueId || data.nickname || 'unknown';
        const add = parseInt(data.likeCount, 10) || 1;
        const prev = state.likerMap[uid] || { uniqueId: uid, nickname: nameOf(data), avatar: avatarOf(data), likes: 0 };
        prev.likes += add;
        prev.nickname = nameOf(data);
        prev.avatar = avatarOf(data);
        state.likerMap[uid] = prev;
        return prev;
    }

    function pushGiftFeed(gift) {
        state.giftFeed.unshift({
            uniqueId: gift.uniqueId,
            nickname: nameOf(gift),
            avatar: avatarOf(gift),
            giftName: gift.giftName || 'Gift',
            giftId: gift.giftId || '',
            giftIcon: gift.giftIcon || gift.giftImage || gift.imageUrl || '',
            giftImage: giftImageOf(gift),
            count: gift.repeatCount || 1,
            coins: gift.totalCoins || (gift.diamondCount || 0) * (gift.repeatCount || 1) || 0,
            isTest: !!gift.isTest
        });
        const max = 20;
        if (state.giftFeed.length > max) state.giftFeed.length = max;
    }

    function extractEmojis(text) {
        if (!text) return [];
        try {
            return [...String(text).matchAll(/\p{Extended_Pictographic}/gu)].map(m => m[0]);
        } catch (e) {
            return (String(text).match(/[\u{1F300}-\u{1FAFF}]/gu) || []);
        }
    }

    function handleGift(gift) {
        if (!gift) return;
        if (!acceptsScopedTest(gift)) return;
        if (!shouldProcessGiftEvent(gift)) return;
        const coins = gift.totalCoins || gift.coins || (gift.diamondCount || gift.diamondCount || 0) * (gift.repeatCount || gift.repeatCount || 1) || 0;
        if (isTestPayload(gift)) {
            testTracker.gifterKeys.add(gift.uniqueId || gift.nickname || 'unknown');
            testTracker.coins += coins;
        }
        state.coins += coins;
        const gifter = bumpGifter(gift);
        bumpGift(gift);
        if (isTestPayload(gift)) {
            const gKey = giftKeyOf(gift);
            testTracker.giftCoins[gKey] = (testTracker.giftCoins[gKey] || 0) + coins;
        }
        pushGiftFeed(gift);
        state.lastGifter = {
            uniqueId: gifter.uniqueId,
            nickname: gifter.nickname,
            avatar: gifter.avatar,
            giftName: gift.giftName,
            action: `sent ${gift.giftName || 'Gift'}!`
        };
        const gid = String(gift.giftId || '');
        const gname = String(gift.giftName || '').toLowerCase();
        if (gid === '7934' || gname.includes('heart me') || gname.includes('heartme')) {
            const hm = gift.repeatCount || 1;
            if (isTestPayload(gift)) testTracker.heartMe += hm;
            state.heartMe += hm;
        }
        notify({ type: 'gift', gift, gifter });
    }

    function handleLike(data) {
        if (!data) return;
        if (!acceptsScopedTest(data)) return;
        const add = parseInt(data.likeCount, 10) || 1;
        if (isTestPayload(data)) {
            testTracker.likerKeys.add(data.uniqueId || data.nickname || 'unknown');
            testTracker.likes += add;
        }
        state.likes += add;
        const liker = bumpLiker(data);
        state.lastLiker = {
            uniqueId: liker.uniqueId,
            nickname: liker.nickname,
            avatar: liker.avatar,
            action: 'liked!'
        };
        notify({ type: 'like', data, liker });
    }

    function handleFollow(data) {
        if (!data) return;
        if (!acceptsScopedTest(data)) return;
        if (isTestPayload(data)) testTracker.follows += 1;
        state.follows += 1;
        state.lastFollower = {
            uniqueId: data.uniqueId,
            nickname: nameOf(data),
            avatar: avatarOf(data),
            action: 'followed!'
        };
        notify({ type: 'follow', data });
    }

    function handleShare(data) {
        if (!data) return;
        if (!acceptsScopedTest(data)) return;
        if (isTestPayload(data)) testTracker.shares += 1;
        state.shares += 1;
        state.lastSharer = {
            uniqueId: data.uniqueId,
            nickname: nameOf(data),
            avatar: avatarOf(data),
            action: 'shared!'
        };
        notify({ type: 'share', data });
    }

    function handleSubscribe(data) {
        if (!data) return;
        if (!acceptsScopedTest(data)) return;
        if (isTestPayload(data)) testTracker.subscribers += 1;
        state.subscribers += 1;
        const uid = data.uniqueId || data.nickname || 'unknown';
        const oldLv = state.subLevels[uid] || 0;
        const newLv = Math.max(oldLv, parseInt(data.teamMemberLevel, 10) || 1);
        state.subLevels[uid] = newLv;
        if (newLv > oldLv && oldLv > 0) {
            state.pendingLevelUps.push({
                type: 'sub',
                uniqueId: uid,
                nickname: nameOf(data),
                avatar: avatarOf(data),
                level: newLv
            });
        }
        state.lastSubscriber = {
            uniqueId: uid,
            nickname: nameOf(data),
            avatar: avatarOf(data),
            action: 'subscribed!',
            level: newLv
        };
        notify({ type: 'subscribe', data, level: newLv });
    }

    function handleChat(data) {
        if (!data) return;
        if (!acceptsScopedTest(data)) return;
        const attachedEmotes = Array.isArray(data.emotes) ? data.emotes : [];
        state.chatFeed.unshift({
            uniqueId: data.uniqueId,
            nickname: nameOf(data),
            avatar: avatarOf(data),
            comment: data.comment || data.message || '',
            emotes: attachedEmotes
        });
        if (state.chatFeed.length > 30) state.chatFeed.length = 30;
        const emojis = extractEmojis(data.comment);
        emojis.forEach(e => {
            state.emoteFeed.unshift({ emoji: e, user: nameOf(data) });
        });
        attachedEmotes.forEach((em) => {
            if (!em?.imageUrl) return;
            state.emoteFeed.unshift({
                emoji: '',
                imageUrl: em.imageUrl,
                name: em.name || em.id,
                user: nameOf(data)
            });
        });
        if (state.emoteFeed.length > 48) state.emoteFeed.length = 48;
        const uid = data.uniqueId || data.nickname;
        if (uid && data.teamMemberLevel) {
            const oldLv = state.subLevels[uid] || 0;
            const newLv = parseInt(data.teamMemberLevel, 10) || 0;
            if (newLv > oldLv && oldLv > 0) {
                state.subLevels[uid] = newLv;
                state.pendingLevelUps.push({
                    type: 'sub',
                    uniqueId: uid,
                    nickname: nameOf(data),
                    avatar: avatarOf(data),
                    level: newLv
                });
                notify({ type: 'sub_levelup', data, level: newLv });
            } else if (newLv > 0) {
                state.subLevels[uid] = newLv;
            }
        }
        if (data.isSubscriber || data.isFanClub) {
            handleSubscribe(data);
        }
        notify({ type: 'chat', data, emojis, emotes: attachedEmotes });
    }

    function handleChannelEmote(data) {
        if (!data) return;
        const imageUrl = data.imageUrl || data.emoteImage || '';
        if (!imageUrl) {
            console.warn('[Overlay] tiktok_emote missing imageUrl', data);
            return;
        }
        state.emoteFeed.unshift({
            emoji: '',
            imageUrl,
            name: data.emoteName || data.emoteId || '',
            user: nameOf(data)
        });
        if (state.emoteFeed.length > 48) state.emoteFeed.length = 48;
        notify({ type: 'emote', data, imageUrl });
    }

    function handleJoin(data) {
        if (!data || !acceptsScopedTest(data)) return;
        if (isTestPayload(data)) testTracker.joins += 1;
        state.joins += 1;
        notify({ type: 'join', data });
    }

    function handleViewerCount(data) {
        if (!data || !acceptsScopedTest(data)) return;
        if (isTestPayload(data) && testTracker.viewerCountBefore === null) {
            testTracker.viewerCountBefore = state.viewerCount;
        }
        const n = parseInt(data?.viewerCount ?? data?.count, 10);
        if (!isNaN(n) && n >= 0) state.viewerCount = n;
        notify({ type: 'viewer_count', data, count: state.viewerCount });
    }

    function getTopLikers(limit) {
        return Object.values(state.likerMap)
            .sort((a, b) => b.likes - a.likes)
            .slice(0, limit || 5);
    }

    function notify(event) {
        listeners.forEach(fn => {
            try { fn(event, state); } catch (e) { console.warn('[OverlayGalleryTikTok]', e); }
        });
    }

    function getGoalProgress(goalType, settings) {
        const target = Math.max(1, parseInt(settings?.target, 10) || 100);
        let current = 0;
        switch (goalType) {
            case 'heartme': current = state.heartMe; break;
            case 'likes': current = state.likes; break;
            case 'shares': current = state.shares; break;
            case 'follows': current = state.follows; break;
            case 'viewers': current = state.joins; break;
            case 'coins': current = state.coins; break;
            case 'points': current = state.coins; break;
            case 'subscribers': current = state.subscribers; break;
            default: current = settings?.current || 0;
        }
        return { ...settings, target, current };
    }

    function getLastX(lastType, settings) {
        const map = {
            follower: state.lastFollower,
            gifter: state.lastGifter,
            subscriber: state.lastSubscriber,
            sharer: state.lastSharer,
            liker: state.lastLiker
        };
        const live = map[lastType];
        if (live) return { demoName: live.nickname, demoAction: live.action, avatar: live.avatar };
        return settings;
    }

    function getTopGifters(limit) {
        return Object.values(state.gifterMap)
            .sort((a, b) => b.coins - a.coins)
            .slice(0, limit || 5);
    }

    function getTopGifts(limit) {
        return Object.values(state.giftMap)
            .sort((a, b) => (b.coins - a.coins) || (b.unitCoins - a.unitCoins) || (b.count - a.count))
            .slice(0, limit || 5);
    }

    function consumeLevelUp() {
        return state.pendingLevelUps.shift() || null;
    }

    function bindSocket(socket, config) {
        if (!socket) return;
        // ผูกเสมอ — รวมโหมดพรีวิว/ทดสอบในโปรแกรม
        if (bound && socketRef === socket) {
            configRef = config;
            return;
        }
        socketRef = socket;
        configRef = config;
        if (bound) return;
        bound = true;

        socket.on('tiktok_gift', handleGift);
        socket.on('tiktok_like', handleLike);
        socket.on('tiktok_follow', handleFollow);
        socket.on('tiktok_share', handleShare);
        socket.on('tiktok_subscribe', handleSubscribe);
        socket.on('tiktok_chat', handleChat);
        socket.on('tiktok_emote', handleChannelEmote);
        socket.on('channel_emotes_loaded', (payload) => {
            try {
                if (window.ChannelEmotes && typeof ChannelEmotes.apply === 'function') {
                    ChannelEmotes.apply(payload);
                }
            } catch (e) {
                console.warn('[Overlay] channel_emotes_loaded apply failed', e);
            }
        });
        socket.on('tiktok_join', handleJoin);
        socket.on('tiktok_viewer_count', handleViewerCount);
        socket.on('overlay_test_clear', (data) => {
            if (acceptsScopedTest({ isTest: true, ...data })) clearTestData();
        });
        socket.on('overlay_test_begin', (data) => {
            if (acceptsScopedTest({ isTest: true, ...data })) resetTestTracker();
        });
        socket.on('tiktok_status', (s) => {
            state.connected = !!(s && s.connected);
            notify({ type: 'status', status: s });
        });
    }

    function onEvent(fn) {
        if (typeof fn === 'function') listeners.push(fn);
        return () => { listeners = listeners.filter(f => f !== fn); };
    }

    function resetTestTracker() {
        testTracker.gifterKeys = new Set();
        testTracker.likerKeys = new Set();
        testTracker.giftCoins = {};
        testTracker.coins = 0;
        testTracker.likes = 0;
        testTracker.follows = 0;
        testTracker.shares = 0;
        testTracker.joins = 0;
        testTracker.heartMe = 0;
        testTracker.subscribers = 0;
        testTracker.viewerCountBefore = null;
    }

    function clearTestData() {
        testTracker.gifterKeys.forEach((uid) => {
            delete state.gifterMap[uid];
            delete state.gifterLevels[uid];
        });
        testTracker.likerKeys.forEach((uid) => {
            delete state.likerMap[uid];
        });

        Object.keys(state.gifterMap).forEach((uid) => {
            if (isTestPayload({ uniqueId: uid })) {
                delete state.gifterMap[uid];
                delete state.gifterLevels[uid];
            }
        });
        Object.keys(state.likerMap).forEach((uid) => {
            if (isTestPayload({ uniqueId: uid })) delete state.likerMap[uid];
        });

        Object.entries(testTracker.giftCoins || {}).forEach(([key, amount]) => {
            if (!state.giftMap[key]) return;
            state.giftMap[key].coins = Math.max(0, state.giftMap[key].coins - amount);
            if (state.giftMap[key].coins <= 0) delete state.giftMap[key];
        });

        state.coins = Math.max(0, state.coins - testTracker.coins);
        state.likes = Math.max(0, state.likes - testTracker.likes);
        state.follows = Math.max(0, state.follows - testTracker.follows);
        state.shares = Math.max(0, state.shares - testTracker.shares);
        state.joins = Math.max(0, state.joins - testTracker.joins);
        state.heartMe = Math.max(0, state.heartMe - testTracker.heartMe);
        state.subscribers = Math.max(0, state.subscribers - testTracker.subscribers);

        if (testTracker.viewerCountBefore !== null) {
            state.viewerCount = testTracker.viewerCountBefore;
        }

        const testKeys = new Set([...testTracker.gifterKeys, ...testTracker.likerKeys]);
        state.giftFeed = state.giftFeed.filter((g) => !testKeys.has(g.uniqueId) && !isTestPayload(g));
        state.chatFeed = state.chatFeed.filter((r) => !isTestPayload(r));
        state.pendingLevelUps = state.pendingLevelUps.filter((u) => !isTestPayload(u));

        if (state.lastFollower && isTestPayload(state.lastFollower)) state.lastFollower = null;
        if (state.lastGifter && isTestPayload(state.lastGifter)) state.lastGifter = null;
        if (state.lastSubscriber && isTestPayload(state.lastSubscriber)) state.lastSubscriber = null;
        if (state.lastSharer && isTestPayload(state.lastSharer)) state.lastSharer = null;
        if (state.lastLiker && isTestPayload(state.lastLiker)) state.lastLiker = null;

        resetTestTracker();
        notify({ type: 'test_clear' });
    }

    function resetState() {
        Object.assign(state, {
            likes: 0, follows: 0, shares: 0, coins: 0, subscribers: 0, heartMe: 0, joins: 0, viewerCount: 0,
            gifterMap: {}, giftMap: {}, likerMap: {}, giftFeed: [], chatFeed: [], emoteFeed: [],
            lastFollower: null, lastGifter: null, lastSubscriber: null, lastSharer: null, lastLiker: null,
            subLevels: {}, gifterLevels: {}, pendingLevelUps: []
        });
        resetTestTracker();
    }

    global.OverlayGalleryTikTok = {
        state,
        bindSocket,
        onEvent,
        resetState,
        clearTestData,
        isTestPayload,
        getGoalProgress,
        getLastX,
        getTopGifters,
        getTopGifts,
        getTopLikers,
        consumeLevelUp,
        gifterLevelFromCoins
    };
})(typeof window !== 'undefined' ? window : global);
