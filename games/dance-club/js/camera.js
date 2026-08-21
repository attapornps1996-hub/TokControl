/**
 * Camera director — preset shots, smooth transitions, beat-reactive cuts.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA_SHOTS, SHOT_IDS } from './camera-shots.js';

export { CAMERA_SHOTS, SHOT_IDS };

const SCREEN_SHOT_IDS = new Set(['topScreen', 'topScreenPush', 'stageYt']);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothDamp = (dt, lambda) => 1 - Math.exp(-lambda * dt);

export function createCameraController(camera, domElement, opts = {}) {
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 60;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 3, -2);
    controls.enabled = false;

    const state = {
        shotId: 'wide',
        shot: CAMERA_SHOTS[0],
        elapsed: 0,
        transition: null,
        focus: null,
        autoCut: false,
        autoCutBeats: 16,
        beatCutReactive: true,
        beatCutCounter: 0,
        beatShakeEnabled: true,
        stabilized: false,
        savedStabilize: null,
        shakeAmount: 0,
        beatShake: 0,
        shakePulse: 0,
        shakeSmooth: new THREE.Vector3(),
        beatSmooth: 0,
        lastBeatIndex: -1,
        lastCutAt: 0,
        cutGraceUntil: 0,
        songIntro: null,
        screenPanOutUntil: 0,
        droneOrbitOnce: null,
        randomTargetPoint: new THREE.Vector3(0, 2.6, -2),
        roll: 0,
        listeners: []
    };

    const current = {
        pos: new THREE.Vector3().fromArray(CAMERA_SHOTS[0].pos),
        look: new THREE.Vector3().fromArray(CAMERA_SHOTS[0].look),
        fov: CAMERA_SHOTS[0].fov
    };
    camera.position.copy(current.pos);
    camera.lookAt(current.look);

    const tmpPos = new THREE.Vector3();
    const tmpLook = new THREE.Vector3();
    const shakeVec = new THREE.Vector3();
    const posePos = new THREE.Vector3();
    const poseLook = new THREE.Vector3();

    let dancersRef = [];
    function setDancers(list) {
        dancersRef = list || [];
    }

    function shotById(id) {
        return CAMERA_SHOTS.find((s) => s.id === id) || CAMERA_SHOTS[0];
    }

    function emit() {
        state.listeners.forEach((fn) => fn(state.shotId, state.shot));
    }
    function onShotChange(fn) {
        state.listeners.push(fn);
        return () => {
            const i = state.listeners.indexOf(fn);
            if (i >= 0) state.listeners.splice(i, 1);
        };
    }

    function shotPose(shot, elapsed, audio = {}) {
        if (shot.free) {
            return { pos: camera.position.clone(), look: controls.target.clone(), fov: shot.fov, roll: 0 };
        }
        posePos.set(shot.pos[0], shot.pos[1], shot.pos[2]);
        poseLook.set(shot.look[0], shot.look[1], shot.look[2]);
        let roll = shot.roll || 0;
        const mv = shot.move;
        const bass = audio.bass || 0;

        if (!state.stabilized && mv) {
            const ph = elapsed * mv.speed * Math.PI * 2;
            switch (mv.type) {
                case 'drift':
                    posePos.x += Math.sin(ph) * mv.amp;
                    posePos.y += Math.cos(ph * 0.7) * mv.amp * 0.18;
                    poseLook.x += Math.sin(ph + 1) * 0.6;
                    break;
                case 'dolly':
                    posePos.x += Math.sin(ph) * mv.amp;
                    posePos.z += Math.cos(ph) * mv.amp * 0.25;
                    break;
                case 'crane':
                    posePos.y -= (Math.sin(ph) * 0.5 + 0.5) * mv.amp;
                    posePos.z -= Math.sin(ph) * 2.2;
                    break;
                case 'handheld':
                    posePos.x += Math.sin(ph * 1.7) * mv.amp;
                    posePos.y += Math.sin(ph * 2.3) * mv.amp * 0.7;
                    posePos.z += Math.cos(ph * 1.3) * mv.amp * 0.5;
                    roll += Math.sin(ph * 0.9) * 0.02;
                    break;
                case 'rollSway':
                    roll += Math.sin(ph) * mv.amp;
                    posePos.x += Math.sin(ph * 0.6) * 1.6;
                    break;
                case 'spinTop': {
                    const a = elapsed * mv.speed;
                    posePos.x = Math.sin(a) * mv.amp;
                    posePos.z = 4.5 + Math.cos(a) * mv.amp;
                    break;
                }
                case 'orbitArc': {
                    const a = elapsed * mv.speed;
                    const r = Math.hypot(shot.pos[0], shot.pos[2]);
                    const base = Math.atan2(shot.pos[2], shot.pos[0]);
                    posePos.x = Math.cos(base + Math.sin(a) * mv.amp) * r;
                    posePos.z = Math.sin(base + Math.sin(a) * mv.amp) * r;
                    break;
                }
                case 'droneOrbit': {
                    const r = mv.amp || 28;
                    const yBase = shot.pos[1] || 14;
                    let prog;
                    if (state.droneOrbitOnce && state.droneOrbitOnce.shotId === shot.id) {
                        prog = Math.min(1, elapsed / state.droneOrbitOnce.orbitSec);
                    } else {
                        prog = (elapsed * mv.speed) % 1;
                    }
                    const a = prog * Math.PI * 2;
                    posePos.x = Math.cos(a) * r;
                    posePos.z = Math.sin(a) * r;
                    posePos.y = yBase + Math.sin(a * 0.5) * 2.2;
                    poseLook.set(0, 2.2, 0);
                    break;
                }
                default:
                    break;
            }
        }

        if (shot.randomTarget) {
            poseLook.copy(state.randomTargetPoint);
            const dir = new THREE.Vector3(0, 0.55, 1).normalize();
            posePos.copy(state.randomTargetPoint).addScaledVector(dir, 7.2);
            posePos.y = Math.max(1.8, state.randomTargetPoint.y + 0.6);
        }

        if (!state.stabilized) {
            posePos.lerp(poseLook, Math.min(0.08, bass * 0.06));
        }

        return { pos: posePos.clone(), look: poseLook.clone(), fov: shot.fov, roll: state.stabilized ? 0 : roll };
    }

    function pickRandomTarget() {
        if (!dancersRef.length) return;
        const d = dancersRef[Math.floor(Math.random() * dancersRef.length)];
        state.randomTargetPoint.copy(d.getWorldFocusPoint());
    }

    function setShot(id, o = {}) {
        const shot = shotById(id);
        const dur = o.instant ? 0 : (o.duration ?? (shot.free ? 1.35 : 2.4));

        if (!o.keepDroneOrbit) state.droneOrbitOnce = null;

        if (shot.randomTarget) pickRandomTarget();

        if (shot.free) {
            controls.target.copy(current.look);
            controls.enabled = true;
        } else {
            controls.enabled = false;
        }

        state.shotId = shot.id;
        state.shot = shot;
        state.elapsed = 0;
        state.focus = null;

        if (dur <= 0 || shot.free) {
            state.transition = null;
            if (shot.free) {
                camera.fov = shot.fov;
                camera.updateProjectionMatrix();
            }
        } else {
            const target = shotPose(shot, 0);
            state.transition = {
                fromPos: current.pos.clone(),
                fromLook: current.look.clone(),
                fromFov: current.fov,
                fromRoll: state.roll,
                toPos: target.pos,
                toLook: target.look,
                toFov: target.fov,
                toRoll: target.roll,
                t: 0,
                dur
            };
        }
        emit();
        return shot;
    }

    /** Far pull-back then push in + crane up toward the top now-playing screen */
    function playSongIntro(o = {}) {
        state.focus = null;
        state.screenPanOutUntil = 0;
        state.songIntro = {
            pushAt: performance.now() + (o.wideHold ?? 3.6) * 1000,
            getFocus: o.getFocusPoint || null,
            onReveal: o.onReveal || null,
            onAtScreen: o.onAtScreen || null,
            atScreenFired: false,
            pushDoneAt: 0,
            pushDuration: o.pushDuration ?? 2.8,
            holdDuration: o.holdDuration ?? 3.2,
            releaseAt: 0,
            releaseTransition: o.releaseTransition ?? 2.6,
            phase: 'wide'
        };
        state.cutGraceUntil = performance.now() + (o.graceMs ?? 10000);
        return setShot(o.wideId || 'far', { duration: o.wideDuration ?? 3.8 });
    }

    /** Quick pan to ceiling screen from current angle — mid-song peek */
    function playSongScreenPeek(o = {}) {
        state.focus = null;
        state.screenPanOutUntil = 0;
        const pushDur = o.pushDuration ?? 2.0;
        const holdDur = o.holdDuration ?? 2.6;
        const now = performance.now();
        state.songIntro = {
            pushAt: now,
            getFocus: o.getFocusPoint || null,
            onReveal: o.onReveal || null,
            onAtScreen: o.onAtScreen || null,
            atScreenFired: false,
            pushDoneAt: now + pushDur * 1000,
            pushDuration: pushDur,
            holdDuration: holdDur,
            releaseAt: now + (pushDur + holdDur) * 1000,
            releaseTransition: o.releaseTransition ?? 2.4,
            phase: 'push'
        };
        state.cutGraceUntil = now + (o.graceMs ?? 9000);
        if (o.onReveal) o.onReveal();
        return setShot('topScreenPush', { duration: pushDur });
    }

    function isScreenPanActive() {
        const now = performance.now();
        if (now < state.screenPanOutUntil) return true;
        if (state.songIntro) return true;
        return SCREEN_SHOT_IDS.has(state.shotId);
    }

    /** One full drone orbit then return to a normal shot */
    function playDroneOrbitOnce(o = {}) {
        state.focus = null;
        state.songIntro = null;
        const id = o.id || 'drone';
        const shot = shotById(id);
        const mv = shot.move || {};
        const orbitSec = Math.max(0.8, Number(o.duration) || (1 / (mv.speed || 0.12)));
        const releaseDuration = o.releaseDuration ?? 2.4;
        const now = performance.now();
        state.droneOrbitOnce = {
            shotId: id,
            orbitSec,
            releaseId: o.releaseId || 'wide',
            releaseDuration,
            releaseAt: now + orbitSec * 1000
        };
        state.cutGraceUntil = now + (orbitSec + releaseDuration) * 1000 + 4000;
        return setShot(id, { duration: Math.min(2.2, orbitSec * 0.4), keepDroneOrbit: true });
    }

    /** Smooth pull to wide/far angle */
    function pullToWide(o = {}) {
        state.focus = null;
        state.cutGraceUntil = performance.now() + (o.graceMs ?? 5000);
        const id = o.id || 'far';
        return setShot(id, { duration: o.duration ?? 3.6 });
    }

    function nextShot() {
        const list = CAMERA_SHOTS.filter((s) => !s.free);
        const i = list.findIndex((s) => s.id === state.shotId);
        return setShot(list[(i + 1) % list.length].id);
    }

    function randomShot() {
        const list = CAMERA_SHOTS.filter((s) => !s.free && s.id !== state.shotId
            && !s.id.startsWith('runway') && !SCREEN_SHOT_IDS.has(s.id));
        return setShot(list[Math.floor(Math.random() * list.length)].id, { duration: 2.4 });
    }

    function focusOn(getPoint, { duration = 3.4, distance = 6.4, height = 0.5 } = {}) {
        state.focus = {
            getPoint,
            until: performance.now() + duration * 1000,
            distance,
            height,
            blend: 0
        };
        controls.enabled = false;
    }

    function releaseFocus() {
        if (!state.focus) return;
        state.focus = null;
        setShot(state.shotId, { duration: 1.85 });
    }

    function setAutoCut(on, beats) {
        state.autoCut = !!on;
        state.autoCutBeats = Math.max(1, Number(beats) || 16);
        state.beatCutCounter = 0;
    }

    function setBeatCutReactive(on) {
        state.beatCutReactive = !!on;
        state.beatCutCounter = 0;
    }

    function setBeatCutMode(mode) {
        const m = mode === 'beats' ? 'beats' : mode === 'off' ? 'off' : 'ai';
        state.autoCut = m !== 'off';
        state.beatCutReactive = m === 'ai';
        state.beatCutCounter = 0;
    }

    function setCameraStabilized(on, opts = {}) {
        const enable = !!on;

        if (enable) {
            if (!state.stabilized) {
                state.savedStabilize = {
                    autoCut: state.autoCut,
                    beatCutReactive: state.beatCutReactive,
                    beatShakeEnabled: state.beatShakeEnabled,
                    beatShake: state.beatShake,
                    shotId: state.shotId
                };
            }
            state.stabilized = true;
            state.focus = null;
            state.songIntro = null;
            state.screenPanOutUntil = 0;
            setBeatShakeEnabled(false);
            setBeatShake(0);
            state.autoCut = false;
            state.beatCutReactive = false;
            state.shakeSmooth.set(0, 0, 0);
            state.roll = 0;
            setShot(opts.shotId || 'wide', { duration: opts.duration ?? 1.2 });
        } else if (state.stabilized) {
            state.stabilized = false;
            const saved = state.savedStabilize;
            state.savedStabilize = null;
            if (saved) {
                setBeatShakeEnabled(saved.beatShakeEnabled);
                setBeatShake(saved.beatShake);
                state.autoCut = saved.autoCut;
                state.beatCutReactive = saved.beatCutReactive;
                if (saved.shotId && saved.shotId !== state.shotId) {
                    setShot(saved.shotId, { duration: opts.duration ?? 1.6 });
                }
            }
        }
    }

    function setBeatShake(v) {
        state.beatShake = Math.max(0, Math.min(2, Number(v) || 0));
    }

    function setBeatShakeEnabled(on) {
        state.beatShakeEnabled = !!on;
        if (!on) {
            state.shakeAmount = 0;
            state.shakePulse = 0;
            state.shakeSmooth.set(0, 0, 0);
        }
    }

    function update(dt, audio = {}) {
        state.elapsed += dt;
        const beatIndex = audio.beatIndex || 0;
        const now = performance.now();

        state.beatSmooth += ((audio.beat || 0) - state.beatSmooth) * smoothDamp(dt, 8);

        if (state.stabilized) {
            state.shakePulse = 0;
            state.shakeAmount = 0;
        } else if (beatIndex !== state.lastBeatIndex) {
            state.lastBeatIndex = beatIndex;
            if (state.beatShakeEnabled && state.beatShake > 0 && audio.strongHit) {
                state.shakePulse = Math.min(1, state.shakePulse + 0.65);
            }
            if (state.shot.randomTarget && beatIndex % 8 === 0) pickRandomTarget();
        }

        state.shakePulse *= Math.pow(0.0004, dt);
        state.shakeAmount = state.stabilized ? 0 : state.shakePulse;

        if (!state.stabilized && state.droneOrbitOnce) {
            const d = state.droneOrbitOnce;
            if (now >= d.releaseAt) {
                const releaseId = d.releaseId;
                const releaseDuration = d.releaseDuration;
                state.droneOrbitOnce = null;
                setShot(releaseId, { duration: releaseDuration });
            }
        }

        if (!state.stabilized && state.songIntro) {
            const si = state.songIntro;
            if (si.phase === 'wide' && now >= si.pushAt) {
                si.phase = 'push';
                si.pushDoneAt = now + si.pushDuration * 1000;
                si.releaseAt = si.pushDoneAt + si.holdDuration * 1000;
                if (si.onReveal) si.onReveal();
                setShot('topScreenPush', { duration: si.pushDuration });
            } else if (si.phase === 'push' && !si.atScreenFired && now >= si.pushDoneAt) {
                si.atScreenFired = true;
                if (si.onAtScreen) si.onAtScreen();
            } else if (si.phase === 'push' && now >= si.releaseAt) {
                state.screenPanOutUntil = now + (si.releaseTransition ?? 2.6) * 1000;
                state.songIntro = null;
                if (state.focus) releaseFocus();
                setShot('wide', { duration: si.releaseTransition ?? 2.6 });
            }
        }

        if (!state.stabilized && state.autoCut && audio.playing && !state.focus && !state.songIntro && now >= state.cutGraceUntil) {
            if (state.beatCutReactive !== false) {
                if (audio.strongHit && now - state.lastCutAt > 720) {
                    randomShot();
                    state.lastCutAt = now;
                }
            } else if (audio.hit) {
                state.beatCutCounter++;
                if (state.beatCutCounter >= state.autoCutBeats) {
                    state.beatCutCounter = 0;
                    randomShot();
                    state.lastCutAt = now;
                }
            }
        }

        if (state.focus && !state.stabilized) {
            if (performance.now() > state.focus.until) {
                releaseFocus();
            } else {
                const p = state.focus.getPoint();
                state.focus.blend = Math.min(1, state.focus.blend + dt / 0.85);
                const e = easeInOut(state.focus.blend);
                tmpLook.copy(p);
                tmpPos.set(p.x * 0.35, p.y + state.focus.height, p.z + state.focus.distance);
                const a = smoothDamp(dt, 5);
                current.pos.lerp(tmpPos, a);
                current.look.lerp(tmpLook, a);
                current.fov += (34 - current.fov) * a;
                state.roll += (0 - state.roll) * a;
                applyToCamera(dt, audio);
                return;
            }
        }

        if (state.shot.free) {
            controls.update();
            current.pos.copy(camera.position);
            current.look.copy(controls.target);
            current.fov = camera.fov;
            state.roll += (0 - state.roll) * smoothDamp(dt, 6);
            return;
        }

        const pose = shotPose(state.shot, state.elapsed, audio);
        const follow = state.stabilized ? 1 : smoothDamp(dt, state.transition ? 5.5 : 3.2);

        if (state.stabilized) {
            state.transition = null;
            current.pos.copy(pose.pos);
            current.look.copy(pose.look);
            current.fov = pose.fov;
            state.roll = 0;
        } else if (state.transition) {
            const tr = state.transition;
            tr.t = Math.min(1, tr.t + dt / tr.dur);
            const e = easeInOut(tr.t);
            current.pos.lerpVectors(tr.fromPos, pose.pos, e);
            current.look.lerpVectors(tr.fromLook, pose.look, e);
            current.fov = tr.fromFov + (pose.fov - tr.fromFov) * e;
            state.roll = tr.fromRoll + (pose.roll - tr.fromRoll) * e;
            if (tr.t >= 1) state.transition = null;
        } else {
            current.pos.lerp(pose.pos, follow);
            current.look.lerp(pose.look, follow);
            current.fov += (pose.fov - current.fov) * follow;
            state.roll += (pose.roll - state.roll) * follow;
        }

        applyToCamera(dt, audio);
    }

    function applyToCamera(dt, audio) {
        if (state.stabilized) {
            state.shakeSmooth.set(0, 0, 0);
            camera.position.copy(current.pos);
            camera.lookAt(current.look);
            camera.fov = current.fov;
            camera.updateProjectionMatrix();
            return;
        }

        const shake = state.shakeAmount * state.beatShake * 0.14;
        if (shake > 0.001 && state.beatShakeEnabled) {
            const ph = (audio.beatPhase || 0) * Math.PI * 2;
            const energy = audio.energy || state.beatSmooth || 0.4;
            shakeVec.set(
                Math.sin(ph * 2.0 + state.elapsed * 0.8) * shake * (0.5 + energy * 0.35),
                Math.abs(Math.sin(ph * 1.5 + state.elapsed * 0.6)) * shake * 0.4,
                Math.cos(ph * 1.7 + state.elapsed * 0.7) * shake * 0.2
            );
        } else {
            shakeVec.set(0, 0, 0);
        }

        const damp = smoothDamp(dt, 12);
        state.shakeSmooth.lerp(shakeVec, damp);

        camera.position.copy(current.pos).add(state.shakeSmooth);
        camera.lookAt(current.look);
        if (state.roll || state.shakeSmooth.x) {
            camera.rotateZ(state.roll + state.shakeSmooth.x * 0.04);
        }

        const fovPunch = state.beatShakeEnabled && state.beatShake > 0
            ? state.beatSmooth * 0.45
            : 0;
        const targetFov = current.fov - fovPunch;
        if (Math.abs(camera.fov - targetFov) > 0.02) {
            camera.fov += (targetFov - camera.fov) * damp;
            camera.updateProjectionMatrix();
        }
    }

    return {
        controls,
        shots: CAMERA_SHOTS,
        setShot,
        nextShot,
        randomShot,
        pullToWide,
        playDroneOrbitOnce,
        playSongIntro,
        playSongScreenPeek,
        isScreenPanActive,
        focusOn,
        releaseFocus,
        setAutoCut,
        setBeatCutReactive,
        setBeatCutMode,
        setBeatShake,
        setBeatShakeEnabled,
        setCameraStabilized,
        setDancers,
        onShotChange,
        update,
        get shotId() { return state.shotId; },
        get autoCut() { return state.autoCut; },
        get beatCutReactive() { return state.beatCutReactive; },
        get beatShakeEnabled() { return state.beatShakeEnabled; },
        get cameraStabilized() { return state.stabilized; },
        get isFocused() { return !!state.focus; },
        dispose() { controls.dispose(); }
    };
}
