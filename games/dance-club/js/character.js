/**
 * Mascot dancer — circular profile head, single-line limbs, mitten hands.
 * Limbs are 2-segment pivot chains so poses can bend at elbow / knee.
 */
import * as THREE from 'three';
import { avatarUrl } from './demo-data.js';
import { FLOOR, pickSpreadSpawnSlot, floorElevationAt } from './formation.js?v=form-scatter-1';
import { DANCE_MOVES, MOVE_IDS } from './dance-moves.js';

let _crowdSize = 0;

/** Called from runtime when dancer count changes — drives LOD tiers */
export function setCrowdSize(n) {
    _crowdSize = Math.max(0, n | 0);
}

export function getCrowdSize() {
    return _crowdSize;
}

/** How many frames between full pose updates per dancer */
export function crowdLodStride() {
    const n = _crowdSize;
    if (n > 400) return 6;
    if (n > 200) return 4;
    if (n > 80) return 3;
    if (n > 18) return 2;
    return 1;
}

export function crowdHeadOnly() {
    return false;
}

const LINE_COLOR = 0x1b1b22;
const _tmpVec = new THREE.Vector3();

/* ------------------------------------------------------------------ *
 * Head texture — avatar clipped into a circle with a cartoon outline
 * ------------------------------------------------------------------ */
function drawHeadCanvas(img, fillColor) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const r = size / 2;
    const inner = r - 18;

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, inner, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = fillColor;
    ctx.fillRect(0, 0, size, size);
    if (img) {
        const s = inner * 2;
        ctx.drawImage(img, r - inner, r - inner, s, s);
    }
    ctx.restore();

    ctx.lineWidth = 22;
    ctx.strokeStyle = '#17171d';
    ctx.beginPath();
    ctx.arc(r, r, inner, 0, Math.PI * 2);
    ctx.stroke();

    return canvas;
}

function makeHeadTexture(img, fillColor) {
    const tex = new THREE.CanvasTexture(drawHeadCanvas(img, fillColor));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

function loadImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/* ------------------------------------------------------------------ *
 * Limb helpers — thin capsule "lines" with pivot groups
 * ------------------------------------------------------------------ */
function lineMaterial() {
    return new THREE.MeshStandardMaterial({
        color: LINE_COLOR,
        roughness: 0.5,
        metalness: 0.05
    });
}

function segment(length, thickness, mat) {
    const geo = new THREE.CapsuleGeometry(thickness, length, 4, 10);
    geo.translate(0, -length / 2 - thickness, 0);
    return new THREE.Mesh(geo, mat);
}

/** Mitten / cloud hand — cluster of small spheres with white body */
function mittenHand(scale = 1) {
    const group = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({
        color: 0xfdfdfd,
        roughness: 0.45,
        metalness: 0.02
    });
    const outline = new THREE.MeshBasicMaterial({ color: LINE_COLOR, side: THREE.BackSide });

    const blobs = [
        [0, 0, 0, 0.13],
        [-0.09, 0.06, 0, 0.075],
        [0.09, 0.07, 0, 0.075],
        [0, 0.13, 0, 0.075],
        [-0.05, -0.09, 0, 0.065],
        [0.06, -0.08, 0, 0.065]
    ];
    blobs.forEach(([x, y, z, r]) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), white);
        s.position.set(x, y, z);
        group.add(s);
        const o = new THREE.Mesh(new THREE.SphereGeometry(r * 1.16, 12, 12), outline);
        o.position.set(x, y, z);
        group.add(o);
    });
    group.scale.setScalar(scale);
    return group;
}

/** Rounded shoe — half dome */
function shoe(color) {
    const group = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 })
    );
    mesh.scale.set(1.25, 0.95, 1.55);
    group.add(mesh);

    const out = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: LINE_COLOR, side: THREE.BackSide })
    );
    out.scale.set(1.38, 1.05, 1.68);
    group.add(out);
    return group;
}

/**
 * Two-segment limb.
 * @returns {{root:THREE.Group, joint:THREE.Group, tip:THREE.Group}}
 */
function buildLimb({ upper, lower, thickness, mat, tip }) {
    const root = new THREE.Group();
    const upperMesh = segment(upper, thickness, mat);
    root.add(upperMesh);

    const joint = new THREE.Group();
    joint.position.y = -(upper + thickness * 2);
    root.add(joint);

    const lowerMesh = segment(lower, thickness, mat);
    joint.add(lowerMesh);

    const tipHolder = new THREE.Group();
    tipHolder.position.y = -(lower + thickness * 2);
    joint.add(tipHolder);
    if (tip) tipHolder.add(tip);

    return { root, joint, tip: tipHolder };
}

/* ------------------------------------------------------------------ *
 * Cartoon face overlay (used when mascot mode / no avatar)
 * ------------------------------------------------------------------ */
function buildFace(radius) {
    const group = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({ color: 0x15151b });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const eye = (sign) => {
        const g = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.19, 24), dark);
        ball.scale.y = 1.45;
        g.add(ball);
        const gleam = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.07, 16), white);
        gleam.position.set(-radius * 0.05, radius * 0.12, 0.002);
        gleam.scale.y = 1.4;
        g.add(gleam);
        g.position.set(sign * radius * 0.32, radius * 0.12, 0.004);
        return g;
    };
    group.add(eye(-1), eye(1));

    const brow = (sign) => {
        const curve = new THREE.EllipseCurve(0, 0, radius * 0.2, radius * 0.14, Math.PI * 0.15, Math.PI * 0.85);
        const pts = curve.getPoints(16).map((p) => new THREE.Vector3(p.x, p.y, 0));
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x15151b })
        );
        line.position.set(sign * radius * 0.32, radius * 0.42, 0.005);
        return line;
    };
    group.add(brow(-1), brow(1));

    // Smile — half disc
    const mouth = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 0.34, 28, Math.PI, Math.PI),
        white
    );
    mouth.position.set(0, -radius * 0.24, 0.004);
    mouth.scale.y = 0.78;
    group.add(mouth);

    const mouthOutline = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 0.37, 28, Math.PI, Math.PI),
        dark
    );
    mouthOutline.position.set(0, -radius * 0.24, 0.003);
    mouthOutline.scale.y = 0.82;
    group.add(mouthOutline);

    group.userData.mouth = mouth;
    return group;
}

/* ------------------------------------------------------------------ *
 * Character
 * ------------------------------------------------------------------ */
export class DanceCharacter {
    constructor(profile, position, opts = {}) {
        this.profile = profile;
        this.showFace = opts.showFace !== false;
        // Heads are flat planes; pitching them toward the camera keeps the face
        // circular from crane / top-down shots instead of foreshortening away.
        this.camera = opts.camera || null;

        this.root = new THREE.Group();
        this.root.position.copy(position);
        this.root.name = profile.id;
        this.baseY = position.y;

        this.floatOffset = 0;
        this.focusFloat = 0;
        this.giftFloatUntil = 0;
        this.tween = null;
        this.homePos = { x: position.x, z: position.z, rot: 0, y: position.y || 0 };
        this.elevated = (position.y || 0) > 0.4;
        this.phase = Math.random() * Math.PI * 2;
        this.seedOffset = Math.random() * 100;

        // Choreography state
        const startPool = MOVE_IDS.filter((m) => m !== 'hype');
        this.moveId = startPool[Math.floor(Math.random() * startPool.length)];
        this.forcedMove = null;
        this.moveLockedBy = null;
        this.lastBeatIndex = -1;
        this.glitchUntil = 0;
        this.glitchVec = new THREE.Vector3();
        this.hype = 0;
        this.isGuest = !!opts.isGuest;
        this.viewerId = opts.viewerId || null;
        this.onDjBooth = false;
        this._headOnly = false;
        this.dropSpawn = null;

        const bodyColor = new THREE.Color(profile.color || '#7ad3c4');
        this.bodyColor = bodyColor;

        // Wrapper used for glitch offsets so baseY math stays clean
        this.body = new THREE.Group();
        this.root.add(this.body);

        const mat = lineMaterial();
        this.limbMat = mat;

        /* --- Head --- */
        const headRadius = 0.62;
        this.headRadius = headRadius;
        this.headGroup = new THREE.Group();
        this.headGroup.position.set(0, 1.62, 0);
        this.body.add(this.headGroup);

        this.mascotTexture = makeHeadTexture(null, '#' + bodyColor.getHexString());
        this.avatarTexture = null;
        this.faceMode = opts.faceMode === 'avatar' ? 'avatar' : 'mascot';

        // The head doubles as an emissive panel so stage lights tint it without
        // washing the profile picture into mud.
        this.headMat = new THREE.MeshStandardMaterial({
            map: this.mascotTexture,
            emissiveMap: this.mascotTexture,
            emissive: 0xffffff,
            emissiveIntensity: 0.85,
            transparent: true,
            roughness: 0.55,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        this.head = new THREE.Mesh(new THREE.PlaneGeometry(headRadius * 2, headRadius * 2), this.headMat);
        this.headGroup.add(this.head);

        // Glow halo that pulses on beat
        this.halo = new THREE.Mesh(
            new THREE.RingGeometry(headRadius * 1.02, headRadius * 1.18, 40),
            new THREE.MeshBasicMaterial({
                color: bodyColor,
                transparent: true,
                opacity: 0.55,
                side: THREE.DoubleSide
            })
        );
        this.halo.position.z = -0.02;
        this.headGroup.add(this.halo);

        if (this.showFace) {
            this.face = buildFace(headRadius);
            this.face.position.z = 0.012;
            this.headGroup.add(this.face);
        }

        /* --- Arms (attach near head sides, like the reference) --- */
        const armThick = 0.045;
        this.armL = buildLimb({ upper: 0.42, lower: 0.4, thickness: armThick, mat, tip: mittenHand(1) });
        this.armR = buildLimb({ upper: 0.42, lower: 0.4, thickness: armThick, mat, tip: mittenHand(1) });
        // Well behind the head plane, otherwise wide swings cut across the face
        this.armL.root.position.set(-headRadius * 0.88, 1.46, -0.4);
        this.armR.root.position.set(headRadius * 0.88, 1.46, -0.4);
        this.armL.root.rotation.z = 0.9;
        this.armR.root.rotation.z = -0.9;
        this.body.add(this.armL.root, this.armR.root);

        /* --- Legs --- */
        const legThick = 0.05;
        this.legL = buildLimb({ upper: 0.42, lower: 0.38, thickness: legThick, mat, tip: shoe(bodyColor) });
        this.legR = buildLimb({ upper: 0.42, lower: 0.38, thickness: legThick, mat, tip: shoe(bodyColor) });
        this.legL.root.position.set(-0.3, 1.06, -0.1);
        this.legR.root.position.set(0.3, 1.06, -0.1);
        this.body.add(this.legL.root, this.legR.root);

        /* --- Ground shadow --- */
        this.shadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 24),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 })
        );
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.y = 0.015;
        this.root.add(this.shadow);

        /* --- Name tag --- */
        this.nameSprite = this._buildNameTag(profile.name);
        this.nameSprite.position.set(0, 2.62, 0);
        this.root.add(this.nameSprite);

        this.setAvatar(profile.avatar || avatarUrl(profile.seed));

        // Neutral pose cache used by moves as a base
        this.pose = {
            armLZ: 0.9, armRZ: -0.9,
            armLX: 0, armRX: 0,
            elbowLZ: 0, elbowRZ: 0,
            legLZ: 0, legRZ: 0,
            kneeLZ: 0, kneeRZ: 0,
            headTilt: 0, headSpin: 0,
            bodyY: 0, bodyLean: 0, squash: 1
        };
    }

    _buildNameTag(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 80;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(10,8,20,0.78)';
        ctx.beginPath();
        ctx.roundRect(4, 14, 312, 52, 26);
        ctx.fill();
        ctx.strokeStyle = '#' + this.bodyColor.getHexString();
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.font = '700 34px Kanit, system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 160, 41);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
        );
        sprite.scale.set(1.5, 0.375, 1);
        return sprite;
    }

    async setAvatar(url) {
        const img = await loadImage(url);
        if (!img) return;
        if (this.avatarTexture) this.avatarTexture.dispose();
        this.avatarTexture = makeHeadTexture(img, '#' + this.bodyColor.getHexString());
        this._applyFaceMode();
    }

    /** 'mascot' = cartoon face on body colour, 'avatar' = profile picture */
    setFaceMode(mode) {
        this.faceMode = mode === 'avatar' ? 'avatar' : 'mascot';
        this._applyFaceMode();
    }

    _applyFaceMode() {
        const useAvatar = this.faceMode === 'avatar' && this.avatarTexture;
        const tex = useAvatar ? this.avatarTexture : this.mascotTexture;
        this.headMat.map = tex;
        this.headMat.emissiveMap = tex;
        this.headMat.needsUpdate = true;
        if (this.face) this.face.visible = !useAvatar;
    }

    setNameTagVisible(v) {
        this.nameSprite.visible = !!v;
    }

    getWorldFocusPoint() {
        const v = new THREE.Vector3();
        this.headGroup.getWorldPosition(v);
        return v;
    }

    setGiftFloat(amount, lockMs = 3200) {
        this.floatOffset = amount;
        if (amount > 0) {
            this.giftFloatUntil = performance.now() + lockMs;
            this.hype = 1;
            this.moveId = 'hype';
        } else {
            this.giftFloatUntil = 0;
            if (!this.forcedMove) {
                this.hype = 0;
                this.pickMove();
            }
        }
    }

    /** Pin every future move selection to one id (null = unlock only) */
    setForcedMove(id, lockMs = 0) {
        this.forcedMove = id || null;
        if (id && lockMs > 0) {
            this.moveLockedBy = performance.now() + lockMs;
        } else if (!id) {
            this.moveLockedBy = null;
        }
        // Only switch move when pinning; clearing leaves current pose until next beat/idle
        if (id) this.pickMove();
    }

    updateTween(dt) {
        if (!this.tween) return;
        this.tween.t = Math.min(1, this.tween.t + dt / this.tween.dur);
        const e = 1 - Math.pow(1 - this.tween.t, 3);
        const tw = this.tween;
        this.root.position.x = tw.from.x + (tw.to.x - tw.from.x) * e;
        this.root.position.z = tw.from.z + (tw.to.z - tw.from.z) * e;
        if (tw.from.y != null && tw.to.y != null) {
            this.baseY = tw.from.y + (tw.to.y - tw.from.y) * e;
        }
        let dr = tw.to.rot - tw.from.rot;
        while (dr > Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        this.root.rotation.y = tw.from.rot + dr * e;
        if (this.tween.t >= 1) {
            if (tw.to.y != null) {
                this.baseY = tw.to.y;
                this.elevated = (tw.to.y || 0) > 0.4;
            }
            this.tween = null;
            if (tw.onDone) tw.onDone();
        }
    }

    pickMove(forceId) {
        const pinned = forceId || this.forcedMove;
        if (pinned && DANCE_MOVES[pinned]) {
            this.moveId = pinned;
            return;
        }
        const pool = MOVE_IDS.filter((m) => m !== 'hype' && m !== 'idle' && m !== 'walk' && m !== this.moveId);
        this.moveId = pool[Math.floor(Math.random() * pool.length)] || this.moveId;
    }

    /** Snap jitter on a beat hit — the "glitch / twitch" feel */
    kickGlitch(strength = 1) {
        this.glitchUntil = performance.now() + 90 + Math.random() * 70;
        this.glitchVec.set(
            (Math.random() - 0.5) * 0.14 * strength,
            (Math.random() - 0.5) * 0.09 * strength,
            (Math.random() - 0.5) * 0.1 * strength
        );
    }

    /** Crowd LOD — hide limbs (disabled; kept for API compat) */
    setHeadOnly(on) {
        if (this._headOnly === on) return;
        this._headOnly = on;
        const vis = !on;
        this.armL.root.visible = vis;
        this.armR.root.visible = vis;
        this.legL.root.visible = vis;
        this.legR.root.visible = vis;
        this.shadow.visible = vis;
        this.headGroup.position.y = on ? 0.95 : 1.62;
    }

    /** Stage / DJ — draw in front of booth geometry */
    setStagePriority(on) {
        this.root.renderOrder = on ? 20 : 0;
        if (this.head) this.head.renderOrder = on ? 21 : 0;
    }

    /**
     * @param {number} time seconds
     * @param {object} audio frame from audio engine
     */
    update(time, audio = {}) {
        const playing = !!audio.playing;
        const beat = playing ? (audio.beat || 0) : 0;
        const bass = playing ? (audio.bass || 0) : 0;
        const mid = playing ? (audio.mid || 0) : 0;
        const treble = playing ? (audio.treble || 0) : 0;
        const beatIndex = audio.beatIndex || 0;
        const energy = playing ? (0.4 + bass * 1.3 + beat * 0.85) : 0;

        const now = performance.now();
        const floatActive = this.giftFloatUntil > 0 && now < this.giftFloatUntil;
        const moveActive = !!this.forcedMove || (this.moveLockedBy && now < this.moveLockedBy);

        // Gift FX keep working even when music is paused / idle
        if (!playing) {
            if (!floatActive && !moveActive) {
                this.moveId = 'idle';
                this.forcedMove = null;
                this.moveLockedBy = null;
                this.hype = 0;
                this.floatOffset = 0;
            } else if (floatActive || this.floatOffset > 0) {
                this.moveId = this.forcedMove || 'hype';
                this.hype = 1;
            }
            this.glitchUntil = 0;
        }

        if (this.giftFloatUntil > 0 && now >= this.giftFloatUntil) {
            this.giftFloatUntil = 0;
            this.floatOffset = 0;
        }

        // Crowded-floor LOD: keep height/float, skip full pose on off-frames
        if (this._lodSkip && !floatActive && !this.tween) {
            let spawnLift = 0;
            if (this.dropSpawn) {
                const t = this.dropSpawn.t;
                const e = 1 - Math.pow(1 - Math.min(1, t), 3);
                spawnLift = this.dropSpawn.startY * (1 - e);
            }
            const floatTarget = this.floatOffset || 0;
            this.focusFloat += (floatTarget - this.focusFloat) * 0.08;
            this.root.position.y = this.baseY + this.focusFloat + spawnLift;
            if (!this._headOnly && _crowdSize > 280) {
                this.halo.material.opacity = 0.28;
            }
            return;
        }

        // Beat events: glitch + occasional move swap
        if (playing && beatIndex !== this.lastBeatIndex) {
            const first = this.lastBeatIndex < 0;
            this.lastBeatIndex = beatIndex;
            if (!first) {
                const giftLocked = moveActive || floatActive;
                if (Math.random() < 0.55) this.kickGlitch(0.6 + bass);
                if (!giftLocked && beatIndex % 8 === 0 && Math.random() < 0.8) this.pickMove();
            }
        }
        if (playing && this.moveLockedBy && now > this.moveLockedBy) {
            this.moveLockedBy = null;
            if (!floatActive && !this.forcedMove) {
                this.hype = 0;
                this.pickMove();
            }
        }

        const t = time * 1.05 + this.phase;
        const p = this.pose;

        // Reset to neutral, then let the move write into it
        p.armLZ = 0.9; p.armRZ = -0.9;
        p.armLX = 0; p.armRX = 0;
        p.elbowLZ = 0; p.elbowRZ = 0;
        p.legLZ = 0; p.legRZ = 0;
        p.kneeLZ = 0; p.kneeRZ = 0;
        p.headTilt = 0; p.headSpin = 0;
        p.bodyY = 0; p.bodyLean = 0; p.squash = 1;

        const moveId = (playing || floatActive || moveActive) ? this.moveId : 'idle';
        const move = DANCE_MOVES[moveId] || DANCE_MOVES.idle || DANCE_MOVES.bounce;
        move.apply(p, {
            t: (playing || floatActive || moveActive) ? t : 0,
            time,
            energy,
            beat,
            bass,
            mid,
            treble,
            beatIndex,
            beatPhase: audio.beatPhase || 0,
            seed: this.seedOffset
        });

        // Apply pose
        this.armL.root.rotation.z = p.armLZ;
        this.armR.root.rotation.z = p.armRZ;
        this.armL.root.rotation.x = p.armLX;
        this.armR.root.rotation.x = p.armRX;
        this.armL.joint.rotation.z = p.elbowLZ;
        this.armR.joint.rotation.z = p.elbowRZ;

        this.legL.root.rotation.z = p.legLZ;
        this.legR.root.rotation.z = p.legRZ;
        this.legL.joint.rotation.z = p.kneeLZ;
        this.legR.joint.rotation.z = p.kneeRZ;

        this.headGroup.rotation.z = p.headTilt;
        this.headGroup.rotation.y = p.headSpin;
        if (this.camera && !this._headOnly) {
            const hp = this.headGroup.getWorldPosition(_tmpVec);
            const cp = this.camera.position;
            const horiz = Math.hypot(cp.x - hp.x, cp.z - hp.z);
            this.headGroup.rotation.x = -Math.atan2(cp.y - hp.y, Math.max(0.001, horiz)) * 0.9;
        }

        // Gift float — slow smooth rise, gentle descent
        const floatTarget = this.floatOffset || 0;
        const rising = floatTarget > this.focusFloat + 0.02;
        const floatEase = rising ? 0.045 : 0.1;
        this.focusFloat += (floatTarget - this.focusFloat) * floatEase;

        // Sky-drop spawn (guest entering the floor)
        let spawnLift = 0;
        if (this.dropSpawn) {
            const t = this.dropSpawn.t;
            const e = 1 - Math.pow(1 - Math.min(1, t), 3);
            spawnLift = this.dropSpawn.startY * (1 - e);
        }

        // Glitch offset
        let gx = 0, gy = 0, gz = 0;
        if (performance.now() < this.glitchUntil) {
            gx = this.glitchVec.x;
            gy = this.glitchVec.y;
            gz = this.glitchVec.z;
        }

        this.body.position.set(gx, p.bodyY + gy, gz);
        this.body.rotation.z = p.bodyLean;
        this.body.scale.set(1 / Math.sqrt(p.squash), p.squash, 1);

        // Squash-and-stretch belongs on the limbs; the head must stay a circle,
        // so counter-scale it and keep only a hint of the deformation.
        const keep = Math.pow(p.squash, 0.3);
        this.headGroup.scale.set(keep * Math.sqrt(p.squash), keep / p.squash, 1);

        this.root.position.y = this.baseY + this.focusFloat + spawnLift;

        // Halo / emissive react to beat
        this.halo.material.opacity = 0.32 + beat * 0.55 + bass * 0.25;
        this.halo.scale.setScalar(1 + beat * 0.14);
        this.headMat.emissiveIntensity = 0.35 + beat * 1.1 + treble * 0.5;

        if (this.face && this.face.visible) {
            const m = this.face.userData.mouth;
            if (m) m.scale.y = 0.6 + beat * 0.55 + mid * 0.3;
        }

        // Shadow shrinks as the character lifts off
        const lift = Math.max(0, p.bodyY + this.focusFloat);
        const k = Math.max(0.35, 1 - lift * 0.55);
        this.shadow.scale.setScalar(k);
        this.shadow.material.opacity = 0.12 + 0.2 * k;
    }

    dispose() {
        this.root.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
            mats.forEach((m) => {
                if (m.map) m.map.dispose();
                m.dispose();
            });
        });
    }
}

/**
 * Arrange dancers in front-row-first grid facing the audience.
 */
export function spawnDancers(scene, profiles, opts = {}) {
    const dancers = [];
    const occupied = [];

    profiles.forEach((p, i) => {
        const slot = pickSpreadSpawnSlot(occupied, p.id || p.seed || `demo_${i}`);
        occupied.push({ x: slot.x, z: slot.z });
        const rot = slot.rot ?? Math.atan2(-slot.x, -(slot.z - 5)) * 0.85;

        const char = new DanceCharacter(p, new THREE.Vector3(slot.x, slot.y || 0, slot.z), opts);
        char.root.rotation.y = rot;
        char.homePos = { x: slot.x, z: slot.z, rot };
        scene.add(char.root);
        dancers.push(char);
    });

    return dancers;
}

const GUEST_COLORS = ['#ff2d95', '#00d2ff', '#bc13fe', '#3affc0', '#ffd23f', '#ff6b35', '#54a0ff', '#ff9ff3'];

function guestColor(id) {
    let h = 0;
    const s = String(id || 'guest');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return GUEST_COLORS[h % GUEST_COLORS.length];
}

/**
 * Spawn a viewer/guest character dropping onto the dance floor.
 * Picks a pseudo-random spread slot across the full floor (incl. elevated wings).
 */
export function spawnGuestOnFloor(scene, profile, opts = {}) {
    const occupied = (opts.occupied || []).map((d) => ({
        x: d.root?.position?.x ?? d.x ?? 0,
        z: d.root?.position?.z ?? d.z ?? 0,
        y: d.baseY ?? d.root?.position?.y ?? 0
    }));
    const seed = profile.viewerId || profile.id || profile.handle || profile.name;
    const slot = pickSpreadSpawnSlot(occupied, seed);
    const baseY = slot.y != null ? slot.y : floorElevationAt(slot.x);
    const char = new DanceCharacter(
        profile,
        new THREE.Vector3(slot.x, baseY, slot.z),
        { ...opts, isGuest: true, viewerId: profile.viewerId, faceMode: 'avatar' }
    );
    char.root.rotation.y = slot.rot;
    char.baseY = baseY;
    char.elevated = baseY > 0.4;
    char.homePos = { x: slot.x, z: slot.z, rot: slot.rot, y: baseY };
    char.dropSpawn = { startY: 11 + Math.random() * 3, t: 0, dur: 1.15 + Math.random() * 0.2 };
    char.setFaceMode('avatar');
    if (profile.avatar) char.setAvatar(profile.avatar);
    scene.add(char.root);
    return char;
}

export function buildGuestProfile({ uniqueId, nickname, avatar, giftName }) {
    const uid = String(uniqueId || nickname || `guest_${Date.now()}`);
    const name = (nickname || giftName || 'Guest').replace(/^@/, '').slice(0, 18);
    return {
        id: `guest_${uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`,
        name,
        handle: uid,
        seed: uid,
        color: guestColor(uid),
        avatar: avatar || avatarUrl(uid),
        viewerId: uid
    };
}
