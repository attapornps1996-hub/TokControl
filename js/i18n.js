/**
 * TokControl UI i18n — Thai / English / Chinese (Simplified)
 */
(function (global) {
    const STORAGE_KEY = 'tokcontrol_app_lang';
    const SUPPORTED = ['th', 'en', 'zh'];

    const STRINGS = {
        'nav.group.main': { th: 'Main', en: 'Main', zh: '主要' },
        'nav.group.overview': { th: 'ภาพรวม', en: 'Overview', zh: '概览' },
        'nav.group.live': { th: 'ไลฟ์', en: 'Live', zh: '直播' },
        'nav.group.game': { th: 'Game', en: 'Game', zh: '游戏' },
        'nav.group.tools': { th: 'เครื่องมือ', en: 'Tools', zh: '工具' },
        'nav.group.system': { th: 'ระบบ', en: 'System', zh: '系统' },
        'nav.group.overlay': { th: 'Overlay', en: 'Overlay', zh: '叠加层' },
        'nav.group.luckydraw': { th: 'Lucky Draw', en: 'Lucky Draw', zh: '抽奖' },
        'nav.group.widgets': { th: 'Widgets', en: 'Widgets', zh: '小工具' },
        'nav.group.events': { th: 'Events', en: 'Events', zh: '活动' },
        'nav.dashboard': { th: 'แดชบอร์ด', en: 'Dashboard', zh: '仪表盘' },
        'nav.settings': { th: 'ตั้งค่า', en: 'Settings', zh: '设置' },
        'nav.gamecenter': { th: 'Game Center', en: 'Game Center', zh: '游戏中心' },
        'nav.gamecontrol': { th: 'Game Control', en: 'Game Control', zh: '游戏控制' },
        'nav.gamelibrary': { th: 'Game Library', en: 'Game Library', zh: '游戏库' },
        'nav.store': { th: 'ร้านค้า', en: 'Store', zh: '商店' },
        'nav.overlays': { th: 'แกลเลอรีโอเวอร์เลย์', en: 'Overlay Gallery', zh: '叠加层库' },
        'nav.vote': { th: 'โหวต', en: 'Vote', zh: '投票' },
        'nav.credits': { th: 'Stream Credits', en: 'Stream Credits', zh: '片尾字幕' },
        'nav.jar': { th: 'Gift Jar Studio', en: 'Gift Jar Studio', zh: '礼物罐工作室' },
        'nav.airdrop': { th: 'Airdrop', en: 'Airdrop', zh: '空投' },
        'nav.gacha': { th: 'กาชา', en: 'Gacha', zh: '扭蛋' },
        'nav.randomwin': { th: 'วงล้อ', en: 'Wheel', zh: '转盘' },
        'nav.luckyrituals': { th: 'สุ่มรางวัล', en: 'Lucky Draw', zh: '抽奖' },
        'nav.win': { th: 'ตัวนับ Win', en: 'Win Counter', zh: '胜利计数' },
        'nav.timer': { th: 'นาฬิกานับถอยหลัง', en: 'Countdown Timer', zh: '倒计时' },
        'nav.tts': { th: 'TTS', en: 'TTS', zh: '文字转语音' },
        'nav.pngtuber': { th: 'Avatar', en: 'Avatar', zh: '虚拟形象' },
        'nav.watchparty': { th: 'Watch Party', en: 'Watch Party', zh: '观影派对' },
        'nav.camera': { th: 'Camera', en: 'Camera', zh: '摄像头' },
        'nav.channelpoints': { th: 'แต้มช่อง', en: 'Channel Points', zh: '频道积分' },
        'nav.soundalerts': { th: 'Sound Alerts', en: 'Sound Alerts', zh: '声音提醒' },
        'nav.soundboard': { th: 'Soundboard', en: 'Soundboard', zh: '音效板' },
        'nav.actionsevents': { th: 'Actions & Events', en: 'Actions & Events', zh: '动作与事件' },
        'nav.songrequest': { th: 'Song Request', en: 'Song Request', zh: '点歌' },
        'nav.chatbot': { th: 'AI Chatbot', en: 'AI Chatbot', zh: 'AI 聊天机器人' },
        'sidebar.proUpgrade': { th: 'สมัคร PRO', en: 'Upgrade to PRO', zh: '升级 PRO' },

        'settings.modalTitle': { th: 'ตั้งค่า', en: 'Settings', zh: '设置' },
        'settings.general': { th: 'ทั่วไป', en: 'General', zh: '常规' },
        'settings.hotkeys': { th: 'ฮอตคีย์', en: 'Hotkeys', zh: '快捷键' },
        'settings.language': { th: 'ภาษาโปรแกรม', en: 'App Language', zh: '界面语言' },
        'settings.languageDesc': { th: 'เลือกภาษาแสดงผลของ TokControl', en: 'Choose TokControl display language', zh: '选择 TokControl 显示语言' },
        'settings.globalHotkeys': { th: 'Global Hotkeys', en: 'Global Hotkeys', zh: '全局快捷键' },
        'settings.globalHotkeysDesc': { th: 'ทำงานแม้สลับไป OBS / เกม (ต้องเปิด TokControl ทิ้งไว้)', en: 'Works while in OBS or games (TokControl must stay open)', zh: '在 OBS 或游戏中仍可用（需保持 TokControl 运行）' },
        'settings.obs': { th: 'OBS / TikTok Studio', en: 'OBS / TikTok Studio', zh: 'OBS / TikTok Studio' },
        'settings.obsDesc': { th: 'คัดลอก URL สำหรับ Browser Source', en: 'Copy URLs for Browser Source', zh: '复制浏览器源 URL' },
        'settings.openObs': { th: 'เปิดตั้งค่า OBS', en: 'Open OBS Setup', zh: '打开 OBS 设置' },
        'settings.renderMode': { th: 'โหมดการแสดงผล', en: 'Render mode', zh: '渲染模式' },
        'settings.renderModeDesc': { th: 'GPU ลื่นกว่า · CPU ใช้เมื่อจอขาว/กระตุกจากไดรเวอร์', en: 'GPU is smoother. Use CPU if the screen is blank or stuttering.', zh: 'GPU 更流畅。若花屏或卡顿可改用 CPU' },
        'settings.restartApp': { th: 'รีสตาร์ทโปรแกรม', en: 'Restart app', zh: '重启程序' },
        'settings.hotkeysHint': { th: 'ดูและจัดการปุ่มลัดทั้งหมดได้ในแท็บ', en: 'View and manage all shortcuts in the', zh: '在' },
        'settings.hotkeysHintTab': { th: 'ฮอตคีย์', en: 'Hotkeys', zh: '快捷键' },
        'settings.hotkeysHintEnd': { th: 'แท็บ', en: 'tab', zh: '标签页中查看和管理所有快捷键' },
        'settings.hotkeySearch': { th: 'ค้นหาฮอตคีย์...', en: 'Search hotkeys...', zh: '搜索快捷键...' },
        'settings.close': { th: 'ปิด', en: 'Close', zh: '关闭' },

        'dash.title': { th: 'ภาพรวมไลฟ์แบบเรียลไทม์', en: 'Real-time live overview', zh: '实时直播概览' },
        'dash.streamStatus': { th: '📶 สถานะสตรีมเมอร์ปัจจุบัน', en: '📶 Current Streamer Status', zh: '📶 当前主播状态' },

        'splash.loading': { th: 'กำลังเตรียมระบบ...', en: 'Preparing...', zh: '正在准备...' },
        'splash.account': { th: 'กำลังตรวจสอบบัญชี...', en: 'Checking account...', zh: '正在检查账户...' },
        'splash.config': { th: 'กำลังโหลดการตั้งค่า...', en: 'Loading settings...', zh: '正在加载设置...' },

        'tts.subtitle': { th: 'อ่านแชทออกเสียงอัตโนมัติ · Google / Edge / เสียงระบบ', en: 'Read chat aloud · Google / Edge / system voices', zh: '自动朗读聊天 · Google / Edge / 系统语音' },
        'tts.start': { th: '▶', en: '▶', zh: '▶' },
        'tts.stop': { th: '⏸', en: '⏸', zh: '⏸' },
        'tts.resume': { th: '▶', en: '▶', zh: '▶' },
        'tts.tab.voice': { th: 'เสียง', en: 'Voice', zh: '语音' },
        'tts.tab.rules': { th: 'เงื่อนไข', en: 'Rules', zh: '规则' },
        'tts.tab.filters': { th: 'ตัวกรอง', en: 'Filters', zh: '过滤' },
        'tts.enable': { th: 'เปิดใช้งาน', en: 'Enable', zh: '启用' },
        'tts.skip': { th: '⏭ ข้าม', en: '⏭ Skip', zh: '⏭ 跳过' },
        'tts.clearQueue': { th: '🗑 ล้างคิว', en: '🗑 Clear Queue', zh: '🗑 清空队列' },
        'tts.status.off': { th: 'TTS ปิดอยู่', en: 'TTS is off', zh: 'TTS 已关闭' },
        'tts.status.ready': { th: 'TTS พร้อมใช้งาน', en: 'TTS ready', zh: 'TTS 就绪' },
        'tts.status.speaking': { th: 'กำลังอ่าน...', en: 'Speaking...', zh: '正在朗读...' },
        'tts.waiting': { th: '— รอเม้น —', en: '— Waiting for chat —', zh: '— 等待评论 —' },
        'tts.queue.empty': { th: 'ยังไม่มีคิว — รอเม้นจาก TikTok Live', en: 'Queue empty — waiting for TikTok Live chat', zh: '队列为空 — 等待 TikTok 直播评论' },
        'tts.queue.count': { th: '{n} รายการ', en: '{n} items', zh: '{n} 条' },
        'tts.card.status': { th: 'สถานะระบบ', en: 'System Status', zh: '系统状态' },
        'tts.card.now': { th: 'กำลังอ่าน', en: 'Now Playing', zh: '正在播放' },
        'tts.card.queue': { th: 'คิวรอ', en: 'Queue', zh: '队列' },
        'tts.card.logs': { th: 'TTS Logs', en: 'TTS Logs', zh: 'TTS 日志' },
        'tts.clearLogs': { th: 'ล้าง', en: 'Clear', zh: '清空' },
        'tts.voiceLang': { th: 'เสียง & ภาษา', en: 'Voice & Language', zh: '语音与语言' },
        'tts.blockWords': { th: 'คำต้องห้าม (คั่นด้วย ,)', en: 'Blocked words (comma-separated)', zh: '屏蔽词（逗号分隔）' },
        'tts.blockWordsHint': { th: 'ค่าเริ่มต้นรวมคำหยาบไทย/อังกฤษและลิงก์ — แก้ไขได้ตามต้องการ', en: 'Defaults include Thai/English profanity and links — edit as needed', zh: '默认包含泰/英脏话和链接 — 可按需修改' },
        'tts.enabled': { th: 'TTS เปิดแล้ว', en: 'TTS enabled', zh: 'TTS 已开启' },
        'tts.enabledMsg': { th: 'ระบบอ่านเม้นพร้อมใช้งาน — ตั้งกลุ่มผู้ใช้ได้ที่ Comment Rules → Allowed Users', en: 'Chat reading is ready — configure users under Comment Rules → Allowed Users', zh: '评论朗读已就绪 — 可在 Comment Rules → Allowed Users 中设置用户' },
        'tts.skip.blocked': { th: 'มีคำต้องห้าม', en: 'Blocked word', zh: '含屏蔽词' },
        'tts.skip.spam': { th: 'สแปม (ตัวอักษรซ้ำ)', en: 'Spam (repeated chars)', zh: '垃圾信息（重复字符）' },
        'tts.skip.length': { th: 'ความยาวไม่ผ่าน ({n} ตัวอักษร)', en: 'Length rejected ({n} chars)', zh: '长度不符（{n} 字）' },
        'tts.skip.queueFull': { th: 'คิวเต็ม', en: 'Queue full', zh: '队列已满' },
        'tts.skip.cooldown': { th: 'Cooldown ({n}s)', en: 'Cooldown ({n}s)', zh: '冷却中（{n}秒）' },
        'tts.skip.command': { th: 'เป็นคำสั่ง (!)', en: 'Is a command (!)', zh: '是指令 (!)' },

        'common.refresh': { th: 'รีเฟรช', en: 'Refresh', zh: '刷新' }
    };

    const NAV_ID_MAP = {
        'nav-dash': 'nav.dashboard',
        'nav-settings': 'nav.settings',
        'nav-gamecontrol': 'nav.gamecontrol',
        'nav-gamelibrary': 'nav.gamelibrary',
        'nav-store': 'nav.store',
        'nav-overlays': 'nav.overlays',
        'nav-vote': 'nav.vote',
        'nav-credits': 'nav.credits',
        'nav-jar': 'nav.jar',
        'nav-airdrop': 'nav.airdrop',
        'nav-gacha': 'nav.gacha',
        'nav-randomwin': 'nav.randomwin',
        'nav-luckyrituals': 'nav.luckyrituals',
        'nav-win': 'nav.win',
        'nav-timer': 'nav.timer',
        'nav-tts': 'nav.tts',
        'nav-pngtuber': 'nav.pngtuber',
        'nav-watchparty': 'nav.watchparty',
        'nav-camera': 'nav.camera',
        'nav-channelpoints': 'nav.channelpoints',
        'nav-soundalerts': 'nav.soundalerts',
        'nav-soundboard': 'nav.soundboard',
        'nav-actionsevents': 'nav.actionsevents',
        'nav-songrequest': 'nav.songrequest',
        'nav-chatbot': 'nav.chatbot'
    };

  const STATIC_ID_MAP = {
        'btnSidebarProUpgrade': 'sidebar.proUpgrade',
        'appSettingsTitle': 'settings.general',
        'dashTitle': 'dash.title',
        'ttsSubtitle': 'tts.subtitle',
        'ttsStatusCardTitle': 'tts.card.status',
        'ttsNowCardTitle': 'tts.card.now',
        'ttsQueueCardTitle': 'tts.card.queue',
        'ttsBlockWordsLabel': 'tts.blockWords',
        'ttsBlockWordsHint': 'tts.blockWordsHint',
        'appHotkeyFilter': null
    };

    function normalizeLang(lang) {
        const l = String(lang || '').toLowerCase().slice(0, 2);
        return SUPPORTED.includes(l) ? l : 'th';
    }

    function getLang() {
        try {
            return normalizeLang(localStorage.getItem(STORAGE_KEY) || 'th');
        } catch (_) {
            return 'th';
        }
    }

    function t(key, vars) {
        const lang = getLang();
        const entry = STRINGS[key];
        let text = entry ? (entry[lang] || entry.th || key) : key;
        if (vars && typeof vars === 'object') {
            Object.keys(vars).forEach((k) => {
                text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
            });
        }
        return text;
    }

    function setNavItemText(el, key) {
        if (!el) return;
        const textSpan = el.querySelector('.nav-label, .nav-game-center-text');
        if (textSpan) {
            textSpan.textContent = t(key);
            return;
        }
        let labelSpan = el.querySelector('.nav-i18n-label');
        if (!labelSpan) {
            [...el.childNodes].forEach((n) => {
                if (n.nodeType === Node.TEXT_NODE) n.remove();
            });
            labelSpan = document.createElement('span');
            labelSpan.className = 'nav-i18n-label';
            const icon = el.querySelector('.nav-icon');
            if (icon) el.insertBefore(labelSpan, icon.nextSibling);
            else el.appendChild(labelSpan);
        }
        labelSpan.textContent = ' ' + t(key);
    }

    function applyNav() {
        Object.entries(NAV_ID_MAP).forEach(([id, key]) => {
            setNavItemText(document.getElementById(id), key);
        });
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (key) el.textContent = t(key);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.placeholder = t(key);
        });
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            if (key) el.title = t(key);
        });
    }

    function applyStaticIds() {
        Object.entries(STATIC_ID_MAP).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (!el || !key) return;
            if (el.tagName === 'INPUT' && el.type === 'text') {
                el.placeholder = t(key);
            } else {
                el.textContent = t(key);
            }
        });
        const hint = document.getElementById('appSettingsHotkeysHint');
        if (hint) {
            hint.innerHTML = t('settings.hotkeysHint') + ' <b style="color:#bc13fe;">' + t('settings.hotkeysHintTab') + '</b> ' + t('settings.hotkeysHintEnd');
        }
        const obsBtn = document.getElementById('appSettingsOpenObsBtn');
        if (obsBtn) obsBtn.textContent = t('settings.openObs');
        const ghTitle = document.getElementById('appSettingsGlobalHotkeysTitle');
        const ghDesc = document.getElementById('appSettingsGlobalHotkeysDesc');
        const obsTitle = document.getElementById('appSettingsObsTitle');
        const obsDesc = document.getElementById('appSettingsObsDesc');
        const langTitle = document.getElementById('appSettingsLangTitle');
        const langDesc = document.getElementById('appSettingsLangDesc');
        if (ghTitle) ghTitle.textContent = t('settings.globalHotkeys');
        if (ghDesc) ghDesc.textContent = t('settings.globalHotkeysDesc');
        if (obsTitle) obsTitle.textContent = t('settings.obs');
        if (obsDesc) obsDesc.textContent = t('settings.obsDesc');
        const renderTitle = document.getElementById('appSettingsRenderTitle');
        const renderDesc = document.getElementById('appSettingsRenderDesc');
        const restartBtn = document.getElementById('appRenderRestartBtn');
        if (renderTitle) renderTitle.textContent = t('settings.renderMode');
        if (renderDesc) renderDesc.textContent = t('settings.renderModeDesc');
        if (restartBtn) restartBtn.textContent = t('settings.restartApp');
        if (langTitle) langTitle.textContent = t('settings.language');
        if (langDesc) langDesc.textContent = t('settings.languageDesc');
        const closeBtn = document.querySelector('.app-settings-close');
        if (closeBtn) closeBtn.title = t('settings.close');
        const sidebarSettings = document.querySelector('.app-settings-sidebar h3');
        if (sidebarSettings) sidebarSettings.textContent = '⚙️ ' + t('settings.modalTitle');
        const navGeneral = document.querySelector('.app-settings-nav-item[data-cat="general"]');
        const navHotkeys = document.querySelector('.app-settings-nav-item[data-cat="hotkeys"]');
        if (navGeneral) navGeneral.textContent = '🏠 ' + t('settings.general');
        if (navHotkeys) navHotkeys.textContent = '⌨️ ' + t('settings.hotkeys');
        const skipBtn = document.querySelector('.tts-header-actions .tts-toolbar-btn:nth-child(2)');
        const clearBtn = document.querySelector('.tts-header-actions .tts-toolbar-btn:nth-child(3)');
        if (skipBtn && !ttsStateSpeaking()) skipBtn.textContent = t('tts.skip');
        if (clearBtn) clearBtn.textContent = t('tts.clearQueue');
        const clearLogsBtn = document.querySelector('.tts-clear-logs');
        if (clearLogsBtn) clearLogsBtn.textContent = t('tts.clearLogs');
        const voiceBlock = document.getElementById('ttsVoiceBlockTitle');
        if (voiceBlock) voiceBlock.textContent = t('tts.voiceLang');
        const dashStream = document.getElementById('dashStreamStatusTitle');
        if (dashStream) dashStream.textContent = t('dash.streamStatus');
    }

    function ttsStateSpeaking() {
        try { return !!(global.ttsState && global.ttsState.speaking); } catch (_) { return false; }
    }

    function refreshDynamicUi() {
        if (typeof global.ttsSetStatus === 'function') {
            global.ttsSetStatus(!!(global.ttsState && global.ttsState.speaking));
        }
        if (typeof global.ttsRenderQueue === 'function') global.ttsRenderQueue();
        if (typeof global.switchAppSettingsCategory === 'function' && global.appSettingsCategory) {
            global.switchAppSettingsCategory(global.appSettingsCategory);
        }
        const btn = document.getElementById('tts-toggle-btn');
        if (btn && global.ttsState) {
            const iconOnly = btn.classList.contains('tts-bt-ctrl');
            if (!global.ttsState.enabled) btn.textContent = iconOnly ? '▶' : t('tts.start');
            else if (global.ttsState.speaking) btn.textContent = iconOnly ? '⏸' : t('tts.stop');
            else btn.textContent = iconOnly ? '▶' : t('tts.resume');
        }
    }

    function apply() {
        const lang = getLang();
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : (lang === 'en' ? 'en' : 'th');
        applyNav();
        applyStaticIds();
        refreshDynamicUi();
        try {
            global.dispatchEvent(new CustomEvent('tokcontrol-lang-change', { detail: { lang } }));
        } catch (_) {}
    }

    function setLang(lang) {
        const next = normalizeLang(lang);
        try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
        const sel = document.getElementById('appLangSelect');
        if (sel) sel.value = next;
        apply();
    }

    function init() {
        const sel = document.getElementById('appLangSelect');
        if (sel) sel.value = getLang();
        apply();
    }

    global.I18n = { t, getLang, setLang, apply, init, SUPPORTED };
    global.setAppLanguage = setLang;
})(typeof window !== 'undefined' ? window : globalThis);
