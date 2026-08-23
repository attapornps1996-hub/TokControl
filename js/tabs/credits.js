/**
 * TokControl tab: Stream Credits
 * Loaded on demand via js/tab-loader.js
 */
(function () {
    'use strict';

    // ==========================================
    //  STREAM CREDITS — TOP 10 GIFTERS / LIKERS + GIFT SUMMARY
    // ==========================================
    let streamCreditsGifters = {};
    let streamCreditsLikers = {};
    let streamCreditsFollowers = {};
    let streamCreditsGiftTotals = {};
    let streamCreditsAvatarCache = {};
    let streamCreditsPlaying = false;
    let creditsActiveTab = 'gifters';
    let streamCreditsGiftGalleryData = null;
    let streamCreditsSettings = {
        title: 'ขอบคุณผู้สนับสนุน',
        subtitle: 'Stream Credits',
        outroText: 'แล้วพบกันใหม่!',
        outroDuration: 10,
        scrollDuration: 45,
        showGiftDetails: true,
        showTopLikes: true,
        showGiftSummary: true,
        showNewFollowers: true,
        showGiftGallery: true,
        showFireworks: true,
        fireworkSound: true,
        musicEnabled: true,
        musicTitle: '',
        musicData: '',
        musicUrl: '',
        myinstantsSlug: '',
        musicVolume: 70,
        colorMode: 'default',
        accentColor: '#bc13fe',
        colors: {}
    };

    const CREDITS_COLOR_GROUPS = [
        { title: '📝 ข้อความ', keys: [
            { k: 'introTitle', l: 'หัวข้อเปิด' },
            { k: 'introSub', l: 'คำบรรยายเปิด' },
            { k: 'introStats', l: 'สถิติเปิด' },
            { k: 'sectionTitle', l: 'หัวข้อส่วน' },
            { k: 'outroText', l: 'ข้อความปิดท้าย' },
            { k: 'outroSub', l: 'คำบรรยายปิด' },
            { k: 'name', l: 'ชื่อผู้ใช้' },
            { k: 'nameRank1', l: 'ชื่ออันดับ 1' },
            { k: 'stats', l: 'สถิติเหรียญ' },
            { k: 'likeStats', l: 'สถิติหัวใจ' }
        ]},
        { title: '🖼️ พื้นหลัง', keys: [
            { k: 'entryBg', l: 'การ์ดรายชื่อ' },
            { k: 'entryRank1Bg', l: 'การ์ดอันดับ 1' },
            { k: 'gridItemBg', l: 'แกลเลอรี (มืด)' },
            { k: 'gridLitBg', l: 'แกลเลอรี (สว่าง)' },
            { k: 'summaryItemBg', l: 'สรุปของขวัญ' },
            { k: 'musicBarBg', l: 'แถบเพลง' },
            { k: 'vignette1', l: 'พื้นหลังกลาง' },
            { k: 'vignette3', l: 'พื้นหลังขอบ' }
        ]},
        { title: '🔲 กรอบ', keys: [
            { k: 'entryBorder', l: 'กรอบการ์ด' },
            { k: 'entryRank1Border', l: 'กรอบอันดับ 1' },
            { k: 'avatarBorder', l: 'กรอบรูปโปรไฟล์' },
            { k: 'giftChipBorder', l: 'กรอบชิปของขวัญ' },
            { k: 'gridItemBorder', l: 'กรอบแกลเลอรี' },
            { k: 'gridLitBorder', l: 'กรอบแกลเลอรีสว่าง' },
            { k: 'musicBarBorder', l: 'กรอบแถบเพลง' },
            { k: 'tierBadgeBorder', l: 'กรอบป้ายระดับ' }
        ]},
        { title: '✨ สีเสริม', keys: [
            { k: 'rank', l: 'เลขอันดับ' },
            { k: 'rank1', l: 'อันดับ 1' },
            { k: 'rank2', l: 'อันดับ 2' },
            { k: 'rank3', l: 'อันดับ 3' },
            { k: 'introMusic', l: 'ชื่อเพลงเปิด' },
            { k: 'outroMusic', l: 'ชื่อเพลงปิด' },
            { k: 'galleryLit', l: 'แกลเลอรีสว่าง' },
            { k: 'galleryUnlit', l: 'แกลเลอรีมืด' }
        ]}
    ];

    function creditsHexToRgb(hex) {
        const h = String(hex || '').replace('#', '');
        if (h.length !== 6) return { r: 188, g: 19, b: 254 };
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }
    function creditsRgbToHex(r, g, b) {
        return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    }
    function creditsMixHex(c1, c2, t) {
        const a = creditsHexToRgb(c1), b = creditsHexToRgb(c2);
        return creditsRgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    }
    function creditsLighten(hex, pct) { return creditsMixHex(hex, '#ffffff', pct / 100); }
    function creditsDarken(hex, pct) { return creditsMixHex(hex, '#000000', pct / 100); }
    function creditsRgbaHex(hex, alpha) {
        const { r, g, b } = creditsHexToRgb(hex);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function creditsGetDefaultTheme() {
        return {
            introTitle: '#f1c40f', introTitleGlow: 'rgba(241,196,15,0.7)',
            introSub: '#dddddd', introStats: '#aaaaaa', introMusic: '#bc13fe',
            sectionTitle: '#bc13fe', sectionGlow: 'rgba(188,19,254,0.4)',
            outroText: '#ffffff', outroGlow: 'rgba(188,19,254,0.6)', outroSub: '#aaaaaa', outroMusic: '#bc13fe',
            name: '#ffffff', nameRank1: '#f1c40f', handle: '#aaaaaa',
            stats: '#00d2ff', statsRank1: '#f1c40f', likeStats: '#ff6b7a',
            rank: '#bc13fe', rank1: '#f1c40f', rank2: '#c0c0c0', rank3: '#cd7f32',
            entryBg: 'rgba(0,0,0,0.78)', entryBorder: 'rgba(255,255,255,0.12)',
            entryRank1Bg: 'rgba(28,22,0,0.85)', entryRank1Border: 'rgba(241,196,15,0.5)', entryRank1Shadow: 'rgba(241,196,15,0.15)',
            entryRank2Bg: 'rgba(18,18,22,0.82)', entryRank2Border: 'rgba(192,192,192,0.4)',
            entryRank3Bg: 'rgba(22,14,6,0.82)', entryRank3Border: 'rgba(205,127,50,0.4)',
            avatarBorder: 'rgba(188,19,254,0.5)', avatarRank1Border: '#f1c40f', avatarRank1Shadow: 'rgba(241,196,15,0.4)',
            giftChipBg: 'rgba(0,0,0,0.55)', giftChipBorder: 'rgba(255,255,255,0.14)', giftChipText: '#cccccc',
            galleryLit: '#f1c40f', galleryUnlit: '#777777',
            gridItemBg: 'rgba(0,0,0,0.82)', gridItemBorder: 'rgba(255,255,255,0.12)',
            gridLitBg: 'rgba(28,22,0,0.78)', gridLitBorder: 'rgba(241,196,15,0.6)', gridLitShadow: 'rgba(241,196,15,0.25)',
            summaryItemBg: 'rgba(28,22,0,0.8)', summaryItemBorder: 'rgba(241,196,15,0.5)', summaryShadow: 'rgba(241,196,15,0.2)',
            tierBadgeBg1: 'rgba(188,19,254,0.3)', tierBadgeBg2: 'rgba(0,210,255,0.15)', tierBadgeBorder: 'rgba(188,19,254,0.5)',
            musicBarBg: 'rgba(10,6,20,0.92)', musicBarBorder: 'rgba(188,19,254,0.45)', musicBarShadow: 'rgba(188,19,254,0.25)', musicEq: '#bc13fe',
            vignette1: 'rgba(5,3,12,0.82)', vignette2: 'rgba(3,2,8,0.94)', vignette3: 'rgba(0,0,0,0.98)'
        };
    }

    function creditsGenerateAutoTheme(accent) {
        const a = accent || '#bc13fe';
        const light = creditsLighten(a, 22);
        const lighter = creditsLighten(a, 42);
        const lightest = creditsLighten(a, 58);
        const dark = creditsDarken(a, 18);
        const darker = creditsDarken(a, 55);
        return {
            introTitle: light, introTitleGlow: creditsRgbaHex(light, 0.7),
            introSub: lightest, introStats: lighter, introMusic: a,
            sectionTitle: a, sectionGlow: creditsRgbaHex(a, 0.4),
            outroText: '#ffffff', outroGlow: creditsRgbaHex(a, 0.6), outroSub: lighter, outroMusic: a,
            name: '#ffffff', nameRank1: light, handle: lighter,
            stats: creditsLighten(a, 32), statsRank1: light, likeStats: creditsLighten(a, 18),
            rank: a, rank1: light, rank2: lighter, rank3: dark,
            entryBg: 'rgba(5,3,12,0.88)', entryBorder: creditsRgbaHex(a, 0.28),
            entryRank1Bg: creditsRgbaHex(darker, 0.9), entryRank1Border: creditsRgbaHex(a, 0.55), entryRank1Shadow: creditsRgbaHex(a, 0.2),
            entryRank2Bg: creditsRgbaHex(darker, 0.86), entryRank2Border: creditsRgbaHex(a, 0.35),
            entryRank3Bg: creditsRgbaHex(darker, 0.84), entryRank3Border: creditsRgbaHex(a, 0.28),
            avatarBorder: creditsRgbaHex(a, 0.55), avatarRank1Border: light, avatarRank1Shadow: creditsRgbaHex(a, 0.4),
            giftChipBg: 'rgba(0,0,0,0.55)', giftChipBorder: creditsRgbaHex(a, 0.22), giftChipText: lightest,
            galleryLit: light, galleryUnlit: creditsDarken(a, 28),
            gridItemBg: 'rgba(0,0,0,0.82)', gridItemBorder: creditsRgbaHex(a, 0.22),
            gridLitBg: creditsRgbaHex(darker, 0.82), gridLitBorder: creditsRgbaHex(a, 0.55), gridLitShadow: creditsRgbaHex(a, 0.25),
            summaryItemBg: creditsRgbaHex(darker, 0.84), summaryItemBorder: creditsRgbaHex(a, 0.5), summaryShadow: creditsRgbaHex(a, 0.2),
            tierBadgeBg1: creditsRgbaHex(a, 0.3), tierBadgeBg2: creditsRgbaHex(a, 0.12), tierBadgeBorder: creditsRgbaHex(a, 0.5),
            musicBarBg: creditsRgbaHex(darker, 0.92), musicBarBorder: creditsRgbaHex(a, 0.45), musicBarShadow: creditsRgbaHex(a, 0.25), musicEq: a,
            vignette1: creditsRgbaHex(darker, 0.82), vignette2: creditsRgbaHex(darker, 0.94), vignette3: 'rgba(0,0,0,0.98)'
        };
    }

    function creditsResolveTheme(settings) {
        const s = settings || streamCreditsSettings;
        if (s.colorMode === 'auto' && s.accentColor) return creditsGenerateAutoTheme(s.accentColor);
        if (s.colorMode === 'custom' && s.colors && Object.keys(s.colors).length) {
            return { ...creditsGetDefaultTheme(), ...s.colors };
        }
        return creditsGetDefaultTheme();
    }

    function creditsSetColorMode(mode) {
        streamCreditsSettings.colorMode = mode;
        ['default', 'auto', 'custom'].forEach(m => {
            const btn = document.getElementById('creditsColorMode-' + m);
            if (btn) btn.classList.toggle('active', m === mode);
        });
        const autoPanel = document.getElementById('creditsColorAutoPanel');
        const customPanel = document.getElementById('creditsColorCustomPanel');
        if (autoPanel) autoPanel.style.display = mode === 'auto' ? 'block' : 'none';
        if (customPanel) customPanel.classList.toggle('show', mode === 'custom');
        saveStreamCreditsSettings();
    }

    function creditsApplyAccentColor(hex) {
        streamCreditsSettings.accentColor = hex;
        streamCreditsSettings.colorMode = 'auto';
        creditsSetColorMode('auto');
        const accentEl = document.getElementById('creditsAccentColor');
        if (accentEl && accentEl.value !== hex) accentEl.value = hex;
        saveStreamCreditsSettings();
    }

    function creditsUpdateCustomColor(key, val) {
        if (!streamCreditsSettings.colors) streamCreditsSettings.colors = {};
        streamCreditsSettings.colors[key] = val;
        streamCreditsSettings.colorMode = 'custom';
        creditsSetColorMode('custom');
        saveStreamCreditsSettings();
    }

    function creditsResetColors() {
        streamCreditsSettings.colorMode = 'default';
        streamCreditsSettings.accentColor = '#bc13fe';
        streamCreditsSettings.colors = {};
        creditsSetColorMode('default');
        creditsSyncColorUI();
        saveStreamCreditsSettings();
        showCustomMsg('success', 'คืนค่าแล้ว', 'ธีมสี Overlay กลับเป็น Default');
    }

    function creditsBuildCustomColorUI() {
        const wrap = document.getElementById('creditsColorCustomPanel');
        if (!wrap || wrap.dataset.built === '1') return;
        wrap.dataset.built = '1';
        const defaults = creditsGetDefaultTheme();
        let html = '';
        CREDITS_COLOR_GROUPS.forEach(group => {
            html += '<div class="credits-color-group"><div class="credits-color-group-title">' + group.title + '</div><div class="credits-color-grid">';
            group.keys.forEach(item => {
                const def = defaults[item.k] || '#bc13fe';
                const hex = def.startsWith('rgba') ? '#bc13fe' : def;
                html += '<div class="credits-color-item"><label title="' + item.l + '">' + item.l + '</label>' +
                    '<input type="color" id="creditsColor-' + item.k + '" value="' + hex + '" data-key="' + item.k + '" oninput="creditsUpdateCustomColor(this.dataset.key, this.value)"></div>';
            });
            html += '</div></div>';
        });
        wrap.innerHTML = html;
    }

    function creditsSyncColorUI() {
        creditsBuildCustomColorUI();
        const mode = streamCreditsSettings.colorMode || 'default';
        creditsSetColorMode(mode);
        const accentEl = document.getElementById('creditsAccentColor');
        if (accentEl) accentEl.value = streamCreditsSettings.accentColor || '#bc13fe';
        const theme = creditsResolveTheme();
        CREDITS_COLOR_GROUPS.forEach(group => {
            group.keys.forEach(item => {
                const el = document.getElementById('creditsColor-' + item.k);
                if (!el) return;
                const val = (streamCreditsSettings.colors && streamCreditsSettings.colors[item.k]) || theme[item.k] || '#bc13fe';
                if (String(val).startsWith('#') && el.value !== val) el.value = val;
            });
        });
    }

    function applyStreamCreditsMusicFromAdvConf() {
        if (advConf?.streamCreditsMusic) {
            streamCreditsSettings = { ...streamCreditsSettings, ...advConf.streamCreditsMusic };
        }
    }

    function updateCreditsMusicStatusUI() {
        const musicStatus = document.getElementById('creditsMusicStatus');
        if (!musicStatus) return;
        const hasMusic = !!(streamCreditsSettings.musicData || streamCreditsSettings.musicUrl);
        if (!hasMusic) {
            musicStatus.textContent = 'ยังไม่ได้เลือกเพลง';
            musicStatus.style.color = '#888';
            return;
        }
        if (streamCreditsSettings.musicUrl) {
            musicStatus.textContent = '🌐 MyInstants: ' + (streamCreditsSettings.musicTitle || 'เลือกเพลงแล้ว');
        } else {
            musicStatus.textContent = '✅ ' + (streamCreditsSettings.musicTitle || 'อัปโหลดเพลงแล้ว');
        }
        musicStatus.style.color = '#2ecc71';
    }

    function stopCreditsMusicPreview() {
        if (creditsMusicPreviewAudio) {
            creditsMusicPreviewAudio.pause();
            creditsMusicPreviewAudio.onended = null;
            creditsMusicPreviewAudio = null;
        }
    }

    function getCreditsMusicVolume() {
        return Math.max(0, Math.min(1, (streamCreditsSettings.musicVolume != null ? streamCreditsSettings.musicVolume : 70) / 100));
    }

    function playCreditsMusic(opts) {
        const o = opts || {};
        if (streamCreditsSettings.musicEnabled === false && !o.force) return false;
        const src = streamCreditsSettings.musicData || streamCreditsSettings.musicUrl;
        if (!src) {
            if (o.force) showCustomMsg('warning', 'ยังไม่มีเพลง', 'กรุณาอัปโหลดหรือเลือกเพลงก่อน');
            return false;
        }
        stopCreditsMusicPreview();
        try {
            const audio = new Audio(src);
            creditsMusicPreviewAudio = audio;
            audio.volume = getCreditsMusicVolume();
            audio.loop = !!o.loop;
            if (!o.loop) audio.onended = () => { creditsMusicPreviewAudio = null; };
            audio.play().catch(() => {
                if (o.force) showCustomMsg('warning', 'เล่นไม่ได้', 'ลองกดทดสอบอีกครั้งหรือเลือกเพลงใหม่');
            });
            return true;
        } catch (e) {
            if (o.force) showCustomMsg('error', 'เล่นไม่ได้', 'ไฟล์เพลงไม่ถูกต้อง');
            return false;
        }
    }

    function previewCreditsMusic() {
        playCreditsMusic({ force: true, loop: false });
    }

    function openCreditsMyInstantsModal() {
        myInstantsPickMode = 'credits';
        openSoundAlertMyInstantsModal();
    }

    function broadcastCreditsMusicToOverlay(action) {
        if (!socket?.connected || !currentUser?.streamToken) return;
        socket.emit('play_credits_music', {
            token: currentUser.streamToken,
            action: action || 'play',
            musicEnabled: streamCreditsSettings.musicEnabled !== false,
            musicTitle: streamCreditsSettings.musicTitle || '',
            musicData: streamCreditsSettings.musicData || null,
            musicUrl: streamCreditsSettings.musicUrl || null,
            musicVolume: streamCreditsSettings.musicVolume ?? 70
        });
    }

    function creditsIsRealAvatar(url) {
        return url && typeof url === 'string' && url.trim() !== '' && !url.includes('dicebear.com');
    }

    function creditsResolveAvatar(uid, fallback) {
        if (creditsIsRealAvatar(streamCreditsAvatarCache[uid])) return streamCreditsAvatarCache[uid];
        const gifter = streamCreditsGifters[uid];
        if (gifter && creditsIsRealAvatar(gifter.avatar)) return gifter.avatar;
        if (creditsIsRealAvatar(fallback)) return fallback;
        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(uid)}`;
    }

    function creditsCacheUserProfile(data) {
        const uid = data?.uniqueId;
        if (!uid) return;
        const av = data.avatar || data.profilePictureUrl;
        if (!creditsIsRealAvatar(av)) return;
        streamCreditsAvatarCache[uid] = av;
        if (streamCreditsLikers[uid]) streamCreditsLikers[uid].avatar = av;
        if (streamCreditsGifters[uid]) streamCreditsGifters[uid].avatar = av;
        if (streamCreditsFollowers[uid]) streamCreditsFollowers[uid].avatar = av;
    }

    function creditsRefreshLikerAvatars() {
        Object.values(streamCreditsLikers).forEach(l => {
            l.avatar = creditsResolveAvatar(l.uniqueId, l.avatar);
        });
    }

    function loadStreamCreditsSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('stream_credits_settings'));
            if (saved) streamCreditsSettings = { ...streamCreditsSettings, ...saved };
        } catch (e) {}
        applyStreamCreditsMusicFromAdvConf();
    }
    loadStreamCreditsSettings();

    function saveStreamCreditsSettings() {
        const meta = { ...streamCreditsSettings };
        const musicStore = {
            musicTitle: meta.musicTitle || '',
            musicData: meta.musicData || null,
            musicUrl: meta.musicUrl || null,
            myinstantsSlug: meta.myinstantsSlug || null,
            musicVolume: meta.musicVolume ?? 70
        };
        delete meta.musicData;
        delete meta.musicUrl;
        delete meta.myinstantsSlug;
        meta.hasMusic = !!(streamCreditsSettings.musicData || streamCreditsSettings.musicUrl);
        try {
            localStorage.setItem('stream_credits_settings', JSON.stringify(meta));
        } catch (e) {}
        if (!advConf.streamCreditsMusic) advConf.streamCreditsMusic = {};
        advConf.streamCreditsMusic = { ...musicStore };
        autoSave();
    }

    function creditsUpdateSetting(key, val) {
        streamCreditsSettings[key] = val;
        saveStreamCreditsSettings();
        refreshCreditsOverlayPreview();
    }

    function switchCreditsTab(tab) {
        creditsActiveTab = tab;
        ['gifters', 'likers', 'summary', 'followers', 'gallery'].forEach(t => {
            const btn = document.getElementById('creditsTab-' + t);
            const panel = document.getElementById('creditsPanel-' + t);
            if (btn) btn.classList.toggle('active', t === tab);
            if (panel) panel.classList.toggle('active', t === tab);
        });
        if (tab === 'gallery') refreshStreamCreditsGiftGallery();
    }

    function switchCreditsTopTab(tab) {
        ['settings', 'live'].forEach(t => {
            const btn = document.getElementById('creditsTopTab-' + t);
            const sec = document.getElementById('creditsSec-' + t);
            if (btn) btn.classList.toggle('active', t === tab);
            if (sec) {
                sec.style.display = t === tab ? 'flex' : 'none';
                sec.classList.toggle('active', t === tab);
            }
        });
        if (tab === 'live') {
            renderCreditsPanelLeaderboard();
            refreshCreditsOverlayPreview();
        }
    }

    async function initCreditsUI() {
        await ensureGiftCatalogLoaded();
        const titleEl = document.getElementById('creditsSettingTitle');
        const subEl = document.getElementById('creditsSettingSubtitle');
        const outroEl = document.getElementById('creditsSettingOutro');
        const outroDurEl = document.getElementById('creditsSettingOutroDuration');
        const durEl = document.getElementById('creditsSettingDuration');
        const giftsEl = document.getElementById('creditsSettingShowGifts');
        const likesEl = document.getElementById('creditsSettingShowLikes');
        const summaryEl = document.getElementById('creditsSettingShowSummary');
        const followersEl = document.getElementById('creditsSettingShowFollowers');
        const galleryEl = document.getElementById('creditsSettingShowGallery');
        const fireworksEl = document.getElementById('creditsSettingShowFireworks');
        const fireworkSoundEl = document.getElementById('creditsSettingFireworkSound');
        const musicEl = document.getElementById('creditsSettingMusicEnabled');
        const musicTitleEl = document.getElementById('creditsSettingMusicTitle');
        const musicVolEl = document.getElementById('creditsSettingMusicVolume');
        if (titleEl) titleEl.value = streamCreditsSettings.title || '';
        if (subEl) subEl.value = streamCreditsSettings.subtitle || '';
        if (outroEl) outroEl.value = streamCreditsSettings.outroText || '';
        if (outroDurEl) outroDurEl.value = streamCreditsSettings.outroDuration != null ? streamCreditsSettings.outroDuration : 10;
        if (durEl) durEl.value = streamCreditsSettings.scrollDuration || 45;
        if (giftsEl) giftsEl.checked = streamCreditsSettings.showGiftDetails !== false;
        if (likesEl) likesEl.checked = streamCreditsSettings.showTopLikes !== false;
        if (summaryEl) summaryEl.checked = streamCreditsSettings.showGiftSummary !== false;
        if (followersEl) followersEl.checked = streamCreditsSettings.showNewFollowers !== false;
        if (galleryEl) galleryEl.checked = streamCreditsSettings.showGiftGallery !== false;
        if (fireworksEl) fireworksEl.checked = streamCreditsSettings.showFireworks !== false;
        if (fireworkSoundEl) fireworkSoundEl.checked = streamCreditsSettings.fireworkSound !== false;
        if (musicEl) musicEl.checked = streamCreditsSettings.musicEnabled !== false;
        if (musicTitleEl) musicTitleEl.value = streamCreditsSettings.musicTitle || '';
        if (musicVolEl) musicVolEl.value = streamCreditsSettings.musicVolume != null ? streamCreditsSettings.musicVolume : 70;
        creditsSyncColorUI();
        updateCreditsMusicStatusUI();
        creditsRefreshLikerAvatars();
        switchCreditsTab(creditsActiveTab);
        switchCreditsTopTab('live');
        renderCreditsPanelLeaderboard();
        refreshCreditsOverlayPreview();
        ensureCreditsPreviewScaler();
        updateCreditsTestButtonState();
        fetchStreamCreditsGiftGallery();
    }

    const CREDITS_TEST_GIFT_FALLBACKS = [
        { giftId: '5655', giftName: 'Rose', giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/rose.png', diamondCount: 1 },
        { giftId: '5269', giftName: 'TikTok', giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/tiktok.png', diamondCount: 5 },
        { giftId: '6427', giftName: 'Finger Heart', giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/finger_heart.png', diamondCount: 5 },
        { giftId: '5487', giftName: 'Doughnut', giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/doughnut.png', diamondCount: 30 },
        { giftId: '5509', giftName: 'Sunglasses', giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/sunglasses.png', diamondCount: 99 },
        { giftId: '5585', giftName: 'Love Bang', giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/love_bang.png', diamondCount: 100 },
        { giftId: '5586', giftName: 'Galaxy', giftIcon: 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/galaxy.png', diamondCount: 1000 }
    ];

    const CREDITS_TEST_USERS = [
        { uniqueId: 'panda_fan01', nickname: 'แฟนคลับน้องแพนด้า' },
        { uniqueId: 'gift_king_th', nickname: 'Gift King TH' },
        { uniqueId: 'rose_lover', nickname: 'คนรักกุหลาบ' },
        { uniqueId: 'tiktok_star', nickname: 'TikTok Star' },
        { uniqueId: 'galaxy_boss', nickname: 'เจ้าแห่งกาแล็กซี่' },
        { uniqueId: 'heart_queen', nickname: 'ราชินีหัวใจ' },
        { uniqueId: 'new_follower01', nickname: 'ผู้ติดตามใหม่' },
        { uniqueId: 'like_master', nickname: 'นักกดใจ' }
    ];

    function creditsResolveTestGift(index) {
        const cat = (typeof popularGifts !== 'undefined' && popularGifts.length) ? popularGifts : null;
        if (cat && cat[index % cat.length]) {
            const g = cat[index % cat.length];
            return {
                giftId: String(g.giftId),
                giftName: g.giftName,
                giftIcon: g.icon || '',
                diamondCount: g.cost || 1
            };
        }
        return CREDITS_TEST_GIFT_FALLBACKS[index % CREDITS_TEST_GIFT_FALLBACKS.length];
    }

    function creditsInjectTestGift(user, giftDef, repeatCount) {
        const count = repeatCount || 1;
        const coins = (giftDef.diamondCount || 1) * count;
        const uid = user.uniqueId;
        if (!streamCreditsGifters[uid]) {
            streamCreditsGifters[uid] = {
                uniqueId: uid,
                nickname: user.nickname || uid,
                avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(uid)}`,
                totalCoins: 0,
                giftCount: 0,
                gifts: {}
            };
        }
        const g = streamCreditsGifters[uid];
        g.totalCoins += coins;
        g.giftCount += count;
        const gKey = String(giftDef.giftId || giftDef.giftName);
        if (!g.gifts[gKey]) {
            g.gifts[gKey] = { giftName: giftDef.giftName, giftIcon: giftDef.giftIcon || '', count: 0, coins: 0 };
        }
        g.gifts[gKey].count += count;
        g.gifts[gKey].coins += coins;
        recordStreamCreditsGiftTotals({
            giftId: giftDef.giftId,
            giftName: giftDef.giftName,
            giftIcon: giftDef.giftIcon,
            diamondCount: giftDef.diamondCount,
            repeatCount: count,
            totalCoins: coins
        });
    }

    function creditsIsLiveConnected() {
        const u = window.currentUser;
        return !!(u && u.isLive);
    }

    function updateCreditsTestButtonState() {
        const btn = document.getElementById('creditsTestDataBtn');
        const row = document.getElementById('creditsTestGiftRow');
        const live = creditsIsLiveConnected();
        if (btn) {
            btn.disabled = false;
            btn.classList.toggle('is-live-locked', live);
            btn.title = live
                ? 'กำลังไลฟ์อยู่ — ข้อมูลจริงจะถูกบันทึกอัตโนมัติ'
                : 'เติมข้อมูลตัวอย่าง (Rose, TikTok, Galaxy...)';
        }
        if (row) row.style.display = live ? 'none' : 'flex';
        renderCreditsTestGiftButtons();
    }

    function renderCreditsTestGiftButtons() {
        const row = document.getElementById('creditsTestGiftRow');
        if (!row || creditsIsLiveConnected()) return;
        const picks = CREDITS_TEST_GIFT_FALLBACKS.slice(0, 5).map((fb, i) => {
            const g = creditsResolveTestGift(i);
            const label = g.giftName || fb.giftName;
            const icon = g.giftIcon
                ? `<img src="${g.giftIcon}" alt="" onerror="this.remove()">`
                : '🎁';
            return `<button type="button" class="credits-test-gift-btn" onclick="addCreditsTestGift(${i})" title="เพิ่มตัวอย่าง ${label}">${icon}<span>${label}</span></button>`;
        }).join('');
        row.innerHTML = picks;
    }

    async function fillCreditsTestData() {
        if (creditsIsLiveConnected()) {
            showCustomMsg('warning', 'กำลังไลฟ์อยู่', 'ปุ่มทดสอบใช้ได้เมื่อยังไม่ได้ไลฟ์');
            return;
        }
        try {
            if (typeof ensureGiftCatalogLoaded === 'function') {
                await Promise.race([
                    ensureGiftCatalogLoaded(),
                    new Promise((r) => setTimeout(r, 2500))
                ]);
            }
        } catch (e) {}
        if (creditsHasPlayableData()) {
            streamCreditsGifters = {};
            streamCreditsLikers = {};
            streamCreditsFollowers = {};
            streamCreditsGiftTotals = {};
        }
        const giftPlans = [
            { user: 0, gift: 0, count: 42 },
            { user: 1, gift: 1, count: 28 },
            { user: 2, gift: 0, count: 65 },
            { user: 3, gift: 2, count: 18 },
            { user: 4, gift: 6, count: 3 },
            { user: 1, gift: 5, count: 8 },
            { user: 0, gift: 3, count: 12 },
            { user: 5, gift: 4, count: 5 }
        ];
        giftPlans.forEach(p => {
            creditsInjectTestGift(CREDITS_TEST_USERS[p.user], creditsResolveTestGift(p.gift), p.count);
        });
        recordStreamCreditsLike({ uniqueId: 'like_master', nickname: 'นักกดใจ', likeCount: 12840, _testBypass: true });
        recordStreamCreditsLike({ uniqueId: 'heart_queen', nickname: 'ราชินีหัวใจ', likeCount: 9650, _testBypass: true });
        recordStreamCreditsLike({ uniqueId: 'panda_fan01', nickname: 'แฟนคลับน้องแพนด้า', likeCount: 4200, _testBypass: true });
        recordStreamCreditsFollow({ uniqueId: 'new_follower01', nickname: 'ผู้ติดตามใหม่', _testBypass: true });
        recordStreamCreditsFollow({ uniqueId: 'tiktok_star', nickname: 'TikTok Star', _testBypass: true });
        renderCreditsPanelLeaderboard();
        syncStreamCreditsToOverlay('sync');
        const names = [...new Set(giftPlans.map(p => creditsResolveTestGift(p.gift).giftName))].slice(0, 4).join(', ');
        showCustomMsg('success', 'โหลดข้อมูลทดสอบแล้ว', `ตัวอย่าง: ${names} · กด ▶️ เล่น Credits เพื่อดูบนโอเวอร์เลย์`);
    }

    function addCreditsTestGift(giftIndex) {
        if (creditsIsLiveConnected()) {
            showCustomMsg('warning', 'กำลังไลฟ์อยู่', 'ปุ่มทดสอบใช้ได้เมื่อยังไม่ได้ไลฟ์');
            return;
        }
        const gift = creditsResolveTestGift(giftIndex || 0);
        const user = CREDITS_TEST_USERS[(giftIndex || 0) % CREDITS_TEST_USERS.length];
        creditsInjectTestGift(user, gift, Math.max(1, 3 + (giftIndex % 5)));
        renderCreditsPanelLeaderboard();
        syncStreamCreditsToOverlay('sync');
        showCustomMsg('success', 'เพิ่มตัวอย่างแล้ว', `${user.nickname} ส่ง ${gift.giftName}`);
    }

    let creditsPreviewScalerObs = null;

    function syncCreditsPreviewScaler() {
        const frame = document.getElementById('creditsScreenPreview');
        const scaler = frame?.querySelector('.credits-screen-preview-scaler');
        if (!frame || !scaler) return;
        const w = frame.clientWidth;
        if (w > 0) {
            const scale = w / 1080;
            scaler.style.transform = `scale(${scale})`;
            frame.style.setProperty('--credits-preview-scale', String(scale));
        }
    }

    function ensureCreditsPreviewScaler() {
        syncCreditsPreviewScaler();
        const frame = document.getElementById('creditsScreenPreview');
        if (!frame || creditsPreviewScalerObs) return;
        if (typeof ResizeObserver !== 'undefined') {
            creditsPreviewScalerObs = new ResizeObserver(() => syncCreditsPreviewScaler());
            creditsPreviewScalerObs.observe(frame);
        } else {
            window.addEventListener('resize', syncCreditsPreviewScaler);
        }
    }

    function refreshCreditsOverlayPreview() {
        const iframe = document.getElementById('creditsOverlayPreview');
        if (!iframe || typeof buildOverlayUrl !== 'function') return;
        ensureCreditsPreviewScaler();
        const baseUrl = buildOverlayUrl('credits', { w: '1080', h: '1920', preview: '1' });
        const pushPreviewPayload = () => {
            try {
                const totals = typeof getStreamCreditsTotals === 'function' ? getStreamCreditsTotals() : {};
                const payload = {
                    settings: { ...streamCreditsSettings, musicData: null },
                    totalGifters: totals.gifters || 0,
                    totalLikers: totals.likers || 0,
                    totalGifts: totals.gifts || 0,
                    totalLikes: totals.likes || 0,
                    totalCoins: totals.coins || 0,
                    totalFollowers: totals.followers || 0
                };
                iframe.contentWindow?.postMessage({ type: 'tokcontrol_credits_preview', payload }, '*');
            } catch (e) {}
        };
        iframe.onload = () => setTimeout(pushPreviewPayload, 60);
        if (iframe.dataset.loadedUrl === baseUrl && iframe.contentWindow) {
            pushPreviewPayload();
            return;
        }
        iframe.dataset.loadedUrl = baseUrl;
        iframe.src = baseUrl;
    }

    async function fetchStreamCreditsGiftGallery() {
        if (!currentUser?.id) return;
        try {
            const res = await fetch(`/api/gift-gallery?userId=${encodeURIComponent(currentUser.id)}`);
            const data = await res.json();
            if (data.success && data.gallery) {
                streamCreditsGiftGalleryData = data.gallery;
                renderCreditsPanelLeaderboard();
                return;
            }
        } catch (e) {}
        const username = connectedTikTok?.username || currentUser?.tiktokUsername;
        if (username && socket?.connected) {
            socket.emit('request_gift_gallery', {
                userId: currentUser.id,
                username,
                token: currentUser.streamToken
            });
            try {
                const refreshRes = await fetch('/api/gift-gallery/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: currentUser.id,
                        username,
                        token: currentUser.streamToken
                    })
                });
                const refreshData = await refreshRes.json();
                if (refreshData.success && refreshData.gallery) {
                    streamCreditsGiftGalleryData = refreshData.gallery;
                    renderCreditsPanelLeaderboard();
                }
            } catch (e) {}
        }
    }

    function refreshStreamCreditsGiftGallery() {
        fetchStreamCreditsGiftGallery();
    }

    async function creditsHandleMusicUpload(input) {
        if (!input?.files?.[0]) return;
        const file = input.files[0];
        if (file.size > 4 * 1024 * 1024) {
            showCustomMsg('error', 'ไฟล์ใหญ่เกินไป', 'สูงสุด 4MB');
            input.value = '';
            return;
        }
        try {
            let dataUrl = '';
            if (window.TokMediaSniff && TokMediaSniff.fileToDataUrl) {
                const r = await TokMediaSniff.fileToDataUrl(file);
                if (r.sniff && (r.sniff.kind === 'image' || r.sniff.kind === 'video' || r.sniff.kind === 'json' || r.sniff.kind === 'zip')) {
                    throw new Error('กรุณาเลือกไฟล์เสียง');
                }
                dataUrl = (r.sniff && r.sniff.kind === 'bin' && r.bytes && TokMediaSniff.dataUrlForSlot)
                    ? TokMediaSniff.dataUrlForSlot(r.bytes, 'sound')
                    : r.dataUrl;
            } else {
                if (file.type && !file.type.startsWith('audio/') && !/\.bin$/i.test(file.name || '')) {
                    showCustomMsg('error', 'ผิดพลาด', 'กรุณาเลือกไฟล์เสียง');
                    input.value = '';
                    return;
                }
                dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
                    reader.readAsDataURL(file);
                });
                if (window.TokMediaSniff && TokMediaSniff.rewriteDataUrl) dataUrl = TokMediaSniff.rewriteDataUrl(dataUrl);
            }
            streamCreditsSettings.musicData = dataUrl;
            streamCreditsSettings.musicUrl = null;
            streamCreditsSettings.myinstantsSlug = null;
            if (!streamCreditsSettings.musicTitle) {
                streamCreditsSettings.musicTitle = file.name.replace(/\.[^.]+$/, '');
                const titleEl = document.getElementById('creditsSettingMusicTitle');
                if (titleEl) titleEl.value = streamCreditsSettings.musicTitle;
            }
            saveStreamCreditsSettings();
            updateCreditsMusicStatusUI();
            showCustomMsg('success', 'โหลดเพลงแล้ว', 'กด ▶️ ทดสอบ หรือเล่น Credits ได้เลย');
        } catch (err) {
            showCustomMsg('error', 'อ่านไฟล์ไม่ได้', err.message || 'กรุณาเลือกไฟล์เสียง');
        }
        input.value = '';
    }

    function recordStreamCreditsGiftTotals(gift) {
        const gKey = String(gift.giftId || gift.giftName || 'gift');
        const count = gift.repeatCount || 1;
        const coins = gift.totalCoins || ((gift.diamondCount || 0) * count);
        if (!streamCreditsGiftTotals[gKey]) {
            streamCreditsGiftTotals[gKey] = {
                giftId: gKey,
                giftName: gift.giftName || 'Gift',
                giftIcon: gift.giftIcon || '',
                count: 0,
                coins: 0
            };
        }
        const gt = streamCreditsGiftTotals[gKey];
        gt.count += count;
        gt.coins += coins;
        if (gift.giftIcon) gt.giftIcon = gift.giftIcon;
        if (gift.giftName) gt.giftName = gift.giftName;
    }

    function recordStreamCreditsGift(gift) {
        if (!isAppPro('credits')) return;
        const uid = gift.uniqueId || 'unknown';
        if (!streamCreditsGifters[uid]) {
            streamCreditsGifters[uid] = {
                uniqueId: uid,
                nickname: gift.nickname || uid,
                avatar: gift.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(uid)}`,
                totalCoins: 0,
                giftCount: 0,
                gifts: {}
            };
        }
        const g = streamCreditsGifters[uid];
        if (gift.nickname) g.nickname = gift.nickname;
        if (gift.avatar && gift.avatar.trim()) g.avatar = gift.avatar;
        const coins = gift.totalCoins || ((gift.diamondCount || 0) * (gift.repeatCount || 1));
        const count = gift.repeatCount || 1;
        g.totalCoins += coins;
        g.giftCount += count;
        const gKey = String(gift.giftId || gift.giftName || 'gift');
        if (!g.gifts[gKey]) {
            g.gifts[gKey] = { giftName: gift.giftName || 'Gift', giftIcon: gift.giftIcon || '', count: 0, coins: 0 };
        }
        g.gifts[gKey].count += count;
        g.gifts[gKey].coins += coins;
        if (gift.giftIcon) g.gifts[gKey].giftIcon = gift.giftIcon;
        if (gift.giftName) g.gifts[gKey].giftName = gift.giftName;
        recordStreamCreditsGiftTotals(gift);
        renderCreditsPanelLeaderboard();
    }

    function recordStreamCreditsLike(data) {
        if (!isAppPro('credits') && !data?._testBypass) return;
        const uid = data.uniqueId || 'unknown';
        const resolvedAv = creditsResolveAvatar(uid, data.avatar || data.profilePictureUrl);
        if (!streamCreditsLikers[uid]) {
            streamCreditsLikers[uid] = {
                uniqueId: uid,
                nickname: data.nickname || uid,
                avatar: resolvedAv,
                likeCount: 0
            };
        }
        const l = streamCreditsLikers[uid];
        if (data.nickname) l.nickname = data.nickname;
        creditsCacheUserProfile(data);
        l.avatar = creditsResolveAvatar(uid, l.avatar);
        l.likeCount += data.likeCount || 1;
        renderCreditsPanelLeaderboard();
    }

    function recordStreamCreditsFollow(data) {
        if (!isAppPro('credits') && !data?._testBypass) return;
        const uid = data?.uniqueId;
        if (!uid) return;
        if (!streamCreditsFollowers[uid]) {
            streamCreditsFollowers[uid] = {
                uniqueId: uid,
                nickname: data.nickname || uid,
                avatar: creditsResolveAvatar(uid, data.avatar || data.profilePictureUrl),
                followedAt: Date.now()
            };
        } else {
            const f = streamCreditsFollowers[uid];
            if (data.nickname) f.nickname = data.nickname;
            f.avatar = creditsResolveAvatar(uid, data.avatar || data.profilePictureUrl || f.avatar);
        }
        renderCreditsPanelLeaderboard();
    }

    function getStreamCreditsTop10() {
        return Object.values(streamCreditsGifters)
            .sort((a, b) => b.totalCoins - a.totalCoins || b.giftCount - a.giftCount)
            .slice(0, 10)
            .map((g, i) => ({
                rank: i + 1,
                uniqueId: g.uniqueId,
                nickname: g.nickname,
                avatar: creditsResolveAvatar(g.uniqueId, g.avatar),
                totalCoins: g.totalCoins,
                giftCount: g.giftCount,
                gifts: Object.values(g.gifts).sort((a, b) => b.coins - a.coins)
            }));
    }

    function getStreamCreditsTopLikes() {
        creditsRefreshLikerAvatars();
        return Object.values(streamCreditsLikers)
            .sort((a, b) => b.likeCount - a.likeCount)
            .slice(0, 10)
            .map((l, i) => ({
                rank: i + 1,
                uniqueId: l.uniqueId,
                nickname: l.nickname,
                avatar: creditsResolveAvatar(l.uniqueId, l.avatar),
                likeCount: l.likeCount
            }));
    }

    function getStreamCreditsGiftSummary() {
        return Object.values(streamCreditsGiftTotals)
            .sort((a, b) => b.count - a.count || b.coins - a.coins);
    }

    function getStreamCreditsNewFollowers() {
        return Object.values(streamCreditsFollowers)
            .sort((a, b) => (a.followedAt || 0) - (b.followedAt || 0))
            .map(f => ({
                uniqueId: f.uniqueId,
                nickname: f.nickname,
                avatar: creditsResolveAvatar(f.uniqueId, f.avatar)
            }));
    }

    function creditsFindReceivedGift(giftId, giftName) {
        const id = String(giftId || '');
        const nameLower = (giftName || '').toLowerCase().trim();
        if (id && streamCreditsGiftTotals[id]) return streamCreditsGiftTotals[id];
        return Object.values(streamCreditsGiftTotals).find(g =>
            (id && String(g.giftId) === id) ||
            ((g.giftName || '').toLowerCase().trim() === nameLower && nameLower)
        ) || null;
    }

    function getStreamCreditsGiftGalleryTiers() {
        if (!streamCreditsGiftGalleryData) return [];
        const tiers = streamCreditsGiftGalleryData.tiers || [];
        if (tiers.length) {
            return tiers.map(t => ({
                ...t,
                gifts: (t.gifts || []).map(g => {
                    const received = creditsFindReceivedGift(g.giftId, g.giftName);
                    return {
                        ...g,
                        received: g.received || !!received,
                        count: received ? received.count : (g.count || g.currentSentCount || 0),
                        coins: received ? received.coins : (g.coinPrice || 0)
                    };
                })
            }));
        }
        if (streamCreditsGiftGalleryData.gifts?.length) {
            return [{
                tierLabel: streamCreditsGiftGalleryData.tierLabel || '—',
                gifts: streamCreditsGiftGalleryData.gifts.map(g => {
                    const received = creditsFindReceivedGift(g.giftId, g.giftName);
                    return {
                        ...g,
                        received: g.received || !!received,
                        count: received ? received.count : (g.count || g.currentSentCount || 0),
                        coins: received ? received.coins : (g.coinPrice || 0)
                    };
                })
            }];
        }
        return [];
    }

    function renderCreditsGiftSummaryItem(g) {
        const icon = g.giftIcon
            ? `<img src="${g.giftIcon}" alt="" onerror="this.style.display='none'">`
            : '<div style="font-size:2rem;">🎁</div>';
        return `<div class="credits-summary-item">${icon}<div class="g-name">${g.giftName}</div><div class="g-count">x${g.count.toLocaleString()}</div><div class="g-coins">🪙 ${g.coins.toLocaleString()}</div></div>`;
    }

    function renderCreditsFollowerItem(f) {
        const avatar = f.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.uniqueId)}`;
        return `<div class="credits-follower-item">
            <img class="f-avatar" src="${avatar}" alt="" onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.uniqueId)}'">
            <div class="f-name">${f.nickname || f.uniqueId}</div>
            <div class="f-handle">@${f.uniqueId}</div>
            <div class="f-badge">➕ ติดตามใหม่</div>
        </div>`;
    }

    function renderCreditsGiftGalleryItem(g) {
        const cls = g.received ? 'is-lit' : 'is-unlit';
        const iconSrc = g.received ? (g.giftIcon || g.unlitIcon) : (g.unlitIcon || g.giftIcon);
        const icon = iconSrc
            ? `<img src="${iconSrc}" alt="" onerror="this.style.display='none'">`
            : '<div style="font-size:1.8rem;">🎁</div>';
        const countHtml = g.received
            ? `<div class="g-count">x${(g.count || 0).toLocaleString()}</div>`
            : `<div class="g-count">—</div>`;
        return `<div class="credits-gift-grid-item ${cls}">${icon}<div class="g-name">${g.giftName}</div>${countHtml}</div>`;
    }

    function getStreamCreditsTotals() {
        const gifters = Object.values(streamCreditsGifters);
        const likers = Object.values(streamCreditsLikers);
        return {
            gifters: gifters.length,
            likers: likers.length,
            gifts: gifters.reduce((s, g) => s + g.giftCount, 0),
            likes: likers.reduce((s, l) => s + l.likeCount, 0),
            coins: gifters.reduce((s, g) => s + g.totalCoins, 0),
            giftTypes: Object.keys(streamCreditsGiftTotals).length,
            followers: Object.keys(streamCreditsFollowers).length
        };
    }

    function creditsHasPlayableData() {
        const galleryTiers = getStreamCreditsGiftGalleryTiers();
        const hasGallery = galleryTiers.some(t => (t.gifts || []).some(g => g.received));
        return getStreamCreditsTop10().length > 0
            || getStreamCreditsTopLikes().length > 0
            || getStreamCreditsGiftSummary().length > 0
            || getStreamCreditsNewFollowers().length > 0
            || hasGallery;
    }

    function renderCreditsLbRow(entry, type) {
        const rankCls = entry.rank <= 3 ? ` rank-${entry.rank}` : '';
        const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;
        const avatar = entry.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(entry.uniqueId)}`;
        if (type === 'likes') {
            return `<div class="credits-lb-row${rankCls}">
                <div class="credits-lb-rank">${medal}</div>
                <img class="credits-lb-avatar" src="${avatar}" alt="" onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(entry.uniqueId)}'">
                <div class="credits-lb-info">
                    <div class="credits-lb-name">${entry.nickname || entry.uniqueId}</div>
                    <div class="credits-lb-handle">@${entry.uniqueId}</div>
                </div>
                <div class="credits-lb-likes">❤️ ${entry.likeCount.toLocaleString()}</div>
            </div>`;
        }
        const giftChips = (entry.gifts || []).slice(0, 6).map(gl => {
            const icon = gl.giftIcon ? `<img src="${gl.giftIcon}" onerror="this.style.display='none'">` : '';
            return `<span class="credits-lb-gift-chip">${icon} ${gl.giftName} x${gl.count}</span>`;
        }).join('');
        const moreGifts = (entry.gifts || []).length > 6 ? `<span class="credits-lb-gift-chip">+${entry.gifts.length - 6} อื่นๆ</span>` : '';
        return `<div class="credits-lb-row${rankCls}">
            <div class="credits-lb-rank">${medal}</div>
            <img class="credits-lb-avatar" src="${avatar}" alt="" onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(entry.uniqueId)}'">
            <div class="credits-lb-info">
                <div class="credits-lb-name">${entry.nickname || entry.uniqueId}</div>
                <div class="credits-lb-handle">@${entry.uniqueId} · 🎁 ${entry.giftCount} ชิ้น</div>
                <div class="credits-lb-gifts">${giftChips}${moreGifts}</div>
            </div>
            <div class="credits-lb-coins">🪙 ${entry.totalCoins.toLocaleString()}</div>
        </div>`;
    }

    function renderCreditsPanelLeaderboard() {
        const playBtn = document.getElementById('creditsPlayBtn');
        const totals = getStreamCreditsTotals();
        const statG = document.getElementById('creditsStatGifters');
        const statLikers = document.getElementById('creditsStatLikers');
        const statGift = document.getElementById('creditsStatGifts');
        const statLikes = document.getElementById('creditsStatLikes');
        const statCoins = document.getElementById('creditsStatCoins');
        const statFollowers = document.getElementById('creditsStatFollowers');
        if (statG) statG.textContent = totals.gifters;
        if (statLikers) statLikers.textContent = totals.likers;
        if (statGift) statGift.textContent = totals.gifts.toLocaleString();
        if (statLikes) statLikes.textContent = totals.likes.toLocaleString();
        if (statCoins) statCoins.textContent = totals.coins.toLocaleString();
        if (statFollowers) statFollowers.textContent = totals.followers.toLocaleString();
        if (playBtn) playBtn.disabled = !creditsHasPlayableData();
        updateCreditsTestButtonState();

        const giftList = document.getElementById('creditsLeaderboard');
        const likeList = document.getElementById('creditsLikesLeaderboard');
        const summaryGrid = document.getElementById('creditsGiftSummaryGrid');
        const followersGrid = document.getElementById('creditsNewFollowersGrid');
        const galleryWrap = document.getElementById('creditsGiftGalleryWrap');
        const tierBadge = document.getElementById('creditsGalleryTierBadge');

        const topG = getStreamCreditsTop10();
        if (giftList) {
            giftList.innerHTML = topG.length
                ? topG.map(e => renderCreditsLbRow(e, 'gifters')).join('')
                : '<div class="credits-empty">ยังไม่มีของขวัญในไลฟ์นี้</div>';
        }

        const topL = getStreamCreditsTopLikes();
        if (likeList) {
            likeList.innerHTML = topL.length
                ? topL.map(e => renderCreditsLbRow(e, 'likes')).join('')
                : '<div class="credits-empty">ยังไม่มีไลค์ในไลฟ์นี้</div>';
        }

        const summary = getStreamCreditsGiftSummary();
        if (summaryGrid) {
            summaryGrid.innerHTML = summary.length
                ? summary.map(g => renderCreditsGiftSummaryItem(g)).join('')
                : '<div class="credits-empty" style="width:100%;">ยังไม่มีของขวัญในไลฟ์นี้</div>';
        }

        const followers = getStreamCreditsNewFollowers();
        if (followersGrid) {
            followersGrid.innerHTML = followers.length
                ? followers.map(f => renderCreditsFollowerItem(f)).join('')
                : '<div class="credits-empty" style="width:100%;">ยังไม่มีผู้ติดตามใหม่ในไลฟ์นี้</div>';
        }

        const galleryTiers = getStreamCreditsGiftGalleryTiers();
        if (tierBadge) {
            if (streamCreditsGiftGalleryData?.tierLabel) {
                const lit = streamCreditsGiftGalleryData.litGiftCount || 0;
                const total = streamCreditsGiftGalleryData.totalGiftCount || (streamCreditsGiftGalleryData.gifts || []).length;
                tierBadge.style.display = 'inline-flex';
                tierBadge.innerHTML = `🏅 ระดับห้อง <b>${streamCreditsGiftGalleryData.tierLabel}</b> · สว่าง ${lit}/${total}`;
            } else {
                tierBadge.style.display = 'none';
            }
        }
        if (galleryWrap) {
            if (!galleryTiers.length) {
                galleryWrap.innerHTML = '<div class="credits-empty" style="width:100%;">เชื่อมต่อ TikTok Live เพื่อโหลดแกลเลอรีตามระดับห้อง (A1/B1/C1...)</div>';
            } else {
                galleryWrap.innerHTML = galleryTiers.map(tier => {
                    const litCount = (tier.gifts || []).filter(g => g.received).length;
                    const tierHtml = `<div class="credits-tier-section">
                        <div class="credits-tier-title">ระดับ ${tier.tierLabel} · สว่าง ${litCount}/${(tier.gifts || []).length}</div>
                        <div class="credits-gift-grid" style="flex:unset;min-height:unset;overflow:visible;">${(tier.gifts || []).map(g => renderCreditsGiftGalleryItem(g)).join('')}</div>
                    </div>`;
                    return tierHtml;
                }).join('');
            }
        }
    }

    function syncStreamCreditsToOverlay(action) {
        if (!socket?.connected || !currentUser?.streamToken) return;
        const totals = getStreamCreditsTotals();
        socket.emit('send_stream_credits', {
            token: currentUser.streamToken,
            action: action || 'sync',
            settings: {
                ...streamCreditsSettings,
                musicData: streamCreditsSettings.musicData || null,
                musicUrl: streamCreditsSettings.musicUrl || null
            },
            topGifters: getStreamCreditsTop10(),
            topLikers: getStreamCreditsTopLikes(),
            giftSummary: getStreamCreditsGiftSummary(),
            newFollowers: getStreamCreditsNewFollowers(),
            giftGalleryTiers: getStreamCreditsGiftGalleryTiers(),
            giftGalleryMeta: streamCreditsGiftGalleryData ? {
                tierLabel: streamCreditsGiftGalleryData.tierLabel,
                anchorLeague: streamCreditsGiftGalleryData.anchorLeague,
                litGiftCount: streamCreditsGiftGalleryData.litGiftCount,
                totalGiftCount: streamCreditsGiftGalleryData.totalGiftCount
            } : null,
            totalGifters: totals.gifters,
            totalLikers: totals.likers,
            totalGifts: totals.gifts,
            totalLikes: totals.likes,
            totalCoins: totals.coins,
            totalGiftTypes: totals.giftTypes,
            totalFollowers: totals.followers
        });
    }

    async function playStreamCredits() {
        if (!isAppPro('credits')) {
            showProUpgradePrompt('Stream Credits');
            return;
        }
        await ensureGiftCatalogLoaded();
        if (!creditsHasPlayableData()) {
            showCustomMsg('warning', 'ยังไม่มีข้อมูล', 'ยังไม่มีข้อมูลในไลฟ์นี้ (ของขวัญ / ไลค์ / ผู้ติดตามใหม่)');
            return;
        }
        streamCreditsPlaying = true;
        syncStreamCreditsToOverlay('play');
        broadcastCreditsMusicToOverlay('play');
        showCustomMsg('success', 'กำลังเล่น Credits', 'โอเวอร์เลย์กำลังแสดง Stream Credits');
    }

    function stopStreamCredits() {
        streamCreditsPlaying = false;
        stopCreditsMusicPreview();
        broadcastCreditsMusicToOverlay('stop');
        syncStreamCreditsToOverlay('stop');
    }

    function resetStreamCredits(silent) {
        streamCreditsGifters = {};
        streamCreditsLikers = {};
        streamCreditsFollowers = {};
        streamCreditsGiftTotals = {};
        streamCreditsAvatarCache = {};
        streamCreditsGiftGalleryData = null;
        streamCreditsPlaying = false;
        renderCreditsPanelLeaderboard();
        syncStreamCreditsToOverlay('stop');
        if (!silent) showCustomMsg('success', 'รีเซ็ตแล้ว', 'ล้างข้อมูล Stream Credits ของไลฟ์นี้');
    }

    function copyCreditsOverlayLink() {
        copyOverlayRouteLink('credits', {}, 'Stream Credits Overlay');
    }

    const _export = (name, fn) => { window[name] = fn; };
    _export('initCreditsUI', initCreditsUI);
    _export('creditsUpdateSetting', creditsUpdateSetting);
    _export('creditsSetColorMode', creditsSetColorMode);
    _export('creditsApplyAccentColor', creditsApplyAccentColor);
    _export('creditsResetColors', creditsResetColors);
    _export('creditsHandleMusicUpload', creditsHandleMusicUpload);
    _export('previewCreditsMusic', previewCreditsMusic);
    _export('openCreditsMyInstantsModal', openCreditsMyInstantsModal);
    _export('playStreamCredits', playStreamCredits);
    _export('stopStreamCredits', stopStreamCredits);
    _export('resetStreamCredits', resetStreamCredits);
    _export('copyCreditsOverlayLink', copyCreditsOverlayLink);
    _export('switchCreditsTab', switchCreditsTab);
    _export('switchCreditsTopTab', switchCreditsTopTab);
    _export('recordStreamCreditsGift', recordStreamCreditsGift);
    _export('recordStreamCreditsLike', recordStreamCreditsLike);
    _export('recordStreamCreditsFollow', recordStreamCreditsFollow);
    _export('creditsCacheUserProfile', creditsCacheUserProfile);
    _export('saveStreamCreditsSettings', saveStreamCreditsSettings);
    _export('updateCreditsMusicStatusUI', updateCreditsMusicStatusUI);
    _export('renderCreditsPanelLeaderboard', renderCreditsPanelLeaderboard);
    _export('refreshStreamCreditsGiftGallery', refreshStreamCreditsGiftGallery);
    _export('fillCreditsTestData', fillCreditsTestData);
    _export('addCreditsTestGift', addCreditsTestGift);
    _export('refreshCreditsOverlayPreview', refreshCreditsOverlayPreview);
    _export('updateCreditsTestButtonState', updateCreditsTestButtonState);
    _export('syncStreamCreditsToOverlay', syncStreamCreditsToOverlay);
    window.applyCreditsMyInstantsPick = function (soundUrl, slug, name) {
        streamCreditsSettings.musicUrl = soundUrl;
        streamCreditsSettings.musicData = null;
        streamCreditsSettings.myinstantsSlug = slug;
        if (!streamCreditsSettings.musicTitle) {
            streamCreditsSettings.musicTitle = name;
            const titleEl = document.getElementById('creditsSettingMusicTitle');
            if (titleEl) titleEl.value = name;
        }
        saveStreamCreditsSettings();
        updateCreditsMusicStatusUI();
    };
    window.setStreamCreditsGiftGalleryData = function (gallery) {
        streamCreditsGiftGalleryData = gallery;
        renderCreditsPanelLeaderboard();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateCreditsTestButtonState);
    } else {
        updateCreditsTestButtonState();
    }
})();
