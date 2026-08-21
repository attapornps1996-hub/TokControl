/**
 * Game overlay runtime + gallery settings (Guess / Team / Campaign)
 */
(function (global) {
    'use strict';

    const LS_GUESS = 'tokcontrol_guess_number';
    const LS_TEAM = 'tokcontrol_team_vs_team';
    const LS_CAMPAIGN = 'tokcontrol_gift_campaign';

    const DEFAULT_GUESS = {
        enabled: false,
        title: 'GUESS THE NUMBER',
        subtitle: 'SEND THE RIGHT AMOUNT TO WIN',
        difficulty: 'EASY',
        theme: 'royal',
        layout: 'royal',
        targetNumber: 42,
        revealTarget: false,
        showHintNumber: true,
        hintNumber: null,
        guessMode: 'coins',
        guessCount: 0,
        winGift: { giftId: '', giftName: 'Rose', giftIcon: '', diamondCount: 1 },
        winner: null,
        statusText: 'Waiting for guesses...'
    };

    const DEFAULT_TEAM = {
        enabled: false,
        layout: 'arena',
        team1Name: 'Team Red',
        team2Name: 'Team Blue',
        team1Score: 0,
        team2Score: 0,
        team1Recent: [],
        team2Recent: [],
        giftMap: {},
        timerDuration: 300,
        timerEndsAt: null,
        timerRunning: false
    };

    const DEFAULT_CAMPAIGN = {
        enabled: false,
        theme: 'golden',
        layout: 'golden',
        eventName: 'Community Fest',
        campaignTitle: 'Can You Take On the Challenge?',
        rank: 21,
        points: 0,
        pointsToNext: 9600,
        mascotUrl: '',
        goals: [
            "Let's STREAM 1 Hour!",
            "LET'S GET 50 MATCHES!",
            'GET ACTIVE COMMENTS FROM 50 VIEWERS!'
        ],
        gifts: []
    };

    let guessStore = loadJson(LS_GUESS, DEFAULT_GUESS);
    let teamStore = loadJson(LS_TEAM, DEFAULT_TEAM);
    let campaignStore = loadJson(LS_CAMPAIGN, DEFAULT_CAMPAIGN);
    let teamTimerIv = null;

    function loadJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return JSON.parse(JSON.stringify(fallback));
            return { ...JSON.parse(JSON.stringify(fallback)), ...JSON.parse(raw) };
        } catch (e) {
            return JSON.parse(JSON.stringify(fallback));
        }
    }

    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function gameOverlayKind(item) {
        if (!item) return '';
        if (item.previewKind === 'guess' || item.routeKey === 'guessnumber') return 'guess';
        if (item.previewKind === 'team' || item.routeKey === 'teamvsteam') return 'team';
        if (item.previewKind === 'campaign' || item.routeKey === 'giftcampaign') return 'campaign';
        return '';
    }

    function isGameOverlayItem(item) {
        return !!gameOverlayKind(item);
    }

    function defaultSettingsForItem(item) {
        const kind = gameOverlayKind(item);
        if (kind === 'guess') {
            return {
                ...DEFAULT_GUESS,
                ...guessStore,
                layout: item.gnLayout || item.guessTheme || guessStore.layout || 'royal',
                theme: item.guessTheme || item.gnLayout || guessStore.theme || 'royal'
            };
        }
        if (kind === 'team') {
            return { ...DEFAULT_TEAM, ...teamStore, layout: item.tvtLayout || teamStore.layout || 'arena' };
        }
        if (kind === 'campaign') {
            return {
                ...DEFAULT_CAMPAIGN,
                ...campaignStore,
                layout: item.gcLayout || item.campaignTheme || campaignStore.layout || 'golden',
                theme: item.campaignTheme || item.gcLayout || campaignStore.theme || 'golden'
            };
        }
        return {};
    }

    function getTeamTimerLeft() {
        if (!teamStore.timerRunning || !teamStore.timerEndsAt) return null;
        return Math.max(0, Math.ceil((teamStore.timerEndsAt - Date.now()) / 1000));
    }

    function syncGameOverlays() {
        if (!global.socket?.connected || !global.currentUser?.streamToken) return;
        global.socket.emit('send_game_overlay_status', {
            token: global.currentUser.streamToken,
            guess: {
                ...guessStore,
                hintNumber: guessStore.showHintNumber ? (guessStore.hintNumber ?? guessStore.guessCount) : guessStore.guessCount
            },
            team: { ...teamStore, timerLeft: getTeamTimerLeft() },
            campaign: { ...campaignStore }
        });
    }

    function persistGuess() { localStorage.setItem(LS_GUESS, JSON.stringify(guessStore)); syncGameOverlays(); }
    function persistTeam() { localStorage.setItem(LS_TEAM, JSON.stringify(teamStore)); syncGameOverlays(); }
    function persistCampaign() { localStorage.setItem(LS_CAMPAIGN, JSON.stringify(campaignStore)); syncGameOverlays(); }

    function applySettingsToRuntime(kind, settings, item) {
        if (!settings || !kind) return;
        if (kind === 'guess') {
            guessStore = { ...guessStore, ...settings };
            if (item?.gnLayout) guessStore.layout = item.gnLayout;
            if (item?.guessTheme) guessStore.theme = item.guessTheme;
            persistGuess();
        } else if (kind === 'team') {
            teamStore = { ...teamStore, ...settings };
            if (item?.tvtLayout) teamStore.layout = item.tvtLayout;
            persistTeam();
        } else if (kind === 'campaign') {
            campaignStore = { ...campaignStore, ...settings };
            if (item?.gcLayout) campaignStore.layout = item.gcLayout;
            if (item?.campaignTheme) campaignStore.theme = item.campaignTheme;
            persistCampaign();
        }
    }

    function enrichGift(g) {
        if (global.GiftAnim?.enrichGiftFromEvent) return GiftAnim.enrichGiftFromEvent(g);
        return g;
    }

    function handleGuessFromGift(gift) {
        if (!guessStore.enabled || guessStore.winner) return;
        const g = enrichGift(gift);
        const gid = String(g.giftId || '');
        const winId = String(guessStore.winGift?.giftId || '');
        if (winId && gid !== winId) return;
        let guessVal = null;
        if (guessStore.guessMode === 'coins') guessVal = (g.diamondCount || 0) * (g.repeatCount || 1);
        else if (guessStore.guessMode === 'repeat') guessVal = g.repeatCount || 1;
        if (guessVal == null) return;
        guessStore.guessCount = (guessStore.guessCount || 0) + 1;
        if (guessStore.showHintNumber) guessStore.hintNumber = guessVal;
        if (guessVal === guessStore.targetNumber) {
            guessStore.winner = { uniqueId: g.uniqueId, nickname: g.nickname, avatar: g.avatar };
            guessStore.statusText = `🏆 ${g.nickname || g.uniqueId} ทายถูก!`;
            if (typeof global.showCustomMsg === 'function') {
                global.showCustomMsg('success', 'ทายเลขถูก!', `@${g.uniqueId} ทาย ${guessVal} ถูกต้อง`);
            }
        } else {
            guessStore.statusText = `ล่าสุด: ${g.nickname || g.uniqueId} → ${guessVal}`;
        }
        persistGuess();
    }

    function handleGuessFromComment(userId, comment, nickname) {
        if (!guessStore.enabled || guessStore.winner || guessStore.guessMode !== 'chat') return;
        const m = String(comment || '').trim().match(/\d+/);
        if (!m) return;
        const val = parseInt(m[0], 10);
        guessStore.guessCount = (guessStore.guessCount || 0) + 1;
        if (guessStore.showHintNumber) guessStore.hintNumber = val;
        if (val === guessStore.targetNumber) {
            guessStore.winner = { uniqueId: userId, nickname: nickname || userId };
            guessStore.statusText = `🏆 ${nickname || userId} ทายถูก!`;
        } else {
            guessStore.statusText = `ล่าสุด: ${nickname || userId} → ${val}`;
        }
        persistGuess();
    }

    function resolveTeamForGift(gift) {
        const gid = String(gift.giftId || '');
        const gname = (gift.giftName || '').toLowerCase();
        if (teamStore.giftMap[gid]) return teamStore.giftMap[gid];
        if (teamStore.giftMap[gname]) return teamStore.giftMap[gname];
        return teamStore.defaultTeam || 'team1';
    }

    function pushTeamRecent(team, user) {
        const key = team === 'team2' ? 'team2Recent' : 'team1Recent';
        const list = teamStore[key] || [];
        list.unshift({ avatar: user.avatar, uniqueId: user.uniqueId, nickname: user.nickname });
        teamStore[key] = list.slice(0, 8);
    }

    function handleTeamFromGift(gift) {
        if (!teamStore.enabled) return;
        const g = enrichGift(gift);
        const team = resolveTeamForGift(g);
        const pts = (g.diamondCount || 1) * (g.repeatCount || 1);
        if (team === 'team2') teamStore.team2Score = (teamStore.team2Score || 0) + pts;
        else teamStore.team1Score = (teamStore.team1Score || 0) + pts;
        pushTeamRecent(team, g);
        persistTeam();
    }

    function handleCampaignFromGift(gift) {
        if (!campaignStore.enabled) return;
        const g = enrichGift(gift);
        const gid = String(g.giftId || '');
        const entry = (campaignStore.gifts || []).find(x => String(x.giftId) === gid);
        if (!entry) return;
        const pts = (entry.points || entry.diamondCount || g.diamondCount || 1) * (g.repeatCount || 1);
        campaignStore.points = (campaignStore.points || 0) + pts;
        persistCampaign();
    }

    function handleGameOverlaysFromGift(gift) {
        handleGuessFromGift(gift);
        handleTeamFromGift(gift);
        handleCampaignFromGift(gift);
    }

    function handleGameOverlaysFromComment(userId, comment, nickname) {
        handleGuessFromComment(userId, comment, nickname);
    }

    function resetGuessGame() {
        guessStore.winner = null;
        guessStore.guessCount = 0;
        guessStore.hintNumber = null;
        guessStore.statusText = 'Waiting for guesses...';
        persistGuess();
    }

    function randomizeGuessTarget() {
        const min = parseInt(document.getElementById('ovGoGuessMin')?.value, 10) || 1;
        const max = parseInt(document.getElementById('ovGoGuessMax')?.value, 10) || 999;
        guessStore.targetNumber = Math.floor(Math.random() * (max - min + 1)) + min;
        resetGuessGame();
        const el = document.getElementById('ovGoGuessTarget');
        if (el) el.value = guessStore.targetNumber;
    }

    function resetTeamScores() {
        teamStore.team1Score = 0;
        teamStore.team2Score = 0;
        teamStore.team1Recent = [];
        teamStore.team2Recent = [];
        persistTeam();
    }

    function startTeamTimer() {
        const dur = parseInt(document.getElementById('ovGoTeamTimerDur')?.value, 10) || teamStore.timerDuration || 300;
        teamStore.timerDuration = dur;
        teamStore.timerEndsAt = Date.now() + dur * 1000;
        teamStore.timerRunning = true;
        if (teamTimerIv) clearInterval(teamTimerIv);
        teamTimerIv = setInterval(() => {
            if (!teamStore.timerRunning) return;
            if (getTeamTimerLeft() <= 0) {
                teamStore.timerRunning = false;
                clearInterval(teamTimerIv);
                teamTimerIv = null;
            }
            syncGameOverlays();
        }, 1000);
        persistTeam();
    }

    function stopTeamTimer() {
        teamStore.timerRunning = false;
        teamStore.timerEndsAt = null;
        if (teamTimerIv) clearInterval(teamTimerIv);
        teamTimerIv = null;
        persistTeam();
    }

    function assignGiftTeam(giftId, team) {
        teamStore.giftMap = teamStore.giftMap || {};
        teamStore.giftMap[String(giftId)] = team;
        persistTeam();
    }

    function buildCampaignGiftsHtml(gifts) {
        return (gifts || []).map((g, i) => `
            <div class="go-gift-pick-item selected" data-go-campaign-idx="${i}">
                ${global.GiftAnim ? GiftAnim.giftAnimHtml({ ...g, size: 'sm', motion: 'float' }) : `<img src="${esc(g.giftIcon)}" style="width:36px;height:36px">`}
                <div style="flex:1">
                    <div style="font-weight:800;font-size:0.8rem">${esc(g.giftName)}</div>
                    <input type="number" class="field-ui" style="width:80px;margin-top:4px;padding:4px 8px" value="${g.points || 1}" data-go-campaign-pts="${i}" oninput="onOverlaySettingsChange()">
                </div>
                <button type="button" class="go-btn" onclick="GameOverlayCtrl.removeCampaignGift(${i})">✕</button>
            </div>`).join('') || '<div style="color:#6e7681;font-size:0.8rem">ยังไม่มีของขวัญในแคมเปญ</div>';
    }

    function buildSettingsFormHtml(item, settings) {
        const kind = gameOverlayKind(item);
        const s = settings || defaultSettingsForItem(item);
        if (kind === 'guess') {
            const wg = s.winGift || {};
            return `
                <label class="ov-settings-check">
                    <input type="checkbox" id="ovGoGuessEnabled" ${s.enabled ? 'checked' : ''} onchange="onOverlaySettingsChange()">
                    <span>เปิดใช้งานเกมทายเลข</span>
                </label>
                <div class="ov-settings-field"><label>หัวข้อ</label>
                    <input type="text" id="ovGoGuessTitle" class="field-ui" value="${esc(s.title || '')}" oninput="onOverlaySettingsChange()"></div>
                <div class="ov-settings-field"><label>คำอธิบาย</label>
                    <input type="text" id="ovGoGuessSubtitle" class="field-ui" value="${esc(s.subtitle || '')}" oninput="onOverlaySettingsChange()"></div>
                <div class="ov-settings-field"><label>เลขเป้าหมาย (ลับ)</label>
                    <input type="number" id="ovGoGuessTarget" class="field-ui" min="1" max="99999" value="${s.targetNumber || 42}" oninput="onOverlaySettingsChange()"></div>
                <div class="ov-settings-field ov-settings-inline">
                    <button type="button" class="ov-rank-preview-btn" onclick="GameOverlayCtrl.randomizeGuessTarget()">🎲 สุ่มเลข</button>
                    <button type="button" class="ov-rank-preview-btn" onclick="GameOverlayCtrl.resetGuessGame()">รีเซ็ตเกม</button>
                </div>
                <div class="ov-settings-field ov-settings-inline">
                    <input type="number" id="ovGoGuessMin" class="field-ui" value="1" min="1" style="width:90px" placeholder="Min">
                    <span>—</span>
                    <input type="number" id="ovGoGuessMax" class="field-ui" value="999" min="1" style="width:90px" placeholder="Max">
                </div>
                <div class="ov-settings-field"><label>วิธีทาย</label>
                    <select id="ovGoGuessMode" class="field-ui" onchange="onOverlaySettingsChange()">
                        <option value="coins" ${s.guessMode === 'coins' ? 'selected' : ''}>🪙 ยอดเหรียญของขวัญ</option>
                        <option value="repeat" ${s.guessMode === 'repeat' ? 'selected' : ''}>🔢 จำนวนชิ้น</option>
                        <option value="chat" ${s.guessMode === 'chat' ? 'selected' : ''}>💬 พิมพ์เลขในแชท</option>
                    </select></div>
                <div class="ov-settings-field"><label>ของขวัญที่ใช้ทาย (คลิกเลือก)</label>
                    <div class="go-gift-pick-list" id="ovGoGuessGiftList"></div></div>
                <input type="hidden" id="ovGoWinGiftId" value="${esc(wg.giftId || '')}">
                <input type="hidden" id="ovGoWinGiftName" value="${esc(wg.giftName || '')}">
                <input type="hidden" id="ovGoWinGiftIcon" value="${esc(wg.giftIcon || '')}">
                <input type="hidden" id="ovGoWinGiftCoins" value="${wg.diamondCount || 1}">
                <p class="ov-rank-preview-hint">เลย์เอาต์กำหนดจาก preset นี้ — คัดลอกลิงก์ไปใส่ OBS</p>`;
        }
        if (kind === 'team') {
            return `
                <label class="ov-settings-check">
                    <input type="checkbox" id="ovGoTeamEnabled" ${s.enabled ? 'checked' : ''} onchange="onOverlaySettingsChange()">
                    <span>เปิดใช้งานแข่งทีม</span>
                </label>
                <div class="ov-settings-field"><label>ชื่อทีม 1</label>
                    <input type="text" id="ovGoTeam1Name" class="field-ui" value="${esc(s.team1Name || 'Team Red')}" oninput="onOverlaySettingsChange()"></div>
                <div class="ov-settings-field"><label>ชื่อทีม 2</label>
                    <input type="text" id="ovGoTeam2Name" class="field-ui" value="${esc(s.team2Name || 'Team Blue')}" oninput="onOverlaySettingsChange()"></div>
                <div class="ov-settings-field"><label>เวลา (วินาที)</label>
                    <input type="number" id="ovGoTeamTimerDur" class="field-ui" value="${s.timerDuration || 300}" oninput="onOverlaySettingsChange()"></div>
                <div class="ov-settings-field ov-settings-inline">
                    <button type="button" class="ov-rank-preview-btn" onclick="GameOverlayCtrl.startTeamTimer()">▶ Start</button>
                    <button type="button" class="ov-rank-preview-btn" onclick="GameOverlayCtrl.stopTeamTimer()">⏹ Stop</button>
                    <button type="button" class="ov-rank-preview-btn" onclick="GameOverlayCtrl.resetTeamScores()">รีเซ็ตคะแนน</button>
                </div>
                <div class="ov-settings-field"><label>มอบหมายของขวัญ → ทีม</label>
                    <div class="go-gift-pick-list" id="ovGoTeamGiftList"></div>
                    <p class="ov-rank-preview-hint">คลิกของขวัญแล้วเลือกทีม — คะแนน = เหรียญ × จำนวน</p></div>`;
        }
        if (kind === 'campaign') {
            return `
                <label class="ov-settings-check">
                    <input type="checkbox" id="ovGoCampaignEnabled" ${s.enabled ? 'checked' : ''} onchange="onOverlaySettingsChange()">
                    <span>เปิดใช้งานแคมเปญ</span>
                </label>
                <div class="ov-settings-field"><label>ชื่อกิจกรรม</label>
                    <input type="text" id="ovGoCampaignEvent" class="field-ui" value="${esc(s.eventName || '')}" oninput="onOverlaySettingsChange()"></div>
                <div class="ov-settings-field"><label>หัวข้อแบนเนอร์</label>
                    <input type="text" id="ovGoCampaignTitle" class="field-ui" value="${esc(s.campaignTitle || '')}" oninput="onOverlaySettingsChange()"></div>
                <div class="ov-settings-field"><label>เป้าหมาย (บรรทัดละ 1 ข้อ)</label>
                    <textarea id="ovGoCampaignGoals" class="field-ui" rows="4" oninput="onOverlaySettingsChange()">${esc((s.goals || []).join('\n'))}</textarea></div>
                <div class="ov-settings-field ov-settings-inline">
                    <input type="number" id="ovGoCampaignRank" class="field-ui" placeholder="#" value="${s.rank != null ? s.rank : ''}" style="width:90px" oninput="onOverlaySettingsChange()">
                    <input type="number" id="ovGoCampaignPoints" class="field-ui" placeholder="pts" value="${s.points != null ? s.points : ''}" oninput="onOverlaySettingsChange()">
                    <input type="number" id="ovGoCampaignNext" class="field-ui" placeholder="to next" value="${s.pointsToNext != null ? s.pointsToNext : ''}" oninput="onOverlaySettingsChange()">
                </div>
                <div class="ov-settings-field"><label>ของขวัญแคมเปญ + คะแนน</label>
                    <div class="go-gift-pick-list" id="ovGoCampaignGiftPicker" style="max-height:120px"></div>
                    <div class="go-gift-pick-list" id="ovGoCampaignGiftList" style="margin-top:8px">${buildCampaignGiftsHtml(s.gifts)}</div></div>`;
        }
        return '';
    }

    async function renderGiftPickerList(containerId, onPick, selectedId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const pickId = `go-gift-pick-btn-${containerId}`;
        el.innerHTML = `<button type="button" class="admin-btn admin-btn-accent admin-btn-sm" id="${pickId}">🎁 เลือกจากคลังของขวัญ</button>`;
        const btn = document.getElementById(pickId);
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (global.GiftPicker) {
                GiftPicker.open({
                    title: '🎁 เลือกของขวัญ',
                    selectedId,
                    onSelect: (gift) => {
                        if (onPick) onPick({
                            giftId: gift.giftId,
                            giftName: gift.giftName,
                            giftIcon: gift.icon,
                            icon: gift.icon,
                            diamondCount: gift.cost,
                            cost: gift.cost
                        });
                    }
                });
                return;
            }
            renderGiftPickerListLegacy(containerId, onPick, selectedId);
        });
    }

    async function renderGiftPickerListLegacy(containerId, onPick, selectedId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        let catalog = [];
        if (global.GiftIconHelper?.loadGiftCatalog) catalog = await GiftIconHelper.loadGiftCatalog();
        else if (typeof global.loadGiftCatalog === 'function') catalog = await global.loadGiftCatalog();
        const items = catalog.slice().sort((a, b) => (a.diamondCount || a.cost || 0) - (b.diamondCount || b.cost || 0));
        el.innerHTML = items.slice(0, 120).map(g => {
            const icon = g.giftIcon || g.icon || '';
            const coins = g.diamondCount || g.cost || 0;
            return `<div class="go-gift-pick-item ${String(g.giftId) === String(selectedId) ? 'selected' : ''}" data-id="${g.giftId}">
                <img src="${icon}" alt="" onerror="this.style.opacity=0.3">
                <div><div style="font-weight:800;font-size:0.8rem">${esc(g.giftName)}</div><div style="font-size:0.68rem;color:#8b949e">${coins} 🪙</div></div>
            </div>`;
        }).join('') || '<div style="color:#6e7681;font-size:0.8rem">โหลดแคตตาล็อกของขวัญ...</div>';
        el.querySelectorAll('.go-gift-pick-item').forEach(node => {
            node.addEventListener('click', () => {
                const id = node.dataset.id;
                const g = catalog.find(x => String(x.giftId) === id);
                if (g && onPick) onPick(g);
                el.querySelectorAll('.go-gift-pick-item').forEach(n => n.classList.toggle('selected', n.dataset.id === id));
            });
        });
    }

    function collectCampaignGiftsFromForm() {
        const gifts = [];
        document.querySelectorAll('#ovGoCampaignGiftList [data-go-campaign-idx]').forEach(row => {
            const idx = row.getAttribute('data-go-campaign-idx');
            const ptsEl = document.querySelector(`[data-go-campaign-pts="${idx}"]`);
            const existing = (campaignStore.gifts || [])[parseInt(idx, 10)];
            if (!existing) return;
            gifts.push({ ...existing, points: parseInt(ptsEl?.value, 10) || 1 });
        });
        return gifts;
    }

    function collectSettingsFromForm(item) {
        const kind = gameOverlayKind(item);
        const saved = defaultSettingsForItem(item);
        if (kind === 'guess') {
            return {
                ...saved,
                enabled: document.getElementById('ovGoGuessEnabled')?.checked === true,
                title: (document.getElementById('ovGoGuessTitle')?.value || '').trim() || DEFAULT_GUESS.title,
                subtitle: (document.getElementById('ovGoGuessSubtitle')?.value || '').trim() || DEFAULT_GUESS.subtitle,
                targetNumber: parseInt(document.getElementById('ovGoGuessTarget')?.value, 10) || 42,
                guessMode: document.getElementById('ovGoGuessMode')?.value || 'coins',
                winGift: {
                    giftId: document.getElementById('ovGoWinGiftId')?.value || '',
                    giftName: document.getElementById('ovGoWinGiftName')?.value || 'Rose',
                    giftIcon: document.getElementById('ovGoWinGiftIcon')?.value || '',
                    diamondCount: parseInt(document.getElementById('ovGoWinGiftCoins')?.value, 10) || 1
                },
                layout: item.gnLayout || saved.layout,
                theme: item.guessTheme || saved.theme,
                guessCount: guessStore.guessCount,
                winner: guessStore.winner,
                statusText: guessStore.statusText,
                hintNumber: guessStore.hintNumber
            };
        }
        if (kind === 'team') {
            return {
                ...saved,
                enabled: document.getElementById('ovGoTeamEnabled')?.checked === true,
                team1Name: (document.getElementById('ovGoTeam1Name')?.value || 'Team Red').trim(),
                team2Name: (document.getElementById('ovGoTeam2Name')?.value || 'Team Blue').trim(),
                timerDuration: parseInt(document.getElementById('ovGoTeamTimerDur')?.value, 10) || 300,
                layout: item.tvtLayout || saved.layout,
                team1Score: teamStore.team1Score,
                team2Score: teamStore.team2Score,
                team1Recent: teamStore.team1Recent,
                team2Recent: teamStore.team2Recent,
                giftMap: teamStore.giftMap || {},
                timerEndsAt: teamStore.timerEndsAt,
                timerRunning: teamStore.timerRunning
            };
        }
        if (kind === 'campaign') {
            const goalsRaw = document.getElementById('ovGoCampaignGoals')?.value || '';
            return {
                ...saved,
                enabled: document.getElementById('ovGoCampaignEnabled')?.checked === true,
                eventName: (document.getElementById('ovGoCampaignEvent')?.value || '').trim(),
                campaignTitle: (document.getElementById('ovGoCampaignTitle')?.value || '').trim(),
                goals: goalsRaw.split('\n').map(x => x.trim()).filter(Boolean),
                rank: parseInt(document.getElementById('ovGoCampaignRank')?.value, 10) || 0,
                points: parseInt(document.getElementById('ovGoCampaignPoints')?.value, 10) || 0,
                pointsToNext: parseInt(document.getElementById('ovGoCampaignNext')?.value, 10) || 0,
                gifts: collectCampaignGiftsFromForm().length ? collectCampaignGiftsFromForm() : (campaignStore.gifts || []),
                layout: item.gcLayout || saved.layout,
                theme: item.campaignTheme || saved.theme
            };
        }
        return saved;
    }

    async function afterSettingsFormRendered(item, settings) {
        const kind = gameOverlayKind(item);
        const s = settings || defaultSettingsForItem(item);
        if (kind === 'guess') {
            await renderGiftPickerList('ovGoGuessGiftList', g => {
                document.getElementById('ovGoWinGiftId').value = g.giftId || '';
                document.getElementById('ovGoWinGiftName').value = g.giftName || '';
                document.getElementById('ovGoWinGiftIcon').value = g.giftIcon || g.icon || '';
                document.getElementById('ovGoWinGiftCoins').value = g.diamondCount || g.cost || 1;
                onOverlaySettingsChange();
            }, s.winGift?.giftId);
        } else if (kind === 'team') {
            await renderGiftPickerList('ovGoTeamGiftList', g => {
                const team = global.prompt('มอบให้ทีม: พิมพ์ 1 = Team 1, 2 = Team 2', '1');
                if (team === '1' || team === '2') assignGiftTeam(g.giftId, team === '2' ? 'team2' : 'team1');
            });
        } else if (kind === 'campaign') {
            await renderGiftPickerList('ovGoCampaignGiftPicker', g => {
                const gifts = campaignStore.gifts || [];
                const gid = String(g.giftId || '');
                if (gifts.some(x => String(x.giftId) === gid)) return;
                gifts.push({
                    giftId: gid,
                    giftName: g.giftName || '',
                    giftIcon: g.giftIcon || g.icon || '',
                    diamondCount: g.diamondCount || g.cost || 0,
                    points: g.diamondCount || g.cost || 1
                });
                campaignStore.gifts = gifts;
                const list = document.getElementById('ovGoCampaignGiftList');
                if (list) list.innerHTML = buildCampaignGiftsHtml(gifts);
                onOverlaySettingsChange();
            });
        }
    }

    function removeCampaignGift(idx) {
        campaignStore.gifts = (campaignStore.gifts || []).filter((_, i) => i !== idx);
        const list = document.getElementById('ovGoCampaignGiftList');
        if (list) list.innerHTML = buildCampaignGiftsHtml(campaignStore.gifts);
        if (typeof global.onOverlaySettingsChange === 'function') global.onOverlaySettingsChange();
    }

    function onSettingsSaved(item, settings) {
        applySettingsToRuntime(gameOverlayKind(item), settings, item);
    }

    global.GameOverlayCtrl = {
        isGameOverlayItem,
        gameOverlayKind,
        defaultSettingsForItem,
        buildSettingsFormHtml,
        collectSettingsFromForm,
        afterSettingsFormRendered,
        onSettingsSaved,
        syncGameOverlays,
        handleGameOverlaysFromGift,
        handleGameOverlaysFromComment,
        resetGuessGame,
        randomizeGuessTarget,
        resetTeamScores,
        startTeamTimer,
        stopTeamTimer,
        removeCampaignGift
    };

    global.handleGameOverlaysFromGift = handleGameOverlaysFromGift;
    global.handleGameOverlaysFromComment = handleGameOverlaysFromComment;
    global.syncGameOverlays = syncGameOverlays;
})(typeof window !== 'undefined' ? window : global);
