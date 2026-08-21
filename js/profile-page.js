/* TokControl Gaming Social Profile — My Profile + Public Profile */
(function (global) {
    'use strict';

    const state = {
        initialized: false,
        active: false,
        loading: false,
        mode: 'self',
        username: '',
        data: null,
        previousView: 'dashboard',
        activeTab: 'overview',
        contextOpen: false,
        conversations: [],
        activeConversation: null,
        messages: [],
        editingAbout: false,
        achievementFilter: 'all',
        dmFriends: [],
        loadSeq: 0
    };

    let pendingAvatarFile = null;
    let pendingCoverFile = null;

    const API = Object.freeze({
        me: '/api/profile/extended',
        public: (username) => `/api/profiles/${encodeURIComponent(username)}`,
        search: (q) => `/api/profile/search/users?q=${encodeURIComponent(q)}`,
        relationship: (username) => `/api/profile/relationship/${encodeURIComponent(username)}`,
        achievements: (username) => `/api/profile/${encodeURIComponent(username)}/achievements`,
        activity: (username) => `/api/profile/${encodeURIComponent(username)}/activity`,
        streams: (username) => `/api/profile/${encodeURIComponent(username)}/streams`,
        privacy: '/api/profile/privacy',
        connections: '/api/profile/connections',
        block: (username) => `/api/profile/block/${encodeURIComponent(username)}`,
        report: '/api/profile/report-user',
        conversations: '/api/dm/conversations',
        conversationMessages: (id) => `/api/dm/conversations/${encodeURIComponent(id)}/messages`,
        sendMessage: '/api/dm/send'
    });

    const MATERIAL = {
        play: 'play_arrow', monitor: 'desktop_windows', pencil: 'edit', users: 'group',
        chart: 'monitoring', settings: 'settings', crown: 'workspace_premium', copy: 'content_copy',
        message: 'chat_bubble', link: 'share', search: 'search', check: 'check', plus: 'person_add',
        lock: 'lock', send: 'send', x: 'close', alert: 'flag', shield: 'block', trophy: 'military_tech',
        left_panel_open: 'arrow_back'
    };
    const icon = (name, fallback) => {
        const glyph = MATERIAL[name] || fallback || name || 'circle';
        return `<span class="material-symbols-outlined gp-ms" aria-hidden="true">${glyph}</span>`;
    };

    const esc = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const attr = esc;

    function token() {
        return localStorage.getItem('pandy_token') || '';
    }

    async function api(path, options) {
        const headers = { ...(options?.headers || {}) };
        const auth = token();
        if (auth) headers.Authorization = `Bearer ${auth}`;
        if (options?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        const response = await fetch(path, { ...(options || {}), headers });
        const text = await response.text();
        const trimmed = String(text || '').trim();
        let data = {};
        if (trimmed) {
            try {
                data = JSON.parse(trimmed);
            } catch (_) {
                const error = new Error(response.ok
                    ? 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'
                    : (response.status === 404
                        ? 'ยังไม่มี API โปรไฟล์บนเซิร์ฟเวอร์ — กำลังใช้โหมดสำรอง'
                        : `เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (HTTP ${response.status})`));
                error.status = response.status || 502;
                error.nonJson = true;
                throw error;
            }
        }
        if (!response.ok) {
            const error = new Error(data.error || data.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    async function apiOptional(path, options) {
        try {
            return await api(path, options);
        } catch (_) {
            return null;
        }
    }

    function currentUsername() {
        return String(global.currentUser?.username || '').trim();
    }

    function mediaUrl(url) {
        if (typeof global.resolveMediaUrl === 'function') return global.resolveMediaUrl(url);
        const raw = String(url || '').trim();
        if (!raw || raw.startsWith('blob:')) return '';
        return raw;
    }

    function persistableUrl(url) {
        const raw = String(url || '').trim();
        if (!raw || raw.startsWith('blob:')) return '';
        return raw;
    }

    function avatarFor(profile) {
        return mediaUrl(profile?.avatarUrl) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(profile?.username || 'user')}&backgroundColor=bc13fe`;
    }

    function number(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function compact(value) {
        return new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(number(value));
    }

    function date(value, withTime) {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('th-TH', withTime
            ? { dateStyle: 'medium', timeStyle: 'short' }
            : { dateStyle: 'medium' });
    }

    function relative(value) {
        if (!value) return '';
        const ms = Date.now() - new Date(value).getTime();
        if (!Number.isFinite(ms)) return '';
        const mins = Math.max(0, Math.floor(ms / 60000));
        if (mins < 1) return 'เมื่อสักครู่';
        if (mins < 60) return `${mins} นาทีที่แล้ว`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
        const days = Math.floor(hours / 24);
        return days === 1 ? 'เมื่อวาน' : `${days} วันที่แล้ว`;
    }

    function durationLabel(item) {
        if (item?.duration) return String(item.duration);
        const seconds = Math.max(0, number(item?.durationSeconds));
        if (!seconds) return '—';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
    }

    function maskEmail(email) {
        const raw = String(email || '');
        const at = raw.indexOf('@');
        if (at < 1) return '—';
        const name = raw.slice(0, at);
        return `${name.slice(0, Math.min(5, name.length))}****${raw.slice(at)}`;
    }

    function normalize(payload, mode) {
        const own = mode === 'self' ? (global.currentUser || {}) : {};
        const raw = { ...own, ...(payload?.user || {}), ...(payload?.profile || payload || {}) };
        const stats = raw.stats || {};
        const counters = raw.counters || {};
        const privacyRaw = payload?.privacy || raw.privacy || {};
        const level = Math.max(1, number(raw.level) || 1);
        const xp = Math.max(0, number(raw.xp));
        const xpToNextLevel = Math.max(1, number(raw.xpToNextLevel) || number(raw.nextLevelXp) || Math.max((level + 1) * 1000, xp + 1));
        const streamList = Array.isArray(payload?.streams) ? payload.streams : (Array.isArray(raw.recentStreams) ? raw.recentStreams : []);
        const streamHours = streamList.reduce((sum, item) => sum + number(item.durationSeconds), 0) / 3600;
        const streamViews = streamList.reduce((sum, item) => sum + number(item.totalViews ?? item.viewerCount), 0);
        const activityList = (Array.isArray(payload?.activity) ? payload.activity : (Array.isArray(raw.activity) ? raw.activity : [])).map((item) => {
            let metadata = item.metadata || {};
            if (typeof metadata === 'string') {
                try { metadata = JSON.parse(metadata); } catch (_) { metadata = {}; }
            }
            return { ...item, ...metadata, metadata };
        });
        return {
            id: mode === 'self' && raw.id != null ? String(raw.id) : '',
            username: String(raw.username || ''),
            displayName: String(raw.displayName || raw.username || 'ผู้ใช้ TokControl'),
            avatarUrl: raw.avatarUrl || '',
            coverUrl: raw.coverUrl || '',
            bio: String(raw.bio || ''),
            country: String(raw.country || ''),
            province: String(raw.province || ''),
            languages: String(raw.languages || ''),
            contentTypes: String(raw.contentTypes || ''),
            streamGear: String(raw.streamGear || ''),
            isOnline: mode === 'self' ? true : !!(raw.isOnline ?? raw.online ?? payload?.presence?.online),
            isPro: !!(raw.isPro ?? raw.proActive),
            proExpireAt: raw.proExpireAt || null,
            role: raw.role || 'free',
            createdAt: raw.createdAt || null,
            lastActive: raw.lastActive || null,
            email: mode === 'self' ? (raw.email || '') : '',
            accountStatus: raw.accountStatus || 'active',
            level,
            xp,
            xpToNextLevel,
            rank: raw.rank || rankFor(level),
            followersCount: number(raw.followersCount ?? stats.followers ?? counters.followers),
            followingCount: number(raw.followingCount ?? stats.following ?? counters.following),
            streamsCount: number(raw.streamsCount ?? stats.streams ?? counters.streams) || streamList.length,
            totalLiveHours: number(raw.totalLiveHours ?? stats.totalLiveHours) || streamHours,
            totalViews: number(raw.totalViews ?? stats.totalViews) || streamViews,
            friendStatus: String(raw.friendStatus || payload?.relationship?.status || payload?.relationship?.state || payload?.relationship || 'NONE').toUpperCase(),
            relationship: typeof payload?.relationship === 'object' ? payload.relationship : (raw.relationship || {}),
            achievements: Array.isArray(payload?.achievements) ? payload.achievements : (Array.isArray(raw.achievements) ? raw.achievements : []),
            connections: (Array.isArray(payload?.connections) ? payload.connections : (Array.isArray(raw.connections) ? raw.connections : [])).map((item) => ({
                ...item,
                accountName: item.accountName || item.handle || item.username || '',
                connected: item.connected !== false
            })),
            recentStreams: streamList,
            activity: activityList,
            mutualFriends: Array.isArray(payload?.mutualFriends) ? payload.mutualFriends : (Array.isArray(raw.mutualFriends) ? raw.mutualFriends : []),
            privacy: {
                profile: privacyRaw.profile || privacyRaw.profileVisibility || 'public',
                socialLinks: privacyRaw.socialLinks || privacyRaw.socialVisibility || 'public',
                achievements: privacyRaw.achievements || privacyRaw.achievementsVisibility || 'public',
                streams: privacyRaw.streams || privacyRaw.streamsVisibility || 'public',
                activity: privacyRaw.activity || privacyRaw.activityVisibility || 'friends',
                dmPermission: privacyRaw.dmPermission || 'friends'
            },
            canMessage: raw.canMessage !== false,
            blockedByViewer: !!raw.blockedByViewer,
            viewerBlocked: !!raw.viewerBlocked
        };
    }

    function rankFor(level) {
        if (level >= 50) return 'Streamer Legend';
        if (level >= 25) return 'Streamer Elite';
        if (level >= 10) return 'Rising Creator';
        return 'New Streamer';
    }

    function socialUrl(platform, handle) {
        const clean = String(handle || '').trim().replace(/^@/, '');
        if (!clean) return '';
        if (platform === 'tiktok') return `https://www.tiktok.com/@${encodeURIComponent(clean)}`;
        if (platform === 'youtube') return `https://www.youtube.com/@${encodeURIComponent(clean)}`;
        if (platform === 'twitch') return `https://www.twitch.tv/${encodeURIComponent(clean)}`;
        return '';
    }

    function skeleton() {
        return `<div class="gp-page">
            <div class="gp-topline"><div class="gp-skel" style="width:110px;height:32px"></div></div>
            <div class="gp-column">
                <div class="gp-skel hero"></div>
                <div class="gp-skel tabs"></div>
                <div class="gp-grid"><div class="gp-skel card"></div><div class="gp-skel card"></div></div>
            </div>
        </div>`;
    }

    function empty(title, description, iconName) {
        return `<div class="gp-empty">
            <span class="material-symbols-outlined" aria-hidden="true">${esc(iconName || 'inbox')}</span>
            <b>${esc(title)}</b><p>${esc(description || '')}</p>
        </div>`;
    }

    function errorView(title, description, retry) {
        return `<div class="gp-page"><div class="gp-topline"><button type="button" class="gp-back" data-gp-back><span class="material-symbols-outlined">arrow_back</span> กลับไปหน้าแรก</button></div>
            <div class="gp-column"><div class="gp-card gp-error">
                <span class="material-symbols-outlined" aria-hidden="true">person_off</span>
                <b>${esc(title)}</b><p>${esc(description)}</p>
                ${retry ? `<button type="button" class="gp-btn primary" data-gp-retry>ลองอีกครั้ง</button>` : ''}
            </div></div></div>`;
    }

    function progress(profile) {
        return Math.max(0, Math.min(100, Math.round((profile.xp / profile.xpToNextLevel) * 100)));
    }

    function roleTags(profile) {
        const tags = [];
        if (profile.isPro) tags.push('Streamer');
        tags.push('Gamer');
        if (profile.followersCount >= 10 || profile.streamsCount >= 1) tags.push('Community Builder');
        else tags.push('Creator');
        return tags;
    }

    function heroActions(profile) {
        if (state.mode === 'self') {
            return `
                <button type="button" class="gp-icon-btn" data-gp-search title="ค้นหาผู้ใช้" aria-label="ค้นหาผู้ใช้"><span class="material-symbols-outlined">search</span></button>
                <button type="button" class="gp-icon-btn" data-gp-inbox title="ข้อความ" aria-label="ข้อความ"><span class="material-symbols-outlined">chat_bubble</span></button>
                <button type="button" class="gp-btn primary" data-gp-edit><span class="material-symbols-outlined">edit</span> แก้ไขโปรไฟล์</button>
                <button type="button" class="gp-btn ghost" data-gp-share><span class="material-symbols-outlined">ios_share</span> แชร์</button>`;
        }
        const status = profile.friendStatus;
        let friendBtn = `<button type="button" class="gp-btn primary" data-gp-add-friend><span class="material-symbols-outlined">person_add</span> เพิ่มเพื่อน</button>`;
        if (status === 'BLOCKED') friendBtn = `<button type="button" class="gp-btn" disabled><span class="material-symbols-outlined">block</span> ถูกบล็อก</button>`;
        else if (status === 'REQUEST_SENT') friendBtn = `<button type="button" class="gp-btn" disabled><span class="material-symbols-outlined">schedule</span> ส่งคำขอแล้ว</button>`;
        else if (status === 'REQUEST_RECEIVED') friendBtn = `<button type="button" class="gp-btn primary" data-gp-accept><span class="material-symbols-outlined">person_add</span> ตอบรับคำขอ</button>`;
        else if (status === 'FRIENDS') friendBtn = `<button type="button" class="gp-btn ghost" data-gp-friend-menu><span class="material-symbols-outlined">person_check</span> เพื่อนแล้ว</button>`;
        return `
            <button type="button" class="gp-icon-btn" data-gp-context title="เมนูเพิ่มเติม" aria-label="เมนูเพิ่มเติม"><span class="material-symbols-outlined">more_vert</span></button>
            ${friendBtn}
            <button type="button" class="gp-btn ghost" data-gp-message ${profile.canMessage && status !== 'BLOCKED' ? '' : 'disabled'}><span class="material-symbols-outlined">chat_bubble</span> ส่งข้อความ</button>`;
    }

    function socials(profile) {
        const defaults = [
            { platform: 'TikTok', icon: 'music_note' },
            { platform: 'YouTube', icon: 'smart_display' },
            { platform: 'Discord', icon: 'forum' }
        ];
        const byPlatform = Object.fromEntries((profile.connections || []).map((item) => [String(item.platform || '').toLowerCase(), item]));
        return defaults.map((entry) => {
            const item = byPlatform[entry.platform.toLowerCase()];
            const connected = !!(item && item.connected !== false && (item.accountName || item.handle || item.url));
            const href = item?.url && /^https?:\/\//i.test(item.url) ? item.url : '#';
            return `<a class="gp-social-link${connected ? ' is-on' : ''}" href="${attr(href)}" ${href === '#' ? 'data-gp-noop' : 'target="_blank" rel="noopener noreferrer"'} title="${attr(entry.platform)}" aria-label="${attr(entry.platform)}"><span class="material-symbols-outlined">${entry.icon}</span></a>`;
        }).join('');
    }

    function miniStats(profile) {
        const items = [
            ['group', 'ผู้ติดตาม', compact(profile.followersCount)],
            ['person_add', 'กำลังติดตาม', compact(profile.followingCount)],
            ['videocam', 'สตรีมทั้งหมด', compact(profile.streamsCount)],
            ['schedule', 'เวลาไลฟ์รวม', `${Math.round(profile.totalLiveHours).toLocaleString('th-TH')} ชม.`],
            ['visibility', 'ยอดวิวรวม', compact(profile.totalViews)]
        ];
        return `<div class="gp-mini-stats">${items.map(([ico, label, value]) => `<div class="gp-mini-stat"><span class="material-symbols-outlined">${ico}</span><b>${esc(value)}</b><small>${esc(label)}</small></div>`).join('')}</div>`;
    }

    function hero(profile) {
        const p = progress(profile);
        const tags = roleTags(profile);
        const cover = mediaUrl(profile.coverUrl);
        return `<section class="gp-hero">
            <div class="gp-cover${cover ? ' has-image' : ''}">${cover ? `<img class="gp-cover-image" src="${attr(cover)}" alt="" loading="eager" decoding="async" onerror="this.onerror=null;this.classList.add('is-broken');this.parentElement.classList.remove('has-image')">` : ''}</div>
            <div class="gp-hero-content">
                <div class="gp-identity">
                    <div class="gp-avatar-wrap">
                        <img class="gp-avatar" src="${attr(avatarFor(profile))}" alt="รูปโปรไฟล์ของ ${attr(profile.displayName)}">
                        <span class="gp-online${profile.isOnline ? '' : ' offline'}" title="${profile.isOnline ? 'Online' : 'Offline'}">${profile.isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                    <div class="gp-identity-copy">
                        <div class="gp-name-row">
                            <h1>${esc(profile.displayName)}</h1>
                            ${profile.isPro ? `<span class="gp-badge"><span class="material-symbols-outlined">workspace_premium</span> PRO</span>` : ''}
                        </div>
                        <div class="gp-handle">
                            <span>@${esc(profile.username)}</span>
                            ${profile.id ? `<span class="gp-user-id">ID: ${esc(profile.id)}</span>` : ''}
                            ${profile.id ? `<button type="button" class="gp-copy" data-gp-copy="${attr(profile.id)}" aria-label="คัดลอก User ID"><span class="material-symbols-outlined">content_copy</span></button>` : ''}
                        </div>
                        <div class="gp-tags">${tags.map((tag) => `<span>${esc(tag)}</span>`).join('<i>•</i>')}</div>
                        <p class="gp-bio">${esc(profile.bio || (state.mode === 'self' ? 'เพิ่ม Bio เพื่อบอกทุกคนเกี่ยวกับตัวคุณ' : 'ผู้ใช้นี้ยังไม่ได้เพิ่ม Bio'))}</p>
                        <div class="gp-socials">${socials(profile)}</div>
                    </div>
                </div>
                <aside class="gp-side-card">
                    <div class="gp-level-head">
                        <div class="gp-rank-emblem"><span class="material-symbols-outlined">military_tech</span></div>
                        <div class="gp-level-copy"><b>Lv. ${profile.level}</b><span>${esc(profile.rank)}</span></div>
                    </div>
                    <div class="gp-xp-line"><span>XP Progress</span><span>${profile.xp.toLocaleString('th-TH')} / ${profile.xpToNextLevel.toLocaleString('th-TH')} XP</span></div>
                    <div class="gp-xp-track" role="progressbar" aria-valuemin="0" aria-valuemax="${profile.xpToNextLevel}" aria-valuenow="${profile.xp}"><div class="gp-xp-bar" style="--gp-progress:${p}%"></div></div>
                    ${miniStats(profile)}
                    <div class="gp-member-strip">
                        <div>
                            <b><span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px">workspace_premium</span> ${profile.isPro ? 'PRO MEMBER' : 'FREE MEMBER'}</b>
                            <small>${profile.isPro ? `ใช้งานถึง ${date(profile.proExpireAt)}` : 'อัปเกรดเพื่อปลดล็อกฟีเจอร์เพิ่ม'}</small>
                        </div>
                        <button type="button" class="gp-btn ghost sm" onclick="typeof purchasePro==='function'&&purchasePro()">${profile.isPro ? 'จัดการสมาชิก' : 'สมัคร PRO'}</button>
                    </div>
                </aside>
            </div>
        </section>`;
    }

    function stats(profile) {
        return `<section class="gp-card"><div class="gp-card-head"><h2>สถิติโปรไฟล์</h2></div>${miniStats(profile)}</section>`;
    }

    function achievements(profile, limit) {
        const all = profile.achievements || [];
        const unlocked = all.filter((item) => item.unlocked !== false && !item.locked);
        const source = unlocked.length ? unlocked : all;
        const list = limit ? source.slice(0, limit) : source;
        if (!list.length) {
            return `<div class="gp-achievements gp-achievements--empty">
                ${['workspace_premium','emoji_events','favorite'].map((ico, i) => `<article class="gp-achievement locked"><div class="gp-achievement-icon tone-${i}"><span class="material-symbols-outlined">${ico}</span></div><b>ยังไม่ปลดล็อก</b><small>เริ่มสตรีมเพื่อปลดล็อก</small></article>`).join('')}
            </div>`;
        }
        return `<div class="gp-achievements">${list.map((item, index) => `<article class="gp-achievement${item.unlocked === false || item.locked ? ' locked' : ''}">
            <div class="gp-achievement-icon tone-${index % 3}">${item.iconUrl && /^https?:\/\//i.test(item.iconUrl) ? `<img src="${attr(item.iconUrl)}" alt="">` : `<span class="material-symbols-outlined">${esc(item.icon || 'workspace_premium')}</span>`}</div>
            <b>${esc(item.title || item.name || 'Achievement')}</b>
            <small>${esc(item.description || triggerSummary(item) || '')}</small>
            <time>${item.unlockedAt ? date(item.unlockedAt) : (item.locked || item.unlocked === false ? 'ล็อกอยู่' : '')}</time>
        </article>`).join('')}</div>`;
    }

    function triggerSummary(item) {
        const type = item.triggerType || 'manual';
        const value = Number(item.triggerValue) || 0;
        const unit = item.triggerUnit || '';
        if (type === 'manual') return 'มอบด้วยมือ / ไม่มีเงื่อนไขอัตโนมัติ';
        if (type === 'live_hours') return `ไลฟ์ครบ ${value} ชั่วโมง`;
        if (type === 'friends_count') return `มีเพื่อนครบ ${value} คน`;
        if (type === 'gifts_received') return `ได้รับของขวัญครบ ${value} ชิ้น`;
        if (type === 'pro_subscriptions') return `สมัคร PRO ครบ ${value} ครั้ง`;
        if (type === 'account_age') {
            const unitLabel = unit === 'year' ? 'ปี' : unit === 'month' ? 'เดือน' : 'วัน';
            return `ใช้งานระบบครบ ${value} ${unitLabel}`;
        }
        return `${type} ≥ ${value}`;
    }

    function achievementsPanel(profile) {
        const all = profile.achievements || [];
        const filter = state.achievementFilter || 'all';
        const unlockedCount = all.filter((item) => item.unlocked !== false && !item.locked).length;
        const filtered = all.filter((item) => {
            const unlocked = item.unlocked !== false && !item.locked;
            if (filter === 'unlocked') return unlocked;
            if (filter === 'locked') return !unlocked;
            return true;
        });
        const filters = [
            ['all', 'ทั้งหมด', all.length],
            ['unlocked', 'ปลดล็อกแล้ว', unlockedCount],
            ['locked', 'ยังไม่ปลดล็อก', Math.max(0, all.length - unlockedCount)]
        ];
        return `<section class="gp-card gp-ach-manage">
            <div class="gp-card-head">
                <div>
                    <h2>จัดการความสำเร็จ</h2>
                    <small>ติดตามเงื่อนไข ความคืบหน้า และสถานะปลดล็อก</small>
                </div>
                <small>${unlockedCount}/${all.length || 0} ปลดล็อกแล้ว</small>
            </div>
            <div class="gp-ach-filters" role="tablist" aria-label="กรองความสำเร็จ">
                ${filters.map(([id, label, count]) => `<button type="button" class="gp-ach-filter${filter === id ? ' active' : ''}" data-gp-ach-filter="${id}">${label} <span>${count}</span></button>`).join('')}
            </div>
            <div class="gp-ach-table-wrap">
                <table class="gp-ach-table">
                    <thead>
                        <tr>
                            <th>ไอคอน</th>
                            <th>ชื่อ</th>
                            <th>เงื่อนไข</th>
                            <th>ความคืบหน้า</th>
                            <th>สถานะ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length ? filtered.map((item, index) => {
                            const unlocked = item.unlocked !== false && !item.locked;
                            const progress = Math.max(0, Math.min(100, Number(item.progress) || (unlocked ? 100 : 0)));
                            return `<tr class="${unlocked ? 'is-unlocked' : 'is-locked'}">
                                <td><span class="gp-ach-table-icon tone-${index % 3}">${item.iconUrl && /^https?:\/\//i.test(item.iconUrl) ? `<img src="${attr(item.iconUrl)}" alt="">` : `<span class="material-symbols-outlined">${esc(item.icon || 'workspace_premium')}</span>`}</span></td>
                                <td>
                                    <b>${esc(item.title || item.name || 'Achievement')}</b>
                                    <div class="gp-ach-desc">${esc(item.description || '—')}</div>
                                    ${Number(item.points) ? `<div class="gp-ach-points">${Number(item.points).toLocaleString('th-TH')} pts</div>` : ''}
                                </td>
                                <td>${esc(triggerSummary(item))}</td>
                                <td>
                                    <div class="gp-ach-progress" aria-label="ความคืบหน้า ${progress}%">
                                        <div class="gp-ach-progress-bar"><span style="width:${progress}%"></span></div>
                                        <small>${progress}%</small>
                                    </div>
                                    ${unlocked && item.unlockedAt ? `<time>${esc(date(item.unlockedAt))}</time>` : ''}
                                </td>
                                <td><span class="gp-ach-status ${unlocked ? 'on' : 'off'}">${unlocked ? 'ปลดล็อกแล้ว' : 'ล็อกอยู่'}</span></td>
                            </tr>`;
                        }).join('') : `<tr><td colspan="5">${empty('ยังไม่มีความสำเร็จ', state.mode === 'self' ? 'เมื่อแอดมินสร้างความสำเร็จและคุณทำเงื่อนไขครบ รายการจะแสดงที่นี่' : 'โปรไฟล์นี้ยังไม่มีความสำเร็จที่แสดงได้', 'military_tech')}</td></tr>`}
                    </tbody>
                </table>
            </div>
        </section>`;
    }

    function aboutDefaults(profile) {
        return {
            country: profile.country || 'Thailand',
            province: profile.province || '',
            languages: profile.languages || '',
            contentTypes: profile.contentTypes || '',
            streamGear: profile.streamGear || ''
        };
    }

    const ABOUT_OPTIONS = Object.freeze({
        provinces: [
            'กรุงเทพมหานคร', 'เชียงใหม่', 'เชียงราย', 'ขอนแก่น', 'นครราชสีมา', 'ชลบุรี', 'ภูเก็ต',
            'สงขลา', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'อยุธยา', 'นครศรีธรรมราช', 'อุดรธานี',
            'อุบลราชธานี', 'สุราษฎร์ธานี', 'ระยอง', 'หาดใหญ่', 'ต่างประเทศ', 'อื่นๆ'
        ],
        languages: ['ไทย', 'English', 'ไทย, English', '中文', '日本語', 'อื่นๆ'],
        contentTypes: ['เกม', 'พูดคุย', 'IRL', 'เพลง', 'การศึกษา', 'ข่าว', 'เกม, พูดคุย', 'เกม, IRL', 'อื่นๆ'],
        streamGear: ['PC', 'Laptop', 'มือถือ', 'PC, OBS', 'PC, OBS, Elgato', 'Console', 'Streamlabs', 'อื่นๆ']
    });

    function aboutSelect(name, label, value, options, placeholder) {
        const selected = String(value || '');
        const known = options.includes(selected);
        return `<div class="gp-form-field">
            <label for="gpAbout_${name}">${esc(label)}</label>
            <select id="gpAbout_${name}" class="gp-select keep-native-select" name="${name}">
                <option value="">${esc(placeholder || 'เลือก...')}</option>
                ${options.map((opt) => `<option value="${attr(opt)}" ${selected === opt ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
                ${selected && !known ? `<option value="${attr(selected)}" selected>${esc(selected)}</option>` : ''}
            </select>
        </div>`;
    }

    function aboutCard(profile) {
        const about = aboutDefaults(profile);
        const canEdit = state.mode === 'self';
        if (canEdit && state.editingAbout) {
            return `<section class="gp-card gp-about-card is-editing">
                <div class="gp-card-head">
                    <h2>แก้ไขเกี่ยวกับฉัน</h2>
                    <button type="button" class="gp-btn ghost sm" data-gp-about-cancel>ยกเลิก</button>
                </div>
                <form id="gpAboutForm" class="gp-about-form" action="javascript:void(0)" onsubmit="return false;">
                    <div class="gp-form-field full">
                        <label for="gpAboutBio">เกี่ยวกับฉัน / Bio</label>
                        <textarea id="gpAboutBio" class="gp-textarea" name="bio" maxlength="500" rows="4" placeholder="เล่าเกี่ยวกับสไตล์การสตรีมของคุณ">${esc(profile.bio || '')}</textarea>
                    </div>
                    <div class="gp-about-form-grid">
                        <div class="gp-form-field">
                            <label for="gpAboutCountry">ประเทศ</label>
                            <input id="gpAboutCountry" class="gp-input" name="country" maxlength="80" value="${attr(about.country)}" placeholder="เช่น Thailand" list="gpCountryList">
                            <datalist id="gpCountryList"><option value="Thailand"><option value="ประเทศไทย"><option value="Japan"><option value="USA"></datalist>
                        </div>
                        ${aboutSelect('province', 'จังหวัด', about.province, ABOUT_OPTIONS.provinces, 'เลือกจังหวัด')}
                        ${aboutSelect('languages', 'ภาษา', about.languages, ABOUT_OPTIONS.languages, 'เลือกภาษา')}
                        ${aboutSelect('contentTypes', 'ประเภทเนื้อหา', about.contentTypes, ABOUT_OPTIONS.contentTypes, 'เลือกประเภทเนื้อหา')}
                        ${aboutSelect('streamGear', 'อุปกรณ์สตรีม', about.streamGear, ABOUT_OPTIONS.streamGear, 'เลือกอุปกรณ์')}
                    </div>
                    <div class="gp-form-actions">
                        <button type="button" class="gp-btn" data-gp-about-cancel>ยกเลิก</button>
                        <button type="button" class="gp-btn primary" data-gp-about-save>บันทึก</button>
                    </div>
                </form>
            </section>`;
        }
        const rows = [
            ['public', 'ประเทศ', about.country || '—'],
            ['location_on', 'จังหวัด', about.province || '—'],
            ['translate', 'ภาษา', about.languages || '—'],
            ['calendar_month', 'เข้าร่วมเมื่อ', date(profile.createdAt)],
            ['schedule', 'เวลาออนไลน์', profile.isOnline ? 'ออนไลน์ตอนนี้' : (relative(profile.lastActive) || '—')],
            ['category', 'ประเภทเนื้อหา', about.contentTypes || '—'],
            ['memory', 'อุปกรณ์สตรีม', about.streamGear || '—']
        ];
        return `<section class="gp-card gp-about-card">
            <div class="gp-card-head">
                <h2>เกี่ยวกับฉัน</h2>
                ${canEdit ? `<button type="button" class="gp-btn ghost sm" data-gp-about-edit><span class="material-symbols-outlined">edit</span> แก้ไข</button>` : ''}
            </div>
            <p class="gp-about-text">${esc(profile.bio || (canEdit ? 'เล่าเกี่ยวกับสไตล์การสตรีมของคุณที่นี่' : 'ยังไม่มีข้อมูลเกี่ยวกับโปรไฟล์นี้'))}</p>
            <div class="gp-about-list">${rows.map(([ico, label, value]) => `<div class="gp-about-row"><span class="material-symbols-outlined">${ico}</span><div><small>${label}</small><b>${esc(value)}</b></div></div>`).join('')}</div>
        </section>`;
    }

    function streams(profile, limit) {
        const list = limit ? profile.recentStreams.slice(0, limit) : profile.recentStreams;
        if (!list.length) {
            const placeholders = [
                ['/assets/box-control-cover.png', 'Box Control'],
                ['/assets/dance-club-cover.png', 'Dance Club'],
                ['/assets/fish-control-cover.png', 'Fish Control'],
                ['/assets/farm-control-cover.png', 'Farm Control']
            ];
            return `<div class="gp-stream-grid">${placeholders.slice(0, limit || 4).map(([src, title]) => `<article class="gp-stream is-placeholder">
                <div class="gp-stream-cover"><img src="${src}" alt=""><span class="gp-stream-state ended">SOON</span><span class="gp-stream-viewers">—</span></div>
                <div class="gp-stream-copy"><b>${title}</b><span>ยังไม่มีประวัติไลฟ์</span></div>
            </article>`).join('')}</div>`;
        }
        return `<div class="gp-stream-grid">${list.map((item) => {
            const live = String(item.status || '').toUpperCase() === 'LIVE';
            return `<article class="gp-stream">
                <div class="gp-stream-cover">${item.thumbnailUrl ? `<img src="${attr(item.thumbnailUrl)}" alt="">` : `<div class="gp-stream-fallback"></div>`}<span class="gp-stream-state${live ? '' : ' ended'}">${live ? 'LIVE' : 'ENDED'}</span><span class="gp-stream-viewers">${compact(item.peakViewers ?? item.viewerCount)} viewers</span></div>
                <div class="gp-stream-copy"><b>${esc(item.title || 'Untitled Stream')}</b><span>${esc(durationLabel(item))} · ${date(item.startedAt || item.date)}</span></div>
            </article>`;
        }).join('')}</div>`;
    }

    function activity(profile, limit) {
        const list = limit ? profile.activity.slice(0, limit) : profile.activity;
        if (!list.length) return empty('ยังไม่มีกิจกรรม', 'กิจกรรมจากโปรไฟล์และการสตรีมจะแสดงที่นี่', 'history');
        return `<div class="gp-list">${list.map((item) => {
            const linkedUser = item.targetUsername || item.username || '';
            return `<div class="gp-list-row"${linkedUser ? ` role="button" tabindex="0" data-gp-open-user="${attr(linkedUser)}"` : ''}>
            <span class="gp-list-icon"><span class="material-symbols-outlined">${esc(item.icon || 'bolt')}</span></span>
            <div><b>${esc(item.title || item.type || 'กิจกรรม')}</b><small>${esc(item.description || item.details || '')}</small></div>
            <time>${esc(relative(item.createdAt || item.at))}</time>
        </div>`;
        }).join('')}</div>`;
    }

    function chartCard(profile) {
        const values = [18, 28, 22, 40, 36, 52, 48, 62, 58, 74, 68, 80];
        const max = Math.max(...values);
        const coords = values.map((v, i) => {
            const x = (i / (values.length - 1)) * 100;
            const y = 100 - (v / max) * 78;
            return [x, y];
        });
        const line = coords.map(([x, y]) => `${x},${y}`).join(' ');
        const area = `0,100 ${line} 100,100`;
        const tip = Math.max(1, Math.round(profile.followersCount * 0.08) || 128);
        return `<section class="gp-card gp-chart-card">
            <div class="gp-card-head"><h2>สถิติโดยรวม</h2><small>30 วันที่ผ่านมา</small></div>
            <div class="gp-chart">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                        <linearGradient id="gpFill" x1="0" y1="0" x2="0" y2="1">
                            <stop stop-color="#a855f7" stop-opacity=".35"/>
                            <stop offset="1" stop-color="#a855f7" stop-opacity="0"/>
                        </linearGradient>
                        <linearGradient id="gpLine" x1="0" x2="1">
                            <stop stop-color="#ec4899"/><stop offset="1" stop-color="#8b5cf6"/>
                        </linearGradient>
                    </defs>
                    <polygon fill="url(#gpFill)" points="${area}"></polygon>
                    <polyline fill="none" stroke="url(#gpLine)" stroke-width="2.2" points="${line}"></polyline>
                    ${coords.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#c4b5fd"></circle>`).join('')}
                </svg>
                <div class="gp-chart-tip"><b>+${tip}</b><span>ผู้ติดตามใหม่</span></div>
            </div>
            <div class="gp-chart-stats">
                <div><b>+${compact(Math.max(profile.followersCount, tip))}</b><span>ผู้ติดตามใหม่</span></div>
                <div><b>${compact(profile.totalViews || Math.round(profile.followersCount * 8))}</b><span>ยอดวิว</span></div>
                <div><b>${Math.round(profile.totalLiveHours || 0).toLocaleString('th-TH')} ชม.</b><span>เวลาไลฟ์</span></div>
                <div><b>${compact(profile.streamsCount)}</b><span>จำนวนไลฟ์</span></div>
            </div>
        </section>`;
    }

    function mutuals(profile) {
        if (!profile.mutualFriends.length) {
            return `<div class="gp-mutuals gp-mutuals--empty"><div class="gp-empty tight"><span class="material-symbols-outlined">group</span><b>ยังไม่มีเพื่อนร่วมกัน</b></div></div>`;
        }
        const first = profile.mutualFriends.slice(0, 5);
        return `<div class="gp-mutuals">${first.map((user) => `<button type="button" class="gp-mutual" data-gp-open-user="${attr(user.username)}" aria-label="เปิดโปรไฟล์ ${attr(user.displayName || user.username)}"><img src="${attr(avatarFor(user))}" alt=""><span>${esc(user.displayName || user.username)}</span></button>`).join('')}
            ${profile.mutualFriends.length > 5 ? `<button type="button" class="gp-mutual-more" data-gp-mutuals>+${profile.mutualFriends.length - 5}</button>` : ''}
        </div>`;
    }

    function mutualFriendsModal() {
        const list = state.data?.mutualFriends || [];
        showModal(`<div class="gp-modal-card" role="dialog" aria-modal="true" aria-labelledby="gpMutualTitle">
            <div class="gp-modal-head"><h2 id="gpMutualTitle">เพื่อนที่รู้จักร่วมกัน (${list.length})</h2><button class="gp-icon-btn" data-gp-modal-close aria-label="ปิด">${icon('x', 'close')}</button></div>
            <div class="gp-modal-body">${list.length ? `<div class="gp-list">${list.map((user) => `<button type="button" class="gp-list-row" data-gp-open-user="${attr(user.username)}" style="width:100%;border-left:0;border-right:0;border-top:0;background:transparent;text-align:left;cursor:pointer"><img src="${attr(avatarFor(user))}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover"><div><b>${esc(user.displayName || user.username)}</b><small>@${esc(user.username)}</small></div><span class="material-symbols-outlined">chevron_right</span></button>`).join('')}</div>` : empty('ยังไม่มีเพื่อนร่วมกัน', '', 'group_off')}</div>
        </div>`);
    }

    function accountInfo(profile) {
        const url = profileUrl(profile.username);
        const items = [
            ['Display Name', profile.displayName],
            ['Profile URL', url, url],
            ['Username', `@${profile.username}`],
            ['User ID', profile.id || '—', profile.id],
            ['Email', maskEmail(profile.email)],
            ['Account Created', date(profile.createdAt)],
            ['Last Active', relative(profile.lastActive) || '—'],
            ['Account Status', profile.accountStatus === 'active' ? 'Active' : profile.accountStatus]
        ];
        return `<div class="gp-field-list">${items.map(([label, value, copy]) => `<div class="gp-field"><label>${esc(label)}</label><div><span>${esc(value)}</span>${copy ? `<button type="button" class="gp-copy" data-gp-copy="${attr(copy)}" aria-label="คัดลอก ${attr(label)}">${icon('copy', 'content_copy')}</button>` : ''}</div></div>`).join('')}</div>`;
    }

    function connections(profile, opts = {}) {
        const defaults = [
            { platform: 'TikTok', icon: 'music_note' },
            { platform: 'Discord', icon: 'forum' },
            { platform: 'YouTube', icon: 'smart_display' }
        ];
        const byPlatform = Object.fromEntries((profile.connections || []).map((item) => [String(item.platform || '').toLowerCase(), item]));
        const rows = defaults.map((entry, index) => {
            const item = byPlatform[entry.platform.toLowerCase()] || { platform: entry.platform, connected: false };
            const connected = !!(item.connected !== false && (item.accountName || item.handle || item.username || item.url));
            const handle = item.accountName || item.handle || item.username || item.url || (connected ? `@${profile.username}` : 'ยังไม่เชื่อมต่อ');
            const realIndex = (profile.connections || []).findIndex((c) => String(c.platform || '').toLowerCase() === entry.platform.toLowerCase());
            return `<div class="gp-connection${connected ? ' is-on' : ''}">
                <span class="gp-platform-logo"><span class="material-symbols-outlined">${entry.icon}</span></span>
                <div><b>${esc(entry.platform)}</b><small>${esc(handle)}</small></div>
                ${state.mode === 'self' && !opts.readOnly
                    ? `<button type="button" class="gp-btn${connected ? ' danger' : ' cyan'} sm" data-gp-connection="${realIndex >= 0 ? realIndex : index}">${connected ? 'Disconnect' : 'Connect'}</button>`
                    : `<span class="gp-connected${connected ? '' : ' is-off'}">${connected ? '<span class="material-symbols-outlined">check_circle</span> เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}</span>`}
            </div>`;
        }).join('');
        return `<div class="gp-connections">${rows}</div>`;
    }

    function overviewPanel(profile) {
        const mutualCount = profile.mutualFriends?.length || 0;
        return `<div class="gp-panel" data-gp-panel="overview">
            <div class="gp-overview">
                <div class="gp-overview-left">
                    ${aboutCard(profile)}
                    <section class="gp-card gp-streams-card">
                        <div class="gp-card-head"><h2>ไลฟ์สดล่าสุด</h2><button type="button" class="gp-link-btn" data-gp-tab-jump="streams">ดูไลฟ์สดทั้งหมด</button></div>
                        ${streams(profile, 4)}
                    </section>
                </div>
                <div class="gp-overview-center">
                    <section class="gp-card gp-achievements-card">
                        <div class="gp-card-head"><h2>ความสำเร็จล่าสุด</h2></div>
                        ${achievements(profile, 3)}
                        <button type="button" class="gp-btn ghost block" data-gp-tab-jump="achievements">ดูความสำเร็จทั้งหมด</button>
                    </section>
                </div>
                <aside class="gp-overview-side">
                    <section class="gp-card">
                        <div class="gp-card-head"><h2>เพื่อนที่มีร่วมกัน (${mutualCount})</h2>${mutualCount ? `<button type="button" class="gp-link-btn" data-gp-mutuals>ดูทั้งหมด</button>` : ''}</div>
                        ${mutuals(profile)}
                    </section>
                    <section class="gp-card">
                        <div class="gp-card-head"><h2>การเชื่อมต่อ</h2></div>
                        ${connections(profile, { readOnly: true })}
                        ${state.mode === 'self' ? `<button type="button" class="gp-btn ghost block" data-gp-edit>จัดการการเชื่อมต่อ</button>` : ''}
                    </section>
                    ${chartCard(profile)}
                </aside>
            </div>
        </div>`;
    }

    function fullPanels(profile) {
        return `
        <div class="gp-panel" data-gp-panel="streams" hidden><section class="gp-card"><div class="gp-card-head"><h2>ไลฟ์สดล่าสุด</h2></div>${streams(profile)}</section></div>
        <div class="gp-panel" data-gp-panel="achievements" hidden>${achievementsPanel(profile)}</div>
        <div class="gp-panel" data-gp-panel="about" hidden>${aboutCard(profile)}</div>
        ${state.mode === 'self' ? `<div class="gp-panel" data-gp-panel="account" hidden><section class="gp-card"><div class="gp-card-head"><h2>ข้อมูลบัญชี</h2><button class="gp-btn" data-gp-edit>แก้ไขโปรไฟล์</button></div>${accountInfo(profile)}</section></div>
        <div class="gp-panel" data-gp-panel="privacy" hidden><section class="gp-card"><div class="gp-card-head"><h2>ความเป็นส่วนตัว</h2><button class="gp-btn primary" data-gp-privacy>แก้ไข</button></div>${privacySummary(profile)}</section></div>` : ''}`;
    }

    function privacySummary(profile) {
        const privacy = profile.privacy || {};
        const rows = [
            ['โปรไฟล์', privacy.profile || 'public'],
            ['Social Links', privacy.socialLinks || 'public'],
            ['Achievements', privacy.achievements || 'public'],
            ['Recent Streams', privacy.streams || 'public'],
            ['Activity', privacy.activity || 'friends']
        ];
        return `<div class="gp-field-list">${rows.map(([label, value]) => `<div class="gp-field"><label>${label}</label><div><span>${esc(String(value).toUpperCase())}</span></div></div>`).join('')}</div>`;
    }

    function tabs() {
        const common = [
            ['overview', 'ภาพรวม', 'dashboard'],
            ['streams', 'ไลฟ์สดล่าสุด', 'live_tv'],
            ['achievements', 'ความสำเร็จ', 'military_tech'],
            ['about', 'เกี่ยวกับฉัน', 'info']
        ];
        const own = state.mode === 'self'
            ? [['account', 'บัญชี', 'manage_accounts'], ['privacy', 'ความเป็นส่วนตัว', 'lock']]
            : [];
        return `<nav class="gp-tabs" role="tablist" aria-label="แท็บโปรไฟล์">${common.concat(own).map(([id, label, ico]) => `<button type="button" class="gp-tab${state.activeTab === id ? ' active' : ''}" data-gp-tab="${id}" role="tab" aria-selected="${state.activeTab === id}"><span class="material-symbols-outlined">${ico}</span>${label}</button>`).join('')}</nav>`;
    }

    function render(profile) {
        const root = document.getElementById('gameProfileRoot');
        if (!root) return;
        root.innerHTML = `<div class="gp-page">
            <div class="gp-topline">
                <button type="button" class="gp-back" data-gp-back><span class="material-symbols-outlined">arrow_back</span> กลับไปหน้าแรก</button>
                <div class="gp-topline-actions">${heroActions(profile)}</div>
            </div>
            <div class="gp-column">
                ${hero(profile)}
                ${tabs()}
                ${overviewPanel(profile)}
                ${fullPanels(profile)}
            </div>
        </div>
        <div class="gp-menu" id="gpContextMenu" hidden></div>
        <div class="gp-modal" id="gpModal" hidden></div>`;
        setTab(state.activeTab, false);
        bindAboutForm();
    }

    function setTab(tab, focus) {
        let next = tab || 'overview';
        if (next === 'connections') next = 'about';
        if (next === 'stats') next = 'overview';
        if (next !== 'about') state.editingAbout = false;
        state.activeTab = next;
        document.querySelectorAll('#profileView [data-gp-tab]').forEach((button) => {
            const active = button.dataset.gpTab === state.activeTab;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active && focus) button.focus();
        });
        document.querySelectorAll('#profileView [data-gp-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.gpPanel !== state.activeTab;
        });
    }

    function bindAboutForm() {
        // save is handled via data-gp-about-save click — no native form submit
    }

    async function saveAboutProfile() {
        if (state.mode !== 'self' || !state.data) return;
        const formEl = document.getElementById('gpAboutForm');
        if (!formEl) return;
        const submit = formEl.querySelector('[data-gp-about-save]');
        if (submit) submit.disabled = true;
        const form = new FormData(formEl);
        const patch = {
            bio: String(form.get('bio') || '').trim(),
            country: String(form.get('country') || '').trim(),
            province: String(form.get('province') || '').trim(),
            languages: String(form.get('languages') || '').trim(),
            contentTypes: String(form.get('contentTypes') || '').trim(),
            streamGear: String(form.get('streamGear') || '').trim()
        };
        try {
            const extendedOk = await apiOptional(API.me, { method: 'PATCH', body: JSON.stringify(patch) });
            writeLocalExtended(currentUsername(), {
                ...(readLocalExtended(currentUsername()) || {}),
                ...patch
            });
            Object.assign(state.data, patch);
            if (!state.data.profile) state.data.profile = {};
            state.editingAbout = false;
            render(state.data);
            setTab('about', false);
            toast(extendedOk ? 'success' : 'warning', extendedOk ? 'บันทึกเกี่ยวกับฉันแล้ว' : 'บันทึกบนเครื่องแล้ว', extendedOk ? '' : 'ซิงก์ Cloud ไม่ได้ — แสดงผลจากข้อมูลในเครื่อง');
        } catch (err) {
            toast('error', 'บันทึกไม่สำเร็จ', err.message);
            if (submit) submit.disabled = false;
        }
    }

    function localExtKey(username) {
        return `tc_gp_ext_${String(username || currentUsername() || 'me').toLowerCase()}`;
    }

    function readLocalExtended(username) {
        try {
            return JSON.parse(localStorage.getItem(localExtKey(username)) || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function writeLocalExtended(username, patch) {
        const prev = readLocalExtended(username);
        const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
        localStorage.setItem(localExtKey(username), JSON.stringify(next));
        return next;
    }

    async function uploadImageAsset(file, label, purpose) {
        if (!(file instanceof File) || !file.size) return '';
        if (!file.type.startsWith('image/')) throw new Error(`${label} ต้องเป็นไฟล์รูปภาพ`);
        if (file.size > 6 * 1024 * 1024) throw new Error(`${label} ต้องไม่เกิน 6 MB`);
        const dataUrl = await fileToDataUrl(file);
        const headers = { 'Content-Type': 'application/json' };
        const auth = token();
        if (auth) headers.Authorization = `Bearer ${auth}`;
        const body = JSON.stringify({
            dataUrl,
            mimeType: file.type || 'image/png',
            purpose: purpose || (String(label).toLowerCase().includes('cover') ? 'cover' : 'avatar')
        });
        let response = await fetch('/api/assets/upload', { method: 'POST', headers, body });
        let data = await response.json().catch(() => ({}));
        if ((!response.ok || !data.url) && location.origin) {
            response = await fetch(`${location.origin}/api/assets/upload`, { method: 'POST', headers, body });
            data = await response.json().catch(() => ({}));
        }
        if (!response.ok || !data.url) throw new Error(data.error || `อัปโหลด${label}ไม่สำเร็จ`);
        return mediaUrl(data.url) || persistableUrl(data.url);
    }

    async function loadClassicSelfProfile() {
        const classic = await api('/api/profile');
        const user = classic.user || classic;
        const me = global.currentUser || {};
        return {
            success: true,
            user: {
                id: user.id || me.id || '',
                username: user.username || me.username || '',
                displayName: user.displayName || me.displayName || user.username || me.username || '',
                avatarUrl: user.avatarUrl || me.avatarUrl || '',
                email: user.email || me.email || '',
                isPro: !!(user.isPro ?? me.isPro),
                proExpireAt: user.proExpireAt || me.proExpireAt || null,
                role: user.role || me.role || 'free',
                createdAt: user.createdAt || me.createdAt || null,
                accountStatus: 'active'
            },
            profile: {
                coverUrl: '',
                bio: '',
                level: 1,
                xp: 0,
                rank: 'New Streamer',
                lastActive: new Date().toISOString(),
                counters: { followers: 0, following: 0, friends: 0, achievements: 0, streams: 0 }
            },
            connections: [],
            privacy: {},
            compatibilityMode: true
        };
    }

    async function loadClassicPublicProfile(requestedUsername) {
        const username = String(requestedUsername || '').replace(/^@/, '').trim();
        const lower = username.toLowerCase();
        let match = null;
        let relationship = { status: 'NONE', state: 'NONE' };
        try {
            const friends = await api('/api/friends');
            const link = (friends.list || []).find((item) => String(item.friendUsername || '').toLowerCase() === lower);
            const incoming = (friends.incoming || []).find((item) => String(item.fromUsername || '').toLowerCase() === lower);
            const outgoing = (friends.outgoing || []).find((item) => String(item.toUsername || '').toLowerCase() === lower);
            if (link) {
                match = {
                    id: link.friendUserId,
                    username: link.friendUsername,
                    displayName: link.friendDisplayName || link.friendUsername,
                    avatarUrl: link.friendAvatarUrl || ''
                };
                relationship = { status: 'FRIENDS', state: 'FRIENDS', linkId: link.id };
            } else if (incoming) {
                match = {
                    id: incoming.fromUserId,
                    username: incoming.fromUsername,
                    displayName: incoming.fromDisplayName || incoming.fromUsername,
                    avatarUrl: incoming.fromAvatarUrl || ''
                };
                relationship = { status: 'REQUEST_RECEIVED', state: 'REQUEST_RECEIVED', requestId: incoming.id };
            } else if (outgoing) {
                match = {
                    username: outgoing.toUsername,
                    displayName: outgoing.toUsername,
                    avatarUrl: ''
                };
                relationship = { status: 'REQUEST_SENT', state: 'REQUEST_SENT' };
            }
        } catch (_) {}
        if (!match) {
            const search = await apiOptional(API.search(username));
            const hit = (search?.users || search?.list || []).find((item) => String(item.username || '').toLowerCase() === lower);
            if (hit) match = hit;
        }
        if (!match) {
            const error = new Error(`ไม่พบบัญชี @${username}`);
            error.status = 404;
            throw error;
        }
        return {
            success: true,
            visible: true,
            user: match,
            profile: {
                coverUrl: '',
                bio: '',
                level: 1,
                xp: 0,
                rank: 'New Streamer',
                counters: { followers: 0, following: 0, friends: 0, achievements: 0, streams: 0 }
            },
            relationship,
            connections: [],
            mutualFriends: [],
            compatibilityMode: true
        };
    }

    async function loadProfilePayload(mode, requestedUsername) {
        let base = null;
        if (mode === 'self') {
            // sync achievements in background — don't block first paint
            api('/api/profile/achievements/sync', { method: 'POST', body: '{}' }).catch(() => {});
            base = await apiOptional(API.me);
            if (!base?.user && !base?.profile) base = await loadClassicSelfProfile();
        } else {
            base = await apiOptional(API.public(requestedUsername));
            if (!base?.user && !base?.profile) base = await loadClassicPublicProfile(requestedUsername);
        }
        const username = String(base?.user?.username || requestedUsername || currentUsername()).trim();
        const tasks = [
            apiOptional(API.achievements(username)),
            apiOptional(API.activity(username)),
            apiOptional(API.streams(username))
        ];
        if (mode === 'public') tasks.push(apiOptional(API.relationship(username)));
        else tasks.push(apiOptional(API.connections), apiOptional(API.privacy));
        const results = await Promise.all(tasks);
        const payload = {
            ...base,
            achievements: results[0]?.achievements || base.achievements || [],
            activity: results[1]?.activity || base.activity || [],
            streams: results[2]?.streams || base.streams || []
        };
        if (mode === 'public') {
            const rel = results[3] || {};
            payload.relationship = {
                ...(typeof base.relationship === 'object' ? base.relationship : {}),
                ...rel,
                status: rel.state || base.relationship?.status || base.relationship?.state || base.relationship || 'NONE'
            };
            payload.mutualFriends = rel.mutualFriends || base.mutualFriends || [];
            // resolve friend link/request ids without blocking if friends API is slow
            apiOptional('/api/friends').then((friends) => {
                if (!friends || !state.data) return;
                const lower = username.toLowerCase();
                const incoming = (friends.incoming || []).find((item) => String(item.fromUsername || '').toLowerCase() === lower);
                const link = (friends.list || []).find((item) => String(item.friendUsername || '').toLowerCase() === lower);
                if (incoming || link) {
                    if (!state.data.relationship) state.data.relationship = {};
                    if (incoming) state.data.relationship.requestId = incoming.id;
                    if (link) state.data.relationship.linkId = link.id;
                }
            }).catch(() => {});
        } else {
            payload.connections = results[3]?.list || base.connections || [];
            payload.privacy = results[4]?.privacy || base.privacy || {};
            const local = readLocalExtended(username);
            if (!payload.profile) payload.profile = {};
            ['bio', 'coverUrl', 'country', 'province', 'languages', 'contentTypes', 'streamGear'].forEach((key) => {
                const cloudVal = payload.profile[key];
                let localVal = local[key];
                if (key === 'coverUrl') {
                    if (String(localVal || '').startsWith('blob:')) localVal = '';
                    if (String(cloudVal || '').startsWith('blob:')) payload.profile[key] = '';
                }
                if (localVal && (!cloudVal || (key === 'coverUrl' && String(cloudVal).startsWith('data:')))) {
                    payload.profile[key] = localVal;
                } else if (!cloudVal && localVal) {
                    payload.profile[key] = localVal;
                }
            });
            if ((!payload.connections || !payload.connections.length) && Array.isArray(local.connections)) {
                payload.connections = local.connections;
            }
        }
        return payload;
    }

    async function loadProfile(username, options) {
        const root = document.getElementById('gameProfileRoot');
        if (!root) return;
        const seq = ++state.loadSeq;
        const selfName = currentUsername();
        const requested = String(username || selfName || '').replace(/^@/, '').trim();
        state.mode = !requested || requested.toLowerCase() === selfName.toLowerCase() ? 'self' : 'public';
        state.username = state.mode === 'self' ? selfName : requested;
        state.activeTab = options?.tab || 'overview';
        if (state.activeTab === 'stats') state.activeTab = 'overview';
        state.editingAbout = false;
        state.achievementFilter = 'all';
        state.loading = true;
        root.innerHTML = skeleton();
        try {
            if (!token()) throw Object.assign(new Error('กรุณาเข้าสู่ระบบเพื่อเปิด Profile'), { status: 401 });
            const payload = await loadProfilePayload(state.mode, state.username);
            if (seq !== state.loadSeq) return;
            state.data = normalize(payload, state.mode);
            if (!state.data.username) throw Object.assign(new Error('ไม่พบผู้ใช้นี้'), { status: 404 });
            render(state.data);
        } catch (err) {
            if (seq !== state.loadSeq) return;
            const notFound = err.status === 404;
            root.innerHTML = errorView(
                notFound ? 'ไม่พบผู้ใช้นี้' : 'ไม่สามารถโหลดข้อมูลโปรไฟล์ได้',
                notFound ? `ไม่พบบัญชี @${state.username || requested}` : err.message,
                !notFound
            );
        } finally {
            if (seq === state.loadSeq) state.loading = false;
        }
    }

    function profileUrl(username) {
        const clean = String(username || '').replace(/^@/, '').trim();
        if (!clean) return location.origin + '/';
        return `${location.origin}/profile/${encodeURIComponent(clean)}`;
    }

    function navigatePath(username, replace) {
        const clean = String(username || currentUsername() || '').replace(/^@/, '').trim();
        if (!clean) return;
        const path = `/profile/${encodeURIComponent(clean)}`;
        if (replace) history.replaceState({ gp: clean }, '', path);
        else history.pushState({ gp: clean }, '', path);
    }

    async function openUserProfile(username, options) {
        if (!token()) {
            if (typeof global.openLoginModal === 'function') global.openLoginModal();
            else toast('warning', 'กรุณาเข้าสู่ระบบ');
            return;
        }
        global.closeFriendsModal?.();
        const userMenu = document.getElementById('userMenuPanel');
        if (userMenu?.classList.contains('open')) global.toggleUserMenu?.();
        const currentActive = document.querySelector('.app-view.active');
        if (currentActive?.id && currentActive.id !== 'profileView') {
            state.previousView = currentActive.id.replace(/View$/, '') || 'dashboard';
        }
        state.active = true;
        if (options?.force) state.loading = false;
        if (typeof global.switchMainTab === 'function') await global.switchMainTab('profile');
        else {
            document.querySelectorAll('.app-view').forEach((view) => view.classList.toggle('active', view.id === 'profileView'));
        }
        const target = String(username || currentUsername() || '').replace(/^@/, '').trim();
        if (!options?.fromPop) navigatePath(target, !!options?.replace);
        await loadProfile(target, options);
    }

    function closeProfile() {
        state.active = false;
        const hadProfilePath = /^\/profile\//i.test(location.pathname) || !!history.state?.gp;
        clearProfilePath();
        global.switchMainTab?.(state.previousView || 'dashboard');
        if (hadProfilePath && history.state?.gp) {
            // keep history clean without reopening profile via popstate
            try { history.replaceState({}, '', '/'); } catch (_) {}
        }
    }

    function toast(type, title, detail) {
        if (typeof global.showCustomMsg === 'function') {
            global.showCustomMsg(type || 'info', title, detail || '');
            return;
        }
        if (typeof global.showCenterModal === 'function') {
            global.showCenterModal(type || 'info', title, detail || '');
            return;
        }
        console.info(title, detail || '');
    }

    async function confirmAction(message, opts) {
        if (typeof global.tcConfirm === 'function') return global.tcConfirm(message, opts || {});
        return global.confirm(message);
    }

    function requireLogin() {
        if (token()) return true;
        global.openLoginModal?.();
        toast('warning', 'กรุณาเข้าสู่ระบบ', 'เข้าสู่ระบบก่อนใช้ฟีเจอร์ Social');
        return false;
    }

    async function copyText(value, label) {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(String(value));
            toast('success', label || 'คัดลอกแล้ว', String(value));
        } catch (_) {
            const area = document.createElement('textarea');
            area.value = String(value);
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
            toast('success', label || 'คัดลอกแล้ว');
        }
    }

    async function sendFriendRequest() {
        if (!requireLogin()) return;
        const profile = state.data;
        if (!profile) return;
        try {
            await api('/api/friends', { method: 'POST', body: JSON.stringify({ username: profile.username }) });
            profile.friendStatus = 'REQUEST_SENT';
            render(profile);
            toast('success', 'ส่งคำขอแล้ว', `ส่งคำขอเป็นเพื่อนถึง @${profile.username}`);
        } catch (err) { toast('error', 'ส่งคำขอไม่สำเร็จ', err.message); }
    }

    async function acceptRequest() {
        if (!requireLogin()) return;
        const requestId = state.data?.relationship?.requestId;
        if (!requestId) return toast('error', 'ตอบรับไม่ได้', 'ไม่พบหมายเลขคำขอ');
        try {
            await api(`/api/friends/requests/${encodeURIComponent(requestId)}/accept`, { method: 'POST' });
            state.data.friendStatus = 'FRIENDS';
            render(state.data);
            toast('success', 'เป็นเพื่อนแล้ว');
        } catch (err) { toast('error', 'ตอบรับไม่สำเร็จ', err.message); }
    }

    async function removeCurrentFriend() {
        if (!requireLogin()) return;
        let linkId = state.data?.relationship?.linkId;
        const ok = await confirmAction(`ลบ @${state.data?.username} ออกจากรายชื่อเพื่อน?`, { title: 'ลบเพื่อน', okLabel: 'ลบ' });
        if (!ok) return;
        try {
            if (!linkId) {
                const friends = await api('/api/friends');
                const lower = String(state.data?.username || '').toLowerCase();
                const hit = (friends.list || []).find((item) => String(item.friendUsername || '').toLowerCase() === lower);
                linkId = hit?.id;
            }
            if (!linkId) throw new Error('ไม่พบลิงก์เพื่อนในระบบ');
            await api(`/api/friends/${encodeURIComponent(linkId)}`, { method: 'DELETE' });
            state.data.friendStatus = 'NONE';
            if (state.data.relationship) {
                state.data.relationship.linkId = null;
                state.data.relationship.status = 'NONE';
            }
            render(state.data);
            toast('success', 'ลบเพื่อนแล้ว');
        } catch (err) { toast('error', 'ลบเพื่อนไม่สำเร็จ', err.message); }
    }

    async function blockUser() {
        if (!requireLogin()) return;
        const profile = state.data;
        if (!profile) return;
        const ok = await confirmAction(`บล็อก @${profile.username}? ผู้ใช้นี้จะติดต่อคุณไม่ได้`, { title: 'บล็อกผู้ใช้', okLabel: 'บล็อก' });
        if (!ok) return;
        try {
            await api(API.block(profile.username), { method: 'POST' });
            profile.friendStatus = 'BLOCKED';
            profile.viewerBlocked = true;
            closeContextMenu();
            render(profile);
            toast('success', 'บล็อกผู้ใช้แล้ว');
        } catch (err) { toast('error', 'บล็อกไม่สำเร็จ', err.message); }
    }

    async function unblockUser() {
        if (!requireLogin()) return;
        const profile = state.data;
        if (!profile) return;
        try {
            await api(API.block(profile.username), { method: 'DELETE' });
            profile.friendStatus = 'NONE';
            profile.viewerBlocked = false;
            render(profile);
            toast('success', 'ยกเลิกการบล็อกแล้ว');
        } catch (err) { toast('error', 'ดำเนินการไม่สำเร็จ', err.message); }
    }

    function openReport() {
        if (!requireLogin()) return;
        const profile = state.data;
        if (!profile) return;
        showModal(`<div class="gp-modal-card" role="dialog" aria-modal="true" aria-labelledby="gpReportTitle">
            <div class="gp-modal-head"><h2 id="gpReportTitle">รายงาน @${esc(profile.username)}</h2><button class="gp-icon-btn" data-gp-modal-close aria-label="ปิด">${icon('x', 'close')}</button></div>
            <form class="gp-modal-body" id="gpReportForm">
                <div class="gp-form-grid">
                    <div class="gp-form-field full"><label>เหตุผล</label><select class="gp-select" name="reason" required><option value="spam">Spam</option><option value="harassment">การคุกคาม</option><option value="impersonation">แอบอ้างบุคคลอื่น</option><option value="inappropriate">เนื้อหาไม่เหมาะสม</option><option value="other">อื่น ๆ</option></select></div>
                    <div class="gp-form-field full"><label>รายละเอียด</label><textarea class="gp-textarea" name="details" maxlength="1000" placeholder="อธิบายสิ่งที่เกิดขึ้น"></textarea></div>
                </div>
                <div class="gp-form-actions"><button type="button" class="gp-btn" data-gp-modal-close>ยกเลิก</button><button type="submit" class="gp-btn danger">ส่งรายงาน</button></div>
            </form>
        </div>`);
        document.getElementById('gpReportForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
                await api(API.report, { method: 'POST', body: JSON.stringify({ username: profile.username, reason: form.get('reason'), details: form.get('details') }) });
                closeModal();
                toast('success', 'ส่งรายงานแล้ว', 'ทีมงานจะตรวจสอบรายงานนี้');
            } catch (err) { toast('error', 'ส่งรายงานไม่สำเร็จ', err.message); }
        });
    }

    function openContextMenu(anchor) {
        const menu = document.getElementById('gpContextMenu');
        const profile = state.data;
        if (!menu || !profile) return;
        const isFriend = profile.friendStatus === 'FRIENDS';
        menu.innerHTML = `
            <button type="button" data-gp-share>${icon('link', 'share')} แชร์โปรไฟล์</button>
            <button type="button" data-gp-copy="${attr(profileUrl(profile.username))}">${icon('copy', 'content_copy')} คัดลอก Profile URL</button>
            <button type="button" data-gp-report>${icon('alert', 'flag')} รายงานผู้ใช้</button>
            ${isFriend ? `<button type="button" class="danger" data-gp-remove>${icon('users', 'person_remove')} ลบเพื่อน</button>` : ''}
            ${profile.viewerBlocked
                ? `<button type="button" class="danger" data-gp-unblock>${icon('shield', 'block')} ยกเลิกการบล็อก</button>`
                : profile.blockedByViewer
                    ? ''
                    : `<button type="button" class="danger" data-gp-block>${icon('shield', 'block')} บล็อกผู้ใช้</button>`}`;
        const rect = anchor.getBoundingClientRect();
        menu.hidden = false;
        menu.style.left = `${Math.max(8, Math.min(rect.right - 210, innerWidth - 218))}px`;
        menu.style.top = `${Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 8)}px`;
        state.contextOpen = true;
    }

    function closeContextMenu() {
        const menu = document.getElementById('gpContextMenu');
        if (menu) menu.hidden = true;
        state.contextOpen = false;
    }

    function showModal(content) {
        const modal = document.getElementById('gpModal');
        if (!modal) return;
        modal.innerHTML = content;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => modal.querySelector('button, input, textarea, select')?.focus());
    }

    function closeModal() {
        const modal = document.getElementById('gpModal');
        if (!modal) return;
        modal.hidden = true;
        modal.innerHTML = '';
        document.body.style.overflow = '';
    }

    function editProfileModal() {
        const p = state.data;
        if (!p) return;
        const byPlatform = Object.fromEntries(p.connections.map((x) => [String(x.platform || '').toLowerCase(), x]));
        showModal(`<div class="gp-modal-card" role="dialog" aria-modal="true" aria-labelledby="gpEditTitle">
            <div class="gp-modal-head"><h2 id="gpEditTitle">แก้ไข Gaming Profile</h2><button class="gp-icon-btn" data-gp-modal-close aria-label="ปิด">${icon('x', 'close')}</button></div>
            <form class="gp-modal-body" id="gpEditForm">
                <div class="gp-form-grid">
                    <div class="gp-form-field full"><label>Display Name</label><input class="gp-input" name="displayName" maxlength="40" required value="${attr(p.displayName)}"></div>
                    <div class="gp-form-field full">
                        <label>รูปโปรไฟล์ (Avatar)</label>
                        <div class="gp-upload-row">
                            <img class="gp-upload-preview" id="gpAvatarPreview" src="${attr(avatarFor(p))}" alt="">
                            <div class="gp-upload-actions">
                                <input class="gp-input" name="avatarUrl" type="text" value="${attr(/^https?:\/\//i.test(p.avatarUrl) || /^\/api\/assets\//i.test(p.avatarUrl) ? p.avatarUrl : '')}" placeholder="วาง URL รูป หรืออัปโหลดด้านล่าง">
                                <input class="gp-input" name="avatarFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                            </div>
                        </div>
                    </div>
                    <div class="gp-form-field full">
                        <label>รูปปก (Cover)</label>
                        ${mediaUrl(p.coverUrl) ? `<img class="gp-upload-preview cover" id="gpCoverPreview" src="${attr(mediaUrl(p.coverUrl))}" alt="">` : `<img class="gp-upload-preview cover" id="gpCoverPreview" hidden alt="">`}
                        <div class="gp-upload-actions" style="margin-top:8px">
                            <input class="gp-input" name="coverUrl" type="text" value="${attr(persistableUrl(p.coverUrl))}" placeholder="วาง URL รูปปก หรืออัปโหลดไฟล์">
                            <input class="gp-input" name="coverFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                        </div>
                    </div>
                    <div class="gp-form-field full"><label>Bio</label><textarea class="gp-textarea" name="bio" maxlength="300" placeholder="เล่าเกี่ยวกับตัวคุณสั้นๆ">${esc(p.bio)}</textarea></div>
                    ${['TikTok','Discord','YouTube','Twitch'].map((platform) => {
                        const item = byPlatform[platform.toLowerCase()] || {};
                        const value = item.url || item.accountName || item.username || item.handle || '';
                        return `<div class="gp-form-field"><label>${platform}</label><input class="gp-input" name="social_${platform.toLowerCase()}" maxlength="300" value="${attr(value)}" placeholder="วางลิงก์หรือ @username"></div>`;
                    }).join('')}
                </div>
                <div class="gp-form-actions"><button type="button" class="gp-btn" data-gp-modal-close>ยกเลิก</button><button type="submit" class="gp-btn primary">บันทึกโปรไฟล์</button></div>
            </form>
        </div>`);
        const formEl = document.getElementById('gpEditForm');
        formEl?.addEventListener('submit', saveProfile);
        formEl?.querySelector('[name="avatarFile"]')?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            pendingAvatarFile = file;
            const preview = document.getElementById('gpAvatarPreview');
            if (preview) preview.src = URL.createObjectURL(file);
        });
        formEl?.querySelector('[name="coverFile"]')?.addEventListener('change', (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            pendingCoverFile = file;
            const urlInput = formEl.querySelector('[name="coverUrl"]');
            if (urlInput && String(urlInput.value || '').startsWith('blob:')) urlInput.value = '';
            const preview = document.getElementById('gpCoverPreview');
            if (preview) {
                preview.hidden = false;
                preview.src = URL.createObjectURL(file);
            }
        });
    }

    async function uploadDataUrlAsset(dataUrl, label, purpose) {
        const headers = { 'Content-Type': 'application/json' };
        const auth = token();
        if (auth) headers.Authorization = `Bearer ${auth}`;
        const body = JSON.stringify({
            dataUrl,
            mimeType: String(dataUrl).split(';')[0].replace('data:', '') || 'image/png',
            purpose: purpose || 'avatar'
        });
        let response = await fetch('/api/assets/upload', { method: 'POST', headers, body });
        let data = await response.json().catch(() => ({}));
        if ((!response.ok || !data.url) && location.origin) {
            response = await fetch(`${location.origin}/api/assets/upload`, { method: 'POST', headers, body });
            data = await response.json().catch(() => ({}));
        }
        if (!response.ok || !data.url) throw new Error(data.error || `อัปโหลด${label}ไม่สำเร็จ`);
        return mediaUrl(data.url) || persistableUrl(data.url);
    }

    async function saveProfile(event) {
        event.preventDefault();
        const submit = event.currentTarget.querySelector('[type="submit"]');
        if (submit) submit.disabled = true;
        const form = new FormData(event.currentTarget);
        let avatarUrl = persistableUrl(form.get('avatarUrl'));
        let coverUrl = persistableUrl(form.get('coverUrl'));
        const avatarFile = (pendingAvatarFile instanceof File && pendingAvatarFile.size)
            ? pendingAvatarFile
            : form.get('avatarFile');
        const coverFile = (pendingCoverFile instanceof File && pendingCoverFile.size)
            ? pendingCoverFile
            : form.get('coverFile');
        const previousAvatar = persistableUrl(state.data?.avatarUrl);
        const previousCover = persistableUrl(state.data?.coverUrl);
        try {
            if (avatarFile instanceof File && avatarFile.size) {
                avatarUrl = await uploadImageAsset(avatarFile, 'Avatar', 'avatar');
            } else if (avatarUrl.startsWith('data:image/')) {
                avatarUrl = await uploadDataUrlAsset(avatarUrl, 'Avatar', 'avatar');
            } else if (!avatarUrl) {
                avatarUrl = previousAvatar;
            }
            if (coverFile instanceof File && coverFile.size) {
                coverUrl = await uploadImageAsset(coverFile, 'Cover', 'cover');
            } else if (coverUrl.startsWith('data:image/')) {
                coverUrl = await uploadDataUrlAsset(coverUrl, 'Cover', 'cover');
            } else if (!coverUrl) {
                coverUrl = previousCover;
            }
            pendingAvatarFile = null;
            pendingCoverFile = null;
        } catch (err) {
            toast('error', 'อัปโหลดรูปไม่สำเร็จ', err.message);
            if (submit) submit.disabled = false;
            return;
        }
        const connections = ['tiktok','discord','youtube','twitch'].map((platform) => {
            const raw = String(form.get(`social_${platform}`) || '').trim();
            const isLink = /^https?:\/\//i.test(raw) || /^(www\.|tiktok\.com|discord\.|youtube\.|youtu\.be|twitch\.tv)/i.test(raw);
            const handle = isLink ? '' : raw.replace(/^@/, '');
            const url = isLink
                ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/\//, '')}`)
                : socialUrl(platform, handle);
            return {
                platform: platform[0].toUpperCase() + platform.slice(1),
                accountName: handle || raw,
                url,
                connected: !!raw,
                visible: true
            };
        });
        const core = {
            displayName: String(form.get('displayName') || '').trim(),
            avatarUrl
        };
        const extended = {
            coverUrl,
            bio: String(form.get('bio') || '').trim()
        };
        try {
            await api('/api/profile', { method: 'PUT', body: JSON.stringify(core) });
            const extendedOk = await apiOptional(API.me, { method: 'PATCH', body: JSON.stringify(extended) });
            let connectionsOk = false;
            if (extendedOk !== false) {
                const results = await Promise.all(connections.map((connection) => connection.connected
                    ? apiOptional(`${API.connections}/${encodeURIComponent(connection.platform.toLowerCase())}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            handle: connection.accountName,
                            url: connection.url || ''
                        })
                    })
                    : apiOptional(`${API.connections}/${encodeURIComponent(connection.platform.toLowerCase())}`, { method: 'DELETE' })));
                connectionsOk = results.every(Boolean);
            }
            writeLocalExtended(currentUsername(), {
                ...extended,
                connections,
                avatarUrl: core.avatarUrl,
                displayName: core.displayName
            });
            if (global.currentUser) {
                global.currentUser.displayName = core.displayName;
                global.currentUser.avatarUrl = core.avatarUrl;
                global.updateAccountUI?.();
            }
            // ปิดป๊อปอัปทันที แล้วค่อยรีเฟรชข้อมูลโปรไฟล์
            closeModal();
            if (state.data) {
                Object.assign(state.data, {
                    displayName: core.displayName,
                    avatarUrl: core.avatarUrl,
                    coverUrl,
                    bio: extended.bio,
                    connections: connections.filter((c) => c.connected).map((c) => ({
                        platform: c.platform,
                        accountName: c.accountName,
                        url: c.url,
                        connected: true
                    }))
                });
                render(state.data);
            }
            toast(
                extendedOk ? 'success' : 'warning',
                extendedOk ? 'บันทึกโปรไฟล์แล้ว' : 'บันทึกบนเครื่องแล้ว',
                extendedOk
                    ? (connectionsOk ? '' : 'บาง Social Connection อาจยังไม่ซิงก์')
                    : 'บางส่วนซิงก์ Cloud ไม่ได้ — แสดงผลจากข้อมูลในเครื่อง'
            );
            // soft refresh in background
            loadProfilePayload('self', currentUsername()).then((payload) => {
                if (!payload) return;
                state.data = normalize(payload, 'self');
                render(state.data);
            }).catch(() => {});
        } catch (err) {
            toast('error', 'บันทึกไม่สำเร็จ', err.message);
            if (submit) submit.disabled = false;
        }
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
            reader.readAsDataURL(file);
        });
    }

    async function toggleConnection(index) {
        const item = state.data?.connections?.[Number(index)];
        if (!item) return;
        if (!item.connected) {
            editProfileModal();
            return;
        }
        const ok = await confirmAction(`ยกเลิกการเชื่อมต่อ ${item.platform}?`, { title: 'Disconnect Social', okLabel: 'Disconnect' });
        if (!ok) return;
        try {
            await api(`${API.connections}/${encodeURIComponent(String(item.platform || '').toLowerCase())}`, { method: 'DELETE' });
            state.data.connections.splice(Number(index), 1);
            render(state.data);
            toast('success', `ยกเลิกการเชื่อมต่อ ${item.platform} แล้ว`);
        } catch (err) { toast('error', 'ดำเนินการไม่สำเร็จ', err.message); }
    }

    function privacyModal() {
        const p = state.data?.privacy || {};
        const fields = [
            ['profile', 'โปรไฟล์'],
            ['socialLinks', 'Social Links'],
            ['achievements', 'Achievements'],
            ['streams', 'Recent Streams'],
            ['activity', 'Activity']
        ];
        showModal(`<div class="gp-modal-card" role="dialog" aria-modal="true" aria-labelledby="gpPrivacyTitle">
            <div class="gp-modal-head"><h2 id="gpPrivacyTitle">ความเป็นส่วนตัว</h2><button class="gp-icon-btn" data-gp-modal-close aria-label="ปิด">${icon('x', 'close')}</button></div>
            <form class="gp-modal-body" id="gpPrivacyForm">
                <div class="gp-form-grid">${fields.map(([name, label]) => `<div class="gp-form-field"><label>${label}</label><select class="gp-select keep-native-select" name="${name}">${['public','friends','private'].map((value) => `<option value="${value}" ${String(p[name] || (name === 'activity' ? 'friends' : 'public')) === value ? 'selected' : ''}>${value.toUpperCase()}</option>`).join('')}</select></div>`).join('')}</div>
                <div class="gp-form-actions"><button type="button" class="gp-btn" data-gp-modal-close>ยกเลิก</button><button type="submit" class="gp-btn primary">บันทึก</button></div>
            </form>
        </div>`);
        document.getElementById('gpPrivacyForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const privacy = Object.fromEntries(fields.map(([name]) => [name, form.get(name)]));
            const backendPrivacy = {
                profileVisibility: privacy.profile,
                socialVisibility: privacy.socialLinks,
                achievementsVisibility: privacy.achievements,
                streamsVisibility: privacy.streams,
                activityVisibility: privacy.activity
            };
            try {
                const payload = await api(API.privacy, { method: 'PUT', body: JSON.stringify(backendPrivacy) });
                state.data.privacy = normalize({ profile: state.data, privacy: payload.privacy || backendPrivacy }, 'self').privacy;
                closeModal();
                render(state.data);
                setTab('privacy');
                toast('success', 'บันทึกความเป็นส่วนตัวแล้ว');
            } catch (err) { toast('error', 'บันทึกไม่สำเร็จ', 'ฟีเจอร์นี้ต้องอัปเดต Cloud Backend ก่อน'); }
        });
    }

    async function searchModal() {
        if (!document.getElementById('gpModal')) {
            await openUserProfile(currentUsername());
        }
        showModal(`<div class="gp-modal-card" role="dialog" aria-modal="true" aria-labelledby="gpSearchTitle">
            <div class="gp-modal-head"><h2 id="gpSearchTitle">ค้นหาผู้ใช้</h2><button class="gp-icon-btn" data-gp-modal-close aria-label="ปิด">${icon('x', 'close')}</button></div>
            <div class="gp-modal-body">
                <input class="gp-input" id="gpUserSearchInput" type="search" placeholder="ค้นหา username หรือชื่อที่แสดง..." autocomplete="off">
                <div id="gpUserSearchResults" style="margin-top:10px">${empty('เริ่มค้นหาผู้ใช้', 'พิมพ์อย่างน้อย 2 ตัวอักษร', 'search')}</div>
            </div>
        </div>`);
        const input = document.getElementById('gpUserSearchInput');
        let timer;
        input?.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => runSearch(input.value), 280);
        });
    }

    async function runSearch(query) {
        const box = document.getElementById('gpUserSearchResults');
        const q = String(query || '').trim();
        if (!box || q.length < 2) return;
        box.innerHTML = `<div class="gp-skel" style="height:62px"></div>`;
        try {
            const payload = await api(API.search(q));
            const list = payload.users || payload.list || [];
            box.innerHTML = list.length ? `<div class="gp-list">${list.map((user) => `<button type="button" class="gp-list-row" data-gp-open-user="${attr(user.username)}" style="width:100%;border-left:0;border-right:0;border-top:0;background:transparent;text-align:left;cursor:pointer">
                <img src="${attr(avatarFor(user))}" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover">
                <div><b>${esc(user.displayName || user.username)}</b><small>@${esc(user.username)}</small></div>
                <span class="material-symbols-outlined">chevron_right</span>
            </button>`).join('')}</div>` : empty('ไม่พบผู้ใช้', `ไม่มีผลลัพธ์สำหรับ “${q}”`, 'person_search');
        } catch (err) { box.innerHTML = empty('ค้นหาไม่สำเร็จ', err.message, 'error'); }
    }

    async function openMessages(username) {
        if (!requireLogin()) return;
        // เปิด UI ทันที แล้วค่อยโหลดรายชื่อ — ลดอาการหน่วงตอนเข้าแชท
        showModal(`<div class="gp-modal-card" role="dialog" aria-modal="true" aria-labelledby="gpDmTitle">
            <div class="gp-modal-head"><h2 id="gpDmTitle">Direct Messages</h2><button class="gp-icon-btn" data-gp-modal-close aria-label="ปิด">${icon('x', 'close')}</button></div>
            <div class="gp-dm-layout"><aside class="gp-dm-sidebar" id="gpConversationList"><div class="gp-skel" style="height:52px"></div></aside><section class="gp-dm-main"><div class="gp-dm-title" id="gpDmPeer">เลือกเพื่อนหรือบทสนทนา</div><div class="gp-messages" id="gpMessages">${empty('กำลังโหลด...', 'ดึงรายชื่อเพื่อนและข้อความ', 'chat')}</div><form class="gp-compose" id="gpCompose"><input class="gp-input" name="message" maxlength="2000" placeholder="พิมพ์ข้อความ..." disabled><button type="submit" class="gp-btn primary" disabled>${icon('send', 'send')}</button></form></section></div>
        </div>`);
        try {
            const [probe, friendsPayload] = await Promise.all([
                apiOptional(API.conversations),
                apiOptional('/api/friends')
            ]);
            if (!probe) {
                const list = document.getElementById('gpConversationList');
                if (list) list.innerHTML = empty('ข้อความยังไม่พร้อม', 'ต้องอัปเดต Cloud Backend ก่อนใช้ Direct Message', 'cloud_off');
                toast('warning', 'ข้อความยังไม่พร้อม', 'ต้องอัปเดต Cloud Backend ก่อนใช้ Direct Message');
                return;
            }
            state.conversations = probe.conversations || probe.list || [];
            state.dmFriends = (friendsPayload?.list || []).map((f) => ({
                id: f.friendUserId,
                username: f.friendUsername,
                displayName: f.friendDisplayName || f.friendUsername,
                avatarUrl: f.friendAvatarUrl || ''
            })).filter((f) => f.username);
            renderConversationList();
            const messages = document.getElementById('gpMessages');
            if (messages && !username) {
                messages.innerHTML = empty('เลือกเพื่อนเพื่อเริ่มแชท', 'รายชื่อเพื่อนแสดงด้านซ้าย หรือเปิดจากหน้าโปรไฟล์', 'chat');
            }
            if (username) await loadConversation(username);
        } catch (err) {
            const list = document.getElementById('gpConversationList');
            if (list) list.innerHTML = empty('โหลดข้อความไม่สำเร็จ', err.message, 'error');
        }
    }

    function renderConversationList() {
        const box = document.getElementById('gpConversationList');
        if (!box) return;
        const conversations = state.conversations || [];
        const friends = state.dmFriends || [];
        const convUsers = new Set(conversations.map((item) => String(item.otherUsername || item.user?.username || item.peer?.username || '').toLowerCase()).filter(Boolean));
        const friendOnly = friends.filter((f) => !convUsers.has(String(f.username || '').toLowerCase()));
        const parts = [];
        if (conversations.length) {
            parts.push(`<div class="gp-dm-section-label">ข้อความล่าสุด</div>`);
            parts.push(conversations.map((item) => {
                const user = item.user || item.peer || {
                    id: item.otherUserId,
                    username: item.otherUsername,
                    displayName: item.otherDisplayName,
                    avatarUrl: item.otherAvatarUrl
                };
                return `<button type="button" class="gp-conversation${state.activeConversation?.id === item.id ? ' active' : ''}" data-gp-conversation-id="${attr(item.id)}" data-gp-conversation-user="${attr(user.username)}"><img src="${attr(avatarFor(user))}" alt=""><span style="min-width:0;flex:1"><b>${esc(user.displayName || user.username)}</b><small style="display:block;color:#777;font-size:.48rem">@${esc(user.username)}</small></span>${number(item.unreadCount) ? `<span class="gp-badge level">${number(item.unreadCount)}</span>` : ''}</button>`;
            }).join(''));
        }
        if (friendOnly.length) {
            parts.push(`<div class="gp-dm-section-label">เพื่อนที่แชทได้</div>`);
            parts.push(friendOnly.map((user) => {
                const active = state.activeConversation && !state.activeConversation.id
                    && String(state.activeConversation.username || '').toLowerCase() === String(user.username || '').toLowerCase();
                return `<button type="button" class="gp-conversation${active ? ' active' : ''}" data-gp-conversation-id="" data-gp-conversation-user="${attr(user.username)}"><img src="${attr(avatarFor(user))}" alt=""><span style="min-width:0;flex:1"><b>${esc(user.displayName || user.username)}</b><small style="display:block;color:#777;font-size:.48rem">@${esc(user.username)}</small></span><span class="material-symbols-outlined" style="font-size:16px;opacity:.55">chat</span></button>`;
            }).join(''));
        }
        box.innerHTML = parts.length
            ? parts.join('')
            : empty('ยังไม่มีเพื่อนให้แชท', 'เพิ่มเพื่อนก่อน แล้วกลับมาที่ข้อความ', 'group_off');
    }

    async function loadConversation(username, conversationId) {
        const clean = String(username || '').trim();
        if (!clean) return;
        const existing = conversationId
            ? state.conversations.find((item) => String(item.id) === String(conversationId))
            : state.conversations.find((item) => String(item.otherUsername || item.user?.username || item.peer?.username || '').toLowerCase() === clean.toLowerCase());
        state.activeConversation = { username: clean, id: conversationId || existing?.id || '' };
        renderConversationList();
        const title = document.getElementById('gpDmPeer');
        const messages = document.getElementById('gpMessages');
        if (title) title.textContent = `@${clean}`;
        if (messages) messages.innerHTML = `<div class="gp-skel" style="height:48px"></div>`;
        try {
            const payload = state.activeConversation.id
                ? await api(API.conversationMessages(state.activeConversation.id))
                : { messages: [] };
            state.messages = payload.messages || payload.list || [];
            if (state.activeConversation.id) {
                api(`/api/dm/conversations/${encodeURIComponent(state.activeConversation.id)}/read`, { method: 'POST' }).catch(() => {});
            }
            if (messages) {
                messages.innerHTML = state.messages.length ? state.messages.map((item) => `<div class="gp-message${String(item.senderId) === String(global.currentUser?.id) || item.mine ? ' mine' : ''}">${esc(item.message || item.body || '')}<time>${date(item.createdAt, true)}</time></div>`).join('') : empty('เริ่มบทสนทนา', `ส่งข้อความแรกถึง @${clean}`, 'waving_hand');
                messages.scrollTop = messages.scrollHeight;
            }
            const form = document.getElementById('gpCompose');
            form?.querySelectorAll('input,button').forEach((el) => { el.disabled = false; });
            if (form) form.onsubmit = sendMessage;
        } catch (err) {
            if (messages) messages.innerHTML = empty('โหลดบทสนทนาไม่สำเร็จ', err.message, 'error');
        }
    }

    async function sendMessage(event) {
        event.preventDefault();
        const input = event.currentTarget.elements.message;
        const message = String(input.value || '').trim();
        if (!message || !state.activeConversation?.username) return;
        input.disabled = true;
        try {
            const payload = state.activeConversation.id
                ? await api(API.conversationMessages(state.activeConversation.id), { method: 'POST', body: JSON.stringify({ message }) })
                : await api(API.sendMessage, { method: 'POST', body: JSON.stringify({ username: state.activeConversation.username, message }) });
            if (!state.activeConversation.id && payload.conversationId) state.activeConversation.id = payload.conversationId;
            input.value = '';
            await loadConversation(state.activeConversation.username, state.activeConversation.id);
            input.focus();
        } catch (err) { toast('error', 'ส่งข้อความไม่สำเร็จ', err.message); }
        finally { input.disabled = false; }
    }

    function quick(action) {
        if (action === 'start') {
            global.switchMainTab?.('dashboard');
            document.querySelector('.js-tiktok-connect-btn')?.focus();
        } else if (action === 'obs') global.openOBSModal?.();
        else if (action === 'edit') editProfileModal();
        else if (action === 'friends') global.openFriendsModal?.();
        else if (action === 'stats') setTab('overview', true);
        else if (action === 'account') setTab('account', true);
    }

    function bindEvents() {
        const root = document.getElementById('gameProfileRoot');
        if (!root || root.dataset.gpBound) return;
        root.dataset.gpBound = '1';
        root.addEventListener('click', async (event) => {
            const target = event.target;
            const button = target.closest('button, a, [data-gp-open-user]');
            if (!button) return;
            if (button.matches('[data-gp-back]')) closeProfile();
            else if (button.matches('[data-gp-retry]')) loadProfile(state.username);
            else if (button.dataset.gpTab) setTab(button.dataset.gpTab, true);
            else if (button.dataset.gpTabJump) setTab(button.dataset.gpTabJump, true);
            else if (button.dataset.gpCopy != null) copyText(button.dataset.gpCopy, button.dataset.gpCopy.includes('/profile/') ? 'คัดลอกลิงก์โปรไฟล์แล้ว' : 'คัดลอกแล้ว');
            else if (button.matches('[data-gp-share]')) {
                const url = profileUrl(state.data?.username);
                if (navigator.share) navigator.share({ title: state.data?.displayName, url }).catch(() => {});
                else copyText(url, 'คัดลอกลิงก์โปรไฟล์แล้ว');
                closeContextMenu();
            }
            else if (button.matches('[data-gp-edit]')) editProfileModal();
            else if (button.matches('[data-gp-about-edit]')) {
                state.editingAbout = true;
                state.activeTab = 'about';
                render(state.data);
                setTab('about', true);
            }
            else if (button.matches('[data-gp-about-cancel]')) {
                state.editingAbout = false;
                render(state.data);
                setTab('about', false);
            }
            else if (button.matches('[data-gp-about-save]')) {
                event.preventDefault();
                saveAboutProfile();
            }
            else if (button.dataset.gpAchFilter) {
                state.achievementFilter = button.dataset.gpAchFilter;
                render(state.data);
                setTab('achievements', false);
            }
            else if (button.matches('[data-gp-privacy]')) privacyModal();
            else if (button.dataset.gpConnection != null) toggleConnection(button.dataset.gpConnection);
            else if (button.matches('[data-gp-search]')) searchModal();
            else if (button.matches('[data-gp-inbox]')) openMessages();
            else if (button.matches('[data-gp-message]')) openMessages(state.data?.username);
            else if (button.matches('[data-gp-add-friend]')) sendFriendRequest();
            else if (button.matches('[data-gp-accept]')) acceptRequest();
            else if (button.matches('[data-gp-remove]')) { closeContextMenu(); removeCurrentFriend(); }
            else if (button.matches('[data-gp-block]')) blockUser();
            else if (button.matches('[data-gp-unblock]')) unblockUser();
            else if (button.matches('[data-gp-report]')) { closeContextMenu(); openReport(); }
            else if (button.matches('[data-gp-context],[data-gp-friend-menu]')) openContextMenu(button);
            else if (button.matches('[data-gp-mutuals]')) mutualFriendsModal();
            else if (button.dataset.gpQuick) quick(button.dataset.gpQuick);
            else if (button.dataset.gpOpenUser) { closeModal(); openUserProfile(button.dataset.gpOpenUser); }
            else if (button.dataset.gpConversationUser != null) loadConversation(button.dataset.gpConversationUser, button.dataset.gpConversationId || '');
            else if (button.matches('[data-gp-modal-close]')) closeModal();
            else if (button.matches('[data-gp-noop]')) event.preventDefault();
        });
        root.addEventListener('click', (event) => {
            if (event.target.matches('#gpModal')) closeModal();
        });
        root.addEventListener('keydown', (event) => {
            if (!['Enter', ' '].includes(event.key)) return;
            const target = event.target.closest('[data-gp-open-user][role="button"]');
            if (!target) return;
            event.preventDefault();
            closeModal();
            openUserProfile(target.dataset.gpOpenUser);
        });
        document.addEventListener('pointerdown', (event) => {
            if (!state.contextOpen) return;
            const menu = document.getElementById('gpContextMenu');
            if (menu?.contains(event.target) || event.target.closest('[data-gp-context],[data-gp-friend-menu]')) return;
            closeContextMenu();
        }, true);
        document.addEventListener('keydown', (event) => {
            const modal = document.getElementById('gpModal');
            if (event.key === 'Escape') {
                if (modal && !modal.hidden) closeModal();
                else if (state.contextOpen) closeContextMenu();
                return;
            }
            if (event.key !== 'Tab' || !modal || modal.hidden) return;
            const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')]
                .filter((element) => element.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }

    function clearProfilePath() {
        if (!/^\/profile\//i.test(location.pathname)) return;
        history.replaceState({}, '', '/');
    }

    function installMainTabHook(attempt) {
        if (global.switchMainTab?.__gpWrapped) return;
        const legacy = global.switchMainTab;
        if (typeof legacy !== 'function') {
            if ((attempt || 0) < 20) setTimeout(() => installMainTabHook((attempt || 0) + 1), 200);
            return;
        }
        const wrapped = async function profileAwareSwitch(viewName) {
            if (viewName === 'profile') {
                document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
                document.querySelectorAll('.app-view').forEach((view) => view.classList.toggle('active', view.id === 'profileView'));
                global.applyActiveViewLayout?.();
                return;
            }
            if (state.active || /^\/profile\//i.test(location.pathname)) {
                state.active = false;
                clearProfilePath();
            }
            return legacy.apply(this, arguments);
        };
        wrapped.__gpWrapped = true;
        wrapped.__legacy = legacy;
        global.switchMainTab = wrapped;
    }

    function installRouteHandling() {
        global.addEventListener('popstate', () => {
            const match = location.pathname.match(/^\/profile\/([^/]+)\/?$/i);
            if (match) openUserProfile(decodeURIComponent(match[1]), { fromPop: true });
            else if (state.active) {
                state.active = false;
                clearProfilePath();
                global.switchMainTab?.(state.previousView || 'dashboard');
            }
        });
        const match = location.pathname.match(/^\/profile\/([^/]+)\/?$/i);
        if (match) {
            const username = decodeURIComponent(match[1]);
            let attempts = 0;
            const start = () => {
                if (!token() || global.currentUser?.isLoggedIn || attempts >= 8) {
                    openUserProfile(username, { fromPop: true, replace: true });
                    return;
                }
                attempts += 1;
                setTimeout(start, 250);
            };
            setTimeout(start, 250);
        }
    }

    function init() {
        if (state.initialized) return;
        const root = document.getElementById('gameProfileRoot');
        if (!root) return;
        state.initialized = true;
        bindEvents();
        installMainTabHook();
        installRouteHandling();
        document.addEventListener('click', (event) => {
            const entry = event.target.closest('[data-profile-username]');
            if (!entry || entry.closest('#profileView')) return;
            const username = String(entry.dataset.profileUsername || '').trim();
            if (!username) return;
            event.preventDefault();
            openUserProfile(username);
        });
        document.addEventListener('keydown', (event) => {
            if (!['Enter', ' '].includes(event.key)) return;
            const entry = event.target.closest('[data-profile-username]');
            if (!entry || entry.closest('#profileView')) return;
            const username = String(entry.dataset.profileUsername || '').trim();
            if (!username) return;
            event.preventDefault();
            openUserProfile(username);
        });
    }

    global.GameProfile = {
        state,
        init,
        open: openUserProfile,
        close: closeProfile,
        reload: () => loadProfile(state.username),
        search: searchModal,
        messages: openMessages
    };
    global.wireUserProfileEntry = (element, username) => {
        if (!element || !username) return element;
        element.dataset.profileUsername = String(username).replace(/^@/, '');
        if (!/^(A|BUTTON)$/.test(element.tagName)) {
            element.setAttribute('role', 'button');
            element.tabIndex = 0;
        }
        return element;
    };
    global.openUserProfile = openUserProfile;
    global.openMyProfile = () => openUserProfile(currentUsername());
    global.openProfileSearch = searchModal;
    global.openDirectMessages = openMessages;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window);
