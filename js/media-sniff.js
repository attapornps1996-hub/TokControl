/**
 * Detect real media type from bytes (TikFinity/BetterTok often store mp3/png/gif as .bin).
 * Works in browser and Node.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.TokMediaSniff = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function asU8(input) {
        if (!input) return new Uint8Array(0);
        if (input instanceof Uint8Array) return input;
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(input)) {
            return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        }
        if (input instanceof ArrayBuffer) return new Uint8Array(input);
        if (ArrayBuffer.isView(input)) {
            return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        }
        return new Uint8Array(0);
    }

    function asciiAt(u8, i, str) {
        for (var j = 0; j < str.length; j++) {
            if (u8[i + j] !== str.charCodeAt(j)) return false;
        }
        return true;
    }

    function sniff(bytes) {
        var u8 = asU8(bytes);
        var empty = { mime: 'application/octet-stream', ext: '.bin', kind: 'bin' };
        if (!u8.length) return empty;

        if (u8[0] === 0x89 && asciiAt(u8, 1, 'PNG')) return { mime: 'image/png', ext: '.png', kind: 'image' };
        if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return { mime: 'image/jpeg', ext: '.jpg', kind: 'image' };
        if (asciiAt(u8, 0, 'GIF8')) return { mime: 'image/gif', ext: '.gif', kind: 'image' };
        if (asciiAt(u8, 0, 'BM')) return { mime: 'image/bmp', ext: '.bmp', kind: 'image' };
        if (asciiAt(u8, 0, 'RIFF') && asciiAt(u8, 8, 'WEBP')) return { mime: 'image/webp', ext: '.webp', kind: 'image' };
        if (asciiAt(u8, 0, 'RIFF') && asciiAt(u8, 8, 'WAVE')) return { mime: 'audio/wav', ext: '.wav', kind: 'audio' };
        if (asciiAt(u8, 0, 'RIFF') && asciiAt(u8, 8, 'AVI ')) return { mime: 'video/x-msvideo', ext: '.avi', kind: 'video' };
        if (asciiAt(u8, 0, 'OggS')) return { mime: 'audio/ogg', ext: '.ogg', kind: 'audio' };
        if (asciiAt(u8, 0, 'fLaC')) return { mime: 'audio/flac', ext: '.flac', kind: 'audio' };
        if (asciiAt(u8, 0, 'ID3')) return { mime: 'audio/mpeg', ext: '.mp3', kind: 'audio' };
        if (u8[0] === 0xFF && (u8[1] & 0xE0) === 0xE0) return { mime: 'audio/mpeg', ext: '.mp3', kind: 'audio' };
        if (asciiAt(u8, 4, 'ftyp') && u8.length >= 12) {
            var brand = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
            if (/M4A|mp4a|M4B|M4P/i.test(brand)) return { mime: 'audio/mp4', ext: '.m4a', kind: 'audio' };
            return { mime: 'video/mp4', ext: '.mp4', kind: 'video' };
        }
        if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) {
            return { mime: 'video/webm', ext: '.webm', kind: 'video' };
        }
        if (u8[0] === 0x50 && u8[1] === 0x4B && (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07)) {
            return { mime: 'application/zip', ext: '.zip', kind: 'zip' };
        }

        var i = 0;
        if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) i = 3;
        while (i < Math.min(64, u8.length) && u8[i] <= 32) i++;
        if (u8[i] === 0x7B || u8[i] === 0x5B) return { mime: 'application/json', ext: '.json', kind: 'json' };

        var head = '';
        var n = Math.min(16, u8.length);
        for (var h = 0; h < n; h++) head += String.fromCharCode(u8[h]);
        if (head.indexOf('U2FsdGVk') === 0 || head.indexOf('Salted__') === 0) {
            return { mime: 'application/x-tfc', ext: '.tfc', kind: 'tfc' };
        }
        return empty;
    }

    function bytesToText(bytes) {
        var u8 = asU8(bytes);
        if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) {
            return new TextDecoder('utf-16le').decode(u8);
        }
        if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) {
            return new TextDecoder('utf-16be').decode(u8);
        }
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(u8);
        } catch (_) {
            var s = '';
            var chunk = 0x8000;
            for (var i = 0; i < u8.length; i += chunk) {
                s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
            }
            return s;
        }
    }

    function bytesToDataUrl(bytes, mime) {
        var u8 = asU8(bytes);
        var type = mime || sniff(u8).mime || 'application/octet-stream';
        if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
            return 'data:' + type + ';base64,' + Buffer.from(u8).toString('base64');
        }
        var bin = '';
        var chunk = 0x8000;
        for (var i = 0; i < u8.length; i += chunk) {
            bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
        }
        return 'data:' + type + ';base64,' + btoa(bin);
    }

    function decodeDataUrlBytes(dataUrl) {
        var s = String(dataUrl || '');
        var comma = s.indexOf(',');
        if (comma < 0) return new Uint8Array(0);
        var meta = s.slice(0, comma);
        var payload = s.slice(comma + 1);
        try {
            if (/;base64/i.test(meta)) {
                if (typeof Buffer !== 'undefined') return asU8(Buffer.from(payload, 'base64'));
                var bin = atob(payload);
                var out = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
                return out;
            }
            return new TextEncoder().encode(decodeURIComponent(payload));
        } catch (_) {
            return new Uint8Array(0);
        }
    }

    function rewriteDataUrl(dataUrl) {
        var s = String(dataUrl || '');
        if (s.slice(0, 5) !== 'data:') return s;
        var comma = s.indexOf(',');
        if (comma < 0) return s;
        var meta = s.slice(5, comma).toLowerCase();
        var mime = meta.split(';')[0];
        if (mime && mime !== 'application/octet-stream' && mime !== 'binary/octet-stream' && mime !== '') {
            return s;
        }
        var bytes = decodeDataUrlBytes(s);
        var info = sniff(bytes);
        if (!info || info.kind === 'bin') return s;
        return bytesToDataUrl(bytes, info.mime);
    }

    function isUsableSrc(src) {
        var s = String(src || '').trim();
        if (!s) return false;
        if (s.slice(0, 5) === 'data:') return true;
        if (/^https?:\/\//i.test(s)) return true;
        if (/^blob:/i.test(s)) return true;
        if (s.charAt(0) === '/' && s.charAt(1) !== '/') return true;
        return false;
    }

    function playableSrc(src) {
        var s = String(src || '').trim();
        if (!s) return '';
        if (s.slice(0, 5) === 'data:') return rewriteDataUrl(s);
        return isUsableSrc(s) ? s : '';
    }

    function fileToArrayBuffer(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('read failed')); };
            reader.readAsArrayBuffer(file);
        });
    }

    function fileToDataUrl(file) {
        return fileToArrayBuffer(file).then(function (buf) {
            var u8 = asU8(buf);
            var info = sniff(u8);
            var mime = info.mime;
            if (info.kind === 'bin') {
                var named = String((file && file.type) || '').toLowerCase();
                if (named && named !== 'application/octet-stream') mime = named;
            }
            return {
                dataUrl: bytesToDataUrl(u8, mime),
                sniff: info,
                name: file && file.name,
                bytes: u8,
                mime: mime
            };
        });
    }

    function fileAsTypedBlob(file) {
        return fileToArrayBuffer(file).then(function (buf) {
            var u8 = asU8(buf);
            var info = sniff(u8);
            var mime = info.mime;
            if (info.kind === 'bin' && file && file.type && file.type !== 'application/octet-stream') {
                mime = file.type;
            }
            var blob = new Blob([u8], { type: mime });
            try {
                blob = new File([blob], (file && file.name) || ('file' + info.ext), { type: mime });
            } catch (_) { /* File ctor may be missing */ }
            return { blob: blob, sniff: info, mime: mime };
        });
    }

    function inflateRaw(compU8) {
        if (typeof DecompressionStream === 'undefined') {
            return Promise.reject(new Error('no deflate'));
        }
        var ds = new DecompressionStream('deflate-raw');
        var stream = new Blob([compU8]).stream().pipeThrough(ds);
        return new Response(stream).arrayBuffer().then(function (buf) {
            return new Uint8Array(buf);
        });
    }

    function unzip(bytes) {
        var u8 = asU8(bytes);
        var entries = [];
        var offset = 0;
        function u16(o) { return u8[o] | (u8[o + 1] << 8); }
        function u32(o) { return (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0; }

        function next() {
            if (offset + 30 > u8.length) return Promise.resolve(entries);
            if (u8[offset] !== 0x50 || u8[offset + 1] !== 0x4B) return Promise.resolve(entries);
            if (u8[offset + 2] === 0x01 && u8[offset + 3] === 0x02) return Promise.resolve(entries);
            if (!(u8[offset + 2] === 0x03 && u8[offset + 3] === 0x04)) return Promise.resolve(entries);
            var flags = u16(offset + 6);
            var method = u16(offset + 8);
            var compSize = u32(offset + 18);
            var nameLen = u16(offset + 26);
            var extraLen = u16(offset + 28);
            var nameBytes = u8.subarray(offset + 30, offset + 30 + nameLen);
            var name = bytesToText(nameBytes);
            var dataStart = offset + 30 + nameLen + extraLen;
            if (flags & 0x8) {
                offset = dataStart;
                return next();
            }
            var comp = u8.subarray(dataStart, dataStart + compSize);
            offset = dataStart + compSize;
            var isDir = /\/$/.test(name) || /^__MACOSX\//.test(name);
            var done = function (raw) {
                if (!isDir && raw) entries.push({ name: name, bytes: raw });
                return next();
            };
            if (isDir) return done(null);
            if (method === 0) return done(comp.slice());
            if (method === 8) {
                return inflateRaw(comp).then(done).catch(function () { return next(); });
            }
            return next();
        }
        return next();
    }

    function dataUrlForSlot(bytes, slot) {
        var info = sniff(bytes);
        var mime = info.mime;
        if (!info || info.kind === 'bin' || mime === 'application/octet-stream') {
            mime = slot === 'sound' ? 'audio/mpeg'
                : slot === 'video' ? 'video/mp4'
                : slot === 'animation' ? 'image/gif'
                : slot === 'image' || slot === 'picture' ? 'image/png'
                : mime;
        }
        return bytesToDataUrl(bytes, mime);
    }

    var api = {
        sniff: sniff,
        bytesToText: bytesToText,
        bytesToDataUrl: bytesToDataUrl,
        decodeDataUrlBytes: decodeDataUrlBytes,
        rewriteDataUrl: rewriteDataUrl,
        isUsableSrc: isUsableSrc,
        playableSrc: playableSrc,
        dataUrlForSlot: dataUrlForSlot,
        fileToArrayBuffer: fileToArrayBuffer,
        fileToDataUrl: fileToDataUrl,
        fileAsTypedBlob: fileAsTypedBlob,
        unzip: unzip
    };
    api.sniff = sniff;
    api.bytesToText = bytesToText;
    api.bytesToDataUrl = bytesToDataUrl;
    api.rewriteDataUrl = rewriteDataUrl;
    api.isUsableSrc = isUsableSrc;
    api.playableSrc = playableSrc;
    api.fileToDataUrl = fileToDataUrl;
    api.dataUrlForSlot = dataUrlForSlot;
    api.bytesToText = bytesToText;
    api.unzip = unzip;
    api.pickSrc = function () {
        for (var i = 0; i < arguments.length; i++) {
            var s = playableSrc(arguments[i]);
            if (s) return s;
        }
        return '';
    };
    return api;
});
