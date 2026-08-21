/**
 * Dance Club runtime — 3D scene, audio, dancers, gift system.
 * Used by the view (display) page. Control page drives it via sync commands.
 */
import { createDanceScene } from './scene.js?v=viewport-full-1';
import { createCameraController, CAMERA_SHOTS } from './camera.js';
import { createAudioEngine } from './audio.js';
import { createGiftEffectSystem, attachGiftApi } from './gift-effects.js';
import { createGiftFireworks } from './gift-fireworks.js';
import { applyRuntimeSeparation, applyRandomFormation } from './formation.js?v=form-solo-restore-1';
import { setCrowdSize, crowdLodStride } from './character.js';
import { DEMO_DANCERS, avatarUrl } from './demo-data.js';

export function createDanceClubRuntime(viewport, opts = {}) {
    function runWhenIdle(fn, timeout = 120) {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => fn(), { timeout });
        } else {
            setTimeout(fn, 16);
        }
    }

    let forcedMove = null;
    let toastTimer = null;
    let lastSpotifyTrackId = null;
    let songPan = { trackId: null, durationMs: 0, midDone: false, endFxDone: false };
    let musicWasPlaying = false;
    let idleCameraLocked = false;
    const savedAutoCut = { on: !!opts.autoCut, beats: opts.autoCutBeats || 16 };

    let formationPanSeq = 0;
    let songChangeSeq = 0;
    let lastSpotifyHadBeatMap = false;
    let lastSpotifyEventAt = 0;
    let lastSpotifyEventId = null;
    let stageMediaOwnsAudio = false;

    function revealSongScreen() {
        sceneApi.topScreen?.setVisible?.(true);
        void sceneApi.topScreen?.reveal?.();
    }

    function autoFormationOnScreenPan() {
        if (!dancers.length) return;

        const selected = giftSystem.getSelected?.();
        const starId = (selected && dancers.some((d) => d.profile.id === selected))
            ? selected
            : dancers[formationPanSeq % dancers.length]?.profile?.id;
        formationPanSeq += 1;

        runWhenIdle(() => {
            void applyRandomFormation(dancers, starId, 1.6, { skipHeld: true }).then(() => {
                dancers.forEach((d) => {
                    d.setForcedMove?.('noodle', 120000);
                });
                sceneApi.setPattern?.('chase');
            });
        }, 400);
    }

    function panToSongScreen(opts = {}) {
        const seq = opts.seq ?? songChangeSeq;
        const peek = !!opts.peek;
        const panFn = peek ? cameraCtrl.playSongScreenPeek : cameraCtrl.playSongIntro;
        panFn?.({
            getFocusPoint: () => sceneApi.topScreen?.getFocusPoint?.(),
            onReveal: () => {
                if (seq !== songChangeSeq) return;
                revealSongScreen();
            },
            onAtScreen: () => {
                if (seq !== songChangeSeq) return;
                setTimeout(() => autoFormationOnScreenPan(), 800);
            },
            wideId: 'far',
            wideDuration: 3.0,
            wideHold: 2.4,
            pushDuration: peek ? 2.4 : 2.6,
            holdDuration: peek ? 4.2 : 3.2,
            releaseTransition: peek ? 2.8 : 2.8,
            graceMs: peek ? 14000 : 11000
        });
    }

    function syncTopScreenVisibility() {
        const panActive = cameraCtrl.isScreenPanActive?.() ?? false;
        // keepOn screens stay visible for the whole track — don't hide when the pan releases
        const keepOn = !!sceneApi.topScreen?.lastTrack?.keepOn && !!lastSpotifyTrackId && !idleCameraLocked;
        sceneApi.topScreen?.setVisible?.(panActive || keepOn);
    }

    function maybeMidSongPan(progressMs) {
        if (!songPan.durationMs || songPan.midDone) return;
        if (songPan.trackId !== lastSpotifyTrackId) return;
        const mid = songPan.durationMs * 0.48;
        if (progressMs < mid - 4000 || progressMs > mid + 16000) return;
        songPan.midDone = true;
        const track = sceneApi.topScreen?.lastTrack;
        if (track) {
            void sceneApi.topScreen?.show({ ...track, keepOn: true, refresh: true });
        } else {
            void sceneApi.topScreen?.reveal?.();
        }
        panToSongScreen({ seq: songChangeSeq, peek: true });
        syncTopScreenVisibility();
    }

    let beatTrackEnded = false;
    let beatEndAt = 0;

    function dampLightsOnly() {
        sceneApi.rig.beatReact = 0;
        sceneApi.rig.beatDensity = 0;
        sceneApi.rig.strobeUntil = 0;
        sceneApi.rig.flashTier = 0;
        sceneApi.rig.fxMoodStreak = 0;
    }

    function notifyTrackEnded() {
        if (typeof opts.onTrackEnded === 'function') opts.onTrackEnded();
        if (typeof onTrackEndedHook === 'function') onTrackEndedHook();
    }

    let onTrackEndedHook = null;

    function onMusicStopped(notifyQueue = true) {
        if (idleCameraLocked) return;
        idleCameraLocked = true;
        if (notifyQueue) notifyTrackEnded();
        dampLightsOnly();
        sceneApi.topScreen?.clear?.();
        sceneApi.background?.setReactivity?.(0);
        if (sceneApi.background?.mesh) sceneApi.background.mesh.visible = false;
        cameraCtrl.setAutoCut?.(false);
        cameraCtrl.pullToWide?.({ id: 'wide', duration: 2.8, graceMs: 120000 });
        syncTopScreenVisibility();
    }

    function onMusicStarted() {
        beatTrackEnded = false;
        beatEndAt = 0;
        if (sceneApi.background?.mesh) sceneApi.background.mesh.visible = false;
        sceneApi.background?.setReactivity?.(0);
        if (!idleCameraLocked && musicWasPlaying) return;
        idleCameraLocked = false;
        if (savedAutoCut.on) cameraCtrl.setAutoCut?.(true, savedAutoCut.beats);
    }

    function maybeBeatEndFinale(frame) {
        if (!frame?.afterLastBeat || songPan.endFxDone) return;
        if (songPan.trackId !== lastSpotifyTrackId) return;
        songPan.endFxDone = true;
        sceneApi.stageEffects?.burstBackFinale?.();
        for (let i = 0; i < 4; i++) {
            setTimeout(() => {
                fireworks.trigger(
                    { nickname: 'Finale', giftName: '🎆', coins: 500 },
                    { accent: ['#ffd23f', '#ff2d95', '#00e5ff', '#bc13fe'][i % 4] }
                );
            }, i * 700);
        }
    }

    function spotifyNearTrackEnd() {
        if (!songPan.durationMs) return false;
        const sp = audio.getSpotifyProgress?.();
        const prog = sp?.progressMs ?? 0;
        return prog >= Math.max(0, songPan.durationMs - 2500);
    }

    function handleBeatTrackEnd(frame, now) {
        if (!frame?.afterLastBeat || beatTrackEnded) return;
        if (!beatEndAt) beatEndAt = now;
        // Beat map often ends before the real track — only kill camera/screen at true end
        dampLightsOnly();
        if (!spotifyNearTrackEnd() && frame.playing) return;
        if (now - beatEndAt < 900) return;
        beatTrackEnded = true;
        audio.syncSpotifyProgress?.(audio.getSpotifyProgress?.()?.progressMs || 0, false);
        onMusicStopped(true);
    }

    function handleSpotifyProgress(progressMs, playing) {
        const dur = songPan.durationMs || 0;
        const endedByProgress = dur > 0 && progressMs >= Math.max(0, dur - 800);
        const live = !!playing && !endedByProgress;
        audio.syncSpotifyProgress?.(progressMs, live);
        if (live) {
            if (!musicWasPlaying) onMusicStarted();
            maybeMidSongPan(progressMs);
            musicWasPlaying = true;
        } else if (musicWasPlaying) {
            musicWasPlaying = false;
            onMusicStopped(true);
        }
    }

    const sceneApi = createDanceScene(viewport, {
        palette: opts.palette || 'neon',
        background: opts.background || 'retrowave',
        lightThrottle: opts.lightThrottle !== false,
        useLedWorker: opts.useLedWorker !== false,
        useStageFxWorker: opts.useStageFxWorker !== false
    });

    const cameraCtrl = createCameraController(sceneApi.camera, sceneApi.renderer.domElement);
    const dancers = [];
    cameraCtrl.setDancers(dancers);

    const audio = createAudioEngine({
        bpm: opts.bpm || 128,
        useBeatWorker: opts.useBeatWorker !== false
    });

    function showToast(text) {
        if (typeof opts.onToast === 'function') opts.onToast(text);
    }

    const fireworks = createGiftFireworks(document.getElementById('dcApp'));

    const giftSystem = createGiftEffectSystem({
        cameraCtrl,
        dancers,
        sceneApi,
        onToast: showToast,
        fireworks,
        onDancerAdded: () => {
            cameraCtrl.setDancers(dancers);
            if (typeof opts.onDancerAdded === 'function') opts.onDancerAdded();
        }
    });
    attachGiftApi(giftSystem);

    cameraCtrl.setShot(opts.shot || 'wide', { instant: true });

    if (opts.autoCut) cameraCtrl.setAutoCut(true, opts.autoCutBeats || 16);
    if (opts.bgAuto) {
        sceneApi.background.setAutoCycle(true, opts.bgAutoBeats || 16);
        sceneApi.setPaletteAuto(true);
        sceneApi.setPatternAuto(true);
    }

  function toggleMusic() {
        const st = audio.getStatus();
        if (st.playing && (st.mode === 'procedural' || st.mode === 'file' || st.mode === 'mic')) {
            if (st.mode === 'procedural') audio.stop();
            else audio.togglePlay();
        } else if (st.mode === 'youtube') {
            audio.togglePlay();
        } else {
            audio.startProcedural();
        }
    }

    async function applyCommand(command, args = []) {
        const a = args;
        switch (command) {
            case 'togglePlay':
            case 'toggleMusic':
                toggleMusic();
                break;
            case 'startProcedural':
                audio.startProcedural();
                break;
            case 'stop':
                audio.stop();
                break;
            case 'setBpm':
                audio.setBpm(a[0]);
                break;
            case 'setBpmLocked':
                audio.setBpmLocked(!!a[0]);
                break;
            case 'setBeatDivision':
                audio.setBeatDivision(a[0]);
                break;
            case 'setSensitivity':
                audio.setSensitivity(a[0]);
                break;
            case 'setStrongBeatThreshold':
                audio.setStrongBeatThreshold?.(a[0]);
                break;
            case 'setVolume':
                audio.setVolume(a[0]);
                break;
            case 'tapTempo':
                return audio.tapTempo();
            case 'resyncClock':
                audio.resyncClock();
                break;
            case 'loadYoutube': {
                const mount = document.getElementById('ytMount');
                const box = document.getElementById('dcYtBox');
                if (box) box.hidden = false;
                await audio.loadYouTube(a[0], mount);
                break;
            }
            case 'startMic':
                await audio.startMic();
                break;
            case 'pickFile': {
                const input = document.getElementById('dcAudioFile');
                if (input) input.click();
                break;
            }
            case 'pickQueueAdd': {
                const input = document.getElementById('dcAudioQueue');
                if (input) input.click();
                break;
            }
            case 'queuePlay':
                await audio.playPlaylistIndex?.(a[0]);
                break;
            case 'queueNext':
                audio.playNextInQueue?.();
                break;
            case 'queuePrev':
                audio.playPrevInQueue?.();
                break;
            case 'queueClear':
                audio.clearQueue?.();
                break;
            case 'queueRemove':
                audio.removeFromQueue?.(a[0]);
                break;
            case 'setPalette':
                sceneApi.setPalette(a[0]);
                break;
            case 'setPattern':
                sceneApi.setPattern(a[0]);
                break;
            case 'nextPattern':
                sceneApi.nextPattern();
                break;
            case 'nextPalette':
                sceneApi.nextPalette();
                break;
            case 'nextPaletteAndFx':
                sceneApi.nextPaletteAndFx?.();
                break;
            case 'setPaletteAuto':
                sceneApi.setPaletteAuto(!!a[0], a[1]);
                break;
            case 'setPatternAuto':
                sceneApi.setPatternAuto(!!a[0], a[1]);
                break;
            case 'setDynamicFx':
                sceneApi.setDynamicFx?.(a[0]);
                break;
            case 'nextDynamicFx':
                sceneApi.nextDynamicFx?.();
                break;
            case 'setDynamicFxAuto':
                sceneApi.setDynamicFxAuto?.(!!a[0], a[1]);
                break;
            case 'setLightIntensity':
                sceneApi.rig.intensity = a[0];
                break;
            case 'setBeatReact':
                sceneApi.rig.beatReact = a[0];
                break;
            case 'setBeatReactive':
                sceneApi.setBeatReactive?.(!!a[0]);
                break;
            case 'setReactiveMode':
                sceneApi.setReactiveMode?.(a[0], a[1]);
                break;
            case 'setBoothBrand':
                await sceneApi.boothBrand?.setBrand({
                    text: a[0] ?? '',
                    logoUrl: a[1] ?? '',
                    accent: a[2]
                });
                break;
            case 'setStrobe':
                sceneApi.rig.strobeEnabled = !!a[0];
                break;
            case 'setLasers':
                sceneApi.rig.lasersEnabled = !!a[0];
                break;
            case 'setBeams':
                sceneApi.rig.beamsEnabled = !!a[0];
                break;
            case 'setBackground':
                sceneApi.background.setTheme(a[0]);
                break;
            case 'nextBackground':
                sceneApi.background.nextTheme();
                break;
            case 'setBgReactivity':
                sceneApi.background.setReactivity(a[0]);
                break;
            case 'setBgAutoCycle':
                sceneApi.background.setAutoCycle(!!a[0], a[1] || 16);
                if (a[0]) sceneApi.setReactiveMode?.('background', 'beats');
                break;
            case 'setVenue':
                sceneApi.applyVenue?.(a[0]);
                break;
            case 'nextVenue':
                sceneApi.nextVenue?.();
                break;
            case 'setVenueAuto':
                sceneApi.setVenueAuto?.(!!a[0], a[1]);
                break;
            case 'setStageShape':
                sceneApi.setStageShape?.(a[0]);
                break;
            case 'setVideoBackdrop':
                await sceneApi.setVideoBackdrop?.(a[0]);
                break;
            case 'clearVideoBackdrop':
                sceneApi.clearVideoBackdrop?.();
                break;
            case 'pickVideoBackdrop': {
                const input = document.getElementById('dcVideoFile');
                if (input) input.click();
                break;
            }
            case 'setStageEffect':
                if (sceneApi.stageEffects) {
                    sceneApi.stageEffects.setEffect(a[0], a[1] !== false);
                }
                break;
            case 'setStageFxAuto':
                sceneApi.stageEffects?.setAuto(!!a[0]);
                break;
            case 'setSmokeEnabled':
                sceneApi.stageEffects?.setSmokeEnabled(!!a[0]);
                break;
            case 'setSmokeOnSongChange':
                sceneApi.stageEffects?.setSmokeOnSongChange(!!a[0]);
                break;
            case 'releaseSmoke':
                sceneApi.stageEffects?.burstSmoke?.(a[0] || 60);
                break;
            case 'setShot':
                cameraCtrl.setShot(a[0]);
                break;
            case 'nextShot':
                cameraCtrl.nextShot();
                break;
            case 'setAutoCut':
                cameraCtrl.setAutoCut(!!a[0], a[1]);
                break;
            case 'setBeatCutReactive':
                cameraCtrl.setBeatCutReactive(!!a[0]);
                break;
            case 'setBeatCutMode':
                cameraCtrl.setBeatCutMode?.(a[0]);
                break;
            case 'setBeatShakeEnabled':
                cameraCtrl.setBeatShakeEnabled(!!a[0]);
                break;
            case 'setBeatShake':
                cameraCtrl.setBeatShake(a[0]);
                break;
            case 'setCameraStabilized':
                cameraCtrl.setCameraStabilized(!!a[0]);
                break;
            case 'setStageYoutube': {
                try {
                    const ok = await sceneApi.setStageYoutube?.(a[0], {
                        ...(a[1] || {}),
                        visualMuted: true
                    });
                    if (ok) {
                        cameraCtrl.setCameraStabilized(true, { shotId: 'wide', duration: 1.5 });
                        // Sound via music engine (same YouTube id) so volume + Music pill work
                        try {
                            const mount = document.getElementById('ytMount');
                            const box = document.getElementById('dcYtBox');
                            if (box) box.hidden = false;
                            await audio.loadYouTube(a[0], mount);
                            audio.setYouTubeVolume?.(1);
                            stageMediaOwnsAudio = true;
                            showToast('▶ ฉาย YouTube + เสียง');
                        } catch {
                            stageMediaOwnsAudio = false;
                            sceneApi.stageYoutube?.tryUnmute?.();
                            showToast('▶ ฉาย YouTube (คลิกปุ่มเสียงบนจอถ้าเงียบ)');
                        }
                    } else {
                        showToast('❌ โหลด YouTube ไม่สำเร็จ');
                    }
                } catch (err) {
                    showToast('❌ ' + (err?.message || 'โหลด YouTube ไม่สำเร็จ'));
                }
                break;
            }
            case 'setStageLocalVideo': {
                try {
                    if (stageMediaOwnsAudio) {
                        try { audio.stop(); } catch { /* ignore */ }
                        stageMediaOwnsAudio = false;
                    }
                    const ok = await sceneApi.setStageLocalVideo?.(a[0], a[1] || {});
                    if (ok) {
                        cameraCtrl.setCameraStabilized(true, { shotId: 'wide', duration: 1.5 });
                        showToast('▶ ฉายวิดีโอบนจอเวที');
                    } else {
                        showToast('❌ โหลดวิดีโอไม่สำเร็จ');
                    }
                } catch (err) {
                    showToast('❌ ' + (err?.message || 'โหลดวิดีโอไม่สำเร็จ'));
                }
                break;
            }
            case 'clearStageYoutube':
            case 'clearStageMedia':
                sceneApi.clearStageYoutube?.();
                if (stageMediaOwnsAudio) {
                    try { audio.stop(); } catch { /* ignore */ }
                    stageMediaOwnsAudio = false;
                    const box = document.getElementById('dcYtBox');
                    if (box) box.hidden = true;
                }
                cameraCtrl.setCameraStabilized(false, { duration: 1.6 });
                showToast('หยุดวิดีโอบนจอเวที');
                break;
            case 'setStageYoutubeLightMask':
                if (sceneApi.getStageYoutubeState?.().active) {
                    sceneApi.applyStageYoutubeLightPreset?.('custom', a[0] || {});
                } else {
                    sceneApi.setLightMask?.(a[0] || {});
                }
                break;
            case 'setStageYoutubeLightPreset':
                if (sceneApi.getStageYoutubeState?.().active) {
                    sceneApi.applyStageYoutubeLightPreset?.(a[0], a[1]);
                }
                break;
            case 'selectDancer':
                giftSystem.setSelected(a[0]);
                break;
            case 'mockGift':
                giftSystem.mockRandomGift();
                break;
            case 'triggerGift':
                giftSystem.triggerGift(a[0] || {});
                break;
            case 'tiktokGift':
                giftSystem.handleTikTokGift(a[0] || {}, a[1]);
                break;
            case 'firework':
                fireworks.trigger(a[0] || {}, a[1]);
                break;
            case 'focusSelected': {
                const id = a[0] || giftSystem.getSelected();
                const d = dancers.find((x) => x.profile.id === id);
                if (d) cameraCtrl.focusOn(() => d.getWorldFocusPoint(), { duration: 4 });
                break;
            }
            case 'focusDancer':
                giftSystem.setSelected(a[0]);
                giftSystem.triggerGift({ dancerId: a[0], effect: 'float_camera', giftName: 'Spotlight', coins: 0, from: 'Host' });
                break;
            case 'setNameTags':
                dancers.forEach((d) => d.setNameTagVisible(!!a[0]));
                break;
            case 'setFaceMode':
                dancers.forEach((d) => d.setFaceMode(a[0]));
                break;
            case 'forceMove':
                forcedMove = a[0] || null;
                dancers.forEach((d) => d.setForcedMove(forcedMove));
                break;
            case 'spotifyBeatMap': {
                const track = a[0] || {};
                const beatMap = track.beatMap || null;
                if (!beatMap?.beats?.length || track.id !== lastSpotifyTrackId) return true;
                if (lastSpotifyHadBeatMap) return true;
                lastSpotifyHadBeatMap = true;
                const seq = songChangeSeq;
                const progress = track.progressMs ?? audio.getSpotifyProgress?.()?.progressMs ?? 0;
                runWhenIdle(() => {
                    if (seq !== songChangeSeq) return;
                    audio.upgradeSpotifyBeatMap(beatMap, progress, track.bpm);
                }, 32);
                break;
            }
            case 'spotifyNowPlaying': {
                const track = a[0] || {};
                const title = track.name || 'Unknown';
                const artist = track.artist || '';
                const bannerText = artist ? `${title} — ${artist}` : title;
                const isYt = track.provider === 'youtube'
                    || !!track.videoId
                    || String(track.uri || '').startsWith('youtube:');
                const trackId = track.id || track.videoId || `${title}::${artist}`;
                const now = performance.now();

                if (
                    trackId === lastSpotifyEventId
                    && now - lastSpotifyEventAt < 180
                ) {
                    if (track.progressMs != null) {
                        const dur = track.durationMs || songPan.durationMs || 0;
                        const live = track.playing !== false
                            && !(dur > 0 && track.progressMs >= Math.max(0, dur - 800));
                        audio.syncSpotifyProgress(track.progressMs, live);
                    }
                    return true;
                }
                lastSpotifyEventAt = now;
                lastSpotifyEventId = trackId;

                const isNewTrack = trackId !== lastSpotifyTrackId;

                if (!isNewTrack) {
                    if (track.progressMs != null) {
                        const dur = track.durationMs || songPan.durationMs || 0;
                        const live = track.playing !== false
                            && !(dur > 0 && track.progressMs >= Math.max(0, dur - 800));
                        audio.syncSpotifyProgress(track.progressMs, live);
                        if (!live && musicWasPlaying) {
                            musicWasPlaying = false;
                            onMusicStopped(true);
                        }
                    }
                    if (track.durationMs) songPan.durationMs = track.durationMs;
                    return true;
                }

                lastSpotifyTrackId = trackId;
                lastSpotifyHadBeatMap = false;
                const seq = ++songChangeSeq;
                const syncLabel = bannerText;
                const syncBpm = track.bpm || (isYt ? 128 : null);
                const syncProgress = track.progressMs || 0;
                const durationSec = track.durationMs ? track.durationMs / 1000 : 180;

                void sceneApi.topScreen?.show({
                    title,
                    artist,
                    albumArt: track.albumArt,
                    requester: track.requester || (isYt ? 'YouTube' : 'Spotify'),
                    duration: durationSec,
                    accent: isYt ? '#ff4d4d' : '#1DB954',
                    keepOn: true
                });

                runWhenIdle(() => {
                    if (seq !== songChangeSeq) return;
                    audio.startSpotifySync(
                        syncLabel,
                        syncBpm,
                        null,
                        syncProgress,
                        track.durationMs || 0,
                        { source: isYt ? 'youtube' : 'spotify' }
                    );
                    songPan = {
                        trackId,
                        durationMs: track.durationMs || 0,
                        midDone: false,
                        endFxDone: false
                    };
                    sceneApi.stageEffects?.onSongChange?.();
                    sceneApi.stageEffects?.releaseSmokeOnSongChange?.();
                    void giftSystem.onSongChanged?.();
                    sceneApi.rig.flashTier = 0;
                    sceneApi.rig.fxMoodStreak = 0;
                    sceneApi.rig.fxBarsHeld = 0;
                    sceneApi.rig.lastFxMood = 'groove';
                    sceneApi.rig.lastBeatIndex = -1;
                    beatTrackEnded = false;
                    beatEndAt = 0;
                    sceneApi.nextIntelligentFx?.({ beatDensity: 0, bpm: syncBpm, playing: true });
                    idleCameraLocked = false;
                    musicWasPlaying = true;
                    if (savedAutoCut.on) cameraCtrl.setAutoCut?.(true, savedAutoCut.beats);
                    panToSongScreen({ seq });
                    syncTopScreenVisibility();
                    onMusicStarted();
                }, 16);
                break;
            }
            default:
                return false;
        }
        return true;
    }

    function getState() {
        const audioSt = audio.getStatus();
        return {
            playing: audioSt.playing,
            audioMode: audioSt.mode,
            audioLabel: audioSt.label,
            bpm: audioSt.bpm,
            bpmLocked: audioSt.bpmLocked,
            beatDivision: audioSt.beatDivision,
            shot: cameraCtrl.shotId,
            autoCut: cameraCtrl.autoCut,
            beatCutReactive: cameraCtrl.beatCutReactive,
            beatShakeEnabled: cameraCtrl.beatShakeEnabled,
            cameraStabilized: cameraCtrl.cameraStabilized,
            stageYoutube: sceneApi.getStageYoutubeState?.(),
            lightMask: sceneApi.getLightMask?.(),
            beatReactive: sceneApi.rig?.beatReactive,
            reactiveModes: sceneApi.getReactiveModes?.(),
            beatCutMode: cameraCtrl.beatCutReactive === false
                ? (cameraCtrl.autoCut ? 'beats' : 'off')
                : (cameraCtrl.autoCut ? 'ai' : 'off'),
            brandText: sceneApi.boothBrand?.text || '',
            smokeEnabled: sceneApi.stageEffects?.smokeEnabled,
            smokeOnSongChange: sceneApi.stageEffects?.smokeOnSongChange,
            giftQueue: giftSystem.pending,
            palette: sceneApi.getPaletteId?.() || 'neon',
            pattern: sceneApi.rig?.pattern,
            dynamicFx: sceneApi.rig?.dynamicFx,
            autoDynamicFx: sceneApi.rig?.autoDynamicFx,
            autoPalette: sceneApi.rig?.autoPalette,
            autoPattern: sceneApi.rig?.autoPattern,
            background: sceneApi.background.currentTheme().id,
            bgAuto: sceneApi.background.autoCycle,
            venue: sceneApi.getVenueId?.() || 'neon_club',
            venueAuto: sceneApi.getVenueAuto?.() ?? false,
            stageShape: sceneApi.getStageShape?.() || 'classic',
            videoBackdrop: !!sceneApi.videoBackdrop?.active,
            selectedDancer: giftSystem.getSelected(),
            forcedMove,
            volume: null,
            queue: audio.getQueue?.() || { items: [], index: -1, length: 0 }
        };
    }

    let last = performance.now();
    let pillClock = 0;
    let raf = 0;
    let sepFrame = 0;
    let lodFrame = 0;
    let lastCrowd = -1;

    giftSystem.syncClubStats?.();

    function startLoop() {
        cancelAnimationFrame(raf);
        const loop = (now) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const time = now * 0.001;
            const frame = audio.update();

            sceneApi.applyAudioLights(frame, dt, time);

            const n = dancers.length;
            if (n !== lastCrowd) {
                lastCrowd = n;
                setCrowdSize(n);
                sceneApi.setCrowdLevel?.(n);
            }

            const stride = crowdLodStride();
            lodFrame = (lodFrame + 1) | 0;
            dancers.forEach((d, i) => {
                const busy = d.tween || d.floatOffset || d.forcedMove || d.dropSpawn || d.onDjBooth;
                d._lodSkip = n > 18 && !busy && ((i + lodFrame) % stride) !== 0;
                d.update(time, frame);
            });

            sepFrame = (sepFrame + 1) | 0;
            const anyTween = dancers.some((d) => d.tween);
            const sepEvery = n > 80 ? 6 : n > 30 ? 3 : n > 18 ? 2 : 1;
            // Skip separation while formation tweens run — prevents mid-move corner piles
            if (!anyTween && n > 1 && n <= 150 && (sepFrame % sepEvery) === 0) {
                applyRuntimeSeparation(dancers, dt * sepEvery);
            }
            giftSystem.update(dt);
            cameraCtrl.update(dt, frame);
            syncTopScreenVisibility();

            if (frame.playing) {
                if (!musicWasPlaying) onMusicStarted();
                musicWasPlaying = true;
                maybeBeatEndFinale(frame);
                handleBeatTrackEnd(frame, now);
                if (!frame.afterLastBeat) beatEndAt = 0;
                const spProg = audio.getSpotifyProgress?.();
                if (spProg?.playing) {
                    // Local clock can run past track end when Song Request owns playback
                    if (songPan.durationMs && spProg.progressMs >= Math.max(0, songPan.durationMs - 1200)) {
                        audio.syncSpotifyProgress?.(spProg.progressMs, false);
                        if (musicWasPlaying) {
                            musicWasPlaying = false;
                            onMusicStopped(true);
                        }
                    } else {
                        maybeMidSongPan(spProg.progressMs);
                    }
                }
            } else if (musicWasPlaying) {
                musicWasPlaying = false;
                onMusicStopped(true);
            }

            pillClock += dt;
            if (pillClock > 0.15) {
                pillClock = 0;
                if (typeof opts.onFrame === 'function') opts.onFrame(frame, audio.getStatus());
            }

            if (sceneApi.renderFrame) sceneApi.renderFrame();
            else sceneApi.composer.render();
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
    }

    function stopLoop() {
        cancelAnimationFrame(raf);
    }

    return {
        sceneApi,
        cameraCtrl,
        dancers,
        audio,
        giftSystem,
        fireworks,
        profiles: DEMO_DANCERS,
        showToast,
        toggleMusic,
        applyCommand,
        getState,
        handleSpotifyProgress,
        setOnTrackEnded(fn) { onTrackEndedHook = typeof fn === 'function' ? fn : null; },
        startLoop,
        stopLoop,
        get forcedMove() { return forcedMove; }
    };
}

export { CAMERA_SHOTS, DEMO_DANCERS, avatarUrl };
