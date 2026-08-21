/**
 * Tower Wars — TikTok Live gift → CastleMapManager action mapping
 * ใช้ร่วมกับ TokControl (panel) หรือ require ตรงจาก Node
 *
 * ของขวัญเริ่มต้น:
 *   Rose        → spawnEnemyWave('normal')
 *   Mini Heart  → spawnEnemyWave('tnt')
 *   Paper Crane → applyDebuff()
 *   Finger Heart→ supplyResources()
 *   Donut       → spawnDefender()
 *   Perfume     → applyBuff()
 *   ของใหญ่     → bigGiftEffect() (สุ่ม boss / กำแพง)
 */
'use strict';

const CastleMapManager = require('../castleMapManager');

const GIFT_ACTION_MAP = {
    rose: 'tw_wave_normal',
    'mini heart': 'tw_wave_tnt',
    miniheart: 'tw_wave_tnt',
    'paper crane': 'tw_debuff',
    papercrane: 'tw_debuff',
    'finger heart': 'tw_supply',
    fingerheart: 'tw_supply',
    donut: 'tw_defender',
    perfume: 'tw_buff',
    tiktok: 'tw_buff'
};

const BIG_GIFT_NAMES = [
    'universe',
    'lion',
    'drama queen',
    'tiktok universe',
    'castle fantasy',
    'phoenix'
];

function normalizeGiftName(name) {
    return String(name || '').toLowerCase().trim();
}

function isBigGift(gift) {
    const name = normalizeGiftName(gift?.giftName || gift?.name);
    if (BIG_GIFT_NAMES.some((n) => name === n || name.includes(n))) return true;
    const coins = parseInt(gift?.diamondCount || gift?.diamond_count || 0, 10) || 0;
    return coins >= 499;
}

/**
 * แปลงอีเวนต์ของขวัญ → action id ของ CastleMapManager
 * @returns {string|null}
 */
function resolveGiftAction(gift) {
    if (!gift) return null;
    if (isBigGift(gift)) return 'tw_big';
    const name = normalizeGiftName(gift.giftName || gift.name);
    if (GIFT_ACTION_MAP[name]) return GIFT_ACTION_MAP[name];
    // Thai / partial
    if (name.includes('กุหลาบ') || name === 'rose') return 'tw_wave_normal';
    if (name.includes('mini') || name.includes('มินิ')) return 'tw_wave_tnt';
    if (name.includes('crane') || name.includes('นกกระเรียน') || name.includes('กระดาษ')) return 'tw_debuff';
    if (name.includes('finger') || name.includes('หัวใจนิ้ว')) return 'tw_supply';
    if (name.includes('donut') || name.includes('โดนัท')) return 'tw_defender';
    if (name.includes('perfume') || name.includes('น้ำหอม')) return 'tw_buff';
    return null;
}

/**
 * รันแอ็กชันจากของขวัญผ่าน RCON
 * @param {object} rcon - { send(cmd) }
 * @param {object} gift
 * @param {object} [opts]
 */
async function handleTikTokGift(rcon, gift, opts = {}) {
    const action = resolveGiftAction(gift);
    if (!action) {
        return { ok: false, skipped: true, reason: 'no_mapping', giftName: gift?.giftName };
    }
    try {
        const detail = await CastleMapManager.runAction(rcon, action, opts);
        return {
            ok: detail.ok !== false,
            action,
            giftName: gift?.giftName || '',
            detail
        };
    } catch (err) {
        return {
            ok: false,
            action,
            giftName: gift?.giftName || '',
            error: err.message || String(err)
        };
    }
}

module.exports = {
    CastleMapManager,
    GIFT_ACTION_MAP,
    BIG_GIFT_NAMES,
    resolveGiftAction,
    isBigGift,
    handleTikTokGift,
    buildCastleMap: CastleMapManager.buildCastleMap,
    spawnEnemyWave: CastleMapManager.spawnEnemyWave,
    applyDebuff: CastleMapManager.applyDebuff,
    spawnDefender: CastleMapManager.spawnDefender,
    supplyResources: CastleMapManager.supplyResources,
    applyBuff: CastleMapManager.applyBuff,
    bigGiftEffect: CastleMapManager.bigGiftEffect,
    runAction: CastleMapManager.runAction
};
