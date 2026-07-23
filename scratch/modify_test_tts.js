const fs = require('fs');

let file = fs.readFileSync('index.html', 'utf8');

// Normalize line endings to LF
const originalLineEndings = file.includes('\r\n') ? '\r\n' : '\n';
file = file.replace(/\r\n/g, '\n');

const target = `            if (voiceName === 'Google Translate (ไทย)') {
                const url = \`/api/tts?text=\${encodeURIComponent(testText)}\`;
                if (ttsState.audioPlayer) {
                    try { ttsState.audioPlayer.pause(); } catch(e){}
                }
                ttsState.audioPlayer = new Audio(url);
                ttsState.audioPlayer.volume = volume;
                ttsState.audioPlayer.play().catch(e => console.error("Google TTS Play Error:", e));
                return;
            }`;

const replacement = `            if (voiceName === 'Google Translate (ไทย)') {
                const rate   = parseFloat(document.getElementById('tts-rate')?.value) || 1.1;
                const pitch  = parseFloat(document.getElementById('tts-pitch')?.value) || 1.0;
                const url = \`/api/tts?text=\${encodeURIComponent(testText)}&rate=\${rate}&pitch=\${pitch}\`;
                if (ttsState.audioPlayer) {
                    try { ttsState.audioPlayer.pause(); } catch(e){}
                }
                ttsState.audioPlayer = new Audio(url);
                ttsState.audioPlayer.volume = volume;
                ttsState.audioPlayer.play().catch(e => console.error("Google TTS Play Error:", e));
                return;
            }`;

if (file.includes(target)) {
    file = file.replace(target, replacement);
    // Restore original line endings
    if (originalLineEndings === '\r\n') {
        file = file.replace(/\n/g, '\r\n');
    }
    fs.writeFileSync('index.html', file, 'utf8');
    console.log("testTTS() modified successfully!");
} else {
    console.log("testTTS() target block not found even after LF normalization.");
}
