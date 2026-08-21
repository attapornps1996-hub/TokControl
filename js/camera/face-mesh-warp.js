/**
 * TokControl Face Mesh Warp — MediaPipe Face Mesh (468) + WebGL displacement
 * Falls back to geometric region warp when MediaPipe is unavailable.
 */
(function () {
    'use strict';

    const MEDIAPIPE_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619';
    const FACE_MESH_CDN = `${MEDIAPIPE_BASE}/face_mesh.js`;

    /** Landmark index groups (MediaPipe Face Mesh topology) */
    const IDX = {
        oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
        leftCheek: [50, 101, 205, 187, 147],
        rightCheek: [280, 330, 425, 411, 376],
        jawL: [172, 136, 150, 149, 176, 148],
        jawR: [397, 365, 379, 378, 400, 377],
        chin: [152, 377, 400, 378, 379, 365, 397, 172, 136, 150, 149, 176, 148],
        leftEye: [33, 133, 160, 159, 158, 157, 173, 144, 145, 153],
        rightEye: [263, 362, 387, 386, 385, 384, 398, 373, 374, 380],
        leftBrow: [70, 63, 105, 66, 107],
        rightBrow: [300, 293, 334, 296, 336],
        noseBridge: [6, 197, 195, 5, 4],
        noseTip: [1, 2, 98, 327],
        noseWingL: [48, 64, 98],
        noseWingR: [278, 294, 327],
        upperLip: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
        lowerLip: [146, 91, 181, 84, 17, 314, 405, 321, 375, 291]
    };

    let loadPromise = null;
    let FaceMeshCtor = null;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-tc-face="${src}"]`);
            if (existing) {
                if (existing.dataset.ready === '1') return resolve();
                existing.addEventListener('load', () => resolve());
                existing.addEventListener('error', () => reject(new Error('load failed')));
                return;
            }
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.dataset.tcFace = src;
            s.onload = () => { s.dataset.ready = '1'; resolve(); };
            s.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(s);
        });
    }

    function ensureMediaPipe() {
        if (FaceMeshCtor) return Promise.resolve(FaceMeshCtor);
        if (window.FaceMesh) {
            FaceMeshCtor = window.FaceMesh;
            return Promise.resolve(FaceMeshCtor);
        }
        if (!loadPromise) {
            loadPromise = loadScript(FACE_MESH_CDN).then(() => {
                FaceMeshCtor = window.FaceMesh;
                if (!FaceMeshCtor) throw new Error('FaceMesh missing');
                return FaceMeshCtor;
            }).catch((err) => {
                loadPromise = null;
                throw err;
            });
        }
        return loadPromise;
    }

    function avgPoint(landmarks, indices, w, h) {
        let x = 0;
        let y = 0;
        let n = 0;
        for (const i of indices) {
            const p = landmarks[i];
            if (!p) continue;
            x += p.x * w;
            y += p.y * h;
            n++;
        }
        if (!n) return null;
        return { x: x / n, y: y / n };
    }

    function boundsOf(landmarks, indices, w, h) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const i of indices) {
            const p = landmarks[i];
            if (!p) continue;
            const x = p.x * w;
            const y = p.y * h;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        if (!Number.isFinite(minX)) return null;
        return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
    }

    function createWebGlWarper(canvas) {
        const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: false });
        if (!gl) return null;

        const vs = `
            attribute vec2 a_pos;
            attribute vec2 a_uv;
            varying vec2 v_uv;
            void main() {
                v_uv = a_uv;
                gl_Position = vec4(a_pos, 0.0, 1.0);
            }
        `;
        const fs = `
            precision mediump float;
            varying vec2 v_uv;
            uniform sampler2D u_tex;
            uniform vec2 u_face;      // face center uv
            uniform vec2 u_faceSize;  // face oval size uv
            uniform float u_vshape;
            uniform float u_faceLen;
            uniform float u_jaw;
            uniform float u_cheek;
            uniform float u_eyeSize;
            uniform float u_eyeDist;
            uniform float u_eyeOuter;
            uniform float u_noseBridge;
            uniform float u_noseSlim;
            uniform float u_lip;
            uniform float u_brow;
            uniform vec2 u_leftEye;
            uniform vec2 u_rightEye;
            uniform vec2 u_nose;
            uniform vec2 u_mouth;
            uniform vec2 u_browL;
            uniform vec2 u_browR;

            float falloff(vec2 uv, vec2 c, float rx, float ry) {
                vec2 d = (uv - c) / max(vec2(0.001), vec2(rx, ry));
                float r = length(d);
                return smoothstep(1.0, 0.0, r);
            }

            void main() {
                vec2 uv = v_uv;
                vec2 face = u_face;
                float w = max(0.08, u_faceSize.x);
                float h = max(0.10, u_faceSize.y);

                // V-shape / jaw / cheek — pull toward center on lower face
                float lower = smoothstep(face.y - h * 0.15, face.y + h * 0.85, uv.y);
                float side = abs(uv.x - face.x) / w;
                float vAmt = (u_vshape * 0.055 + u_jaw * 0.04) * lower * side;
                uv.x += (face.x - uv.x) * vAmt;
                float cheekAmt = u_cheek * 0.035 * falloff(uv, face + vec2(0.0, h * 0.15), w * 0.75, h * 0.55);
                uv.x += (face.x - uv.x) * cheekAmt;

                // Face length
                uv.y += (face.y - uv.y) * (-u_faceLen * 0.045) * falloff(uv, face, w * 0.9, h * 1.05);

                // Eyes enlarge + distance + outer corner lift
                float eL = falloff(uv, u_leftEye, w * 0.22, h * 0.14);
                float eR = falloff(uv, u_rightEye, w * 0.22, h * 0.14);
                uv += (uv - u_leftEye) * (u_eyeSize * 0.12) * eL;
                uv += (uv - u_rightEye) * (u_eyeSize * 0.12) * eR;
                uv.x += u_eyeDist * 0.03 * eL;
                uv.x -= u_eyeDist * 0.03 * eR;
                uv.y -= u_eyeOuter * 0.025 * eL * max(0.0, (u_leftEye.x - uv.x));
                uv.y -= u_eyeOuter * 0.025 * eR * max(0.0, (uv.x - u_rightEye.x));

                // Nose
                float n = falloff(uv, u_nose, w * 0.18, h * 0.28);
                uv.y += (u_nose.y - h * 0.35 - uv.y) * (u_noseBridge * 0.04) * n;
                uv.x += (u_nose.x - uv.x) * (u_noseSlim * 0.08) * n;

                // Lips
                float m = falloff(uv, u_mouth, w * 0.28, h * 0.12);
                uv.y += (uv.y - u_mouth.y) * (u_lip * 0.07) * m;

                // Brows
                float bL = falloff(uv, u_browL, w * 0.2, h * 0.08);
                float bR = falloff(uv, u_browR, w * 0.2, h * 0.08);
                uv.y += (-u_brow * 0.03) * (bL + bR);
                uv.y += (uv.y - u_browL.y) * (abs(u_brow) * 0.04) * bL;
                uv.y += (uv.y - u_browR.y) * (abs(u_brow) * 0.04) * bR;

                uv = clamp(uv, 0.001, 0.999);
                gl_FragColor = texture2D(u_tex, uv);
            }
        `;

        function compile(type, src) {
            const sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.warn('[FaceMeshWarp]', gl.getShaderInfoLog(sh));
                gl.deleteShader(sh);
                return null;
            }
            return sh;
        }

        const vsh = compile(gl.VERTEX_SHADER, vs);
        const fsh = compile(gl.FRAGMENT_SHADER, fs);
        if (!vsh || !fsh) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vsh);
        gl.attachShader(prog, fsh);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn('[FaceMeshWarp] link', gl.getProgramInfoLog(prog));
            return null;
        }

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 0, 1,
            1, -1, 1, 1,
            -1, 1, 0, 0,
            1, 1, 1, 0
        ]), gl.STATIC_DRAW);

        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        const locs = {
            a_pos: gl.getAttribLocation(prog, 'a_pos'),
            a_uv: gl.getAttribLocation(prog, 'a_uv'),
            u_tex: gl.getUniformLocation(prog, 'u_tex'),
            u_face: gl.getUniformLocation(prog, 'u_face'),
            u_faceSize: gl.getUniformLocation(prog, 'u_faceSize'),
            u_vshape: gl.getUniformLocation(prog, 'u_vshape'),
            u_faceLen: gl.getUniformLocation(prog, 'u_faceLen'),
            u_jaw: gl.getUniformLocation(prog, 'u_jaw'),
            u_cheek: gl.getUniformLocation(prog, 'u_cheek'),
            u_eyeSize: gl.getUniformLocation(prog, 'u_eyeSize'),
            u_eyeDist: gl.getUniformLocation(prog, 'u_eyeDist'),
            u_eyeOuter: gl.getUniformLocation(prog, 'u_eyeOuter'),
            u_noseBridge: gl.getUniformLocation(prog, 'u_noseBridge'),
            u_noseSlim: gl.getUniformLocation(prog, 'u_noseSlim'),
            u_lip: gl.getUniformLocation(prog, 'u_lip'),
            u_brow: gl.getUniformLocation(prog, 'u_brow'),
            u_leftEye: gl.getUniformLocation(prog, 'u_leftEye'),
            u_rightEye: gl.getUniformLocation(prog, 'u_rightEye'),
            u_nose: gl.getUniformLocation(prog, 'u_nose'),
            u_mouth: gl.getUniformLocation(prog, 'u_mouth'),
            u_browL: gl.getUniformLocation(prog, 'u_browL'),
            u_browR: gl.getUniformLocation(prog, 'u_browR')
        };

        function draw(sourceCanvas, landmarks, params, mirror) {
            const w = canvas.width;
            const h = canvas.height;
            if (!w || !h) return false;

            const face = landmarks
                ? boundsOf(landmarks, IDX.oval, w, h)
                : { cx: w * 0.5, cy: h * 0.42, w: w * 0.42, h: h * 0.55 };
            if (!face) return false;

            const leftEye = landmarks ? avgPoint(landmarks, IDX.leftEye, w, h) : { x: face.cx - face.w * 0.22, y: face.cy - face.h * 0.12 };
            const rightEye = landmarks ? avgPoint(landmarks, IDX.rightEye, w, h) : { x: face.cx + face.w * 0.22, y: face.cy - face.h * 0.12 };
            const nose = landmarks ? avgPoint(landmarks, IDX.noseTip, w, h) : { x: face.cx, y: face.cy + face.h * 0.05 };
            const mouth = landmarks ? avgPoint(landmarks, [...IDX.upperLip, ...IDX.lowerLip], w, h) : { x: face.cx, y: face.cy + face.h * 0.28 };
            const browL = landmarks ? avgPoint(landmarks, IDX.leftBrow, w, h) : { x: leftEye.x, y: leftEye.y - face.h * 0.1 };
            const browR = landmarks ? avgPoint(landmarks, IDX.rightBrow, w, h) : { x: rightEye.x, y: rightEye.y - face.h * 0.1 };

            const toUv = (p) => {
                if (!p) return [0.5, 0.5];
                let x = p.x / w;
                const y = p.y / h;
                if (mirror) x = 1 - x;
                return [x, y];
            };

            gl.viewport(0, 0, w, h);
            gl.useProgram(prog);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.enableVertexAttribArray(locs.a_pos);
            gl.vertexAttribPointer(locs.a_pos, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(locs.a_uv);
            gl.vertexAttribPointer(locs.a_uv, 2, gl.FLOAT, false, 16, 8);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
            gl.uniform1i(locs.u_tex, 0);

            const faceUv = toUv({ x: face.cx, y: face.cy });
            gl.uniform2f(locs.u_face, faceUv[0], faceUv[1]);
            gl.uniform2f(locs.u_faceSize, face.w / w, face.h / h);

            const n = (v) => Math.max(-1, Math.min(1, (Number(v) || 0) / 100));
            gl.uniform1f(locs.u_vshape, n(params.faceSlim || params.vShape));
            gl.uniform1f(locs.u_faceLen, n(params.faceLength || params.chinLength));
            gl.uniform1f(locs.u_jaw, n(params.jawline));
            gl.uniform1f(locs.u_cheek, n(params.cheekbones));
            gl.uniform1f(locs.u_eyeSize, n(params.eyesEnlarge));
            gl.uniform1f(locs.u_eyeDist, n(params.eyeDistance));
            gl.uniform1f(locs.u_eyeOuter, n(params.eyeOuter));
            gl.uniform1f(locs.u_noseBridge, n(params.noseBridge));
            gl.uniform1f(locs.u_noseSlim, n(params.noseSlim));
            gl.uniform1f(locs.u_lip, n(params.lipSize));
            gl.uniform1f(locs.u_brow, n(params.eyebrow));

            gl.uniform2fv(locs.u_leftEye, toUv(leftEye));
            gl.uniform2fv(locs.u_rightEye, toUv(rightEye));
            gl.uniform2fv(locs.u_nose, toUv(nose));
            gl.uniform2fv(locs.u_mouth, toUv(mouth));
            gl.uniform2fv(locs.u_browL, toUv(browL));
            gl.uniform2fv(locs.u_browR, toUv(browR));

            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            return true;
        }

        return { gl, draw, canvas };
    }

    function createTracker() {
        let mesh = null;
        let ready = false;
        let lastLandmarks = null;
        let lastDetectAt = 0;
        let detecting = false;
        let enabled = true;
        let status = 'idle';

        async function init() {
            status = 'loading';
            try {
                await ensureMediaPipe();
                mesh = new FaceMeshCtor({
                    locateFile: (file) => `${MEDIAPIPE_BASE}/${file}`
                });
                mesh.setOptions({
                    maxNumFaces: 1,
                    refineLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                mesh.onResults((results) => {
                    detecting = false;
                    if (results?.multiFaceLandmarks?.[0]) {
                        lastLandmarks = results.multiFaceLandmarks[0];
                        status = 'tracking';
                    } else {
                        lastLandmarks = null;
                        status = 'no-face';
                    }
                });
                ready = true;
                status = 'ready';
                return true;
            } catch (err) {
                console.warn('[FaceMeshWarp] MediaPipe unavailable — geometric fallback', err?.message || err);
                ready = false;
                status = 'fallback';
                return false;
            }
        }

        function requestDetect(video) {
            if (!enabled || !ready || !mesh || !video || video.readyState < 2 || detecting) return;
            const now = performance.now();
            if (now - lastDetectAt < 33) return; // ~30 Hz detect, warp still 60fps
            lastDetectAt = now;
            detecting = true;
            mesh.send({ image: video }).catch(() => { detecting = false; });
        }

        return {
            init,
            requestDetect,
            getLandmarks: () => lastLandmarks,
            getStatus: () => status,
            setEnabled: (on) => { enabled = !!on; },
            isReady: () => ready
        };
    }

    function needsWarp(params) {
        const keys = [
            'faceSlim', 'vShape', 'faceLength', 'chinLength', 'jawline', 'cheekbones',
            'eyesEnlarge', 'eyeDistance', 'eyeOuter', 'noseBridge', 'noseSlim',
            'lipSize', 'eyebrow'
        ];
        return keys.some((k) => Math.abs(Number(params?.[k]) || 0) >= 2);
    }

    window.TokControlFaceMesh = {
        IDX,
        ensureMediaPipe,
        createWebGlWarper,
        createTracker,
        needsWarp,
        boundsOf,
        avgPoint
    };
})();
