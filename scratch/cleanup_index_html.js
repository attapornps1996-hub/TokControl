const fs = require('fs');

let file = fs.readFileSync('index.html', 'utf8');

// The incorrect block:
const target = `        function renderWinPresetsList() {
            const container = document.getElementById('win-presets-container');
              if (voiceName === 'Google Translate (ไทย)') {
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
            }
            if (!container) return;`;

const replacement = `        function renderWinPresetsList() {
            const container = document.getElementById('win-presets-container');
            if (!container) return;`;

if (file.includes(target)) {
    file = file.replace(target, replacement);
    fs.writeFileSync('index.html', file, 'utf8');
    console.log("Cleanup successful!");
} else {
    console.log("Target block not found. Let's try matching with wildcard.");
    // Let's do regex replacement
    const regex = /function renderWinPresetsList\(\)\s*\{\s*const container = document\.getElementById\('win-presets-container'\);\s*if \(voiceName === 'Google Translate \(ไทย\)'\)[\s\S]*?return;\s*\}\s*if \(!container\) return;/;
    if (regex.test(file)) {
        file = file.replace(regex, replacement);
        fs.writeFileSync('index.html', file, 'utf8');
        console.log("Regex cleanup successful!");
    } else {
        console.log("Regex match failed too.");
    }
}
