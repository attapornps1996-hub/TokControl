const jwt = require('./jwt_util').patchJwt(require('jsonwebtoken'));
const { getAdminPin } = require('./auth_secrets');
const { checkPinRateLimit, recordPinFailure, clearPinRateLimit } = require('./pin_rate_limit');

const SETTINGS_UNLOCK_TTL_SEC = 2 * 60 * 60;

function registerVerifyPinRoute(app, jwtSecret) {
    app.post('/api/admin/verify-pin', (req, res) => {
        const pin = String(req.body?.pin || '').trim();
        if (!pin) return res.status(400).json({ error: 'กรุณากรอก PIN' });

        const rate = checkPinRateLimit(req);
        if (!rate.ok) {
            return res.status(429).json({
                error: `ลองบ่อยเกินไป กรุณารอ ${rate.retryAfterSec} วินาที`,
                retryAfterSec: rate.retryAfterSec
            });
        }

        if (pin !== getAdminPin()) {
            recordPinFailure(req);
            return res.status(403).json({ error: 'PIN ไม่ถูกต้อง' });
        }

        clearPinRateLimit(req);
        const settingsUnlockToken = jwt.sign(
            { purpose: 'settings_unlock' },
            jwtSecret,
            { expiresIn: SETTINGS_UNLOCK_TTL_SEC }
        );
        return res.json({
            success: true,
            settingsUnlockToken,
            expiresIn: SETTINGS_UNLOCK_TTL_SEC
        });
    });
}

module.exports = { registerVerifyPinRoute, SETTINGS_UNLOCK_TTL_SEC };
