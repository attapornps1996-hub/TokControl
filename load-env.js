/**
 * Load env files for TokControl.
 * Packaged builds use resources/app.env (shared Spotify/OAuth app credentials).
 * Dev uses project-root .env. Users can override via userData/.env.
 */
const fs = require('fs');
const path = require('path');

const SHIPPED_KEYS = new Set([
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_REDIRECT_URI',
    'YOUTUBE_API_KEY'
]);

function parseEnvFile(filePath) {
    const out = {};
    if (!filePath || !fs.existsSync(filePath)) return out;
    let raw = '';
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch {
        return out;
    }
    raw.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq < 1) return;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (key) out[key] = val;
    });
    return out;
}

function applyEnv(map, { onlyShipped = false, overwrite = false } = {}) {
    Object.entries(map || {}).forEach(([key, val]) => {
        if (onlyShipped && !SHIPPED_KEYS.has(key)) return;
        if (overwrite || process.env[key] === undefined || process.env[key] === '') {
            process.env[key] = val;
        }
    });
}

function getUserDataEnvPaths() {
    const paths = [];
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            const ud = app.getPath('userData');
            paths.push(path.join(ud, '.env'));
            paths.push(path.join(ud, 'app.env'));
        }
    } catch { /* not electron */ }
    return paths;
}

function loadEnv() {
    const files = [];

    // Dev / asar root
    files.push({ path: path.join(__dirname, '.env'), onlyShipped: false, overwrite: false });

    // Packaged installer resources
    if (process.resourcesPath) {
        files.push({ path: path.join(process.resourcesPath, 'app.env'), onlyShipped: true, overwrite: false });
    }

    // Beside executable (portable fallback)
    try {
        const exeDir = path.dirname(process.execPath);
        files.push({ path: path.join(exeDir, 'resources', 'app.env'), onlyShipped: true, overwrite: false });
        files.push({ path: path.join(exeDir, 'app.env'), onlyShipped: true, overwrite: false });
    } catch { /* ignore */ }

    for (const f of files) {
        applyEnv(parseEnvFile(f.path), f);
    }

    // User overrides last
    for (const p of getUserDataEnvPaths()) {
        applyEnv(parseEnvFile(p), { onlyShipped: false, overwrite: true });
    }

    return {
        spotifyConfigured: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
    };
}

module.exports = { loadEnv, parseEnvFile, SHIPPED_KEYS };
