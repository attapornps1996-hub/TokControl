/**
 * TTS default blocked words — Thai + English + URL patterns.
 * Users can edit the list in TTS settings; legacy installs are upgraded automatically.
 */
(function (global) {
    const TTS_BLOCK_URL = [
        'http', 'https', 'www', '.com', '.net', '.org', '.xyz', '.xxx', '.io', '.me',
        'bit.ly', 't.co', 'discord.gg', 'telegram', 'line.me', 'facebook.com', 'fb.com'
    ];

    const TTS_BLOCK_TH = [
        'ควย', 'หี', 'เย็ด', 'สัด', 'สัส', 'แม่ง', 'เหี้ย', 'ชิบหาย', 'ระยำ', 'อีดอก',
        'อีตัว', 'ส้นตีน', 'ชาติหมา', 'ไอ้สัตว์', 'ไอ้เหี้ย', 'แดก', 'หำ', 'จู๋', 'กระหรี่',
        'อีเหี้ย', 'ชิบ', 'มึง', 'กู', 'ไอ้บ้า', 'อีบ้า', 'หน้าหี', 'หน้าตัว', 'ตูด',
        'เลว', 'ชาติชั่ว', 'อีชาติ', 'ไอ้ชาติ', 'สถุน', 'อีสัตว์', 'อีควาย', 'ควาย'
    ];

    const TTS_BLOCK_EN = [
        'fuck', 'fucking', 'fucker', 'motherfucker', 'mf', 'shit', 'shitty', 'bullshit',
        'bitch', 'bastard', 'asshole', 'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut',
        'nigger', 'nigga', 'retard', 'retarded', 'damn', 'porn', 'porno', 'sex', 'nude',
        'naked', 'penis', 'vagina', 'boob', 'boobs', 'tits', 'wtf', 'stfu', 'kys'
    ];

    const TTS_DEFAULT_BLOCK_WORDS_LIST = [...TTS_BLOCK_URL, ...TTS_BLOCK_TH, ...TTS_BLOCK_EN];
    const TTS_LEGACY_BLOCK_DEFAULT = 'http,www,.com';
    const TTS_DEFAULT_BLOCK_WORDS = TTS_DEFAULT_BLOCK_WORDS_LIST.join(',');

    function ttsResolveBlockWords(saved) {
        const raw = String(saved || '').trim();
        if (!raw || raw === TTS_LEGACY_BLOCK_DEFAULT) return TTS_DEFAULT_BLOCK_WORDS;
        return raw;
    }

    global.TtsDefaults = {
        TTS_DEFAULT_BLOCK_WORDS,
        TTS_LEGACY_BLOCK_DEFAULT,
        ttsResolveBlockWords
    };
})(typeof window !== 'undefined' ? window : globalThis);
