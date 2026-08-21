/**
 * Game Overlay layout catalog — 10 presets per category (30 total)
 */
(function (global) {
    'use strict';

    const GUESS_LAYOUT_DEFS = [
        { id: 'royal', title: 'Royal Gold', desc: 'ทองคำหรูหรา ลำแสงกลางจอ + เป้าหมาย ???', icon: '👑', theme: 'royal', accent: '#f1c40f', group: 'คลาสสิก' },
        { id: 'neon', title: 'Neon Cyber', desc: 'ไซเบอร์นีออน เรืองแสงฟ้า-ม่วง', icon: '💠', theme: 'neon', accent: '#00e5ff', group: 'คลาสสิก' },
        { id: 'emerald', title: 'Emerald Forest', desc: 'เขียวมรกต สดใส อ่านง่าย', icon: '🌿', theme: 'emerald', accent: '#2ecc71', group: 'คลาสสิก' },
        { id: 'arcade', title: 'Arcade LCD', desc: 'ตู้เกมย้อนยุค ตัวเลขดิจิทัลกระพริบ', icon: '👾', theme: 'arcade', accent: '#33ff33', group: 'เลย์เอาต์ใหม่' },
        { id: 'crystal', title: 'Crystal Glass', desc: 'แก้วใส blur เรืองแสงอ่อนๆ', icon: '🧊', theme: 'crystal', accent: '#a8d8ff', group: 'เลย์เอาต์ใหม่' },
        { id: 'vault', title: 'Vault Mystery', desc: 'ตู้เซฟลับ โทนมืดทอง', icon: '🔐', theme: 'vault', accent: '#d4a853', group: 'เลย์เอาต์ใหม่' },
        { id: 'slot', title: 'Slot Machine', desc: 'สล็อตหมุนเลข สไตล์คาสิโน', icon: '🎰', theme: 'slot', accent: '#ff6b6b', group: 'เลย์เอาต์ใหม่' },
        { id: 'aurora', title: 'Aora Flow', desc: 'ไล่สีออโรร่า ลื่นไหล', icon: '🌌', theme: 'aurora', accent: '#bc13fe', group: 'เลย์เอาต์ใหม่' },
        { id: 'comic', title: 'Comic Pop', desc: 'ป๊อปอาร์ต ขอบหนา สีสด', icon: '💥', theme: 'comic', accent: '#ff4757', group: 'เลย์เอาต์ใหม่' },
        { id: 'minimal', title: 'Minimal Clean', desc: 'มินิมอล บาง สะอาด อ่านชัด', icon: '⬜', theme: 'minimal', accent: '#ffffff', group: 'เลย์เอาต์ใหม่' }
    ];

    const TEAM_LAYOUT_DEFS = [
        { id: 'arena', title: 'Classic Arena', desc: 'การ์ดสองทีม VS กลางจอ', icon: '⚔️', accent: '#ff4757', group: 'คลาสสิก' },
        { id: 'bar', title: 'Score Bar', desc: 'แถบคะแนนแนวนอน LIVE กลาง', icon: '📊', accent: '#00d2ff', group: 'คลาสสิก' },
        { id: 'tug', title: 'Tug of War', desc: 'เชือกชักใย แถบดึงสองฝ่าย', icon: '🪢', accent: '#f1c40f', group: 'เลย์เอาต์ใหม่' },
        { id: 'podium', title: 'Podium Battle', desc: 'แท่นโพเดียมสองฝั่ง สูงต่ำตามคะแนน', icon: '🥇', accent: '#ffcc00', group: 'เลย์เอาต์ใหม่' },
        { id: 'hex', title: 'Hex Shield', desc: 'โล่หกเหลี่ยมนีออน สองทีม', icon: '⬡', accent: '#bc13fe', group: 'เลย์เอาต์ใหม่' },
        { id: 'neon', title: 'Neon Split', desc: 'จอแยกนีออน ซ้ายแดง ขวาฟ้า', icon: '💜', accent: '#ff2e97', group: 'เลย์เอาต์ใหม่' },
        { id: 'crown', title: 'Crown Clash', desc: 'มงกุฎลอย ทีมนำมีเอฟเฟกต์', icon: '👑', accent: '#f1c40f', group: 'เลย์เอาต์ใหม่' },
        { id: 'stripes', title: 'Diagonal Stripes', desc: 'ลายทแยงสีทีม ดุดัน', icon: '〰️', accent: '#ff6348', group: 'เลย์เอาต์ใหม่' },
        { id: 'ring', title: 'Ring Gauge', desc: 'วงแหวนความคืบหน้าสองทีม', icon: '⭕', accent: '#2ecc71', group: 'เลย์เอาต์ใหม่' },
        { id: 'stadium', title: 'Stadium Board', desc: 'ป้ายสนามกีฬา สกอร์บอร์ดใหญ่', icon: '🏟️', accent: '#e67e22', group: 'เลย์เอาต์ใหม่' }
    ];

    const CAMPAIGN_LAYOUT_DEFS = [
        { id: 'golden', title: 'Golden Banner', desc: 'แบนเนอร์ทอง 3 คอลัมน์ แบบ Community Fest', icon: '🏆', theme: 'golden', accent: '#f1c40f', group: 'คลาสสิก' },
        { id: 'midnight', title: 'Midnight Blue', desc: 'น้ำเงินเมทัลลิก เงาเย็น', icon: '🌙', theme: 'midnight', accent: '#3b82f6', group: 'คลาสสิก' },
        { id: 'fest', title: 'Community Fest', desc: 'ของขวัญเรียงแถว คะแนนชัด', icon: '🎪', theme: 'fest', accent: '#ff2e97', group: 'เลย์เอาต์ใหม่' },
        { id: 'ribbon', title: 'Ribbon Top', desc: 'ริบบิ้นกิจกรรมด้านบน', icon: '🎀', theme: 'ribbon', accent: '#ff4757', group: 'เลย์เอาต์ใหม่' },
        { id: 'ticker', title: 'Marquee Ticker', desc: 'เป้าหมายเลื่อนวน marquee', icon: '📡', theme: 'ticker', accent: '#00d2ff', group: 'เลย์เอาต์ใหม่' },
        { id: 'vertical', title: 'Vertical Card', desc: 'การ์ดแนวตั้ง 9:16 สมดุล', icon: '📱', theme: 'vertical', accent: '#bc13fe', group: 'เลย์เอาต์ใหม่' },
        { id: 'prism', title: 'Prismatic', desc: 'ไล่สีรุ้ง prism ลื่นไหล', icon: '🌈', theme: 'prism', accent: '#a855f7', group: 'เลย์เอาต์ใหม่' },
        { id: 'trophy', title: 'Trophy Focus', desc: 'ถ้วยรางวัลใหญ่กลาง อันดับเด่น', icon: '🥇', theme: 'trophy', accent: '#fbbf24', group: 'เลย์เอาต์ใหม่' },
        { id: 'grid', title: 'Gift Grid', desc: 'ตารางของขวัญแคมเปญเต็มจอ', icon: '▦', theme: 'grid', accent: '#ff2d55', group: 'เลย์เอาต์ใหม่' },
        { id: 'neon', title: 'Neon Pulse', desc: 'นีออนเต้น pulse เรืองแสง', icon: '💜', theme: 'neon', accent: '#00ffc8', group: 'เลย์เอาต์ใหม่' }
    ];

    function buildGuessItems() {
        return GUESS_LAYOUT_DEFS.map((layout) => ({
            id: `gn-${layout.id}`,
            title: layout.title,
            desc: layout.desc,
            icon: layout.icon,
            routeKey: 'guessnumber',
            gnLayout: layout.id,
            guessTheme: layout.theme,
            gameTab: 'guess',
            accent: layout.accent,
            ready: true,
            badge: layout.id === 'royal' ? 'free' : 'new',
            group: layout.group,
            previewKind: 'guess'
        }));
    }

    function buildTeamItems() {
        return TEAM_LAYOUT_DEFS.map((layout) => ({
            id: `tvt-${layout.id}`,
            title: layout.title,
            desc: layout.desc,
            icon: layout.icon,
            routeKey: 'teamvsteam',
            tvtLayout: layout.id,
            gameTab: 'team',
            accent: layout.accent,
            ready: true,
            badge: layout.id === 'arena' ? 'free' : 'new',
            group: layout.group,
            previewKind: 'team'
        }));
    }

    function buildCampaignItems() {
        return CAMPAIGN_LAYOUT_DEFS.map((layout) => ({
            id: `gc-${layout.id}`,
            title: layout.title,
            desc: layout.desc,
            icon: layout.icon,
            routeKey: 'giftcampaign',
            gcLayout: layout.id,
            campaignTheme: layout.theme,
            gameTab: 'campaign',
            accent: layout.accent,
            ready: true,
            badge: layout.id === 'golden' ? 'free' : 'new',
            group: layout.group,
            previewKind: 'campaign'
        }));
    }

    global.GameOverlayLayouts = {
        GUESS_LAYOUT_DEFS,
        TEAM_LAYOUT_DEFS,
        CAMPAIGN_LAYOUT_DEFS,
        buildGuessItems,
        buildTeamItems,
        buildCampaignItems
    };
})(typeof window !== 'undefined' ? window : global);
