/**
 * Donate persistence adapters for SQLite (database.js) and Firestore helper.
 */

function createSqlRepo(db) {
    return {
        getUserById: (id) => db.get('SELECT * FROM users WHERE id = ?', [id]),
        getUserByUsername: (username) =>
            db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [String(username || '').trim()]),
        ensureLocalUser: async ({ username, displayName }) => {
            const uname = String(username || '').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '').slice(0, 32);
            if (!uname) return null;
            let row = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [uname]);
            if (row) return row;
            const crypto = require('crypto');
            const streamToken = crypto.randomBytes(16).toString('hex');
            try {
                await db.run(
                    `INSERT INTO users (username, password, streamToken, role) VALUES (?, ?, ?, ?)`,
                    [uname, 'cloud-linked', streamToken, 'free']
                );
            } catch (e) {
                // race / unique — re-read
            }
            row = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [uname]);
            if (row && displayName && typeof db.run === 'function') {
                // displayName may not exist as column — ignore
            }
            return row;
        },
        getSettingsByUserId: (userId) =>
            db.get('SELECT * FROM streamer_settings WHERE user_id = ?', [userId]),
        getSettingsBySlug: (slug) =>
            db.get('SELECT * FROM streamer_settings WHERE donation_slug = ?', [String(slug || '').trim().toLowerCase()]),
        getSettingsByOverlayKey: (key) =>
            db.get('SELECT * FROM streamer_settings WHERE overlay_key = ?', [String(key || '').trim()]),
        insertSettings: async (row) => {
            await db.run(
                `INSERT INTO streamer_settings
                (user_id, donation_slug, overlay_key, promptpay_id, account_name, bank_code,
                 min_donation, min_tts_amount, goal_amount, goal_label, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.user_id,
                    row.donation_slug,
                    row.overlay_key,
                    row.promptpay_id || '',
                    row.account_name || '',
                    row.bank_code || '',
                    row.min_donation != null ? row.min_donation : 10,
                    row.min_tts_amount != null ? row.min_tts_amount : 20,
                    row.goal_amount != null ? row.goal_amount : 1000,
                    row.goal_label || 'เป้าหมายเดือนนี้',
                    row.updated_at
                ]
            );
            return row;
        },
        updateSettings: async (userId, patch) => {
            const cols = Object.keys(patch);
            if (!cols.length) return;
            await db.run(
                `UPDATE streamer_settings SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE user_id = ?`,
                [...cols.map((c) => patch[c]), userId]
            );
        },
        insertDonation: async (row) => {
            await db.run(
                `INSERT INTO donations
                (id, streamer_id, donor_name, amount, message, slip_url, trans_ref,
                 verification_status, reject_reason, is_alerted, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.id,
                    row.streamer_id,
                    row.donor_name,
                    row.amount,
                    row.message || '',
                    row.slip_url || null,
                    row.trans_ref || null,
                    row.verification_status || 'pending',
                    row.reject_reason || null,
                    row.is_alerted ? 1 : 0,
                    row.created_at
                ]
            );
            return row;
        },
        findDonationByTransRef: (ref) =>
            db.get('SELECT id FROM donations WHERE trans_ref = ?', [String(ref)]),
        markAlerted: (id) => db.run('UPDATE donations SET is_alerted = 1 WHERE id = ?', [id]),
        listVerified: (streamerId) =>
            db.all(
                `SELECT amount, donor_name, created_at, verification_status
                 FROM donations WHERE streamer_id = ? AND verification_status = 'verified'`,
                [streamerId]
            ),
        listHistory: async (streamerId, { limit = 50, status } = {}) => {
            let sql = `SELECT id, donor_name, amount, message, slip_url, trans_ref,
                              verification_status, reject_reason, is_alerted, created_at
                       FROM donations WHERE streamer_id = ?`;
            const params = [streamerId];
            if (status === 'verified' || status === 'rejected' || status === 'pending') {
                sql += ' AND verification_status = ?';
                params.push(status);
            }
            sql += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);
            return db.all(sql, params);
        },
        incrementPageViews: async (userId) => {
            await db.run(
                'UPDATE streamer_settings SET page_views = COALESCE(page_views, 0) + 1 WHERE user_id = ?',
                [userId]
            );
            const row = await db.get('SELECT page_views FROM streamer_settings WHERE user_id = ?', [userId]);
            return Number(row?.page_views) || 0;
        }
    };
}

function createFirestoreRepo(helper) {
    return {
        getUserById: (id) => helper.getUserById(id),
        getUserByUsername: (username) =>
            (typeof helper.getUserByUsername === 'function' ? helper.getUserByUsername(username) : null),
        ensureLocalUser: async ({ username }) => {
            if (typeof helper.getUserByUsername === 'function') {
                return helper.getUserByUsername(username);
            }
            return null;
        },
        getSettingsByUserId: (userId) => helper.donateGetSettingsByUserId(userId),
        getSettingsBySlug: (slug) => helper.donateGetSettingsBySlug(slug),
        getSettingsByOverlayKey: (key) => helper.donateGetSettingsByOverlayKey(key),
        insertSettings: (row) => helper.donateUpsertSettings(row),
        updateSettings: (userId, patch) => helper.donateUpdateSettings(userId, patch),
        insertDonation: (row) => helper.donateInsertDonation(row),
        findDonationByTransRef: (ref) => helper.donateFindByTransRef(ref),
        markAlerted: (id) => helper.donateMarkAlerted(id),
        listVerified: (streamerId) => helper.donateListVerified(streamerId),
        listHistory: (streamerId, opts) => helper.donateListHistory(streamerId, opts),
        incrementPageViews: (userId) => helper.donateIncrementPageViews(userId)
    };
}

function createDonateRepo(db) {
    if (db && typeof db.donateGetSettingsByUserId === 'function') {
        return createFirestoreRepo(db);
    }
    if (db && typeof db.get === 'function' && typeof db.run === 'function') {
        return createSqlRepo(db);
    }
    throw new Error('[donate] database adapter missing get/run or donate* methods');
}

module.exports = { createDonateRepo, createSqlRepo };
