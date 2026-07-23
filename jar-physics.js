/**
 * Pandy App — Gift Jar Physics Engine (shared: panel + OBS overlay)
 * Wide play area + centered jar body — gifts overflow left/right
 */
(function (global) {
    'use strict';

    const JAR_SHAPES = [
        { id: 'classic', name: 'โหลแก้ว', icon: '🫙', unlocked: true },
        { id: 'round', name: 'ลูกปลา', icon: '🐠', unlocked: true },
        { id: 'heart', name: 'หัวใจ', icon: '💗', unlocked: true },
        { id: 'vase', name: 'แจกัน', icon: '🏺', unlocked: true },
        { id: 'cauldron', name: 'หม้อมนตร์', icon: '⚗️', unlocked: true },
        { id: 'trophy', name: 'ถ้วยรางวัล', icon: '🏆', unlocked: true },
        { id: 'diamond', name: 'เพชร', icon: '💎', unlocked: true },
        { id: 'tank', name: 'ตู้ปลา', icon: '🐡', unlocked: true },
        { id: 'claw', name: 'ตู้คีบ', icon: '🕹️', unlocked: true },
        { id: 'piggy', name: 'กระปุก', icon: '🐷', unlocked: true },
        { id: 'giftbox', name: 'กล่องของขวัญ', icon: '🎁', unlocked: true },
        { id: 'chest', name: 'หีบสมบัติ', icon: '🧳', unlocked: true },
        { id: 'boba', name: 'ชานม', icon: '🧋', unlocked: true },
        { id: 'orb', name: 'ลูกแก้ว', icon: '🔮', unlocked: true },
        { id: 'crystal', name: 'คริสตัล', icon: '✨', unlocked: true },
        { id: 'victorian', name: 'โถวิกตอเรีย', icon: '👑', unlocked: true },
        { id: 'custom', name: 'ออกแบบเอง', icon: '🖼️', unlocked: true }
    ];

    // Built-in decorative image assets (served by the app's own web server)
    const BUILTIN_JAR_IMAGE_SRC = { victorian: 'assets/jar_victorian.png' };
    const _builtinImgCache = {};
    function getBuiltinJarImage(shapeId) {
        const src = BUILTIN_JAR_IMAGE_SRC[shapeId];
        if (!src || typeof Image === 'undefined') return null;
        if (_builtinImgCache[shapeId]) return _builtinImgCache[shapeId];
        const img = new Image();
        img.onload = () => { img._ok = true; };
        img.onerror = () => { img._fail = true; };
        img.src = src;
        _builtinImgCache[shapeId] = img;
        return img;
    }

    const JAR_COLOR_PRESETS = [
        { id: 'blue', label: 'ฟ้า', color: '#00d2ff' },
        { id: 'pink', label: 'ชมพู', color: '#ff6bcb' },
        { id: 'red', label: 'แดง', color: '#ff4757' },
        { id: 'cream', label: 'นวล', color: '#f5d6a8' },
        { id: 'gold', label: 'ทอง', color: '#f1c40f' },
        { id: 'green', label: 'เขียว', color: '#2ecc71' },
        { id: 'purple', label: 'ม่วง', color: '#bc13fe' },
        { id: 'cyan', label: 'ฟ้าคราม', color: '#00e5cc' },
        { id: 'grey', label: 'เทา', color: '#8899aa' },
        { id: 'rainbow', label: 'สายรุ้ง', color: 'rainbow' }
    ];

    const GIFT_EMOJI_MAP = {
        rose: '🌹', tiktok: '🎵', gg: '💛', perfume: '💐', ice: '🧊',
        heart: '❤️', finger: '👍', cake: '🎂', cap: '🧢', galaxy: '🌌',
        lion: '🦁', universe: '🪐', default: '🎁'
    };

    // Shapes with a gentle idle animation (subtle sway / breathe)
    const ANIMATED_SHAPES = new Set(['boba', 'orb', 'piggy', 'heart', 'crystal', 'cauldron', 'victorian']);

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function hexToRgb(hex) {
        const h = String(hex || '#bc13fe').replace('#', '');
        if (h.length !== 6) return { r: 188, g: 19, b: 254 };
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }

    function rgba(hex, a) {
        const c = hexToRgb(hex);
        return `rgba(${c.r},${c.g},${c.b},${a})`;
    }

    /** Tint only opaque jar pixels — never the transparent bounding box */
    function tintJarImage(ctx, x, y, w, h, color) {
        if (!color) return;
        ctx.save();
        if (color === 'rainbow') {
            const g = ctx.createLinearGradient(x, y, x, y + h);
            g.addColorStop(0, '#bc13fe');
            g.addColorStop(0.45, '#00d2ff');
            g.addColorStop(1, '#ff6bcb');
            ctx.fillStyle = g;
        } else {
            ctx.fillStyle = color;
        }
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.72;
        ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Crop lid + neck collar — bowl opening starts ~36% down the source art
    const VIC_LID_CROP = 0.36;

    /** Per-shape mouth (rim) position — used for spawn, fill detection & overflow */
    const JAR_MOUTH_PROFILES = {
        victorian: { rimRel: 0.32, lipRel: 0.36 },
        vase:      { rimRel: 0.20, lipRel: 0.24 },
        trophy:    { rimRel: 0.28, lipRel: 0.30 },
        cauldron:  { rimRel: 0.38, lipRel: 0.40 },
        boba:      { rimRel: 0.38, lipRel: 0.40 },
        round:     { rimRel: 0.38, lipRel: 0.40 },
        orb:       { rimRel: 0.38, lipRel: 0.40 },
        heart:     { rimRel: 0.38, lipRel: 0.42 },
        tank:      { rimRel: 0.38, lipRel: 0.40 },
        claw:      { rimRel: 0.38, lipRel: 0.40 },
        diamond:   { rimRel: 0.38, lipRel: 0.42 },
        crystal:   { rimRel: 0.38, lipRel: 0.42 },
        custom:    { rimRel: 0.38, lipRel: 0.40 }
    };

    /** Detect jar mouth from shape profile + inner bounds curve */
    function getJarMouth(shapeId, jarX, jarW, jarY, jarH) {
        const prof = JAR_MOUTH_PROFILES[shapeId] || JAR_MOUTH_PROFILES.cauldron;
        const rimRel = prof.rimRel;
        const lipRel = prof.lipRel;
        const b = jarInnerBounds(rimRel, shapeId);
        let mouthHalf = (b.right - b.left) / 2;
        if (shapeId === 'victorian') mouthHalf = Math.max(mouthHalf, 0.22);
        const mouthY = jarY + jarH * rimRel;
        const lipY = jarY + jarH * lipRel;
        return {
            mouthY, lipY, rimY: mouthY,
            mouthLeft: jarX + jarW * (0.5 - mouthHalf),
            mouthRight: jarX + jarW * (0.5 + mouthHalf),
            mouthCenterX: jarX + jarW * 0.5,
            mouthWidth: jarW * mouthHalf * 2,
            mouthHalfRel: mouthHalf,
            rimRel, lipRel
        };
    }

    /** Gift has spilled out over the mouth lip (not just outside jar column) */
    function isOverflowGift(x, y, r, layout, jarX, jarW) {
        const mouth = layout.mouth;
        if (!mouth) return x < jarX - 4 || x > jarX + jarW + 4;
        if (y - r < mouth.lipY + 18 && (x + r < mouth.mouthLeft - 2 || x - r > mouth.mouthRight + 2)) {
            return true;
        }
        return x < jarX - 4 || x > jarX + jarW + 4;
    }

    function normalizeSettings(s) {
        s = s || {};
        const jarScale = s.jarScale != null ? s.jarScale : 1;
        const jarW = Math.round((s.jarWidth || 190) * jarScale);
        const jarH = Math.round((s.jarHeight || 300) * jarScale);
        return {
            jarShape: s.jarShape || 'cauldron',
            jarColor: s.jarColor || '#bc13fe',
            jarColorPreset: s.jarColorPreset || 'purple',
            jarWidth: s.jarWidth || 190,
            jarHeight: s.jarHeight || 300,
            jarScale,
            areaWidth: s.areaWidth || Math.round(jarW * 2.8),
            areaHeight: s.areaHeight || (jarH + Math.round(jarH * 0.16) + 6),
            animate: s.animate !== false,
            jarOffsetX: s.jarOffsetX != null ? s.jarOffsetX : 0,
            jarOffsetY: s.jarOffsetY != null ? s.jarOffsetY : 0,
            giftScale: s.giftScale != null ? s.giftScale : 1,
            bounceMode: s.bounceMode || 'bouncy',
            bounceStrength: s.bounceStrength != null ? s.bounceStrength : 1,
            glowEffect: s.glowEffect !== false,
            showSender: s.showSender !== false,
            tiltX: s.tiltX || 0,
            tiltY: s.tiltY || 0,
            turnZ: s.turnZ || 0,
            customJarImage: s.customJarImage || null,
            goal: s.goal || 10000,
            totalCoins: s.totalCoins || 0,
            title: s.title || 'Gift Jar'
        };
    }

    /** Canvas = wide play area; small jar pinned to bottom; overflow spills left/right */
    function getLayout(settings) {
        const s = normalizeSettings(settings);
        const jarW = Math.round(s.jarWidth * s.jarScale);
        const jarH = Math.round(s.jarHeight * s.jarScale);
        const sidePad = Math.round(jarW * 0.9);
        const dropZoneH = Math.round(jarH * 0.08);
        const areaW = Math.max(jarW + sidePad * 2, s.areaWidth);
        const areaH = Math.max(jarH + dropZoneH + 4, s.areaHeight);
        const jarX = (areaW - jarW) / 2;
        const jarY = areaH - jarH - 2;
        const shape = s.jarShape || 'cauldron';
        const mouth = getJarMouth(shape, jarX, jarW, jarY, jarH);
        return {
            areaW, areaH, jarW, jarH, jarX, jarY,
            cx: areaW / 2,
            rimY: mouth.rimY,
            mouth,
            dropTop: jarY - dropZoneH,
            floorY: areaH - 6,
            sidePad
        };
    }

    // Harder fall, settle quickly — low bounce, high friction when still
    function getPhysicsParams(mode, strength) {
        const s = strength || 1;
        if (mode === 'still') return { restitution: 0.01, friction: 0.95, frictionAir: 0.04, density: 0.0028 };
        if (mode === 'lively') return { restitution: clamp(0.35 * s, 0.08, 0.6), friction: 0.38, frictionAir: 0.008, density: 0.0024 };
        return { restitution: clamp(0.08 * s, 0.02, 0.25), friction: 0.55, frictionAir: 0.012, density: 0.0026 };
    }

    function giftEmojiFor(drop) {
        const name = String(drop?.giftName || '').toLowerCase();
        for (const [key, em] of Object.entries(GIFT_EMOJI_MAP)) {
            if (key !== 'default' && name.includes(key)) return em;
        }
        return GIFT_EMOJI_MAP.default;
    }

    /** Radius scales with coin value — 1 coin small, 100+ noticeably bigger */
    function giftRadiusForCoins(coins, giftScale) {
        const c = Math.max(1, coins || 1);
        const scale = giftScale || 1;
        let base;
        if (c >= 5000) base = 24;
        else if (c >= 1000) base = 19;
        else if (c >= 100) base = 13;
        else if (c >= 30) base = 10;
        else if (c >= 10) base = 8;
        else base = 5.5;
        return Math.min(28, base * scale);
    }

    function isInJarColumn(x, jarX, jarW) {
        return x > jarX + jarW * 0.05 && x < jarX + jarW * 0.95;
    }

    function addWallSegment(M, walls, x1, y1, x2, y2, thick, label) {
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 6) return;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        walls.push(M.Bodies.rectangle(cx, cy, len + 6, thick, {
            isStatic: true, angle, label: label || 'jar-wall', friction: 0.92, restitution: 0.04
        }));
    }

    function jarInnerBounds(relY, shapeId) {
        relY = clamp(relY, 0, 1);
        if (shapeId === 'cauldron' || shapeId === 'boba') {
            const t = clamp((relY - 0.38) / 0.60, 0, 1);
            return { left: 0.12 - t * 0.02, right: 0.88 + t * 0.02 };
        }
        if (shapeId === 'victorian') {
            if (relY < 0.32) {
                const half = 0.22;
                return { left: 0.5 - half, right: 0.5 + half };
            }
            if (relY > 0.78) {
                const t = clamp((relY - 0.78) / 0.10, 0, 1);
                const half = 0.28 * (1 - t) + 0.06;
                return { left: 0.5 - half, right: 0.5 + half };
            }
            const t = (relY - 0.32) / 0.46;
            const half = 0.22 + 0.11 * Math.sin(Math.PI * clamp(t, 0, 1));
            return { left: 0.5 - half, right: 0.5 + half };
        }
        if (shapeId === 'round' || shapeId === 'orb') {
            const half = 0.44 * Math.sin(Math.PI * clamp((relY - 0.16) / 0.76, 0, 1));
            return { left: 0.5 - half, right: 0.5 + half };
        }
        if (shapeId === 'tank' || shapeId === 'claw') return { left: 0.08, right: 0.92 };
        if (shapeId === 'heart') {
            const t = clamp((relY - 0.26) / 0.54, 0, 1);
            const half = 0.46 - t * 0.08;
            return { left: 0.5 - half, right: 0.5 + half };
        }
        if (shapeId === 'diamond' || shapeId === 'crystal') {
            let half;
            if (relY <= 0.46) half = 0.36 * clamp((relY - 0.16) / 0.30, 0, 1);
            else half = 0.36 * (1 - clamp((relY - 0.46) / 0.51, 0, 1));
            return { left: 0.5 - half, right: 0.5 + half };
        }
        const t = clamp((relY - 0.18) / 0.80, 0, 1);
        return { left: 0.08 + t * 0.02, right: 0.92 - t * 0.02 };
    }

    function isInsideJarInterior(x, y, shapeId, jarX, jarW, jarY, jarH) {
        const relY = (y - jarY) / jarH;
        const relX = (x - jarX) / jarW;
        if (shapeId === 'victorian') {
            if (relY < 0.28) return relY > 0.20 && relX > 0.26 && relX < 0.74;
            if (relY > 0.82) return false;
            const b = jarInnerBounds(relY, shapeId);
            return relX >= b.left - 0.02 && relX <= b.right + 0.02;
        }
        if (relY < 0.38) return relY > 0.32 && relX > 0.12 && relX < 0.88;
        if (relY > 1.02) return false;
        const b = jarInnerBounds(relY, shapeId);
        return relX >= b.left - 0.02 && relX <= b.right + 0.02;
    }

    function getJarFillState(bodies, layout, shapeId) {
        const { jarX, jarW, jarY, jarH, mouth } = layout;
        const rimY = mouth ? mouth.rimY : layout.rimY;
        let countInside = 0;
        let countOutside = 0;
        let pileTop = jarY + jarH;

        bodies.forEach(b => {
            const p = b.position;
            const r = b.circleRadius || 8;
            if (isInsideJarInterior(p.x, p.y, shapeId, jarX, jarW, jarY, jarH)) {
                countInside++;
                pileTop = Math.min(pileTop, p.y - r);
            } else if (isOverflowGift(p.x, p.y, r, layout, jarX, jarW)) {
                countOutside++;
            }
        });

        const fillH = jarH * 0.58;
        const fillW = jarW * 0.72;
        const minToFill = Math.max(24, Math.floor((fillW * fillH) / (Math.PI * 64 * 1.55)));
        const pileAtRim = countInside > 0 && pileTop <= rimY + 10;
        const full = countInside >= minToFill && pileAtRim;
        const overflowing = full && countOutside >= 8;

        return { full, overflowing, countInside, countOutside, pileTop, rimY, minToFill };
    }

    /** When jar is full: remove rim lid so gifts overflow naturally over the sides */
    function buildRimBlockers(M, shapeId, jarX, jarW, jarY, jarH) {
        const thick = 8;
        const walls = [];
        const top = jarY + jarH * 0.36;
        const lip = jarY + jarH * 0.40;
        if (shapeId === 'cauldron' || shapeId === 'boba') {
            addWallSegment(M, walls, jarX + jarW * 0.08, top, jarX + jarW * 0.20, lip, thick, 'rim');
            addWallSegment(M, walls, jarX + jarW * 0.92, top, jarX + jarW * 0.80, lip, thick, 'rim');
        } else if (shapeId === 'victorian') {
            const mouth = getJarMouth(shapeId, jarX, jarW, jarY, jarH);
            const top = mouth.mouthY - jarH * 0.012;
            const lip = mouth.lipY;
            addWallSegment(M, walls, mouth.mouthLeft, top, mouth.mouthLeft + jarW * 0.035, lip, thick, 'rim');
            addWallSegment(M, walls, mouth.mouthRight, top, mouth.mouthRight - jarW * 0.035, lip, thick, 'rim');
        } else {
            addWallSegment(M, walls, jarX + jarW * 0.06, top, jarX + jarW * 0.16, lip, thick, 'rim');
            addWallSegment(M, walls, jarX + jarW * 0.94, top, jarX + jarW * 0.84, lip, thick, 'rim');
        }
        return walls;
    }

    /** Sample jarInnerBounds() along Y so physical walls follow the same curve
     *  used for fill-state logic (and roughly the drawn glass), instead of a
     *  single straight segment that can be far outside a tapered/rounded body. */
    function buildCurvedInteriorWalls(M, shapeId, jarX, jarW, jarY, jarH, topRel, floorRel, steps) {
        const walls = [];
        steps = steps || 9;
        let prevL = null, prevR = null;
        for (let i = 0; i <= steps; i++) {
            const relY = topRel + (floorRel - topRel) * (i / steps);
            const b = jarInnerBounds(relY, shapeId);
            const y = jarY + relY * jarH;
            const lx = jarX + b.left * jarW;
            const rx = jarX + b.right * jarW;
            if (prevL) addWallSegment(M, walls, prevL.x, prevL.y, lx, y, 8);
            if (prevR) addWallSegment(M, walls, prevR.x, prevR.y, rx, y, 8);
            prevL = { x: lx, y };
            prevR = { x: rx, y };
        }
        return walls;
    }

    /** Flat floor segment — curved walls taper to a point without one */
    function buildJarFloor(M, shapeId, jarX, jarW, jarY, jarH, floorRel) {
        const b = jarInnerBounds(floorRel, shapeId);
        const y = jarY + floorRel * jarH;
        const lx = jarX + b.left * jarW;
        const rx = jarX + b.right * jarW;
        const walls = [];
        if (rx - lx > 10) addWallSegment(M, walls, lx, y, rx, y, 10, 'jar-floor');
        return walls;
    }

    function buildJarInteriorWalls(M, shapeId, jarX, jarW, jarY, jarH) {
        const thick = 8;
        const floor = jarY + jarH - 6;
        const walls = [];

        switch (shapeId) {
            case 'cauldron':
            case 'boba':
                addWallSegment(M, walls, jarX + jarW * 0.14, jarY + jarH * 0.38, jarX + jarW * 0.10, floor, thick);
                addWallSegment(M, walls, jarX + jarW * 0.86, jarY + jarH * 0.38, jarX + jarW * 0.90, floor, thick);
                break;
            case 'round':
            case 'orb':
                walls.push(...buildCurvedInteriorWalls(M, shapeId, jarX, jarW, jarY, jarH, 0.38, 0.84));
                walls.push(...buildJarFloor(M, shapeId, jarX, jarW, jarY, jarH, 0.84));
                break;
            case 'victorian':
                walls.push(...buildCurvedInteriorWalls(M, 'victorian', jarX, jarW, jarY, jarH, 0.32, 0.76));
                walls.push(...buildJarFloor(M, 'victorian', jarX, jarW, jarY, jarH, 0.76));
                break;
            case 'tank':
            case 'claw':
                addWallSegment(M, walls, jarX + jarW * 0.08, jarY + jarH * 0.38, jarX + jarW * 0.08, floor, thick);
                addWallSegment(M, walls, jarX + jarW * 0.92, jarY + jarH * 0.38, jarX + jarW * 0.92, floor, thick);
                break;
            case 'vase':
                addWallSegment(M, walls, jarX + jarW * 0.30, jarY + jarH * 0.18, jarX + jarW * 0.16, floor, thick);
                addWallSegment(M, walls, jarX + jarW * 0.70, jarY + jarH * 0.18, jarX + jarW * 0.84, floor, thick);
                break;
            case 'diamond':
            case 'crystal':
                // Kite shape narrows back to a point at the floor — the old
                // straight walls widened toward the floor (opposite of the
                // art), so gifts landed outside the visible diamond.
                walls.push(...buildCurvedInteriorWalls(M, shapeId, jarX, jarW, jarY, jarH, 0.38, 0.92));
                walls.push(...buildJarFloor(M, shapeId, jarX, jarW, jarY, jarH, 0.92));
                break;
            case 'heart':
                addWallSegment(M, walls, jarX + jarW * 0.24, jarY + jarH * 0.38, jarX + jarW * 0.14, floor, thick);
                addWallSegment(M, walls, jarX + jarW * 0.76, jarY + jarH * 0.38, jarX + jarW * 0.86, floor, thick);
                break;
            case 'trophy': {
                // Goblet cup sits atop a stem — gifts must rest inside the cup,
                // not fall through the narrow stem to the main floor.
                const cupFloorY = jarY + jarH * 0.54;
                addWallSegment(M, walls, jarX + jarW * 0.30, jarY + jarH * 0.26, jarX + jarW * 0.26, cupFloorY, thick);
                addWallSegment(M, walls, jarX + jarW * 0.70, jarY + jarH * 0.26, jarX + jarW * 0.74, cupFloorY, thick);
                addWallSegment(M, walls, jarX + jarW * 0.26, cupFloorY, jarX + jarW * 0.74, cupFloorY, thick);
                break;
            }
            default:
                addWallSegment(M, walls, jarX + jarW * 0.08, jarY + jarH * 0.38, jarX + jarW * 0.08, floor, thick);
                addWallSegment(M, walls, jarX + jarW * 0.92, jarY + jarH * 0.38, jarX + jarW * 0.92, floor, thick);
        }
        return walls;
    }

    function buildWalls(M, shapeId, layout) {
        const { areaW, areaH, jarX, jarW, jarY, jarH, floorY } = layout;
        const thick = 22;
        const walls = [];

        walls.push(M.Bodies.rectangle(areaW / 2, floorY, areaW - 2, thick, { isStatic: true, label: 'floor', friction: 0.9 }));
        walls.push(M.Bodies.rectangle(-thick / 2, areaH / 2, thick, areaH * 2, { isStatic: true, label: 'edge' }));
        walls.push(M.Bodies.rectangle(areaW + thick / 2, areaH / 2, thick, areaH * 2, { isStatic: true, label: 'edge' }));
        walls.push(...buildJarInteriorWalls(M, shapeId, jarX, jarW, jarY, jarH));
        return walls;
    }

    function traceJarPath(ctx, shape, w, h, pad, floor) {
        if (shape === 'round' || shape === 'orb') {
            ctx.ellipse(w / 2, h * 0.55, w * 0.44, h * 0.42, 0, 0, Math.PI * 2);
        } else if (shape === 'heart') {
            ctx.moveTo(w / 2, h * 0.80);
            ctx.bezierCurveTo(w * 0.04, h * 0.50, w * 0.16, h * 0.24, w / 2, h * 0.40);
            ctx.bezierCurveTo(w * 0.84, h * 0.24, w * 0.96, h * 0.50, w / 2, h * 0.80);
        } else if (shape === 'cauldron' || shape === 'boba') {
            ctx.moveTo(w * 0.14, h * 0.38);
            ctx.lineTo(w * 0.10, floor - 3);
            ctx.quadraticCurveTo(w * 0.10, floor, w * 0.18, floor);
            ctx.lineTo(w * 0.82, floor);
            ctx.quadraticCurveTo(w * 0.90, floor, w * 0.90, floor - 3);
            ctx.lineTo(w * 0.86, h * 0.38);
            ctx.closePath();
        } else if (shape === 'tank' || shape === 'claw') {
            ctx.rect(pad - 4, h * 0.38, w - pad * 2 + 8, h * 0.60 - 4);
        } else if (shape === 'vase') {
            ctx.moveTo(w * 0.30, h * 0.18);
            ctx.lineTo(w * 0.16, floor - 4);
            ctx.lineTo(w * 0.84, floor - 4);
            ctx.lineTo(w * 0.70, h * 0.18);
            ctx.closePath();
        } else if (shape === 'trophy') {
            ctx.moveTo(w * 0.30, h * 0.26);
            ctx.lineTo(w * 0.26, h * 0.54);
            ctx.lineTo(w * 0.74, h * 0.54);
            ctx.lineTo(w * 0.70, h * 0.26);
            ctx.closePath();
            ctx.rect(w * 0.36, h * 0.54, w * 0.28, h * 0.10);
            ctx.rect(w * 0.30, floor - 8, w * 0.40, 8);
        } else if (shape === 'piggy' || shape === 'giftbox' || shape === 'chest') {
            ctx.roundRect(pad - 2, h * 0.26, w - pad * 2 + 4, h * 0.70 - 12, 10);
        } else if (shape === 'diamond' || shape === 'crystal') {
            ctx.moveTo(w / 2, h * 0.16);
            ctx.lineTo(w * 0.86, h * 0.46);
            ctx.lineTo(w / 2, floor - 2);
            ctx.lineTo(w * 0.14, h * 0.46);
            ctx.closePath();
        } else {
            ctx.moveTo(pad - 4, h * 0.38);
            ctx.lineTo(pad - 4, floor - 4);
            ctx.quadraticCurveTo(pad - 4, floor, pad + 8, floor);
            ctx.lineTo(w - pad - 8, floor);
            ctx.quadraticCurveTo(w - pad + 4, floor, w - pad + 4, floor - 4);
            ctx.lineTo(w - pad + 4, h * 0.38);
        }
    }

    function jarFillGradient(ctx, color, w, h) {
        if (color === 'rainbow') {
            const g = ctx.createLinearGradient(0, h * 0.15, 0, h);
            g.addColorStop(0, 'rgba(188,19,254,0.28)');
            g.addColorStop(0.45, 'rgba(0,210,255,0.25)');
            g.addColorStop(1, 'rgba(255,107,203,0.32)');
            return g;
        }
        const g = ctx.createLinearGradient(0, h * 0.15, 0, h);
        g.addColorStop(0, rgba(color, 0.05));
        g.addColorStop(0.5, rgba(color, 0.09));
        g.addColorStop(1, rgba(color, 0.14));
        return g;
    }

    function drawJarVisual(ctx, settings, customImg) {
        const layout = getLayout(settings);
        const { jarW, jarH, jarX, jarY } = layout;
        const shape = settings.jarShape || 'classic';
        const color = settings.jarColor || '#bc13fe';
        const floor = jarH - 10;
        const pad = 4;

        // Subtle idle animation for certain shapes
        let swayX = 0, swayRot = 0, breathe = 1;
        if (settings.animate !== false && ANIMATED_SHAPES.has(shape)) {
            const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
            swayX = Math.sin(t * 1.4) * (jarW * 0.012);
            swayRot = Math.sin(t * 1.1) * 0.012;
            breathe = 1 + Math.sin(t * 1.8) * 0.012;
        }

        ctx.save();
        // Pivot at jar bottom-center for natural sway
        ctx.translate(jarX + jarW / 2 + swayX, jarY + jarH);
        ctx.rotate(swayRot);
        ctx.scale(breathe, breathe);
        ctx.translate(-jarW / 2, -jarH);

        if (shape === 'custom' && customImg && customImg.complete && customImg.naturalWidth) {
            const cx = pad - 4, cy = 20;
            const cw = jarW - pad * 2 + 8, ch = jarH - 32;
            ctx.drawImage(customImg, cx, cy, cw, ch);
            tintJarImage(ctx, cx, cy, cw, ch, color);
            ctx.restore();
            return layout;
        }

        if (shape === 'victorian') {
            const img = getBuiltinJarImage('victorian');
            const imgReady = img && img._ok && img.naturalWidth > 0 && !img._fail;
            if (imgReady) {
                const imgW = jarW * 1.55;
                const imgH = imgW;
                const dx = jarW / 2 - imgW / 2;
                const srcY = img.naturalHeight * VIC_LID_CROP;
                const srcH = img.naturalHeight * (1 - VIC_LID_CROP);
                const drawH = imgH * (1 - VIC_LID_CROP);
                const drawY = jarH - drawH;

                if (settings.glowEffect) {
                    ctx.save();
                    ctx.shadowColor = color === 'rainbow' ? '#bc13fe' : color;
                    ctx.shadowBlur = 20;
                    ctx.globalAlpha = 0.4;
                    ctx.drawImage(img, 0, srcY, img.naturalWidth, srcH, dx, drawY, imgW, drawH);
                    ctx.restore();
                }

                ctx.drawImage(img, 0, srcY, img.naturalWidth, srcH, dx, drawY, imgW, drawH);
                tintJarImage(ctx, dx, drawY, imgW, drawH, color);

                // Sparkles above the open rim
                const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
                const pts = [
                    { x: 0.38, y: 0.01 }, { x: 0.50, y: -0.02 }, { x: 0.62, y: 0.01 },
                    { x: 0.44, y: 0.05 }, { x: 0.56, y: 0.05 }
                ];
                pts.forEach((p, i) => {
                    const phase = t * 1.7 + i * 1.35;
                    const glint = Math.max(0, Math.sin(phase));
                    if (glint < 0.05) return;
                    const size = 1.4 + glint * 2.4;
                    const px = dx + p.x * imgW;
                    const py = drawY + p.y * drawH;
                    ctx.save();
                    ctx.globalAlpha = glint * 0.85;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.moveTo(px, py - size);
                    ctx.lineTo(px + size * 0.28, py - size * 0.28);
                    ctx.lineTo(px + size, py);
                    ctx.lineTo(px + size * 0.28, py + size * 0.28);
                    ctx.lineTo(px, py + size);
                    ctx.lineTo(px - size * 0.28, py + size * 0.28);
                    ctx.lineTo(px - size, py);
                    ctx.lineTo(px - size * 0.28, py - size * 0.28);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                });

                ctx.restore();
                return layout;
            }
            // Image not loaded yet — fall back to the round vector shape below
        }

        if (settings.glowEffect) {
            ctx.save();
            ctx.shadowColor = color === 'rainbow' ? '#bc13fe' : color;
            ctx.shadowBlur = 5;
            ctx.globalAlpha = 0.10;
            ctx.beginPath();
            traceJarPath(ctx, shape, jarW, jarH, pad, floor);
            ctx.fillStyle = color === 'rainbow' ? '#bc13fe' : color;
            ctx.fill();
            ctx.restore();
        }

        ctx.beginPath();
        traceJarPath(ctx, shape, jarW, jarH, pad, floor);
        ctx.fillStyle = jarFillGradient(ctx, color, jarW, jarH);
        ctx.fill();

        // Hairline glass edge
        ctx.strokeStyle = rgba(color === 'rainbow' ? '#ffffff' : color, 0.28);
        ctx.lineWidth = 0.35;
        ctx.stroke();

        // Subtle glossy highlight
        ctx.save();
        ctx.clip();
        const hl = ctx.createLinearGradient(0, 0, jarW, 0);
        hl.addColorStop(0, 'rgba(255,255,255,0.12)');
        hl.addColorStop(0.2, 'rgba(255,255,255,0.03)');
        hl.addColorStop(0.5, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.fillRect(0, 0, jarW, jarH);
        ctx.restore();
        ctx.restore();

        return layout;
    }

    class PandyJarEngine {
        constructor(canvas, opts) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.M = (typeof Matter !== 'undefined') ? Matter : null;
            this.settings = normalizeSettings(opts);
            this.bodies = [];
            this.walls = [];
            this.rimWalls = [];
            this.rimActive = false;
            this.imgCache = new Map();
            this.customJarImg = null;
            this.lastDrop = null;
            this.animId = null;
            this.engine = null;
            this.world = null;
            this.maxBodies = 0;
            this._jarFullSince = null;
            this._lastShakeAt = 0;
            this._jarShakeUntil = 0;
            if (this.M && this.canvas) {
                this._resizeCanvas();
                this._initPhysics();
            }
        }

        _resizeCanvas() {
            const { areaW, areaH } = getLayout(this.settings);
            if (this.canvas.width !== areaW || this.canvas.height !== areaH) {
                this.canvas.width = areaW;
                this.canvas.height = areaH;
            }
            this.canvas.style.width = areaW + 'px';
            this.canvas.style.height = areaH + 'px';
            this.canvas.style.maxWidth = '100%';
        }

        _initPhysics() {
            this.engine = this.M.Engine.create({
                gravity: { x: 0, y: 2.2 },
                enableSleeping: true
            });
            this.world = this.engine.world;
            this._rebuildWalls();
        }

        _rebuildWalls() {
            if (!this.M || !this.world) return;
            if (this.walls.length) this.M.World.remove(this.world, this.walls);
            if (this.rimWalls.length) this.M.World.remove(this.world, this.rimWalls);
            this.rimWalls = [];
            this.rimActive = false;
            const layout = getLayout(this.settings);
            this.walls = buildWalls(this.M, this.settings.jarShape, layout);
            this.M.World.add(this.world, this.walls);
            this._syncRimBlockers();
        }

        _syncRimBlockers() {
            if (!this.M || !this.world) return;
            const layout = getLayout(this.settings);
            const { full } = getJarFillState(this.bodies, layout, this.settings.jarShape);

            if (full && this.rimActive) {
                // Jar full — open the lid, gifts spill over sides naturally
                this.M.World.remove(this.world, this.rimWalls);
                this.rimWalls = [];
                this.rimActive = false;
            } else if (!full && !this.rimActive) {
                this.rimWalls = buildRimBlockers(this.M, this.settings.jarShape, layout.jarX, layout.jarW, layout.jarY, layout.jarH);
                this.M.World.add(this.world, this.rimWalls);
                this.rimActive = true;
            }
        }

        /** Shake — only when jar is full; only moves overflow / rim pile, not gifts deep inside */
        shake(strength) {
            if (!this.M || !this.bodies.length) return;
            const layout = getLayout(this.settings);
            const shape = this.settings.jarShape;
            const state = getJarFillState(this.bodies, layout, shape);
            if (!state.full) return;

            const s = strength || 1;
            const { cx, jarX, jarW, jarY, jarH, mouth } = layout;
            const lipY = mouth ? mouth.lipY : layout.rimY;
            let shaken = 0;

            this.bodies.forEach(body => {
                const p = body.position;
                const r = body.circleRadius || 8;
                const inside = isInsideJarInterior(p.x, p.y, shape, jarX, jarW, jarY, jarH);
                const outside = isOverflowGift(p.x, p.y, r, layout, jarX, jarW);
                const atRim = inside && (p.y - r) < lipY + 14;

                if (!outside && !atRim) return;

                if (this.M.Sleeping) this.M.Sleeping.set(body, false);
                if (body.isStatic) this.M.Body.setStatic(body, false);

                let vx = (Math.random() - 0.5) * 9 * s;
                let vy = (Math.random() - 0.5) * 6 * s - 1.5 * s;

                if (outside || atRim) {
                    const dir = p.x <= cx ? -1 : 1;
                    vx += dir * (4 + Math.random() * 6) * s;
                }

                this.M.Body.setVelocity(body, { x: vx, y: vy });
                this.M.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.25 * s);
                shaken++;
            });

            if (shaken > 0) {
                this._jarShakeUntil = Date.now() + 400;
                this._lastShakeAt = Date.now();
            }
        }

        updateSettings(partial) {
            const prevShape = this.settings.jarShape;
            const prevLayout = getLayout(this.settings);
            this.settings = normalizeSettings({ ...this.settings, ...partial });
            this._resizeCanvas();
            const newLayout = getLayout(this.settings);
            if (partial.customJarImage) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.referrerPolicy = 'no-referrer';
                img.onload = () => { img._ok = true; };
                img.onerror = () => { img._fail = true; };
                img.src = partial.customJarImage;
                this.customJarImg = img;
            }
            const sizeChanged = prevLayout.areaW !== newLayout.areaW || prevLayout.areaH !== newLayout.areaH
                || prevLayout.jarW !== newLayout.jarW || prevLayout.jarH !== newLayout.jarH;
            if (prevShape !== this.settings.jarShape || sizeChanged) this._rebuildWalls();
        }

        _getImg(url) {
            if (!url || typeof url !== 'string' || !url.trim()) return null;
            if (this.imgCache.has(url)) return this.imgCache.get(url);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.referrerPolicy = 'no-referrer';
            img.onload = () => { img._ok = true; };
            img.onerror = () => { img._fail = true; };
            img.src = url;
            this.imgCache.set(url, img);
            return img;
        }

        _drawGiftBody(body) {
            const pos = body.position;
            const r = body.circleRadius || 14;
            const drop = body.giftDrop || {};
            const img = drop.giftIcon ? this._getImg(drop.giftIcon) : null;
            const imgReady = img && img._ok && img.naturalWidth > 0 && !img._fail;

            if (imgReady) {
                this.ctx.drawImage(img, pos.x - r, pos.y - r, r * 2, r * 2);
                return;
            }

            const emoji = drop.giftEmoji || giftEmojiFor(drop);
            this.ctx.font = `${Math.round(r * 1.35)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(emoji, pos.x, pos.y + 1);
        }

        spawnDrop(drop) {
            if (!this.M || !this.world) return;
            this.lastDrop = drop;
            const layout = getLayout(this.settings);
            const pp = getPhysicsParams(this.settings.bounceMode, this.settings.bounceStrength);
            const gScale = this.settings.giftScale || 1;
            const count = Math.min(drop.repeatCount || 1, 8);
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    const r = giftRadiusForCoins(drop.coins || 1, gScale);
                    const mouth = layout.mouth;
                    const spawnW = mouth ? mouth.mouthWidth * 0.86 : layout.jarW * 0.36;
                    const spawnCx = mouth ? mouth.mouthCenterX : layout.cx;
                    const x = spawnCx - spawnW / 2 + Math.random() * spawnW;
                    const spawnY = Math.max(r + 4, layout.dropTop + r);
                    const body = this.M.Bodies.circle(x, spawnY, r, {
                        restitution: pp.restitution,
                        friction: pp.friction,
                        frictionAir: pp.frictionAir,
                        density: pp.density,
                        label: 'gift',
                        slop: 0.01
                    });
                    body.giftDrop = { ...drop, giftEmoji: drop.giftEmoji || giftEmojiFor(drop) };
                    this.M.Body.setVelocity(body, { x: (Math.random() - 0.5) * 3, y: 8 + Math.random() * 3 });
                    this.M.World.add(this.world, body);
                    this.bodies.push(body);
                    if (this.maxBodies > 0) {
                        while (this.bodies.length > this.maxBodies) {
                            const old = this.bodies.shift();
                            this.M.World.remove(this.world, old);
                        }
                    }
                    if (i === count - 1) {
                        setTimeout(() => this._maybeShakeAfterDrop(count), 1800);
                    }
                }, i * 70);
            }
        }

        _maybeShakeAfterDrop(batchSize) {
            const layout = getLayout(this.settings);
            const state = getJarFillState(this.bodies, layout, this.settings.jarShape);
            if (!state.full || !state.overflowing) return;
            const sinceShake = Date.now() - (this._lastShakeAt || 0);
            if (sinceShake < 4000) return;
            const largeBatch = (batchSize || 1) >= 4;
            if (largeBatch || state.countOutside >= 12) this.shake(0.85);
        }

        clearBodies() {
            if (!this.M || !this.world) return;
            this.bodies.forEach(b => {
                if (b.isStatic) this.M.Body.setStatic(b, false);
                this.M.World.remove(this.world, b);
            });
            this.bodies = [];
            this._jarFullSince = null;
            this._lastShakeAt = 0;
        }

        start() {
            if (this.animId) return;
            const loop = () => {
                if (this.bodies.length && this.M && this.engine) {
                    this.M.Engine.update(this.engine, 1000 / 60);
                }
                this._syncRimBlockers();

                let shakeX = 0, shakeY = 0;
                if (this._jarShakeUntil && Date.now() < this._jarShakeUntil) {
                    shakeX = (Math.random() - 0.5) * 5;
                    shakeY = (Math.random() - 0.5) * 4;
                }

                const w = this.canvas.width;
                const h = this.canvas.height;
                this.ctx.clearRect(0, 0, w, h);
                this.ctx.save();
                this.ctx.translate(shakeX, shakeY);
                drawJarVisual(this.ctx, this.settings, this.customJarImg);
                this.bodies.forEach(body => this._drawGiftBody(body));
                this.ctx.restore();
                this.animId = requestAnimationFrame(loop);
            };
            loop();
        }

        stop() {
            if (this.animId) cancelAnimationFrame(this.animId);
            this.animId = null;
        }

        destroy() {
            this.stop();
            this.clearBodies();
        }
    }

    global.PandyJar = {
        JAR_SHAPES,
        JAR_COLOR_PRESETS,
        normalizeSettings,
        getLayout,
        buildWalls,
        drawJarVisual,
        giftEmojiFor,
        giftRadiusForCoins,
        isInsideJarInterior,
        isInJarColumn,
        getJarFillState,
        getJarMouth,
        isOverflowGift,
        PandyJarEngine
    };
})(typeof window !== 'undefined' ? window : global);
