/**
 * Game Overlays renderer — 10 layouts × 3 categories
 */
(function () {
    'use strict';

    const urlParams = new URLSearchParams(window.location.search);

    const mode = (function detectMode() {
        const q = urlParams.get('mode');
        if (q) return q;
        if (window.__overlayMode) return window.__overlayMode;
        const seg = window.location.pathname.replace(/^\/overlay\/?/i, '').replace(/\/$/, '').split('/').filter(Boolean);
        const key = seg.join('/');
        const map = {
            guessnumber: 'guessnumber', 'guess-number': 'guessnumber',
            teamvsteam: 'teamvsteam', 'team-vs-team': 'teamvsteam',
            giftcampaign: 'giftcampaign', 'gift-campaign': 'giftcampaign'
        };
        return map[key] || map[seg[0]] || '';
    })();

    const GAME_MODES = new Set(['guessnumber', 'teamvsteam', 'giftcampaign']);
    if (!GAME_MODES.has(mode)) return;

    const gnLayout = urlParams.get('gnLayout') || 'royal';
    const tvtLayout = urlParams.get('tvtLayout') || 'arena';
    const gcLayout = urlParams.get('gcLayout') || 'golden';
    const guessTheme = urlParams.get('guessTheme') || gnLayout;
    const campaignTheme = urlParams.get('campaignTheme') || gcLayout;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }
    function giftHtml(g, size, motion) {
        if (window.GiftAnim && GiftAnim.giftAnimHtml) {
            return GiftAnim.giftAnimHtml({ giftIcon: g.giftIcon, giftIconAnimated: g.giftIconAnimated, giftName: g.giftName, size: size || 'md', motion: motion || 'float' });
        }
        const src = g.giftIcon || (GiftAnim && GiftAnim.PLACEHOLDER) || '';
        return `<img src="${esc(src)}" alt="${esc(g.giftName)}" style="width:88px;height:88px;object-fit:contain">`;
    }
    function fmtTimer(sec) {
        const s = Math.max(0, parseInt(sec, 10) || 0);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    let guessState = null;
    let teamState = null;
    let campaignState = null;
    let teamTimerIv = null;

    function renderGuess(data) {
        const root = $('overlayGuessNumber');
        if (!root || !data) return;
        guessState = data;
        const layout = data.layout || gnLayout;
        const theme = data.theme || guessTheme || layout;
        root.className = `go-root active gn-layout-${esc(layout)} theme-${esc(theme)}`;
        root.style.setProperty('--gn-accent', data.accent || '');

        const hint = data.showHintNumber !== false ? (data.hintNumber ?? data.guessCount ?? '???') : (data.guessCount || 0);
        const targetHidden = data.revealTarget ? String(data.targetNumber) : '???';
        const gift = data.winGift || {};
        const status = data.winner
            ? `🏆 ${data.winner.nickname || data.winner.uniqueId} ทายถูก!`
            : (data.statusText || 'Waiting for guesses...');

        root.innerHTML = `
            <div class="gn-card go-fluid-enter go-fluid-shimmer">
                <h2 class="gn-title">${esc(data.title || 'GUESS THE NUMBER')}</h2>
                <div class="gn-hint-num go-fluid-breathe">${esc(hint)}</div>
                <p class="gn-sub">${esc(data.subtitle || 'SEND THE RIGHT AMOUNT TO WIN')}</p>
                <div class="gn-diff">⭐ ${esc((data.difficulty || 'EASY').toUpperCase())}</div>
                <div class="gn-beam-wrap">
                    <div class="gn-beam"></div>
                    <div class="gn-gift-zone">${giftHtml(gift, 'lg', 'pulse')}<span class="gn-gift-name">${esc(gift.giftName || 'Gift')}</span></div>
                </div>
                <div class="gn-target-label">TARGET</div>
                <div class="gn-target-val">${esc(targetHidden)}</div>
                <div class="gn-status"><span class="gn-status-dot"></span>${esc(status)}</div>
                <div class="gn-win-banner ${data.winner ? 'show' : ''}">
                    <div class="gn-win-title">🎉 WINNER!</div>
                    <div class="gn-win-user">${data.winner ? esc(data.winner.nickname || data.winner.uniqueId) : ''}</div>
                </div>
            </div>`;
    }

    function ringSvg(pct, team) {
        const r = 52;
        const c = 2 * Math.PI * r;
        const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
        return `<svg class="tvt-ring-svg" viewBox="0 0 120 120"><circle class="tvt-ring-bg" cx="60" cy="60" r="${r}"/><circle class="tvt-ring-fill ${team}" cx="60" cy="60" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg>`;
    }

    function renderTeam(data) {
        const root = $('overlayTeamVsTeam');
        if (!root || !data) return;
        teamState = data;
        const layout = data.layout || tvtLayout;
        const s1 = data.team1Score || 0;
        const s2 = data.team2Score || 0;
        const total = s1 + s2 || 1;
        const pctA = Math.round((s1 / total) * 100);
        const tugPct = 15 + (pctA * 0.7);
        const leadA = s1 > s2;
        const leadB = s2 > s1;
        const timer = data.timerLeft != null ? fmtTimer(data.timerLeft) : '--:--';
        const urgent = data.timerLeft != null && data.timerLeft <= 10;
        const h1 = Math.max(80, Math.round((s1 / total) * 160));
        const h2 = Math.max(80, Math.round((s2 / total) * 160));
        const n1 = esc(data.team1Name || 'Team 1');
        const n2 = esc(data.team2Name || 'Team 2');

        function avatarsHtml(list) {
            return (list || []).slice(0, 6).map(u => `<img src="${esc(u.avatar || '')}" alt="" onerror="this.style.display='none'">`).join('');
        }

        function barHtml(extraClass) {
            return `<div class="tvt-bar-wrap${extraClass ? ' ' + extraClass : ''}"><div class="tvt-bar-a go-fluid-bar" id="tvtBarA" style="width:${pctA}%"></div><div class="tvt-bar-b"></div></div>`;
        }

        function timerHeader() {
            if (layout === 'bar' || layout === 'stadium') return '';
            return `<div class="tvt-header"><div class="tvt-timer ${urgent ? 'urgent' : ''}" id="tvtTimer">${timer}</div></div>`;
        }

        let body = '';
        if (layout === 'bar') {
            body = `<div class="tvt-scorebar">
                <div class="tvt-sb-side team-a"><div><div class="tvt-sb-name">${n1}</div><div class="tvt-sb-score" id="tvtScore1">${s1.toLocaleString()}</div></div><div class="tvt-avatars">${avatarsHtml(data.team1Recent)}</div></div>
                <div class="tvt-sb-center"><span class="tvt-sb-live">● LIVE</span><span class="tvt-timer ${urgent ? 'urgent' : ''}" id="tvtTimerBar">${timer}</span></div>
                <div class="tvt-sb-side team-b"><div><div class="tvt-sb-name">${n2}</div><div class="tvt-sb-score" id="tvtScore2">${s2.toLocaleString()}</div></div><div class="tvt-avatars">${avatarsHtml(data.team2Recent)}</div></div>
            </div>`;
        } else if (layout === 'tug') {
            body = `<div class="tvt-tug">
                <div class="tvt-tug-scores"><span class="team-a" id="tvtScore1">${s1.toLocaleString()}</span><span class="team-b" id="tvtScore2">${s2.toLocaleString()}</span></div>
                <div class="tvt-tug-rope" style="--tug-pct:${tugPct}%"><div class="tvt-tug-knot"></div></div>
                <div class="tvt-tug-labels"><span style="color:var(--tv-red)">${n1}</span><span style="color:var(--tv-blue)">${n2}</span></div>
            </div>${barHtml()}`;
        } else if (layout === 'podium') {
            body = `<div class="tvt-podium">
                <div class="tvt-podium-col team-a"><div class="tvt-podium-block" style="height:${h1}px" id="tvtScore1">${s1.toLocaleString()}</div><div class="tvt-team-name">${n1}</div></div>
                <div class="tvt-vs-badge">VS</div>
                <div class="tvt-podium-col team-b"><div class="tvt-podium-block" style="height:${h2}px" id="tvtScore2">${s2.toLocaleString()}</div><div class="tvt-team-name">${n2}</div></div>
            </div>${barHtml()}`;
        } else if (layout === 'hex') {
            body = `<div class="tvt-hex">
                <div class="tvt-hex-shield team-a ${leadA ? 'is-leading' : ''}"><div class="tvt-hex-score" id="tvtScore1">${s1.toLocaleString()}</div><div class="tvt-team-name">${n1}</div></div>
                <div class="tvt-vs-badge">VS</div>
                <div class="tvt-hex-shield team-b ${leadB ? 'is-leading' : ''}"><div class="tvt-hex-score" id="tvtScore2">${s2.toLocaleString()}</div><div class="tvt-team-name">${n2}</div></div>
            </div>${barHtml()}`;
        } else if (layout === 'ring') {
            body = `<div class="tvt-ring">
                <div><div>${ringSvg(pctA, 'team-a')}</div><div class="tvt-ring-label" style="color:var(--tv-red)">${n1}</div><div class="tvt-score" id="tvtScore1" style="color:var(--tv-red);text-align:center">${s1.toLocaleString()}</div></div>
                <div class="tvt-vs-badge">VS</div>
                <div><div>${ringSvg(100 - pctA, 'team-b')}</div><div class="tvt-ring-label" style="color:var(--tv-blue)">${n2}</div><div class="tvt-score" id="tvtScore2" style="color:var(--tv-blue);text-align:center">${s2.toLocaleString()}</div></div>
            </div>`;
        } else if (layout === 'stadium') {
            body = `<div class="tvt-stadium">
                <div class="tvt-stadium-board">
                    <div><div class="tvt-team-name">${n1}</div><div class="tvt-stadium-score" id="tvtScore1" style="color:var(--tv-red)">${s1.toLocaleString()}</div></div>
                    <div class="tvt-stadium-mid">● LIVE <span class="tvt-timer ${urgent ? 'urgent' : ''}" id="tvtTimer">${timer}</span></div>
                    <div style="text-align:right"><div class="tvt-team-name">${n2}</div><div class="tvt-stadium-score" id="tvtScore2" style="color:var(--tv-blue)">${s2.toLocaleString()}</div></div>
                </div>
                ${barHtml('tvt-stadium-bar')}
            </div>`;
        } else {
            body = `<div class="tvt-arena">
                <div class="tvt-team-card team-a ${leadA ? 'is-leading' : ''}">
                    <div class="tvt-team-name">${n1}</div>
                    <div class="tvt-score" id="tvtScore1">${s1.toLocaleString()}</div>
                    <div class="tvt-avatars">${avatarsHtml(data.team1Recent)}</div>
                </div>
                <div class="tvt-vs-badge">VS</div>
                <div class="tvt-team-card team-b ${leadB ? 'is-leading' : ''}">
                    <div class="tvt-team-name">${n2}</div>
                    <div class="tvt-score" id="tvtScore2">${s2.toLocaleString()}</div>
                    <div class="tvt-avatars">${avatarsHtml(data.team2Recent)}</div>
                </div>
            </div>${barHtml()}`;
        }

        root.className = `go-root active tvt-layout-${esc(layout)}`;
        root.innerHTML = `<div class="tvt-wrap tvt-layout-${esc(layout)} go-fluid-enter">${timerHeader()}${body}</div>`;
    }

    function renderCampaign(data) {
        const root = $('overlayGiftCampaign');
        if (!root || !data) return;
        campaignState = data;
        const layout = data.layout || gcLayout;
        const theme = data.theme || campaignTheme || layout;
        root.className = `go-root active gc-layout-${esc(layout)} theme-${esc(theme)}`;

        const gifts = (data.gifts || []).slice(0, 8);
        const giftsHtml = gifts.map(g => `<div class="gc-gift-item go-fluid-breathe">${giftHtml(g, 'sm', 'float')}<span class="gc-gift-pts">${(g.points || g.diamondCount || 0).toLocaleString()} PTS</span></div>`).join('');
        const goals = (data.goals || []).filter(Boolean);
        const goalsHtml = goals.length ? `<ul class="gc-goals">${goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : `<ul class="gc-goals"><li>${esc(data.campaignTitle || 'Gift Campaign')}</li></ul>`;
        const tickerText = goals.length ? goals.join('  •  ') : (data.campaignTitle || 'Gift Campaign');
        const rank = data.rank != null ? '#' + data.rank : '#—';
        const pts = (data.points || 0).toLocaleString();
        const next = data.pointsToNext != null ? `${Number(data.pointsToNext).toLocaleString()} TO NEXT RANK` : '';

        root.innerHTML = `
            <div class="gc-banner go-fluid-enter go-fluid-shimmer" data-event="${esc(data.eventName || 'EVENT')}">
                <div class="gc-col"><div class="gc-event">${esc(data.eventName || 'TikTok Event')}</div><h2 class="gc-title">${esc(data.campaignTitle || 'Can You Take On the Challenge?')}</h2></div>
                <div class="gc-col">${goalsHtml}<div class="gc-ticker-wrap"><div class="gc-ticker-track"><span>${esc(tickerText)}</span><span>${esc(tickerText)}</span></div></div><div class="gc-gifts-row" style="margin-top:14px">${giftsHtml}</div></div>
                <div class="gc-col gc-rank-box">
                    ${data.mascotUrl ? `<img class="gc-mascot" src="${esc(data.mascotUrl)}" alt="">` : ''}
                    <div class="gc-rank-num go-fluid-breathe">${esc(rank)}</div>
                    <div class="gc-rank-label">DAILY RANK</div>
                    <div class="gc-pts-total">${pts} pts</div>
                    <div class="gc-pts-next">${esc(next)}</div>
                </div>
            </div>`;
    }

    function updateTeamScoresOnly(data) {
        if (!teamState) return renderTeam(data);
        const s1 = data.team1Score || 0;
        const s2 = data.team2Score || 0;
        const total = s1 + s2 || 1;
        const pctA = Math.round((s1 / total) * 100);
        teamState.team1Score = s1;
        teamState.team2Score = s2;
        ['tvtScore1', 'tvtScore2'].forEach((id, i) => { const el = $(id); if (el) el.textContent = (i ? s2 : s1).toLocaleString(); });
        const bar = $('tvtBarA');
        if (bar) bar.style.width = pctA + '%';
        document.querySelectorAll('.tvt-tug-rope').forEach(el => { el.style.setProperty('--tug-pct', (15 + pctA * 0.7) + '%'); });
    }

    function applyPayload(payload) {
        if (!payload) return;
        if (payload.guess) renderGuess({ layout: gnLayout, theme: guessTheme, ...payload.guess });
        if (payload.team) {
            const merged = { layout: tvtLayout, ...payload.team };
            if (teamState && merged.team1Score === teamState.team1Score && merged.team2Score === teamState.team2Score) {
                teamState.timerLeft = merged.timerLeft;
            } else {
                renderTeam(merged);
            }
        }
        if (payload.campaign) renderCampaign({ layout: gcLayout, theme: campaignTheme, ...payload.campaign });
    }

    function startTeamTimer() {
        if (teamTimerIv) clearInterval(teamTimerIv);
        teamTimerIv = setInterval(() => {
            if (!teamState || teamState.timerEndsAt == null) return;
            const left = Math.max(0, Math.ceil((teamState.timerEndsAt - Date.now()) / 1000));
            teamState.timerLeft = left;
            ['tvtTimer', 'tvtTimerBar'].forEach(id => {
                const el = $(id);
                if (el) { el.textContent = fmtTimer(left); el.classList.toggle('urgent', left <= 10 && left > 0); }
            });
            if (left <= 0 && teamTimerIv) { clearInterval(teamTimerIv); teamTimerIv = null; }
        }, 500);
    }

    function initSocket() {
        const socket = window.io && typeof io === 'function' ? io() : null;
        if (!socket) return;
        const token = urlParams.get('token');
        socket.on('connect', () => { if (token) socket.emit('join_overlay', token); });
        socket.on('overlay_game_status', (data) => { applyPayload(data); if (data && data.team) startTeamTimer(); });
    }

    window.GameOverlayRenderer = { renderGuess, renderTeam, renderCampaign, applyPayload };

    if (mode === 'guessnumber') renderGuess({ layout: gnLayout, theme: guessTheme, title: 'GUESS THE NUMBER', subtitle: 'SEND THE RIGHT AMOUNT TO WIN', difficulty: 'EASY', winGift: {}, guessCount: 0 });
    if (mode === 'teamvsteam') renderTeam({ layout: tvtLayout, team1Name: 'Team Red', team2Name: 'Team Blue' });
    if (mode === 'giftcampaign') renderCampaign({ layout: gcLayout, theme: campaignTheme, campaignTitle: 'Gift Campaign', eventName: 'TikTok Event', gifts: [], goals: ['Let\'s STREAM 1 Hour!', 'GET 50 MATCHES!'] });

    initSocket();
})();
