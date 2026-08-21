/**
 * แจ้งแอดมินผ่าน Discord webhook เมื่อมีการซื้อ / ยืนยันมือ / ใช้โค้ด
 * ตั้งค่า: ADMIN_DISCORD_WEBHOOK_URL หรือ DISCORD_ADMIN_WEBHOOK_URL
 */
const axios = require('axios');

function getAdminWebhookUrl() {
    return String(
        process.env.ADMIN_DISCORD_WEBHOOK_URL
        || process.env.DISCORD_ADMIN_WEBHOOK_URL
        || ''
    ).trim();
}

function truncate(s, n = 180) {
    const t = String(s || '');
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * @param {{ title: string, description?: string, fields?: {name:string,value:string,inline?:boolean}[], color?: number }} payload
 */
async function notifyAdminDiscord(payload) {
    const url = getAdminWebhookUrl();
    if (!url) return { ok: false, skipped: true };

    const embed = {
        title: truncate(payload.title || 'TokControl Admin', 250),
        description: payload.description ? truncate(payload.description, 2000) : undefined,
        color: payload.color != null ? payload.color : 0xbc13fe,
        fields: (payload.fields || []).slice(0, 20).map((f) => ({
            name: truncate(f.name, 250),
            value: truncate(f.value, 1000) || '—',
            inline: !!f.inline
        })),
        timestamp: new Date().toISOString(),
        footer: { text: 'TokControl Payments' }
    };

    try {
        await axios.post(url, {
            username: 'TokControl Admin',
            embeds: [embed]
        }, { timeout: 8000, validateStatus: () => true });
        return { ok: true };
    } catch (err) {
        console.warn('[admin-notify] Discord webhook failed:', err.message);
        return { ok: false, error: err.message };
    }
}

async function notifyPaymentPaid({ order, username, productType, planLabel, via }) {
    const typeLabel = productType === 'game'
        ? '🎮 เกม'
        : productType === 'gamecenter_pass'
            ? '🎫 Game Center Pass'
            : '👑 PRO';
    const color = via === 'manual' ? 0xf59e0b : 0x22c55e;
    return notifyAdminDiscord({
        title: via === 'manual' ? 'ยืนยันมือ — ออเดอร์ชำระเงิน' : 'ชำระเงินสำเร็จ',
        description: `${typeLabel} · ${planLabel || order?.planId || '—'}`,
        color,
        fields: [
            { name: 'ผู้ใช้', value: `@${username || order?.username || '—'}`, inline: true },
            { name: 'ยอด', value: `฿${Number(order?.amount || 0).toLocaleString('th-TH')}`, inline: true },
            { name: 'แพ็ก', value: String(order?.planId || '—'), inline: true },
            { name: 'ออเดอร์', value: String(order?.id || '—'), inline: false },
            { name: 'ช่องทาง', value: via === 'manual' ? 'แอดมินยืนยันมือ' : 'SlipOK / อัตโนมัติ', inline: true },
            { name: 'slipRef', value: String(order?.slipRef || '—'), inline: true }
        ]
    });
}

async function notifyPromoRedeem({ username, type, val, message, gameId }) {
    return notifyAdminDiscord({
        title: 'ใช้โค้ดโปรโมชัน',
        description: message || `type=${type}`,
        color: 0x38bdf8,
        fields: [
            { name: 'ผู้ใช้', value: `@${username || '—'}`, inline: true },
            { name: 'ประเภท', value: String(type || '—'), inline: true },
            { name: 'ค่า', value: String(val ?? '—'), inline: true },
            ...(gameId ? [{ name: 'เกม', value: String(gameId), inline: true }] : [])
        ]
    });
}

module.exports = {
    getAdminWebhookUrl,
    notifyAdminDiscord,
    notifyPaymentPaid,
    notifyPromoRedeem
};
