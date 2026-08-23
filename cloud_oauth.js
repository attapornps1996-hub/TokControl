/**
 * Google / Discord OAuth for Cloud server (Firestore users).
 */
const crypto = require('crypto');
const jwt = require('./jwt_util').patchJwt(require('jsonwebtoken'));
const oauthAuth = require('./oauth_auth');
const { authRateLimitMiddleware } = require('./auth_rate_limit');

const oauthLoginStates = {};

function cleanupOAuthStates() {
    const now = Date.now();
    Object.keys(oauthLoginStates).forEach((key) => {
        if (now - oauthLoginStates[key].createdAt > 10 * 60 * 1000) delete oauthLoginStates[key];
    });
}

function getOAuthSuccessUrl() {
    return process.env.OAUTH_SUCCESS_URL || 'http://127.0.0.1:3000/auth-success.html';
}

function isSafeOAuthSuccessUrl(url) {
    try {
        const u = new URL(String(url || ''));
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        const host = u.hostname;
        const okHost = host === '127.0.0.1' || host === 'localhost'
            || host === 'tokcontrol.com' || host === 'www.tokcontrol.com';
        if (!okHost) return false;
        return /auth-success\.html$/i.test(u.pathname);
    } catch (e) {
        return false;
    }
}

function redirectOAuthSuccess(res, successUrl, token) {
    try {
        const u = new URL(String(successUrl || getOAuthSuccessUrl()), 'http://127.0.0.1:3000');
        u.searchParams.set('token', token);
        u.hash = '';
        return res.redirect(u.toString());
    } catch (e) {
        const base = String(successUrl || getOAuthSuccessUrl()).split('#')[0];
        const sep = base.includes('?') ? '&' : '?';
        return res.redirect(`${base}${sep}token=${encodeURIComponent(token)}`);
    }
}

function registerCloudOAuthRoutes(app, { db, jwtSecret, buildUserProfile, issueExtras = async () => ({}) }) {
    async function issueToken(user) {
        const extras = await issueExtras(user);
        let u = extras.user || user;
        const token = jwt.sign({ userId: u.id, username: u.username }, jwtSecret, { expiresIn: '7d' });
        return { token, user: buildUserProfile(u), ...extras };
    }

    app.get('/api/auth/status', (req, res) => {
        res.json({
            success: true,
            google: oauthAuth.isGoogleConfigured(),
            discord: oauthAuth.isDiscordConfigured()
        });
    });

    app.get('/api/auth/google/start', authRateLimitMiddleware('oauth'), (req, res) => {
        if (!oauthAuth.isGoogleConfigured()) {
            return res.status(503).json({
                error: 'Google Login ยังไม่ได้ตั้งค่า — ตั้ง GOOGLE_CLIENT_ID และ GOOGLE_CLIENT_SECRET บน Cloud Run'
            });
        }
        const state = crypto.randomBytes(16).toString('hex');
        const next = isSafeOAuthSuccessUrl(req.query.next) ? String(req.query.next) : getOAuthSuccessUrl();
        oauthLoginStates[state] = { provider: 'google', createdAt: Date.now(), successUrl: next };
        res.json({ success: true, url: oauthAuth.getGoogleAuthUrl(state) });
    });

    app.get('/api/auth/discord/start', authRateLimitMiddleware('oauth'), (req, res) => {
        if (!oauthAuth.isDiscordConfigured()) {
            return res.status(503).json({
                error: 'Discord Login ยังไม่ได้ตั้งค่า — ตั้ง DISCORD_CLIENT_ID และ DISCORD_CLIENT_SECRET บน Cloud Run'
            });
        }
        const state = crypto.randomBytes(16).toString('hex');
        const next = isSafeOAuthSuccessUrl(req.query.next) ? String(req.query.next) : getOAuthSuccessUrl();
        oauthLoginStates[state] = { provider: 'discord', createdAt: Date.now(), successUrl: next };
        res.json({ success: true, url: oauthAuth.getDiscordAuthUrl(state) });
    });

    app.get('/api/auth/google/callback', async (req, res) => {
        cleanupOAuthStates();
        const { code, state, error } = req.query;
        const pending = oauthLoginStates[state];
        const successUrl = pending?.successUrl || getOAuthSuccessUrl();
        if (error) {
            return res.redirect(`${successUrl}?error=${encodeURIComponent(error)}`);
        }
        const session = pending;
        if (!session || session.provider !== 'google') {
            return res.status(400).send('Invalid OAuth state');
        }
        delete oauthLoginStates[state];
        try {
            const profile = await oauthAuth.exchangeGoogleCode(code);
            let user = await db.findOrCreateOAuthUser({
                provider: 'google',
                oauthId: profile.id,
                displayName: profile.name || profile.email,
                email: profile.email
            });
            const auth = await issueToken(user);
            redirectOAuthSuccess(res, successUrl, auth.token);
        } catch (e) {
            console.error('Cloud Google OAuth error:', e);
            res.redirect(`${successUrl}?error=${encodeURIComponent(e.message || 'Google login failed')}`);
        }
    });

    app.get('/api/auth/discord/callback', async (req, res) => {
        cleanupOAuthStates();
        const { code, state, error } = req.query;
        const pending = oauthLoginStates[state];
        const successUrl = pending?.successUrl || getOAuthSuccessUrl();
        if (error) {
            return res.redirect(`${successUrl}?error=${encodeURIComponent(error)}`);
        }
        const session = pending;
        if (!session || session.provider !== 'discord') {
            return res.status(400).send('Invalid OAuth state');
        }
        delete oauthLoginStates[state];
        try {
            const profile = await oauthAuth.exchangeDiscordCode(code);
            const displayName = profile.global_name || profile.username;
            let user = await db.findOrCreateOAuthUser({
                provider: 'discord',
                oauthId: profile.id,
                displayName,
                email: profile.email
            });
            const auth = await issueToken(user);
            redirectOAuthSuccess(res, successUrl, auth.token);
        } catch (e) {
            console.error('Cloud Discord OAuth error:', e);
            res.redirect(`${successUrl}?error=${encodeURIComponent(e.message || 'Discord login failed')}`);
        }
    });
}

module.exports = { registerCloudOAuthRoutes };
