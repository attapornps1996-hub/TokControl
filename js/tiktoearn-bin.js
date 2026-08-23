/**
 * TikToEarn export_tiktoearn.bin
 * Envelope: { v:1, alg:"AES-256-CBC", data:<base64>, sig:<hmac-sha256 hex> }
 * Inner JSON is the PHP event_action dump (action_event / sound_event).
 */
(function (global) {
    'use strict';

    let nodeCrypto = null;
    let CryptoJS = null;

    function bindLibs() {
        if (!nodeCrypto) {
            try { nodeCrypto = require('crypto'); } catch (_) { nodeCrypto = null; }
        }
        if (!CryptoJS) {
            try { CryptoJS = require('crypto-js'); } catch (_) {
                CryptoJS = global.CryptoJS || null;
            }
        }
        return CryptoJS;
    }

    function hasSubtle() {
        return !!(global.crypto && global.crypto.subtle);
    }

    function hasCrypto() {
        bindLibs();
        return !!(nodeCrypto || CryptoJS || hasSubtle());
    }

    const TTE_API = 'https://api.tiktoearn.com';
    const DECRYPT_FAIL_MSG = 'ไฟล์ TikToEarn .bin นี้เข้ารหัส AES-256-CBC ด้วยคีย์ฝั่งเซิร์ฟเวอร์ของ TikToEarn — ถอดรหัสไม่ได้จากไฟล์อย่างเดียว ถ้ามีไฟล์ JSON (event_action / action_event) ให้เลือกไฟล์นั้นแทน';

    /** Format identifiers used as AES material (same idea as TikFinity's client password). */
    const KEY_SEEDS = [
        'TikToEarn',
        'tiktoearn',
        'tiktoearn-export-v1',
        'export_tiktoearn',
        'tte-export-v1'
    ];

    function isEnvelope(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        const alg = String(obj.alg || obj.algorithm || '').toUpperCase();
        return !!(obj.data && (alg === 'AES-256-CBC' || alg.indexOf('AES-256') === 0) && (obj.v != null || obj.sig));
    }

    function looksLikeEnvelopeText(text) {
        const t = String(text || '').replace(/^\uFEFF/, '').trim();
        if (!t || t.charAt(0) !== '{') return false;
        if (t.indexOf('AES-256-CBC') < 0 && t.indexOf('aes-256-cbc') < 0) return false;
        try {
            return isEnvelope(JSON.parse(t));
        } catch (_) {
            return false;
        }
    }

    function padKey(str, len) {
        const out = new Uint8Array(len);
        const src = typeof TextEncoder !== 'undefined'
            ? new TextEncoder().encode(String(str || ''))
            : Buffer.from(String(str || ''), 'utf8');
        out.set(src.subarray(0, len));
        return out;
    }

    function toAb(u8) {
        if (!u8) return new ArrayBuffer(0);
        if (u8 instanceof ArrayBuffer) return u8;
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    }

    async function sha256Bytes(str) {
        bindLibs();
        if (nodeCrypto) return new Uint8Array(nodeCrypto.createHash('sha256').update(String(str), 'utf8').digest());
        if (hasSubtle()) {
            const enc = new TextEncoder().encode(String(str));
            const buf = await global.crypto.subtle.digest('SHA-256', enc);
            return new Uint8Array(buf);
        }
        if (CryptoJS) {
            const wa = CryptoJS.SHA256(String(str));
            const words = wa.words;
            const out = new Uint8Array(32);
            for (let i = 0; i < 8; i++) {
                const w = words[i];
                out[i * 4] = (w >>> 24) & 255;
                out[i * 4 + 1] = (w >>> 16) & 255;
                out[i * 4 + 2] = (w >>> 8) & 255;
                out[i * 4 + 3] = w & 255;
            }
            return out;
        }
        throw new Error('ต้องการ crypto เพื่อถอดรหัสไฟล์ TikToEarn');
    }

    function b64ToBytes(b64) {
        const s = String(b64 || '').replace(/\s+/g, '');
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function bytesToUtf8(u8) {
        if (typeof TextDecoder !== 'undefined') {
            try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (_) {}
        }
        if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('utf8');
        let s = '';
        for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return s;
    }

    function looksLikeJsonObject(text) {
        const t = String(text || '').replace(/^\uFEFF/, '').trim();
        return t.charAt(0) === '{' || t.charAt(0) === '[';
    }

    function tryParseJson(text) {
        const t = String(text || '').replace(/^\uFEFF/, '').trim();
        if (!looksLikeJsonObject(t)) return null;
        try {
            return JSON.parse(t);
        } catch (_) {
            const start = t.indexOf('{');
            const end = t.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try { return JSON.parse(t.slice(start, end + 1)); } catch (__) { return null; }
            }
            return null;
        }
    }

    async function decryptCbc(keyBytes, ivBytes, cipherBytes) {
        if (!keyBytes || keyBytes.length !== 32) return null;
        if (!ivBytes || ivBytes.length !== 16) return null;
        if (!cipherBytes || !cipherBytes.length || (cipherBytes.length % 16) !== 0) return null;
        bindLibs();
        if (nodeCrypto) {
            try {
                const d = nodeCrypto.createDecipheriv('aes-256-cbc', Buffer.from(keyBytes), Buffer.from(ivBytes));
                const pt = Buffer.concat([d.update(Buffer.from(cipherBytes)), d.final()]);
                return bytesToUtf8(pt);
            } catch (_) {}
        }
        if (CryptoJS) {
            try {
                const keyWa = CryptoJS.lib.WordArray.create(keyBytes);
                const ivWa = CryptoJS.lib.WordArray.create(ivBytes);
                const ctWa = CryptoJS.lib.WordArray.create(cipherBytes);
                const dec = CryptoJS.AES.decrypt({ ciphertext: ctWa }, keyWa, {
                    iv: ivWa,
                    mode: CryptoJS.mode.CBC,
                    padding: CryptoJS.pad.Pkcs7
                });
                const text = dec.toString(CryptoJS.enc.Utf8);
                if (text) return text;
            } catch (_) {}
        }
        if (hasSubtle()) {
            try {
                const key = await global.crypto.subtle.importKey(
                    'raw',
                    toAb(keyBytes),
                    { name: 'AES-CBC' },
                    false,
                    ['decrypt']
                );
                const pt = await global.crypto.subtle.decrypt(
                    { name: 'AES-CBC', iv: toAb(ivBytes) },
                    key,
                    toAb(cipherBytes)
                );
                return bytesToUtf8(new Uint8Array(pt));
            } catch (_) {
                return null;
            }
        }
        return null;
    }

    async function tryDecryptBuffer(raw, secret) {
        const shaKey = await sha256Bytes(secret);
        const phpKey = padKey(secret, 32);
        const keys = [shaKey, phpKey];
        const zeroIv = new Uint8Array(16);

        for (let k = 0; k < keys.length; k++) {
            const key = keys[k];
            if (raw.length > 16) {
                const text = await decryptCbc(key, raw.subarray(0, 16), raw.subarray(16));
                const obj = tryParseJson(text);
                if (obj) return obj;
            }
            if (raw.length >= 16 && (raw.length % 16) === 0) {
                const text = await decryptCbc(key, zeroIv, raw);
                const obj = tryParseJson(text);
                if (obj) return obj;
            }
        }

        bindLibs();
        if (CryptoJS) {
            try {
                const latin = (typeof Buffer !== 'undefined')
                    ? Buffer.from(raw).toString('latin1')
                    : bytesToUtf8(raw);
                const b64 = (typeof Buffer !== 'undefined')
                    ? Buffer.from(raw).toString('base64')
                    : btoa(latin);
                const dec = CryptoJS.AES.decrypt(b64, String(secret));
                const text = dec && dec.toString(CryptoJS.enc.Utf8);
                const obj = tryParseJson(text);
                if (obj) return obj;
            } catch (_) {}
        }
        return null;
    }

    async function decryptEnvelope(obj) {
        bindLibs();
        if (!isEnvelope(obj)) throw new Error('ไม่ใช่ไฟล์ export ของ TikToEarn');
        if (!hasCrypto()) {
            throw new Error('ยังโหลด crypto ไม่ได้ — ติดตั้ง crypto-js แล้วรีสตาร์ทแอปเพื่อถอดรหัส TikToEarn .bin');
        }
        const raw = b64ToBytes(obj.data);
        if (!raw.length) throw new Error('ไฟล์ TikToEarn ว่าง');

        for (let i = 0; i < KEY_SEEDS.length; i++) {
            const got = await tryDecryptBuffer(raw, KEY_SEEDS[i]);
            if (got) return got;
            if (CryptoJS) {
                try {
                    const text = CryptoJS.AES.decrypt(String(obj.data), KEY_SEEDS[i]).toString(CryptoJS.enc.Utf8);
                    const parsed = tryParseJson(text);
                    if (parsed) return parsed;
                } catch (_) {}
            }
        }

        throw new Error(DECRYPT_FAIL_MSG);
    }

    async function decryptText(text) {
        const t = String(text || '').replace(/^\uFEFF/, '').trim();
        if (!t) throw new Error('ไฟล์ว่าง');
        const obj = JSON.parse(t);
        return decryptEnvelope(obj);
    }

    function absMediaUrl(s) {
        const v = String(s || '').trim();
        if (!v) return null;
        if (/^data:/i.test(v) || /^https?:\/\//i.test(v) || /^blob:/i.test(v)) return v;
        if (v.charAt(0) === '/') return TTE_API + v;
        if (/^(public|uploads|storage|assets)\//i.test(v)) return TTE_API + '/' + v.replace(/^\/+/, '');
        return v;
    }

    global.TikToEarnBin = {
        isEnvelope,
        looksLikeEnvelopeText,
        decryptEnvelope,
        decryptText,
        absMediaUrl,
        TTE_API,
        DECRYPT_FAIL_MSG,
        hasCrypto
    };
})(typeof window !== 'undefined' ? window : globalThis);
