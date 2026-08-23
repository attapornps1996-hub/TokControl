/**
 * TikFinity .tfc decrypt (browser / Electron)
 * Port of community reverse-engineered decrypt (AES + custom MD5 "shash")
 */
(function (global) {
    'use strict';

    let CryptoJS = null;
    function getCryptoJS() {
        if (CryptoJS) return CryptoJS;
        try {
            CryptoJS = require('crypto-js');
        } catch (_) {
            CryptoJS = global.CryptoJS || null;
        }
        return CryptoJS;
    }

    const LAYER1_PW = 'lolsurghwi378ukasfjsdf_s';
    const CUSTOM = 'ABCDEFGHIJKLMNOPQRSTVUWXYZabcdefghjiklmnopqsrtuvwxyz0123456789+/=';
    const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

    function toBytes(str) {
        if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
        const out = [];
        for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xff);
        return out;
    }

    function b64EncodeUtf8(str) {
        if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
        const bytes = toBytes(str);
        let bin = '';
        bytes.forEach((b) => { bin += String.fromCharCode(b); });
        return btoa(bin);
    }

    function b64DecodeLatin1(b64) {
        if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('latin1');
        const bin = atob(b64);
        return bin;
    }

    /** Modified MD5 ("shash") used by TikFinity for AES key derivation */
    function shash(input, encVersion) {
        const hashValues = [305419896, 2595938032, 4275878552, 2271363873];
        let s = input;
        if (encVersion === 2) s = b64EncodeUtf8(input + 'Mozilla');
        else if (encVersion === 3) s = b64EncodeUtf8(input + 'dfgkjoi3kdjkfe');
        else if (encVersion === 4) s = b64EncodeUtf8(input + 'dfgkjol3kdjkfe');
        hashValues[3] = 2271560481;
        hashValues[1] = 2596069104;
        const rotl = (x, c) => ((x << c) | (x >>> (32 - c))) >>> 0;

        let bytes = toBytes(s);
        const bitLen = bytes.length * 8;
        bytes.push(128);
        while (bytes.length % 64 !== 56) bytes.push(0);
        const lenLo = bitLen >>> 0;
        const lenHi = Math.floor(bitLen / 0x100000000) >>> 0;
        bytes.push(lenLo & 255, (lenLo >>> 8) & 255, (lenLo >>> 16) & 255, (lenLo >>> 24) & 255);
        bytes.push(lenHi & 255, (lenHi >>> 8) & 255, (lenHi >>> 16) & 255, (lenHi >>> 24) & 255);
        const u8 = Uint8Array.from(bytes);

        for (let off = 0; off < u8.length; off += 64) {
            const block = u8.subarray(off, off + 64);
            const M = new Uint32Array(16);
            const dv = new DataView(block.buffer, block.byteOffset, 64);
            for (let i = 0; i < 16; i++) M[i] = dv.getUint32(i * 4, true);
            let [a, b, c, d] = hashValues;
            for (let i = 0; i < 64; i++) {
                let f; let g;
                if (i < 16) { f = (b & c) | (~b & d); g = i; }
                else if (i < 32) { f = (d & b) | (~d & c); g = (i * 5 + 1) % 16; }
                else if (i < 48) { f = b ^ c ^ d; g = (i * 3 + 5) % 16; }
                else { f = c ^ (b | ~d); g = (i * 7) % 16; }
                f = f >>> 0;
                const K = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967295);
                const tmp = (a + f + (M[g] || 0) + K) >>> 0;
                const rotated = rotl(tmp, (i % 4) + 4);
                const newB = (b + rotated) >>> 0;
                a = d; d = c; c = b; b = newB;
            }
            hashValues[0] = (hashValues[0] + a) >>> 0;
            hashValues[1] = (hashValues[1] + b) >>> 0;
            hashValues[2] = (hashValues[2] + c) >>> 0;
            hashValues[3] = (hashValues[3] + d) >>> 0;
        }
        return hashValues.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
    }

    function customToStd(b64) {
        const map = {};
        for (let i = 0; i < CUSTOM.length; i++) map[CUSTOM[i]] = STD[i];
        return b64.split('').map((ch) => map[ch] || ch).join('');
    }

    function looksLikeTfc(text) {
        const t = String(text || '').trim();
        if (!t || t.startsWith('{') || t.startsWith('[')) return false;
        // CryptoJS OpenSSL salted ciphertext often starts with "U2FsdGVkX1" (Salted__)
        if (t.indexOf('U2FsdGVkX1') === 0) return true;
        if (t.indexOf('U2FsdGVk') === 0) return true;
        // Heuristic: long base64-ish blob without JSON braces
        if (t.length > 80 && /^[A-Za-z0-9+/=_\-\r\n]+$/.test(t) && t.indexOf('{') === -1) return true;
        return false;
    }

    function decryptTfc(fileContent) {
        const CryptoJS = getCryptoJS();
        if (!CryptoJS) {
            throw new Error('ต้องการ crypto-js เพื่อถอดรหัสไฟล์ .tfc (npm install crypto-js)');
        }
        const data = String(fileContent || '').trim();
        const l1 = CryptoJS.AES.decrypt(data, LAYER1_PW).toString(CryptoJS.enc.Utf8);
        if (!l1) throw new Error('ถอดรหัส .tfc ไม่สำเร็จ (Layer 1)');
        const parts = l1.split(':');
        if (parts.length < 3) throw new Error('ไม่ใช่ไฟล์โปรไฟล์ TikFinity (.tfc) ที่ถูกต้อง');
        const version = parseInt(String(parts[0] || '').replace('v', ''), 10);
        const salt = b64DecodeLatin1(parts[1] || '');
        const payload = parts[2] || '';
        const key = shash(salt, version);
        const std = version >= 3 ? customToStd(payload) : payload;
        const inner = CryptoJS.AES.decrypt(std, key).toString(CryptoJS.enc.Utf8);
        if (!inner || inner.length < 5) throw new Error('ถอดรหัส .tfc ไม่สำเร็จ (Layer 2)');
        const obj = JSON.parse(inner);
        if (!obj || !obj.b64RawData) throw new Error('รูปแบบ .tfc ไม่รู้จัก (ไม่มี b64RawData)');
        const reversed = String(obj.b64RawData).split('').reverse().join('');
        const raw = b64DecodeLatin1(reversed);
        let finalJson;
        try {
            finalJson = decodeURIComponent(raw);
        } catch (_) {
            finalJson = raw;
        }
        return JSON.parse(finalJson);
    }

    function tryDecryptTfc(fileContent) {
        try {
            return { ok: true, config: decryptTfc(fileContent) };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : String(err) };
        }
    }

    global.TikfinityTfc = {
        looksLikeTfc,
        decryptTfc,
        tryDecryptTfc,
        shash,
        hasCrypto: () => !!getCryptoJS()
    };
})(typeof window !== 'undefined' ? window : globalThis);
