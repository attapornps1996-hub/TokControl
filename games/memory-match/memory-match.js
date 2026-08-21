/**
 * Memory Match — TokControl built-in game engine
 * Shared between game window and OBS overlay.
 */
(function (global) {
    'use strict';

    const MODES = {
        easy:    { cols: 4, rows: 3, pairs: 6,  label: 'ง่าย (6 คู่)' },
        normal:  { cols: 4, rows: 4, pairs: 8,  label: 'ปกติ (8 คู่)' },
        hard:    { cols: 5, rows: 4, pairs: 10, label: 'ยาก (10 คู่)' },
        extreme: { cols: 6, rows: 5, pairs: 15, label: 'สุดโหด (15 คู่)' }
    };

    const SYMBOLS = ['🎮','🎯','🎲','🎪','🎨','🎭','🎸','🎺','🎻','🥁','🏆','⚽','🏀','🎳','🎱','🚀','🌟','💎','🔥','❄️','🌈','🍕','🍔','🍩','🎂','🍦','🐱','🐶','🦊','🐸'];

    const COUNTDOWN_SEC = 10;

    let state = {
        mode: 'normal',
        cards: [],
        flipped: [],
        matched: 0,
        totalPairs: 8,
        phase: 'idle',       // idle | playing | countdown | victory
        countdown: COUNTDOWN_SEC,
        wins: 0,
        locked: false,
        cols: 4,
        rows: 4
    };

    let countdownTimer = null;
    let flipBackTimer = null;
    let onStateChange = null;
    let onWin = null;
    let onActionToast = null;

    function emitChange() {
        if (typeof onStateChange === 'function') onStateChange(getPublicState());
    }

    function getPublicState() {
        return {
            mode: state.mode,
            cards: state.cards.map(c => ({ id: c.id, symbol: c.symbol, flipped: c.flipped, matched: c.matched })),
            matched: state.matched,
            totalPairs: state.totalPairs,
            phase: state.phase,
            countdown: state.countdown,
            wins: state.wins,
            locked: state.locked,
            cols: state.cols,
            rows: state.rows
        };
    }

    function pickSymbols(count) {
        const pool = [...SYMBOLS].sort(() => Math.random() - 0.5);
        return pool.slice(0, count);
    }

    function buildBoard(modeKey) {
        const mode = MODES[modeKey] || MODES.normal;
        const symbols = pickSymbols(mode.pairs);
        const cards = [];
        let id = 0;
        symbols.forEach(sym => {
            cards.push({ id: id++, symbol: sym, flipped: false, matched: false });
            cards.push({ id: id++, symbol: sym, flipped: false, matched: false });
        });
        // Fisher-Yates shuffle
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        state.mode = modeKey;
        state.cards = cards;
        state.flipped = [];
        state.matched = 0;
        state.totalPairs = mode.pairs;
        state.cols = mode.cols;
        state.rows = mode.rows;
        state.phase = 'playing';
        state.countdown = COUNTDOWN_SEC;
        state.locked = false;
        clearTimers();
        emitChange();
    }

    function clearTimers() {
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        if (flipBackTimer) { clearTimeout(flipBackTimer); flipBackTimer = null; }
    }

    function startCountdown() {
        state.phase = 'countdown';
        state.countdown = COUNTDOWN_SEC;
        emitChange();
        countdownTimer = setInterval(() => {
            state.countdown--;
            emitChange();
            if (state.countdown <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
                triggerVictory();
            }
        }, 1000);
    }

    function triggerVictory() {
        state.phase = 'victory';
        state.wins++;
        emitChange();
        if (typeof onWin === 'function') onWin(state.wins);
        setTimeout(() => {
            buildBoard(state.mode);
        }, 2500);
    }

    function flipCard(cardId) {
        if (state.locked || state.phase !== 'playing') return false;
        const card = state.cards.find(c => c.id === cardId);
        if (!card || card.flipped || card.matched) return false;
        if (state.flipped.length >= 2) return false;

        card.flipped = true;
        state.flipped.push(cardId);
        emitChange();

        if (state.flipped.length === 2) {
            state.locked = true;
            const [a, b] = state.flipped.map(id => state.cards.find(c => c.id === id));
            if (a.symbol === b.symbol) {
                setTimeout(() => {
                    a.matched = true;
                    b.matched = true;
                    state.matched++;
                    state.flipped = [];
                    state.locked = false;
                    emitChange();
                    if (state.matched >= state.totalPairs) {
                        setTimeout(() => startCountdown(), 600);
                    }
                }, 400);
            } else {
                flipBackTimer = setTimeout(() => {
                    a.flipped = false;
                    b.flipped = false;
                    state.flipped = [];
                    state.locked = false;
                    emitChange();
                }, 900);
            }
        }
        return true;
    }

    // ── Viewer actions ──────────────────────────────────────────

    function toast(msg, type) {
        if (typeof onActionToast === 'function') onActionToast(msg, type);
    }

    /** Help: reveal a random unmatched pair briefly */
    function actionHelpReveal(user) {
        if (state.phase !== 'playing') return;
        const unmatched = state.cards.filter(c => !c.matched);
        const symbols = [...new Set(unmatched.map(c => c.symbol))];
        if (!symbols.length) return;
        const sym = symbols[Math.floor(Math.random() * symbols.length)];
        const pair = unmatched.filter(c => c.symbol === sym);
        pair.forEach(c => { c.flipped = true; });
        emitChange();
        toast(`💚 @${user || 'ผู้ชม'} ช่วยเปิดคู่ ${sym}`, 'help');
        setTimeout(() => {
            pair.forEach(c => { if (!c.matched) c.flipped = false; });
            emitChange();
        }, 2000);
    }

    /** Help: reduce countdown by N seconds */
    function actionHelpReduce(user, sec) {
        if (state.phase !== 'countdown') return;
        const n = Math.max(1, sec || 2);
        state.countdown = Math.max(0, state.countdown - n);
        toast(`💚 @${user || 'ผู้ชม'} ช่วยลดเวลา -${n}วิ`, 'help');
        emitChange();
        if (state.countdown <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            triggerVictory();
        }
    }

    /** Help: hint glow on a random unmatched pair */
    function actionHelpHint(user) {
        if (state.phase !== 'playing') return;
        const unmatched = state.cards.filter(c => !c.matched);
        const symbols = [...new Set(unmatched.map(c => c.symbol))];
        if (!symbols.length) return;
        const sym = symbols[Math.floor(Math.random() * symbols.length)];
        toast(`💡 @${user || 'ผู้ชม'} ให้คำใบ้!`, 'help');
        emitChange();
        // hint is visual only — parent renders hint-glow class on matching cards
        return sym;
    }

    /** Troll: shuffle all face-down unmatched cards */
    function actionTrollShuffle(user) {
        if (state.phase !== 'playing') return;
        const faceDown = state.cards.filter(c => !c.matched && !c.flipped);
        const symbols = faceDown.map(c => c.symbol);
        for (let i = symbols.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
        }
        faceDown.forEach((c, i) => { c.symbol = symbols[i]; });
        state.flipped = [];
        state.locked = false;
        toast(`😈 @${user || 'ผู้ชม'} สับไพ่!`, 'troll');
        emitChange();
    }

    /** Troll: flip all open cards back */
    function actionTrollFlipBack(user) {
        if (state.phase !== 'playing') return;
        state.cards.forEach(c => { if (!c.matched) c.flipped = false; });
        state.flipped = [];
        state.locked = false;
        toast(`😈 @${user || 'ผู้ชม'} ปิดไพ่กลับ!`, 'troll');
        emitChange();
    }

    /** Troll: add N pairs to the board */
    function actionTrollAddPairs(user, count) {
        if (state.phase !== 'playing') return;
        const n = Math.max(1, count || 1);
        const usedSymbols = new Set(state.cards.map(c => c.symbol));
        const available = SYMBOLS.filter(s => !usedSymbols.has(s));
        let added = 0;
        for (let i = 0; i < n && i < available.length; i++) {
            const sym = available[i];
            const maxId = Math.max(...state.cards.map(c => c.id), -1);
            state.cards.push({ id: maxId + 1, symbol: sym, flipped: false, matched: false });
            state.cards.push({ id: maxId + 2, symbol: sym, flipped: false, matched: false });
            state.totalPairs++;
            added++;
        }
        if (added > 0) {
            // Recalculate grid
            const total = state.cards.length;
            state.cols = Math.ceil(Math.sqrt(total * 1.2));
            state.rows = Math.ceil(total / state.cols);
            toast(`😈 @${user || 'ผู้ชม'} เพิ่ม ${added} คู่!`, 'troll');
            emitChange();
        }
    }

    /** Troll: add seconds to countdown */
    function actionTrollAddTime(user, sec) {
        if (state.phase !== 'countdown') return;
        const n = Math.max(1, sec || 3);
        state.countdown += n;
        toast(`😈 @${user || 'ผู้ชม'} เพิ่มเวลา +${n}วิ`, 'troll');
        emitChange();
    }

    function applyAction(action, user, amount) {
        switch (action) {
            case 'help_reveal':  return actionHelpReveal(user);
            case 'help_reduce':  return actionHelpReduce(user, amount);
            case 'help_hint':    return actionHelpHint(user);
            case 'troll_shuffle':   return actionTrollShuffle(user);
            case 'troll_flipback':  return actionTrollFlipBack(user);
            case 'troll_addpairs':  return actionTrollAddPairs(user, amount);
            case 'troll_addtime':   return actionTrollAddTime(user, amount);
            default: return false;
        }
    }

    function loadState(saved) {
        if (!saved) return;
        clearTimers();
        state.mode = saved.mode;
        state.cards = (saved.cards || []).map(c => ({ ...c }));
        state.flipped = state.cards.filter(c => c.flipped && !c.matched).map(c => c.id);
        state.matched = saved.matched;
        state.totalPairs = saved.totalPairs;
        state.phase = saved.phase;
        state.countdown = saved.countdown;
        state.wins = saved.wins;
        state.locked = saved.locked;
        state.cols = saved.cols;
        state.rows = saved.rows;
        emitChange();
    }

    function reset() {
        clearTimers();
        state.phase = 'idle';
        emitChange();
    }

    global.MemoryMatch = {
        MODES,
        COUNTDOWN_SEC,
        getState: getPublicState,
        buildBoard,
        flipCard,
        applyAction,
        loadState,
        reset,
        setOnStateChange(fn) { onStateChange = fn; },
        setOnWin(fn) { onWin = fn; },
        setOnActionToast(fn) { onActionToast = fn; }
    };
})(typeof window !== 'undefined' ? window : global);
