/**
 * จับผิดภาพ (Spot the Difference) — TokControl built-in game
 * emoji grid (easy/normal/hard) + custom photo levels with click marks
 */
(function (global) {
    'use strict';

    const MODES = {
        easy:   { cols: 4, rows: 4, diffs: 3, time: 90,  label: 'ง่าย (3 จุด)' },
        normal: { cols: 5, rows: 5, diffs: 5, time: 60,  label: 'ปกติ (5 จุด)' },
        hard:   { cols: 6, rows: 5, diffs: 8, time: 45,  label: 'ยาก (8 จุด)' },
        custom: { cols: 1, rows: 1, diffs: 0, time: 60,  label: 'ด่านภาพ' }
    };

    const ICONS = ['🍎','🍌','🍇','🍊','🍉','🍓','🥝','🍑','🍒','🥭','🍍','🥥','🌸','🌺','🌻','🌼','🐱','🐶','🦊','🐸','🐼','🐨','🦁','🐯','🐻','⚽','🏀','🎾','🎱','🎮','🎯','🎲','🚀','🌟','💎','🔥','❄️','🌈','🎵','🎸'];

    let levels = [];

    let state = {
        mode: 'normal',
        cols: 5,
        rows: 5,
        left: [],
        right: [],
        diffIndices: [],
        found: [],
        phase: 'idle',
        timeLeft: 60,
        totalTime: 60,
        rounds: 0,
        wins: 0,
        score: 0,
        lives: 5,
        maxLives: 5,
        hintLeft: 3,
        zoomLeft: 3,
        timeBoostLeft: 2,
        hintIndex: null,
        revealed: false,
        photo: false,
        leftUrl: '',
        rightUrl: '',
        marks: [],
        levelId: '',
        levelName: '',
        levelIndex: 0
    };

    let timerHandle = null;
    let onStateChange = null;
    let onWin = null;
    let onLose = null;
    let onActionToast = null;

    function emit() {
        if (typeof onStateChange === 'function') onStateChange(getPublicState());
    }

    function getPublicState() {
        return {
            mode: state.mode,
            cols: state.cols,
            rows: state.rows,
            left: state.left.slice(),
            right: state.right.slice(),
            diffIndices: state.diffIndices.slice(),
            found: state.found.slice(),
            phase: state.phase,
            timeLeft: state.timeLeft,
            totalTime: state.totalTime,
            rounds: state.rounds,
            wins: state.wins,
            score: state.score || 0,
            lives: state.lives ?? 5,
            maxLives: state.maxLives ?? 5,
            hintLeft: state.hintLeft ?? 3,
            zoomLeft: state.zoomLeft ?? 3,
            timeBoostLeft: state.timeBoostLeft ?? 2,
            hintIndex: state.hintIndex,
            revealed: !!state.revealed,
            totalDiffs: state.photo ? state.marks.length : state.diffIndices.length,
            foundCount: state.found.length,
            photo: !!state.photo,
            leftUrl: state.leftUrl,
            rightUrl: state.rightUrl,
            marks: state.marks.map((m) => ({ x: m.x, y: m.y, r: m.r })),
            levelId: state.levelId,
            levelName: state.levelName,
            levelIndex: state.levelIndex
        };
    }

    function clearTimer() {
        if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
    }

    function startTimer() {
        clearTimer();
        timerHandle = setInterval(() => {
            if (state.phase !== 'playing') return;
            state.timeLeft--;
            emit();
            if (state.timeLeft <= 0) triggerLose();
        }, 1000);
    }

    function playableLevels() {
        return (levels || []).filter((lv) => lv && lv.leftUrl && lv.rightUrl && Array.isArray(lv.marks) && lv.marks.length);
    }

    function setLevels(list) {
        levels = Array.isArray(list) ? list.slice() : [];
    }

    function loadLevelsFromStorage() {
        let list = [];
        try {
            const raw = localStorage.getItem('sd_game_levels');
            if (raw) list = JSON.parse(raw);
        } catch (e) {}
        if (!list.length) {
            try {
                const cfg = JSON.parse(localStorage.getItem('tokcontrol_spot_diff') || '{}');
                if (Array.isArray(cfg.levels)) list = cfg.levels;
            } catch (e) {}
        }
        setLevels(list);
        if (global.SpotDiffStore && typeof global.SpotDiffStore.hydrateLevels === 'function') {
            return global.SpotDiffStore.hydrateLevels(list).then((hydrated) => {
                setLevels(hydrated);
                return hydrated;
            }).catch(() => list);
        }
        return Promise.resolve(list);
    }

    function pickIcons(count) {
        const pool = [...ICONS].sort(() => Math.random() - 0.5);
        const out = [];
        for (let i = 0; i < count; i++) out.push(pool[i % pool.length]);
        return out;
    }

    function pickAltIcon(used) {
        const pool = ICONS.filter(i => !used.has(i));
        return pool[Math.floor(Math.random() * pool.length)] || ICONS[Math.floor(Math.random() * ICONS.length)];
    }

    function normalizeMarks(list, fallbackR) {
        const r0 = Math.max(0.02, Number(fallbackR) || 0.05);
        return (list || []).map((m) => ({
            x: Math.max(0, Math.min(1, Number(m.x))),
            y: Math.max(0, Math.min(1, Number(m.y))),
            r: Math.max(0.02, Number(m.r) || r0)
        })).filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));
    }

    function buildPhotoRound(level, index) {
        const marks = normalizeMarks(level.marks, level.radius);
        state.mode = 'custom';
        state.photo = true;
        state.cols = 1;
        state.rows = 1;
        state.left = [];
        state.right = [];
        state.leftUrl = level.leftUrl;
        state.rightUrl = level.rightUrl || level.leftUrl;
        state.marks = marks;
        state.diffIndices = marks.map((_, i) => i);
        state.found = [];
        state.phase = 'playing';
        state.timeLeft = Math.max(15, Number(level.time) || 60);
        state.totalTime = state.timeLeft;
        state.hintIndex = null;
        state.revealed = false;
        state.levelId = level.id || '';
        state.levelName = level.name || ('ด่าน ' + (index + 1));
        state.levelIndex = index;
        state.rounds++;
        state.lives = state.maxLives || 5;
        state.hintLeft = 3;
        state.zoomLeft = 3;
        state.timeBoostLeft = 2;
        startTimer();
        emit();
    }

    function buildRound(modeKey) {
        if (modeKey === 'custom') {
            const startCustom = () => {
                const ready = playableLevels();
                if (!ready.length) {
                    toast('ยังไม่มีด่านภาพ — ใช้โหมดปกติชั่วคราว', 'wrong');
                    return buildRound('normal');
                }
                let idx = Math.floor(Math.random() * ready.length);
                if (ready.length > 1 && state.levelId) {
                    const last = ready.findIndex((lv) => lv.id === state.levelId);
                    if (last >= 0 && idx === last) idx = (idx + 1) % ready.length;
                }
                return buildPhotoRound(ready[idx], idx);
            };
            const pending = loadLevelsFromStorage();
            if (pending && typeof pending.then === 'function') {
                return pending.then(startCustom);
            }
            return startCustom();
        }

        const mode = MODES[modeKey] || MODES.normal;
        const total = mode.cols * mode.rows;
        const left = pickIcons(total);
        const right = left.slice();
        const indices = [];
        const used = new Set(left);
        const slots = [...Array(total).keys()].sort(() => Math.random() - 0.5);
        for (let i = 0; i < mode.diffs && i < slots.length; i++) {
            const idx = slots[i];
            indices.push(idx);
            right[idx] = pickAltIcon(used);
            used.add(right[idx]);
        }

        state.mode = modeKey;
        state.photo = false;
        state.leftUrl = '';
        state.rightUrl = '';
        state.marks = [];
        state.levelId = '';
        state.levelName = '';
        state.cols = mode.cols;
        state.rows = mode.rows;
        state.left = left;
        state.right = right;
        state.diffIndices = indices.sort((a, b) => a - b);
        state.found = [];
        state.phase = 'playing';
        state.timeLeft = mode.time;
        state.totalTime = mode.time;
        state.hintIndex = null;
        state.revealed = false;
        state.rounds++;
        state.lives = state.maxLives || 5;
        state.hintLeft = 3;
        state.zoomLeft = 3;
        state.timeBoostLeft = 2;
        startTimer();
        emit();
    }

    function triggerWin() {
        clearTimer();
        state.phase = 'won';
        state.wins++;
        state.score = (state.score || 0) + 250 + Math.max(0, state.timeLeft) * 5;
        emit();
        if (typeof onWin === 'function') onWin(state.wins);
    }

    function triggerLose() {
        clearTimer();
        state.phase = 'lost';
        state.revealed = true;
        emit();
        if (typeof onLose === 'function') onLose();
    }

    function toast(msg, type) {
        if (typeof onActionToast === 'function') onActionToast(msg, type);
    }

    function loseLife() {
        state.lives = Math.max(0, (state.lives ?? 5) - 1);
        if (state.lives <= 0) triggerLose();
    }

    function clickCell(index) {
        if (state.photo) return false;
        if (state.phase !== 'playing') return false;
        if (state.found.includes(index)) return false;
        if (!state.diffIndices.includes(index)) {
            loseLife();
            toast('❌ จุดนี้ไม่ใช่ความต่าง!', 'wrong');
            emit();
            return false;
        }
        state.found.push(index);
        state.found.sort((a, b) => a - b);
        state.score = (state.score || 0) + 100;
        const last = state.found.length >= state.diffIndices.length;
        if (!last) toast('✅ ถูกต้อง!', 'ok');
        emit();
        if (last) triggerWin();
        return true;
    }

    function replayRound() {
        if (state.mode === 'custom') {
            const ready = playableLevels();
            if (!ready.length) return buildRound('normal');
            let idx = ready.findIndex((lv) => lv.id === state.levelId);
            if (idx < 0) idx = Math.max(0, Number(state.levelIndex) || 0);
            idx = Math.min(idx, ready.length - 1);
            return buildPhotoRound(ready[idx], idx);
        }
        return buildRound(state.mode || 'normal');
    }

    function nextRound() {
        if (state.mode === 'custom') {
            const ready = playableLevels();
            if (!ready.length) return buildRound('normal');
            let idx = ready.findIndex((lv) => lv.id === state.levelId);
            if (idx < 0) idx = Math.max(0, Number(state.levelIndex) || 0);
            idx = (idx + 1) % ready.length;
            return buildPhotoRound(ready[idx], idx);
        }
        return buildRound(state.mode || 'normal');
    }

    function clickPhoto(nx, ny, stageW, stageH) {
        if (!state.photo || state.phase !== 'playing') return { ok: false };
        const w = Number(stageW) || 1;
        const h = Number(stageH) || 1;
        let hit = -1;
        let best = Infinity;
        state.marks.forEach((m, i) => {
            if (state.found.includes(i)) return;
            const dx = (nx - m.x) * w;
            const dy = (ny - m.y) * h;
            const dist = Math.hypot(dx, dy);
        const rad = (m.r || 0.05) * Math.min(w, h) * 1.08;
            if (dist <= rad && dist < best) {
                best = dist;
                hit = i;
            }
        });
        if (hit < 0) {
            loseLife();
            toast('❌ จุดนี้ไม่ใช่ความต่าง!', 'wrong');
            emit();
            return { ok: false, x: nx, y: ny };
        }
        state.found.push(hit);
        state.found.sort((a, b) => a - b);
        state.score = (state.score || 0) + 100;
        const last = state.found.length >= state.marks.length;
        if (!last) toast('✅ ถูกต้อง!', 'ok');
        emit();
        if (last) triggerWin();
        const m = state.marks[hit];
        return { ok: true, x: m.x, y: m.y, index: hit, last };
    }

    function useHint() {
        if (state.phase !== 'playing') return false;
        if ((state.hintLeft ?? 0) <= 0) {
            toast('ใบ้หมดแล้ว', 'wrong');
            return false;
        }
        state.hintLeft -= 1;
        actionHint('ผู้เล่น');
        return true;
    }

    function useTimeBoost() {
        if (state.phase !== 'playing') return false;
        if ((state.timeBoostLeft ?? 0) <= 0) {
            toast('เพิ่มเวลาหมดแล้ว', 'wrong');
            return false;
        }
        state.timeBoostLeft -= 1;
        actionAddTime('ผู้เล่น', 15);
        return true;
    }

    function useZoomToken() {
        if ((state.zoomLeft ?? 0) <= 0) return false;
        state.zoomLeft -= 1;
        emit();
        return true;
    }

    function actionHint(user) {
        if (state.phase !== 'playing') return;
        const remaining = (state.photo ? state.marks.map((_, i) => i) : state.diffIndices)
            .filter(i => !state.found.includes(i));
        if (!remaining.length) return;
        const idx = remaining[Math.floor(Math.random() * remaining.length)];
        state.hintIndex = idx;
        toast(`💡 @${user || 'ผู้ชม'} ให้คำใบ้!`, 'hint');
        emit();
        setTimeout(() => {
            if (state.hintIndex === idx) {
                state.hintIndex = null;
                emit();
            }
        }, 3500);
    }

    function actionReveal(user) {
        if (state.phase !== 'playing') return;
        state.revealed = true;
        state.found = state.photo
            ? state.marks.map((_, i) => i)
            : state.diffIndices.slice();
        toast(`🎯 @${user || 'ผู้ชม'} เฉลยทั้งหมด!`, 'reveal');
        emit();
        setTimeout(() => triggerWin(), 800);
    }

    function actionAddTime(user, sec) {
        if (state.phase !== 'playing') return;
        const n = Math.max(5, sec || 15);
        state.timeLeft += n;
        toast(`⏱️ @${user || 'ผู้ชม'} +${n} วินาที`, 'help');
        emit();
    }

    function actionReduceTime(user, sec) {
        if (state.phase !== 'playing') return;
        const n = Math.max(5, sec || 10);
        state.timeLeft = Math.max(0, state.timeLeft - n);
        toast(`😈 @${user || 'ผู้ชม'} -${n} วินาที`, 'troll');
        emit();
        if (state.timeLeft <= 0) triggerLose();
    }

    function actionNewRound(user) {
        toast(`🔄 @${user || 'ผู้ชม'} เปลี่ยนภาพใหม่!`, 'help');
        if (state.mode === 'custom') state.levelIndex = (state.levelIndex || 0);
        buildRound(state.mode);
    }

    function actionAddDiff(user) {
        if (state.photo) {
            toast('ด่านภาพไม่สามารถสุ่มเพิ่มจุดได้', 'troll');
            return;
        }
        if (state.phase !== 'playing') return;
        const total = state.cols * state.rows;
        const candidates = [...Array(total).keys()].filter(i =>
            !state.diffIndices.includes(i) && state.left[i] === state.right[i]
        );
        if (!candidates.length) return;
        const idx = candidates[Math.floor(Math.random() * candidates.length)];
        const used = new Set([...state.left, ...state.right]);
        state.right[idx] = pickAltIcon(used);
        state.diffIndices.push(idx);
        state.diffIndices.sort((a, b) => a - b);
        toast(`😈 @${user || 'ผู้ชม'} เพิ่มจุดผิด +1`, 'troll');
        emit();
    }

    function applyAction(action, user, amount) {
        switch (action) {
            case 'hint':        return actionHint(user);
            case 'reveal':      return actionReveal(user);
            case 'add_time':    return actionAddTime(user, amount);
            case 'reduce_time': return actionReduceTime(user, amount);
            case 'new_round':   return actionNewRound(user);
            case 'add_diff':    return actionAddDiff(user);
            default: return false;
        }
    }

    function loadState(saved) {
        if (!saved) return;
        clearTimer();
        Object.assign(state, {
            mode: saved.mode || 'normal',
            cols: saved.cols || 5,
            rows: saved.rows || 5,
            left: (saved.left || []).slice(),
            right: (saved.right || []).slice(),
            diffIndices: (saved.diffIndices || []).slice(),
            found: (saved.found || []).slice(),
            phase: saved.phase || 'idle',
            timeLeft: saved.timeLeft ?? 60,
            totalTime: saved.totalTime ?? 60,
            rounds: saved.rounds || 0,
            wins: saved.wins || 0,
            score: saved.score || 0,
            lives: saved.lives ?? 5,
            maxLives: saved.maxLives ?? 5,
            hintLeft: saved.hintLeft ?? 3,
            zoomLeft: saved.zoomLeft ?? 3,
            timeBoostLeft: saved.timeBoostLeft ?? 2,
            hintIndex: saved.hintIndex ?? null,
            revealed: !!saved.revealed,
            photo: !!saved.photo,
            leftUrl: saved.leftUrl || '',
            rightUrl: saved.rightUrl || '',
            marks: normalizeMarks(saved.marks, 0.05),
            levelId: saved.levelId || '',
            levelName: saved.levelName || '',
            levelIndex: saved.levelIndex || 0
        });
        if (state.phase === 'playing') startTimer();
        emit();
    }

    function reset() {
        clearTimer();
        state.phase = 'idle';
        state.hintIndex = null;
        state.revealed = false;
        emit();
    }

    global.SpotDiff = {
        MODES,
        getState: getPublicState,
        buildRound,
        clickCell,
        clickPhoto,
        useHint,
        useTimeBoost,
        useZoomToken,
        applyAction,
        loadState,
        reset,
        replayRound,
        nextRound,
        setLevels,
        loadLevelsFromStorage,
        setOnStateChange(fn) { onStateChange = fn; },
        setOnWin(fn) { onWin = fn; },
        setOnLose(fn) { onLose = fn; },
        setOnActionToast(fn) { onActionToast = fn; }
    };
})(typeof window !== 'undefined' ? window : global);
