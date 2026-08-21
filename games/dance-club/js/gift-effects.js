/**
 * TikTok gift effects — spawn guests, float, solo, formations, runway, zipline, FX.
 */
import {
    saveHomePositions,
    saveMovableHomePositions,
    shouldHoldFormationPosition,
    pickDancerForViewer,
    pickNextDancer,
    pickZiplineDestination,
    applyFrontRow,
    applyDjBooth,
    applyRandomFormation,
    applyFormationPattern,
    applyRunwayFormation,
    applySoloCircleFormation,
    bringToCenterStage,
    isOnElevatedDeck,
    walkDancerAlong,
    restoreDancerHome,
    restoreAllHome,
    getFormationState,
    updateDancerTween,
    animateDancerTo
} from './formation.js?v=form-solo-restore-1';
import { spawnGuestOnFloor, buildGuestProfile } from './character.js';

/** Camera presets for zipline — varied angles so each ride feels different */
const ZIPLINE_CAMERA_SHOTS = [
    { id: 'highSide', distance: 9, height: 3.2 },
    { id: 'highSideL', distance: 9, height: 3.2 },
    { id: 'wingL', distance: 10, height: 2.8 },
    { id: 'wingR', distance: 10, height: 2.8 },
    { id: 'dollyL', distance: 8.5, height: 2.6 },
    { id: 'dollyR', distance: 8.5, height: 2.6 },
    { id: 'crane', distance: 11, height: 3.5 },
    { id: 'wide', distance: 12, height: 3.0 },
    { id: 'ultraWide', distance: 14, height: 3.5 },
    { id: 'far', distance: 16, height: 4.0 },
    { id: 'farHigh', distance: 15, height: 4.5 },
    { id: 'crowd', distance: 8, height: 2.4 },
    { id: 'drone', distance: 13, height: 3.8 },
    { id: 'droneFar', distance: 15, height: 4.2 },
    { id: 'dutch', distance: 8, height: 2.8 },
    { id: 'laser', distance: 10, height: 3.0 }
];

function pickZiplineCamera() {
    return ZIPLINE_CAMERA_SHOTS[Math.floor(Math.random() * ZIPLINE_CAMERA_SHOTS.length)];
}

export const GIFT_EFFECTS = {
    stage: { id: 'stage', label: 'ลงสนาม', icon: '🕺', persistent: true },
    float_camera: { id: 'float_camera', label: 'ลอยตัว + กล้องจับ', icon: '🎥' },
    float: { id: 'float', label: 'ลอยตัวสูง', icon: '🎈' },
    front_row: { id: 'front_row', label: 'ย้ายแถวหน้า', icon: '⬆️' },
    dj_booth: { id: 'dj_booth', label: 'ขึ้นแท่น DJ', icon: '🎧' },
    solo: { id: 'solo', label: 'โชว์เดี่ยว (ไฟโฟกัส)', icon: '⭐' },
    formation: { id: 'formation', label: 'แปรแถว', icon: '💫', persistent: true },
    wallpaper: { id: 'wallpaper', label: 'แจกวาร์ป', icon: '🖼️' },
    zipline: { id: 'zipline', label: 'โหนสลิง', icon: '🪂' },
    spin: { id: 'spin', label: 'หมุนตัวกลางเวที', icon: '🌀' },
    cannon: { id: 'cannon', label: 'ยิงขึ้นฟ้า', icon: '🚀' },
    fire: { id: 'fire', label: 'เอฟเฟคไฟ', icon: '🔥' },
    snow: { id: 'snow', label: 'หิมะตก', icon: '❄️' },
    runway: { id: 'runway', label: 'รันเวย์', icon: '👠' }
};

export const EFFECT_IDS = Object.keys(GIFT_EFFECTS);

const DJ_BOOTH_SONGS = 2;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export function createGiftEffectSystem(ctx) {
    const { cameraCtrl, dancers, sceneApi, onToast, fireworks, onDancerAdded } = ctx;
    let selectedId = dancers[0] ? dancers[0].profile.id : null;
    const queue = [];
    const guestByViewer = new Map();
    /** Run immediately — multiple can overlap */
    const PARALLEL_FX = new Set([
        'fire', 'snow',
        'stage', 'float', 'front_row', 'dj_booth', 'formation', 'zipline', 'spin'
    ]);

    /** One person at a time — camera / spotlight takeover */
    const QUEUED_FX = new Set(['float_camera', 'solo', 'wallpaper', 'runway']);

    const restoreTimers = new Map();
    let restoreTimer = null;
    let queueRunning = false;
    let formationChain = Promise.resolve();
    /** uniqueId -> { nickname, coins, uniqueId } */
    const coinLedger = new Map();
    /** dancerId -> { songsLeft } — DJ booth lasts 2 full song changes */
    const djBoothActive = new Map();

    saveHomePositions(dancers);

    function syncClubStats() {
        const top3 = [...coinLedger.values()]
            .sort((a, b) => b.coins - a.coins)
            .slice(0, 3);
        sceneApi?.setClubStats?.({
            crowd: dancers.length,
            top3
        });
    }

    function addCoins(opts, coins) {
        const uid = String(opts.uniqueId || opts.from || opts.nickname || '').trim();
        if (!uid || !(coins > 0)) {
            syncClubStats();
            return;
        }
        const nick = String(opts.from || opts.nickname || uid).replace(/^@/, '').slice(0, 18);
        const prev = coinLedger.get(uid) || { uniqueId: uid, nickname: nick, coins: 0 };
        prev.coins += coins;
        prev.nickname = nick || prev.nickname;
        coinLedger.set(uid, prev);
        syncClubStats();
    }

    function findDancer(id) {
        return dancers.find((d) => d.profile.id === id) || null;
    }

    function setSelected(id) {
        if (findDancer(id)) selectedId = id;
        return selectedId;
    }

    function getSelected() {
        return selectedId;
    }

    function holdFor(coins, duration) {
        if (duration) return Number(duration);
        if (coins >= 500) return 14;
        if (coins >= 100) return 10;
        if (coins >= 20) return 7;
        return 5;
    }

    function clearRestoreTimer() {
        if (restoreTimer) {
            clearTimeout(restoreTimer);
            restoreTimer = null;
        }
    }

    function clearDancerRestore(dancerId) {
        const t = restoreTimers.get(dancerId);
        if (t) {
            clearTimeout(t);
            restoreTimers.delete(dancerId);
        }
    }

    function scheduleDancerRestore(dancerId, fn, sec) {
        if (!dancerId) return;
        clearDancerRestore(dancerId);
        const t = setTimeout(async () => {
            restoreTimers.delete(dancerId);
            await fn();
        }, sec * 1000);
        restoreTimers.set(dancerId, t);
    }

    function scheduleRestore(fn, sec) {
        clearRestoreTimer();
        restoreTimer = setTimeout(fn, sec * 1000);
    }

    function endSoloFx() {
        if (sceneApi?.setSoloSpotlight) sceneApi.setSoloSpotlight(false);
        if (sceneApi?.setSoloFx) sceneApi.setSoloFx(false);
        cameraCtrl.releaseFocus?.();
        if (sceneApi?.setPattern) sceneApi.setPattern('sweep');
    }

    function registerGuest(dancer) {
        if (dancer.viewerId) guestByViewer.set(dancer.viewerId, dancer);
        if (dancers.length === 1) saveHomePositions(dancers);
        if (typeof onDancerAdded === 'function') onDancerAdded(dancer);
        syncClubStats();
    }

    function getOrSpawnGuest(opts) {
        const uid = String(opts.uniqueId || opts.from || opts.nickname || `anon_${Date.now()}`);
        if (guestByViewer.has(uid)) {
            return guestByViewer.get(uid);
        }

        const profile = buildGuestProfile({
            uniqueId: uid,
            nickname: opts.from || opts.nickname,
            avatar: opts.avatar || opts.giftIcon,
            giftName: opts.giftName
        });

        const dancer = spawnGuestOnFloor(sceneApi.scene, profile, {
            camera: sceneApi.camera,
            occupied: dancers
        });
        dancers.push(dancer);
        registerGuest(dancer);
        return dancer;
    }

    async function releaseDjBooth(dancerId) {
        const dancer = findDancer(dancerId);
        if (!dancer) {
            djBoothActive.delete(dancerId);
            return;
        }
        clearDancerRestore(dancerId);
        dancer.setGiftFloat(0);
        dancer.setForcedMove(null);
        dancer.onDjBooth = false;
        dancer.setStagePriority?.(false);
        dancer.elevated = false;
        await restoreDancerHome(dancer, 1.4);
        cameraCtrl.releaseFocus?.();
        djBoothActive.delete(dancerId);
    }

    async function onSongChanged() {
        if (!djBoothActive.size) return;
        const pending = [...djBoothActive.entries()];
        for (const [dancerId, st] of pending) {
            st.songsLeft -= 1;
            if (st.songsLeft <= 0) {
                await releaseDjBooth(dancerId);
            }
        }
    }

    function resolveDancer(opts) {
        const effect = opts.effect || 'float_camera';

        if (opts.dancerId && findDancer(opts.dancerId)) {
            return findDancer(opts.dancerId);
        }

        const uid = String(opts.uniqueId || opts.from || opts.nickname || '');
        const viewerKey = uid || String(opts.from || opts.nickname || 'viewer');

        if (uid && guestByViewer.has(uid)) {
            return guestByViewer.get(uid);
        }

        if (effect === 'wallpaper' || effect === 'fire' || effect === 'snow') {
            return pickDancerForViewer(viewerKey, dancers) || dancers[0] || null;
        }

        // Only "ลงสนาม" adds a new guest to the floor
        if (effect === 'stage') {
            return getOrSpawnGuest(opts);
        }

        if (effect === 'dj_booth' && uid && guestByViewer.has(uid)) {
            return guestByViewer.get(uid);
        }

        if (!dancers.length) {
            return getOrSpawnGuest(opts);
        }

        // Parallel effects: rotate by viewer — never pin to selectedId
        if (PARALLEL_FX.has(effect)) {
            return pickDancerForViewer(viewerKey, dancers) || pickNextDancer(dancers);
        }

        if (selectedId && findDancer(selectedId)) {
            return findDancer(selectedId);
        }

        return pickDancerForViewer(viewerKey, dancers) || pickNextDancer(dancers);
    }

    async function runEffect(effect, dancer, opts) {
        const coins = opts.coins != null ? opts.coins : 1;
        const hold = holdFor(coins, opts.duration);
        const lockMs = hold * 1000 + 2000;
        const parallel = !!opts.parallel;
        const dancerId = dancer?.profile?.id;
        const cameraFree = !queueRunning && queue.length === 0;

        switch (effect) {
            case 'stage': {
                dancer.setForcedMove('hype', lockMs);
                dancer.setGiftFloat(0.2, 1500);
                break;
            }

            case 'float_camera': {
                const lift = 2.8 + Math.min(1.6, coins / 400);
                dancer.setForcedMove('hype', lockMs);
                dancer.setGiftFloat(lift, lockMs);
                cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
                    duration: hold,
                    distance: coins >= 100 ? 5.5 : 6.4,
                    height: 1.4
                });
                if (sceneApi?.setPattern) sceneApi.setPattern('lockCenter');
                scheduleRestore(() => {
                    dancer.setGiftFloat(0);
                    dancer.setForcedMove(null);
                    cameraCtrl.releaseFocus?.();
                    if (sceneApi?.setPattern) sceneApi.setPattern('sweep');
                }, hold);
                break;
            }

            case 'float': {
                const lift = 3.2 + Math.min(2.0, coins / 350);
                dancer.setForcedMove('hype', lockMs);
                dancer.setGiftFloat(lift, lockMs);
                scheduleDancerRestore(dancerId, () => {
                    dancer.setGiftFloat(0);
                    dancer.setForcedMove(null);
                }, hold);
                break;
            }

            case 'front_row': {
                await applyFrontRow(dancers, dancer.profile.id, 1.2);
                dancer.setForcedMove('jackhammer', lockMs);
                scheduleDancerRestore(dancerId, async () => {
                    dancer.setForcedMove(null);
                    await restoreDancerHome(dancer, 1.3);
                }, hold);
                break;
            }

            case 'dj_booth': {
                clearDancerRestore(dancerId);
                await applyDjBooth(dancers, dancer.profile.id, 1.3);
                dancer.setForcedMove('hype', 999999);
                dancer.setGiftFloat(0.15, 999999);
                djBoothActive.set(dancerId, { songsLeft: DJ_BOOTH_SONGS });
                if (cameraFree) {
                    cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
                        duration: 4,
                        distance: 7.2,
                        height: 1.8
                    });
                }
                break;
            }

            case 'solo': {
                if (sceneApi?.setSoloSpotlight) sceneApi.setSoloSpotlight(true, 0);
                if (sceneApi?.setSoloFx) sceneApi.setSoloFx(true);
                if (sceneApi?.setPattern) sceneApi.setPattern('lockCenter');
                saveMovableHomePositions(dancers, dancer.profile.id);
                if (isOnElevatedDeck(dancer)) {
                    djBoothActive.delete(dancerId);
                }
                // โชว์เดี่ยว — ดาวเดี่ยวกลางวง คนอื่นเรียงวงกลมรอบ (ยกเว้น DJ)
                await applySoloCircleFormation(dancers, dancer.profile.id, 1.4);
                dancer.setForcedMove('hype', lockMs);
                dancer.setGiftFloat(0.55, lockMs);
                cameraCtrl.setAutoCut?.(false);
                cameraCtrl.pullToWide?.({ id: 'droneFar', duration: 1.2, graceMs: lockMs + 8000 });
                cameraCtrl.setShot?.('hero', { duration: 1.8 });
                cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
                    duration: hold,
                    distance: 5.2,
                    height: 0.7
                });
                scheduleRestore(async () => {
                    endSoloFx();
                    const starId = dancer.profile.id;
                    dancers.forEach((d) => {
                        d.setGiftFloat(0);
                        d.setForcedMove(null);
                    });
                    if (sceneApi?.setPattern) sceneApi.setPattern('chase');
                    await applyRandomFormation(dancers, starId, 1.6, { skipHeld: true });
                    cameraCtrl.releaseFocus?.();
                    cameraCtrl.pullToWide?.({ id: 'droneFar', duration: 3.2, graceMs: 12000 });
                }, hold);
                break;
            }

            case 'formation': {
                if (!parallel) {
                    clearRestoreTimer();
                    endSoloFx();
                }
                await new Promise((resolve, reject) => {
                    formationChain = formationChain
                        .then(() => applyRandomFormation(dancers, dancer.profile.id, 1.6, { skipHeld: true }))
                        .then(resolve, reject);
                });
                dancer.setForcedMove('noodle', 60000);
                if (sceneApi?.setPattern) sceneApi.setPattern('chase');
                if (!parallel || cameraFree) {
                    cameraCtrl.setShot?.('wide', { duration: 2.0 });
                }
                break;
            }

            case 'wallpaper': {
                const avatar = opts.avatar || opts.giftIcon || dancer?.profile?.avatar;
                sceneApi.sayBanner?.clear?.();
                if (sceneApi?.profileWallpaper) {
                    await sceneApi.profileWallpaper.addProfile({
                        avatar,
                        nickname: opts.from || opts.nickname || dancer?.profile?.name,
                        duration: hold
                    });
                }
                cameraCtrl.setShot?.('wide', { duration: 2.0 });
                if (sceneApi?.setPattern) sceneApi.setPattern('lockCenter');
                break;
            }

            case 'zipline': {
                const from = {
                    x: dancer.root.position.x,
                    z: dancer.root.position.z,
                    rot: dancer.root.rotation.y
                };
                const dest = pickZiplineDestination(
                    dancer,
                    dancers,
                    opts.uniqueId || opts.from || dancer.profile?.id
                );
                const lift = 5.5 + Math.min(1.8, coins / 120);

                dancer.setForcedMove('hype', lockMs);
                dancer.setGiftFloat(lift, lockMs + 3000);
                await sleep(550);

                if (!parallel || cameraFree) {
                    const zipCam = pickZiplineCamera();
                    cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
                        duration: hold + 1,
                        distance: zipCam.distance,
                        height: zipCam.height
                    });
                    cameraCtrl.setShot?.(zipCam.id, { duration: 1.6 });
                }

                const walkDur = Math.min(6.5, hold * 0.8);
                await walkDancerAlong(dancer, from, dest, walkDur);

                dancer.homePos = { x: dest.x, z: dest.z, rot: dest.rot ?? Math.PI };
                dancer.setGiftFloat(0.15, 900);

                scheduleDancerRestore(dancerId, () => {
                    dancer.setGiftFloat(0);
                    dancer.setForcedMove(null);
                    if (!parallel || cameraFree) cameraCtrl.releaseFocus?.();
                }, 1.2);
                break;
            }

            case 'spin': {
                animateDancerTo(dancer, 0, 2.5, Math.PI, 1.1);
                dancer.setForcedMove('spin', lockMs);
                dancer.setGiftFloat(0.5, lockMs);
                if (!parallel || cameraFree) {
                    if (sceneApi?.setSoloSpotlight) sceneApi.setSoloSpotlight(true, 0);
                    cameraCtrl.setShot?.('top', { duration: 1.8 });
                    await sleep(900);
                    cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
                        duration: hold,
                        distance: 6.2,
                        height: 2.4
                    });
                }
                scheduleDancerRestore(dancerId, async () => {
                    if (!parallel) endSoloFx();
                    else if (sceneApi?.setSoloSpotlight) sceneApi.setSoloSpotlight(false);
                    dancer.setGiftFloat(0);
                    dancer.setForcedMove(null);
                    await restoreDancerHome(dancer, 1.3);
                }, hold);
                break;
            }

            case 'cannon': {
                dancer.setForcedMove('hype', lockMs);
                dancer.setGiftFloat(4.8, lockMs);
                sceneApi?.stageEffects?.burstSparkle?.();
                sceneApi?.stageEffects?.pulseEffect?.('sparkle', 4);
                if (!parallel || cameraFree) {
                    cameraCtrl.setShot?.('crane', { duration: 1.5 });
                    cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
                        duration: hold,
                        distance: 8,
                        height: 3.2
                    });
                }
                scheduleDancerRestore(dancerId, () => {
                    dancer.setGiftFloat(0);
                    dancer.setForcedMove(null);
                    if (!parallel || cameraFree) cameraCtrl.releaseFocus?.();
                }, hold);
                break;
            }

            case 'fire': {
                sceneApi?.stageEffects?.pulseEffect?.('fire', Math.max(8, hold));
                if (!parallel || cameraFree) cameraCtrl.setShot?.('hero', { duration: 1.8 });
                if (dancer) {
                    dancer.setForcedMove('hype', lockMs);
                    scheduleDancerRestore(dancerId, () => {
                        dancer.setForcedMove(null);
                        sceneApi?.stageEffects?.setEffect?.('fire', false);
                    }, hold);
                } else {
                    scheduleRestore(() => sceneApi?.stageEffects?.setEffect?.('fire', false), hold);
                }
                break;
            }

            case 'snow': {
                sceneApi?.stageEffects?.pulseEffect?.('snow', Math.max(10, hold));
                if (!parallel || cameraFree) cameraCtrl.setShot?.('wide', { duration: 1.8 });
                if (dancer) {
                    dancer.setForcedMove('noodle', lockMs);
                    scheduleDancerRestore(dancerId, () => {
                        dancer.setForcedMove(null);
                        sceneApi?.stageEffects?.setEffect?.('snow', false);
                    }, hold);
                } else {
                    scheduleRestore(() => sceneApi?.stageEffects?.setEffect?.('snow', false), hold);
                }
                break;
            }

            case 'runway': {
                clearRestoreTimer();
                endSoloFx();
                saveMovableHomePositions(dancers, dancer.profile.id);
                cameraCtrl.setAutoCut?.(false);

                if (sceneApi?.setSoloSpotlight) sceneApi.setSoloSpotlight(true, 0);
                if (sceneApi?.setSoloFx) sceneApi.setSoloFx(true);
                if (sceneApi?.setPattern) sceneApi.setPattern('lockCenter');

                const nickname = opts.from || opts.nickname || dancer.profile?.name || 'Viewer';
                const avatar = opts.avatar || opts.giftIcon || dancer.profile?.avatar;

                sceneApi.sayBanner?.clear?.();
                if (sceneApi?.profileWallpaper) {
                    await sceneApi.profileWallpaper.addProfile({
                        avatar,
                        nickname,
                        duration: Math.max(16, hold + 6)
                    });
                }
                cameraCtrl.setShot?.('runwayName', { duration: 1.4 });
                await sleep(2800);

                const path = await applyRunwayFormation(dancers, dancer.profile.id, 1.5);
                dancers.forEach((d) => {
                    if (d !== dancer && !shouldHoldFormationPosition(d)) {
                        d.setForcedMove('bounce', lockMs + 6000);
                    }
                });
                dancer.setForcedMove('walk', lockMs + 6000);

                const walkDur = 6.8;
                cameraCtrl.playDroneOrbitOnce?.({
                    id: 'drone',
                    duration: walkDur,
                    releaseId: 'runwayMid',
                    releaseDuration: 1.4
                });
                cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
                    duration: walkDur + 1.5,
                    distance: 10,
                    height: 4.8
                });

                await walkDancerAlong(dancer, path.start, path.end, walkDur);
                cameraCtrl.releaseFocus?.();

                dancer.setForcedMove('hype', lockMs);
                dancer.setGiftFloat(0.35, 2800);
                cameraCtrl.setShot?.('runwayEnd', { duration: 1.5 });
                await sleep(700);
                const closeDur = Math.max(3.5, hold - 2);
                cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), {
                    duration: closeDur,
                    distance: 4.5,
                    height: 0.55
                });
                sceneApi?.stageEffects?.burstSparkle?.();
                await sleep(closeDur * 1000);

                cameraCtrl.releaseFocus?.();
                cameraCtrl.pullToWide?.({ id: 'wide', duration: 3.2, graceMs: 12000 });

                scheduleRestore(async () => {
                    endSoloFx();
                    const starId = dancer.profile.id;
                    dancers.forEach((d) => {
                        d.setGiftFloat(0);
                        d.setForcedMove(null);
                    });
                    if (sceneApi?.setPattern) sceneApi.setPattern('chase');
                    await applyRandomFormation(dancers, starId, 1.6, { skipHeld: true });
                }, Math.max(2, hold - closeDur));
                break;
            }

            default:
                dancer.setGiftFloat(0.8, lockMs);
                cameraCtrl.focusOn(() => dancer.getWorldFocusPoint(), { duration: hold });
                scheduleRestore(() => dancer.setGiftFloat(0), hold);
        }
    }

    async function executeGift(opts = {}) {
        const effect = opts.effect || 'float_camera';
        const dancer = resolveDancer(opts);
        if (!dancer && effect !== 'wallpaper' && effect !== 'fire' && effect !== 'snow') return false;

        if (QUEUED_FX.has(effect)) {
            selectedId = dancer?.profile?.id || selectedId;
        }
        const giftName = opts.giftName || 'Rose';
        const coins = opts.coins != null ? opts.coins : 1;
        const from = opts.from || opts.nickname || 'Viewer';
        const hold = holdFor(coins, opts.duration);
        const isQueued = QUEUED_FX.has(effect);

        if (opts.firework !== false && fireworks) {
            fireworks.trigger({
                nickname: from,
                giftName,
                giftIcon: opts.giftIcon,
                coins,
                diamondCount: opts.diamondCount
            });
        }

        await runEffect(effect, dancer, { ...opts, coins, parallel: !isQueued });
        addCoins(opts, coins);

        if (!opts.skipToast && typeof onToast === 'function') {
            const fx = GIFT_EFFECTS[effect] || { icon: '🎁', label: effect };
            let extra = '';
            if (effect === 'stage') extra = ` (${guestByViewer.size} คนในสนาม)`;
            if (effect === 'dj_booth') extra = ' · DJ stage';
            if (effect === 'formation') extra = ` · ${getFormationState().patternId || ''}`;
            if (effect === 'runway') extra = ' · catwalk';
            onToast(`🎁 @${from} → ${dancer?.profile?.name || from}\n${fx.icon} ${fx.label}${extra} · ${giftName}`);
        }

        if (isQueued) {
            await sleep(hold * 1000 + 400);
        }
        return true;
    }

    async function drainGiftQueue() {
        if (queueRunning) return;
        queueRunning = true;
        try {
            while (queue.length) {
                const next = queue.shift();
                try {
                    await executeGift(next);
                } catch (err) {
                    console.error('[DanceClub] gift queue item failed', err);
                }
            }
        } finally {
            queueRunning = false;
            if (queue.length) drainGiftQueue();
        }
    }

    async function triggerGift(opts = {}) {
        const effect = opts.effect || 'float_camera';

        if (PARALLEL_FX.has(effect)) {
            void executeGift(opts).catch((err) => {
                console.error('[DanceClub] parallel gift failed', err);
            });
            return true;
        }

        if (queue.length >= 24) return false;
        queue.push(opts);
        void drainGiftQueue();
        return true;
    }

    function handleTikTokGift(gift, rule = {}) {
        const coins = gift.totalCoins
            || (gift.diamondCount || 0) * (gift.repeatCount || 1)
            || gift.coins
            || 0;
        const from = gift.nickname || gift.uniqueId || 'Viewer';

        if (rule.firework !== false && fireworks) {
            fireworks.trigger({
                nickname: from,
                giftName: gift.giftName,
                giftIcon: gift.giftIcon || gift.giftImage,
                coins,
                diamondCount: gift.diamondCount
            });
        }

        if (!rule.effect) return true;

        return triggerGift({
            dancerId: rule?.dancerId,
            effect: rule.effect,
            duration: rule.duration,
            firework: false,
            skipToast: !!rule.skipToast,
            giftName: gift.giftName,
            giftIcon: gift.giftIcon || gift.giftImage,
            avatar: gift.avatar || gift.profilePictureUrl || gift.giftImage,
            coins,
            diamondCount: gift.diamondCount,
            from,
            uniqueId: gift.uniqueId,
            queueIfBusy: true
        });
    }

    function mockRandomGift() {
        const samples = [
            { giftName: 'Rose', coins: 1, effect: 'float_camera' },
            { giftName: 'TikTok', coins: 1, effect: 'stage' },
            { giftName: 'Perfume', coins: 20, effect: 'front_row' },
            { giftName: 'DJ', coins: 50, effect: 'dj_booth', duration: 10 },
            { giftName: 'Lion', coins: 299, effect: 'solo', duration: 10 },
            { giftName: 'Universe', coins: 699, effect: 'formation', duration: 12 },
            { giftName: 'Galaxy', coins: 100, effect: 'wallpaper', duration: 14, avatar: 'https://api.dicebear.com/7.x/avataaars/png?seed=galaxy&size=256' },
            { giftName: 'Zipline', coins: 199, effect: 'zipline', duration: 8 },
            { giftName: 'Fire', coins: 50, effect: 'fire', duration: 10 },
            { giftName: 'Snow', coins: 50, effect: 'snow', duration: 12 },
            { giftName: 'Runway', coins: 399, effect: 'runway', duration: 14 },
            { giftName: 'Cannon', coins: 99, effect: 'cannon', duration: 7 },
            { giftName: 'Spin', coins: 30, effect: 'spin', duration: 8 }
        ];
        const g = { ...samples[Math.floor(Math.random() * samples.length)] };
        if (!dancers.length && !['fire', 'snow', 'wallpaper'].includes(g.effect)) g.effect = 'stage';
        const uid = g.effect === 'stage' ? `test_viewer_${Date.now()}` : 'test_viewer';
        return triggerGift({
            ...g,
            from: 'ทดสอบ',
            uniqueId: uid,
            dancerId: selectedId || undefined,
            skipToast: true,
            firework: false
        });
    }

    function update(dt) {
        dancers.forEach((d) => {
            if (d.dropSpawn) {
                d.dropSpawn.t = Math.min(1, d.dropSpawn.t + dt / d.dropSpawn.dur);
                if (d.dropSpawn.t >= 1) d.dropSpawn = null;
            }
            updateDancerTween(d, dt);
        });
    }

    return {
        setSelected,
        getSelected,
        triggerGift,
        handleTikTokGift,
        mockRandomGift,
        update,
        onSongChanged,
        syncClubStats,
        get guestCount() { return guestByViewer.size; },
        get pending() { return queue.length + (queueRunning ? 1 : 0); }
    };
}

export function attachGiftApi(system) {
    window.DanceClubGift = {
        trigger: (payload) => system.triggerGift(payload || {}),
        tiktok: (gift, rule) => system.handleTikTokGift(gift, rule),
        mock: () => system.mockRandomGift(),
        select: (id) => system.setSelected(id),
        selected: () => system.getSelected(),
        effects: GIFT_EFFECTS
    };
}
