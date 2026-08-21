const axios = require('axios');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:3000/api/auth/google/callback';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://127.0.0.1:3000/api/auth/discord/callback';

function isGoogleConfigured() {
    return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function isDiscordConfigured() {
    return !!(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
}

function getGoogleAuthUrl(state) {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function getDiscordAuthUrl(state) {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify email',
        state
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
}

async function exchangeGoogleCode(code) {
    const { data } = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` }
    });
    return profile;
}

async function exchangeDiscordCode(code) {
    const { data: tokenData } = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { data: profile } = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    return profile;
}

function sanitizeUsername(raw) {
    const base = String(raw || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24);
    return base || 'user';
}

async function findOrCreateOAuthUser(db, { provider, oauthId, displayName, email }) {
    const existing = await db.get(
        'SELECT * FROM users WHERE oauthProvider = ? AND oauthId = ?',
        [provider, String(oauthId)]
    );
    if (existing) return existing;

    let username = sanitizeUsername(displayName || email?.split('@')[0] || `${provider}_${oauthId}`);
    let suffix = 0;
    while (await db.get('SELECT id FROM users WHERE username = ?', [username])) {
        suffix += 1;
        username = sanitizeUsername(`${displayName || 'user'}_${suffix}`);
    }

    const streamToken = crypto.randomBytes(16).toString('hex');
    const password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    let trial = null;
    try {
        trial = require('./game-center-access').getSignupProTrialGrant();
    } catch (e) { /* optional */ }

    const result = await db.run(
        'INSERT INTO users (username, password, streamToken, isPro, proExpireAt, proScopes, oauthProvider, oauthId, email, createdAt, emailVerified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            username,
            password,
            streamToken,
            trial ? 1 : 0,
            trial ? trial.proExpireAt : null,
            trial ? trial.proScopes : null,
            provider,
            String(oauthId),
            email || null,
            new Date().toISOString(),
            email ? 1 : 0
        ]
    );
    return db.get('SELECT * FROM users WHERE id = ?', [result.id]);
}

module.exports = {
    isGoogleConfigured,
    isDiscordConfigured,
    getGoogleAuthUrl,
    getDiscordAuthUrl,
    exchangeGoogleCode,
    exchangeDiscordCode,
    findOrCreateOAuthUser
};
