/**
 * ส่งอีเมลยืนยัน / รีเซ็ตรหัสผ่าน — ตั้ง SMTP_* บน Cloud Run
 */
const https = require('https');

function isEmailConfigured() {
    return !!(
        process.env.SMTP_HOST
        && process.env.SMTP_USER
        && process.env.SMTP_PASS
    );
}

function getPublicBaseUrl() {
    return String(
        process.env.APP_PUBLIC_URL
        || process.env.OAUTH_SUCCESS_URL?.replace(/\/auth-success\.html.*$/i, '')
        || 'https://pandy-backend-302414976454.asia-southeast1.run.app'
    ).replace(/\/$/, '');
}

function getFromAddress() {
    return process.env.SMTP_FROM || `TokControl <${process.env.SMTP_USER}>`;
}

async function sendMail({ to, subject, html, text }) {
    if (!isEmailConfigured()) {
        console.warn('[email] SMTP not configured — email not sent to', to);
        return { ok: false, skipped: true };
    }

    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    } catch (e) {
        console.warn('[email] nodemailer not installed');
        return { ok: false, skipped: true };
    }

    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    await transporter.sendMail({
        from: getFromAddress(),
        to,
        subject,
        text,
        html
    });
    return { ok: true };
}

async function sendVerificationEmail({ to, username, verifyUrl, code }) {
    const subject = 'ยืนยันอีเมล TokControl';
    const codeLine = code ? `\nรหัสยืนยัน: ${code}\n` : '';
    const text = `สวัสดี @${username}\n\nกดลิงก์เพื่อยืนยันอีเมล:\n${verifyUrl}${codeLine}\nลิงก์หมดอายุใน 24 ชั่วโมง`;
    const codeHtml = code
        ? `<p style="text-align:center;margin:20px 0;font-size:28px;letter-spacing:6px;font-weight:bold;color:#bc13fe;">${code}</p>`
        : '';
    const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0c0818;color:#fff;border-radius:12px;">
            <h2 style="color:#bc13fe;margin:0 0 12px;">TokControl</h2>
            <p>สวัสดี <b>@${username}</b></p>
            <p>กรุณายืนยันอีเมลเพื่อใช้งานบัญชีให้ครบถ้วน</p>
            ${codeHtml}
            <p style="text-align:center;margin:28px 0;">
                <a href="${verifyUrl}" style="background:#bc13fe;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">ยืนยันอีเมล</a>
            </p>
            <p style="font-size:12px;color:#888;">ลิงก์หมดอายุใน 24 ชั่วโมง</p>
        </div>`;
    return sendMail({ to, subject, text, html });
}

async function sendPasswordResetEmail({ to, username, resetUrl }) {
    const subject = 'รีเซ็ตรหัสผ่าน TokControl';
    const text = `สวัสดี @${username}\n\nกดลิงก์เพื่อตั้งรหัสผ่านใหม่:\n${resetUrl}\n\nลิงก์หมดอายุใน 1 ชั่วโมง`;
    const html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0c0818;color:#fff;border-radius:12px;">
            <h2 style="color:#bc13fe;margin:0 0 12px;">TokControl</h2>
            <p>สวัสดี <b>@${username}</b></p>
            <p>มีคำขอรีเซ็ตรหัสผ่านสำหรับบัญชีของคุณ</p>
            <p style="text-align:center;margin:28px 0;">
                <a href="${resetUrl}" style="background:#bc13fe;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">ตั้งรหัสผ่านใหม่</a>
            </p>
            <p style="font-size:12px;color:#888;">หากไม่ได้ขอรีเซ็ต ให้เพิกเฉยอีเมลนี้</p>
        </div>`;
    return sendMail({ to, subject, text, html });
}

module.exports = {
    isEmailConfigured,
    getPublicBaseUrl,
    sendVerificationEmail,
    sendPasswordResetEmail
};
