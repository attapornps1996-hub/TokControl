const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'tiktok-live-connector', 'dist', 'index-CmfG6To-.d.ts');
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const lines = fs.readFileSync(filePath, 'utf8').split('\n');
console.log(`Total lines: ${lines.length}`);

// Find interface WebcastGiftMessage or any gift/diamond types
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('WebcastGiftMessage') || line.includes('Gift') || line.includes('diamond')) {
        console.log(`${i + 1}: ${line}`);
    }
}
