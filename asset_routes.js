/**
 * Asset storage — local disk (Electron) + optional Google Cloud Storage (multi-device)
 * Public contract unchanged: POST /api/assets/upload → { url: "/api/assets/{id}" }
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function resolveAssetsDir() {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return path.join(app.getPath('userData'), 'cloud_assets');
        }
    } catch (e) { /* not in electron */ }
    return path.join(process.cwd(), 'uploads', 'assets');
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function findAssetFile(baseDir, assetId) {
    const exts = ['.webp', '.webm', '.mp4', '.png', '.jpg', '.jpeg', '.gif', '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    for (const ext of exts) {
        const p = path.join(baseDir, assetId + ext);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function mimeFromExt(ext) {
    const map = {
        '.webp': 'image/webp',
        '.webm': 'video/webm',
        '.mp4': 'video/mp4',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac'
    };
    return map[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

function mimeFromPath(filePath) {
    return mimeFromExt(path.extname(filePath));
}

function getGcsBucketName() {
    return String(process.env.GCS_ASSETS_BUCKET || process.env.GCS_BUCKET || '').trim();
}

let _storage = null;
function getStorage() {
    if (_storage) return _storage;
    if (!getGcsBucketName()) return null;
    try {
        const { Storage } = require('@google-cloud/storage');
        _storage = new Storage();
        return _storage;
    } catch (err) {
        console.warn('[Assets] @google-cloud/storage not available:', err.message);
        return null;
    }
}

function gcsObjectPrefix() {
    return String(process.env.GCS_ASSETS_PREFIX || 'assets').replace(/^\/+|\/+$/g, '') || 'assets';
}

function gcsObjectPath(assetId, ext) {
    const cleanExt = String(ext || '').startsWith('.') ? ext : `.${ext || 'bin'}`;
    return `${gcsObjectPrefix()}/${assetId}${cleanExt}`;
}

async function gcsSave(assetId, ext, buffer, mime, userId) {
    const storage = getStorage();
    const bucketName = getGcsBucketName();
    if (!storage || !bucketName) return false;
    const bucket = storage.bucket(bucketName);
    const objectPath = gcsObjectPath(assetId, ext);
    const file = bucket.file(objectPath);
    await file.save(buffer, {
        resumable: false,
        contentType: mime,
        metadata: {
            cacheControl: 'public, max-age=31536000, immutable',
            metadata: {
                userId: String(userId || ''),
                assetId: String(assetId)
            }
        }
    });
    // sidecar meta (optional, for ownership / GC)
    const metaFile = bucket.file(gcsObjectPath(assetId, '.json'));
    await metaFile.save(JSON.stringify({
        userId: String(userId || ''),
        assetId,
        mime,
        objectPath,
        createdAt: new Date().toISOString()
    }), { resumable: false, contentType: 'application/json' });
    return true;
}

async function gcsFind(assetId) {
    const storage = getStorage();
    const bucketName = getGcsBucketName();
    if (!storage || !bucketName) return null;
    const bucket = storage.bucket(bucketName);
    const exts = ['.webp', '.webm', '.mp4', '.png', '.jpg', '.jpeg', '.gif', '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    for (const ext of exts) {
        const objectPath = gcsObjectPath(assetId, ext);
        const file = bucket.file(objectPath);
        try {
            const [exists] = await file.exists();
            if (exists) {
                return { file, mime: mimeFromExt(ext), objectPath };
            }
        } catch (_) { /* try next */ }
    }
    return null;
}

module.exports = function registerAssetRoutes(app, { getUserId }) {
    const sharp = require('sharp');
    const baseDir = resolveAssetsDir();
    ensureDir(baseDir);
    const gcsEnabled = !!(getGcsBucketName() && getStorage());

    async function handleAssetUpload(req, res, { allowAnonymous } = {}) {
        try {
            let userId = await Promise.resolve(getUserId(req));
            if (!userId && allowAnonymous) userId = 'local';
            if (!userId) return res.status(401).json({ error: 'No token' });

            const { dataUrl, mimeType, purpose, fileName } = req.body || {};
            if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
                return res.status(400).json({ error: 'Invalid dataUrl' });
            }

            const comma = dataUrl.indexOf(',');
            const meta = dataUrl.slice(5, comma);
            const b64 = dataUrl.slice(comma + 1);
            const inputBuffer = Buffer.from(b64, 'base64');
            const mime = mimeType || meta.split(';')[0];
            const isReport = ['report', 'spotdiff'].includes(String(purpose || '').toLowerCase());
            const maxBytes = isReport ? 12 * 1024 * 1024 : 6 * 1024 * 1024;
            if (inputBuffer.length > maxBytes) {
                return res.status(400).json({ error: isReport ? 'ไฟล์ใหญ่เกินไป (สูงสุด 12MB)' : 'ไฟล์ใหญ่เกินไป (สูงสุด 6MB)' });
            }

            const assetId = crypto.randomBytes(16).toString('hex');
            let outExt;
            let outBuffer;
            let outMime;
            const nameExt = path.extname(String(fileName || '')).toLowerCase();
            const audioExts = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac' };
            const isAudio = /^audio\//.test(mime) || !!audioExts[nameExt] || String(purpose || '').includes('sound');

            if (/^video\//.test(mime) && !isAudio) {
                if (mime.includes('webm')) {
                    outExt = '.webm';
                    outBuffer = inputBuffer;
                } else {
                    outExt = '.mp4';
                    outBuffer = inputBuffer;
                }
                outMime = mimeFromExt(outExt);
            } else if (isAudio) {
                outExt = audioExts[nameExt] ? nameExt : (mime.includes('wav') ? '.wav' : mime.includes('ogg') ? '.ogg' : '.mp3');
                outBuffer = inputBuffer;
                outMime = audioExts[outExt] || (mime.startsWith('audio/') ? mime : 'audio/mpeg');
            } else {
                outExt = '.webp';
                const purposeKey = String(purpose || '').toLowerCase();
                const pipeline = sharp(inputBuffer).rotate();
                if (purposeKey === 'cover') {
                    outBuffer = await pipeline.resize(1920, 720, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
                } else if (purposeKey === 'report' || purposeKey === 'spotdiff') {
                    outBuffer = await pipeline.resize(1920, 1080, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
                } else {
                    outBuffer = await pipeline.resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
                }
                outMime = 'image/webp';
            }

            // Always keep a local copy (Electron offline / local mode)
            const outPath = path.join(baseDir, assetId + outExt);
            fs.writeFileSync(outPath, outBuffer);
            const metaPath = path.join(baseDir, assetId + '.json');
            fs.writeFileSync(metaPath, JSON.stringify({
                userId: String(userId),
                assetId,
                mime: outMime,
                createdAt: new Date().toISOString(),
                gcs: false
            }));

            let storedOnGcs = false;
            if (gcsEnabled) {
                try {
                    storedOnGcs = await gcsSave(assetId, outExt, outBuffer, outMime, userId);
                    if (storedOnGcs) {
                        fs.writeFileSync(metaPath, JSON.stringify({
                            userId: String(userId),
                            assetId,
                            mime: outMime,
                            createdAt: new Date().toISOString(),
                            gcs: true
                        }));
                    }
                } catch (gcsErr) {
                    console.warn('[Assets] GCS upload failed, kept local only:', gcsErr.message);
                }
            }

            res.json({
                success: true,
                assetId,
                url: `/api/assets/${assetId}`,
                mime: outMime,
                storage: storedOnGcs ? 'gcs' : 'local'
            });
        } catch (err) {
            console.error('[Assets] upload error:', err.message);
            res.status(500).json({ error: 'Upload failed' });
        }
    }

    app.post('/api/assets/upload', (req, res) => handleAssetUpload(req, res));
    app.post('/api/local-sounds/upload', (req, res) => handleAssetUpload(req, res));

    app.get('/api/assets/:assetId', async (req, res) => {
        try {
            const assetId = String(req.params.assetId || '').replace(/[^a-f0-9]/gi, '');
            if (!assetId || assetId.length < 16) {
                return res.status(400).json({ error: 'Invalid asset id' });
            }

            // 1) Local disk first (fast for same machine)
            const filePath = findAssetFile(baseDir, assetId);
            if (filePath) {
                res.setHeader('Content-Type', mimeFromPath(filePath));
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                return fs.createReadStream(filePath).pipe(res);
            }

            // 2) GCS (other devices / Cloud Run)
            if (gcsEnabled) {
                const hit = await gcsFind(assetId);
                if (hit) {
                    res.setHeader('Content-Type', hit.mime);
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                    // Cache a local copy for subsequent hits
                    try {
                        const [buf] = await hit.file.download();
                        const localPath = path.join(baseDir, `${assetId}${path.extname(hit.objectPath)}`);
                        fs.writeFileSync(localPath, buf);
                        return res.end(buf);
                    } catch (dlErr) {
                        console.warn('[Assets] GCS stream fallback:', dlErr.message);
                        return hit.file.createReadStream()
                            .on('error', () => {
                                if (!res.headersSent) res.status(500).json({ error: 'Read failed' });
                            })
                            .pipe(res);
                    }
                }
            }

            return res.status(404).json({ error: 'Not found' });
        } catch (err) {
            console.error('[Assets] read error:', err.message);
            if (!res.headersSent) res.status(500).json({ error: 'Read failed' });
        }
    });

    app.get('/api/cloud/status', (req, res) => {
        res.json({
            success: true,
            phase: 2,
            features: ['config-sync', 'asset-storage', ...(gcsEnabled ? ['asset-gcs-multi-device'] : [])],
            assetsDir: baseDir,
            gcs: {
                enabled: gcsEnabled,
                bucket: getGcsBucketName() || null
            }
        });
    });

    console.log('[Assets] Routes registered — storage:', baseDir, gcsEnabled ? `+ GCS(${getGcsBucketName()})` : '(local only)');
};
