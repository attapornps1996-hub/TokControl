/**
 * TokControl Vote Overlay — shared data layer + renderer.
 * Layouts are presentation only. Vote math comes from the panel payload.
 */
(function (global) {
    'use strict';

    const LAYOUTS = [
        { id: 'neon', label: 'Neon Glow', desc: 'กรอบนีออนไซเบอร์ การ์ดแนวตั้ง' },
        { id: 'glass', label: 'Minimal Glass', desc: 'กระจกใส วงแหวนเปอร์เซ็นต์' },
        { id: 'esports', label: 'Esports', desc: 'HUD ทัวร์นาเมนต์ % ใหญ่' },
        { id: 'compact', label: 'Compact Bar', desc: 'แถบแนวนอนกินพื้นที่น้อยสุด' },
        { id: 'ring', label: 'Circle Ring', desc: 'แดชบอร์ดวงกลมรอบคำถาม' },
        { id: 'panorama', label: 'Vote Stage', desc: 'โพเดียมเวทีอีเวนต์' }
    ];

    const THEMES = {
        tokcontrol: { primary: '#9b5cff', secondary: '#7c3aed', accent: '#ec4899', bg: '18,12,36', text: '#f8f5ff', muted: '#c4b5e0' },
        'neon-purple': { primary: '#bc13fe', secondary: '#7a00ff', accent: '#ff2eea', bg: '16,6,32', text: '#fff4ff', muted: '#d9b3ff' },
        'cyber-blue': { primary: '#22d3ee', secondary: '#0ea5e9', accent: '#818cf8', bg: '6,14,32', text: '#eef8ff', muted: '#9fd4ee' },
        'hot-pink': { primary: '#ff2e97', secondary: '#db2777', accent: '#fbbf24', bg: '28,8,22', text: '#fff5fb', muted: '#f9b4d8' },
        'orange-fire': { primary: '#fb923c', secondary: '#ef4444', accent: '#facc15', bg: '28,12,6', text: '#fff7ed', muted: '#fdba74' },
        'minimal-dark': { primary: '#a1a1aa', secondary: '#71717a', accent: '#e4e4e7', bg: '12,12,14', text: '#fafafa', muted: '#a1a1aa' },
        'minimal-light': { primary: '#7c3aed', secondary: '#6d28d9', accent: '#db2777', bg: '248,246,252', text: '#18181b', muted: '#52525b' }
    };

    const OPTION_FALLBACKS = ['#a855f7', '#ec4899', '#22d3ee', '#fb923c', '#34d399', '#facc15', '#818cf8', '#f43f5e'];

    const I18N = {
        th: {
            live: 'LIVE', ended: 'ENDED', winner: 'WINNER', tie: 'TIE RESULT',
            votes: 'โหวต', people: 'คน', totalVotes: 'โหวตรวม', participants: 'ผู้เข้าร่วม',
            remaining: 'เวลาที่เหลือ', starting: 'เตรียมตัวโหวต', voteNow: 'VOTE NOW!',
            reconnecting: 'กำลังเชื่อมต่อใหม่', soon: 'VOTE STARTING SOON'
        },
        en: {
            live: 'LIVE', ended: 'ENDED', winner: 'WINNER', tie: 'TIE RESULT',
            votes: 'votes', people: '', totalVotes: 'Total Votes', participants: 'Participants',
            remaining: 'Time left', starting: 'Get ready to vote', voteNow: 'VOTE NOW!',
            reconnecting: 'Reconnecting', soon: 'VOTE STARTING SOON'
        }
    };

    const DEFAULT_APPEARANCE = {
        layout: 'neon',
        theme: 'tokcontrol',
        accentColor: '#9b5cff',
        optionColors: OPTION_FALLBACKS.slice(),
        backgroundOpacity: 0.78,
        cardOpacity: 0.9,
        blur: 12,
        borderOpacity: 0.55,
        glowIntensity: 'medium',
        cornerRadius: 16,
        fontSize: 100,
        scale: 100,
        positionH: 'center',
        positionV: 'center',
        offsetX: 0,
        offsetY: 0,
        locale: 'th',
        showQuestion: true,
        questionSize: 100,
        questionMaxLines: 2,
        questionAlign: 'center',
        showNumber: true,
        showImage: true,
        showName: true,
        showPercentage: true,
        showVoteCount: true,
        showProgress: true,
        showRanking: true,
        showCrown: true,
        showWinnerEffect: true,
        showTimer: true,
        timerStyle: 'pill',
        countdownWarning: true,
        warningSeconds: 10,
        showParticipants: true,
        showTotalVotes: true,
        showVoteRate: false,
        showTimeStat: false,
        animationPreset: 'smooth',
        enterAnim: true,
        exitAnim: true,
        voteAnim: true,
        winnerAnim: true,
        animDuration: 320,
        particles: false,
        hideReconnect: false,
        autoHideEnded: false,
        compactPosition: 'top-center',
        accessKey: ''
    };

    const MOCK_STATE = {
        pollId: 'preview',
        question: 'คุณชอบสกินตัวไหนที่สุด?',
        status: 'live',
        remainingSeconds: 60,
        totalVotes: 2954,
        totalParticipants: 2954,
        overlayVisible: true,
        hideScores: false,
        options: [
            { id: 'opt_1', label: 'ตัวเลือกที่ 1', votes: 1245, percentage: 42, rank: 1, color: '#a855f7' },
            { id: 'opt_2', label: 'ตัวเลือกที่ 2', votes: 832, percentage: 28, rank: 2, color: '#ec4899' },
            { id: 'opt_3', label: 'ตัวเลือกที่ 3', votes: 532, percentage: 18, rank: 3, color: '#22d3ee' },
            { id: 'opt_4', label: 'ตัวเลือกที่ 4', votes: 345, percentage: 12, rank: 4, color: '#fb923c' }
        ],
        winners: ['opt_1']
    };

    function prefersReducedMotion() {
        try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (e) { return false; }
    }

    function clamp(n, min, max) {
        n = Number(n);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, n));
    }

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtNum(n, locale) {
        const loc = locale === 'en' ? 'en-US' : 'th-TH';
        return Number(n || 0).toLocaleString(loc);
    }

    function fmtTime(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    function initialOf(label) {
        const t = String(label || '').trim();
        return t ? t.slice(0, 1).toUpperCase() : '?';
    }

    function mergeAppearance(raw) {
        const out = { ...DEFAULT_APPEARANCE, ...(raw && typeof raw === 'object' ? raw : {}) };
        out.optionColors = Array.isArray(out.optionColors) && out.optionColors.length
            ? out.optionColors.slice(0, 8)
            : OPTION_FALLBACKS.slice();
        while (out.optionColors.length < 8) out.optionColors.push(OPTION_FALLBACKS[out.optionColors.length]);
        out.layout = LAYOUTS.some((l) => l.id === out.layout) ? out.layout : 'neon';
        if (!THEMES[out.theme] && out.theme !== 'custom') out.theme = 'tokcontrol';
        out.scale = clamp(out.scale, 50, 160);
        out.fontSize = clamp(out.fontSize, 70, 140);
        out.backgroundOpacity = clamp(out.backgroundOpacity, 0, 1);
        out.cardOpacity = clamp(out.cardOpacity, 0.2, 1);
        out.borderOpacity = clamp(out.borderOpacity, 0, 1);
        out.blur = clamp(out.blur, 0, 24);
        out.warningSeconds = clamp(out.warningSeconds, 3, 30);
        out.questionMaxLines = clamp(out.questionMaxLines, 1, 4);
        return out;
    }

    function findActiveMatch(vs) {
        if (!vs || vs.mode !== 'tournament') return null;
        const matches = (vs.rounds || []).flatMap((r) => r.matches || []);
        return matches.find((m) => m.id === vs.activeMatchId)
            || matches.find((m) => m.status === 'live' || m.status === 'voting' || m.status === 'ready')
            || null;
    }

    function extractRawOptions(vs) {
        if (!vs) return [];
        if (vs.mode === 'tournament') {
            const match = findActiveMatch(vs);
            if (!match) return [];
            const cand = (id) => (vs.candidates || []).find((c) => c.id === id) || null;
            const sides = [
                { key: 'a', fallbackId: '1' },
                { key: 'b', fallbackId: '2' }
            ];
            return sides.map((side, i) => {
                const slot = match[side.key] || {};
                const c = cand(slot.candidateId);
                if (c && c.bye) return null;
                return {
                    id: String(slot.candidateId || side.fallbackId),
                    label: (c && c.name) || ('Option ' + (i + 1)),
                    imageUrl: (c && c.image === '__keep__') ? '' : ((c && c.image) || ''),
                    color: OPTION_FALLBACKS[i],
                    votes: Number(slot.votes) || 0
                };
            }).filter(Boolean);
        }
        return (vs.options || []).slice(0, 8).map((o, i) => ({
            id: String(o.id || ('opt_' + (i + 1))),
            label: o.name || o.label || ('ตัวเลือกที่ ' + (i + 1)),
            imageUrl: o.image === '__keep__' ? '' : (o.image || o.imageUrl || ''),
            color: o.color || OPTION_FALLBACKS[i],
            votes: Number(o.votes) || 0
        }));
    }

    function rankOptions(list, hideScores) {
        const total = list.reduce((s, o) => s + (Number(o.votes) || 0), 0);
        const sorted = list.slice().sort((a, b) => (b.votes - a.votes) || String(a.id).localeCompare(String(b.id)));
        const rankMap = new Map();
        let lastVotes = null;
        let lastRank = 0;
        sorted.forEach((o, i) => {
            if (lastVotes === o.votes) rankMap.set(o.id, lastRank);
            else {
                lastRank = i + 1;
                lastVotes = o.votes;
                rankMap.set(o.id, lastRank);
            }
        });
        const max = Math.max(0, ...list.map((o) => o.votes));
        const leaders = list.filter((o) => o.votes === max && max > 0);
        return {
            total,
            options: list.map((o) => ({
                ...o,
                percentage: hideScores ? 0 : (total > 0 ? Math.round((o.votes / total) * 100) : 0),
                rank: hideScores ? 0 : (rankMap.get(o.id) || list.length),
                votes: hideScores ? 0 : o.votes
            })),
            winners: hideScores ? [] : leaders.map((o) => o.id)
        };
    }

    function resolveStatus(vs, remainingSeconds) {
        if (!vs) return 'waiting';
        if (vs.showResultScreen) return 'ended';
        if (vs.timerRunning) {
            const warn = Number((vs.overlayKit && vs.overlayKit.warningSeconds) || (vs.overlayDisplay && vs.overlayDisplay.hideScoresThreshold) || 10);
            if (remainingSeconds != null && remainingSeconds <= warn) return 'ending';
            return 'live';
        }
        return 'waiting';
    }

    function buildOverlayState(payload) {
        const vote = (payload && payload.vote) || payload || {};
        const appearance = mergeAppearance(vote.overlayKit || (payload && payload.appearance) || {});
        const remaining = payload && payload.timerLeft != null
            ? payload.timerLeft
            : (vote.timerRunning && vote.timerEndsAt ? Math.max(0, Math.ceil((vote.timerEndsAt - Date.now()) / 1000)) : (vote.remainingSeconds != null ? vote.remainingSeconds : 0));
        const disp = vote.overlayDisplay || {};
        const hideScores = !vote.showResultScreen && !!disp.hideScoresNearEnd && remaining != null && remaining <= (disp.hideScoresThreshold || 10);
        const ranked = rankOptions(extractRawOptions(vote), hideScores);
        const participants = Number(payload && payload.totalParticipants != null ? payload.totalParticipants : vote.totalParticipants) || 0;
        let status = (payload && payload.status) || resolveStatus(vote, remaining);
        if (status === 'ended' && ranked.winners.length > 1) status = 'ended';
        return {
            pollId: String(vote.pollId || vote.title || 'vote'),
            question: vote.title || vote.question || '',
            status,
            remainingSeconds: remaining == null ? 0 : remaining,
            totalVotes: hideScores ? 0 : ranked.total,
            totalParticipants: participants,
            overlayVisible: vote.overlayVisible !== false,
            hideScores,
            options: ranked.options.map((o, i) => ({
                ...o,
                color: appearance.optionColors[i] || o.color || OPTION_FALLBACKS[i]
            })),
            winners: vote.showResultScreen ? ranked.winners : (status === 'ended' ? ranked.winners : []),
            appearance,
            voteRate: Number(payload && payload.voteRate) || 0
        };
    }

    function durationMs(appearance, kind) {
        if (prefersReducedMotion()) return 0;
        const preset = appearance.animationPreset;
        if (preset === 'none') return 0;
        const base = Number(appearance.animDuration) || 320;
        if (kind === 'enter') return appearance.enterAnim === false ? 0 : (preset === 'minimal' ? 180 : base);
        if (kind === 'vote') return appearance.voteAnim === false ? 0 : (preset === 'esports' ? Math.min(450, base + 80) : base);
        if (kind === 'winner') return appearance.winnerAnim === false ? 0 : Math.min(900, base + 280);
        return base;
    }

    function ringOffset(pct) {
        const c = 276.46;
        const p = clamp(pct, 0, 100) / 100;
        return c - (c * p);
    }

    function optionHtml(opt, i, t) {
        const color = opt.color || OPTION_FALLBACKS[i];
        const img = opt.imageUrl
            ? `<img src="${esc(opt.imageUrl)}" alt="${esc(opt.label)}" decoding="async">`
            : '';
        return `<article class="tcvo-opt" data-id="${esc(opt.id)}" data-rank="${opt.rank || 0}" style="--opt-color:${esc(color)};--i:${i}">
            <span class="tcvo-crown" aria-hidden="true">👑</span>
            <span class="tcvo-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
            <div class="tcvo-media">
                <svg class="tcvo-ring" viewBox="0 0 100 100" aria-hidden="true">
                    <circle class="tcvo-ring-track" cx="50" cy="50" r="44"></circle>
                    <circle class="tcvo-ring-fill" cx="50" cy="50" r="44" style="stroke-dashoffset:${ringOffset(opt.percentage || 0)}"></circle>
                </svg>
                <div class="tcvo-avatar${opt.imageUrl ? ' has-img' : ''}">${img}<span class="tcvo-ph">${esc(initialOf(opt.label))}</span></div>
            </div>
            <div class="tcvo-body">
                <div class="tcvo-name">${esc(opt.label)}</div>
                <div class="tcvo-pct"><span data-n="0">${opt.percentage || 0}</span>%</div>
                <div class="tcvo-bar" role="progressbar" aria-valuenow="${opt.percentage || 0}" aria-valuemin="0" aria-valuemax="100"><i style="width:${opt.percentage || 0}%"></i></div>
                <div class="tcvo-votes"><span data-n="0">${opt.votes || 0}</span> ${esc(t.votes)}</div>
            </div>
            <div class="tcvo-podium" aria-hidden="true"></div>
        </article>`;
    }

    function shellHtml(t) {
        return `<div class="tcvo-scale">
            <div class="tcvo-shell" data-layout="neon" data-status="waiting" data-count="0">
                <div class="tcvo-frame" aria-hidden="true"></div>
                <header class="tcvo-head">
                    <span class="tcvo-live" data-live>${esc(t.live)}</span>
                    <div class="tcvo-qwrap">
                        <p class="tcvo-kicker" data-kicker>${esc(t.voteNow)}</p>
                        <h1 class="tcvo-question" data-q></h1>
                    </div>
                    <div class="tcvo-timer tcvo-timer-pill" data-timer>
                        <span class="tcvo-timer-ico" aria-hidden="true">⏱</span>
                        <span data-time>00:00</span>
                    </div>
                </header>
                <div class="tcvo-options" data-options></div>
                <footer class="tcvo-stats">
                    <div class="tcvo-stat" data-stat="people"><span data-people>0</span> <small data-people-lbl>${esc(t.people)}</small></div>
                    <div class="tcvo-stat tcvo-stat-total" data-stat="votes"><small data-votes-lbl>${esc(t.totalVotes)}</small><b data-total>0</b></div>
                    <div class="tcvo-stat" data-stat="time"><span data-time-stat>00:00</span></div>
                </footer>
                <div class="tcvo-waiting" data-waiting>
                    <p class="tcvo-waiting-kicker">${esc(t.soon)}</p>
                    <p class="tcvo-waiting-title">${esc(t.starting)}</p>
                </div>
                <div class="tcvo-result" data-result hidden>
                    <p class="tcvo-result-kicker tcvo-shiny" data-result-kicker>${esc(t.winner)}</p>
                    <div class="tcvo-result-row" data-result-row></div>
                </div>
                <div class="tcvo-conn" data-conn hidden><i></i> <span>${esc(t.reconnecting)}</span></div>
            </div>
        </div>`;
    }

    function create(root, opts) {
        const options = opts || {};
        const preview = !!options.preview;
        let appearance = mergeAppearance(options.appearance);
        let lastState = null;
        let lastLayout = '';
        let lastIds = '';
        let lastLocale = appearance.locale;
        let entered = false;
        let winnerRevealed = false;
        let endedPollKey = '';
        const imageCache = new Map();
        const timers = new Set();
        const rafs = new Set();

        root.classList.add('tcvo');
        if (preview) root.classList.add('tcvo-preview');
        root.innerHTML = shellHtml(I18N[appearance.locale] || I18N.th);

        const scaleEl = root.querySelector('.tcvo-scale');
        const shell = root.querySelector('.tcvo-shell');
        const qEl = root.querySelector('[data-q]');
        const kickerEl = root.querySelector('[data-kicker]');
        const liveEl = root.querySelector('[data-live]');
        const timerEl = root.querySelector('[data-timer]');
        const timeTxt = root.querySelector('[data-time]');
        const optsEl = root.querySelector('[data-options]');
        const waitingEl = root.querySelector('[data-waiting]');
        const resultEl = root.querySelector('[data-result]');
        const resultKicker = root.querySelector('[data-result-kicker]');
        const resultRow = root.querySelector('[data-result-row]');
        const connEl = root.querySelector('[data-conn]');
        const peopleEl = root.querySelector('[data-people]');
        const totalEl = root.querySelector('[data-total]');
        const timeStatEl = root.querySelector('[data-time-stat]');

        function t() { return I18N[appearance.locale] || I18N.th; }

        function clearLater() {
            timers.forEach((id) => clearTimeout(id));
            timers.clear();
            rafs.forEach((id) => cancelAnimationFrame(id));
            rafs.clear();
        }

        function later(fn, ms) {
            const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
            timers.add(id);
            return id;
        }

        function animateNum(el, to, dur) {
            if (!el) return;
            const target = Number(to) || 0;
            if (!dur || prefersReducedMotion()) {
                el.textContent = fmtNum(target, appearance.locale);
                el.dataset.n = String(target);
                return;
            }
            const from = Number(el.dataset.n || 0);
            if (from === target) {
                el.textContent = fmtNum(target, appearance.locale);
                return;
            }
            const start = performance.now();
            const step = (now) => {
                const p = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - p, 3);
                const val = Math.round(from + (target - from) * eased);
                el.textContent = fmtNum(val, appearance.locale);
                if (p < 1) {
                    const raf = requestAnimationFrame(step);
                    rafs.add(raf);
                } else {
                    el.dataset.n = String(target);
                    el.textContent = fmtNum(target, appearance.locale);
                }
            };
            const raf = requestAnimationFrame(step);
            rafs.add(raf);
        }

        function applyThemeVars() {
            const theme = THEMES[appearance.theme] || THEMES.tokcontrol;
            const primary = appearance.theme === 'custom' ? (appearance.accentColor || theme.primary) : theme.primary;
            const glow = appearance.glowIntensity === 'off' ? 0 : appearance.glowIntensity === 'low' ? 0.35 : appearance.glowIntensity === 'high' ? 1 : 0.65;
            const compact = String(appearance.compactPosition || 'top-center').split('-');
            const posH = appearance.layout === 'compact' ? (compact[1] || compact[0] || 'center') : (appearance.positionH || 'center');
            const posV = appearance.layout === 'compact' ? (compact[0] || 'top') : (appearance.positionV || 'center');
            root.style.setProperty('--tcvo-primary', primary);
            root.style.setProperty('--tcvo-secondary', theme.secondary);
            root.style.setProperty('--tcvo-accent', appearance.accentColor || theme.accent);
            root.style.setProperty('--tcvo-text', theme.text);
            root.style.setProperty('--tcvo-muted', theme.muted);
            root.style.setProperty('--tcvo-bg', theme.bg);
            root.style.setProperty('--tcvo-bg-a', String(appearance.backgroundOpacity));
            root.style.setProperty('--tcvo-card-a', String(appearance.cardOpacity));
            root.style.setProperty('--tcvo-blur', appearance.blur + 'px');
            root.style.setProperty('--tcvo-border-a', String(appearance.borderOpacity));
            root.style.setProperty('--tcvo-glow', String(glow));
            root.style.setProperty('--tcvo-radius', appearance.cornerRadius + 'px');
            root.style.setProperty('--tcvo-font', String(appearance.fontSize / 100));
            root.style.setProperty('--tcvo-q-size', String(appearance.questionSize / 100));
            root.style.setProperty('--tcvo-q-lines', String(appearance.questionMaxLines));
            root.style.setProperty('--tcvo-scale', String(appearance.scale / 100));
            root.style.setProperty('--tcvo-ox', appearance.offsetX + 'px');
            root.style.setProperty('--tcvo-oy', appearance.offsetY + 'px');
            root.style.setProperty('--tcvo-dur', durationMs(appearance, 'vote') + 'ms');
            root.dataset.theme = appearance.theme;
            root.dataset.h = posH;
            root.dataset.v = posV;
            root.dataset.qAlign = appearance.questionAlign || 'center';
            root.dataset.timer = appearance.timerStyle || 'pill';
            root.dataset.compactH = compact[1] || compact[0] || 'center';
            root.dataset.compactV = compact[0] || 'top';
            root.classList.toggle('tcvo-light', appearance.theme === 'minimal-light');
            OPTION_FALLBACKS.forEach((_, i) => {
                root.style.setProperty('--vote-option-' + (i + 1), appearance.optionColors[i] || OPTION_FALLBACKS[i]);
            });
        }

        function rebuildOptions(state) {
            const tx = t();
            (state.options || []).forEach((o) => {
                o.imageUrl = resolveImage(o);
            });
            optsEl.innerHTML = (state.options || []).map((o, i) => optionHtml(o, i, tx)).join('');
            lastIds = (state.options || []).map((o) => o.id).join('|');
        }

        function patchOption(el, opt, i, dur) {
            if (!el) return;
            const prevVotes = Number(el.dataset.votes || 0);
            const prevRank = Number(el.dataset.rank || 0);
            el.dataset.rank = String(opt.rank || 0);
            el.dataset.votes = String(opt.votes || 0);
            el.style.setProperty('--opt-color', opt.color || OPTION_FALLBACKS[i]);
            el.style.setProperty('--opt-pct', (opt.percentage || 0) + '%');
            el.style.setProperty('--opt-rank', String(opt.rank || 0));
            el.classList.toggle('is-lead', opt.rank === 1 && opt.votes > 0);
            el.classList.toggle('is-winner', !!(lastState && lastState.status === 'ended' && (lastState.winners || []).includes(opt.id)));
            const name = el.querySelector('.tcvo-name');
            if (name && name.textContent !== opt.label) name.textContent = opt.label;
            const num = el.querySelector('.tcvo-num');
            if (num) {
                num.textContent = (lastState && lastState.status === 'ended' && opt.rank)
                    ? '#' + opt.rank
                    : String(i + 1).padStart(2, '0');
            }
            const av = el.querySelector('.tcvo-avatar');
            if (av) {
                const src = resolveImage(opt);
                let img = av.querySelector('img');
                const ph = av.querySelector('.tcvo-ph');
                if (src) {
                    if (!img) {
                        img = document.createElement('img');
                        img.alt = opt.label;
                        img.decoding = 'async';
                        img.addEventListener('error', () => {
                            img.hidden = true;
                            av.classList.remove('has-img');
                        });
                        av.prepend(img);
                    }
                    if (img.getAttribute('src') !== src) img.src = src;
                    img.hidden = false;
                    img.alt = opt.label;
                    av.classList.add('has-img');
                } else if (img) {
                    img.remove();
                    av.classList.remove('has-img');
                }
                if (ph) ph.textContent = initialOf(opt.label);
            }
            const fill = el.querySelector('.tcvo-ring-fill');
            if (fill) fill.style.strokeDashoffset = String(ringOffset(opt.percentage || 0));
            const bar = el.querySelector('.tcvo-bar > i');
            if (bar) bar.style.width = (opt.percentage || 0) + '%';
            const pctEl = el.querySelector('.tcvo-pct [data-n]');
            const voteEl = el.querySelector('.tcvo-votes [data-n]');
            animateNum(pctEl, opt.percentage || 0, dur);
            animateNum(voteEl, opt.votes || 0, dur);
            if (dur && opt.votes !== prevVotes) {
                el.classList.add('is-pulse');
                later(() => el.classList.remove('is-pulse'), dur + 40);
            }
            if (dur && prevRank && opt.rank && prevRank !== opt.rank) {
                el.classList.add('is-rank-shift');
                later(() => el.classList.remove('is-rank-shift'), dur + 80);
            }
        }

        function resolveImage(opt) {
            if (!opt) return '';
            if (opt.imageUrl) {
                imageCache.set(opt.id, opt.imageUrl);
                return opt.imageUrl;
            }
            return imageCache.get(opt.id) || '';
        }

        function renderResult(state) {
            const tx = t();
            const winners = (state.winners || []).map((id) => (state.options || []).find((o) => o.id === id)).filter(Boolean);
            const isTie = winners.length > 1;
            resultKicker.textContent = isTie ? tx.tie : tx.winner;
            resultKicker.classList.toggle('tcvo-shiny', !isTie);
            resultRow.innerHTML = winners.map((o) => {
                const src = resolveImage(o);
                const img = src
                    ? `<img src="${esc(src)}" alt="${esc(o.label)}">`
                    : `<span>${esc(initialOf(o.label))}</span>`;
                return `<div class="tcvo-winner-card" style="--opt-color:${esc(o.color || '#a855f7')};--opt-pct:${o.percentage || 0}%">
                    <div class="tcvo-winner-av${src ? ' has-img' : ''}">${img}</div>
                    <div class="tcvo-winner-name">${esc(o.label)}</div>
                    <div class="tcvo-winner-rank">${isTie ? tx.tie : ('#' + (o.rank || 1))}</div>
                    <div class="tcvo-winner-pct">${o.percentage || 0}%</div>
                    <div class="tcvo-bar" role="progressbar" aria-valuenow="${o.percentage || 0}"><i style="width:${o.percentage || 0}%"></i></div>
                    <div class="tcvo-winner-votes">${fmtNum(o.votes, appearance.locale)} ${esc(tx.votes)}</div>
                </div>`;
            }).join('');
        }

        function applyState(raw) {
            const state = raw && raw.options ? { ...raw, appearance: mergeAppearance(raw.appearance || appearance) } : buildOverlayState(raw);
            appearance = mergeAppearance(state.appearance || appearance);
            applyThemeVars();
            const tx = t();
            const count = Math.max(0, Math.min(8, (state.options || []).length));
            const ids = (state.options || []).map((o) => o.id).join('|');
            const layoutChanged = lastLayout !== appearance.layout || lastLocale !== appearance.locale;
            if (layoutChanged || ids !== lastIds) {
                shell.dataset.layout = appearance.layout;
                lastLayout = appearance.layout;
                lastLocale = appearance.locale;
                rebuildOptions(state);
            }
            shell.dataset.count = String(count);
            shell.dataset.status = state.status || 'waiting';
            shell.classList.toggle('is-hidden', state.overlayVisible === false && !preview);
            shell.classList.toggle('is-ending', state.status === 'ending');
            shell.classList.toggle('is-ended', state.status === 'ended');

            if (appearance.showQuestion) {
                qEl.textContent = state.question || '';
                qEl.hidden = false;
            } else qEl.hidden = true;
            kickerEl.textContent = tx.voteNow;
            kickerEl.hidden = !appearance.showQuestion;

            const showLive = state.status === 'live' || state.status === 'ending';
            liveEl.textContent = state.status === 'ended' ? tx.ended : tx.live;
            liveEl.classList.toggle('is-ended', state.status === 'ended');
            liveEl.hidden = !showLive && state.status !== 'ended';

            const near = appearance.countdownWarning && state.remainingSeconds <= (appearance.warningSeconds || 10) && (state.status === 'live' || state.status === 'ending');
            timerEl.hidden = appearance.showTimer === false || appearance.timerStyle === 'hidden' || state.status === 'ended';
            timerEl.className = 'tcvo-timer tcvo-timer-' + (appearance.timerStyle || 'pill') + (near ? ' is-urgent' : '');
            if (timeTxt) timeTxt.textContent = fmtTime(state.remainingSeconds);
            if (timeStatEl) timeStatEl.textContent = fmtTime(state.remainingSeconds);

            const showWaiting = state.status === 'waiting' && state.overlayVisible !== false && !(state.totalVotes > 0);
            waitingEl.hidden = !showWaiting;

            const pollKey = String(state.pollId || '') + ':' + (state.status || '');
            if (state.status !== 'ended') {
                winnerRevealed = false;
                endedPollKey = '';
            } else if (endedPollKey !== pollKey) {
                winnerRevealed = false;
                endedPollKey = pollKey;
                const winDelay = Math.max(1600, durationMs(appearance, 'winner') + 1400);
                later(() => {
                    winnerRevealed = true;
                    if (appearance.showWinnerEffect !== false) {
                        resultEl.hidden = false;
                        renderResult(lastState || state);
                        shell.classList.add('is-winner-reveal');
                    }
                }, prefersReducedMotion() || appearance.winnerAnim === false ? 0 : winDelay);
            }
            const showWinner = state.status === 'ended' && appearance.showWinnerEffect !== false && winnerRevealed;
            resultEl.hidden = !showWinner;
            if (showWinner) renderResult(state);
            shell.classList.toggle('is-winner-reveal', showWinner);
            shell.classList.toggle('is-summary', state.status === 'ended' && !showWinner);

            const dur = lastState ? durationMs(appearance, 'vote') : 0;
            (state.options || []).forEach((opt, i) => {
                const safe = String(opt.id).replace(/"/g, '');
                patchOption(optsEl.querySelector('[data-id="' + safe + '"]'), opt, i, dur);
            });

            animateNum(peopleEl, state.totalParticipants || 0, dur);
            animateNum(totalEl, state.totalVotes || 0, dur);
            const peopleLbl = root.querySelector('[data-people-lbl]');
            const votesLbl = root.querySelector('[data-votes-lbl]');
            if (peopleLbl) peopleLbl.textContent = tx.people;
            if (votesLbl) votesLbl.textContent = tx.totalVotes;

            root.classList.toggle('tcvo-no-q', appearance.showQuestion === false);
            root.classList.toggle('tcvo-no-num', appearance.showNumber === false);
            root.classList.toggle('tcvo-no-img', appearance.showImage === false);
            root.classList.toggle('tcvo-no-name', appearance.showName === false);
            root.classList.toggle('tcvo-no-pct', appearance.showPercentage === false);
            root.classList.toggle('tcvo-no-votes', appearance.showVoteCount === false);
            root.classList.toggle('tcvo-no-bar', appearance.showProgress === false);
            root.classList.toggle('tcvo-no-rank', appearance.showRanking === false);
            root.classList.toggle('tcvo-no-crown', appearance.showCrown === false);
            root.classList.toggle('tcvo-no-people', appearance.showParticipants === false);
            root.classList.toggle('tcvo-no-total', appearance.showTotalVotes === false);
            root.classList.toggle('tcvo-no-time-stat', appearance.showTimeStat === false);
            root.classList.toggle('tcvo-reduced', prefersReducedMotion() || appearance.animationPreset === 'none');

            if (!entered && state.overlayVisible !== false && state.status !== 'waiting') {
                entered = true;
                const enterDur = durationMs(appearance, 'enter');
                if (enterDur) {
                    shell.classList.add('tcvo-enter');
                    later(() => shell.classList.remove('tcvo-enter'), enterDur + 40);
                }
            }

            lastState = state;
            return state;
        }

        function setAppearance(next) {
            appearance = mergeAppearance({ ...appearance, ...next });
            applyThemeVars();
            if (lastState) applyState({ ...lastState, appearance });
        }

        function setConnection(on) {
            if (!connEl) return;
            connEl.hidden = !on || !!appearance.hideReconnect;
        }

        function setAspect(ratio) {
            root.dataset.aspect = String(ratio || '16-9');
        }

        function destroy() {
            clearLater();
            root.innerHTML = '';
            lastState = null;
        }

        applyThemeVars();
        return {
            applyState,
            setAppearance,
            setConnection,
            setAspect,
            destroy,
            getAppearance: () => ({ ...appearance }),
            getState: () => lastState
        };
    }

    global.TokControlVoteOverlay = {
        LAYOUTS,
        THEMES,
        I18N,
        DEFAULT_APPEARANCE,
        MOCK_STATE,
        OPTION_FALLBACKS,
        mergeAppearance,
        buildOverlayState,
        create
    };
})(typeof window !== 'undefined' ? window : globalThis);
