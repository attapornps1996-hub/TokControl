// database.js - Super Bio Builder PRO Database & Session Manager

const STORAGE_KEYS = {
    USERS: 'biolink_users',
    PROFILES: 'biolink_profiles',
    SESSION: 'biolink_session'
};

// Default Theme presets based on user request (Cyber, Pastel, Luxury)
const THEME_PRESETS = {
    'cyber': {
        name: 'Cyberpunk Neon',
        backgroundColor: '#0c081e',
        backgroundType: 'gradient',
        backgroundGradient: 'linear-gradient(135deg, #0c081e 0%, #170d37 100%)',
        backgroundAnimation: 'stars',
        backgroundImage: '',
        buttonColor: 'rgba(0, 242, 254, 0.1)',
        buttonTextColor: '#00f2fe',
        buttonBorderRadius: '8',
        buttonShadow: '0 0 15px rgba(0, 242, 254, 0.5)',
        fontFamily: 'Outfit',
        customCss: '.bio-btn {\n  border: 1px solid #00f2fe;\n  text-shadow: 0 0 5px #00f2fe;\n}',
        // Premium Fusions.info features
        titleEffect: 'glow',
        verifiedBadge: 'verified',
        cursorEffect: 'sparkle',
        nekoEnabled: false,
        customCursorUrl: '',
        hideWatermark: false,
        globalAudioUrl: '',
        pageOverlay: 'none',
        tiltEffect: 'off'
    },
    'pastel': {
        name: 'Sweet Pastel',
        backgroundColor: '#ffe3e3',
        backgroundType: 'gradient',
        backgroundGradient: 'linear-gradient(135deg, #ffe3e3 0%, #bbf2f6 100%)',
        backgroundAnimation: 'particles',
        backgroundImage: '',
        buttonColor: '#ffffff',
        buttonTextColor: '#ff7675',
        buttonBorderRadius: '20',
        buttonShadow: '0 8px 16px rgba(255, 118, 117, 0.1)',
        fontFamily: 'Prompt',
        customCss: '.bio-btn {\n  border: 1px solid rgba(255, 118, 117, 0.15);\n}',
        titleEffect: 'bounce',
        verifiedBadge: 'crown',
        cursorEffect: 'bubble',
        nekoEnabled: true,
        customCursorUrl: '',
        hideWatermark: true,
        globalAudioUrl: '',
        pageOverlay: 'none',
        tiltEffect: 'off'
    },
    'luxury': {
        name: 'Luxury Gold',
        backgroundColor: '#0d0d0d',
        backgroundType: 'solid',
        backgroundGradient: 'linear-gradient(135deg, #1f1f1f 0%, #0d0d0d 100%)',
        backgroundAnimation: 'none',
        backgroundImage: '',
        buttonColor: '#1a1a1a',
        buttonTextColor: '#d4af37',
        buttonBorderRadius: '4',
        buttonShadow: '0 4px 15px rgba(212, 175, 55, 0.15)',
        fontFamily: 'Sarabun',
        customCss: '.bio-btn {\n  border: 1px solid #d4af37;\n  letter-spacing: 1px;\n}',
        titleEffect: 'glow',
        verifiedBadge: 'crown',
        cursorEffect: 'none',
        nekoEnabled: false,
        customCursorUrl: '',
        hideWatermark: true,
        globalAudioUrl: '',
        pageOverlay: 'none',
        tiltEffect: 'off'
    }
};

const DB = {
    _get(key, defaultValue = []) {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : defaultValue;
    },

    _set(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },

    init() {
        if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
            const defaultUsers = [
                { email: 'demo@example.com', username: 'demo', password: 'password123' }
            ];
            this._set(STORAGE_KEYS.USERS, defaultUsers);

            // Default Blocks layout for demo user
            const defaultProfiles = {
                'demo': {
                    theme: {
                        preset: 'cyber',
                        custom: { ...THEME_PRESETS['cyber'] }
                    },
                    profileInfo: {
                        displayName: 'Super Bio Creator 🪐',
                        bio: 'ยินดีต้อนรับ! ทดสอบระบบบล็อกและกดปุ่มสุ่มดีไซน์ด้านบนเพื่อสุ่มธีมขยับพื้นหลังและเพลงได้ทันที',
                        avatar: '',
                        shape: 'circle',
                        layout: 'floating',
                        decoration: 'none',
                        occupation: '',
                        location: '',
                        tags: [],
                        enterScreenEnabled: false,
                        enterScreenMessage: 'Welcome to my profile'
                    },
                    blocks: [
                        {
                            id: 'block-social',
                            type: 'social',
                            facebook: 'https://facebook.com',
                            instagram: 'https://instagram.com',
                            tiktok: 'https://tiktok.com',
                            youtube: 'https://youtube.com',
                            line: 'https://line.me',
                            github: 'https://github.com'
                        },
                        {
                            id: 'block-music',
                            type: 'music',
                            title: 'Lo-Fi Chill Music (Demo)',
                            url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                            sourceType: 'audio'
                        },
                        {
                            id: 'block-link-1',
                            type: 'link',
                            title: '🌐 ติดตามเว็บไซต์หลักของเรา',
                            url: 'https://github.com/google',
                            icon: 'globe',
                            animation: 'pulse',
                            enabled: true
                        },
                        {
                            id: 'block-youtube-1',
                            type: 'youtube',
                            videoId: 'dQw4w9WgXcQ'
                        },
                        {
                            id: 'block-image-1',
                            type: 'image',
                            layout: 'double',
                            imgUrl1: 'https://picsum.photos/400/300?random=1',
                            linkUrl1: 'https://example.com',
                            imgUrl2: 'https://picsum.photos/400/300?random=2',
                            linkUrl2: 'https://example.com'
                        },
                        {
                            id: 'block-spacer-1',
                            type: 'spacer',
                            height: '15'
                        }
                    ],
                    analytics: {
                        views: this._generateMockViews(),
                        clicks: {
                            'block-link-1': this._generateMockClicks(25),
                            'block-social': this._generateMockClicks(20),
                            'block-music': this._generateMockClicks(15)
                        }
                    }
                }
            };
            this._set(STORAGE_KEYS.PROFILES, defaultProfiles);
        }
    },

    _generateMockViews() {
        const data = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            data.push({
                date: dateStr,
                count: Math.floor(Math.random() * 60) + 30
            });
        }
        return data;
    },

    _generateMockClicks(base) {
        const data = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            data.push({
                date: dateStr,
                count: Math.floor(Math.random() * base)
            });
        }
        return data;
    },

    // USER & AUTH SYSTEM
    // รองรับ slug แบบ donate (อนุญาต - / _ ความยาว 3–32)
    isValidUsername(username) {
        const normalized = String(username || '').toLowerCase().trim();
        if (normalized.length < 3 || normalized.length > 32) return false;
        if (!/^[a-z0-9_-]+$/.test(normalized)) return false;
        if (/^[-_]|[-_]$/.test(normalized)) return false;
        if (/--|__|_-|-_/.test(normalized)) return false;
        return true;
    },

    _defaultProfile(username) {
        return {
            theme: {
                preset: 'cyber',
                custom: { ...THEME_PRESETS['cyber'] }
            },
            profileInfo: {
                displayName: username,
                bio: 'ยินดีต้อนรับสู่หน้าโปรไฟล์ Bio Link ของฉัน!',
                avatar: '',
                shape: 'circle',
                layout: 'floating',
                decoration: 'none',
                occupation: '',
                location: '',
                tags: [],
                enterScreenEnabled: false,
                enterScreenMessage: 'Welcome to my profile'
            },
            blocks: [
                {
                    id: 'block-link-' + Date.now(),
                    type: 'link',
                    title: 'เว็บไซต์ส่วนตัวของฉัน',
                    url: 'https://example.com',
                    icon: 'globe',
                    animation: 'none',
                    enabled: true
                }
            ],
            analytics: {
                views: [],
                clicks: {}
            }
        };
    },

    /**
     * สร้าง user + profile จาก TokControl (slug / ชื่อผู้ใช้) อัตโนมัติ
     * แก้เคส session มีแต่ยังไม่มีโปรไฟล์ → โดนเด้งไป login.html
     */
    ensureTokControlUser(username, opts = {}) {
        const normalized = String(username || 'demo')
            .toLowerCase()
            .trim()
            .replace(/_/g, '-');
        if (!this.isValidUsername(normalized)) {
            // ถ้า slug ยาวเกิน/อักขระพิเศษ — ตัดให้ใช้ได้
            const safe = normalized.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
            if (safe.length < 3) return { success: false, message: 'ชื่อผู้ใช้ไม่ถูกต้อง' };
            return this.ensureTokControlUser(safe, opts);
        }

        const users = this._get(STORAGE_KEYS.USERS);
        const profiles = this._get(STORAGE_KEYS.PROFILES, {});
        const email = String(opts.email || `${normalized}@tokcontrol.local`).toLowerCase();

        if (!users.some((u) => u.username.toLowerCase() === normalized)) {
            users.push({
                email,
                username: normalized,
                password: 'tokcontrol',
                source: 'tokcontrol'
            });
            this._set(STORAGE_KEYS.USERS, users);
        }
        if (!profiles[normalized]) {
            profiles[normalized] = this._defaultProfile(normalized);
            this._set(STORAGE_KEYS.PROFILES, profiles);
        }

        const session = {
            username: normalized,
            email,
            loginTime: Date.now(),
            source: opts.source || 'tokcontrol',
            token: opts.token || null
        };
        this._set(STORAGE_KEYS.SESSION, session);
        return { success: true, session, username: normalized };
    },

    register(email, username, password) {
        const users = this._get(STORAGE_KEYS.USERS);
        const profiles = this._get(STORAGE_KEYS.PROFILES, {});
        const normalizedUser = String(username || '').toLowerCase().trim().replace(/_/g, '-');

        const emailExists = users.some(u => u.email.toLowerCase() === email.toLowerCase().trim());
        const usernameExists = users.some(u => u.username.toLowerCase() === normalizedUser) || profiles[normalizedUser];

        if (emailExists) return { success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' };
        if (usernameExists) return { success: false, message: 'Username นี้ถูกจองไปแล้ว' };
        if (!this.isValidUsername(normalizedUser)) {
            return { success: false, message: 'Username ต้องเป็นภาษาอังกฤษ ตัวเลข หรือขีด (-) ความยาว 3-32 ตัวอักษร' };
        }

        // Save User
        users.push({ email: email.trim(), username: normalizedUser, password });
        this._set(STORAGE_KEYS.USERS, users);

        // Initialize Profile
        profiles[normalizedUser] = this._defaultProfile(username);
        this._set(STORAGE_KEYS.PROFILES, profiles);

        return this.login(email, password);
    },

    login(email, password) {
        const users = this._get(STORAGE_KEYS.USERS);
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password);

        if (!user) {
            return { success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
        }

        const session = { username: user.username, email: user.email, loginTime: Date.now() };
        this._set(STORAGE_KEYS.SESSION, session);
        return { success: true, session };
    },

    checkUsernameAvailable(username) {
        const normalized = String(username || '').toLowerCase().trim().replace(/_/g, '-');
        if (!this.isValidUsername(normalized)) {
            return false;
        }
        const users = this._get(STORAGE_KEYS.USERS);
        const profiles = this._get(STORAGE_KEYS.PROFILES, {});
        return !users.some(u => u.username.toLowerCase() === normalized) && !profiles[normalized];
    },

    getCurrentSession() {
        const session = localStorage.getItem(STORAGE_KEYS.SESSION);
        return session ? JSON.parse(session) : null;
    },

    logout() {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        return true;
    },

    getProfile(username) {
        const profiles = this._get(STORAGE_KEYS.PROFILES, {});
        let profile = profiles[username.toLowerCase().trim()] || null;
        
        // Migration: Ensure profileInfo exists
        if (profile && !profile.profileInfo) {
            let profBlock = profile.blocks.find(b => b.type === 'profile');
            profile.profileInfo = {
                displayName: profBlock ? profBlock.displayName : username,
                bio: profBlock ? profBlock.bio : 'ยินดีต้อนรับสู่หน้าโปรไฟล์ Bio Link ของฉัน!',
                avatar: profBlock ? profBlock.avatar : '',
                shape: 'circle',
                layout: 'floating',
                decoration: 'none',
                occupation: '',
                location: '',
                tags: [],
                enterScreenEnabled: false,
                enterScreenMessage: 'Welcome to my profile'
            };
            // Remove profile block from blocks
            profile.blocks = profile.blocks.filter(b => b.type !== 'profile');
            // Save migration
            this.saveProfile(username, profile);
        }
        
        return profile;
    },

    saveProfile(username, profileData) {
        const profiles = this._get(STORAGE_KEYS.PROFILES, {});
        const normalized = username.toLowerCase().trim();
        if (profiles[normalized]) {
            profiles[normalized] = {
                ...profiles[normalized],
                ...profileData
            };
            this._set(STORAGE_KEYS.PROFILES, profiles);
            return { success: true };
        }
        return { success: false, message: 'ไม่พบชื่อผู้ใช้งานนี้' };
    },

    // AUTO-DECORATOR RANDOM THEME ENGINE WITH PREMIUM EFFECTS
    generateRandomTheme() {
        const bgColors = ['#0f0c20', '#110e2e', '#051923', '#2b0f54', '#4a0e4e', '#ffe3e3', '#e8f5e9', '#e3f2fd', '#fff3e0', '#2d3748', '#1a202c', '#000000'];
        const fonts = ['Inter', 'Outfit', 'Prompt', 'Sarabun'];
        const btnRadius = ['0', '4', '8', '12', '20', '30'];
        const btnShadows = [
            'none',
            '0 4px 6px rgba(0,0,0,0.1)',
            '0 8px 16px rgba(0,0,0,0.15)',
            '0 0 10px rgba(255, 255, 255, 0.3)',
            '0 0 15px var(--glow-color)',
            'inset 0 0 10px rgba(255,255,255,0.1), 0 4px 6px rgba(0,0,0,0.2)'
        ];

        // Random background type
        const randBgVal = Math.random();
        let bgType = 'solid';
        if (randBgVal > 0.35 && randBgVal <= 0.85) bgType = 'gradient';
        else if (randBgVal > 0.85) bgType = 'animated';

        // Choose main colors
        const mainBg = bgColors[Math.floor(Math.random() * bgColors.length)];
        const font = fonts[Math.floor(Math.random() * fonts.length)];
        const radius = btnRadius[Math.floor(Math.random() * btnRadius.length)];
        const shadow = btnShadows[Math.floor(Math.random() * btnShadows.length)];

        // Random Gradients
        const gradients = [
            'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
            'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
            'linear-gradient(135deg, #0f0c1b 0%, #201335 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #2e0854 0%, #ec008c 100%)',
            'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
            'linear-gradient(135deg, #ed4264 0%, #ffedbc 100%)',
            'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)'
        ];
        const selectedGradient = gradients[Math.floor(Math.random() * gradients.length)];

        // Background animations
        const bgAnimations = ['particles', 'stars', 'neon-flow'];
        const selectedAnim = bgAnimations[Math.floor(Math.random() * bgAnimations.length)];

        const isDarkBg = this._isDarkColor(mainBg);
        let btnColor = '#ffffff';
        let btnTextColor = '#000000';

        if (isDarkBg) {
            const neons = ['#00f2fe', '#ff007f', '#39ff14', '#ffff00', '#ffffff', '#ff9f43', '#00d2d3'];
            btnColor = Math.random() > 0.5 ? 'rgba(255,255,255,0.1)' : neons[Math.floor(Math.random() * neons.length)];
            btnTextColor = btnColor.startsWith('rgba') ? '#ffffff' : '#000000';
        } else {
            const darks = ['#1a202c', '#2c3e50', '#2d3436', '#6c5ce7', '#d63031', '#010101'];
            btnColor = darks[Math.floor(Math.random() * darks.length)];
            btnTextColor = '#ffffff';
        }

        const glowColor = isDarkBg ? btnColor : 'rgba(0,0,0,0.1)';
        const formattedShadow = shadow.replace('var(--glow-color)', glowColor);

        // Premium features random selection
        const nameEffects = ['none', 'glow', 'rainbow', 'bounce', 'glitch'];
        const badges = ['none', 'verified', 'crown'];
        const cursors = ['none', 'sparkle', 'bubble'];

        return {
            name: 'Random Design',
            backgroundColor: mainBg,
            backgroundType: bgType,
            backgroundGradient: selectedGradient,
            backgroundAnimation: selectedAnim,
            backgroundImage: '', 
            buttonColor: btnColor,
            buttonTextColor: btnTextColor,
            buttonBorderRadius: radius,
            buttonShadow: formattedShadow,
            fontFamily: font,
            customCss: btnColor.startsWith('rgba') ? '.bio-btn {\n  backdrop-filter: blur(10px);\n  border: 1px solid rgba(255,255,255,0.15);\n}' : '',
            // Premium elements
            titleEffect: nameEffects[Math.floor(Math.random() * nameEffects.length)],
            verifiedBadge: badges[Math.floor(Math.random() * badges.length)],
            cursorEffect: cursors[Math.floor(Math.random() * cursors.length)],
            nekoEnabled: Math.random() > 0.8, // 20% chance
            customCursorUrl: '',
            hideWatermark: Math.random() > 0.5, // 50% chance
            globalAudioUrl: '',
            pageOverlay: ['none', 'rain', 'embers', 'noise'][Math.floor(Math.random() * 4)],
            tiltEffect: Math.random() > 0.5 ? 'on' : 'off'
        };
    },

    _isDarkColor(hex) {
        const c = hex.substring(1);
        if (c.length !== 6) return true;
        const rgb = parseInt(c, 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = (rgb >> 0) & 0xff;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return luma < 128;
    },

    // ANALYTICS LOGS
    logView(username) {
        const profiles = this._get(STORAGE_KEYS.PROFILES, {});
        const normalized = username.toLowerCase().trim();
        if (!profiles[normalized]) return;

        const today = new Date().toISOString().split('T')[0];
        if (!profiles[normalized].analytics) {
            profiles[normalized].analytics = { views: [], clicks: {} };
        }

        const views = profiles[normalized].analytics.views || [];
        const todayView = views.find(v => v.date === today);

        if (todayView) {
            todayView.count++;
        } else {
            views.push({ date: today, count: 1 });
        }

        if (views.length > 30) views.shift();

        profiles[normalized].analytics.views = views;
        this._set(STORAGE_KEYS.PROFILES, profiles);
    },

    logClick(username, blockId) {
        const profiles = this._get(STORAGE_KEYS.PROFILES, {});
        const normalized = username.toLowerCase().trim();
        if (!profiles[normalized]) return;

        const today = new Date().toISOString().split('T')[0];
        if (!profiles[normalized].analytics) {
            profiles[normalized].analytics = { views: [], clicks: {} };
        }
        if (!profiles[normalized].analytics.clicks) {
            profiles[normalized].analytics.clicks = {};
        }

        const clicks = profiles[normalized].analytics.clicks;
        if (!clicks[blockId]) {
            clicks[blockId] = [];
        }

        const todayClick = clicks[blockId].find(c => c.date === today);
        if (todayClick) {
            todayClick.count++;
        } else {
            clicks[blockId].push({ date: today, count: 1 });
        }

        if (clicks[blockId].length > 30) clicks[blockId].shift();

        profiles[normalized].analytics.clicks = clicks;
        this._set(STORAGE_KEYS.PROFILES, profiles);
    },

    getAnalytics(username) {
        const profile = this.getProfile(username);
        if (!profile || !profile.analytics) {
            return { views: [], clicks: {} };
        }
        return profile.analytics;
    },

    getThemePresets() {
        return THEME_PRESETS;
    }
};

DB.init();
window.DB = DB;


const DECORATIONS = [
    {
        "id": "none",
        "name": "None",
        "img": ""
    },
    {
        "id": "1352687418418921532",
        "name": "Hugh the Rainbow",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_0c0eeb351ae2cf48c6e1eee2cae49d40.png?size=240&passthrough=true"
    },
    {
        "id": "1352687448228106302",
        "name": "Phoenix",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_0e839cd79500e7b68e2bbbed54790c28.png?size=240&passthrough=true"
    },
    {
        "id": "1352687476317093888",
        "name": "Firecrackers",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_0f4f1b40921ce680b60007e94427d1f2.png?size=160&passthrough=true"
    },
    {
        "id": "1352687565219692648",
        "name": "Flaming Sword",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_0f5d6c4dd8ae74662ee9c40722a56cbd.png?size=240&passthrough=true"
    },
    {
        "id": "1352687609780113562",
        "name": "RamenBowl",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_001e956faa73bd0410c455234c62818f.png?size=240&passthrough=true"
    },
    {
        "id": "1352687646475817051",
        "name": "Steampunk Cat Ears",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_1acbe609daec21fa5b866df9e5a42cb7.png?size=240&passthrough=true"
    },
    {
        "id": "1352687706303500391",
        "name": "Lucky Envelopes",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_1b1df0ae8c2d34afd85da5c22a0d761a.png?size=240&passthrough=true"
    },
    {
        "id": "1352687727283273788",
        "name": "Magical Potion",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_1dbc603c181999b9815cb426dfec71a6.png?size=240&passthrough=true"
    },
    {
        "id": "1352687750910054440",
        "name": "Akuma",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_1e8cb6070b13f775a41384c84c5a53e1.png?size=240&passthrough=true"
    },
    {
        "id": "1352687779103903754",
        "name": "Next Turn Button",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_2b95e7a4951a1a092e7870bf1d456262.png?size=240&passthrough=true"
    },
    {
        "id": "1352687799467249694",
        "name": "Snowglobe",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_2ca5fb1ecf0dac410b38d76cb4aae7f9.png?size=240&passthrough=true"
    },
    {
        "id": "1352687817125531759",
        "name": "Feelin'Nervous",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_2d792aad5003faf6809e26879a7eae6b.png?size=240&passthrough=true"
    },
    {
        "id": "1352687886021034025",
        "name": "Lotus Flower",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_2e55d644e11acb6253dfa422eff16dfd.png?size=240&passthrough=true"
    },
    {
        "id": "1352687923060936756",
        "name": "Angry",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_3c97a2d37f433a7913a1c7b7a735d000.png?size=240&passthrough=true"
    },
    {
        "id": "1352687950558920748",
        "name": "Owlbear Cub",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_3c5743cedcb72131c58278278a97c143.png?size=240&passthrough=true"
    },
    {
        "id": "1352687975795920928",
        "name": "Straw Hat",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_3d1e6078b2e4c8865e0ad0f429d651b1.png?size=240&passthrough=true"
    },
    {
        "id": "1352688006338842714",
        "name": "Heartbloom",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_3e1fc3c7ee2e34e8176f4737427e8f4f.png?size=240&passthrough=true"
    },
    {
        "id": "1352688027096584397",
        "name": "Candlelight",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_3f29e6edfe1cff43736f644cf1d01278.png?size=240&passthrough=true"
    },
    {
        "id": "1352688047501611089",
        "name": "Treasure and Key",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_4c9f2ec29c05755456dbce45d8190ed4.png?size=240&passthrough=true"
    },
    {
        "id": "1352688136488222821",
        "name": "in Tears",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_4cc97277177b166fd7d4af3bdb370815.png?size=240&passthrough=true"
    },
    {
        "id": "1352688164925341844",
        "name": "Butterflies",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_4cd9ae5a8d103c219eacd3674d7730cd.png?size=240&passthrough=true"
    },
    {
        "id": "1352688185896992921",
        "name": "Zombie Food",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_4f2b75e5adff09709702613ea0e2cb70.png?size=240&passthrough=true"
    },
    {
        "id": "1352688217828233266",
        "name": "Bubble Tea",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_5b1319abfc9f928479b68a73635f591d.png?size=240&passthrough=true"
    },
    {
        "id": "1352688243153571911",
        "name": "Witch Hat (Plum)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_5e8abacc7a7454d6b08b5cc84cac1d80.png?size=240&passthrough=true"
    },
    {
        "id": "1352688272836657297",
        "name": "Shy",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_6b793a5f7e4e15eea6b10a4fde448511.png?size=240&passthrough=true"
    },
    {
        "id": "1352688305011167307",
        "name": "Black Hole",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_6d16b27d9415cafe3b289053644337c4.png?size=240&passthrough=true"
    },
    {
        "id": "1352688338082988064",
        "name": "Mirage",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_6d99f670de3fcee669660fe262e896ea.png?size=240&passthrough=true"
    },
    {
        "id": "1352688400959799449",
        "name": "UFO",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_6fdbddb6229453eac3bbb212edf5cd1c.png?size=240&passthrough=true"
    },
    {
        "id": "1352688431376891965",
        "name": "aespa Fanlight",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_007d64a922ff5773fb9464945de93c8e.png?size=240&passthrough=true"
    },
    {
        "id": "1352688457037910088",
        "name": "Sakura Warrior",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_7cf09c7e78d6eb35ae354acc1d5cc676.png?size=240&passthrough=true"
    },
    {
        "id": "1352688484300882133",
        "name": "Fox Hat",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_7d305bca6cf371df98c059f9d2ef05e4.png?size=240&passthrough=true"
    },
    {
        "id": "1352688511169466368",
        "name": "Lovestruck",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_7f44d538ec830f479605f7bf8720afda.png?size=240&passthrough=true"
    },
    {
        "id": "1352688535949541542",
        "name": "Crossbones",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_7f863078aee4932cd50ee4e3b55d3035.png?size=240&passthrough=true"
    },
    {
        "id": "1352688607072223346",
        "name": "Group Hug",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_8ad98d25ee4e4512704f759476eeb294.png?size=240&passthrough=true"
    },
    {
        "id": "1352688633144147999",
        "name": "Pipedream",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_8c17e799bfeffa797042569a1ebcafc0.png?size=240&passthrough=true"
    },
    {
        "id": "1352688660683952178",
        "name": "Hex Tiles",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_8dddba8c2a9704a943bb7020a3d0a418.png?size=240&passthrough=true"
    },
    {
        "id": "1352688718753824790",
        "name": "Crystal Ball (Blue)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_8ee8ae54bddfcb17d7d5c5f9bce41c0d.png?size=240&passthrough=true"
    },
    {
        "id": "1352688769211568149",
        "name": "In Love",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_8ffa2ba9bff18e96b76c2e66fd0d7fa3.png?size=240&passthrough=true"
    },
    {
        "id": "1352688796176613546",
        "name": "Hex Lights",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_09bb4197c743ea31b7eb052eddd3e892.png?size=240&passthrough=true"
    },
    {
        "id": "1352688824165072956",
        "name": "FRAG OUT",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_09de63526a45be1ddac70e84718ee04a.png?size=240&passthrough=true"
    },
    {
        "id": "1352688892385562714",
        "name": "Solar Orbit",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9a6bf0ab30a6719d6eb09fa4996984ca.png?size=240&passthrough=true"
    },
    {
        "id": "1352688917081624607",
        "name": "The Monster You Created",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9bc421cef4bdcfffeb2344b44ad91b44.png?size=240&passthrough=true"
    },
    {
        "id": "1352688939907027080",
        "name": "Good Ol'Pepper",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9cc1c1426ea5478aac7be6cdefdbc568.png?size=240&passthrough=true"
    },
    {
        "id": "1352689042474664017",
        "name": "Fan Flourish",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9d2ff9685be0c668ef6990b0035fac17.png?size=240&passthrough=true"
    },
    {
        "id": "1352689087655579730",
        "name": "Skull Medallion",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9d67a1cbf81fe7197c871e94f619b04b.png?size=240&passthrough=true"
    },
    {
        "id": "1352689118374793286",
        "name": "Tarrain Tiles",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9d95e36bc282523fddc63d31a8d01091.png?size=240&passthrough=true"
    },
    {
        "id": "1352689152877002843",
        "name": "Feelin'Scrumptious",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9d35467f282b8c72a26f5aa40aa2a637.png?size=240&passthrough=true"
    },
    {
        "id": "1352689219063255172",
        "name": "Red Lantern",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9e16d86b2887eb2a3bed36a5b8876935.png?size=240&passthrough=true"
    },
    {
        "id": "1352689708521623694",
        "name": "Mooncaps (Blue)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_25f7407a6a0c5de43736a1f24c3b7979.png?size=160&passthrough=true"
    },
    {
        "id": "1352689726620045322",
        "name": "Honeyblossom",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_27bbf0b53b1054cf61e9a4c0e8d4027f.png?size=240&passthrough=true"
    },
    {
        "id": "1352689749915209910",
        "name": "String Lights (Dusk)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_28e531da18a80b8287837332154c5f58.png?size=160&passthrough=true"
    },
    {
        "id": "1352689842177179739",
        "name": "Defensive Shield",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_29a0533cb3de61aa8179810188f3830d.png?size=240&passthrough=true"
    },
    {
        "id": "1352690651065614386",
        "name": "Heartstrings (Blue)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_42cc3fe7133523096466102e7a222003.png?size=160&passthrough=true"
    },
    {
        "id": "1352690708863123569",
        "name": "Magical Girl",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_45f7f9975255971b197d34d77fb50ede.png?size=240&passthrough=true"
    },
    {
        "id": "1352690738680565934",
        "name": "Unicorn",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_47c0f4b4a837894998d5a316acf74f87.png?size=240&passthrough=true"
    },
    {
        "id": "1352690760096419902",
        "name": "Chromawave",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_49c479e15533fb4c02eb320c9c137433.png?size=240&passthrough=true"
    },
    {
        "id": "1352690799728529560",
        "name": "Rocket Puncher",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_49ed38f73003e2e182f77190af0a0a56.png?size=240&passthrough=true"
    },
    {
        "id": "1352690823388725409",
        "name": "Slither'n Snack",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_49ffdb1883d8c644a8eb68711ee58be9.png?size=240&passthrough=true"
    },
    {
        "id": "1352690853906350131",
        "name": "Koi Pond",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_50b440810b1bbd89f6284f36d40ad0af.png?size=240&passthrough=true"
    },
    {
        "id": "1352690918247108608",
        "name": "Faces of the Moon",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_50cfb73a4c52235363491855d3c3c3bc.png?size=240&passthrough=true"
    },
    {
        "id": "1352690993832656939",
        "name": "Dismay",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_51d3bb502109eec26c76386ec980bc8b.png?size=240&passthrough=true"
    },
    {
        "id": "1352691036043870249",
        "name": "Sweat Drops",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_55c9d0354290afa8b7fe47ea9bd7dbcf.png?size=240&passthrough=true"
    },
    {
        "id": "1352691059309940816",
        "name": "Lofi Girl Outfit",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_60cb281fac6d8f558efaf6dd9fe4dbe4.png?size=240&passthrough=true"
    },
    {
        "id": "1352691081883684954",
        "name": "Viper Poison Cloud",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_62cd9d7c0031a7c1eb5ad5cc96992189.png?size=240&passthrough=true"
    },
    {
        "id": "1352691113173061683",
        "name": "Heartstrings (Red)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_63a69109db554a66764cbe61c6e556ef.png?size=240&passthrough=true"
    },
    {
        "id": "1352691135067459586",
        "name": "Lunar Lanterns",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_63b29ec5b1ea6bb01c2251049838d822.png?size=240&passthrough=true"
    },
    {
        "id": "1352691229426712658",
        "name": "String Lights (Ember)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_63d17f42ee46a843d99a58655910bc6a.png?size=160&passthrough=true"
    },
    {
        "id": "1352691255334670466",
        "name": "M. Bison",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_66f69effef43b4f7c4f5d0739079a947.png?size=160&passthrough=true"
    },
    {
        "id": "1352691293532323920",
        "name": "Ryu",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_68cb6c21d6222cd9285c08068f39873d.png?size=240&passthrough=true"
    },
    {
        "id": "1352691337694019626",
        "name": "Magic Portal (Purple)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_72d1fd7c47cc7a98c8f64d175773344b.png?size=240&passthrough=true"
    },
    {
        "id": "1352691394426306601",
        "name": "Cozy Cat",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_77b7b6a740a9451e1ef39c0252154ef8.png?size=240&passthrough=true"
    },
    {
        "id": "1352691419080560700",
        "name": "Scallywag",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_78f326d95c0193c317470e3e81db81e7.png?size=240&passthrough=true"
    },
    {
        "id": "1352691512143777956",
        "name": "Balance",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_82e4df4028396ad5ccaaafb397fa6248.png?size=240&passthrough=true"
    },
    {
        "id": "1352691761096425493",
        "name": "FISHBONES!",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_84a67b33ef5b75e17f858a95648c973f.png?size=240&passthrough=true"
    },
    {
        "id": "1352691788103548969",
        "name": "String Lights",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_88f42fb7360d8224a670a50c3496f315.png?size=240&passthrough=true"
    },
    {
        "id": "1352691811377741834",
        "name": "VALORANT Champions 2024",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_90e0dce3cc48c4a9607b6d41209c737e.png?size=240&passthrough=true"
    },
    {
        "id": "1352691833905614918",
        "name": "Cannon Fire",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_91a33236cf2728310a3a29bbdc8e0d29.png?size=240&passthrough=true"
    },
    {
        "id": "1352691863324459141",
        "name": "Playful Lofi Cat",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_96f65d0aacc4a94b50ef7fb656d5826d.png?size=240&passthrough=true"
    },
    {
        "id": "1352691886514770042",
        "name": "Crystal Elk",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_98c7600d304b86ca3b18272e1da05559.png?size=240&passthrough=true"
    },
    {
        "id": "1352691919498645605",
        "name": "Magic Portal (Blue)",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_98cf94e029ac79c5b377413d1a2bd82f.png?size=160&passthrough=true"
    },
    {
        "id": "1352691945964568749",
        "name": "Implant",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_172fa9da0af8698e37f5e5de76637439.png?size=240&passthrough=true"
    },
    {
        "id": "1352691999261851779",
        "name": "Cottage Home",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_210b82b98876083ce393ecd92eb07260.png?size=240&passthrough=true"
    },
    {
        "id": "1352692107332157602",
        "name": "Bloomling",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_306a56249fe3c3d2bc7a30041cb63e0e.png?size=240&passthrough=true"
    },
    {
        "id": "1352692128836223108",
        "name": "Lightning",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_365eed4178528fe8293c4212e8e2d5cb.png?size=240&passthrough=true"
    },
    {
        "id": "1352692175095206049",
        "name": "Mech flora",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_459cf2afde41f01559a4a4204ab81767.png?size=240&passthrough=true"
    },
    {
        "id": "1352692217273389066",
        "name": "Lava Lamp Bundle",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_462b0bddc07dd495765fe12abe8b077f.png?size=240&passthrough=true"
    },
    {
        "id": "1352692240333410386",
        "name": "Mallow Jump",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_492f6b54b761c0a14d9dbc9c98aaa0f5.png?size=240&passthrough=true"
    },
    {
        "id": "1352692264907968694",
        "name": "Dancing fairies",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_535aa3354b1a7395c271bb2f53be4275.png?size=240&passthrough=true"
    },
    {
        "id": "1352692287074861078",
        "name": "Air",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_554b7c34f7b6c709f19535aacb128e7b.png?size=240&passthrough=true"
    },
    {
        "id": "1352692307270570004",
        "name": "Rose Bearer",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_555ad9b90a13534180b9274d013e3651.png?size=240&passthrough=true"
    },
    {
        "id": "1352692335942701156",
        "name": "Power by shimmer",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_609fb5c17a4d5ff2e2bec1a1931a9caa.png?size=240&passthrough=true"
    },
    {
        "id": "1352692355722907833",
        "name": "Head in the clouds",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_670b722e56740d11d1e6fe55b8094013.png?size=240&passthrough=true"
    },
    {
        "id": "1352692381627060275",
        "name": "fall leaves",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_720a2045510ec16f9878237d2ff9873f.png?size=160&passthrough=true"
    },
    {
        "id": "1352692425881157674",
        "name": "Pirate captain",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_798a5bcbb11067e4d9ab339e51d2a16c.png?size=240&passthrough=true"
    },
    {
        "id": "1352692487805730907",
        "name": "Blade storm",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_904b1989077c91fca1168d39bfcaa0a4.png?size=240&passthrough=true"
    },
    {
        "id": "1352692508408156221",
        "name": "Guile",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_993ac691660d3d67b500d995e121b220.png?size=240&passthrough=true"
    },
    {
        "id": "1352693177865338994",
        "name": "sproutling",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_3012fad396abbf24e325431800b51510.png?size=240&passthrough=true"
    },
    {
        "id": "1352693202444091394",
        "name": "Midnight Sorceress",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_4430a4ee89b7fba456e765db21f38485.png?size=240&passthrough=true"
    },
    {
        "id": "1352693244877602906",
        "name": "fall Leaves",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_5087f7f988bd1b2819cac3e33d0150f5.png?size=240&passthrough=true"
    },
    {
        "id": "1352693265073307761",
        "name": "Doodling",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_5873ecaa76fb549654b40095293f902e.png?size=240&passthrough=true"
    },
    {
        "id": "1352693289643409479",
        "name": "Sleepy chilledcow",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_6649e251a23f24935471ee02c212675b.png?size=240&passthrough=true"
    },
    {
        "id": "1352693320580730973",
        "name": "Armamenter",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_6912c651e979fbfdc479ed082a571513.png?size=240&passthrough=true"
    },
    {
        "id": "1352693353027731476",
        "name": "Flame Chompers",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_8396e9830e3e288cd3aaa6daf18b605a.png?size=240&passthrough=true"
    },
    {
        "id": "1352693385877520388",
        "name": "Constellations",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_8552f9857793aed0cf816f370e2df3be.png?size=240&passthrough=true"
    },
    {
        "id": "1352693406949970104",
        "name": "cat onesie",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9661cf3296ac236d8815e3f5b809a467.png?size=240&passthrough=true"
    },
    {
        "id": "1352693430224158802",
        "name": "Strawberry Vine",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_9867b1ba56601e745cfe741e6b00b835.png?size=240&passthrough=true"
    },
    {
        "id": "1352693460288929843",
        "name": "sakura lnk",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_13913a00bd9990ab4102a3bf069f0f3f.png?size=240&passthrough=true"
    },
    {
        "id": "1352693571765141534",
        "name": "spooky cat Ears",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_33656b7ed12cde00c1826b654cf65590.png?size=240&passthrough=true"
    },
    {
        "id": "1352693599590154470",
        "name": "Dark Hood",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_41445f736db3525135b6b9e1122f2254.png?size=240&passthrough=true"
    },
    {
        "id": "1352693617424072735",
        "name": "sushi roll",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_44045ae47175eaca4ed1b4d889b62b27.png?size=240&passthrough=true"
    },
    {
        "id": "1352693640862105601",
        "name": "string Lights",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_47136c333dc989a0f0f9852e878d3844.png?size=160&passthrough=true"
    },
    {
        "id": "1352693685904605215",
        "name": "Gelatinous Cube",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_66604bb5c9351541f30c20a4e78c239c.png?size=240&passthrough=true"
    },
    {
        "id": "1352693708272828508",
        "name": "Feelin' awe",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_89155faed81b205d59fbbefa4316952d.png?size=240&passthrough=true"
    },
    {
        "id": "1352693734965510174",
        "name": "Dice",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_94191be95bb9c471ff17644f3639eb6d.png?size=240&passthrough=true"
    },
    {
        "id": "1352693762416971926",
        "name": "A hint of clove",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_98555e40cc6802bd3a4fed906af1d992.png?size=240&passthrough=true"
    },
    {
        "id": "1352693800526680106",
        "name": "Neon Nibbles",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_126219d37fa9422dab6a075064453750.png?size=240&passthrough=true"
    },
    {
        "id": "1352693820197834762",
        "name": "Water",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_250640ab00a8837a1d56f35879138177.png?size=240&passthrough=true"
    },
    {
        "id": "1352693842612060294",
        "name": "Dragon's smile",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_445566ed965b2c1632a5b45c92f32d11.png?size=240&passthrough=true"
    },
    {
        "id": "1352693884920008816",
        "name": "Joystick",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_795573a62c6d9b583f3029100f90d56b.png?size=240&passthrough=true"
    },
    {
        "id": "1352693911243591731",
        "name": "Spirit Embers",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_1005898c6acf56a9ac5010baf444f6fd.png?size=240&passthrough=true"
    },
    {
        "id": "1352693968386920540",
        "name": "Got xenoglossy",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_35713167cc82e0f408c26dfc032a7f0f.png?size=160&passthrough=true"
    },
    {
        "id": "1352694027215962113",
        "name": "Kabuto",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_084353360ae4f9b5b3b5f186e5525de0.png?size=240&passthrough=true"
    },
    {
        "id": "1352694050289094759",
        "name": "Aurora",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_386445551be850bb16b73a225d0d0602.png?size=240&passthrough=true"
    },
    {
        "id": "1352694063567999048",
        "name": "Dandelion Duo",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_629689577fa1da2ef0061a5a8c930de1.png?size=240&passthrough=true"
    },
    {
        "id": "1352694081611890831",
        "name": "Rage",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a0db4314b8cc271c8f472357aa895005.png?size=240&passthrough=true"
    },
    {
        "id": "1352694121873281086",
        "name": "Fresh pine",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a0fafb7c7ee7f1e5b1442f44f3aa14b7.png?size=240&passthrough=true"
    },
    {
        "id": "1352694149530390549",
        "name": "Ruby hearts",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a1c0581971d4a296908829289fea2c47.png?size=240&passthrough=true"
    },
    {
        "id": "1352694177770639443",
        "name": "city walls",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a4e8e02dbbba6889428c744df7aa5a81.png?size=240&passthrough=true"
    },
    {
        "id": "1352694220980355195",
        "name": "Polar Bear hat",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a7e6467b5332ab7a2b725aa225e6c752.png?size=240&passthrough=true"
    },
    {
        "id": "1352694253116985364",
        "name": "Dusk and Dawn",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a44e9335ea869639fdf812f3642a56a6.png?size=240&passthrough=true"
    },
    {
        "id": "1352694278773543012",
        "name": "Reyna's leer",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a87e3efa4de2956331831681231ce63b.png?size=240&passthrough=true"
    },
    {
        "id": "1352694314739695658",
        "name": "Baby Displacer Beast",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a842a9cf76fdaf91a6354937b31ecdef.png?size=240&passthrough=true"
    },
    {
        "id": "1352694339842871419",
        "name": "oni mask",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a21393f8a2cb8eafbdfb5364fb1cbbae.png?size=240&passthrough=true"
    },
    {
        "id": "1352694362345308230",
        "name": "Fire",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a065206df7b011a5510e4e5bca7d49be.png?size=240&passthrough=true"
    },
    {
        "id": "1352694406507139236",
        "name": "Bowler hat",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_a67833d0f3138d7dcdee98c39eae33d7.png?size=240&passthrough=true"
    },
    {
        "id": "1352694485968224357",
        "name": "The petal pack",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_ab95c78401ce4ec85c25a6d308db9d85.png?size=240&passthrough=true"
    },
    {
        "id": "1352694765300219986",
        "name": "The Anomaly",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_af5ee420e5f860ff2cdbb5fa4633f2cf.png?size=240&passthrough=true"
    },
    {
        "id": "1352694791770476544",
        "name": "cypher Neural Theft",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_b1efe77f379c6c9c6e47e6b6299d5a7d.png?size=240&passthrough=true"
    },
    {
        "id": "1352694867980980306",
        "name": "Devil",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_b4dcf63b6af2e20cba91af61c0e3a8a7.png?size=240&passthrough=true"
    },
    {
        "id": "1352694908854468739",
        "name": "shocked",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_b98e8b204d59882fb7f9f7c86922c0bf.png?size=240&passthrough=true"
    },
    {
        "id": "1352694928404385876",
        "name": "Mooncaps",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_b13180be7866281f6fa588a49dd7feb0.png?size=240&passthrough=true"
    },
    {
        "id": "1352694972104572958",
        "name": "Helmsman",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_b98093bb7723235a4cd2792762795640.png?size=240&passthrough=true"
    },
    {
        "id": "1352695043420459172",
        "name": "cozy Headphones",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_bb71042ccd2ca277a69f086a4f3354d0.png?size=240&passthrough=true"
    },
    {
        "id": "1352696581907943577",
        "name": "Fall Leaves",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_bc63175fe462d8748b68ea5179249418.png?size=160&passthrough=true"
    },
    {
        "id": "1352696607715360902",
        "name": "Kitsune",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_be111e4303d634c55500202a61656e0b.png?size=240&passthrough=true"
    },
    {
        "id": "1352696804558373021",
        "name": "Brass beats",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_bfaeda83edb41e78250eedc71bed31fc.png?size=240&passthrough=true"
    },
    {
        "id": "1352696831217369209",
        "name": "soul Leaving Body",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_c3c09bd122898be35093d0d59850f627.png?size=240&passthrough=true"
    },
    {
        "id": "1352696854491693117",
        "name": "cat Ears",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_c3cffc19e9784f7d0b005eecdf1b566e.png?size=240&passthrough=true"
    },
    {
        "id": "1352696975203762186",
        "name": "ARadiating Energy",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_c7e1751e8122f1b475cb3006966fb28c.png?size=240&passthrough=true"
    },
    {
        "id": "1352697057424707665",
        "name": "Wizard Hat",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_c25b962e5cabb9a656f02c50095d6496.png?size=240&passthrough=true"
    },
    {
        "id": "1352697077485797480",
        "name": "shuriken's mark",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_c32ce5680d4be96e059790ad493aa0fe.png?size=240&passthrough=true"
    },
    {
        "id": "1352697154413662371",
        "name": "omen's cowl",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_c45abe8c7585fdb41b8d8d4d666f1588.png?size=240&passthrough=true"
    },
    {
        "id": "1352697251914317835",
        "name": "Autumn crown",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_c509c4760e5e1a50fa341d68f3c1901b.png?size=240&passthrough=true"
    },
    {
        "id": "1352697387529015310",
        "name": "Digital Sunrise",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_cc83efd93ecd6e41857449c3c0ef9b22.png?size=240&passthrough=true"
    },
    {
        "id": "1352697419321839847",
        "name": "Golden Hex",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_ccee9031d66bc0f2d7ed0c6178d01784.png?size=240&passthrough=true"
    },
    {
        "id": "1352697445313806449",
        "name": "E.D Hacker",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_cdca4a092a03b16b94e50289fe3f7bd1.png?size=160&passthrough=true"
    },
    {
        "id": "1352697497419780278",
        "name": "Malefic Crown",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_d1ea7b8650bf3d64a03304c2ceb7d089.png?size=240&passthrough=true"
    },
    {
        "id": "1352697518995144714",
        "name": "Magical Wand",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_d3a9c3a1c89ccb0e1ab8724a5c965f48.png?size=240&passthrough=true"
    },
    {
        "id": "1352697535453724744",
        "name": "DISXCORE Headset",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_d3da36040163ee0f9176dfe7ced45cdc.png?size=240&passthrough=true"
    },
    {
        "id": "1352697562724827166",
        "name": "Flux Alchemy",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_d8d93c7a53c0dd07a4074b745210434d.png?size=240&passthrough=true"
    },
    {
        "id": "1352697583205613610",
        "name": "Glowing Runes",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_d650e22f6c4bab4fc0969e9d35edbcb0.png?size=240&passthrough=true"
    },
    {
        "id": "1352697616067985539",
        "name": "Snake's Hug",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_d859cee893cffd5dd0fa17a6caea44e0.png?size=240&passthrough=true"
    },
    {
        "id": "1352697629829628077",
        "name": "Starry Eyed",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_d72066b8cecbadd9fc951913ebcc384f.png?size=240&passthrough=true"
    },
    {
        "id": "1352697650029400134",
        "name": "Yoru Bundle",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_da532f804b47f1681006c2996eb07b2a.png?size=240&passthrough=true"
    },
    {
        "id": "1352697675367317564",
        "name": "Wizard's Staff",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_db9baf0ba7cf449d2b027c06309dbe8d.png?size=240&passthrough=true"
    },
    {
        "id": "1352697694774366228",
        "name": "The Hexcore",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_dbb1abd90367c1a31a94f7e162f3a3c3.png?size=240&passthrough=true"
    },
    {
        "id": "1352697712050442331",
        "name": "Juri",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_dcfe10bac4a782ffb5eefef7a8003115.png?size=240&passthrough=true"
    },
    {
        "id": "1352697728097845382",
        "name": "Rumbling",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_df5442048d7d5b8b8906f3a9cd93f0ab.png?size=240&passthrough=true"
    },
    {
        "id": "1352697747807145994",
        "name": "Mix string Light bundle",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_dff769a0f922bb56ab0d4ba2bcbacfae.png?size=160&passthrough=true"
    },
    {
        "id": "1352697764852535377",
        "name": "Sakura scholar",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_e0a2df84cf7eb8e098a13e37ec9027c1.png?size=240&passthrough=true"
    },
    {
        "id": "1352697789502587005",
        "name": "Rainy Mood",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_e8c11f139e55dac538cdaafb3caa2317.png?size=240&passthrough=true"
    },
    {
        "id": "1352697809866063984",
        "name": "Aim For Love",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_e60cc4d7f4d8a6e79dd8cc67d2b13d6c.png?size=240&passthrough=true"
    },
    {
        "id": "1352697831517065247",
        "name": "Clyde invaders",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_e72e44eeea89e92dc02c9bec8b02d158.png?size=240&passthrough=true"
    },
    {
        "id": "1352697856972292126",
        "name": "Glitch",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_e90ebc0114e7bdc30353c8b11953ea41.png?size=240&passthrough=true"
    },
    {
        "id": "1352697872679829636",
        "name": "UwU XP",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_e257ca83b5b164968fd036f69dbb2ad9.png?size=240&passthrough=true"
    },
    {
        "id": "1352697894125441114",
        "name": "Cozy POST-IT",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_e671277ab6d18c0de00871347eed94a7.png?size=240&passthrough=true"
    },
    {
        "id": "1352697946075959401",
        "name": "Eldritch Ring",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_ef6fe8b27123eacccebe51c92a61587c.png?size=240&passthrough=true"
    },
    {
        "id": "1352697965634130036",
        "name": "Aracanist Bundle",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_ef8d97374ffdbf140df1164be6c69e46.png?size=240&passthrough=true"
    },
    {
        "id": "1352697985758265397",
        "name": "Starlight Whales",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_efe3081ee3359a77b515575b5f7bc8c0.png?size=240&passthrough=true"
    },
    {
        "id": "1352698006889168916",
        "name": "Timekeeper's Clock",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f1c60c026aa89971e360ba88643d92c0.png?size=240&passthrough=true"
    },
    {
        "id": "1352698022596710462",
        "name": "Ki Energy",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f3af281c65cf0cf590e9e1f59e9c6cf6.png?size=240&passthrough=true"
    },
    {
        "id": "1352698039193567346",
        "name": "Port of Soul",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f4fcdab859b2eab1874fbe7182d5aa26.png?size=240&passthrough=true"
    },
    {
        "id": "1352698064510386300",
        "name": "Azure Dice Roll Bundle",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f8ffeba6f389d1475c8794ca88b59785.png?size=160&passthrough=true"
    },
    {
        "id": "1352698086086021162",
        "name": "Feelin' Panic",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f11c214394044d001d81c983dcab354f.png?size=240&passthrough=true"
    },
    {
        "id": "1352699002910408835",
        "name": "A sphere of gusting wind swirls around the avatar.",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f081c6b2c85c5ebe5df42f1c24d45bb5.png?size=240&passthrough=true"
    },
    {
        "id": "1352699027686297663",
        "name": "Bunny Zzzs",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f438bb9b2f25ac55058fc169ecc8096e.png?size=240&passthrough=true"
    },
    {
        "id": "1352699041737080902",
        "name": "Ken",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f524554b7f42a214d15c226c344a5357.png?size=240&passthrough=true"
    },
    {
        "id": "1352699058581540967",
        "name": "Oasis",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_f740031cc97d1b7eb73c0d0ac1dd09f3.png?size=240&passthrough=true"
    },
    {
        "id": "1352699090789601291",
        "name": "Cat Ear Headset",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_fa39ba4d9eff38d2eeb47ebcb623e4ca.png?size=240&passthrough=true"
    },
    {
        "id": "1352699125149208626",
        "name": "Earht",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_fa014594d4b2b4249e1098c0adc85b47.png?size=240&passthrough=true"
    },
    {
        "id": "1352699175698960556",
        "name": "Gold Laurel Wreath",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_fcb0de14da228879b455f1f1d3919749.png?size=240&passthrough=true"
    },
    {
        "id": "1352699197501214732",
        "name": "Fairy & Pixie Bundle",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_fe3c76cac2adf426832a7e495e8329d3.png?size=160&passthrough=true"
    },
    {
        "id": "1352699217994321951",
        "name": "Death's Edge",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_fe63036018fefb8abe3172383497e3bf.png?size=240&passthrough=true"
    },
    {
        "id": "1352699238735413403",
        "name": "Autumn's Arbor",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_fead934c894e95e070d8a0301f9f0b27.png?size=240&passthrough=true"
    },
    {
        "id": "1352699261078474864",
        "name": "Futuristic UI",
        "img": "https://cdn.discordapp.com/avatar-decoration-presets/a_fed43ab12698df65902ba06727e20c0e.png?size=240&passthrough=true"
    },
    {
        "id": "Libya",
        "name": "Unnamed",
        "img": "https://i.ibb.co/VJ7q2FV/ezgif-7-a2ecd1b7f9.png"
    },
    {
        "id": "Algeria",
        "name": "Unnamed",
        "img": "https://i.ibb.co/C7Zdqnp/ezgif-1-148d3d8ea9.png"
    },
    {
        "id": "Bahrain",
        "name": "Unnamed",
        "img": "https://i.ibb.co/Dr5gMvn/ezgif-1-bf03b81f9d.png"
    },
    {
        "id": "Comoros",
        "name": "Unnamed",
        "img": "https://i.ibb.co/9nqKx3b/ezgif-1-f0b73c7a9f.png"
    },
    {
        "id": "Tunisia",
        "name": "Unnamed",
        "img": "https://i.ibb.co/Ksqq6d7/ezgif-7-727033509f.png"
    },
    {
        "id": "UAE",
        "name": "Unnamed",
        "img": "https://i.ibb.co/mSRswm8/ezgif-7-637d28d3db.png"
    },
    {
        "id": "Somalia",
        "name": "Unnamed",
        "img": "https://i.ibb.co/Sn84j7t/ezgif-7-0f127c7b46.png"
    },
    {
        "id": "Sudan",
        "name": "Unnamed",
        "img": "https://i.ibb.co/TLTD2Jk/ezgif-7-b07f2e63fe.png"
    },
    {
        "id": "Syria",
        "name": "Unnamed",
        "img": "https://i.ibb.co/dQvcZQp/ezgif-7-369d86d58c.png"
    },
    {
        "id": "Yemen",
        "name": "Unnamed",
        "img": "https://i.ibb.co/kDF5G5v/ezgif-7-ea2030a439.png"
    },
    {
        "id": "Overlay",
        "name": "Unnamed",
        "img": "https://i.ibb.co/hZD0mmM/ezgif-7-699c07f6f4.png"
    },
    {
        "id": "Palestine",
        "name": "Unnamed",
        "img": "https://i.ibb.co/w6b12fc/ezgif-7-5217c6ff98.png"
    },
    {
        "id": "Qatar",
        "name": "Unnamed",
        "img": "https://i.ibb.co/xs2Lktj/ezgif-7-44263314da.png"
    },
    {
        "id": "Saudi",
        "name": "Unnamed",
        "img": "https://i.ibb.co/rGYFpWw/ezgif-7-8da0a9f5eb.png"
    },
    {
        "id": "Jordan",
        "name": "Unnamed",
        "img": "https://i.ibb.co/hyBBCB7/ezgif-7-df80ea6e6e.png"
    },
    {
        "id": "Kuwait",
        "name": "Unnamed",
        "img": "https://i.ibb.co/y58DkH5/ezgif-7-af7e8c28ab.png"
    },
    {
        "id": "Lebanon",
        "name": "Unnamed",
        "img": "https://i.ibb.co/LPYNzGG/ezgif-7-d9dc5b4cc6.png"
    },
    {
        "id": "Mauritania",
        "name": "Unnamed",
        "img": "https://i.ibb.co/8mZKC19/ezgif-7-f78d395b85.png"
    },
    {
        "id": "Morocco",
        "name": "Unnamed",
        "img": "https://i.ibb.co/kSdbdCn/ezgif-7-f3b2fab832.png"
    },
    {
        "id": "Djibouti",
        "name": "Unnamed",
        "img": "https://i.ibb.co/cQFNw8G/ezgif-1-92158fd061.png"
    },
    {
        "id": "Egypt",
        "name": "Unnamed",
        "img": "https://i.ibb.co/hs9GjBp/ezgif-7-f21e193074.png"
    },
    {
        "id": "iraq",
        "name": "Unnamed",
        "img": "https://i.ibb.co/Q6CLZyM/ezgif-7-126237475a.png"
    }
];