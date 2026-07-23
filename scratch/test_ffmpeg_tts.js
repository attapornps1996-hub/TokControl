const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const fs = require('fs');

function getAtempoFilter(tempo) {
    let filters = [];
    let t = tempo;
    while (t > 2.0) {
        filters.push("atempo=2.0");
        t /= 2.0;
    }
    while (t < 0.5) {
        filters.push("atempo=0.5");
        t /= 0.5;
    }
    if (t !== 1.0) {
        filters.push(`atempo=${t.toFixed(2)}`);
    }
    return filters.join(',');
}

async function run() {
    const text = "สวัสดีครับ ทดสอบระบบเสียงสิริ ปรับความเร็วและโทนเสียง";
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encodeURIComponent(text)}`;
    
    const rate = 2.0;
    const pitch = 1.5;
    
    const command = ffmpeg()
        .input(googleUrl)
        .format('mp3');
        
    let filters = [];
    if (pitch !== 1.0) {
        filters.push(`asetrate=24000*${pitch.toFixed(2)}`);
        filters.push('aresample=24000');
    }
    
    const relativeTempo = rate / pitch;
    const tempoFilterStr = getAtempoFilter(relativeTempo);
    if (tempoFilterStr) {
        filters.push(tempoFilterStr);
    }
    
    if (filters.length > 0) {
        command.audioFilters(filters);
    }
    
    const outStream = fs.createWriteStream('scratch/test_out.mp3');
    command.pipe(outStream, { end: true });
    
    command.on('end', () => {
        console.log("Audio processing finished! Output written to scratch/test_out.mp3");
        process.exit(0);
    });
    
    command.on('error', (err) => {
        console.error("FFmpeg failed:", err.message);
        process.exit(1);
    });
}

run().catch(console.error);
