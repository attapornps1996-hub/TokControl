/**
 * Prevent express.static from serving server source, secrets, and data files.
 */
const path = require('path');

const BLOCKED_FILES = new Set([
    'server.js', 'cloud_server.js', 'database.js', 'firestore_helper.js',
    'auth_token.js', 'auth_secrets.js', 'auth_email_routes.js', 'auth_rate_limit.js',
    'admin_auth.js', 'admin_pin.js', 'admin_notify.js', 'payments.js',
    'load-env.js', 'jwt_util.js', 'static_guard.js', 'security_middleware.js',
    'pin_rate_limit.js', 'cloud_oauth.js', 'package.json', 'package-lock.json',
    'dockerfile', 'cloudbuild.yaml', '.env', '.env.example', '.gitignore',
    '.dockerignore', '.gcloudignore'
]);

const BLOCKED_PREFIXES = [
    'node_modules/', '.git/', 'data/', 'uploads/', 'scratch/',
    '.freebuff/', 'deploy/'
];

/** Public JSON catalogs the desktop UI fetches (REPO, Minecraft, gifts, …). */
const PUBLIC_DATA_JSON = /^data\/[A-Za-z0-9._-]+\.json$/i;

function isBlockedStaticPath(urlPath) {
    const rel = decodeURIComponent(String(urlPath || '').split('?')[0])
        .replace(/^\/+/, '')
        .replace(/\\/g, '/');
    if (!rel) return false;
    const relLower = rel.toLowerCase();
    if (PUBLIC_DATA_JSON.test(relLower)) return false;
    const base = path.posix.basename(rel).toLowerCase();
    if (BLOCKED_FILES.has(base) || BLOCKED_FILES.has(relLower)) return true;
    if (rel.startsWith('.') || base.startsWith('.env')) return true;
    if (rel.endsWith('.md') || rel.endsWith('.sql') || rel.endsWith('.db')) return true;
    return BLOCKED_PREFIXES.some((p) => relLower.startsWith(p));
}

function blockSensitiveStatic(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (isBlockedStaticPath(req.path)) {
        return res.status(404).end();
    }
    next();
}

module.exports = { blockSensitiveStatic, isBlockedStaticPath };
