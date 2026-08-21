const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('./jwt_util').patchJwt(require('jsonwebtoken'));
const {
    isEmailConfigured,
    getPublicBaseUrl,
    sendVerificationEmail,
    sendPasswordResetEmail
} = require('./email_service');
const { authRateLimitMiddleware } = require('./auth_rate_limit');
const { validatePasswordPolicy } = require('./security_middleware');

function validateEmailAddress(email) {
    const value = String(email || '').trim().toLowerCase();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { ok: false, error: 'อีเมลไม่ถูกต้อง' };
    }
    if (value.length > 120) return { ok: false, error: 'อีเมลยาวเกินไป' };
    return { ok: true, value };
}

function verifyPageHtml(title, message, ok) {
    const color = ok ? '#2ecc71' : '#ff4757';
    return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;background:#090614;color:#fff;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;box-sizing:border-box}
.box{max-width:420px}h2{color:${color}}</style></head><body><div class="box">
<img src="/assets/tokcontrol-logo.png" alt="TokControl" style="width:100px;margin-bottom:16px">
<h2>${title}</h2><p style="color:#aaa;line-height:1.6">${message}</p></div></body></html>`;
}

function makeVerifyCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function registerAuthEmailRoutes(app, { db, jwtSecret }) {
    async function resolveAuthUser(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader) return null;
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, jwtSecret);
        if (decoded.username) {
            const byName = await db.getUser(decoded.username);
            if (byName) return byName;
        }
        if (decoded.userId != null) {
            return await db.getUserById(decoded.userId);
        }
        return null;
    }

    async function issueVerifyToken(username, email) {
        const token = crypto.randomBytes(24).toString('hex');
        const code = makeVerifyCode();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await db.updateUserFields(username, {
            email,
            emailVerified: 0,
            emailVerifyToken: token,
            emailVerifyCode: code,
            emailVerifyExpires: expires
        });
        const verifyUrl = `${getPublicBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
        let sent = { ok: false, skipped: true };
        try {
            sent = await sendVerificationEmail({ to: email, username, verifyUrl, code });
        } catch (mailErr) {
            console.warn('[email] send failed:', mailErr?.message || mailErr);
            sent = { ok: false, error: mailErr?.message || 'send failed' };
        }
        return { verifyUrl, code, sent };
    }

    app.get('/api/auth/verify-email', async (req, res) => {
        try {
            const token = String(req.query.token || '').trim();
            if (!token) {
                return res.status(400).send(verifyPageHtml('ลิงก์ไม่ถูกต้อง', 'ไม่พบ token — ขอลิงก์ใหม่จากในแอป', false));
            }
            const user = await db.findUserByEmailVerifyToken(token);
            if (!user) {
                return res.status(400).send(verifyPageHtml('ลิงก์หมดอายุ', 'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุแล้ว', false));
            }
            if (user.emailVerifyExpires && new Date(user.emailVerifyExpires) < new Date()) {
                return res.status(400).send(verifyPageHtml('ลิงก์หมดอายุ', 'กรุณาขอส่งอีเมลยืนยันใหม่จากในแอป', false));
            }
            await db.updateUserFields(user.username, {
                emailVerified: 1,
                emailVerifyToken: null,
                emailVerifyCode: null,
                emailVerifyExpires: null
            });
            return res.send(verifyPageHtml('ยืนยันอีเมลสำเร็จ!', 'กลับไปที่ TokControl แล้วเข้าสู่ระบบได้เลย', true));
        } catch (e) {
            console.error('[verify-email]', e);
            return res.status(500).send(verifyPageHtml('เกิดข้อผิดพลาด', 'ลองใหม่อีกครั้งภายหลัง', false));
        }
    });

    app.post('/api/auth/bind-email', authRateLimitMiddleware('email'), async (req, res) => {
        try {
            const user = await resolveAuthUser(req);
            if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
            if (user.oauthProvider) {
                return res.status(400).json({ error: 'บัญชี Google ยืนยันอีเมลแล้ว' });
            }
            if (user.emailVerified === 1 || user.emailVerified === true) {
                return res.json({ success: true, message: 'อีเมลยืนยันแล้ว', alreadyVerified: true });
            }
            const emailCheck = validateEmailAddress(req.body?.email);
            if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });
            const emailTaken = await db.findUserByEmail(emailCheck.value);
            if (emailTaken && emailTaken.username !== user.username) {
                return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
            }
            const result = await issueVerifyToken(user.username, emailCheck.value);
            const smtpOk = !!result.sent?.ok;
            return res.json({
                success: true,
                message: smtpOk
                    ? 'ส่งอีเมลยืนยันแล้ว — ตรวจสอบกล่องจดหมาย หรือกรอกรหัส 6 หลักด้านล่าง'
                    : 'สร้างรหัสยืนยันแล้ว — ตรวจอีเมลหรือรอ SMTP บนเซิร์ฟเวอร์',
                emailSent: smtpOk
            });
        } catch (e) {
            console.error('[bind-email]', e);
            return res.status(500).json({ error: e.message || 'ผูกอีเมลไม่สำเร็จ' });
        }
    });

    app.post('/api/auth/confirm-email-code', authRateLimitMiddleware('email'), async (req, res) => {
        try {
            const user = await resolveAuthUser(req);
            if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
            if (user.emailVerified === 1 || user.emailVerified === true) {
                return res.json({ success: true, message: 'อีเมลยืนยันแล้ว' });
            }
            const code = String(req.body?.code || '').trim();
            if (!/^\d{6}$/.test(code)) {
                return res.status(400).json({ error: 'กรอกรหัส 6 หลัก' });
            }
            if (!user.emailVerifyCode || String(user.emailVerifyCode) !== code) {
                return res.status(400).json({ error: 'รหัสไม่ถูกต้อง' });
            }
            if (user.emailVerifyExpires && new Date(user.emailVerifyExpires) < new Date()) {
                return res.status(400).json({ error: 'รหัสหมดอายุแล้ว — ส่งใหม่' });
            }
            await db.updateUserFields(user.username, {
                emailVerified: 1,
                emailVerifyToken: null,
                emailVerifyCode: null,
                emailVerifyExpires: null
            });
            return res.json({ success: true, message: 'ยืนยันอีเมลสำเร็จ!' });
        } catch (e) {
            console.error('[confirm-email-code]', e);
            return res.status(500).json({ error: 'ยืนยันไม่สำเร็จ' });
        }
    });

    app.post('/api/auth/resend-verification', authRateLimitMiddleware('email'), async (req, res) => {
        try {
            const user = await resolveAuthUser(req);
            if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
            if (user.emailVerified === 1 || user.emailVerified === true) {
                return res.json({ success: true, message: 'อีเมลยืนยันแล้ว' });
            }
            const emailCheck = validateEmailAddress(req.body?.email || user.email);
            if (!emailCheck.ok) {
                return res.status(400).json({ error: 'กรอกอีเมลก่อนแล้วกดส่งรหัสยืนยัน' });
            }
            const result = await issueVerifyToken(user.username, emailCheck.value);
            const smtpOk = !!result.sent?.ok;
            return res.json({
                success: true,
                message: smtpOk ? 'ส่งอีเมลยืนยันแล้ว' : 'สร้างรหัสยืนยันแล้ว — ตรวจอีเมล',
                emailSent: smtpOk
            });
        } catch (e) {
            console.error('[resend-verification]', e);
            return res.status(500).json({ error: e.message || 'ส่งอีเมลไม่สำเร็จ' });
        }
    });

    app.post('/api/auth/forgot-password', authRateLimitMiddleware('forgot'), async (req, res) => {
        try {
            const { username, email } = req.body || {};
            let user = null;
            if (username) user = await db.getUser(String(username).trim());
            if (!user && email) user = await db.findUserByEmail(String(email).trim().toLowerCase());
            const generic = { success: true, message: 'ถ้ามีบัญชีและอีเมลตรงกัน เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้' };
            if (!user || !user.email || user.oauthProvider) {
                return res.json(generic);
            }
            const token = crypto.randomBytes(24).toString('hex');
            const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            await db.updateUserFields(user.username, {
                passwordResetToken: token,
                passwordResetExpires: expires
            });
            const resetUrl = `${getPublicBaseUrl()}/reset-password.html?token=${encodeURIComponent(token)}`;
            await sendPasswordResetEmail({ to: user.email, username: user.username, resetUrl });
            return res.json(generic);
        } catch (e) {
            console.error('[forgot-password]', e);
            return res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
        }
    });

    app.post('/api/auth/reset-password', authRateLimitMiddleware('reset'), async (req, res) => {
        try {
            const { token, password } = req.body || {};
            const passCheck = validatePasswordPolicy(password);
            if (!passCheck.ok) return res.status(400).json({ error: passCheck.error });
            const user = await db.findUserByPasswordResetToken(String(token || '').trim());
            if (!user) return res.status(400).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ' });
            if (user.passwordResetExpires && new Date(user.passwordResetExpires) < new Date()) {
                return res.status(400).json({ error: 'ลิงก์หมดอายุแล้ว — ขอรีเซ็ตใหม่' });
            }
            const hash = await bcrypt.hash(password, 10);
            await db.updateUserFields(user.username, {
                password: hash,
                passwordResetToken: null,
                passwordResetExpires: null
            });
            return res.json({ success: true, message: 'ตั้งรหัสผ่านใหม่สำเร็จ — เข้าสู่ระบบได้เลย' });
        } catch (e) {
            console.error('[reset-password]', e);
            return res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
        }
    });

    return { issueVerifyToken, validateEmailAddress, isEmailConfigured };
}

module.exports = { registerAuthEmailRoutes, validateEmailAddress };
