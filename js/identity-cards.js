/**
 * TikTok Card + Roblox Card identity overlays (8 layouts each)
 */
(function (global) {
    'use strict';

    function esc(val) {
        return String(val ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtNum(n) {
        const v = Number(n) || 0;
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + 'M';
        if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K';
        return v.toLocaleString();
    }

    function avatarFallback(name, bg) {
        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name || 'user')}&backgroundColor=${bg || 'bc13fe'}`;
    }

    function proxyCdnUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return raw;
        if (raw.startsWith('data:') || raw.startsWith('/') || raw.includes('dicebear.com') || raw.includes('/api/emotes/proxy')) return raw;
        if (/tiktokcdn|byteimg|ibyteimg|ibytedtos|musically|tiktokv|\.tiktok\.com|bytedance|byteoversea/i.test(raw)) {
            return '/api/emotes/proxy?url=' + encodeURIComponent(raw);
        }
        return raw;
    }

    function avatarImg(url, className) {
        const src = proxyCdnUrl(url);
        const cls = className ? ` class="${esc(className)}"` : '';
        return `<img${cls} src="${esc(src)}" alt="" referrerpolicy="no-referrer" loading="lazy">`;
    }

    function cssVars(colors) {
        const c = colors || {};
        return `--id-accent:${esc(c.accent || '#00f2ea')};--id-text:${esc(c.text || '#ffffff')};--id-panel:${esc(c.panel || 'rgba(14,12,24,0.92)')}`;
    }

    function statRow(items) {
        return items.filter(Boolean).join('');
    }

    function ttStat(icon, label, value) {
        return `<div class="id-stat"><span class="id-stat-ico">${icon}</span><span class="id-stat-val">${esc(fmtNum(value))}</span><span class="id-stat-lbl">${esc(label)}</span></div>`;
    }

    function rbxStat(label, value) {
        return `<div class="id-rbx-stat"><span class="id-rbx-stat-val">${esc(fmtNum(value))}</span><span class="id-rbx-stat-lbl">${esc(label)}</span></div>`;
    }

    function buildTikTokCardHtml(layout, settings, live, colors) {
        const s = settings || {};
        const l = live || {};
        const style = cssVars(colors);
        const name = s.displayName || 'Streamer';
        const user = (s.username || 'username').replace(/^@/, '');
        const avatar = s.avatarUrl || l.avatarUrl || avatarFallback(user, '00f2ea');
        const followers = (parseInt(s.followerCount, 10) || 0) + (parseInt(l.followBoost, 10) || 0);
        const following = parseInt(s.followingCount, 10) || 0;
        const viewers = l.viewerCount != null ? l.viewerCount : 0;
        const likes = l.likes != null ? l.likes : 0;
        const isLive = !!l.isLive;
        const lastFollower = l.lastFollower;
        const goalOn = s.followerGoalEnabled === true;
        const goalTarget = Math.max(1, parseInt(s.followerGoalTarget, 10) || 10000);
        const goalPct = Math.min(100, Math.round((followers / goalTarget) * 100));

        const liveBadge = (s.showLiveBadge !== false && isLive) ? '<span class="id-live-badge">LIVE</span>' : '';
        const stats = statRow([
            s.showViewerCount !== false ? ttStat('👀', 'VIEWERS', viewers) : '',
            s.showLikeCount !== false ? ttStat('❤', 'LIKES', likes) : '',
            s.showFollowing !== false ? ttStat('➕', 'FOLLOWING', following) : ''
        ]);
        const lastFollowerHtml = (s.showLastFollower !== false && lastFollower)
            ? `<div class="id-last-follow">New: @${esc(lastFollower)}</div>` : '';
        const goalHtml = goalOn
            ? `<div class="id-goal"><div class="id-goal-bar"><div class="id-goal-fill" style="width:${goalPct}%"></div></div><span class="id-goal-txt">${fmtNum(followers)} / ${fmtNum(goalTarget)}</span></div>` : '';

        if (layout === 'livestrip') {
            return `<div class="id-card id-tt id-tt-livestrip" style="${style}">
                <div class="id-tt-strip">${liveBadge}<img class="id-tt-strip-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer"><div class="id-tt-strip-meta"><b>${esc(name)}</b><span>@${esc(user)}</span></div></div>
                <div class="id-tt-strip-main"><div class="id-tt-strip-label">FOLLOWERS</div><div class="id-tt-strip-num">${esc(fmtNum(followers))}</div></div>
                <div class="id-tt-stats">${stats}</div>${lastFollowerHtml}${goalHtml}
            </div>`;
        }
        if (layout === 'compact') {
            return `<div class="id-card id-tt id-tt-compact" style="${style}">
                <img class="id-tt-compact-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
                <div class="id-tt-compact-body"><b>@${esc(user)}</b><span>${esc(fmtNum(followers))} followers</span></div>${liveBadge}
            </div>`;
        }
        if (layout === 'glass') {
            return `<div class="id-card id-tt id-tt-glass" style="${style}">
                ${liveBadge}<img class="id-tt-glass-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
                <div class="id-tt-glass-name">${esc(name)}</div><div class="id-tt-glass-user">@${esc(user)}</div>
                <div class="id-tt-glass-followers"><span>FOLLOWERS</span><b>${esc(fmtNum(followers))}</b></div>
                <div class="id-tt-stats">${stats}</div>${goalHtml}
            </div>`;
        }
        if (layout === 'neon') {
            return `<div class="id-card id-tt id-tt-neon" style="${style}">
                <div class="id-tt-neon-scan"></div>${liveBadge}
                <img class="id-tt-neon-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
                <div class="id-tt-neon-name">${esc(name)}</div><div class="id-tt-neon-user">@${esc(user)}</div>
                <div class="id-tt-neon-big">${esc(fmtNum(followers))}</div><div class="id-tt-neon-label">FOLLOWERS</div>
                <div class="id-tt-stats">${stats}</div>
            </div>`;
        }
        if (layout === 'banner') {
            return `<div class="id-card id-tt id-tt-banner" style="${style}">
                <div class="id-tt-banner-head">${liveBadge}<img src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer"><div><b>${esc(name)}</b><span>@${esc(user)}</span></div><div class="id-tt-banner-follow"><small>FOLLOWERS</small><strong>${esc(fmtNum(followers))}</strong></div></div>
                <div class="id-tt-stats id-tt-stats-row">${stats}</div>${lastFollowerHtml}${goalHtml}
            </div>`;
        }
        if (layout === 'split') {
            return `<div class="id-card id-tt id-tt-split" style="${style}">
                <div class="id-tt-split-left">${liveBadge}<img src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer"><div class="id-tt-split-name">${esc(name)}</div><div class="id-tt-split-user">@${esc(user)}</div></div>
                <div class="id-tt-split-right"><div class="id-tt-split-label">FOLLOWERS</div><div class="id-tt-split-num">${esc(fmtNum(followers))}</div><div class="id-tt-stats">${stats}</div></div>
                ${lastFollowerHtml}${goalHtml}
            </div>`;
        }
        if (layout === 'pill') {
            return `<div class="id-card id-tt id-tt-pill" style="${style}">
                <img src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer"><div class="id-tt-pill-mid"><b>${esc(name)}</b><span>@${esc(user)} · ${esc(fmtNum(followers))} followers</span></div>${liveBadge}
            </div>`;
        }
        // classic (default — vertical like BetterTok)
        return `<div class="id-card id-tt id-tt-classic" style="${style}">
            <div class="id-tt-classic-head">${liveBadge}</div>
            <img class="id-tt-classic-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
            <div class="id-tt-classic-name">${esc(name)}</div>
            <div class="id-tt-classic-user">@${esc(user)}</div>
            <div class="id-tt-classic-follow-label">FOLLOWERS</div>
            <div class="id-tt-classic-follow-num">${esc(fmtNum(followers))}</div>
            <div class="id-tt-stats">${stats}</div>
            ${lastFollowerHtml}${goalHtml}
        </div>`;
    }

    function buildRobloxCardHtml(layout, settings, profile, colors) {
        const s = settings || {};
        const p = profile || {};
        const style = cssVars(colors);
        const name = p.displayName || s.robloxUsername || 'Roblox User';
        const user = (s.robloxUsername || p.username || 'username').replace(/^@/, '');
        const avatar = p.avatarUrl || avatarFallback(user, '5865f2');
        const friends = p.friends != null ? p.friends : 0;
        const followers = p.followers != null ? p.followers : 0;
        const following = p.following != null ? p.following : 0;
        const stats = statRow([
            s.showFriends !== false ? rbxStat('FRIENDS', friends) : '',
            s.showFollowers !== false ? rbxStat('FOLLOWERS', followers) : '',
            s.showFollowing !== false ? rbxStat('FOLLOWING', following) : ''
        ]);
        const rbxLogo = '<span class="id-rbx-logo" aria-hidden="true">◆</span>';
        const status = p.error ? `<div class="id-rbx-err">${esc(p.error)}</div>` : (p.loading ? '<div class="id-rbx-loading">Connecting…</div>' : '');

        if (layout === 'neon') {
            return `<div class="id-card id-rbx id-rbx-neon" style="${style}">${rbxLogo}${status}
                <img class="id-rbx-neon-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
                <div class="id-rbx-neon-name">${esc(name)}</div><div class="id-rbx-neon-user">@${esc(user)}</div>
                <div class="id-rbx-stats id-rbx-stats-neon">${stats}</div>
            </div>`;
        }
        if (layout === 'minimal') {
            return `<div class="id-card id-rbx id-rbx-minimal" style="${style}">${rbxLogo}${status}
                <img class="id-rbx-min-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
                <div class="id-rbx-min-name">${esc(name)}</div><div class="id-rbx-min-user">@${esc(user)}</div>
                <div class="id-rbx-stats">${stats}</div>
            </div>`;
        }
        if (layout === 'badge') {
            return `<div class="id-card id-rbx id-rbx-badge" style="${style}">${rbxLogo}${status}
                <div class="id-rbx-badge-wrap"><img src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer"></div>
                <div class="id-rbx-badge-name">${esc(name)}</div><div class="id-rbx-badge-user">@${esc(user)}</div>
                <div class="id-rbx-stats">${stats}</div>
            </div>`;
        }
        if (layout === 'statsbar') {
            return `<div class="id-card id-rbx id-rbx-statsbar" style="${style}">${rbxLogo}${status}
                <div class="id-rbx-statsbar-top"><img src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer"><div><b>${esc(name)}</b><span>@${esc(user)}</span></div></div>
                <div class="id-rbx-stats id-rbx-stats-bar">${stats}</div>
            </div>`;
        }
        if (layout === 'blocky') {
            return `<div class="id-card id-rbx id-rbx-blocky" style="${style}">${rbxLogo}${status}
                <img class="id-rbx-blocky-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
                <div class="id-rbx-blocky-name">${esc(name)}</div><div class="id-rbx-blocky-user">@${esc(user)}</div>
                <div class="id-rbx-stats">${stats}</div>
            </div>`;
        }
        if (layout === 'gradient') {
            return `<div class="id-card id-rbx id-rbx-gradient" style="${style}">${rbxLogo}${status}
                <img class="id-rbx-grad-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
                <div class="id-rbx-grad-name">${esc(name)}</div><div class="id-rbx-grad-user">@${esc(user)}</div>
                <div class="id-rbx-stats">${stats}</div>
            </div>`;
        }
        if (layout === 'hud') {
            return `<div class="id-card id-rbx id-rbx-hud" style="${style}"><div class="id-rbx-hud-scan"></div>${rbxLogo}${status}
                <div class="id-rbx-hud-tag">ROBLOX PROFILE</div>
                <img class="id-rbx-hud-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
                <div class="id-rbx-hud-name">${esc(name)}</div><div class="id-rbx-hud-user">@${esc(user)}</div>
                <div class="id-rbx-stats id-rbx-stats-hud">${stats}</div>
            </div>`;
        }
        // classic
        return `<div class="id-card id-rbx id-rbx-classic" style="${style}">${rbxLogo}${status}
            <img class="id-rbx-classic-av" src="${esc(proxyCdnUrl(avatar))}" alt="" referrerpolicy="no-referrer">
            <div class="id-rbx-classic-name">${esc(name)}</div>
            <div class="id-rbx-classic-user">@${esc(user)}</div>
            <div class="id-rbx-stats">${stats}</div>
        </div>`;
    }

    async function fetchRobloxProfile(username) {
        const u = String(username || '').trim().replace(/^@/, '');
        if (!u) return { error: 'กรุณาระบุ Roblox username' };
        try {
            const res = await fetch(`/api/roblox/profile?username=${encodeURIComponent(u)}`);
            const data = await res.json();
            if (!res.ok) return { error: data.error || 'Roblox lookup failed' };
            return data;
        } catch (e) {
            return { error: 'ไม่สามารถเชื่อมต่อ Roblox ได้' };
        }
    }

    async function fetchTikTokProfile(username) {
        const u = String(username || '').trim().replace(/^@+/, '');
        if (!u || /^username$/i.test(u)) return { error: 'กรุณาระบุ TikTok username' };
        try {
            const res = await fetch(`/api/tiktok/profile?username=${encodeURIComponent(u)}`);
            const data = await res.json();
            if (!res.ok) return { error: data.error || 'TikTok lookup failed' };
            return {
                ...data,
                avatarUrl: data.avatarUrl || data.avatar || data.profilePictureUrl || '',
                followerCount: data.followerCount ?? data.followers,
                followingCount: data.followingCount ?? data.following
            };
        } catch (e) {
            return { error: 'ไม่สามารถเชื่อมต่อ TikTok ได้' };
        }
    }

    const api = {
        esc,
        fmtNum,
        buildTikTokCardHtml,
        buildRobloxCardHtml,
        fetchRobloxProfile,
        fetchTikTokProfile,
        proxyCdnUrl: proxyCdnUrl
    };
    api.buildTikTokCardHtml = api.buildTikTokCardHtml;
    api.fetchTikTokProfile = api.fetchTikTokProfile;
    global.IdentityCards = api;
    global.IdentityCards = api;
})(typeof window !== 'undefined' ? window : globalThis);
